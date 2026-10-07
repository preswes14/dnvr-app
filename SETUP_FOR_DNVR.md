# Taking the DNVR app live — the half-day guide

Audience: whoever administers thednvr.com. No coding required for the base
setup — the app is a folder of static files that reads your existing
WordPress API. Realistic total: **2–4 hours**, most of it verification.

---

## Step 0 — Confirm the feed exists (5 minutes)

Open these in a browser:

- `https://thednvr.com/wp-json/wp/v2/posts?per_page=1`
- `https://thednvr.com/wp-json/wp/v2/categories?per_page=100`

If both return JSON, you're done with step 0 — the app's data source is already
live and there is nothing to build. (If you get a 404 or an error page, a
security plugin has disabled the REST API — re-enable **read access** to
`wp/v2` posts and categories in that plugin's settings, which is its default.)

While the categories JSON is open, note the `"slug"` value for each team
category — you'll compare them against the app config in step 2.

## Step 1 — Host the folder (30–45 minutes)

The app is static files; any HTTPS host works. Where you put it decides one
big thing — see Step 4:

**Option A — on thednvr.com itself (recommended): e.g. `thednvr.com/app/`.**
Upload the folder next to WordPress via your host's file manager or SFTP.
This is the option that lets Diehards' existing *website* logins carry into
the app automatically (Step 4) — and it eliminates the CORS topic entirely.
Most WordPress hosts happily serve a static folder alongside the site; if
yours is a managed platform, the one-line question for their support is "can
I serve a static folder at /app/?". (A *subdomain* like app.thednvr.com does
NOT get the login carry-over — browsers scope the login cookie to the main
host — so prefer a path on the main domain.)

