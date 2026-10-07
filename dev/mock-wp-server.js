/*
 * Local dev harness: serves the app AND a mock of the WordPress REST API
 * with the exact response shape of /wp-json/wp/v2/* — so the app can be
 * developed and demoed with zero dependence on the live site.
 *
 *   node dev/mock-wp-server.js          # http://127.0.0.1:8788
 *
 * Then open:  http://127.0.0.1:8788/?api=http://127.0.0.1:8788
 * (the ?api= override persists; use ?api=clear to go back to the live site)
 *
 * All fixture content below is clearly-labeled sample data.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8788;
const ROOT = path.join(__dirname, '..');

// ── Fixtures ───────────────────────────────────────────────────────────────
// Slugs deliberately do NOT all equal the app config's keywords — the live
// site prefixes team names ("denver-nuggets"), which is exactly what broke
// the first deploy's tabs. The fuzzy matcher must resolve all of these.
const CATEGORIES = [
  { id: 2, name: 'Broncos', slug: 'broncos', parent: 0, count: 40 },
  { id: 3, name: 'Denver Nuggets', slug: 'denver-nuggets', parent: 0, count: 35 },
  { id: 4, name: 'Colorado Avalanche', slug: 'colorado-avalanche', parent: 0, count: 30 },
  { id: 5, name: 'Rockies', slug: 'rockies', parent: 0, count: 22 },
  { id: 6, name: 'CU Buffs', slug: 'cu-buffs', parent: 0, count: 12 },
  { id: 7, name: 'CSU Rams', slug: 'csu-rams', parent: 0, count: 8 },
  { id: 8, name: 'Colorado Rapids', slug: 'colorado-rapids', parent: 0, count: 5 },
  { id: 9, name: 'Uncategorized', slug: 'uncategorized', parent: 0, count: 3 }
];

const TEAM_COLORS = { 2: '#fb4f14', 3: '#fec524', 4: '#6f263d', 5: '#33006f', 6: '#cfb87c', 7: '#1e4d2b' };

const LOREM = [
  'This is sample fixture copy used by the local development server. It stands in for a real paragraph of reporting so layout, typography, and reading rhythm can be judged honestly.',
  'A second paragraph keeps the article long enough to scroll. Line length, paragraph spacing, and link styling all show up here rather than in a real story.',
  'Numbers, quotes, and names would normally appear throughout — the fixture keeps things generic on purpose so nobody mistakes it for actual coverage.'
];

function makePost(i) {
  const cat = CATEGORIES[i % 6]; // rotate through the six team categories
  const id = 100 + i;
  const isProtected = i === 4;   // one members-only article to exercise the paywall UI
  const date = new Date(Date.UTC(2026, 7, 24, 12, 0, 0) - i * 5 * 3600 * 1000).toISOString().replace(/\.\d+Z$/, '');
  const title = `Sample ${cat.name} article #${i + 1}: fixture headline for layout testing`;
  const content = isProtected ? '' : `
    <p>${LOREM[0]}</p>
    <p>${LOREM[1]} It also includes <a href="https://example.com/sample">a sample link</a> to check link styling.</p>
    <blockquote><p>“A sample pull quote, to verify blockquote treatment.” — Sample source</p></blockquote>
    <script>window.__XSS_FIXTURE_RAN__ = true;</script>
    <p onclick="window.__XSS_FIXTURE_RAN__=true">${LOREM[2]}</p>
    <img src="/mockimg/${id}.svg" alt="sample inline image">`;
  return {
    id,
    date, date_gmt: date,
    link: `https://thednvr.com/sample-${id}/`,
    title: { rendered: title },
    excerpt: { rendered: `<p>${LOREM[0].slice(0, 140)}&hellip;</p>`, protected: isProtected },
    content: { rendered: content, protected: isProtected },
    categories: [cat.id],
    _embedded: {
      author: [{ name: 'Sample Staff Writer' }],
      'wp:featuredmedia': [{
        source_url: `/mockimg/${id}.svg`,
        media_details: { sizes: { medium_large: { source_url: `/mockimg/${id}.svg` } } }
      }]
    }
  };
}
const POSTS = Array.from({ length: 24 }, (_, i) => makePost(i));

// ── Mock membership (mirrors the JWT Authentication plugin's contract) ─────
// Sign in with diehard / sample. An authorized request sees the members-only
// article (id 104) with its full body, the way a membership plugin serves it
// to a signed-in member.
const MOCK_USER = { username: 'diehard', password: 'sample', name: 'Sample Diehard' };
const MOCK_TOKEN = 'mock-jwt-token-fixture';
// Cookie mode: a browser "logged in on the website" is simulated by the
// cookie dnvr_mock_login=1; the nonce bridge then behaves like
// wordpress-snippet.php does on a real site.
const MOCK_NONCE = 'mock-rest-nonce-fixture';

function hasSiteLogin(req) {
  return /(?:^|;\s*)dnvr_mock_login=1(?:;|$)/.test(req.headers.cookie || '');
}

function isAuthorized(req) {
  if ((req.headers.authorization || '') === 'Bearer ' + MOCK_TOKEN) return true;
  return hasSiteLogin(req) && req.headers['x-wp-nonce'] === MOCK_NONCE;
}

function viewOf(post, authed) {
  if (!post || !(post.content && post.content.protected) || !authed) return post;
  return Object.assign({}, post, {
    excerpt: { rendered: post.excerpt.rendered, protected: false },
    content: {
      rendered: `<p><strong>Members-only sample article, unlocked.</strong> You are seeing the full
        body because the request carried a valid member token — this is exactly how a real
        members-only article opens in-app for a signed-in member.</p>
        <p>${LOREM[0]}</p><p>${LOREM[1]}</p>`,
      protected: false
    }
  });
}

function readBody(req, cb) {
  let data = '';
  req.on('data', c => { data += c; });
  req.on('end', () => cb(data));
}

// ── Server ─────────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
  '.json': 'application/json'
};

function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'X-WP-Total, X-WP-TotalPages'
  }, headers));
  res.end(body);
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const p = url.pathname;

  if (req.method === 'OPTIONS') {
    return send(res, 204, '', {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-WP-Nonce'
    });
  }

  // The membership bridge from wordpress-snippet.php.
  if (p === '/wp-admin/admin-ajax.php' && url.searchParams.get('action') === 'dnvr_app_nonce') {
    const body = hasSiteLogin(req)
      ? { ok: true, nonce: MOCK_NONCE, name: MOCK_USER.name }
      : { ok: false };
    return send(res, 200, JSON.stringify(body), { 'Content-Type': 'application/json' });
  }

  if (p === '/wp-json/jwt-auth/v1/token' && req.method === 'POST') {
    return readBody(req, raw => {
      let creds = {};
      try { creds = JSON.parse(raw); } catch (e) { /* fall through to failure */ }
      if (creds.username === MOCK_USER.username && creds.password === MOCK_USER.password) {
        send(res, 200, JSON.stringify({
          token: MOCK_TOKEN,
          user_display_name: MOCK_USER.name,
          user_nicename: MOCK_USER.username
        }), { 'Content-Type': 'application/json' });
      } else {
        send(res, 403, JSON.stringify({
          code: 'jwt_auth_failed',
          message: '<strong>Error:</strong> The username or password you entered is incorrect.'
        }), { 'Content-Type': 'application/json' });
      }
    });
  }

  if (p === '/wp-json/wp/v2/categories') {
    return send(res, 200, JSON.stringify(CATEGORIES), { 'Content-Type': 'application/json' });
  }

  const single = p.match(/^\/wp-json\/wp\/v2\/posts\/(\d+)$/);
  if (single) {
    const post = viewOf(POSTS.find(x => x.id === +single[1]), isAuthorized(req));
    return post
      ? send(res, 200, JSON.stringify(post), { 'Content-Type': 'application/json' })
      : send(res, 404, JSON.stringify({ code: 'rest_post_invalid_id' }), { 'Content-Type': 'application/json' });
  }

  if (p === '/wp-json/wp/v2/posts') {
    let list = POSTS;
    const cats = url.searchParams.get('categories');
    if (cats) {
      const ids = cats.split(',').map(Number);
      list = list.filter(x => x.categories.some(c => ids.includes(c)));
    }
    const search = (url.searchParams.get('search') || '').toLowerCase();
    if (search) list = list.filter(x => x.title.rendered.toLowerCase().includes(search));
    const perPage = +(url.searchParams.get('per_page') || 10);
    const page = +(url.searchParams.get('page') || 1);
    const totalPages = Math.max(1, Math.ceil(list.length / perPage));
    const authed = isAuthorized(req);
    const slice = list.slice((page - 1) * perPage, page * perPage).map(x => viewOf(x, authed));
    return send(res, 200, JSON.stringify(slice), {
      'Content-Type': 'application/json',
      'X-WP-Total': String(list.length),
      'X-WP-TotalPages': String(totalPages)
    });
  }

  const img = p.match(/^\/mockimg\/(\d+)\.svg$/);
  if (img) {
    const post = POSTS.find(x => x.id === +img[1]);
    const color = (post && TEAM_COLORS[post.categories[0]]) || '#555';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">
      <rect width="640" height="360" fill="${color}"/>
      <rect width="640" height="360" fill="rgba(0,0,0,0.35)"/>
      <text x="320" y="190" text-anchor="middle" font-family="Arial" font-size="34" fill="#fff">SAMPLE IMAGE</text></svg>`;
    return send(res, 200, svg, { 'Content-Type': 'image/svg+xml' });
  }

  // Static app files
  let file = p === '/' ? '/index.html' : p;
  const full = path.normalize(path.join(ROOT, file));
  if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    return send(res, 404, 'not found', { 'Content-Type': 'text/plain' });
  }
  send(res, 200, fs.readFileSync(full), { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
}).listen(PORT, () => console.log(`mock WP + app on http://127.0.0.1:${PORT}  (open /?api=http://127.0.0.1:${PORT})`));
