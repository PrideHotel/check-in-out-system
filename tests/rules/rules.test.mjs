// Security-rules tests: runs firestore.rules against the Firestore emulator.
//
//   npm run test:rules        (needs Java 11+ for the emulator)
//
// Every case states whether the request should be ALLOWED or DENIED. The ones
// that matter most are the DENIED cases: they are what stops a salesperson
// backdating a visit, reading a colleague's data, or making themselves admin.

import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
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
import fs from 'node:fs';

const rulesPath = new URL('../../firestore.rules', import.meta.url);

const testEnv = await initializeTestEnvironment({
  projectId: 'check-in-out-system',
  firestore: { rules: fs.readFileSync(rulesPath, 'utf8'), host: '127.0.0.1', port: 8080 },
});

const HOUR = 3_600_000;
const ago = (ms) => Timestamp.fromDate(new Date(Date.now() - ms));
const ahead = (ms) => Timestamp.fromDate(new Date(Date.now() + ms));
const GOA = { lat: 15.49, lng: 73.83, accuracy: 20 };

// ---- seed ------------------------------------------------------------------
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'admins/mis3@pridehotel.com'), { role: 'superadmin' });
  await setDoc(doc(db, 'admins/goa.manager@pridehotel.com'), { role: 'admin', locations: ['Goa', 'Daman'] });
  await setDoc(doc(db, 'admins/national@pridehotel.com'), { role: 'admin', locations: [] });
  await setDoc(doc(db, 'admins/legacy@pridehotel.com'), { role: 'admin' });
  await setDoc(doc(db, 'meta/migrations'), { timestampsBackfilled: false });

  const closed = (userId, location, at) => ({
    userId, location, companyName: 'Acme',
    checkInTime: '10-08-2026 09:00:00', checkOutTime: '10-08-2026 10:00:00',
    checkInAt: at, checkOutAt: at,
  });
  await setDoc(doc(db, 'check-ins/r_goa'), closed('uid_priya', 'Goa', ago(48 * HOUR)));
  await setDoc(doc(db, 'check-ins/r_daman'), closed('uid_priya', 'Daman', ago(47 * HOUR)));
  await setDoc(doc(db, 'check-ins/r_indore'), closed('uid_rajul', 'Indore', ago(46 * HOUR)));
  await setDoc(doc(db, 'check-ins/r_jaipur'), closed('uid_amit', 'Jaipur', ago(45 * HOUR)));

  const open = (userId, location, at) => ({
    userId, location, companyName: 'Acme',
    checkInTime: '10-08-2026 09:00:00', checkOutTime: '', checkInAt: at,
  });
  await setDoc(doc(db, 'check-ins/open_rajul'), open('uid_rajul', 'Indore', ago(1 * HOUR)));
  await setDoc(doc(db, 'active/uid_rajul'), { checkInId: 'open_rajul', since: ago(1 * HOUR) });
  await setDoc(doc(db, 'check-ins/stale_goa'), open('uid_neha', 'Goa', ago(11 * HOUR)));
  await setDoc(doc(db, 'check-ins/fresh_goa'), open('uid_ravi', 'Goa', ago(2 * HOUR)));
  await setDoc(doc(db, 'check-ins/stale_indore'), open('uid_kiran', 'Indore', ago(12 * HOUR)));
  await setDoc(doc(db, 'check-ins/stale_jaipur'), open('uid_amit', 'Jaipur', ago(13 * HOUR)));
  for (const n of ['', '2', '3', '4']) {
    await setDoc(doc(db, `check-ins/late_${n || '1'}`), open(`uid_sunil${n}`, 'Goa', ago(20 * HOUR)));
  }

  // Records written before server timestamps existed: text times only.
  const legacy = (userId, checkOutTime) => ({
    userId, location: 'Goa', companyName: 'Old', checkInTime: '01-01-2025 09:00:00', checkOutTime,
  });
  await setDoc(doc(db, 'check-ins/legacy_open'), legacy('uid_meera', ''));
  await setDoc(doc(db, 'check-ins/legacy_closed'), legacy('uid_meera', '01-01-2025 10:00:00'));
  await setDoc(doc(db, 'check-ins/legacy_closed2'), legacy('uid_meera', '01-01-2025 10:00:00'));
  await setDoc(doc(db, 'check-ins/legacy_closed3'), legacy('uid_meera', '01-01-2025 10:00:00'));
  await setDoc(doc(db, 'check-ins/legacy_freetext'), { ...legacy('uid_priya', ''), location: 'Mumbai office' });

  // A lock left behind by a visit a manager already closed.
  await setDoc(doc(db, 'check-ins/closed_by_mgr'), {
    ...closed('uid_tara', 'Goa', ago(30 * HOUR)), closedBy: 'goa.manager@pridehotel.com',
  });
  await setDoc(doc(db, 'active/uid_tara'), { checkInId: 'closed_by_mgr', since: ago(30 * HOUR) });
});

