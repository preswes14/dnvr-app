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

const ORIGIN = 'https://thednvr.com';        // the WordPress site
const CACHE_SECONDS = 60;                    // edge cache for PUBLIC responses
const CONTENT_PREFIX = '/wp-json/wp/v2/';    // public content endpoints (GET)
const TOKEN_PATH = '/wp-json/jwt-auth/v1/token'; // member sign-in (POST; only
                                             // used if the site enables the
                                             // JWT auth plugin — harmless 404
                                             // to forward otherwise)

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const isContent = request.method === 'GET' && url.pathname.startsWith(CONTENT_PREFIX);
    const isToken = request.method === 'POST' &&
      (url.pathname === TOKEN_PATH || url.pathname === TOKEN_PATH + '/');
    if (!isContent && !isToken) {
      return new Response('Not found', { status: 404, headers: corsHeaders() });
    }

    const upstream = new URL(ORIGIN);
    upstream.pathname = url.pathname;
    upstream.search = url.search;

    const fwdHeaders = { Accept: 'application/json' };
    const auth = request.headers.get('Authorization');
    if (auth) fwdHeaders.Authorization = auth;
    if (isToken) fwdHeaders['Content-Type'] = 'application/json';

    // Only anonymous GETs are edge-cached — a member's personalized response
    // (or a sign-in) must never be served from a shared cache.
    const cacheable = isContent && !auth;
    const res = await fetch(upstream.toString(), {
      method: request.method,
      headers: fwdHeaders,
      body: isToken ? request.body : undefined,
      cf: cacheable ? { cacheTtl: CACHE_SECONDS, cacheEverything: true } : { cacheTtl: 0 }
    });

    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(corsHeaders())) headers.set(k, v);
    headers.set('Cache-Control', cacheable ? 'public, max-age=' + CACHE_SECONDS : 'no-store');
    return new Response(res.body, { status: res.status, headers });
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Expose-Headers': 'X-WP-Total, X-WP-TotalPages'
  };
}
