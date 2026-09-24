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
- **Export CSV** of exactly the rows on screen, with server times, flags, GPS
  coordinates and map links. It includes a UTF-8 BOM so it opens straight into
  Excel.

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
| **Admin** | **Team Data** for the locations granted to them | No |
| **SuperAdmin** | **Team Data** for every location | Yes — the **Roles** screen |

Roles live in the `admins` collection, one document per person whose **ID is
their lower-cased email address**:

```jsonc
// admins/mis3@pridehotel.com
{ "role": "superadmin" }

// admins/goa.manager@pridehotel.com — Goa and Daman only
{ "role": "admin", "locations": ["Goa", "Daman"] }

// admins/national@pridehotel.com — every location
{ "role": "admin", "locations": [] }
```

An empty or missing `locations` array means every location, so admins created
before location scoping keep working unchanged.

### First-time setup

Two one-time steps in the Firebase console — after this, roles are managed
inside the app:

1. **Publish the security rules.** Firestore Database → **Rules** → replace the
   contents with [`firestore.rules`](./firestore.rules) → **Publish**.
2. **Create the first SuperAdmin.** Firestore Database → **Data** → collection
   `admins` → document ID `mis3@pridehotel.com`, with a field `role` (string)
   set to `superadmin`.

From then on, a SuperAdmin adds and edits everyone else on the **Roles** screen.

### How location scoping is enforced

The rules — not the UI — decide what a manager can read. A scoped Admin's read
is rejected for any record outside their locations, so the app sends a
`where('location', 'in', [...])` query matching the grant. Editing the request
in the browser cannot widen it: asking for everything fails the whole read.

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
the coordinates are still there, with a map link in Team Data. Location
reference points and radii are in `LOCATION_COORDS`
(`src/constants/locations.js`). They are approximate city centres, and
**Canopus** has none yet, so its visits are never distance-flagged.

**Forgotten check-outs.** After 10 hours the check-in screen asks whether the
person forgot. They can check out now, or say when they actually left: that is
stored as `reportedCheckOutAt` with `lateCheckout: true`, alongside the real
closing time, and no GPS is taken. A manager can also close a visit that has
been open for 10+ hours at a location they manage; it is signed with
`closedBy`. The 10 hours is enforced by the rules as well
(`forgottenAfter()`), so keep the two values in step.

## Releasing an update that changes the rules

The app and `firestore.rules` depend on each other, so publish them together:

1. Merge to `main`; wait for Vercel to finish deploying (about a minute).
2. **Immediately** publish `firestore.rules` in the Firebase console.
3. Ask anyone with the app already open to refresh.

Between steps 1 and 2 check-ins fail, so do them back to back, ideally outside
working hours.

**Composite index.** A location-limited Admin's Team Data query needs one
index, defined in [`firestore.indexes.json`](./firestore.indexes.json)
(`check-ins`: `location` ascending, `checkInAt` descending). Create it under
Firestore → **Indexes** → **Composite** → **Add index**, or just open Team Data
as such an Admin: the screen shows a **Create the index** button linking to the
pre-filled form. It takes a few minutes to build.

**Upgrading older visits (once).** Visits recorded before server timestamps
have no `checkInAt`, so date ranges miss them (*All time* still shows them).
A SuperAdmin sees an **Upgrade older visits** button on Team Data. It reads
every visit once and copies the old text times into `checkInAt` / `checkOutAt`.
It is safe to repeat, and continues where it left off if interrupted. Run it
from a device set to Indian time, since the old text is read as local time. On
the Spark plan it can upgrade up to about 20,000 visits a day (the daily write
limit).

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
    AdminDashboard.jsx       team visits within your locations, filters, CSV export
    UserManagement.jsx       SuperAdmin screen for roles and location access
    ui/Toast.jsx             toast notification provider
    ui/toast-context.js      toast context + `useToast` hook
  hooks/useAdminAccess.js    resolves the user's role and location scope
  constants/locations.js     the property list shared by check-in and permissions
  utils/datetime.js          shared date/time formatting helpers
  utils/visits.js            reading a visit: times, duration, flags, distance
  utils/csv.js               CSV building and download
firestore.rules              security rules — paste into the Firebase console
firestore.indexes.json       the composite index Team Data needs
```

Records are stored in the `check-ins` Firestore collection with times in
`DD-MM-YYYY HH:mm:ss` format; an empty `checkOutTime` marks a visit still in progress.

## Shared styles

Reusable classes are declared in `src/index.css` under `@layer components`:
`card`, `input`, `label`, `btn-primary`, `btn-secondary`, `btn-success`,
`badge-active`, `alert-error`, `skeleton`, and friends. Prefer these over
re-deriving long utility strings so screens stay visually consistent.
