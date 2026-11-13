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
  // A team lead responsible for three salespeople, wherever they go.
  await setDoc(doc(db, 'admins/team.lead@pridehotel.com'), {
    role: 'admin', salespeople: ['uid_priya', 'uid_neha', 'uid_ravi'],
  });
  await setDoc(doc(db, 'admins/national@pridehotel.com'), { role: 'admin', allSalespeople: true });
  // Old documents from when access was by location: they grant nothing now.
  await setDoc(doc(db, 'admins/legacy@pridehotel.com'), { role: 'admin' });
  await setDoc(doc(db, 'admins/old.goa@pridehotel.com'), { role: 'admin', locations: ['Goa'] });
  await setDoc(doc(db, 'users/uid_priya'), { name: 'Priya', email: 'sales.goa@pridehotel.com', lastSeenAt: ago(HOUR) });
  await setDoc(doc(db, 'users/uid_rajul'), { name: 'Rajul', email: 'sales.indore@pridehotel.com', lastSeenAt: ago(HOUR) });
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
  // Priya usually works Goa, but this visit was in Indore.
  await setDoc(doc(db, 'check-ins/r_priya_indore'), closed('uid_priya', 'Indore', ago(44 * HOUR)));

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
const teamLead = as('uid_lead', 'team.lead@pridehotel.com');
const allPeopleAdmin = as('uid_nat', 'national@pridehotel.com');
const legacyAdmin = as('uid_legacy', 'legacy@pridehotel.com');
const oldGoaAdmin = as('uid_oldgoa', 'old.goa@pridehotel.com');
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
section = 'salesperson scoping';
const ofPeople = (db, uids) => getDocs(query(collection(db, 'check-ins'), where('userId', 'in', uids)));
const ASSIGNED = ['uid_priya', 'uid_neha', 'uid_ravi'];
await check('SuperAdmin lists every record', 'allow', () => getDocs(collection(superAdmin, 'check-ins')));
await check('"all salespeople" admin lists every record', 'allow', () => getDocs(collection(allPeopleAdmin, 'check-ins')));
await check('team lead queries their assigned salespeople', 'allow', () => ofPeople(teamLead, ASSIGNED));
await check('team lead queries a subset of them', 'allow', () => ofPeople(teamLead, ['uid_priya']));
await check('team lead sees an assigned person at ANY location (Priya in Indore)', 'allow', () =>
  getDoc(doc(teamLead, 'check-ins/r_priya_indore')));
await check("team lead reads an unassigned person's visit at the same location", 'deny', () =>
  getDoc(doc(teamLead, 'check-ins/r_indore')));
await check('team lead asks for the whole collection', 'deny', () => getDocs(collection(teamLead, 'check-ins')));
await check('team lead queries an unassigned salesperson', 'deny', () => ofPeople(teamLead, ['uid_rajul']));
await check('team lead smuggles an extra person into the filter', 'deny', () =>
  ofPeople(teamLead, ['uid_priya', 'uid_rajul']));
await check('team lead filters by location instead of person', 'deny', () =>
  getDocs(query(collection(teamLead, 'check-ins'), where('location', 'in', ['Goa']))));
await check('admin with no assignment sees nobody', 'deny', () => ofPeople(legacyAdmin, ['uid_priya']));
await check('old location-based admin no longer sees that location', 'deny', () =>
  getDocs(query(collection(oldGoaAdmin, 'check-ins'), where('location', 'in', ['Goa']))));
await check('old location-based admin reads a visit there by id', 'deny', () =>
  getDoc(doc(oldGoaAdmin, 'check-ins/r_goa')));

// ---- date-range loading ----------------------------------------------------
section = 'date-range loading';
const range = (db, uids) => {
  const parts = [
    where('checkInAt', '>=', ago(30 * 24 * HOUR)),
    where('checkInAt', '<=', ahead(HOUR)),
    orderBy('checkInAt', 'desc'),
  ];
  if (uids) parts.unshift(where('userId', 'in', uids));
  return getDocs(query(collection(db, 'check-ins'), ...parts));
};
await check('SuperAdmin loads a 30-day range', 'allow', () => range(superAdmin));
await check('team lead loads a 30-day range for their salespeople', 'allow', () => range(teamLead, ASSIGNED));
await check('team lead loads a 30-day range without the person filter', 'deny', () => range(teamLead));

