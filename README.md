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
    History.jsx              visit history with filters and CSV export
    ui/Toast.jsx             toast notification provider
    ui/toast-context.js      toast context + `useToast` hook
  utils/datetime.js          shared date/time formatting helpers
```

Records are stored in the `check-ins` Firestore collection with times in
`DD-MM-YYYY HH:mm:ss` format; an empty `checkOutTime` marks a visit still in progress.

## Shared styles

Reusable classes are declared in `src/index.css` under `@layer components`:
`card`, `input`, `label`, `btn-primary`, `btn-secondary`, `btn-success`,
`badge-active`, `alert-error`, `skeleton`, and friends. Prefer these over
re-deriving long utility strings so screens stay visually consistent.
