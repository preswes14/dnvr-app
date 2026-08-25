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
      else if (a === 'jwt' || a === 'link') localStorage.setItem(DEV_AUTH_KEY, a);
    } catch (e) { /* storage unavailable — fine */ }
  })();

  function devApiBase() {
    try { return localStorage.getItem(DEV_KEY); } catch (e) { return null; }
  }
  function authMode() {
    let dev = null;
    try { dev = localStorage.getItem(DEV_AUTH_KEY); } catch (e) { /* fine */ }
    return dev || (CFG.MEMBERSHIP && CFG.MEMBERSHIP.AUTH && CFG.MEMBERSHIP.AUTH.mode) || 'link';
  }

  function apiRoot() {
    const dev = devApiBase();
    if (dev) return dev + '/wp-json';
    if (CFG.API_BASE) return CFG.API_BASE.replace(/\/+$/, '');
    return CFG.WP_BASE.replace(/\/+$/, '') + '/wp-json';
  }

  // ── Member auth (scaffold — active only when auth mode is 'jwt') ────────
  // Stores the JWT + display name locally after a successful sign-in and
  // attaches it to API reads so members-only content unlocks in-app.
  const AUTH_KEY = 'dnvr_auth_v1';
  const WPAuth = {
    enabled() { return authMode() === 'jwt'; },
    _read() { try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch (e) { return null; } },
    isSignedIn() { return !!(WPAuth.enabled() && WPAuth._read()); },
    displayName() { const a = WPAuth._read(); return (a && a.name) || null; },
    token() { const a = WPAuth._read(); return (a && a.token) || null; },
    onSessionExpired: null,   // app.js hooks this for a toast

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
    const token = WPAuth.enabled() && WPAuth.token();
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch(url.toString(), { headers });
    if (!res.ok) {
      // An expired/revoked token can make reads fail — drop it, tell the
      // app, and retry the request once anonymously.
      if ((res.status === 401 || res.status === 403) && token && !_retrying) {
        WPAuth.signOut();
        if (WPAuth.onSessionExpired) WPAuth.onSessionExpired();
        return getJSON(path, params, true);
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
     * Resolve config section slugs → live category IDs.
     * Returns [{slug, label, id}] for sections that exist on the site,
     * de-duplicated by label (config may list slug variants).
     */
    async fetchSections() {
      const { data } = await getJSON('/wp/v2/categories', {
        per_page: 100, hide_empty: true, _fields: 'id,name,slug,parent,count'
      });
      const bySlug = new Map(data.map(c => [c.slug, c]));
      const out = [];
      const seenLabels = new Set();
      for (const s of CFG.SECTIONS) {
        const cat = bySlug.get(s.slug);
        if (!cat || seenLabels.has(s.label)) continue;
        seenLabels.add(s.label);
        out.push({ slug: s.slug, label: s.label, id: cat.id });
      }
      WPApi.excludedIds = (CFG.EXCLUDED_SLUGS || [])
        .map(slug => bySlug.get(slug)).filter(Boolean).map(c => c.id);
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
