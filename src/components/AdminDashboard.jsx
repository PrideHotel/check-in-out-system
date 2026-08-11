import { useEffect, useMemo, useState } from 'react';
import { db } from '../firebase.js';
import { collection, getDocs, query } from 'firebase/firestore';
import {
  AlertCircle,
  Building2,
  CalendarRange,
  ClipboardList,
  Download,
  MapPin,
  RefreshCw,
  Search,
  ShieldAlert,
  Timer,
  Users,
  X,
} from 'lucide-react';
import {
  parseFormattedDateTime,
  formatDateLabel,
  formatTimeLabel,
  getVisitDuration,
  shortenAddress,
} from '../utils/datetime';
import { downloadCsv, exportStamp } from '../utils/csv';

function StatCard({ icon: Icon, label, value, tone = 'brand' }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-800',
    emerald: 'bg-emerald-50 text-emerald-700',
    gold: 'bg-gold-50 text-gold-700',
    slate: 'bg-slate-100 text-slate-600',
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

/** Turns the raw Firestore error into something actionable for an admin. */
function PermissionHelp() {
  return (
    <div className="card card-pad">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600">
          <ShieldAlert className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 space-y-3 text-sm">
          <div>
            <p className="font-semibold text-slate-900">Firestore denied the request</p>
            <p className="mt-1 text-slate-600">
              Your account is marked as an admin, but the database rules do not allow reading the
              whole collection yet.
            </p>
          </div>
          <ol className="list-decimal space-y-1.5 pl-5 text-slate-600">
            <li>
              Open the Firebase console &rarr; <strong>Firestore Database</strong> &rarr;{' '}
              <strong>Rules</strong>.
            </li>
            <li>
              Replace the contents with the <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">firestore.rules</code>{' '}
              file from this repository, then press <strong>Publish</strong>.
            </li>
            <li>Reload this page.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

const AdminDashboard = () => {
  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const [search, setSearch] = useState('');
  const [person, setPerson] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => {
    let cancelled = false;

    const fetchAll = async () => {
      setIsLoading(true);
      setError('');
      setPermissionDenied(false);

      try {
        // No userId filter — this is the whole team's data.
        const snapshot = await getDocs(query(collection(db, 'check-ins')));
        const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));

        data.sort((a, b) => {
          const aTime = parseFormattedDateTime(a.checkInTime)?.getTime() ?? 0;
          const bTime = parseFormattedDateTime(b.checkInTime)?.getTime() ?? 0;
          return bTime - aTime;
        });

        if (!cancelled) setRecords(data);
      } catch (err) {
        console.error('Error loading team records:', err);
        if (cancelled) return;
        if (err?.code === 'permission-denied') {
          setPermissionDenied(true);
        } else {
          setError('Could not load the team records. Check your connection and try again.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const people = useMemo(() => {
    const names = new Set();
    records.forEach((record) => {
      const label = record.name || record.userEmail;
      if (label) names.add(label);
    });
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [records]);

  const hasFilters = Boolean(search || person || fromDate || toDate);
  const clearFilters = () => {
    setSearch('');
    setPerson('');
    setFromDate('');
    setToDate('');
  };

  const filteredRecords = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
    const to = toDate ? new Date(`${toDate}T23:59:59`) : null;

    return records.filter((record) => {
      if (needle) {
        const haystack = [
          record.name,
          record.userEmail,
          record.companyName,
          record.location,
          record.checkInAdd,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }

      if (person && (record.name || record.userEmail) !== person) return false;

      if (from || to) {
        const checkedIn = parseFormattedDateTime(record.checkInTime);
        if (!checkedIn) return false;
        if (from && checkedIn < from) return false;
        if (to && checkedIn > to) return false;
      }

      return true;
    });
  }, [records, search, person, fromDate, toDate]);

  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = filteredRecords.filter((record) => {
      const date = parseFormattedDateTime(record.checkInTime);
      return date && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }).length;

    const team = new Set(
      filteredRecords.map((record) => record.userId || record.userEmail).filter(Boolean)
    );

    return {
      total: filteredRecords.length,
      active: filteredRecords.filter((record) => !record.checkOutTime).length,
      team: team.size,
      thisMonth,
    };
  }, [filteredRecords]);

  const exportCsv = () => {
    downloadCsv(
      `team-check-ins-${exportStamp()}.csv`,
      [
        'Sales Person',
        'Email',
        'Company',
        'Location',
        'Check-In',
        'Check-Out',
        'Duration',
        'Check-In Address',
        'Check-Out Address',
      ],
      filteredRecords.map((record) => [
        record.name,
        record.userEmail,
        record.companyName,
        record.location,
        record.checkInTime,
        record.checkOutTime || 'Not checked out',
        getVisitDuration(record.checkInTime, record.checkOutTime) || '',
        record.checkInAdd,
        record.checkOutAdd,
      ])
    );
  };

  return (
    <div className="mx-auto w-full max-w-6xl animate-fade-in-up space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Team data</h1>
          <p className="text-sm text-slate-500">
            Every check-in recorded by the sales team, newest first.
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
          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            <StatCard icon={ClipboardList} label="Visits shown" value={stats.total} />
            <StatCard icon={Timer} label="Currently active" value={stats.active} tone="emerald" />
            <StatCard icon={Users} label="Team members" value={stats.team} tone="slate" />
            <StatCard icon={CalendarRange} label="This month" value={stats.thisMonth} tone="gold" />
          </div>

          {/* Filters */}
          <div className="card card-pad">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                <select
                  id="personFilter"
                  value={person}
                  onChange={(e) => setPerson(e.target.value)}
                  className="input"
                >
                  <option value="">Everyone</option>
                  {people.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="fromDate" className="label">
                    From
                  </label>
                  <input
                    id="fromDate"
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="input px-2"
                  />
                </div>
                <div>
                  <label htmlFor="toDate" className="label">
                    To
                  </label>
                  <input
                    id="toDate"
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="input px-2"
                  />
                </div>
              </div>
            </div>

            {hasFilters && (
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <p className="text-sm text-slate-500">
                  Showing{' '}
                  <span className="font-semibold text-slate-800">{filteredRecords.length}</span> of{' '}
                  {records.length} visits
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

          {error && (
            <div className="alert-error" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

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
                    {hasFilters ? 'No visits match your filters' : 'No visits recorded yet'}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {hasFilters
                      ? 'Try widening the date range or clearing the search.'
                      : 'Records will appear here as the team checks in.'}
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
                        <th scope="col" className="px-5 py-3.5">Address</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRecords.map((record) => (
                        <tr key={record.id} className="transition hover:bg-slate-50/80">
                          <td className="px-5 py-4">
                            <div className="font-semibold text-slate-900">
                              {record.name || '—'}
                            </div>
                            <div className="truncate text-xs text-slate-500">
                              {record.userEmail}
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <div className="text-sm font-medium text-slate-800">
                              {record.companyName || '—'}
                            </div>
                            {!record.checkOutTime && (
                              <span className="badge-active mt-1">
                                <span
                                  className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                                  aria-hidden="true"
                                />
                                Active
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">
                            <span className="inline-flex items-center gap-1.5">
                              <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                              {record.location || '—'}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">
                            {formatDateLabel(record.checkInTime)}
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-sm">
                            <span className="tabular font-medium text-slate-900">
                              {formatTimeLabel(record.checkInTime)}
                            </span>
                            <span className="mx-1.5 text-slate-300">→</span>
                            <span
                              className={`tabular font-medium ${
                                record.checkOutTime ? 'text-slate-900' : 'text-emerald-600'
                              }`}
                            >
                              {record.checkOutTime
                                ? formatTimeLabel(record.checkOutTime)
                                : 'ongoing'}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">
                            {getVisitDuration(record.checkInTime, record.checkOutTime) || '—'}
                          </td>
                          <td className="max-w-xs px-5 py-4 text-sm text-slate-500">
                            <span className="line-clamp-2" title={record.checkInAdd || ''}>
                              {shortenAddress(record.checkInAdd) || '—'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile / tablet cards */}
                <ul className="divide-y divide-slate-100 lg:hidden">
                  {filteredRecords.map((record) => (
                    <li key={record.id} className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900">
                            {record.name || '—'}
                          </p>
                          <p className="truncate text-xs text-slate-500">{record.userEmail}</p>
                        </div>
                        {record.checkOutTime ? (
                          <span className="badge-done">Completed</span>
                        ) : (
                          <span className="badge-active">
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                              aria-hidden="true"
                            />
                            Active
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

                      <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center">
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">Date</p>
                          <p className="text-sm font-medium text-slate-800">
                            {formatDateLabel(record.checkInTime)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">
                            In / Out
                          </p>
                          <p className="tabular whitespace-nowrap text-sm font-medium text-slate-800">
                            {formatTimeLabel(record.checkInTime)}–
                            {record.checkOutTime ? formatTimeLabel(record.checkOutTime) : '…'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">
                            Duration
                          </p>
                          <p className="text-sm font-medium text-slate-800">
                            {getVisitDuration(record.checkInTime, record.checkOutTime) || '—'}
                          </p>
                        </div>
                      </div>

                      {record.checkInAdd && (
                        <p className="flex items-start gap-1.5 text-xs text-slate-500">
                          <MapPin
                            className="mt-0.5 h-3 w-3 shrink-0 text-slate-400"
                            aria-hidden="true"
                          />
                          <span>{shortenAddress(record.checkInAdd)}</span>
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default AdminDashboard;
