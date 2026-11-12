import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase.js';

/**
 * Keeps each person's name and email in `users/{uid}`, so a SuperAdmin can
 * pick salespeople by name when assigning them to an Admin.
 *
 * The name is only written when there is one. Right after an email sign-up
 * the account exists for a moment before its name is set, and writing an empty
 * name then would leave the person nameless in the Roles screen (or wipe a
 * name saved earlier).
 *
 * Best-effort: a failure here affects nothing else.
 */
export function saveUserProfile(user, name = user?.displayName) {
  if (!user?.uid) return Promise.resolve();
  const cleaned = String(name ?? '').trim();
  return setDoc(
    doc(db, 'users', user.uid),
    {
      email: user.email || '',
      lastSeenAt: serverTimestamp(),
      ...(cleaned ? { name: cleaned } : {}),
    },
    { merge: true }
  ).catch((error) => console.warn('Could not save the user profile:', error));
}
