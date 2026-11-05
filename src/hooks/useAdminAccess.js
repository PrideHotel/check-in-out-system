import { useCallback, useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase.js';

export const ROLE_SUPERADMIN = 'superadmin';
export const ROLE_ADMIN = 'admin';

/** Reads a role document's salesperson assignment, whatever its age. */
export function readAssignment(data = {}) {
  return {
    salespeople: Array.isArray(data.salespeople) ? data.salespeople : [],
    allSalespeople: data.allSalespeople === true,
    // From when access was by location. It grants nothing now; it is only
    // read so the Roles screen can point out who needs reassigning.
    legacyLocations: Array.isArray(data.locations) ? data.locations : null,
  };
}

/**
 * Resolves the signed-in user's management role and which salespeople they
 * may see.
 *
 * Roles live in the `admins` collection, one document per person keyed by
 * lower-cased email:
 *
 *   { role: 'superadmin' }                           -> everyone, may manage roles
 *   { role: 'admin', salespeople: ['uid1', 'uid2'] } -> those salespeople only
 *   { role: 'admin', allSalespeople: true }          -> every salesperson
 *
 * Access is by person, at any location. An Admin with neither field sees
 * nobody — the security rules enforce the same.
 */
export function useAdminAccess(user) {
  const email = user?.email ? user.email.toLowerCase() : null;

  // `result.email` records which account the verdict belongs to. Deriving
  // `checking` from it (rather than storing a flag) means a freshly signed-in
  // user reads as "still checking" on the very first render, before the effect
  // has had a chance to run — otherwise a guarded route would see a stale
  // verdict for one render and redirect the user away.
  const [result, setResult] = useState({ email: undefined, role: null, ...readAssignment() });

  const load = useCallback(async () => {
    if (!email) return { email: null, role: null, ...readAssignment() };

    try {
      const snapshot = await getDoc(doc(db, 'admins', email));
      if (!snapshot.exists()) return { email, role: null, ...readAssignment() };

      const data = snapshot.data() ?? {};
      return {
        email,
        // Documents created before roles existed are plain admins.
        role: data.role === ROLE_SUPERADMIN ? ROLE_SUPERADMIN : ROLE_ADMIN,
        ...readAssignment(data),
      };
    } catch (error) {
      // A denied read simply means "no management role" — log, don't surface.
      console.error('Role lookup failed:', error);
      return { email, role: null, ...readAssignment() };
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
  const isSuperAdmin = role === ROLE_SUPERADMIN;
  const isAdmin = role === ROLE_ADMIN || isSuperAdmin;

  return {
    role,
    isAdmin,
    isSuperAdmin,
    // SuperAdmins always see everyone; an Admin only if granted it explicitly.
    hasAllSalespeople: isSuperAdmin || (isAdmin && settled && result.allSalespeople),
    salespeople: settled && isAdmin ? result.salespeople : [],
    checking: !settled,
  };
}
