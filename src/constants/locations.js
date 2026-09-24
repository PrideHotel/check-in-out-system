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

/**
 * Approximate centre of each location, used only to flag a visit whose GPS
 * reading is far outside the city it was logged against.
 *
 * These are city-level coordinates, not the hotels themselves: a salesperson
 * visits clients across the city, so `radiusKm` is deliberately generous.
 * A location set to `null` is never flagged — fill it in once its position is
 * confirmed. Adjust any radius that produces false alarms.
 */
export const LOCATION_COORDS = {
  Alkapuri: { lat: 22.3106, lng: 73.1694, radiusKm: 40 }, // Vadodara
  Ambaji: { lat: 24.3330, lng: 72.8500, radiusKm: 40 },
  Becharaji: { lat: 23.4960, lng: 72.0430, radiusKm: 40 },
  Bharuch: { lat: 21.7051, lng: 72.9959, radiusKm: 40 },
  Bhopal: { lat: 23.2599, lng: 77.4126, radiusKm: 40 },
  Canopus: null, // position not confirmed
  Daman: { lat: 20.4140, lng: 72.8328, radiusKm: 40 },
  Deoghar: { lat: 24.4820, lng: 86.6960, radiusKm: 40 },
  Digha: { lat: 21.6270, lng: 87.5090, radiusKm: 40 },
  Dwarka: { lat: 22.2394, lng: 68.9678, radiusKm: 40 }, // Dwarka, Gujarat
  Goa: { lat: 15.4909, lng: 73.8278, radiusKm: 80 }, // the whole state
  Haldwani: { lat: 29.2183, lng: 79.5130, radiusKm: 40 },
  Haridwar: { lat: 29.9457, lng: 78.1642, radiusKm: 40 },
  Indore: { lat: 22.7196, lng: 75.8577, radiusKm: 40 },
  Jaipur: { lat: 26.9124, lng: 75.7873, radiusKm: 40 },
  Manjusar: { lat: 22.4420, lng: 73.1500, radiusKm: 40 }, // near Vadodara
  Mussoorie: { lat: 30.4598, lng: 78.0664, radiusKm: 40 },
  Phaltan: { lat: 17.9918, lng: 74.4318, radiusKm: 40 },
  Puri: { lat: 19.8135, lng: 85.8312, radiusKm: 40 },
  Rajkot: { lat: 22.3039, lng: 70.8022, radiusKm: 40 },
  Ranakpur: { lat: 25.1160, lng: 73.4730, radiusKm: 40 },
  Udaipur: { lat: 24.5854, lng: 73.7125, radiusKm: 40 },
};
