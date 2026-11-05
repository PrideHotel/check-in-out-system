import { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '../firebase.js';
import { collection, deleteDoc, doc, getDocs, query, setDoc } from 'firebase/firestore';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Globe2,
  Loader2,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCog,
  UserPlus,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useToast } from './ui/toast-context';
import { ROLE_ADMIN, ROLE_SUPERADMIN, readAssignment } from '../hooks/useAdminAccess';

// ---- loading people ---------------------------------------------------------

/**
 * Everyone who could be assigned to an Admin, keyed by Firebase user ID.
 *
 * Two sources, merged: the `users` profiles the app saves at sign-in (which
 * include people who have never checked in), and the names on past check-ins
 * (which cover people who have not signed in since profiles were introduced).
 */
async function loadPeople() {
  const people = new Map();
  const add = (uid, name, email, source) => {
    if (!uid) return;
    const existing = people.get(uid);
    people.set(uid, {
      uid,
      name: existing?.name || name || '',
      email: existing?.email || email || '',
      hasProfile: Boolean(existing?.hasProfile || source === 'profile'),
    });
  };

  const [profiles, visits] = await Promise.allSettled([
    getDocs(query(collection(db, 'users'))),
    getDocs(query(collection(db, 'check-ins'))),
  ]);

  if (profiles.status === 'fulfilled') {
    profiles.value.docs.forEach((d) => add(d.id, d.data()?.name, d.data()?.email, 'profile'));
  } else {
    console.warn('Could not load user profiles:', profiles.reason);
  }
  if (visits.status === 'fulfilled') {
    visits.value.docs.forEach((d) => add(d.data()?.userId, d.data()?.name, d.data()?.userEmail, 'visit'));
  } else {
    console.warn('Could not load names from check-ins:', visits.reason);
  }

  return people;
}

const personLabel = (person) => person?.name || person?.email || 'Unknown person';
const shortId = (uid) => (uid.length > 10 ? `${uid.slice(0, 6)}…${uid.slice(-4)}` : uid);

// ---- small pieces -------------------------------------------------------------

function RoleBadge({ role }) {
  return role === ROLE_SUPERADMIN ? (
    <span className="badge bg-brand-50 text-brand-800 ring-1 ring-inset ring-brand-100">
      <ShieldCheck className="h-3 w-3" aria-hidden="true" />
      SuperAdmin
    </span>
  ) : (
    <span className="badge bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200">
      <UserCog className="h-3 w-3" aria-hidden="true" />
      Admin
    </span>
  );
}

/** One line saying whose data this manager can see. */
function AccessSummary({ admin, peopleById }) {
  if (admin.role === ROLE_SUPERADMIN || admin.allSalespeople) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
        <Globe2 className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
        {admin.role === ROLE_SUPERADMIN ? 'Everyone' : 'All salespeople'}
      </span>
    );
  }

  if (admin.salespeople.length === 0) {
    return admin.legacyLocations ? (
      <span className="inline-flex items-start gap-1.5 text-sm text-amber-700">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          <strong>Needs reassigning.</strong> Was given access by location
          {admin.legacyLocations.length ? ` (${admin.legacyLocations.join(', ')})` : ''}, which no
          longer applies — they currently see nobody. Edit to choose their salespeople.
        </span>
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-sm text-amber-700">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        No salespeople assigned — sees nobody yet
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {admin.salespeople.map((uid) => {
        const person = peopleById.get(uid);
        return (
          <span
            key={uid}
            title={`${person?.email || ''}${person?.email ? ' · ' : ''}ID ${uid}`}
            className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600"
          >
            <UserRound className="h-3 w-3 text-slate-400" aria-hidden="true" />
            {person ? personLabel(person) : `ID ${shortId(uid)}`}
          </span>
        );
      })}
    </div>
  );
}

