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

## Getting the data out

Every salesperson sees only their own visits on **History**. Managers and MIS
get the whole team's data on the **Team Data** screen (`/admin`), which supports
free-text search, a per-person filter, a date range, and **Export CSV** — the
export includes a UTF-8 BOM so it opens straight into Excel. Only the rows
currently matching the filters are exported.

### Granting admin access

Two one-time steps, both in the Firebase console — no code change or redeploy:

1. **Publish the security rules.** Firestore Database → **Rules** → replace the
   contents with [`firestore.rules`](./firestore.rules) → **Publish**. These
   rules let each user read and write only their own records, and let admins
   read everything.
2. **Add the admin.** Firestore Database → **Data** → create a collection named
   `admins`, and add a document whose **document ID is the person's
   lower-cased email address** (for example `mis3@pridehotel.com`). The document
   needs no fields — its existence is the grant.

Removing that document revokes access. The **Team Data** link only appears in the
navigation for admins, and `/admin` redirects everyone else back to the
check-in screen.

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
    AdminDashboard.jsx       whole-team visits, filters and CSV export
    ui/Toast.jsx             toast notification provider
    ui/toast-context.js      toast context + `useToast` hook
  hooks/useIsAdmin.js        looks the user up in the `admins` collection
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
