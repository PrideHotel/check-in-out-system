# Pride Hotels & Resorts — Sales Check In/Out

A React + Vite web app that lets the sales team record field visits. Each check-in
and check-out captures the device location (reverse-geocoded to a readable address)
alongside the company visited, and every user can review their own visit history.

## Stack

- **React 18** + **Vite 6**
- **Tailwind CSS 3** for styling, with the Pride brand palette (maroon `#71302d`,
  gold `#be863c`) defined in `tailwind.config.js`
- **Firebase** Authentication + Firestore
- **lucide-react** for icons

## Getting started

```bash
npm install
npm run dev      # start the dev server
npm run build    # production build into dist/
npm run preview  # preview the production build
npm run lint     # eslint
```

Firebase credentials live in `src/firebase.js`.

## Deployment

The app is a single-page app using `BrowserRouter`, so routes like `/login`,
`/history` and `/admin` exist only in the browser — the build produces just
`index.html`, `/assets/*` and `/pride-logo.png`. A static host asked directly
for `/login` would return its own 404 before React ever runs.

[`vercel.json`](./vercel.json) fixes this by rewriting every path that is not a
real file to `/index.html`, letting the router resolve it. Vercel checks the
filesystem before applying rewrites, so assets are still served normally. Any
other host needs the same fallback (Netlify: `/* /index.html 200`; nginx:
`try_files $uri /index.html`).

## Sign-in

Two providers are supported, both enabled under Firebase → Authentication →
**Sign-in method**:

- **Email/Password** — with sign-up and a password-reset link.
- **Google** — "Continue with Google", which works for both new and returning
  users. It tries a popup first and falls back to a full-page redirect when the
  popup is blocked, which is common in mobile browsers and in-app webviews.

### Authorized domains

Google sign-in only runs on domains listed under Firebase → Authentication →
**Settings** → **Authorized domains**. Firebase pre-authorises `localhost`,
`<project>.firebaseapp.com` and `<project>.web.app`, but **not** custom or
Vercel hosts — add `check-in-out-system.vercel.app` (and any custom domain)
there, or Google sign-in fails with `auth/unauthorized-domain`. The login screen
names that exact fix on screen if it happens.

Google accounts arrive with a `displayName`, so the read-only **Sales person**
field on the check-in form fills itself in. Admin access is matched on email
address, so it behaves identically for both providers.

## Getting the data out

Every salesperson sees only their own visits on **History**. Managers and MIS
get the team's data on the **Team Data** screen (`/admin`):

- **Period** — Today, Last 7 days, Last 30 days (the default), This month, Last
  month, All time, or any custom range. The range is applied by Firestore, so
  only visits in it are read — this keeps the free Spark plan's 50,000 reads a
  day from running out as history grows. *All time* reads everything.
