/*
 * OPTIONAL Cloudflare Worker — only needed if the WordPress site's firewall
 * or security plugin blocks cross-origin requests to /wp-json/ (stock
 * WordPress allows them, so try WITHOUT this first — see SETUP_FOR_DNVR.md).
 *
 * What it does: forwards GET requests for /wp-json/* to the origin site,
 * adds permissive CORS headers, and caches responses at Cloudflare's edge
 * for 60 seconds (which also takes load OFF the site).
 *
 * Deploy (free Cloudflare account, ~10 minutes):
 *   1. Cloudflare dashboard → Workers & Pages → Create Worker
 *   2. Paste this file, set ORIGIN below, deploy
 *   3. In the app's js/config.js set:
 *        API_BASE: 'https://<your-worker>.workers.dev/wp-json'
 */

const ORIGIN = 'https://thednvr.com';       // the WordPress site
const CACHE_SECONDS = 60;                    // edge cache for API responses
const ALLOWED_PREFIX = '/wp-json/wp/v2/';    // only public content endpoints

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }
    if (request.method !== 'GET' || !url.pathname.startsWith(ALLOWED_PREFIX)) {
      return new Response('Not found', { status: 404, headers: corsHeaders() });
    }

    const upstream = new URL(ORIGIN);
    upstream.pathname = url.pathname;
    upstream.search = url.search;

    const res = await fetch(upstream.toString(), {
      headers: { Accept: 'application/json' },
      cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true }
    });

    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(corsHeaders())) headers.set(k, v);
    headers.set('Cache-Control', 'public, max-age=' + CACHE_SECONDS);
    return new Response(res.body, { status: res.status, headers });
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Expose-Headers': 'X-WP-Total, X-WP-TotalPages'
  };
}
