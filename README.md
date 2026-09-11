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
get the whole team's data on the **Team Data** screen (`/admin`), which supports
free-text search, a per-person filter, a date range, and **Export CSV** — the
export includes a UTF-8 BOM so it opens straight into Excel. Only the rows
currently matching the filters are exported.

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
  utils/csv.js               CSV building and download
firestore.rules              security rules — paste into the Firebase console
```

Records are stored in the `check-ins` Firestore collection with times in
`DD-MM-YYYY HH:mm:ss` format; an empty `checkOutTime` marks a visit still in progress.

## Shared styles

Reusable classes are declared in `src/index.css` under `@layer components`:
`card`, `input`, `label`, `btn-primary`, `btn-secondary`, `btn-success`,
`badge-active`, `alert-error`, `skeleton`, and friends. Prefer these over
re-deriving long utility strings so screens stay visually consistent.