/** Searchable, tickable list of salespeople. */
function SalespersonPicker({ people, selected, onChange }) {
  const [search, setSearch] = useState('');

  // Keep anyone already assigned visible even if they are not in the loaded
  // list (for instance an ID whose name we do not know), so they can be removed.
  const options = useMemo(() => {
    const known = [...people.values()];
    const unknown = selected
      .filter((uid) => !people.has(uid))
      .map((uid) => ({ uid, name: '', email: '', unknown: true }));
    return [...known, ...unknown].sort((a, b) =>
      personLabel(a).localeCompare(personLabel(b), undefined, { sensitivity: 'base' })
    );
  }, [people, selected]);

  const needle = search.trim().toLowerCase();
  const visible = needle
    ? options.filter((p) => [p.name, p.email, p.uid].some((v) => v?.toLowerCase().includes(needle)))
    : options;

  const toggle = (uid) =>
    onChange(selected.includes(uid) ? selected.filter((id) => id !== uid) : [...selected, uid]);

  const addVisible = () => onChange([...new Set([...selected, ...visible.map((p) => p.uid)])]);

  return (
    <div className="animate-fade-in rounded-xl border border-slate-200 p-3">
      <div className="relative mb-2">
        <Search className="field-icon" aria-hidden="true" />
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="input input-icon py-2"
          placeholder="Search by name, email or ID…"
          aria-label="Search salespeople"
        />
      </div>

      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          <span className="font-semibold text-slate-700">{selected.length}</span> selected
          {needle ? ` · ${visible.length} matching` : ` of ${options.length}`}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={addVisible}
            disabled={visible.length === 0}
            className="rounded text-xs font-semibold text-brand-700 hover:text-brand-900 disabled:opacity-50"
          >
            {needle ? 'Select matching' : 'Select all'}
          </button>
          <button
            type="button"
            onClick={() => onChange([])}
            className="rounded text-xs font-semibold text-slate-500 hover:text-slate-700"
          >
            Clear
          </button>
        </div>
      </div>

      <ul
        className="max-h-72 space-y-0.5 overflow-auto"
        role="listbox"
        aria-label="Salespeople"
        aria-multiselectable="true"
      >
        {visible.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-slate-500">
            {options.length === 0
              ? 'No salespeople found yet. People appear here once they sign in to the app.'
              : 'Nobody matches that search.'}
          </li>
        )}
        {visible.map((person) => {
          const isOn = selected.includes(person.uid);
          return (
            <li key={person.uid}>
              <button
                type="button"
                role="option"
                aria-selected={isOn}
                onClick={() => toggle(person.uid)}
                className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition ${
                  isOn ? 'bg-brand-50' : 'hover:bg-slate-50'
                }`}
              >
                <span
                  className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${
                    isOn ? 'border-brand-900 bg-brand-900 text-white' : 'border-slate-300'
                  }`}
                >
                  {isOn && <Check className="h-3 w-3" aria-hidden="true" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm ${isOn ? 'font-semibold text-brand-900' : 'font-medium text-slate-800'}`}>
                    {person.unknown ? 'Unknown person' : personLabel(person)}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {person.email && person.name ? `${person.email} · ` : ''}
                    <span className="font-mono" title={person.uid}>ID {person.uid}</span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-slate-500">
        Not listed? People appear once they have signed in to the app.
      </p>
    </div>
  );
}

/** Add / edit form for one manager. */
function RoleEditor({ initial, people, existingEmails, onCancel, onSave, saving }) {
  const isEdit = Boolean(initial);
  const [email, setEmail] = useState(initial?.email ?? '');
  const [role, setRole] = useState(initial?.role ?? ROLE_ADMIN);
  const [allSalespeople, setAllSalespeople] = useState(Boolean(initial?.allSalespeople));
  const [selected, setSelected] = useState(initial?.salespeople ?? []);
  const [formError, setFormError] = useState('');

  const isLegacy = Boolean(initial?.legacyLocations) && !initial?.allSalespeople && !(initial?.salespeople ?? []).length;
  const specific = role === ROLE_ADMIN && !allSalespeople;

  const submit = (event) => {
    event.preventDefault();
    const normalised = email.trim().toLowerCase();

    if (!normalised || !normalised.includes('@')) {
      setFormError('Enter a valid email address.');
      return;
    }
    if (!isEdit && existingEmails.includes(normalised)) {
      setFormError('That user already has a role. Edit it instead.');
      return;
    }
    if (specific && selected.length === 0) {
      setFormError('Pick at least one salesperson, or give access to all of them.');
      return;
    }

    setFormError('');
    if (role === ROLE_SUPERADMIN) onSave({ email: normalised, data: { role } });
    else if (allSalespeople) onSave({ email: normalised, data: { role, allSalespeople: true } });
    else onSave({ email: normalised, data: { role, salespeople: [...selected].sort() } });
  };

  const managerSuggestions = [...people.values()].filter((p) => p.email);

  return (
    <form onSubmit={submit} className="card card-pad animate-fade-in space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            {isEdit ? `Edit ${initial.email}` : 'Give someone a role'}
          </h2>
          <p className="text-sm text-slate-500">
            {isEdit
              ? 'Change their role or which salespeople they can see.'
              : 'Grant Admin or SuperAdmin access to a team member.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          aria-label="Cancel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {isLegacy && (
        <div className="alert-info">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            This Admin was set up by location
            {initial.legacyLocations.length ? ` (${initial.legacyLocations.join(', ')})` : ''}. Access is
            now by person: choose the salespeople they should see. Saving replaces the old setting.
          </span>
        </div>
      )}

      {formError && (
        <div className="alert-error" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{formError}</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="roleEmail" className="label">
            Admin&apos;s email address
          </label>
          <input
            id="roleEmail"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={isEdit}
            list="known-people"
            className={`input ${isEdit ? 'input-readonly' : ''}`}
            placeholder="person@pridehotel.com"
            required
          />
          <datalist id="known-people">
            {managerSuggestions.map((person) => (
              <option key={person.uid} value={person.email}>
                {person.name}
              </option>
            ))}
          </datalist>
          {!isEdit && (
            <p className="mt-1.5 text-xs text-slate-500">Must match the address they sign in with.</p>
          )}
        </div>

        <div>
          <label htmlFor="roleSelect" className="label">
            Role
          </label>
          <select
            id="roleSelect"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className="input"
          >
            <option value={ROLE_ADMIN}>Admin — view their salespeople&apos;s data</option>
            <option value={ROLE_SUPERADMIN}>SuperAdmin — view everything, manage roles</option>
          </select>
        </div>
      </div>

      {role === ROLE_ADMIN ? (
        <div>
          <span className="label">Which salespeople can they see?</span>
          <div className="mb-3 flex flex-wrap gap-2">
            {[
              { value: false, label: 'Specific salespeople' },
              { value: true, label: 'All salespeople' },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => setAllSalespeople(option.value)}
                aria-pressed={allSalespeople === option.value}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  allSalespeople === option.value
                    ? 'bg-brand-900 text-white'
                    : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {specific ? (
            <SalespersonPicker people={people} selected={selected} onChange={setSelected} />
          ) : (
            <p className="text-sm text-slate-500">
              They will see every salesperson&apos;s visits, including people who join later.
            </p>
          )}
          <p className="mt-2 text-xs text-slate-500">
            They see all of each chosen person&apos;s visits, at every location.
          </p>
        </div>
      ) : (
        <div className="alert-info">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>SuperAdmins see every salesperson and can manage roles.</span>
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Saving…
            </>
          ) : (
            <>
              <Check className="h-4 w-4" aria-hidden="true" />
              {isEdit ? 'Save changes' : 'Grant access'}
            </>
          )}
        </button>
      </div>
    </form>
  );
}

// ---- screen -------------------------------------------------------------------

const UserManagement = ({ user }) => {
  const toast = useToast();
  const myEmail = user?.email?.toLowerCase() ?? '';

  const [admins, setAdmins] = useState([]);
  const [people, setPeople] = useState(() => new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [editing, setEditing] = useState(null); // null | 'new' | admin object
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState('');

  const loadAdmins = useCallback(async () => {
    const snapshot = await getDocs(query(collection(db, 'admins')));
    return snapshot.docs
      .map((docSnap) => {
        const data = docSnap.data() ?? {};
        return {
          email: docSnap.id,
          role: data.role === ROLE_SUPERADMIN ? ROLE_SUPERADMIN : ROLE_ADMIN,
          ...readAssignment(data),
        };
      })
      .sort((a, b) => a.email.localeCompare(b.email));
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setPermissionDenied(false);
    try {
      setAdmins(await loadAdmins());
    } catch (error) {
      console.error('Could not load roles:', error);
      if (error?.code === 'permission-denied') setPermissionDenied(true);
      else toast.error('Could not load the role list.');
    } finally {
      setIsLoading(false);
    }
  }, [loadAdmins, toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    loadPeople().then((loaded) => {
      if (!cancelled) setPeople(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const existingEmails = useMemo(() => admins.map((admin) => admin.email), [admins]);
  const needsReassigning = admins.filter(
    (a) => a.role === ROLE_ADMIN && !a.allSalespeople && a.salespeople.length === 0
  ).length;

  const handleSave = async ({ email, data }) => {
    setSaving(true);
    try {
      // A full replace, so an old `locations` field is dropped when re-saved.
      await setDoc(doc(db, 'admins', email), data);
      toast.success(`${email} is now ${data.role === ROLE_SUPERADMIN ? 'a SuperAdmin' : 'an Admin'}.`, {
        title: 'Role saved',
      });
      setEditing(null);
      await refresh();
    } catch (error) {
      console.error('Could not save the role:', error);
      toast.error(
        error?.code === 'permission-denied'
          ? 'Firestore refused the change. Publish the latest security rules and try again.'
          : 'Could not save the role. Please try again.',
        { title: 'Save failed' }
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (admin) => {
    if (!window.confirm(`Remove ${admin.email}'s access? They will keep their own check-in history.`)) {
      return;
    }
    setRemoving(admin.email);
    try {
      await deleteDoc(doc(db, 'admins', admin.email));
      toast.success(`${admin.email} no longer has management access.`, { title: 'Access removed' });
      await refresh();
    } catch (error) {
      console.error('Could not remove the role:', error);
      toast.error('Could not remove that role. Please try again.', { title: 'Remove failed' });
    } finally {
      setRemoving('');
    }
  };

  if (permissionDenied) {
    return (
      <div className="mx-auto w-full max-w-3xl animate-fade-in-up">
        <div className="card card-pad">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600">
              <ShieldAlert className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-semibold text-slate-900">Firestore denied the request</p>
                <p className="mt-1 text-slate-600">
                  Role management needs the latest security rules published.
                </p>
              </div>
              <ol className="list-decimal space-y-1.5 pl-5 text-slate-600">
                <li>
                  Firebase console &rarr; <strong>Firestore Database</strong> &rarr;{' '}
                  <strong>Rules</strong>.
                </li>
                <li>
                  Paste in <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">firestore.rules</code>{' '}
                  from this repository and press <strong>Publish</strong>.
                </li>
                <li>Reload this page.</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl animate-fade-in-up space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Roles &amp; access</h1>
          <p className="text-sm text-slate-500">
            Decide who can see team data, and which salespeople each Admin is responsible for.
          </p>
        </div>
        {editing === null && (
          <button type="button" onClick={() => setEditing('new')} className="btn-primary">
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Add a role
          </button>
        )}
      </div>

      {!isLoading && needsReassigning > 0 && editing === null && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <span>
            <strong>
              {needsReassigning} Admin{needsReassigning === 1 ? '' : 's'} can&apos;t see anyone yet.
            </strong>{' '}
            Access is now given by salesperson, not location. Edit {needsReassigning === 1 ? 'them' : 'each one'} to
            choose the salespeople they look after.
          </span>
        </div>
      )}

      {editing !== null && (
        <RoleEditor
          initial={editing === 'new' ? null : editing}
          people={people}
          existingEmails={existingEmails}
          saving={saving}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
        />
      )}

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="flex items-center gap-4">
                <span className="skeleton h-4 w-1/3" />
                <span className="skeleton h-4 w-24" />
                <span className="skeleton h-4 w-1/3" />
              </div>
            ))}
          </div>
        ) : admins.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400">
              <Users className="h-7 w-7" aria-hidden="true" />
            </span>
            <p className="font-semibold text-slate-800">Nobody has a management role yet</p>
            <button type="button" onClick={() => setEditing('new')} className="btn-primary mt-1">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add the first one
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {admins.map((admin) => {
              const isSelf = admin.email === myEmail;
              return (
                <li
                  key={admin.email}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold text-slate-900">{admin.email}</span>
                      <RoleBadge role={admin.role} />
                      {isSelf && (
                        <span className="badge bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200">
                          You
                        </span>
                      )}
                    </div>
                    <AccessSummary admin={admin} peopleById={people} />
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(admin)}
                      disabled={isSelf}
                      title={isSelf ? 'You cannot change your own role' : undefined}
                      className="btn-secondary"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(admin)}
                      disabled={isSelf || removing === admin.email}
                      title={isSelf ? 'You cannot remove your own access' : undefined}
                      className="btn-secondary text-rose-600 hover:border-rose-300 hover:bg-rose-50"
                    >
                      {removing === admin.email ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      )}
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="flex items-start gap-1.5 text-xs text-slate-500">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
        You cannot change or remove your own role — that prevents the last SuperAdmin locking
        everyone out. Use the Firebase console if you ever need to.
      </p>
    </div>
  );
};

export default UserManagement;