// ---- people ----------------------------------------------------------------
// Several email domains on purpose: sign-up is open to any address.
const as = (uid, email) => testEnv.authenticatedContext(uid, { email }).firestore();
const superAdmin = as('uid_mis', 'mis3@pridehotel.com');
const scopedAdmin = as('uid_goa_mgr', 'goa.manager@pridehotel.com');
const allLocAdmin = as('uid_nat', 'national@pridehotel.com');
const legacyAdmin = as('uid_legacy', 'legacy@pridehotel.com');
const priya = as('uid_priya', 'sales.goa@pridehotel.com');
const rajul = as('uid_rajul', 'sales.indore@pridehotel.com');
const tara = as('uid_tara', 'tara@prideresorts.in');
const meera = as('uid_meera', 'meera@prideambervilas.com');
const sunil = as('uid_sunil', 'sunil@pridehotel.com');
const sunil2 = as('uid_sunil2', 'sunil2@pridehotel.com');
const sunil3 = as('uid_sunil3', 'sunil3@pridehotel.com');
const sunil4 = as('uid_sunil4', 'sunil4@pridehotel.com');
const anon = testEnv.unauthenticatedContext().firestore();

const results = [];
let section = '';
async function check(name, expectation, action) {
  try {
    await (expectation === 'allow' ? assertSucceeds(action()) : assertFails(action()));
    results.push(['PASS', expectation, section, name]);
  } catch (error) {
    results.push(['FAIL', expectation, section, `${name} :: ${error.message.split('\n')[0]}`]);
  }
}

/** The app's check-in: the visit and the lock, written together. */
function checkIn(db, uid, recordId, { visit = {}, lock = {}, withLock = true, omit = [] } = {}) {
  const batch = writeBatch(db);
  const data = {
    userId: uid,
    name: 'Someone',
    location: 'Goa',
    companyName: 'Acme',
    checkInTime: '24-09-2026 09:00:00',
    checkInAt: serverTimestamp(),
    checkInAdd: 'Panaji, Goa',
    checkInCoords: GOA,
    checkOutTime: '',
    checkOutAdd: '',
    ...visit,
  };
  omit.forEach((field) => delete data[field]);
  batch.set(doc(db, 'check-ins', recordId), data);
  if (withLock) {
    batch.set(doc(db, 'active', uid), { checkInId: recordId, since: serverTimestamp(), ...lock });
  }
  return batch.commit();
}

/** The app's check-out: close the visit and release the lock. */
function checkOut(db, uid, recordId, fields = {}) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'check-ins', recordId), {
    checkOutTime: '24-09-2026 18:00:00',
    checkOutAt: serverTimestamp(),
    checkOutAdd: 'Panaji, Goa',
    checkOutCoords: GOA,
    ...fields,
  });
  batch.delete(doc(db, 'active', uid));
  return batch.commit();
}

const managerClose = (db, recordId, email, fields = {}) =>
  updateDoc(doc(db, 'check-ins', recordId), {
    checkOutTime: '24-09-2026 18:00:00',
    checkOutAt: serverTimestamp(),
    closedBy: email,
    lateCheckout: true,
    ...fields,
  });

// ---- reading ---------------------------------------------------------------
section = 'reading';
await check('salesperson reads own record', 'allow', () => getDoc(doc(priya, 'check-ins/r_goa')));
await check("salesperson reads another person's record", 'deny', () => getDoc(doc(priya, 'check-ins/r_indore')));
await check('salesperson lists whole collection', 'deny', () => getDocs(collection(priya, 'check-ins')));
await check('salesperson lists own records', 'allow', () =>
  getDocs(query(collection(priya, 'check-ins'), where('userId', '==', 'uid_priya'))));
await check('anonymous reads anything', 'deny', () => getDoc(doc(anon, 'check-ins/r_goa')));

