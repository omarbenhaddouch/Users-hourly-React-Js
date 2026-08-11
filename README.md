# CITIC Shift Ledger — React (Create React App)

Same 3 tools you had before, now on Create React App (`react-scripts`) instead
of Vite, still talking to the same Firebase Realtime Database:

| Page | Route | Purpose |
|---|---|---|
| **Operator Terminal** | `/` | Login, hourly production entry, downtime reasons |
| **Manager Dashboard** | `/dashboard` | Live grid of all machines, KPIs, filters, detail modal |
| **Admin Portal** | `/admin` | Add users (operators) and parts to the database |

## Why routes instead of 3 separate HTML files

Create React App only ever serves a single `public/index.html` — it doesn't
support multiple HTML build entries the way Vite did. So the 3 pages are now
client-side routes (via `react-router-dom`) inside one app, instead of 3
separate `.html` files. Everything else — the Firebase logic, the state, the
CSS, the Framer Motion animations — works exactly the same per page.

## Project structure

```
citic-portal/
├── public/
│   ├── index.html          # Single CRA entry (fonts + Font Awesome loaded here)
│   └── styles/
│       ├── operator.css     # Ledger theme (yellow/navy/cream)
│       ├── dashboard.css    # Steel/amber industrial theme
│       └── admin.css
├── src/
│   ├── index.js              # ReactDOM root
│   ├── App.js                 # react-router-dom routes: / , /dashboard , /admin
│   ├── shared/
│   │   ├── firebase.js         # One Firebase config/init, shared by all 3 pages
│   │   ├── useToast.js          # Toast hook
│   │   ├── Toast.jsx             # Animated toast (Framer Motion)
│   │   ├── AnimatedNumber.jsx     # Rolling number animation (Framer Motion)
│   │   ├── usePageStylesheet.js    # Loads/unloads each page's CSS on route change
│   │   └── motion.js                # Shared Framer Motion presets
│   ├── operator/App.jsx        # Operator Terminal
│   ├── dashboard/App.jsx        # Manager Dashboard
│   └── admin/App.jsx             # Admin Portal
```

## Why page CSS lives in `public/styles/` instead of being imported

Each page's CSS defines its own `:root` variables, `*` reset, and `body`
rules — same variable *names* (`--navy`, `--yellow`, etc.) but different
*values* per page/theme. With Vite's multi-page setup that was safe because
each page was a real separate HTML document. In a single-page CRA app, a
normal `import "./page.css"` gets bundled permanently by webpack, so all
three would collide and fight each other as soon as you navigated between
routes.

To avoid that, each page's CSS is a plain static file in `public/styles/`,
and `usePageStylesheet(href)` (in `src/shared/usePageStylesheet.js`) adds it
as a real `<link>` tag when that page mounts and removes it when you navigate
away — so only one page's styling is ever active at a time, exactly like
before.

## Setup

Requires Node.js 18+ and internet access for the initial install.

```bash
cd citic-portal
npm install
npm start
```

This opens `http://localhost:3000/`. Navigate to:
- `http://localhost:3000/` — Operator Terminal
- `http://localhost:3000/dashboard` — Manager Dashboard
- `http://localhost:3000/admin` — Admin Portal

## Build for production

```bash
npm run build
```

Output goes to `build/` — a single static site with client-side routing.

**Important for deployment:** because routing now happens in JavaScript
(not via separate `.html` files), your host needs to serve `index.html` for
*any* path (a "SPA fallback" / "rewrite all routes to index.html" rule), or
refreshing on `/dashboard` or `/admin` will 404. On Netlify, add a
`public/_redirects` file containing:

```
/*  /index.html  200
```

(Not included by default — add it if you deploy this.)

```bash
npx serve -s build   # serve the production build locally to sanity-check it
```

## Motion (Framer Motion)

Added as a real npm dependency (`framer-motion`), bundled into your JS at
build time — not a CDN script, so no runtime network dependency on the
factory floor. Shared presets live in `src/shared/motion.js`.

- **Every popup/modal** (login, welcome, clear-confirm, machine/part/reason
  pickers, dashboard detail modal) fades its backdrop and springs the modal
  box in/out with `AnimatePresence`.
- **Primary buttons** lift on hover, squash on tap (`buttonTap`).
- **Secondary controls** (chips, popup cards, close buttons, toggle switch)
  get a lighter tap-scale (`chipTap`).
- **Popup grids** stagger their cards in on open.
- **Dashboard machine grid**: cards animate in/out with filters, sparkline
  bars + the gauge needle animate to new values.
- **Admin tab switch** slides/crossfades between forms.
- **Toast** springs in/out.
- **Numbers that change** (Operator's Actual Produced / Efficiency,
  Dashboard's KPI strip, each machine card's gauge % and output count) use
  `<AnimatedNumber>` (`src/shared/AnimatedNumber.jsx`), which "rolls" from
  the old value to the new one with a spring instead of snapping.

## What changed vs. the original HTML/CSS/JS

- **State** now lives in React (`useState`/`useEffect`/`useRef`) instead of a
  big `window.currentSession` object and manual `innerHTML` re-renders.
- **Firebase** calls (`get`, `set`, `remove`, `onValue`) are the same SDK,
  same database, same paths (`users/`, `parts/`, `machines/`, `daily_logs/`)
  — just imported as npm packages instead of CDN `<script type="module">`
  tags.
- **Session persistence** (`sessionStorage.activeSessionMeta`) and
  auto-restore-on-reload are preserved exactly.
- **Offline queue** (retry on `window online` event) is preserved.
- **Autosave debounce** (1s after typing an hour value) is preserved.
- All CSS is untouched content-wise — copied verbatim, so visuals are
  pixel-identical to what you had, just loaded per-page (see above).

## Notes / things to double check

- Firebase config (API key, database URL) is in `src/shared/firebase.js`,
  copied as-is from your original files. It's bundled into the client JS
  either way (same as before) — no security change from this migration.
- `npm install` and `npm run build` need internet once; the resulting
  `build/` output is fully static and needs no CDN or network access at
  runtime, same as your current deploy.
- I couldn't run a live `npm install`/`npm start` in the sandbox that
  generated this project (no network access there) — every file was
  syntax-checked with esbuild and all pass cleanly, but please do a real
  `npm start` on your end before treating this as final.
