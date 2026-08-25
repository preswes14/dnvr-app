# DNVR News — a reader app for thednvr.com

A fast, installable news app for [DNVR](https://thednvr.com)'s articles — built as a
gift by a fan, designed so the DNVR team can take it live with about half a day of
admin work and **zero backend work**.

> **[SETUP_FOR_DNVR.md](SETUP_FOR_DNVR.md) is the half-day launch guide.**
> This file is the technical overview.

## What it is

- **Feeds off the existing website.** The app reads the WordPress REST API that
  thednvr.com already exposes (`/wp-json/wp/v2/...`). No new CMS, no syncing, no
  server: publish an article on the site and it's in the app.
- **Installable on iOS today, without the App Store.** It's a PWA — readers tap
  *Share → Add to Home Screen* in Safari and get a full-screen, home-screen app.
  The same folder can also be wrapped with Capacitor for a real App Store listing
  later (steps in the setup guide).
- **A real app, not a webview of the site**: native-feel feed with team sections
  (Broncos / Nuggets / Avalanche / Rockies / Buffs / Rams), search, offline
  reading, a saved-articles list, share sheet, dark & light themes, skeleton
  loaders, and instant boot from cache.
- **Diehard-aware.** Members-only articles are a first-class feature, not an
  error state: they carry a DIEHARD badge in the feed, and opening one shows a
  branded card with the membership's benefits, a **Become a Diehard** button
  (→ thednvr.com/join), and a link to read on the site. The full in-app member
  **sign-in is scaffolded and tested**: flip `MEMBERSHIP.AUTH.mode` to `'jwt'`
  (after a one-time WordPress plugin install, see the setup guide) and members
  sign in with their site login — locked articles then open right in the app,
  badges clear, and sign-out re-locks everything and wipes cached member
  content. The app never works around access controls; it renders exactly what
  the site's API returns for the current reader.

## Tech

Zero dependencies, zero build step: vanilla JS + CSS + a service worker in a
static folder. Host it anywhere that serves files over HTTPS.

```
dnvr-app/
├── index.html              app shell
├── css/app.css             styles — brand theme tokens at the top
├── js/config.js            ★ the only file an admin needs to edit
├── js/api.js               WordPress REST adapter (+ HTML sanitizer)
├── js/app.js               UI: feed / article / saved / about
├── js/demo-data.js         clearly-labeled sample content (offline/unconfigured fallback)
├── sw.js                   service worker: offline + caching
├── manifest.webmanifest    PWA manifest
├── icons/                  placeholder icons — replace with official logo
├── cors-proxy-worker.js    optional Cloudflare Worker (only if the site firewall blocks CORS)
└── dev/
    ├── mock-wp-server.js   local dev server with a mock WP API (fixture data)
    ├── smoke.js            headless browser test of all core flows
    └── screenshots/        output of the smoke run
```

## Try it locally (no live site needed)

```bash
node dev/mock-wp-server.js
# open http://127.0.0.1:8788/?api=http://127.0.0.1:8788&auth=jwt
```

The mock serves fixture articles in the exact WordPress API shape, including a
members-only article and a mock sign-in (username `diehard`, password `sample`)
so the whole Diehard flow is demoable offline. `?api=clear` / `?auth=clear`
switch back to the live config in `js/config.js`.

Automated checks (needs `playwright-core` + Chromium):

```bash
node dev/smoke.js
```

Verifies: live feed rendering, section tabs, infinite scroll, search, article
sanitization (script/handler stripping), saving for offline, the labeled
sample-content fallback, and the full membership arc — DIEHARD feed badges,
the Become-a-Diehard card on locked articles, rejected bad credentials,
sign-in unlocking members-only articles in-app, and sign-out re-locking them.

## Design notes

- **Sections are resolved at runtime** from the site's category *slugs* — no
  hardcoded category IDs to go stale. Unknown slugs are skipped silently.
- **Three layers of offline**: service-worker caches (shell, API, images),
  a localStorage feed snapshot for instant boot, and explicit per-article saves.
- **Article HTML is sanitized** before rendering (scripts, inline handlers, and
  `javascript:` URLs stripped; links forced to open externally).
- If the API is unreachable and nothing is cached, the app shows **built-in
  sample articles that say, in the headline, that they're samples** — it never
  fabricates content and never shows a blank screen.