// ---- location scoping ------------------------------------------------------
section = 'location scoping';
const inLocs = (db, locs) => getDocs(query(collection(db, 'check-ins'), where('location', 'in', locs)));
await check('SuperAdmin lists every record', 'allow', () => getDocs(collection(superAdmin, 'check-ins')));
await check('all-locations admin lists every record', 'allow', () => getDocs(collection(allLocAdmin, 'check-ins')));
await check('legacy admin doc (no locations) lists every record', 'allow', () => getDocs(collection(legacyAdmin, 'check-ins')));
await check('scoped admin queries own locations', 'allow', () => inLocs(scopedAdmin, ['Goa', 'Daman']));
await check('scoped admin asks for whole collection', 'deny', () => getDocs(collection(scopedAdmin, 'check-ins')));
await check('scoped admin queries an ungranted location', 'deny', () => inLocs(scopedAdmin, ['Indore']));
await check('scoped admin smuggles an extra location in', 'deny', () => inLocs(scopedAdmin, ['Goa', 'Indore']));
await check('scoped admin reads out-of-scope record by id', 'deny', () => getDoc(doc(scopedAdmin, 'check-ins/r_indore')));

// ---- date-range loading ----------------------------------------------------
section = 'date-range loading';
const range = (db, locs) => {
  const parts = [
    where('checkInAt', '>=', ago(30 * 24 * HOUR)),
    where('checkInAt', '<=', ahead(HOUR)),
    orderBy('checkInAt', 'desc'),
  ];
  if (locs) parts.unshift(where('location', 'in', locs));
  return getDocs(query(collection(db, 'check-ins'), ...parts));
};
await check('SuperAdmin loads a 30-day range', 'allow', () => range(superAdmin));
await check('scoped admin loads a 30-day range for own locations', 'allow', () => range(scopedAdmin, ['Goa', 'Daman']));
await check('scoped admin loads a 30-day range without location filter', 'deny', () => range(scopedAdmin));

// ---- check-in: server time, lock, location ---------------------------------
section = 'check-in';
await check('check-in with lock in the same write', 'allow', () => checkIn(priya, 'uid_priya', 'ci_ok'));
await check('second check-in while the first is open', 'deny', () => checkIn(priya, 'uid_priya', 'ci_second'));
await check('check-in without taking the lock', 'deny', () =>
  checkIn(meera, 'uid_meera', 'ci_nolock', { withLock: false }));
await check('check-in with a backdated time (phone clock)', 'deny', () =>
  checkIn(sunil, 'uid_sunil', 'ci_backdated', { visit: { checkInAt: ago(3 * HOUR) } }));
await check('check-in with no server time at all', 'deny', () =>
  checkIn(sunil, 'uid_sunil', 'ci_notime', { visit: { checkInAt: null } }));
await check('lock pointing at a different record', 'deny', () =>
  checkIn(sunil, 'uid_sunil', 'ci_mismatch', { lock: { checkInId: 'something_else' } }));
await check('lock pointing at an existing record, no new visit', 'deny', () =>
  setDoc(doc(sunil, 'active/uid_sunil'), { checkInId: 'late_1', since: serverTimestamp() }));
await check('check-in for somebody else', 'deny', () =>
  checkIn(sunil, 'uid_sunil', 'ci_other', { visit: { userId: 'uid_rajul' } }));
await check('check-in with impossible coordinates', 'deny', () =>
  checkIn(sunil, 'uid_sunil', 'ci_coords', { visit: { checkInCoords: { lat: 200, lng: 73 } } }));
await check('check-in arriving already checked out', 'deny', () =>
  checkIn(sunil, 'uid_sunil', 'ci_preclosed', { visit: { checkOutAt: serverTimestamp() } }));
await check('check-in taking over a lock left by a closed visit', 'allow', () =>
  checkIn(tara, 'uid_tara', 'ci_takeover'));
await check('reading your own lock', 'allow', () => getDoc(doc(priya, 'active/uid_priya')));
await check("reading someone else's lock", 'deny', () => getDoc(doc(priya, 'active/uid_rajul')));
await check("deleting someone else's lock", 'deny', () => deleteDoc(doc(priya, 'active/uid_rajul')));

// ---- locations: only the listed ones ---------------------------------------
section = 'locations';
await check('check-in at a listed location', 'allow', () =>
  checkIn(as('uid_loc1', 'a@pridehotel.com'), 'uid_loc1', 'loc_ok', { visit: { location: 'Udaipur' } }));
