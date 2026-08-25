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
  // Matched against the WordPress category SLUGS at runtime — no hardcoded
  // category IDs. A section whose slug doesn't exist on the site is simply
  // not shown, so this list is safe to over-specify. Order = tab order.
  SECTIONS: [
    { slug: 'broncos',   label: 'Broncos'   },
    { slug: 'nuggets',   label: 'Nuggets'   },
    { slug: 'avalanche', label: 'Avalanche' },
    { slug: 'rockies',   label: 'Rockies'   },
    { slug: 'buffs',     label: 'CU Buffs'  },
    { slug: 'cu-buffs',  label: 'CU Buffs'  },
    { slug: 'rams',      label: 'CSU Rams'  },
    { slug: 'csu-rams',  label: 'CSU Rams'  }
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
    AUTH: {
      // 'link' (default): locked articles send members to the website —
      //   works today with zero site changes.
      // 'jwt': members sign in INSIDE the app with their site login and
      //   locked articles open in-app. Requires a one-time WordPress
      //   plugin install — read "Letting Diehards sign in inside the app"
      //   in SETUP_FOR_DNVR.md before switching this on. You can trial it
      //   on the deployed app without editing this file via ?auth=jwt.
      mode: 'link',
      // Token endpoint for 'jwt' mode. null = the standard
      // `<api root>/jwt-auth/v1/token` of the JWT Authentication plugin.
      tokenEndpoint: null
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
