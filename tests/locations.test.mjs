// Cross-checks the values that live in BOTH the app and firestore.rules, since
// rules cannot import app code and the two can silently drift apart.
//
//   npm run test:locations

import fs from 'node:fs';
import { LOCATIONS, LOCATION_COORDS } from '../src/constants/locations.js';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const rules = read('../firestore.rules');

// visits.js imports without file extensions (Vite resolves them, plain Node
// does not), so read this one constant from the source text instead.
const FORGOTTEN_AFTER_HOURS = Number(
  read('../src/utils/visits.js').match(/export const FORGOTTEN_AFTER_HOURS = (\d+)/)?.[1]
);

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

// The location list the rules enforce on every new check-in.
const block = rules.match(/function isKnownLocation[\s\S]*?\[([\s\S]*?)\]/)?.[1] ?? '';
const rulesLocations = [...block.matchAll(/'([^']+)'/g)].map((match) => match[1]);

check(
  'rules list the same locations as the app, in the same order',
  JSON.stringify(rulesLocations) === JSON.stringify(LOCATIONS),
  `app ${LOCATIONS.length}, rules ${rulesLocations.length}`
);
const missingFromRules = LOCATIONS.filter((name) => !rulesLocations.includes(name));
const missingFromApp = rulesLocations.filter((name) => !LOCATIONS.includes(name));
if (missingFromRules.length) console.log(`      in the app but not the rules: ${missingFromRules.join(', ')}`);
if (missingFromApp.length) console.log(`      in the rules but not the app: ${missingFromApp.join(', ')}`);

check('no location is listed twice', new Set(LOCATIONS).size === LOCATIONS.length);

// Every location needs a reference point for the distance flag.
const withoutCoords = LOCATIONS.filter((name) => !LOCATION_COORDS[name]);
check('every location has reference coordinates', withoutCoords.length === 0, withoutCoords.join(', '));

const strayCoords = Object.keys(LOCATION_COORDS).filter((name) => !LOCATIONS.includes(name));
check('no coordinates for a location that does not exist', strayCoords.length === 0, strayCoords.join(', '));

const badCoords = LOCATIONS.filter((name) => {
  const point = LOCATION_COORDS[name];
  return (
    point &&
    !(point.lat >= 6 && point.lat <= 38 && point.lng >= 68 && point.lng <= 98 && point.radiusKm > 0)
  );
});
check('coordinates fall inside India, with a positive radius', badCoords.length === 0, badCoords.join(', '));

// How long a visit may stay open before a manager can close it.
const hoursInRules = Number(rules.match(/duration\.value\((\d+), 'h'\)/)?.[1]);
check(
  'forgotten-visit threshold matches (FORGOTTEN_AFTER_HOURS vs forgottenAfter())',
  hoursInRules === FORGOTTEN_AFTER_HOURS,
  `app ${FORGOTTEN_AFTER_HOURS}h, rules ${hoursInRules}h`
);

console.log(failures ? `\n${failures} check(s) failed` : '\nall shared values agree');
process.exit(failures ? 1 : 0);
