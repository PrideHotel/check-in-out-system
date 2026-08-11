import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase.js';

/**
 * Resolves whether the signed-in user is an administrator.
 *
 * Admins are listed in the `admins` Firestore collection, one document per
 * person, keyed by their lower-cased email address. Adding or removing an
 * admin is therefore a console edit — no code change or redeploy.
 */
export function useIsAdmin(user) {
  const email = user?.email ? user.email.toLowerCase() : null;

  // `result.email` records which account the verdict belongs to. Deriving
  // `checking` from it (rather than storing a flag) means a freshly signed-in
  // user reads as "still checking" on the very first render, before the effect
  // has had a chance to run — otherwise a guarded route would see
  // `isAdmin === false` for one render and redirect away.
  const [result, setResult] = useState({ email: undefined, isAdmin: false });

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (!email) {
        if (!cancelled) setResult({ email: null, isAdmin: false });
        return;
      }

      try {
        const snapshot = await getDoc(doc(db, 'admins', email));
        if (!cancelled) setResult({ email, isAdmin: snapshot.exists() });
      } catch (error) {
        // A denied read simply means "not an admin" — log it, don't surface it.
        console.error('Admin check failed:', error);
        if (!cancelled) setResult({ email, isAdmin: false });
      }
    };

    check();

    return () => {
      cancelled = true;
    };
  }, [email]);

  return {
    isAdmin: result.email === email && result.isAdmin,
    checking: result.email !== email,
  };
}