- Search, a per-person filter and a location filter.
- **Only visits that need attention** — see [Flags](#flags) below.
- **Export Excel** of exactly the rows on screen, with server times, flags, GPS
  coordinates and map links — see [Excel exports](#excel-exports) below.

### Excel exports

Both **History** and **Team Data** download a real `.xlsx` file:

- **Dates are real Excel dates** (shown as `dd-mm-yyyy hh:mm`), so they sort
  and filter correctly, in the same local time the app shows.
- **Map columns are clickable** "Open map" links to Google Maps.
- Numbers (distance, clock difference) are numbers, so they can be summed and
  sorted.
- The header row is frozen and bold.
- Text is always stored as text, so a company name that starts with `=` can
  never run as a formula.
- For a late check-out, *Check-Out* is the time the salesperson reported
  leaving, and *Status* says so.

A salesperson's History export has: Company, Location, Check-In, Check-Out,
Duration, Status, Check-In Address, Check-In Map, Check-Out Address and
Check-Out Map. Team Data adds the person, email, flags, distance, clock
difference, who closed it, and the raw GPS coordinates.

The `.xlsx` is written in the browser by
[`write-excel-file`](https://www.npmjs.com/package/write-excel-file)
(`src/utils/excel.js`), which is loaded only when someone exports. Two details
of it are handled there: it converts dates as UTC (corrected, or Indian times
would appear 5½ hours early), and formulas must not start with `=`.

### Flags

Team Data highlights visits a manager should look at:

| Flag | Meaning |
|---|---|
| **Open 12h — not checked out** | Still open after 10 hours (`FORGOTTEN_AFTER_HOURS`). A manager can press **Close visit**. |
| **832 km from Goa** | A GPS reading was outside the radius set for that location in `LOCATION_COORDS`. |
| **Phone clock 120 min behind** | The phone's clock disagreed with the server by 10+ minutes at check-in — a wrong setting, or an attempt to backdate. |
| **Check-out time reported later** | The salesperson forgot to check out and reported when they left. |
| **Closed by …** | A manager closed a forgotten visit. |

### Roles

There are three levels, all keyed off the signed-in email address:

| Role | Sees | Can manage roles |
|---|---|---|
| Salesperson (no role document) | Only their own visits, on **History** | No |
| **Admin** | **Team Data** for the salespeople assigned to them — every visit, at any location | No |
| **SuperAdmin** | **Team Data** for everyone | Yes — the **Manage** screen |

**Access is by person, not location.** On the **Manage → Roles & access** screen a SuperAdmin
picks an Admin's salespeople by name (searchable by name, email or ID), or
chooses **All salespeople**. The Admin then sees all of those people's visits,
wherever they happen.

Roles live in the `admins` collection, one document per person whose **ID is
their lower-cased email address**. Salespeople are stored by their Firebase
user ID (the `userId` on every check-in):

```jsonc
// admins/mis3@pridehotel.com
{ "role": "superadmin" }

// admins/team.lead@pridehotel.com — two salespeople, at any location
{ "role": "admin", "salespeople": ["Q8xrSpHcBTFo…", "LkTBDKexQmIo…"] }

// admins/national@pridehotel.com — every salesperson
{ "role": "admin", "allSalespeople": true }
```

An Admin with neither field sees **nobody** — nothing is assumed. That includes
Admins set up under the old location-based access (`"locations": [...]`): the
Roles screen flags them as *Needs reassigning*, and saving them replaces the old
field.

**Who appears in the picker.** The app saves each person's name and email to
`users/{uid}` whenever they sign in; anyone who has checked in before is listed
too. Someone who has never signed in won't appear until they do.

### First-time setup

Two one-time steps in the Firebase console — after this, roles are managed
inside the app:

1. **Publish the security rules.** Firestore Database → **Rules** → replace the
   contents with [`firestore.rules`](./firestore.rules) → **Publish**.
2. **Create the first SuperAdmin.** Firestore Database → **Data** → collection
   `admins` → document ID `mis3@pridehotel.com`, with a field `role` (string)
   set to `superadmin`.

From then on, a SuperAdmin adds and edits everyone else on the **Manage** screen.

### How access is enforced

The rules — not the UI — decide what a manager can read. An Admin's read is
rejected for any record whose `userId` isn't one of their salespeople, so the
app sends a `where('userId', 'in', [...])` query matching the assignment.
Editing the request in the browser cannot widen it: asking for everything, or
for someone else, fails the whole read. An Admin can also read the `users`
profile of only their own salespeople, and only a SuperAdmin can list everyone.

A SuperAdmin cannot change or delete **their own** role document, in the app or
through the rules. That stops the last SuperAdmin locking everyone out of role
management; use the Firebase console if you ever need to.

## How a visit is recorded

**Times come from the server, not the phone.** `checkInAt` and `checkOutAt` are
Firestore server timestamps, and the rules refuse any other value, so changing
the phone's clock cannot backdate a visit. The older text fields
(`checkInTime`, `checkOutTime`) are still written from the phone's clock; the
app only uses them to spot a wrong clock and to read records made before this
change. `checkOutTime` being empty is still what marks a visit as open.

**One open visit per person.** Checking in writes the visit and a lock document
`active/{uid}` in one transaction, and the rules refuse a visit whose lock was
not taken alongside it. Two taps or two devices at the same moment produce one
visit, and the other device is told it already has one. Checking out deletes
the lock. A lock left behind by a visit a manager closed is taken over on the
next check-in.

**GPS is always kept.** `checkInCoords` / `checkOutCoords` hold
`{ lat, lng, accuracy }`. The address is looked up from the public Nominatim
service, with an 8-second timeout; if that fails the address is left blank and
the coordinates are still there, with a map link in Team Data.

A precise GPS fix is tried first (15 seconds). If that times out — common
indoors — a quicker network-based position (Wi-Fi / mobile towers) is accepted
instead; its accuracy is stored, and a reading vaguer than 2 km is never used
to flag a visit. A refused permission and "no signal" give different messages,
each saying what to do.

**Locations.** The built-in list and its reference points are in
`src/constants/locations.js` (approximate city centres with a generous radius,
since salespeople visit clients across the city). A SuperAdmin can add a
location, set or move its reference point, hide it or delete it on
**Manage → Locations** — no code change or release needed. Those changes are
documents in the `locations` collection (`{ active, lat?, lng?, radiusKm? }`,
ID = the name) and take priority over the built-in entry of the same name; the
rules check a new visit against the same combination. A name cannot be
renamed, because past visits carry it: hide the old one and add a new one. A
location with no reference point is never distance-flagged.

**Company names.** While typing the company, the salesperson is offered names
from their own earlier visits, and a name typed with different capitals,
spacing or full stops is saved in the spelling already on file. New names can
always be typed. The list is each person's own (`companies/{uid}`, built from
their past visits the first time) and is not shared, because anyone can create
an account.

**Forgotten check-outs.** After 10 hours the check-in screen asks whether the
person forgot. They can check out now, or say when they actually left: that is
stored as `reportedCheckOutAt` with `lateCheckout: true`, alongside the real
closing time, and no GPS is taken. A manager can also close a visit that has
been open for 10+ hours by one of their salespeople; it is signed with
`closedBy`. The 10 hours is enforced by the rules as well
(`forgottenAfter()`), so keep the two values in step.

## Releasing an update that changes the rules

The app and `firestore.rules` depend on each other, so publish them together:

1. Merge to `main`; wait for Vercel to finish deploying (about a minute).
2. **Immediately** publish `firestore.rules` in the Firebase console.
3. Anyone with the app already open sees a **"A new version of the app is
   available — Refresh now"** bar within a few minutes (it checks when the tab
   regains focus, and every 15 minutes). Tabs opened before this feature
   existed need one manual refresh.

**Old versions in a browser.** A single-page app keeps running the version it
loaded until the page is reloaded, so an old tab can show old buttons. The
refresh bar fixes that from now on. Vercel *preview* links (the per-PR
addresses) are frozen at the version they were built from forever, so share and
bookmark only `https://check-in-out-system.vercel.app`.

Between steps 1 and 2 check-ins fail, so do them back to back, ideally outside
working hours.

**Composite index.** An Admin assigned specific salespeople needs one index,
defined in [`firestore.indexes.json`](./firestore.indexes.json) (`check-ins`:
`userId` ascending, `checkInAt` descending). Create it under Firestore →
**Indexes** → **Add index**, or just open Team Data as such an Admin: the screen
shows a **Create the index** button linking to the pre-filled form. It takes a
few minutes to build. The older `location` + `checkInAt` index is no longer used
and can be deleted.

**Upgrading older visits (once).** Visits recorded before server timestamps
have no `checkInAt`, so date ranges miss them (*All time* still shows them).
A SuperAdmin sees an **Upgrade older visits** button on Team Data. It reads
every visit once and copies the old text times into `checkInAt` / `checkOutAt`.
It is safe to repeat, and continues where it left off if interrupted. Run it
from a device set to Indian time, since the old text is read as local time. On
the Spark plan it can upgrade up to about 20,000 visits a day (the daily write
limit).

## Testing

```bash
npm test               # both checks below
npm run test:rules     # 76 security-rules cases against the Firestore emulator
npm run test:locations # the app and the rules agree on shared values
```

**Run `npm run test:rules` before publishing any change to `firestore.rules`.**
The rules are the only thing standing between a salesperson's phone and the
database, and a broken rule fails silently: the app still works, it just lets
something through. Each case is marked allow or deny; the deny cases are the
ones that matter (backdating a visit, reading a colleague's data, promoting
yourself to admin, an Admin reading a salesperson not assigned to them).

- Needs **Java 11+** installed. The first run downloads the Firestore emulator
  (about 60 MB) through a pinned `npx firebase-tools`; nothing is installed
  into the project, so Vercel builds stay fast.
- Runs entirely locally. It never touches your real Firebase project.
- `test:locations` catches the easy mistake of adding a location to the app
  but not to the rules (or the reverse), which would make check-ins at the new
  location get refused. It also checks every location has reference
  coordinates and that the 10-hour forgotten-visit threshold matches in both
  places.

When you change a rule, add or adjust a case in `tests/rules/rules.test.mjs`
in the same commit.

## Project structure

```
src/
  App.jsx                    app shell, routing, auth session
  firebase.js                Firebase initialisation
  index.css                  Tailwind layers + shared component classes
  components/
    Header.jsx               sticky navigation bar
    Login.jsx                login / sign-up screen
    CheckInOutForm.jsx       check-in & check-out screen
    History.jsx              the signed-in user's own visits
    AdminDashboard.jsx       visits of your assigned salespeople, filters, Excel export
    ManagePage.jsx           SuperAdmin screen with two tabs: roles, locations
    UserManagement.jsx       roles and which salespeople each Admin sees
    LocationManagement.jsx   add, edit, hide or delete locations
    UpdateBanner.jsx         "new version available — refresh" bar for stale tabs
    ui/Toast.jsx             toast notification provider
    ui/toast-context.js      toast context + `useToast` hook
    ui/SuggestInput.jsx      free-text field with suggestions (company name)
  hooks/useAdminAccess.js    resolves the user's role and assigned salespeople
  constants/locations.js     the built-in location list (also in firestore.rules)
  utils/locationStore.js     built-in list merged with locations managed in the app
  utils/companies.js         each person's remembered company names
  utils/profile.js           saves the `users/{uid}` name/email profile
  utils/datetime.js          shared date/time formatting helpers
  utils/visits.js            reading a visit: times, duration, flags, distance
  utils/excel.js             Excel (.xlsx) building and download
firestore.rules              security rules — paste into the Firebase console
tests/                       rules tests and the app/rules consistency check
firebase.json                emulator and index settings for the tests
firestore.indexes.json       the composite index Team Data needs
```

Records are stored in the `check-ins` Firestore collection with times in
`DD-MM-YYYY HH:mm:ss` format; an empty `checkOutTime` marks a visit still in progress.

## Shared styles

Reusable classes are declared in `src/index.css` under `@layer components`:
`card`, `input`, `label`, `btn-primary`, `btn-secondary`, `btn-success`,
`badge-active`, `alert-error`, `skeleton`, and friends. Prefer these over
re-deriving long utility strings so screens stay visually consistent.
