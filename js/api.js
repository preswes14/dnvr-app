/*
 * WordPress REST API adapter.
 *
 * Talks to the standard WP REST API (/wp-json/wp/v2/*) that every stock
 * WordPress site exposes. Nothing here is DNVR-specific — the site, the
 * sections, and the page size all come from js/config.js.
 *
 * Normalized article shape used by the rest of the app:
 *   { id, date, link, title, excerpt, content, protected, image, author,
 *     categoryIds, demo }
 */
(function () {
  'use strict';

  const CFG = window.DNVR_CONFIG;

  // Developer/admin overrides: open the app with ?api=https://host to test an
  // alternate API origin, and/or ?auth=jwt to trial in-app member sign-in —
  // both persist until ?api=clear / ?auth=clear. Used by the setup guide's
  // "verify before you deploy" steps and by the local test harness.
  const DEV_KEY = 'dnvr_dev_api_base';
  const DEV_AUTH_KEY = 'dnvr_dev_auth_mode';
  (function readDevOverride() {
    try {
      const params = new URLSearchParams(location.search);
      const q = params.get('api');
      if (q === 'clear') localStorage.removeItem(DEV_KEY);
      else if (q && /^https?:\/\//.test(q)) localStorage.setItem(DEV_KEY, q.replace(/\/+$/, ''));
      const a = params.get('auth');
      if (a === 'clear') localStorage.removeItem(DEV_AUTH_KEY);
      else if (['jwt', 'link', 'cookie', 'auto'].includes(a)) localStorage.setItem(DEV_AUTH_KEY, a);
    } catch (e) { /* storage unavailable — fine */ }
  })();

  function devApiBase() {
    try { return localStorage.getItem(DEV_KEY); } catch (e) { return null; }
  }
  function configuredAuthMode() {
    let dev = null;
    try { dev = localStorage.getItem(DEV_AUTH_KEY); } catch (e) { /* fine */ }
    return dev || (CFG.MEMBERSHIP && CFG.MEMBERSHIP.AUTH && CFG.MEMBERSHIP.AUTH.mode) || 'auto';
  }
  function sameOriginAsApi() {
    try { return new URL(apiRoot()).origin === location.origin; } catch (e) { return false; }
  }
  // 'auto' resolves to the cookie bridge when the app is served from the
  // WordPress domain itself, and to plain link-out anywhere else.
  function authMode() {
    const m = configuredAuthMode();
    if (m !== 'auto') return m;
    return sameOriginAsApi() ? 'cookie' : 'link';
  }

  function apiRoot() {
    const dev = devApiBase();
    if (dev) return dev + '/wp-json';
    if (CFG.API_BASE) return CFG.API_BASE.replace(/\/+$/, '');
    return CFG.WP_BASE.replace(/\/+$/, '') + '/wp-json';
  }

  // ── Member auth ─────────────────────────────────────────────────────────
  // Two ways a reader can be a recognized member:
  //  'cookie' — the app is hosted on the WordPress domain and the reader is
  //    logged in on the website; a tiny admin-ajax bridge (see
  //    wordpress-snippet.php) hands the app a REST nonce, which we attach to
  //    reads so members-only content unlocks. No in-app login at all.
  //  'jwt' — explicit in-app sign-in; the issued token is stored locally and
  //    attached to reads. For off-domain hosting / native wrappers.
  const AUTH_KEY = 'dnvr_auth_v1';
  const WPAuth = {
    mode: authMode,
    // True when the in-app username/password form should exist.
    canFormSignIn() { return authMode() === 'jwt'; },
    enabled() { return authMode() === 'jwt' || authMode() === 'cookie'; },
    _read() { try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch (e) { return null; } },
    _cookie: null,            // {nonce, name} from the bridge, in-memory only
    isSignedIn() {
      const m = authMode();
      if (m === 'jwt') return !!WPAuth._read();
      if (m === 'cookie') return !!WPAuth._cookie;
      return false;
    },
    displayName() {
      if (authMode() === 'cookie') return (WPAuth._cookie && WPAuth._cookie.name) || null;
      const a = WPAuth._read();
      return (a && a.name) || null;
    },
    token() { const a = WPAuth._read(); return (a && a.token) || null; },
    onSessionExpired: null,   // app.js hooks this for a toast

    nonceEndpoint() {
      return (CFG.MEMBERSHIP && CFG.MEMBERSHIP.AUTH && CFG.MEMBERSHIP.AUTH.nonceEndpoint) ||
        apiRoot().replace(/\/wp-json$/, '') + '/wp-admin/admin-ajax.php?action=dnvr_app_nonce';
    },

    /**
     * Ask the site whether this browser is already logged in there (cookie
     * mode only). Resolves true if the member state CHANGED. Safe to call
     * any time — failures just mean "not signed in".
     */
    async probeCookie() {
      if (authMode() !== 'cookie') return false;
      const had = !!WPAuth._cookie;
      try {
        const res = await fetch(WPAuth.nonceEndpoint(), {
          credentials: 'include', headers: { Accept: 'application/json' }
        });
        const body = res.ok ? await res.json() : null;
        WPAuth._cookie = body && body.ok && body.nonce ? { nonce: body.nonce, name: body.name } : null;
      } catch (e) {
        WPAuth._cookie = null;
      }
      return !!WPAuth._cookie !== had;
    },

    async login(username, password) {
      const endpoint = (CFG.MEMBERSHIP && CFG.MEMBERSHIP.AUTH && CFG.MEMBERSHIP.AUTH.tokenEndpoint) ||
        apiRoot() + '/jwt-auth/v1/token';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ username, password })
      });
      let body = null;
      try { body = await res.json(); } catch (e) { /* non-JSON error page */ }
      if (!res.ok || !body || !body.token) {
        const el = document.createElement('div');
        el.innerHTML = (body && body.message) || '';
        throw new Error((el.textContent || '').trim() || 'Sign-in failed (HTTP ' + res.status + ')');
      }
      try {
        localStorage.setItem(AUTH_KEY, JSON.stringify({
          token: body.token,
          name: body.user_display_name || body.user_nicename || username
        }));
      } catch (e) { throw new Error('Couldn’t store the sign-in on this device.'); }
      return WPAuth.displayName();
    },

    signOut() { try { localStorage.removeItem(AUTH_KEY); } catch (e) { /* fine */ } }
  };

  async function getJSON(path, params, _retrying) {
    const url = new URL(apiRoot() + path);
    if (params) for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }
    const headers = { Accept: 'application/json' };
    const mode = authMode();
    const token = mode === 'jwt' && WPAuth.token();
    if (token) headers.Authorization = 'Bearer ' + token;
    const nonce = mode === 'cookie' && WPAuth._cookie && WPAuth._cookie.nonce;
    if (nonce) headers['X-WP-Nonce'] = nonce;
    const res = await fetch(url.toString(), {
      headers,
      credentials: mode === 'cookie' ? 'include' : 'same-origin'
    });
    if (!res.ok) {
      const authFailed = res.status === 401 || res.status === 403;
      // Expired JWT → drop it, tell the app, retry once anonymously.
      if (authFailed && token && !_retrying) {
        WPAuth.signOut();
        if (WPAuth.onSessionExpired) WPAuth.onSessionExpired();
        return getJSON(path, params, 'final');
      }
      // Expired REST nonce (they live ~a day) → re-probe the bridge once for
      // a fresh one; if the site session itself is gone, fall to anonymous.
      if (authFailed && nonce && !_retrying) {
        await WPAuth.probeCookie();
        if (WPAuth._cookie && WPAuth._cookie.nonce !== nonce) {
          return getJSON(path, params, 'refreshed');
        }
        WPAuth._cookie = null;
        if (WPAuth.onSessionExpired) WPAuth.onSessionExpired();
        return getJSON(path, params, 'final');
      }
      if (authFailed && nonce && _retrying === 'refreshed') {
        WPAuth._cookie = null;
        if (WPAuth.onSessionExpired) WPAuth.onSessionExpired();
        return getJSON(path, params, 'final');
      }
      const err = new Error('HTTP ' + res.status + ' from ' + url.pathname);
      err.status = res.status;
      throw err;
    }
    const totalPages = parseInt(res.headers.get('X-WP-TotalPages') || '', 10);
    const data = await res.json();
    return { data, totalPages: Number.isFinite(totalPages) ? totalPages : null };
  }

  // ── HTML handling ────────────────────────────────────────────────────────

  // WP returns titles/excerpts as HTML fragments; flatten to plain text.
  function textOf(html) {
    const el = document.createElement('div');
    el.innerHTML = html || '';
    return (el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  // Article bodies are rendered as HTML, so sanitize defensively even though
  // the source is the site's own API: drop script/style, strip inline event
  // handlers and javascript: URLs, lazy-load media, open links externally.
  const DROP_TAGS = ['script', 'style', 'link', 'meta', 'object', 'embed', 'form', 'input', 'button'];
  function sanitizeArticleHTML(html) {
    const doc = new DOMParser().parseFromString(html || '', 'text/html');
    DROP_TAGS.forEach(t => doc.querySelectorAll(t).forEach(el => el.remove()));
    doc.querySelectorAll('*').forEach(el => {
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on')) el.removeAttribute(attr.name);
        else if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(attr.value)) el.removeAttribute(attr.name);
      }
    });
    doc.querySelectorAll('a[href]').forEach(a => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener');
    });
    doc.querySelectorAll('img, iframe').forEach(el => {
      el.setAttribute('loading', 'lazy');
      el.removeAttribute('width');
      el.removeAttribute('height');
      if (el.tagName === 'IFRAME') el.setAttribute('referrerpolicy', 'no-referrer');
    });
    return doc.body.innerHTML;
  }

  function normalizePost(p) {
    const media = p._embedded && p._embedded['wp:featuredmedia'] && p._embedded['wp:featuredmedia'][0];
    const author = p._embedded && p._embedded.author && p._embedded.author[0];
    const sizes = media && media.media_details && media.media_details.sizes;
    const preferred = sizes && (sizes.medium_large || sizes.large || sizes.medium || sizes.full);
    // "Locked" = the API gave us no readable body. This covers both core WP
    // semantics (protected:true + empty content) and membership plugins that
    // simply blank/omit the body for non-members. When a signed-in member's
    // request returns the full body, the same article normalizes as unlocked.
    const rawContent = (p.content && p.content.rendered) || '';
    const hasBody = !!textOf(rawContent);
    return {
      id: p.id,
      date: p.date_gmt ? p.date_gmt + 'Z' : p.date,
      link: p.link,
      title: textOf(p.title && p.title.rendered) || '(untitled)',
      excerpt: textOf(p.excerpt && p.excerpt.rendered),
      content: hasBody ? sanitizeArticleHTML(rawContent) : '',
      protected: !hasBody,
      image: (preferred && preferred.source_url) || (media && media.source_url) || null,
      author: (author && author.name) || null,
      categoryIds: p.categories || [],
      demo: false
    };
  }

  // ── Public API ───────────────────────────────────────────────────────────

  const WPApi = {
    devApiBase,

    /**
     * Resolve config sections → live category IDs, fuzzily.
     * A category matches a keyword when the keyword is one of its slug/name
     * words, or (for keywords of 4+ chars) a substring of either — so config
     * 'nuggets' finds "Denver Nuggets" / denver-nuggets / nuggets-news.
     * Exact slug matches win; otherwise the biggest matching category does.
     * If fewer than three config sections match, tabs are topped up from the
     * site's largest categories so the feed always has real navigation.
     */
    async fetchSections() {
      const cats = [];
      for (let page = 1; page <= 3; page++) {
        const { data, totalPages } = await getJSON('/wp/v2/categories', {
          per_page: 100, page, hide_empty: true, _fields: 'id,name,slug,parent,count'
        });
        cats.push(...data);
        if (!totalPages || page >= totalPages) break;
      }

      const matches = (cat, keyword) => {
        const kw = String(keyword).toLowerCase();
        const slug = (cat.slug || '').toLowerCase();
        const name = (cat.name || '').toLowerCase();
        if (slug.split(/[-_]/).includes(kw) || name.split(/\s+/).includes(kw)) return true;
        return kw.length >= 4 && (slug.includes(kw) || name.includes(kw));
      };

      const out = [];
      const usedIds = new Set();
      for (const s of CFG.SECTIONS) {
        const keywords = [s.slug].concat(s.alt || []);
        const candidates = cats.filter(c =>
          !usedIds.has(c.id) && keywords.some(kw => matches(c, kw)));
        if (!candidates.length) continue;
        const cat = candidates.find(c => c.slug === s.slug) ||
          candidates.sort((a, b) => (b.count || 0) - (a.count || 0))[0];
        usedIds.add(cat.id);
        out.push({ slug: s.slug, label: s.label, id: cat.id });
      }

      WPApi.excludedIds = (CFG.EXCLUDED_SLUGS || [])
        .flatMap(slug => cats.filter(c => c.slug === slug)).map(c => c.id);

      if (out.length < 3) {
        const fillers = cats
          .filter(c => !usedIds.has(c.id) && c.slug !== 'uncategorized' &&
            !WPApi.excludedIds.includes(c.id))
          .sort((a, b) => (b.count || 0) - (a.count || 0))
          .slice(0, 7 - out.length);
        for (const cat of fillers) {
          usedIds.add(cat.id);
          out.push({ slug: cat.slug, label: cat.name, id: cat.id });
        }
      }
      return out;
    },

    excludedIds: [],

    /**
     * Fetch a feed page. categoryId null = all posts.
     * Returns { articles, hasMore }.
     */
    async fetchPosts({ categoryId = null, page = 1, search = '' } = {}) {
      const params = {
        per_page: CFG.POSTS_PER_PAGE,
        page,
        _embed: 'wp:featuredmedia,author'
      };
      if (categoryId) params.categories = categoryId;
      if (search) { params.search = search; params.orderby = 'relevance'; }
      if (!categoryId && WPApi.excludedIds.length) params.categories_exclude = WPApi.excludedIds.join(',');
      const { data, totalPages } = await getJSON('/wp/v2/posts', params);
      return {
        articles: data.map(normalizePost),
        hasMore: totalPages !== null ? page < totalPages : data.length === CFG.POSTS_PER_PAGE
      };
    },

    /** Fetch one post by id (deep links into an uncached article). */
    async fetchPost(id) {
      const { data } = await getJSON('/wp/v2/posts/' + id, { _embed: 'wp:featuredmedia,author' });
      return normalizePost(data);
    }
  };

  window.WPApi = WPApi;
  window.WPAuth = WPAuth;
})();
