// Shared date/time helpers.
//
// Records are stored with the display format "DD-MM-YYYY HH:mm:ss" (24-hour),
// so every helper here speaks that same format.

const PATTERN = /^(\d{2})-(\d{2})-(\d{4})[ T](\d{2}):(\d{2}):(\d{2})$/;

/** Current local time as "DD-MM-YYYY HH:mm:ss". */
export function getFormattedDateTime(date = new Date()) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
}

/** Parse "DD-MM-YYYY HH:mm:ss" back into a Date (null when unparseable). */
export function parseFormattedDateTime(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(PATTERN);
  if (!match) return null;

  const [, day, month, year, hours, minutes, seconds] = match.map(Number);
  const date = new Date(year, month - 1, day, hours, minutes, seconds);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "10-08-2026 14:35:12" -> "10 Aug 2026" (falls back to the raw date part). */
export function formatDateLabel(value) {
  const date = parseFormattedDateTime(value);
  if (!date) return typeof value === 'string' ? value.split(' ')[0] || '—' : '—';

  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** "10-08-2026 14:35:12" -> "14:35". */
export function formatTimeLabel(value) {
  const date = parseFormattedDateTime(value);
  if (!date) return typeof value === 'string' ? value.split(' ')[1]?.slice(0, 5) || '—' : '—';

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/** Milliseconds -> "1h 24m" / "24m" / "48s". */
export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';

  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (totalMinutes > 0) return `${totalMinutes}m`;
  return `${Math.floor(ms / 1000)}s`;
}

/** Milliseconds -> "01:24:07" for the live on-site timer. */
export function formatStopwatch(ms) {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;

  const totalSeconds = Math.floor(ms / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');

  return `${hours}:${minutes}:${seconds}`;
}

/** Time between a check-in / check-out pair, as a short label. */
export function getVisitDuration(checkInTime, checkOutTime) {
  const start = parseFormattedDateTime(checkInTime);
  const end = parseFormattedDateTime(checkOutTime);
  if (!start || !end) return null;

  return formatDuration(end.getTime() - start.getTime());
}

/** Trim a Nominatim address down to its most useful leading parts. */
export function shortenAddress(address, parts = 3) {
  if (typeof address !== 'string' || !address.trim()) return '';
  return address.split(',').slice(0, parts).join(', ').trim();
}
