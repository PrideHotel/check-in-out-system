// Company names a salesperson has used before, offered as suggestions while
// they type so the same client is always spelt the same way.
//
// The list is each person's own (`companies/{uid}`), never shared: anyone can
// create an account, so a common list would hand every client name to anyone
// who signs up.

import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase.js';

const MAX_NAMES = 5000;

/** Tidies what was typed: trimmed, with runs of spaces collapsed. */
export const cleanCompanyName = (name) => String(name ?? '').replace(/\s+/g, ' ').trim();

/**
 * What two spellings are compared by: letter case, spacing and full stops /
 * commas are ignored, so "Tata Motors Pvt. Ltd." and "tata motors pvt ltd"
 * count as the same company.
 */
export const companyKey = (name) =>
  cleanCompanyName(name)
    .toLowerCase()
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** The spelling already on file for this company, or null if it is new. */
export function matchCompany(names, typed) {
  const key = companyKey(typed);
  if (!key) return null;
  return names.find((name) => companyKey(name) === key) ?? null;
}

/** Up to `limit` saved names matching what is typed; "starts with" first. */
export function suggestCompanies(names, typed, limit = 8) {
  const key = companyKey(typed);
  if (!key) return [];
  const starts = [];
  const contains = [];
  names.forEach((name) => {
    const candidate = companyKey(name);
    if (candidate.startsWith(key)) starts.push(name);
    else if (candidate.includes(key)) contains.push(name);
  });
  const byName = (a, b) => a.localeCompare(b);
  return [...starts.sort(byName), ...contains.sort(byName)].slice(0, limit);
}

function dedupe(names) {
  const seen = new Set();
  const result = [];
  names.forEach((raw) => {
    const name = cleanCompanyName(raw);
    const key = companyKey(name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(name);
  });
  return result;
}

async function namesFromOwnVisits(uid) {
  const visits = await getDocs(query(collection(db, 'check-ins'), where('userId', '==', uid)));
  return dedupe(visits.docs.map((d) => d.data()?.companyName));
}

/**
 * The person's saved company names. The first time, the list is built from
 * their own past visits and saved. Never throws: with no list available the
 * company field simply works as plain typing.
 */
export async function loadCompanyNames(uid) {
  if (!uid) return [];
  const ref = doc(db, 'companies', uid);
  try {
    const saved = await getDoc(ref);
    if (saved.exists() && Array.isArray(saved.data()?.names)) return dedupe(saved.data().names);
  } catch (error) {
    // Most likely the rules for this list are not published yet.
    console.warn('Could not read the saved company names:', error);
  }

  try {
    const names = (await namesFromOwnVisits(uid)).slice(0, MAX_NAMES);
    setDoc(ref, { names, updatedAt: serverTimestamp() }).catch((error) =>
      console.warn('Could not save the company names:', error)
    );
    return names;
  } catch (error) {
    console.warn('Could not build company names from past visits:', error);
    return [];
  }
}

/** Adds a name to the person's list. Best-effort; a failure affects nothing else. */
export function rememberCompany(uid, name) {
  const cleaned = cleanCompanyName(name);
  if (!uid || !cleaned) return Promise.resolve();
  return setDoc(
    doc(db, 'companies', uid),
    { names: arrayUnion(cleaned), updatedAt: serverTimestamp() },
    { merge: true }
  ).catch((error) => console.warn('Could not remember the company name:', error));
}