await check('check-in at Dehradun (added most recently)', 'allow', () =>
  checkIn(as('uid_loc2', 'b@pridehotel.com'), 'uid_loc2', 'loc_dehradun', { visit: { location: 'Dehradun' } }));
await check('check-in at Canopus', 'allow', () =>
  checkIn(as('uid_loc3', 'c@pridehotel.com'), 'uid_loc3', 'loc_canopus', { visit: { location: 'Canopus' } }));
await check('check-in at free-text location', 'deny', () =>
  checkIn(sunil, 'uid_sunil', 'loc_free', { visit: { location: 'Mumbai' } }));
await check('check-in at a misspelt location ("Dehradoon")', 'deny', () =>
  checkIn(sunil, 'uid_sunil', 'loc_typo', { visit: { location: 'Dehradoon' } }));
await check('check-in with wrong letter case ("goa")', 'deny', () =>
  checkIn(sunil, 'uid_sunil', 'loc_case', { visit: { location: 'goa' } }));
await check('check-in with empty location', 'deny', () =>
  checkIn(sunil, 'uid_sunil', 'loc_empty', { visit: { location: '' } }));
await check('check-in with no location field', 'deny', () =>
  checkIn(sunil, 'uid_sunil', 'loc_missing', { omit: ['location'] }));

// ---- check-out -------------------------------------------------------------
section = 'check-out';
await check('check-out stamping a backdated time', 'deny', () =>
  checkOut(rajul, 'uid_rajul', 'open_rajul', { checkOutAt: ago(HOUR / 2) }));
await check('check-out that also edits the company name', 'deny', () =>
  checkOut(rajul, 'uid_rajul', 'open_rajul', { companyName: 'Other' }));
await check('check-out that also changes the location', 'deny', () =>
  checkOut(rajul, 'uid_rajul', 'open_rajul', { location: 'Goa' }));
await check('check-out with server time and GPS', 'allow', () => checkOut(rajul, 'uid_rajul', 'open_rajul'));
await check('checking out an already closed visit again', 'deny', () =>
  checkOut(rajul, 'uid_rajul', 'open_rajul'));
await check("checking out someone else's visit", 'deny', () => checkOut(priya, 'uid_priya', 'fresh_goa'));
await check('check-out of an old text-only record', 'allow', () =>
  updateDoc(doc(meera, 'check-ins/legacy_open'), {
    checkOutTime: '24-09-2026 18:00:00', checkOutAt: serverTimestamp(),
  }));
await check('check-out of an old free-text-location record', 'allow', () =>
  updateDoc(doc(priya, 'check-ins/legacy_freetext'), {
    checkOutTime: '24-09-2026 18:00:00', checkOutAt: serverTimestamp(),
  }));

// ---- forgotten check-outs --------------------------------------------------
section = 'forgotten check-outs';
const late = (reportedAt) => ({ reportedCheckOutAt: reportedAt, lateCheckout: true });
await check('reporting a leaving time between check-in and now', 'allow', () =>
  updateDoc(doc(sunil, 'check-ins/late_1'), {
    checkOutTime: 'x', checkOutAt: serverTimestamp(), ...late(ago(12 * HOUR)),
  }));
await check('reporting a leaving time before check-in', 'deny', () =>
  updateDoc(doc(sunil2, 'check-ins/late_2'), {
    checkOutTime: 'x', checkOutAt: serverTimestamp(), ...late(ago(30 * HOUR)),
  }));
await check('reporting a leaving time in the future', 'deny', () =>
  updateDoc(doc(sunil3, 'check-ins/late_3'), {
    checkOutTime: 'x', checkOutAt: serverTimestamp(), ...late(ahead(HOUR)),
  }));
await check('marking late without saying when you left', 'deny', () =>
  updateDoc(doc(sunil4, 'check-ins/late_4'), {
    checkOutTime: 'x', checkOutAt: serverTimestamp(), lateCheckout: true,
  }));
await check('scoped admin closes a stale visit at their location', 'allow', () =>
  managerClose(scopedAdmin, 'stale_goa', 'goa.manager@pridehotel.com'));
await check('scoped admin closes a visit open only 2 hours', 'deny', () =>
  managerClose(scopedAdmin, 'fresh_goa', 'goa.manager@pridehotel.com'));
await check('scoped admin closes a stale visit outside their locations', 'deny', () =>
  managerClose(scopedAdmin, 'stale_indore', 'goa.manager@pridehotel.com'));
