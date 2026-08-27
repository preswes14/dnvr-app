/*
 * DNVR News — single configuration file.
 *
 * This is the ONLY file an administrator should need to edit.
 * Everything the app displays or fetches is driven from here.
 */
window.DNVR_CONFIG = {

  // ── Identity ────────────────────────────────────────────────────────────
  // PLACEHOLDER COPY: the DNVR team should confirm/replace name + tagline.
  SITE_NAME: 'DNVR',
  SITE_TAGLINE: 'Denver sports news & articles',

  // ── Data source ─────────────────────────────────────────────────────────
  // The WordPress site whose REST API feeds the app. No trailing slash.
  WP_BASE: 'https://thednvr.com',

  // Optional override for the API origin. Leave null to use
  // `${WP_BASE}/wp-json`. Set this ONLY if the site's security layer blocks
  // cross-origin requests — point it at the bundled Cloudflare Worker
  // (see cors-proxy-worker.js + SETUP_FOR_DNVR.md), e.g.:
  //   API_BASE: 'https://dnvr-app-api.YOURACCOUNT.workers.dev/wp-json'
  API_BASE: null,

  // ── Sections (feed tabs) ────────────────────────────────────────────────
  // Matched against the live WordPress categories at runtime — no hardcoded
  // category IDs. Matching is fuzzy: a section matches a category whose slug
  // or name contains the keyword (so 'nuggets' finds "Denver Nuggets" /
  // "denver-nuggets" / "nuggets-news" alike); `alt` lists extra spellings.
  // A section with no matching category is simply not shown, so this list is
  // safe to over-specify. Order = tab order. Safety net: if fewer than three
  // sections match, the app fills tabs from the site's biggest categories so
  // the feed always has real navigation.
  SECTIONS: [
    { slug: 'broncos',   label: 'Broncos'   },
    { slug: 'nuggets',   label: 'Nuggets'   },
    { slug: 'avalanche', label: 'Avalanche', alt: ['avs'] },
    { slug: 'rockies',   label: 'Rockies'   },
    { slug: 'rapids',    label: 'Rapids'    },
    { slug: 'buffs',     label: 'CU Buffs',  alt: ['buffaloes', 'cu'] },
    { slug: 'rams',      label: 'CSU Rams',  alt: ['csu'] }
  ],

  // Category slugs to hide from the feed even under "All" (e.g. podcast
  // episode posts, if those live in their own category).
  EXCLUDED_SLUGS: [],

  // ── Diehard membership ──────────────────────────────────────────────────
  MEMBERSHIP: {
    NAME: 'Diehard',
    // Shown on locked articles in the feed and on the locked-article card.
    BADGE: 'DIEHARD',
    SIGNUP_URL: 'https://thednvr.com/join/',
    // Shown on the Account screen and the locked-article card. Sourced from
    // the public membership page — reword/trim freely.
    BENEFITS: [
      'Every members-only article, unlocked',
      'Diehards-only Discord access',
      '20% off merch and events · 15% off at the DNVR Bar',
      'A free shirt at sign-up, and every year after'
    ],
    // Where readers log in on the website (used by locked-article cards in
    // cookie mode). wp-login.php always exists; swap for a themed login page.
    LOGIN_URL: 'https://thednvr.com/wp-login.php',
    AUTH: {
      // 'auto' (default, recommended): when the app is hosted ON the
      //   WordPress domain itself (e.g. thednvr.com/app/), readers who are
      //   logged in on the website are recognized automatically — no in-app
      //   login. Requires the tiny bridge in wordpress-snippet.php; without
      //   it (or on any other host) 'auto' quietly behaves like 'link'.
      // 'link': locked articles just send members to the website.
      // 'jwt': members sign in INSIDE the app (username/password form).
      //   For hosting off-domain or a future App Store wrapper; needs a
      //   JWT auth plugin on WordPress. See SETUP_FOR_DNVR.md for all three.
      // Trial any mode on a deployed app without editing this file:
      //   append ?auth=cookie / ?auth=jwt / ?auth=link (?auth=clear resets).
      mode: 'auto',
      // Token endpoint for 'jwt' mode. null = the standard
      // `<api root>/jwt-auth/v1/token` of the JWT Authentication plugin.
      tokenEndpoint: null,
      // Nonce bridge for cookie mode. null = the site's
      // `/wp-admin/admin-ajax.php?action=dnvr_app_nonce` (what
      // wordpress-snippet.php registers).
      nonceEndpoint: null
    }
  },

  // ── Behavior ────────────────────────────────────────────────────────────
  POSTS_PER_PAGE: 20,
  // Re-fetch the feed automatically when the app regains focus after this
  // many minutes (0 = never auto-refresh).
  REFRESH_AFTER_MINUTES: 15,

  // ── Outbound links (About screen footer) ────────────────────────────────
  LINKS: [
    { label: 'thednvr.com',        url: 'https://thednvr.com' },
    { label: 'DNVR on X',          url: 'https://x.com/DNVR_Sports' },
    { label: 'DNVR on YouTube',    url: 'https://www.youtube.com/@DNVR_Sports' },
    { label: 'DNVR Podcasts',      url: 'https://podcasts.apple.com/us/channel/dnvr/id6442697104' }
  ]
};