// ---- salesperson profiles --------------------------------------------------
section = 'salesperson profiles';
const profile = (db, uid, data = {}) =>
  setDoc(doc(db, 'users', uid), { name: 'Priya Nair', email: 'sales.goa@pridehotel.com', lastSeenAt: serverTimestamp(), ...data });
await check('saving your own profile on sign-in', 'allow', () => profile(priya, 'uid_priya'));
await check("writing someone else's profile", 'deny', () => profile(priya, 'uid_rajul'));
await check('profile claiming a different email', 'deny', () =>
  profile(priya, 'uid_priya', { email: 'boss@pridehotel.com' }));
await check('profile with an extra field (e.g. a role)', 'deny', () =>
  profile(priya, 'uid_priya', { role: 'superadmin' }));
await check('profile with a made-up timestamp', 'deny', () => profile(priya, 'uid_priya', { lastSeenAt: ago(HOUR) }));
await check('SuperAdmin lists all profiles (to assign people)', 'allow', () => getDocs(collection(superAdmin, 'users')));
await check('team lead lists all profiles', 'deny', () => getDocs(collection(teamLead, 'users')));
await check("team lead reads an assigned person's profile", 'allow', () => getDoc(doc(teamLead, 'users/uid_priya')));
await check("team lead reads an unassigned person's profile", 'deny', () => getDoc(doc(teamLead, 'users/uid_rajul')));
await check("salesperson reads a colleague's profile", 'deny', () => getDoc(doc(priya, 'users/uid_rajul')));

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

// ---- locations managed from the app -----------------------------------------
section = 'managed locations';
const loc = (db, name, data = {}) =>
  setDoc(doc(db, 'locations', name), { active: true, updatedAt: serverTimestamp(), ...data });
await check('SuperAdmin adds a new location with coordinates', 'allow', () =>
  loc(superAdmin, 'Nashik', { lat: 19.9975, lng: 73.7898, radiusKm: 40 }));
await check('check-in at the newly added location', 'allow', () =>
  checkIn(as('uid_loc4', 'd@pridehotel.com'), 'uid_loc4', 'loc_nashik', { visit: { location: 'Nashik' } }));
await check('salesperson reads the locations list', 'allow', () => getDocs(collection(priya, 'locations')));
await check('anonymous reads the locations list', 'deny', () => getDocs(collection(anon, 'locations')));
await check('SuperAdmin hides a built-in location (Puri)', 'allow', () => loc(superAdmin, 'Puri', { active: false }));
await check('check-in at a hidden location', 'deny', () =>
  checkIn(as('uid_loc5', 'e@pridehotel.com'), 'uid_loc5', 'loc_puri', { visit: { location: 'Puri' } }));
await check('SuperAdmin shows it again', 'allow', () => loc(superAdmin, 'Puri', { active: true }));
await check('check-in there works again', 'allow', () =>
  checkIn(as('uid_loc5', 'e@pridehotel.com'), 'uid_loc5', 'loc_puri2', { visit: { location: 'Puri' } }));
await check('SuperAdmin deletes an added location', 'allow', () => deleteDoc(doc(superAdmin, 'locations/Nashik')));
await check('check-in at the deleted location', 'deny', () =>
  checkIn(as('uid_loc6', 'f@pridehotel.com'), 'uid_loc6', 'loc_gone', { visit: { location: 'Nashik' } }));
await check('plain admin adds a location', 'deny', () => loc(allPeopleAdmin, 'Surat'));
await check('salesperson adds a location', 'deny', () => loc(priya, 'Surat'));
await check('location with impossible coordinates', 'deny', () => loc(superAdmin, 'Surat', { lat: 500, lng: 72 }));
await check('location with an extra field', 'deny', () => loc(superAdmin, 'Surat', { owner: 'me' }));
await check('location name with a trailing space', 'deny', () => loc(superAdmin, 'Surat '));
await check('location name with odd characters', 'deny', () => loc(superAdmin, 'Surat<script>'));

// ---- remembered company names ------------------------------------------------
section = 'company name list';
const companies = (db, uid, data = {}) =>
  setDoc(doc(db, 'companies', uid), { names: ['Blue Orchid Events'], updatedAt: serverTimestamp(), ...data });
