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
