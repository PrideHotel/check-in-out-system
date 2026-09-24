// Reading a check-in record, whichever generation of the app wrote it.
//
// Records now carry server-side Firestore Timestamps (`checkInAt`,
// `checkOutAt`) which the phone cannot fake. Older records only have the
// "DD-MM-YYYY HH:mm:ss" strings written from the phone's clock, so every
// helper here prefers the Timestamp and falls back to the string.

import { formatDuration, parseFormattedDateTime } from './datetime';
import { LOCATION_COORDS } from '../constants/locations';

/** A visit still open after this long is treated as a forgotten check-out. */
export const FORGOTTEN_AFTER_HOURS = 10;

/** Phone clock this far from server time is flagged as suspicious. */
export const CLOCK_SKEW_ALERT_MINUTES = 10;

/** GPS fixes vaguer than this are too imprecise to judge distance from. */
const MAX_TRUSTED_ACCURACY_M = 2000;

function timestampToDate(value) {
  if (value && typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

/** When the visit began: server time if recorded, else the legacy string. */
export function visitStart(record) {
  return timestampToDate(record?.checkInAt) ?? parseFormattedDateTime(record?.checkInTime);
}

/**
 * When the visit ended. A time the salesperson reported after forgetting to
 * check out wins over the moment the record was actually closed.
 */
export function visitEnd(record) {
  return (
    timestampToDate(record?.reportedCheckOutAt) ??
    timestampToDate(record?.checkOutAt) ??
    parseFormattedDateTime(record?.checkOutTime)
  );
}

/** When the record was actually closed, on the server clock. */
export function closedAt(record) {
  return timestampToDate(record?.checkOutAt) ?? parseFormattedDateTime(record?.checkOutTime);
}

export function isOpen(record) {
  return !record?.checkOutTime;
}

/** Visit length as a short label, e.g. "1h 24m". */
export function visitDuration(record) {
  const start = visitStart(record);
  const end = visitEnd(record);
  if (!start || !end) return null;
  return formatDuration(end.getTime() - start.getTime());
}

/** Hours a still-open visit has been running. */
export function hoursOpen(record, now = Date.now()) {
  const start = visitStart(record);
  if (!isOpen(record) || !start) return 0;
  return (now - start.getTime()) / 3_600_000;
}

export function isForgotten(record, now = Date.now()) {
  return hoursOpen(record, now) >= FORGOTTEN_AFTER_HOURS;
}

/** Newest first, by check-in time. */
export function sortNewestFirst(records) {
  return [...records].sort(
    (a, b) => (visitStart(b)?.getTime() ?? 0) - (visitStart(a)?.getTime() ?? 0)
  );
}

// ---- Location ---------------------------------------------------------------

/** Great-circle distance in kilometres. */
export function distanceKm(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * How far one GPS reading was from the location the visit was logged against,
 * or null when that cannot be judged (no reading, vague reading, or the
 * location has no reference position).
 */
export function readingDistanceKm(record, coords) {
  const reference = LOCATION_COORDS[record?.location];
  if (!reference || !coords) return null;
  if (typeof coords.lat !== 'number' || typeof coords.lng !== 'number') return null;
  if (typeof coords.accuracy === 'number' && coords.accuracy > MAX_TRUSTED_ACCURACY_M) return null;
  return distanceKm(coords, reference);
}

/**
 * The farthest GPS reading of this visit from its logged location, if that is
 * outside the location's radius. Returns `{ km, radiusKm }` or null.
 */
export function farFromLocation(record) {
  const reference = LOCATION_COORDS[record?.location];
  if (!reference) return null;

  const distances = [record.checkInCoords, record.checkOutCoords]
    .map((coords) => readingDistanceKm(record, coords))
    .filter((km) => km !== null);
  if (distances.length === 0) return null;

  const km = Math.max(...distances);
  return km > reference.radiusKm ? { km: Math.round(km), radiusKm: reference.radiusKm } : null;
}

/** A Google Maps link for a stored reading. */
export function mapLink(coords) {
  if (!coords || typeof coords.lat !== 'number') return '';
  return `https://www.google.com/maps?q=${coords.lat},${coords.lng}`;
}

export function formatCoords(coords) {
  if (!coords || typeof coords.lat !== 'number') return '';
  return `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`;
}

// ---- Clock integrity --------------------------------------------------------

/**
 * Minutes the phone's clock differed from the server when the visit started
 * (positive = phone was ahead). Only measurable on records with both times.
 */
export function clockSkewMinutes(record) {
  const server = timestampToDate(record?.checkInAt);
  const phone = parseFormattedDateTime(record?.checkInTime);
  if (!server || !phone) return null;
  return Math.round((phone.getTime() - server.getTime()) / 60000);
}

export function hasClockSkew(record) {
  const skew = clockSkewMinutes(record);
  return skew !== null && Math.abs(skew) >= CLOCK_SKEW_ALERT_MINUTES;
}

/** Everything about a visit a manager should look at, as plain labels. */
export function visitFlags(record, now = Date.now()) {
  const flags = [];
  if (isForgotten(record, now)) {
    flags.push({ kind: 'forgotten', label: `Open ${Math.floor(hoursOpen(record, now))}h — not checked out` });
  }
  const far = farFromLocation(record);
  if (far) flags.push({ kind: 'far', label: `${far.km} km from ${record.location}` });
  if (hasClockSkew(record)) {
    const skew = clockSkewMinutes(record);
    flags.push({
      kind: 'clock',
      label: `Phone clock ${Math.abs(skew)} min ${skew > 0 ? 'ahead' : 'behind'}`,
    });
  }
  if (record?.lateCheckout && record?.closedBy) {
    flags.push({ kind: 'closed-by-manager', label: `Closed by ${record.closedBy}` });
  } else if (record?.lateCheckout) {
    flags.push({ kind: 'late', label: 'Check-out time reported later' });
  }
  return flags;
}