await check('saving your own company list', 'allow', () => companies(priya, 'uid_priya'));
await check('reading your own company list', 'allow', () => getDoc(doc(priya, 'companies/uid_priya')));
await check("reading a colleague's company list", 'deny', () => getDoc(doc(rajul, 'companies/uid_priya')));
await check("an Admin reading a salesperson's company list", 'deny', () => getDoc(doc(teamLead, 'companies/uid_priya')));
await check("writing a colleague's company list", 'deny', () => companies(rajul, 'uid_priya'));
await check('company list that is not a list', 'deny', () => companies(priya, 'uid_priya', { names: 'x' }));
await check('company list with an extra field', 'deny', () => companies(priya, 'uid_priya', { role: 'admin' }));

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
await check('team lead closes a stale visit of an assigned salesperson', 'allow', () =>
  managerClose(teamLead, 'stale_goa', 'team.lead@pridehotel.com'));
await check('team lead closes a visit open only 2 hours', 'deny', () =>
  managerClose(teamLead, 'fresh_goa', 'team.lead@pridehotel.com'));
await check("team lead closes an unassigned person's stale visit", 'deny', () =>
  managerClose(teamLead, 'stale_indore', 'team.lead@pridehotel.com'));
await check("manager close signed with someone else's email", 'deny', () =>
  managerClose(allPeopleAdmin, 'stale_indore', 'mis3@pridehotel.com'));
await check('manager close that also edits the company', 'deny', () =>
  managerClose(allPeopleAdmin, 'stale_indore', 'national@pridehotel.com', { companyName: 'X' }));
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
await check('plain admin upgrades an old record', 'deny', () => backfill(allPeopleAdmin, 'legacy_closed3'));
await check('salesperson upgrades their own old record', 'deny', () => backfill(meera, 'legacy_closed3'));
await check('admin reads the migration status', 'allow', () => getDoc(doc(teamLead, 'meta/migrations')));
await check('salesperson reads the migration status', 'deny', () => getDoc(doc(priya, 'meta/migrations')));
await check('SuperAdmin records the migration as done', 'allow', () =>
  setDoc(doc(superAdmin, 'meta/migrations'), { timestampsBackfilled: true }));
await check('plain admin records the migration as done', 'deny', () =>
  setDoc(doc(allPeopleAdmin, 'meta/migrations'), { timestampsBackfilled: true }));

// ---- history is permanent --------------------------------------------------
section = 'audit trail';
await check('nobody can delete visit history (owner)', 'deny', () => deleteDoc(doc(priya, 'check-ins/r_goa')));
await check('nobody can delete visit history (SuperAdmin)', 'deny', () => deleteDoc(doc(superAdmin, 'check-ins/r_goa')));

// ---- role management -------------------------------------------------------
section = 'roles';
await check('SuperAdmin lists roles', 'allow', () => getDocs(collection(superAdmin, 'admins')));
await check('plain admin lists roles', 'deny', () => getDocs(collection(teamLead, 'admins')));
await check('anyone reads own role', 'allow', () => getDoc(doc(teamLead, 'admins/team.lead@pridehotel.com')));
await check('SuperAdmin grants a role', 'allow', () =>
  setDoc(doc(superAdmin, 'admins/new@prideresorts.in'), { role: 'admin', salespeople: ['uid_amit'] }));
await check('SuperAdmin grants an "all salespeople" Admin', 'allow', () =>
  setDoc(doc(superAdmin, 'admins/all@prideresorts.in'), { role: 'admin', allSalespeople: true }));
await check('role saved with the old location field', 'deny', () =>
  setDoc(doc(superAdmin, 'admins/old@prideresorts.in'), { role: 'admin', locations: ['Goa'] }));
await check('role with a non-list of salespeople', 'deny', () =>
  setDoc(doc(superAdmin, 'admins/odd@prideresorts.in'), { role: 'admin', salespeople: 'uid_amit' }));
await check('plain admin promotes themselves', 'deny', () =>
  setDoc(doc(teamLead, 'admins/team.lead@pridehotel.com'), { role: 'superadmin' }));
await check('plain admin assigns themselves more salespeople', 'deny', () =>
  setDoc(doc(teamLead, 'admins/team.lead@pridehotel.com'), {
    role: 'admin', salespeople: ['uid_priya', 'uid_neha', 'uid_ravi', 'uid_rajul'],
  }));
await check('SuperAdmin demotes themselves (lockout guard)', 'deny', () =>
  setDoc(doc(superAdmin, 'admins/mis3@pridehotel.com'), { role: 'admin', allSalespeople: true }));
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