await check("manager close signed with someone else's email", 'deny', () =>
  managerClose(allLocAdmin, 'stale_indore', 'mis3@pridehotel.com'));
await check('manager close that also edits the company', 'deny', () =>
  managerClose(allLocAdmin, 'stale_indore', 'national@pridehotel.com', { companyName: 'X' }));
await check("salesperson closes someone else's stale visit", 'deny', () =>
  managerClose(priya, 'stale_jaipur', 'sales.goa@pridehotel.com'));
await check('SuperAdmin closes a stale visit anywhere', 'allow', () =>
  managerClose(superAdmin, 'stale_jaipur', 'mis3@pridehotel.com'));

// ---- one-time upgrade of old records ---------------------------------------
section = 'old-record upgrade';
const backfill = (db, id, fields = {}) =>
  updateDoc(doc(db, 'check-ins', id), {
    checkInAt: Timestamp.fromDate(new Date('2025-01-01T09:00:00+05:30')),
    checkOutAt: Timestamp.fromDate(new Date('2025-01-01T10:00:00+05:30')),
    timesBackfilled: true,
    ...fields,
  });
await check('SuperAdmin upgrades an old record', 'allow', () => backfill(superAdmin, 'legacy_closed'));
await check('upgrading a record that already has server times', 'deny', () => backfill(superAdmin, 'r_goa'));
await check('upgrade that also edits the company', 'deny', () =>
  backfill(superAdmin, 'legacy_closed2', { companyName: 'X' }));
await check('upgrade setting a time in the future', 'deny', () =>
  backfill(superAdmin, 'legacy_closed2', { checkInAt: ahead(24 * HOUR) }));
await check('plain admin upgrades an old record', 'deny', () => backfill(allLocAdmin, 'legacy_closed3'));
await check('salesperson upgrades their own old record', 'deny', () => backfill(meera, 'legacy_closed3'));
await check('admin reads the migration status', 'allow', () => getDoc(doc(scopedAdmin, 'meta/migrations')));
await check('salesperson reads the migration status', 'deny', () => getDoc(doc(priya, 'meta/migrations')));
await check('SuperAdmin records the migration as done', 'allow', () =>
  setDoc(doc(superAdmin, 'meta/migrations'), { timestampsBackfilled: true }));
await check('plain admin records the migration as done', 'deny', () =>
  setDoc(doc(allLocAdmin, 'meta/migrations'), { timestampsBackfilled: true }));

// ---- history is permanent --------------------------------------------------
section = 'audit trail';
await check('nobody can delete visit history (owner)', 'deny', () => deleteDoc(doc(priya, 'check-ins/r_goa')));
await check('nobody can delete visit history (SuperAdmin)', 'deny', () => deleteDoc(doc(superAdmin, 'check-ins/r_goa')));

// ---- role management -------------------------------------------------------
section = 'roles';
await check('SuperAdmin lists roles', 'allow', () => getDocs(collection(superAdmin, 'admins')));
await check('plain admin lists roles', 'deny', () => getDocs(collection(scopedAdmin, 'admins')));
await check('anyone reads own role', 'allow', () => getDoc(doc(scopedAdmin, 'admins/goa.manager@pridehotel.com')));
await check('SuperAdmin grants a role', 'allow', () =>
  setDoc(doc(superAdmin, 'admins/new@prideresorts.in'), { role: 'admin', locations: ['Jaipur'] }));
await check('plain admin promotes themselves', 'deny', () =>
  setDoc(doc(scopedAdmin, 'admins/goa.manager@pridehotel.com'), { role: 'superadmin' }));
await check('SuperAdmin demotes themselves (lockout guard)', 'deny', () =>
  setDoc(doc(superAdmin, 'admins/mis3@pridehotel.com'), { role: 'admin', locations: [] }));
await check('SuperAdmin writes an invalid role', 'deny', () =>
  setDoc(doc(superAdmin, 'admins/bogus@x.com'), { role: 'owner' }));

// ---- report ----------------------------------------------------------------
await testEnv.cleanup();

const failed = results.filter(([status]) => status === 'FAIL');
let current = '';
for (const [status, expectation, sec, name] of results) {
  if (sec !== current) {
    console.log(`\n  ${sec}`);
    current = sec;
  }
  console.log(`    ${status === 'PASS' ? '✓' : '✗'} [${expectation.padEnd(5)}] ${name}`);
}
console.log(`\n${results.length - failed.length}/${results.length} rules assertions passed`);
process.exit(failed.length ? 1 : 0);
