import { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '../firebase.js';
import { collection, deleteDoc, doc, getDocs, query, setDoc } from 'firebase/firestore';
import {
  AlertCircle,
  Check,
  Globe2,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCog,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useToast } from './ui/toast-context';
import { LOCATIONS } from '../constants/locations';
import { ROLE_ADMIN, ROLE_SUPERADMIN } from '../hooks/useAdminAccess';

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

function LocationSummary({ admin }) {
  if (admin.role === ROLE_SUPERADMIN) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
        <Globe2 className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
        All locations
      </span>
    );
  }

  const locations = admin.locations ?? [];
  if (locations.length === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
        <Globe2 className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
        All locations
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {locations.map((location) => (
        <span
          key={location}
          className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600"
        >
          <MapPin className="h-3 w-3 text-slate-400" aria-hidden="true" />
          {location}
        </span>
      ))}
    </div>
  );
}

/** Add / edit form for one manager. */
function RoleEditor({ initial, knownUsers, existingEmails, onCancel, onSave, saving }) {
  const isEdit = Boolean(initial);
  const [email, setEmail] = useState(initial?.email ?? '');
  const [role, setRole] = useState(initial?.role ?? ROLE_ADMIN);
  const [allLocations, setAllLocations] = useState((initial?.locations ?? []).length === 0);
  const [selected, setSelected] = useState(initial?.locations ?? []);
  const [formError, setFormError] = useState('');

  const scoped = role === ROLE_ADMIN && !allLocations;

  const toggleLocation = (location) => {
    setSelected((current) =>
      current.includes(location)
        ? current.filter((item) => item !== location)
        : [...current, location]
    );
  };

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
    if (scoped && selected.length === 0) {
      setFormError('Pick at least one location, or grant access to all of them.');
      return;
    }

    setFormError('');
    onSave({
      email: normalised,
      role,
      // SuperAdmins are never scoped; "all locations" is stored as an empty list.
      locations: role === ROLE_SUPERADMIN || allLocations ? [] : [...selected].sort(),
    });
  };

  return (
    <form onSubmit={submit} className="card card-pad animate-fade-in space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            {isEdit ? `Edit ${initial.email}` : 'Give someone a role'}
          </h2>
          <p className="text-sm text-slate-500">
            {isEdit
              ? 'Change their role or which locations they can see.'
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

      {formError && (
        <div className="alert-error" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{formError}</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="roleEmail" className="label">
            Email address
          </label>
          <input
            id="roleEmail"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={isEdit}
            list="known-users"
            className={`input ${isEdit ? 'input-readonly' : ''}`}
            placeholder="person@pridehotel.com"
            required
          />
          <datalist id="known-users">
            {knownUsers.map((user) => (
              <option key={user.email} value={user.email}>
                {user.name}
              </option>
            ))}
          </datalist>
          {!isEdit && (
            <p className="mt-1.5 text-xs text-slate-500">
              Must match the address they sign in with.
            </p>
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
            <option value={ROLE_ADMIN}>Admin — view team data</option>
            <option value={ROLE_SUPERADMIN}>SuperAdmin — view everything, manage roles</option>
          </select>
        </div>
      </div>

      {role === ROLE_ADMIN ? (
        <div>
          <span className="label">Location access</span>

          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAllLocations(true)}
              className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                allLocations
                  ? 'bg-brand-900 text-white'
                  : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              All locations
            </button>
            <button
              type="button"
              onClick={() => setAllLocations(false)}
              className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                !allLocations
                  ? 'bg-brand-900 text-white'
                  : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              Specific locations
            </button>
          </div>

          {scoped && (
            <div className="animate-fade-in rounded-xl border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">{selected.length}</span> of{' '}
                  {LOCATIONS.length} selected
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelected([...LOCATIONS])}
                    className="rounded text-xs font-semibold text-brand-700 hover:text-brand-900"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelected([])}
                    className="rounded text-xs font-semibold text-slate-500 hover:text-slate-700"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="grid max-h-64 grid-cols-2 gap-1 overflow-auto sm:grid-cols-3">
                {LOCATIONS.map((location) => {
                  const isOn = selected.includes(location);
                  return (
                    <button
                      key={location}
                      type="button"
                      onClick={() => toggleLocation(location)}
                      aria-pressed={isOn}
                      className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                        isOn
                          ? 'bg-brand-50 font-medium text-brand-900'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span
                        className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${
                          isOn ? 'border-brand-900 bg-brand-900 text-white' : 'border-slate-300'
                        }`}
                      >
                        {isOn && <Check className="h-3 w-3" aria-hidden="true" />}
                      </span>
                      {location}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="alert-info">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            SuperAdmins see every location and can manage roles, so location access does not apply.
          </span>
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

const UserManagement = ({ user }) => {
  const toast = useToast();
  const myEmail = user?.email?.toLowerCase() ?? '';

  const [admins, setAdmins] = useState([]);
  const [knownUsers, setKnownUsers] = useState([]);
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
          locations: Array.isArray(data.locations) ? data.locations : [],
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

  // Offer everyone who has ever checked in as a suggestion, so the SuperAdmin
  // does not have to remember exact addresses.
  useEffect(() => {
    let cancelled = false;

    getDocs(query(collection(db, 'check-ins')))
      .then((snapshot) => {
        const byEmail = new Map();
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data() ?? {};
          const email = (data.userEmail ?? '').toLowerCase();
          if (email && !byEmail.has(email)) byEmail.set(email, data.name ?? '');
        });
        if (!cancelled) {
          setKnownUsers(
            [...byEmail].map(([email, name]) => ({ email, name })).sort((a, b) => a.email.localeCompare(b.email))
          );
        }
      })
      .catch((error) => console.error('Could not load known users:', error));

    return () => {
      cancelled = true;
    };
  }, []);

  const existingEmails = useMemo(() => admins.map((admin) => admin.email), [admins]);

  const handleSave = async ({ email, role, locations }) => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'admins', email), { role, locations });
      toast.success(`${email} is now ${role === ROLE_SUPERADMIN ? 'a SuperAdmin' : 'an Admin'}.`, {
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
            Decide who can see team data, and which locations they can see.
          </p>
        </div>
        {editing === null && (
          <button type="button" onClick={() => setEditing('new')} className="btn-primary">
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Add a role
          </button>
        )}
      </div>

      {editing !== null && (
        <RoleEditor
          initial={editing === 'new' ? null : editing}
          knownUsers={knownUsers}
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
                    <LocationSummary admin={admin} />
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
