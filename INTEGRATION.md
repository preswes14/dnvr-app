# DNVR App — integration guide (the short version)

For whoever runs thednvr.com. Total: **about an hour**, most of it
verification. Nothing here touches your existing site, theme, plugins, or
database — the app is a folder of static files that reads the public
WordPress REST API your site already serves. Rollback at any point =
delete the folder.

*(Long version with alternatives and troubleshooting: [SETUP_FOR_DNVR.md](SETUP_FOR_DNVR.md).)*

## 1. Put the app folder on your domain (~20 min)

Upload this repo's files to a folder on the **main domain**, e.g.

```
https://thednvr.com/app/
```

SFTP or your host's file manager, alongside the WordPress install. You can
skip `dev/` and the `.md` files; everything else ships as-is — no build
step, no dependencies.

That alone is a working app: open the URL on a phone and you'll see your
live articles, team sections, search, offline reading, and an
Add-to-Home-Screen install banner. It reads `/wp-json/wp/v2/posts` and
`/categories` — the API WordPress serves by default, same data as your
public pages.

Why a **path on the main domain** and not a subdomain: step 2 rides the
site's own login cookie, and browsers scope that cookie to the host.
`thednvr.com/app/` can see it; `app.thednvr.com` can't.

## 2. Let Diehard logins carry into the app (~10 min)

Drop **`wordpress-snippet.php`** (in this repo) into

```
wp-content/mu-plugins/
```

(create the folder if it doesn't exist — files in it activate
automatically). Or paste its code into your theme's `functions.php`.

What it does — and all it does: registers one **read-only** admin-ajax
endpoint that answers "is this browser logged in?" For a logged-in user it
returns WordPress's own standard REST nonce plus the display name; for
everyone else, `{ok:false}`. The app calls it at launch and whenever it
returns to the foreground. Result: a Diehard who's logged in on the
website opens the app already recognized — members-only articles open
in-app, and no separate app login exists anywhere.

Access control stays entirely in WordPress and your paywall plugin: the
app only ever renders what your API returns for the current session, and
it never sees or stores a password.

No app configuration needed — it auto-detects that it's hosted on the
same domain as the API.

## 3. Verify (~10 min)

- [ ] Open `thednvr.com/app/` on a phone → live articles, team tabs.
- [ ] Log in on the site as a test member, open the app → a members-only
      article shows its full body; DIEHARD badges clear.
- [ ] Log out on the site → the app shows it locked again.
- [ ] In a logged-out/private browser window, open
      `thednvr.com/wp-json/wp/v2/posts/<id-of-a-members-only-post>` —
      the body should **not** be in the response. If it is, your paywall
      plugin is leaving the REST API unrestricted — a site-wide setting
      worth tightening regardless of this app.

## 4. Make it yours (optional, ~30 min)

- **`js/config.js`** — app name, tagline, team sections, membership
  benefits copy, footer links. The only file you should need to edit.
- **`css/app.css`** — brand colors live in the token block at the top.
- **`icons/`** — currently the DNVR logo; swap the four PNGs for other
  renders any time (keep the filenames; the "maskable" one wants the
  mark inside the middle ~76%, since Android crops the edges).
- After **any** file change, bump `VERSION` at the top of `sw.js` —
  that's how installed copies know to fetch the update (they then
  refresh themselves on next launch).

## Notes

- No server, no accounts, no analytics, no secrets in the repo. HTTPS
  required (you have it).
- Can't host a folder on the main domain? The app also runs on any
  static host — see SETUP_FOR_DNVR.md for that path and its tradeoffs
  (login carry-over is the thing you give up).
- Push notifications and an App Store wrapper are optional later steps,
  also covered in SETUP_FOR_DNVR.md.