**Option B — any static host (fine for launch, no login carry-over):**
- Cloudflare Pages: dashboard → *Workers & Pages* → *Create* → *Pages* →
  *Upload assets* → upload the folder (skip `dev/`, it's developer tooling).
- Netlify: drag the folder onto https://app.netlify.com/drop.

HTTPS is automatic on these and required (offline features won't activate
without it). You can start on Option B today and move to Option A later —
the app doesn't change, only its URL.

## Step 2 — Point the config at your site (10 minutes)

Open `js/config.js` — it is the only file you should need to touch:

- `WP_BASE` — already `https://thednvr.com`.
- `SECTIONS` — the feed tabs, matched by category **slug**. Compare with the
  slugs you saw in step 0 and adjust labels/slugs to taste. Wrong or extra
  slugs are harmless (they just don't appear); order = tab order.
- `SITE_NAME`, `SITE_TAGLINE`, `LINKS` — the placeholder wording is yours to
  replace.

Re-upload after editing (on Pages/Netlify that's just uploading the folder again).

**Tip — test a config before deploying it:** open the deployed app with
`?api=https://thednvr.com` appended to try an API origin on the fly, and
`?api=clear` to reset.

## Step 3 — Verify (15 minutes)

Open the deployed URL on a phone and a desktop:

- ✅ Real articles appear within a couple of seconds; team tabs filter; search works.
- ✅ Open an article → text and images render; Share and Save work.
- ✅ Airplane mode → app still opens and shows recently loaded articles.
- ✅ iPhone Safari → *Share → Add to Home Screen* → opens full-screen with an icon.

**If you see "Showing sample content" instead of real articles**, open the
browser dev console (F12) on desktop:

- **CORS error mentioning `Access-Control-Allow-Origin`** — your firewall/CDN
  is stripping the permissive CORS headers stock WordPress sends on `/wp-json/`.
  Fix: deploy the included `cors-proxy-worker.js` as a Cloudflare Worker
  (~15 minutes; instructions at the top of that file), then set
  `API_BASE` in `js/config.js` to the worker URL. Bonus: the worker also
  edge-caches API responses for 60s, *reducing* load on your site.
- **404 on `/wp-json/...`** — REST API disabled; see step 0.

## Step 4 — Diehards & members-only articles (15 minutes + optional upgrade)

Members-only articles are built into the app as a feature, in two stages:

**Stage 1 — works today, nothing to configure.** Any article whose body the
public API withholds gets a **DIEHARD badge** in the feed, and opening it shows
a branded card: the membership benefits (edit the list in `js/config.js` →
`MEMBERSHIP.BENEFITS`), a **Become a Diehard** button pointing at
`thednvr.com/join/`, and a "read on the site" link for existing members. The
app never bypasses access controls — it renders exactly what your API returns.

One sanity check worth doing once: open a members-only article's ID at
`https://thednvr.com/wp-json/wp/v2/posts/<id>` **in a logged-out browser**. If
the full body appears there, your paywall plugin is leaving the REST API
unrestricted — that's a site-wide setting worth tightening in the plugin
regardless of this app. (If the body is withheld, the app's badge + card
behavior is already correct.)

**Stage 2 — recommended: website logins carry into the app automatically.**
If the app is hosted on your domain (Step 1, Option A), a Diehard who is
logged in on thednvr.com opens the app and is simply *already* a member —
locked articles open, badges clear, their name shows on the Account tab. No
app login screen at all. Two-part setup, ~15 minutes:

1. Host the app at a path on the main domain (e.g. `/app/` — Step 1A).
2. Install the tiny bridge in **`wordpress-snippet.php`** (in this folder):
   drop the file into `wp-content/mu-plugins/`, or paste its code into your
   theme's `functions.php`. It's read-only — it tells the app whether the
   current browser is logged in, and hands back WordPress's own standard
   REST credentials (a "nonce") plus the display name. Nothing else.

That's the whole integration. The app's default `auto` mode detects
same-domain hosting by itself — no config edit. The reader's login state,
membership checks, and content access are all still decided by WordPress
and your paywall plugin on every request; the app never stores a password
and holds nothing but the short-lived nonce, in memory.

One dependency to verify (same as Stage 1's check): your paywall plugin must
serve the full body to a *logged-in member's* API request. Test by opening
`/app/` in a browser where you're logged in as a test member and tapping a
locked article.

**Stage 3 — only if hosting off-domain, or for a future App Store build:**
in-app sign-in. The form, token handling, and sign-out cleanup are built and
tested; they activate with a JWT auth plugin:

1. Install the free **"JWT Authentication for WP REST API"** plugin and add
   its secret key to `wp-config.php` per its two-line instructions.
2. Trial without config edits: open the deployed app with `?auth=jwt`, sign
   in with a test member account, open a locked article (`?auth=clear` ends
   the trial).
3. Make permanent: `js/config.js` → `MEMBERSHIP.AUTH.mode: 'jwt'`.

Security posture, for whoever reviews this: passwords (JWT mode only) go
only to your own site's token endpoint; the app stores only the issued
token; authenticated responses are never edge-cached (the bundled
Cloudflare Worker bypasses cache whenever an Authorization header is
present); cached member content is wiped on sign-out. Non-WordPress
identity system? The form is the scaffold to wire into it — everything
downstream of "get a credential" is done.

## Step 5 — Branding (30–60 minutes)

All placeholders, clearly marked:

- **Colors**: top of `css/app.css` — the theme is already DNVR black +
  yellow-gold matched to your public branding; if the exact style-guide value
  differs, swap `--accent` (and `--accent-text` for light mode). Everything is
  token-driven.
- **Icons**: `icons/` already carries the DNVR logo. To swap art later,
  replace the four PNGs (keep the filenames) — sizes 512, 192, 180, plus a
  "maskable" 512 with the mark inside the middle ~76% (Android crops the
  edges).
- **Name/tagline/links**: `js/config.js`.
- **App-update note**: whenever you change app files, bump the `VERSION`
  string at the top of `sw.js` so installed copies pick up the update.

At this point the app is live: anyone on iOS or Android can install it from
the URL, today, with no store approval.

---

## Later, optional

**A real App Store listing** — the same folder wraps with
[Capacitor](https://capacitorjs.com) into a native iOS project:

```bash
npm init -y && npm i @capacitor/core @capacitor/cli @capacitor/ios
npx cap init "DNVR" "com.allcity.dnvr" --web-dir .
npx cap add ios && npx cap open ios   # then archive/upload via Xcode
```

Budget ~a day the first time (Apple developer account, signing, screenshots).
One honest heads-up: Apple's guideline 4.2 ("minimum functionality") is picky
about apps that mirror a website. Offline reading + saved articles already
help; adding **push notifications** (e.g. OneSignal's WordPress plugin +
their Capacitor SDK, a few hours) is the classic way to clear that bar and is
also the single biggest reason readers install a news app.

**Push notifications for the PWA** — iOS 16.4+ supports web push for
home-screen PWAs; OneSignal's free tier can drive it from WordPress publish
events. Not wired in this build to keep the base install dependency-free.

**Analytics** — deliberately not included. If wanted, add your preferred
snippet to `index.html`.
