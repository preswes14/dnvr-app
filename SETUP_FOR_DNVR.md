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

The app is static files. Any HTTPS static host works; two easy options:

**Cloudflare Pages (recommended, free)**
1. Cloudflare dashboard → *Workers & Pages* → *Create* → *Pages* → *Upload assets*.
2. Upload the contents of this folder (everything except `dev/`, which is
   optional developer tooling).
3. Optional but nice: add a custom domain like `app.thednvr.com`.

**Netlify (free)** — drag the folder onto https://app.netlify.com/drop. Done.

HTTPS is automatic on both, and HTTPS is required (the offline features won't
activate without it).

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

**Stage 2 — optional: Diehards sign in inside the app.** The sign-in screen,
token handling, unlock flow, and sign-out cleanup are already built and
tested; they activate when your WordPress can issue login tokens:

1. Install the free **"JWT Authentication for WP REST API"** plugin (or any
   JWT auth plugin — the token endpoint is configurable) and add its secret
   key to `wp-config.php` per the plugin's two-line instructions.
2. **Trial it without touching config**: open the deployed app with
   `?auth=jwt` appended and sign in with a test member account. Open a
   members-only article — if it unlocks, you're done; `?auth=clear` ends the
   trial. Whether the body actually unlocks for a signed-in subscriber
   depends on your paywall plugin honoring authenticated REST reads — that's
   the thing this trial tells you.
3. If the trial works, make it permanent: `js/config.js` →
   `MEMBERSHIP.AUTH.mode: 'jwt'`, re-upload.

Security posture, for whoever reviews this: the app sends the password only
to your own site's token endpoint (once, at sign-in), stores only the issued
token on the reader's device, never edge-caches authenticated responses (the
bundled Cloudflare Worker explicitly bypasses cache when an Authorization
header is present), and wipes cached member content on sign-out. If your
members sign in through a non-WordPress identity system instead, treat the
built-in form as the scaffold to wire into it — everything downstream of
"get a token" is done.

## Step 5 — Branding (30–60 minutes)

All placeholders, clearly marked:

- **Colors**: top of `css/app.css` — the theme is already DNVR black +
  yellow-gold matched to your public branding; if the exact style-guide value
  differs, swap `--accent` (and `--accent-text` for light mode). Everything is
  token-driven.
- **Icons**: replace the four PNGs in `icons/` with renders of the real DNVR
  logo — sizes 512, 192, 180, plus a "maskable" 512 with the logo inside the
  middle ~76% (Android crops the edges). Keep the filenames.
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
