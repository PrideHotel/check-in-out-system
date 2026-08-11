import { useEffect, useMemo, useState } from 'react';
import { db } from '../firebase.js';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  Clock3,
  Download,
  MapPin,
  Search,
  Timer,
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
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex items-center gap-4">
          <span className="skeleton h-4 w-1/4" />
          <span className="skeleton h-4 w-1/6" />
          <span className="skeleton h-4 w-1/5" />
          <span className="skeleton hidden h-4 w-1/4 sm:block" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ hasFilters, onClear }) {
  return (
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
            ? 'Try a different company name or date.'
            : 'Your check-ins will appear here once you record your first visit.'}
        </p>
      </div>
      {hasFilters ? (
        <button type="button" onClick={onClear} className="btn-secondary mt-1">
          <X className="h-4 w-4" aria-hidden="true" />
          Clear filters
        </button>
      ) : (
        <Link to="/" className="btn-primary mt-1">
          <Clock3 className="h-4 w-4" aria-hidden="true" />
          Record a visit
        </Link>
      )}
    </div>
  );
}

function StatusBadge({ record }) {
  return record.checkOutTime ? (
    <span className="badge-done">Completed</span>
  ) : (
    <span className="badge-active">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
      Active
    </span>
  );
}

const History = () => {
  const auth = getAuth();
  const [records, setRecords] = useState([]);
  const [companyFilter, setCompanyFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setError('');
      if (!auth.currentUser) {
        setIsLoading(false);
        return;
      }

      try {
        const q = query(
          collection(db, 'check-ins'),
          where('userId', '==', auth.currentUser.uid)
        );

        const snapshot = await getDocs(q);
        const data = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));

        // Newest visit first.
        data.sort((a, b) => {
          const aTime = parseFormattedDateTime(a.checkInTime)?.getTime() ?? 0;
          const bTime = parseFormattedDateTime(b.checkInTime)?.getTime() ?? 0;
          return bTime - aTime;
        });

        setRecords(data);
      } catch (err) {
        console.error('Error fetching records:', err);
        setError('Failed to load your history. Check your connection and try again.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [auth.currentUser]);

  const hasFilters = Boolean(companyFilter || dateFilter);
  const clearFilters = () => {
    setCompanyFilter('');
    setDateFilter('');
  };

  const filteredRecords = useMemo(() => {
    // The date input gives YYYY-MM-DD; stored dates are DD-MM-YYYY.
    const targetDate = dateFilter ? dateFilter.split('-').reverse().join('-') : '';
    const needle = companyFilter.trim().toLowerCase();

    return records.filter((record) => {
      const matchesCompany = (record.companyName || '').toLowerCase().includes(needle);
      const recordDate = (record.checkInTime || '').split(' ')[0];
      const matchesDate = targetDate ? recordDate === targetDate : true;
      return matchesCompany && matchesDate;
    });
  }, [records, companyFilter, dateFilter]);

  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = records.filter((record) => {
      const date = parseFormattedDateTime(record.checkInTime);
      return date && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }).length;

    return {
      total: records.length,
      active: records.filter((record) => !record.checkOutTime).length,
      thisMonth,
    };
  }, [records]);

  const exportCsv = () => {
    downloadCsv(
      `check-in-history-${exportStamp()}.csv`,
      ['Company', 'Location', 'Check-In', 'Check-Out', 'Duration', 'Check-In Address'],
      filteredRecords.map((record) => [
        record.companyName,
        record.location,
        record.checkInTime,
        record.checkOutTime || 'Not checked out',
        getVisitDuration(record.checkInTime, record.checkOutTime) || '',
        record.checkInAdd,
      ])
    );
  };

  return (
    <div className="mx-auto w-full max-w-5xl animate-fade-in-up space-y-5">
      {/* Page heading */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Check-in history</h1>
          <p className="text-sm text-slate-500">Every visit you have recorded, newest first.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={filteredRecords.length === 0}
            className="btn-secondary"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Export CSV
          </button>
          <Link to="/" className="btn-ghost">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </Link>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <StatCard icon={ClipboardList} label="Total visits" value={stats.total} />
        <StatCard icon={Timer} label="Currently active" value={stats.active} tone="emerald" />
        <StatCard icon={CalendarRange} label="This month" value={stats.thisMonth} tone="gold" />
      </div>

      {/* Filters */}
      <div className="card card-pad">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="companyFilter" className="label">
              <Building2 className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              Filter by company
            </label>
            <div className="relative">
              <Search className="field-icon" aria-hidden="true" />
              <input
                id="companyFilter"
                type="text"
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
                className="input input-icon"
                placeholder="Search company…"
              />
            </div>
          </div>

          <div>
            <label htmlFor="dateFilter" className="label">
              <CalendarDays className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              Filter by check-in date
            </label>
            <input
              id="dateFilter"
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="input"
            />
          </div>
        </div>

        {hasFilters && (
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <p className="text-sm text-slate-500">
              Showing <span className="font-semibold text-slate-800">{filteredRecords.length}</span>{' '}
              of {records.length} visits
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

      {/* Records */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <TableSkeleton />
        ) : filteredRecords.length === 0 ? (
          <EmptyState hasFilters={hasFilters} onClear={clearFilters} />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-left">
                <thead className="bg-slate-50">
                  <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500">
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
                          {record.companyName || '—'}
                        </div>
                        <div className="mt-1">
                          <StatusBadge record={record} />
                        </div>
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
                          {record.checkOutTime ? formatTimeLabel(record.checkOutTime) : 'ongoing'}
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

            {/* Mobile cards */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {filteredRecords.map((record) => (
                <li key={record.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">
                        {record.companyName || '—'}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500">
                        <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                        {record.location || '—'}
                      </p>
                    </div>
                    <StatusBadge record={record} />
                  </div>

                  <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-slate-400">Date</p>
                      <p className="text-sm font-medium text-slate-800">
                        {formatDateLabel(record.checkInTime)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-slate-400">In / Out</p>
                      <p className="tabular whitespace-nowrap text-sm font-medium text-slate-800">
                        {formatTimeLabel(record.checkInTime)}–
                        {record.checkOutTime ? formatTimeLabel(record.checkOutTime) : '…'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-slate-400">Duration</p>
                      <p className="text-sm font-medium text-slate-800">
                        {getVisitDuration(record.checkInTime, record.checkOutTime) || '—'}
                      </p>
                    </div>
                  </div>

                  {record.checkInAdd && (
                    <p className="flex items-start gap-1.5 text-xs text-slate-500">
                      <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
                      <span>{shortenAddress(record.checkInAdd)}</span>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {!isLoading && filteredRecords.length > 0 && (
        <p className="text-center text-xs text-slate-400">
          {filteredRecords.length} visit{filteredRecords.length === 1 ? '' : 's'} shown
        </p>
      )}
    </div>
  );
};

export default History;
