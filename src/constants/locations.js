/**
 * Pride Hotels & Resorts properties a sales visit can be logged against.
 *
 * This is the single source of truth for the check-in dropdown and for the
 * per-location permissions a SuperAdmin grants to an Admin, so the two can
 * never drift apart.
 *
 * firestore.rules keeps its own copy in `isKnownLocation()` (rules cannot
 * import from the app). Add or rename a location in both places, then
 * republish the rules — otherwise check-ins at the new location are refused.
 */
export const LOCATIONS = [
  'Alkapuri',
  'Ambaji',
  'Becharaji',
  'Bharuch',
  'Bhopal',
  'Canopus',
  'Daman',
  'Deoghar',
  'Digha',
  'Dwarka',
  'Goa',
  'Haldwani',
  'Haridwar',
  'Indore',
  'Jaipur',
  'Manjusar',
  'Mussoorie',
  'Phaltan',
  'Puri',
  'Rajkot',
  'Ranakpur',
  'Udaipur',
];
