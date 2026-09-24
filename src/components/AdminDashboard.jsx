import { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '../firebase.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  AlarmClockOff,
  AlertCircle,
  AlertTriangle,
  Building2,
  CalendarRange,
  ClipboardList,
  Clock4,
  DatabaseZap,
  Download,
  ExternalLink,
  Loader2,
  MapPin,
  MapPinOff,
  RefreshCw,
  Search,
  ShieldAlert,
  Timer,
  Users,
  X,
} from 'lucide-react';
import {
  formatDateLabel,
  formatTimeLabel,
  getFormattedDateTime,
  parseFormattedDateTime,
  shortenAddress,
} from '../utils/datetime';
import {
  FORGOTTEN_AFTER_HOURS,
  clockSkewMinutes,
  farFromLocation,
  formatCoords,
  isForgotten,
  isOpen,
  mapLink,
  sortNewestFirst,
  visitDuration,
  visitEnd,
  visitFlags,
  visitStart,
} from '../utils/visits';
import { downloadCsv, exportStamp } from '../utils/csv';
import { useToast } from './ui/toast-context';

// ---- small pieces -----------------------------------------------------------

function StatCard({ icon: Icon, label, value, tone = 'brand' }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-800',
    emerald: 'bg-emerald-50 text-emerald-700',
    gold: 'bg-gold-50 text-gold-700',
    slate: 'bg-slate-100 text-slate-600',
    amber: 'bg-amber-50 text-amber-700',
  };

  return (
    <div className="card flex flex-col items-center gap-1 p-3 text-center sm:flex-row sm:gap-3.5 sm:p-4 sm:text-left">
      <span
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg sm:h-10 sm:w-10 sm:rounded-xl ${tones[tone]}`}
      >
        <Icon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-lg font-bold leading-tight text-slate-900 sm:text-xl">{value}</p>
        <p className="truncate text-[11px] text-slate-500 sm:text-xs">{label}</p>
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex items-center gap-4">
          <span className="skeleton h-4 w-1/5" />
          <span className="skeleton h-4 w-1/4" />
          <span className="skeleton h-4 w-1/6" />
          <span className="skeleton hidden h-4 w-1/4 sm:block" />
        </div>
      ))}
    </div>
  );
}

function HelpCard({ icon: Icon = ShieldAlert, title, children }) {
  return (
    <div className="card card-pad">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 space-y-3 text-sm text-slate-600">
          <p className="font-semibold text-slate-900">{title}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Turns the raw Firestore error into something actionable for an admin. */
function PermissionHelp() {
  return (
    <HelpCard title="Firestore denied the request">
      <p>
        Your account has a management role, but the published database rules do not allow this
        read yet.
      </p>
      <ol className="list-decimal space-y-1.5 pl-5">
        <li>
          Open the Firebase console &rarr; <strong>Firestore Database</strong> &rarr;{' '}
          <strong>Rules</strong>.
        </li>
        <li>
          Replace the contents with the{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">firestore.rules</code> file from
          this repository, then press <strong>Publish</strong>.
        </li>
        <li>Reload this page.</li>
      </ol>
    </HelpCard>
  );
}

/** Firestore needs a one-time index for location + date queries. */
function IndexHelp({ link }) {
  return (
    <HelpCard icon={DatabaseZap} title="Firestore needs a one-time index for this view">
      <p>
        Loading your locations for a date range needs a database index. It is created once and
        then works for everyone.
      </p>
      {link ? (
        <p>
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="btn-primary inline-flex"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Create the index
          </a>
        </p>
      ) : null}
      <p className="text-xs text-slate-500">
        {link
          ? 'The link opens the Firebase console with the index filled in — press Create, wait a few minutes for it to build, then refresh. '
          : ''}
        If you do not manage the Firebase project, send this page to whoever does. The index is also
        described in <code className="rounded bg-slate-100 px-1 py-0.5">firestore.indexes.json</code>.
      </p>
    </HelpCard>
  );
}

const FLAG_STYLES = {
  forgotten: { className: 'bg-amber-50 text-amber-800 ring-amber-200', icon: AlarmClockOff },
  far: { className: 'bg-rose-50 text-rose-700 ring-rose-200', icon: MapPinOff },
  clock: { className: 'bg-violet-50 text-violet-700 ring-violet-200', icon: Clock4 },
  late: { className: 'bg-amber-50 text-amber-700 ring-amber-200', icon: AlarmClockOff },
  'closed-by-manager': { className: 'bg-slate-100 text-slate-600 ring-slate-200', icon: AlarmClockOff },
};

function FlagBadges({ flags }) {
  if (flags.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {flags.map((flag) => {
        const style = FLAG_STYLES[flag.kind];
        const Icon = style.icon;
        return (
          <span key={flag.kind} className={`badge ring-1 ring-inset ${style.className}`}>
            <Icon className="h-3 w-3" aria-hidden="true" />
            {flag.label}
          </span>
        );
      })}
    </div>
  );
}

/** Address, plus a map link to the raw GPS reading when there is one. */
function Place({ address, coords }) {
  const short = shortenAddress(address);
  const link = mapLink(coords);
  if (!short && !link) return <span>—</span>;
  return (
    <span className="space-x-1.5">
      {short && <span title={address}>{short}</span>}
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 whitespace-nowrap font-medium text-brand-700 hover:text-brand-900"
        >
          map
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      )}
    </span>
  );
}

function EndTime({ record }) {
  if (isOpen(record)) return <span className="text-emerald-600">ongoing</span>;
  return (
    <>
      {formatTimeLabel(visitEnd(record))}
      {record.lateCheckout && !record.closedBy && (
        <span className="ml-1 text-[11px] font-normal text-amber-700">(reported)</span>
      )}
    </>
  );
}

// ---- date ranges ------------------------------------------------------------

function isoDay(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

const PRESETS = [
  { id: 'today', label: 'Today', range: () => [isoDay(new Date()), isoDay(new Date())] },
  { id: '7d', label: 'Last 7 days', range: () => [isoDay(daysAgo(6)), isoDay(new Date())] },
  { id: '30d', label: 'Last 30 days', range: () => [isoDay(daysAgo(29)), isoDay(new Date())] },
  {
    id: 'month',
    label: 'This month',
    range: () => {
      const now = new Date();
      return [isoDay(new Date(now.getFullYear(), now.getMonth(), 1)), isoDay(now)];
    },
  },
  {
    id: 'lastMonth',
    label: 'Last month',
    range: () => {
      const now = new Date();
      return [
        isoDay(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        isoDay(new Date(now.getFullYear(), now.getMonth(), 0)),
      ];
    },
  },
  { id: 'all', label: 'All time', range: () => ['', ''] },
];

const DEFAULT_PRESET = '30d';

// ---- loading ----------------------------------------------------------------

// Firestore caps an `in` filter at 30 values, so a very wide grant is split
// across several queries and merged.
const IN_FILTER_LIMIT = 30;

function chunk(items, size) {
  const groups = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

function indexLinkFrom(error) {
  const match = String(error?.message ?? '').match(/https:\/\/console\.firebase\.google\.com\S+/);
  return match ? match[0].replace(/[).,]+$/, '') : '';
}

/**
 * Reads the check-ins this manager may see for a date range.
 *
 * The date range is applied by Firestore, so only the visits in it are read
 * (and billed) — not the whole history. "All time" leaves the range off.
 *
 * The security rules reject any document outside a scoped Admin's locations,
 * so such an Admin must also send a location filter; asking for everything
 * would fail the whole read rather than quietly returning less.
 */
async function fetchVisibleRecords({ hasAllLocations, allowedLocations, from, to }) {
  const dateConstraints = [];
  if (from) dateConstraints.push(where('checkInAt', '>=', Timestamp.fromDate(new Date(`${from}T00:00:00`))));
  if (to) dateConstraints.push(where('checkInAt', '<=', Timestamp.fromDate(new Date(`${to}T23:59:59.999`))));
  if (dateConstraints.length) dateConstraints.push(orderBy('checkInAt', 'desc'));

  const base = collection(db, 'check-ins');
  const snapshots = hasAllLocations
    ? [await getDocs(query(base, ...dateConstraints))]
    : await Promise.all(
        chunk(allowedLocations, IN_FILTER_LIMIT).map((group) =>
          getDocs(query(base, where('location', 'in', group), ...dateConstraints))
        )
      );

  const records = new Map();
  snapshots.forEach((snapshot) =>
    snapshot.docs.forEach((docSnap) => records.set(docSnap.id, { id: docSnap.id, ...docSnap.data() }))
  );
  return sortNewestFirst([...records.values()]);
}

/**
 * One-time upgrade of records written before server timestamps: copies the
 * old "DD-MM-YYYY HH:mm:ss" text times into real `checkInAt` / `checkOutAt`
 * fields so date-range views include them. The text is read as this browser's
 * local time — run it from a device set to Indian time.
 */
async function upgradeOldRecords(onProgress) {
  const snapshot = await getDocs(collection(db, 'check-ins'));
  const pending = snapshot.docs.filter((docSnap) => !docSnap.data().checkInAt);
  const now = Date.now();

  let upgraded = 0;
  let skipped = 0;

  for (const group of chunk(pending, 400)) {
    const batch = writeBatch(db);
    let inBatch = 0;

    for (const docSnap of group) {
      const data = docSnap.data();
      const start = parseFormattedDateTime(data.checkInTime);
      // Unreadable or future-dated text (a phone clock set wrong) cannot be
      // trusted, and the rules would refuse it — leave those records as they are.
      if (!start || start.getTime() > now) {
        skipped += 1;
        continue;
      }
      const update = { checkInAt: Timestamp.fromDate(start), timesBackfilled: true };
      const end = parseFormattedDateTime(data.checkOutTime);
      if (end) update.checkOutAt = Timestamp.fromDate(end);
      batch.update(docSnap.ref, update);
      inBatch += 1;
    }

    if (inBatch > 0) {
      await batch.commit();
      upgraded += inBatch;
      onProgress?.(upgraded, pending.length);
    }
  }

  await setDoc(doc(db, 'meta', 'migrations'), {
    timestampsBackfilled: true,
    timestampsBackfilledAt: serverTimestamp(),
    timestampsBackfilledCount: upgraded,
    timestampsSkipped: skipped,
  });

  return { upgraded, skipped, total: pending.length };
}

// ---- screen -----------------------------------------------------------------

const AdminDashboard = ({ allowedLocations = [], hasAllLocations = true, isSuperAdmin = false, user }) => {
  const toast = useToast();
  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [indexLink, setIndexLink] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [preset, setPreset] = useState(DEFAULT_PRESET);
  const [[fromDate, toDate], setRange] = useState(
    () => PRESETS.find((p) => p.id === DEFAULT_PRESET).range()
  );

  const [search, setSearch] = useState('');
  const [person, setPerson] = useState('');
  const [location, setLocation] = useState('');
  const [attentionOnly, setAttentionOnly] = useState(false);

  const [migrated, setMigrated] = useState(true);
  const [upgrading, setUpgrading] = useState(null); // null | { done, total }
  const [closingId, setClosingId] = useState('');

  // A stable key so the effect re-runs when the grant changes, not on every
  // render of the array prop.
  const scopeKey = hasAllLocations ? '*' : [...allowedLocations].sort().join('|');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError('');
      setPermissionDenied(false);
      setIndexLink(null);

      try {
        const data = await fetchVisibleRecords({
          hasAllLocations,
          allowedLocations,
          from: fromDate,
          to: toDate,
        });
        if (!cancelled) setRecords(data);
      } catch (err) {
        console.error('Error loading team records:', err);
        if (cancelled) return;
        if (err?.code === 'permission-denied') setPermissionDenied(true);
        else if (err?.code === 'failed-precondition') setIndexLink(indexLinkFrom(err));
        else setError('Could not load the team records. Check your connection and try again.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken, scopeKey, fromDate, toDate]);

  // Have the pre-timestamp records been upgraded yet?
  useEffect(() => {
    let cancelled = false;
    getDoc(doc(db, 'meta', 'migrations'))
      .then((snap) => {
        if (!cancelled) setMigrated(Boolean(snap.exists() && snap.data()?.timestampsBackfilled));
      })
      .catch(() => {
        // Rules not yet published, or no access: nothing useful to show.
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const choosePreset = (id) => {
    setPreset(id);
    setRange(PRESETS.find((p) => p.id === id).range());
  };

  const setCustomRange = (nextFrom, nextTo) => {
    setPreset('custom');
    setRange([nextFrom, nextTo]);
  };

  const now = Date.now();
  const flagsById = useMemo(() => {
    const map = new Map();
    records.forEach((record) => map.set(record.id, visitFlags(record, now)));
    return map;
    // Recompute when the data changes; the clock ticking does not matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records]);

  const people = useMemo(() => {
    const names = new Set();
    records.forEach((record) => {
      const label = record.name || record.userEmail;
      if (label) names.add(label);
    });
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [records]);

  // Only offer locations the manager can actually see.
  const locationOptions = useMemo(() => {
    const seen = new Set(records.map((record) => record.location).filter(Boolean));
    const permitted = hasAllLocations ? [...seen] : allowedLocations.filter((l) => seen.has(l));
    return permitted.sort((a, b) => a.localeCompare(b));
  }, [records, allowedLocations, hasAllLocations]);

  const hasFilters = Boolean(search || person || location || attentionOnly);
  const clearFilters = () => {
    setSearch('');
    setPerson('');
    setLocation('');
    setAttentionOnly(false);
  };

  const filteredRecords = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return records.filter((record) => {
      if (needle) {
        const haystack = [record.name, record.userEmail, record.companyName, record.location, record.checkInAdd]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (person && (record.name || record.userEmail) !== person) return false;
      if (location && record.location !== location) return false;
      if (attentionOnly && (flagsById.get(record.id) ?? []).length === 0) return false;
      return true;
    });
  }, [records, search, person, location, attentionOnly, flagsById]);

  const stats = useMemo(() => {
    const team = new Set(filteredRecords.map((record) => record.userId || record.userEmail).filter(Boolean));
    return {
      total: filteredRecords.length,
      active: filteredRecords.filter(isOpen).length,
      team: team.size,
      attention: filteredRecords.filter((record) => (flagsById.get(record.id) ?? []).length > 0).length,
    };
  }, [filteredRecords, flagsById]);

  const closeVisit = useCallback(
    async (record) => {
      const who = record.name || record.userEmail || 'this person';
      if (
        !window.confirm(
          `Close ${who}'s visit at ${record.companyName || 'the client'}?\n\n` +
            'It will be marked as a forgotten check-out closed by you, at the current time.'
        )
      ) {
        return;
      }
      setClosingId(record.id);
      try {
        await updateDoc(doc(db, 'check-ins', record.id), {
          checkOutTime: getFormattedDateTime(),
          checkOutAt: serverTimestamp(),
          closedBy: user.email.toLowerCase(),
          lateCheckout: true,
        });
        toast.success(`${who}'s visit is closed.`, { title: 'Visit closed' });
        setReloadToken((token) => token + 1);
      } catch (err) {
        console.error('Could not close the visit:', err);
        toast.error(
          err?.code === 'permission-denied'
            ? `A visit can only be closed once it has been open for ${FORGOTTEN_AFTER_HOURS} hours, at a location you manage.`
            : 'Could not close the visit. Please try again.',
          { title: 'Close failed' }
        );
      } finally {
        setClosingId('');
      }
    },
    [toast, user]
  );

  const runUpgrade = async () => {
    if (
      !window.confirm(
        'Upgrade older visits so they appear in date-range views?\n\n' +
          'This reads every visit once and adds proper timestamps to the older ones. ' +
          'It is safe to run again and only needs doing once.'
      )
    ) {
      return;
    }
    setUpgrading({ done: 0, total: 0 });
    try {
      const { upgraded, skipped } = await upgradeOldRecords((done, total) => setUpgrading({ done, total }));
      toast.success(
        `${upgraded} older visit${upgraded === 1 ? '' : 's'} upgraded` +
          (skipped ? `; ${skipped} with unreadable or future-dated times left as they were.` : '.'),
        { title: 'Upgrade complete', duration: 10000 }
      );
      setMigrated(true);
      setReloadToken((token) => token + 1);
    } catch (err) {
      console.error('Upgrade failed:', err);
      toast.error(
        err?.code === 'permission-denied'
          ? 'Firestore refused the upgrade. Publish the latest security rules and try again.'
          : 'The upgrade stopped part-way. Running it again continues where it left off.',
        { title: 'Upgrade failed' }
      );
    } finally {
      setUpgrading(null);
    }
  };

  const exportCsv = () => {
    const stamp = (date) => (date ? getFormattedDateTime(date) : '');
    downloadCsv(
      `team-check-ins-${fromDate || 'all'}-to-${toDate || exportStamp()}.csv`,
      [
        'Sales Person',
        'Email',
        'Company',
        'Location',
        'Check-In',
        'Check-Out',
        'Duration',
        'Flags',
        'Distance From Location (km)',
        'Phone Clock Off By (min)',
        'Closed By',
        'Check-In Address',
        'Check-In GPS',
        'Check-In Map',
        'Check-Out Address',
        'Check-Out GPS',
      ],
      filteredRecords.map((record) => {
        const far = farFromLocation(record);
        const skew = clockSkewMinutes(record);
        return [
          record.name,
          record.userEmail,
          record.companyName,
          record.location,
          stamp(visitStart(record)),
          isOpen(record)
            ? 'Not checked out'
            : `${stamp(visitEnd(record))}${record.lateCheckout && !record.closedBy ? ' (reported)' : ''}`,
          visitDuration(record) || '',
          (flagsById.get(record.id) ?? []).map((flag) => flag.label).join('; '),
          far ? far.km : '',
          skew ?? '',
          record.closedBy || '',
          record.checkInAdd,
          formatCoords(record.checkInCoords),
          mapLink(record.checkInCoords),
          record.checkOutAdd,
          formatCoords(record.checkOutCoords),
        ];
      })
    );
  };

  const rangeLabel =
    preset === 'all'
      ? 'all time'
      : fromDate === toDate
        ? formatDateLabel(new Date(`${fromDate}T00:00:00`))
        : `${formatDateLabel(new Date(`${fromDate}T00:00:00`))} – ${formatDateLabel(new Date(`${toDate}T00:00:00`))}`;

  return (
    <div className="mx-auto w-full max-w-6xl animate-fade-in-up space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Team data</h1>
          <p className="text-sm text-slate-500">
            {hasAllLocations ? 'Check-ins across all locations' : 'Check-ins for your locations'},{' '}
            {rangeLabel}, newest first.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setReloadToken((token) => token + 1)}
            disabled={isLoading}
            className="btn-secondary"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={filteredRecords.length === 0}
            className="btn-primary"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Export CSV
          </button>
        </div>
      </div>

      {permissionDenied ? (
        <PermissionHelp />
      ) : (
        <>
          {!hasAllLocations && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm">
              <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                <MapPin className="h-3.5 w-3.5 text-brand-700" aria-hidden="true" />
                Your access:
              </span>
              {allowedLocations.map((name) => (
                <span key={name} className="rounded-md bg-brand-50 px-1.5 py-0.5 text-xs font-medium text-brand-800">
                  {name}
                </span>
              ))}
            </div>
          )}

          {/* Older records need a one-time upgrade to show up in date ranges. */}
          {!migrated && (
            <div className="flex flex-col gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2.5">
                <DatabaseZap className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />
                <p>
                  <span className="font-semibold">Older visits are missing from date ranges.</span>{' '}
                  {isSuperAdmin
                    ? 'They were recorded before server timestamps; a one-time upgrade fixes that. Until then, "All time" still shows them.'
                    : 'A SuperAdmin needs to run a one-time upgrade. Until then, "All time" still shows them.'}
                </p>
              </div>
              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={runUpgrade}
                  disabled={Boolean(upgrading)}
                  className="btn-primary shrink-0"
                >
                  {upgrading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      {upgrading.total ? `Upgrading ${upgrading.done}/${upgrading.total}…` : 'Reading visits…'}
                    </>
                  ) : (
                    <>
                      <DatabaseZap className="h-4 w-4" aria-hidden="true" />
                      Upgrade older visits
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Date range — applied by Firestore, so only this range is read. */}
          <div className="card card-pad space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="label mb-0 mr-1">
                <CalendarRange className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                Period
              </span>
              {PRESETS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => choosePreset(option.id)}
                  aria-pressed={preset === option.id}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                    preset === option.id
                      ? 'bg-brand-900 text-white'
                      : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
              <div>
                <label htmlFor="fromDate" className="label">From</label>
                <input
                  id="fromDate"
                  type="date"
                  value={fromDate}
                  max={toDate || undefined}
                  onChange={(e) => setCustomRange(e.target.value, toDate || e.target.value)}
                  className="input px-2"
                />
              </div>
              <div>
                <label htmlFor="toDate" className="label">To</label>
                <input
                  id="toDate"
                  type="date"
                  value={toDate}
                  min={fromDate || undefined}
                  onChange={(e) => setCustomRange(fromDate || e.target.value, e.target.value)}
                  className="input px-2"
                />
              </div>

              <div className="lg:col-span-2">
                <label htmlFor="teamSearch" className="label">
                  <Search className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  Search
                </label>
                <div className="relative">
                  <Search className="field-icon" aria-hidden="true" />
                  <input
                    id="teamSearch"
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="input input-icon"
                    placeholder="Person, company, location or address…"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="personFilter" className="label">
                  <Users className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  Sales person
                </label>
                <select id="personFilter" value={person} onChange={(e) => setPerson(e.target.value)} className="input">
                  <option value="">Everyone</option>
                  {people.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="locationFilter" className="label">
                  <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  Location
                </label>
                <select id="locationFilter" value={location} onChange={(e) => setLocation(e.target.value)} className="input">
                  <option value="">{hasAllLocations ? 'All locations' : 'All my locations'}</option>
                  {locationOptions.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={attentionOnly}
                  onChange={(e) => setAttentionOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-900 focus:ring-brand-500"
                />
                <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
                Only visits that need attention
              </label>

              {hasFilters && (
                <div className="flex items-center gap-3">
                  <p className="text-sm text-slate-500">
                    Showing <span className="font-semibold text-slate-800">{filteredRecords.length}</span> of{' '}
                    {records.length}
                  </p>
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex items-center gap-1 rounded text-sm font-semibold text-brand-700 transition hover:text-brand-900"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            <StatCard icon={ClipboardList} label="Visits in period" value={stats.total} />
            <StatCard icon={Timer} label="Still open" value={stats.active} tone="emerald" />
            <StatCard icon={Users} label="Team members" value={stats.team} tone="slate" />
            <StatCard icon={AlertTriangle} label="Need attention" value={stats.attention} tone="amber" />
          </div>

          {error && (
            <div className="alert-error" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {indexLink !== null ? (
            <IndexHelp link={indexLink} />
          ) : (
            <div className="card overflow-hidden">
              {isLoading ? (
                <TableSkeleton />
              ) : filteredRecords.length === 0 ? (
                <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                  <span className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400">
                    <ClipboardList className="h-7 w-7" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="font-semibold text-slate-800">
                      {hasFilters ? 'No visits match your filters' : 'No visits in this period'}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {hasFilters ? 'Try clearing the search or filters.' : 'Try a longer period.'}
                    </p>
                  </div>
                  {hasFilters && (
                    <button type="button" onClick={clearFilters} className="btn-secondary mt-1">
                      <X className="h-4 w-4" aria-hidden="true" />
                      Clear filters
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden overflow-x-auto lg:block">
                    <table className="min-w-full text-left">
                      <thead className="bg-slate-50">
                        <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          <th scope="col" className="px-5 py-3.5">Sales person</th>
                          <th scope="col" className="px-5 py-3.5">Company</th>
                          <th scope="col" className="px-5 py-3.5">Location</th>
                          <th scope="col" className="px-5 py-3.5">Date</th>
                          <th scope="col" className="px-5 py-3.5">In / Out</th>
                          <th scope="col" className="px-5 py-3.5">Duration</th>
                          <th scope="col" className="px-5 py-3.5">Check-in place</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredRecords.map((record) => {
                          const flags = flagsById.get(record.id) ?? [];
                          return (
                            <tr
                              key={record.id}
                              className={`align-top transition hover:bg-slate-50/80 ${flags.length ? 'bg-amber-50/30' : ''}`}
                            >
                              <td className="px-5 py-4">
                                <div className="font-semibold text-slate-900">{record.name || '—'}</div>
                                <div className="truncate text-xs text-slate-500">{record.userEmail}</div>
                              </td>
                              <td className="px-5 py-4">
                                <div className="text-sm font-medium text-slate-800">{record.companyName || '—'}</div>
                                {isOpen(record) && !isForgotten(record, now) && (
                                  <span className="badge-active mt-1">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                                    Active
                                  </span>
                                )}
                                <FlagBadges flags={flags} />
                                {isForgotten(record, now) && (
                                  <button
                                    type="button"
                                    onClick={() => closeVisit(record)}
                                    disabled={closingId === record.id}
                                    className="btn-secondary mt-2 px-2.5 py-1.5 text-xs"
                                  >
                                    {closingId === record.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                    ) : (
                                      <AlarmClockOff className="h-3.5 w-3.5" aria-hidden="true" />
                                    )}
                                    Close visit
                                  </button>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">
                                <span className="inline-flex items-center gap-1.5">
                                  <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                                  {record.location || '—'}
                                </span>
                              </td>
                              <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">
                                {formatDateLabel(visitStart(record))}
                              </td>
                              <td className="whitespace-nowrap px-5 py-4 text-sm">
                                <span className="tabular font-medium text-slate-900">
                                  {formatTimeLabel(visitStart(record))}
                                </span>
                                <span className="mx-1.5 text-slate-300">→</span>
                                <span className="tabular font-medium text-slate-900">
                                  <EndTime record={record} />
                                </span>
                              </td>
                              <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">
                                {visitDuration(record) || '—'}
                              </td>
                              <td className="max-w-xs px-5 py-4 text-sm text-slate-500">
                                <span className="line-clamp-2">
                                  <Place address={record.checkInAdd} coords={record.checkInCoords} />
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile / tablet cards */}
                  <ul className="divide-y divide-slate-100 lg:hidden">
                    {filteredRecords.map((record) => {
                      const flags = flagsById.get(record.id) ?? [];
                      return (
                        <li key={record.id} className={`space-y-3 p-4 ${flags.length ? 'bg-amber-50/30' : ''}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-900">{record.name || '—'}</p>
                              <p className="truncate text-xs text-slate-500">{record.userEmail}</p>
                            </div>
                            {!isOpen(record) ? (
                              <span className="badge-done">Completed</span>
                            ) : (
                              <span className="badge-active">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                                Open
                              </span>
                            )}
                          </div>

                          <p className="flex items-center gap-1.5 text-sm text-slate-700">
                            <Building2 className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                            <span className="font-medium">{record.companyName || '—'}</span>
                            <span className="text-slate-300">·</span>
                            <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                            {record.location || '—'}
                          </p>

                          <FlagBadges flags={flags} />

                          <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center">
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-slate-400">Date</p>
                              <p className="text-sm font-medium text-slate-800">{formatDateLabel(visitStart(record))}</p>
                            </div>
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-slate-400">In / Out</p>
                              <p className="tabular whitespace-nowrap text-sm font-medium text-slate-800">
                                {formatTimeLabel(visitStart(record))}–
                                {isOpen(record) ? '…' : <EndTime record={record} />}
                              </p>
                            </div>
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-slate-400">Duration</p>
                              <p className="text-sm font-medium text-slate-800">{visitDuration(record) || '—'}</p>
                            </div>
                          </div>

                          {(record.checkInAdd || record.checkInCoords) && (
                            <p className="flex items-start gap-1.5 text-xs text-slate-500">
                              <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
                              <Place address={record.checkInAdd} coords={record.checkInCoords} />
                            </p>
                          )}

                          {isForgotten(record, now) && (
                            <button
                              type="button"
                              onClick={() => closeVisit(record)}
                              disabled={closingId === record.id}
                              className="btn-secondary w-full"
                            >
                              {closingId === record.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                              ) : (
                                <AlarmClockOff className="h-4 w-4" aria-hidden="true" />
                              )}
                              Close forgotten visit
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AdminDashboard;
