import { useCallback, useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase.js';

export const ROLE_SUPERADMIN = 'superadmin';
export const ROLE_ADMIN = 'admin';

/**
 * Resolves the signed-in user's management role and location scope.
 *
 * Roles live in the `admins` collection, one document per person keyed by
 * lower-cased email:
 *
 *   { role: 'superadmin' }                          -> every location, may manage roles
 *   { role: 'admin', locations: ['Goa', 'Indore'] } -> those locations only
 *   { role: 'admin', locations: [] }                -> every location
 *
 * An empty or missing `locations` array means "all locations", which keeps
 * admins created before location scoping existed working unchanged.
 */
export function useAdminAccess(user) {
  const email = user?.email ? user.email.toLowerCase() : null;

  // `result.email` records which account the verdict belongs to. Deriving
  // `checking` from it (rather than storing a flag) means a freshly signed-in
  // user reads as "still checking" on the very first render, before the effect
  // has had a chance to run — otherwise a guarded route would see a stale
  // verdict for one render and redirect the user away.
  const [result, setResult] = useState({ email: undefined, role: null, locations: [] });

  const load = useCallback(async () => {
    if (!email) return { email: null, role: null, locations: [] };

    try {
      const snapshot = await getDoc(doc(db, 'admins', email));
      if (!snapshot.exists()) return { email, role: null, locations: [] };

      const data = snapshot.data() ?? {};
      return {
        email,
        // Documents created before roles existed are plain admins.
        role: data.role === ROLE_SUPERADMIN ? ROLE_SUPERADMIN : ROLE_ADMIN,
        locations: Array.isArray(data.locations) ? data.locations : [],
      };
    } catch (error) {
      // A denied read simply means "no management role" — log, don't surface.
      console.error('Role lookup failed:', error);
      return { email, role: null, locations: [] };
    }
  }, [email]);

  useEffect(() => {
    let cancelled = false;
    load().then((next) => {
      if (!cancelled) setResult(next);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const settled = result.email === email;
  const role = settled ? result.role : null;
  const locations = settled ? result.locations : [];
  const isSuperAdmin = role === ROLE_SUPERADMIN;

  return {
    role,
    locations,
    isAdmin: role === ROLE_ADMIN || isSuperAdmin,
    isSuperAdmin,
    // SuperAdmins are never location-scoped; an admin with no explicit list
    // sees everything.
    hasAllLocations: isSuperAdmin || (role === ROLE_ADMIN && locations.length === 0),
    checking: !settled,
  };
}
