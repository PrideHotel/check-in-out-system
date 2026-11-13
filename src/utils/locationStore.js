// The list of locations a visit can be logged against.
//
// Two sources, merged:
//   - the built-in list in src/constants/locations.js, which needs no setup;
//   - the `locations` collection, where a SuperAdmin adds new locations, moves
//     a reference point or hides one, from the Roles screen.
//
// A document in the collection always wins over the built-in entry of the same
// name. If the collection cannot be read (offline, or the rules are not
// published yet) the built-in list is used on its own, so checking in keeps
// working.

import { useEffect, useSyncExternalStore } from 'react';
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase.js';
import { LOCATIONS, LOCATION_COORDS } from '../constants/locations';

export const DEFAULT_RADIUS_KM = 40;

// Keep in step with isValidLocationName() in firestore.rules.
export const LOCATION_NAME_PATTERN = /^[A-Za-z0-9][-A-Za-z0-9 .&()]{0,39}$/;

export function isValidLocationName(name) {
  return typeof name === 'string' && LOCATION_NAME_PATTERN.test(name) && !name.endsWith(' ');
}

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

let overrides = new Map(); // name -> document data
let snapshot = build();
let loading = null;
const listeners = new Set();

function build(loaded = false, error = null) {
  const names = new Set([...LOCATIONS, ...overrides.keys()]);
  const all = [...names]
    .map((name) => {
      const saved = overrides.get(name);
      const builtIn = LOCATION_COORDS[name];
      const hasOwnPoint = isNumber(saved?.lat) && isNumber(saved?.lng);
      const point = hasOwnPoint
        ? { lat: saved.lat, lng: saved.lng, radiusKm: isNumber(saved.radiusKm) ? saved.radiusKm : builtIn?.radiusKm ?? DEFAULT_RADIUS_KM }
        : builtIn
          ? { ...builtIn, radiusKm: isNumber(saved?.radiusKm) ? saved.radiusKm : builtIn.radiusKm }
          : null;
      return {
        name,
        builtIn: LOCATIONS.includes(name),
        changed: Boolean(saved),
        active: saved ? saved.active !== false : true,
        point,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    all,
    names: all.filter((location) => location.active).map((location) => location.name),
    byName: new Map(all.map((location) => [location.name, location])),
    loaded,
    error,
  };
}

function publish(loaded, error) {
  snapshot = build(loaded, error);
  listeners.forEach((listener) => listener());
}

/** Reads the collection. Safe to call often: concurrent calls share one read. */
export function loadLocations({ force = false } = {}) {
  if (loading) return loading;
  if (snapshot.loaded && !force) return Promise.resolve(snapshot);
  loading = getDocs(collection(db, 'locations'))
    .then((result) => {
      overrides = new Map(result.docs.map((d) => [d.id, d.data() ?? {}]));
      publish(true, null);
    })
    .catch((error) => {
      console.warn('Could not load the locations list; using the built-in one.', error);
      publish(true, error);
    })
    .then(() => {
      loading = null;
      return snapshot;
    });
  return loading;
}

/** Forget what was loaded (used on sign-out, so the next person reads afresh). */
export function resetLocations() {
  overrides = new Map();
  publish(false, null);
}

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getSnapshot = () => snapshot;

/**
 * `{ names, all, byName, loaded, error }` — `names` are the locations a
 * salesperson may pick; `all` also includes hidden ones.
 */
export function useLocations() {
  const value = useSyncExternalStore(subscribe, getSnapshot);
  useEffect(() => {
    loadLocations();
  }, []);
  return value;
}

/** Reference point `{ lat, lng, radiusKm }` for the distance flag, or null. */
export function getLocationCoords(name) {
  return snapshot.byName.get(name)?.point ?? null;
}

/**
 * Saves a location. `point` is `{ lat, lng, radiusKm }` or null to keep the
 * built-in reference point (or none, for a location added from the app).
 */
export async function saveLocation(name, { active = true, point = null } = {}) {
  const data = { active, updatedAt: serverTimestamp() };
  if (point) {
    data.lat = point.lat;
    data.lng = point.lng;
    data.radiusKm = point.radiusKm;
  }
  await setDoc(doc(db, 'locations', name), data);
  overrides.set(name, { ...data, updatedAt: null });
  publish(true, null);
}

/**
 * Removes the saved document: a location added from the app disappears, a
 * built-in one goes back to how it ships.
 */
export async function removeLocation(name) {
  await deleteDoc(doc(db, 'locations', name));
  overrides.delete(name);
  publish(true, null);
}
