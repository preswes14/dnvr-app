# DNVR News — a reader app for thednvr.com

A fast, installable news app for [DNVR](https://thednvr.com)'s articles — built as a
gift by a fan, designed so the DNVR team can take it live with about half a day of
admin work and **zero backend work**.

> **[SETUP_FOR_DNVR.md](SETUP_FOR_DNVR.md) is the half-day launch guide.**
> This file is the technical overview.

_[Placeholder for a personal note from the sender — replace or delete before sharing.]_

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
- **Respects the membership.** Articles the public API marks protected render as
  excerpt + a "Read on DNVR" button. The app never works around access controls.

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
# open http://127.0.0.1:8788/?api=http://127.0.0.1:8788
```

The mock serves fixture articles in the exact WordPress API shape. `?api=clear`
switches back to the live site configured in `js/config.js`.

Automated checks (needs `playwright-core` + Chromium):

```bash
node dev/smoke.js
```

Verifies: live feed rendering, section tabs, infinite scroll, search, article
sanitization (script/handler stripping), the members-only paywall path, saving
for offline, and the labeled sample-content fallback — 16 checks.

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
