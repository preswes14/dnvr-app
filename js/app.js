/*
 * DNVR News — app UI.
 *
 * Vanilla JS single-page app, hash-routed so it runs on any static host:
 *   #/            feed (section tabs, search, infinite scroll)
 *   #/article/ID  full article
 *   #/saved       saved-for-offline list
 *   #/about       about + links + install help
 */
(function () {
  'use strict';

  const CFG = window.DNVR_CONFIG;
  const $ = sel => document.querySelector(sel);

  // ── State ────────────────────────────────────────────────────────────────
  const state = {
    sections: [],          // [{slug,label,id}]
    sectionsLoaded: false,
    section: null,         // active section object or null = All
    search: '',
    articles: [],
    page: 1,
    hasMore: false,
    loading: false,
    feedError: null,       // Error when the last feed fetch failed
    demoMode: false,
    lastFetched: 0,
    feedScroll: 0,
    byId: new Map()        // article cache for detail view
  };

  // ── Small utilities ──────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function timeAgo(iso) {
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return '';
    const mins = Math.round((Date.now() - then) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    const days = Math.round(hrs / 24);
    if (days < 7) return days + 'd ago';
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function fullDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem(key));
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; }
  }

  function sectionLabelFor(article) {
    if (article.sectionLabel) return article.sectionLabel;
    for (const s of state.sections) {
      if (article.categoryIds && article.categoryIds.includes(s.id)) return s.label;
    }
    return null;
  }

  // ── Saved articles (offline reading list) ────────────────────────────────
  const SAVED_KEY = 'dnvr_saved_v1';
  function savedList() { return store(SAVED_KEY) || []; }
  function isSaved(id) { return savedList().some(a => String(a.id) === String(id)); }
  function toggleSaved(article) {
    let list = savedList();
    if (isSaved(article.id)) {
      list = list.filter(a => String(a.id) !== String(article.id));
      toast('Removed from Saved');
    } else {
      list.unshift(article);
      if (list.length > 100) list = list.slice(0, 100);
      toast('Saved for offline reading');
    }
    store(SAVED_KEY, list);
    updateNavBadge();
  }

  // ── Feed cache (instant boot + offline fallback, independent of SW) ─────
  const FEED_CACHE_KEY = 'dnvr_feed_cache_v1';
  function cacheFeed() {
    if (state.demoMode || state.search || state.section) return;
    store(FEED_CACHE_KEY, {
      at: Date.now(),
      sections: state.sections,
      articles: state.articles.slice(0, CFG.POSTS_PER_PAGE)
    });
  }
  function readFeedCache() { return store(FEED_CACHE_KEY); }

  // ── Data loading ─────────────────────────────────────────────────────────
  async function ensureSections() {
    if (state.sectionsLoaded) return;
    try {
      state.sections = await WPApi.fetchSections();
      state.sectionsLoaded = true;
    } catch (e) {
      // Categories failing is non-fatal — feed can still load under "All".
      const cached = readFeedCache();
      if (cached && cached.sections) state.sections = cached.sections;
    }
  }

  async function loadFeed({ append = false } = {}) {
    if (state.loading) return;
    state.loading = true;
    state.feedError = null;
    if (!append) { state.page = 1; render(); }
    else renderFeedFooter();
    try {
      await ensureSections();
      const res = await WPApi.fetchPosts({
        categoryId: state.section && state.section.id,
        page: state.page,
        search: state.search
      });
      state.demoMode = false;
      state.hasMore = res.hasMore;
      state.lastFetched = Date.now();
      res.articles.forEach(a => state.byId.set(String(a.id), a));
      state.articles = append ? state.articles.concat(res.articles) : res.articles;
      cacheFeed();
    } catch (e) {
      state.feedError = e;
      if (!append && !state.articles.length) {
        const cached = readFeedCache();
        if (cached && cached.articles && cached.articles.length && !state.search && !state.section) {
          state.articles = cached.articles;
          state.lastFetched = cached.at;
          state.articles.forEach(a => state.byId.set(String(a.id), a));
        } else if (!state.search) {
          state.demoMode = true;
          state.articles = window.DNVR_DEMO_ARTICLES.slice();
          state.articles.forEach(a => state.byId.set(String(a.id), a));
        }
      }
      state.hasMore = false;
    }
    state.loading = false;
    if (currentRoute().name === 'feed') render();
  }

  // ── Routing ──────────────────────────────────────────────────────────────
  function currentRoute() {
    const h = location.hash.replace(/^#\/?/, '');
    if (h.startsWith('article/')) return { name: 'article', id: h.slice(8) };
    if (h === 'saved') return { name: 'saved' };
    if (h === 'about') return { name: 'about' };
    return { name: 'feed' };
  }

  window.addEventListener('hashchange', () => {
    const r = currentRoute();
    if (r.name !== 'feed') window.scrollTo(0, 0);
    render();
    if (r.name === 'feed') requestAnimationFrame(() => window.scrollTo(0, state.feedScroll));
  });

  function goToArticle(id) {
    state.feedScroll = window.scrollY;
    location.hash = '#/article/' + id;
  }

  // ── Rendering ────────────────────────────────────────────────────────────
  function render() {
    const r = currentRoute();
    document.body.dataset.route = r.name;
    const view = $('#view');
    if (r.name === 'feed') view.innerHTML = feedHTML();
    else if (r.name === 'article') { view.innerHTML = articleHTML(r.id); hydrateArticle(r.id); }
    else if (r.name === 'saved') view.innerHTML = savedHTML();
    else view.innerHTML = aboutHTML();
    updateNav(r.name);
    if (r.name === 'feed') wireFeed();
  }

  // — Feed —
  function chipsHTML() {
    const chip = (label, active, idx) =>
      `<button class="chip${active ? ' active' : ''}" data-section="${idx}">${esc(label)}</button>`;
    let html = chip('All', !state.section, -1);
    state.sections.forEach((s, i) => { html += chip(s.label, state.section === s, i); });
    return `<nav class="chips" aria-label="Sections">${html}</nav>`;
  }

  function cardHTML(a) {
    const sec = sectionLabelFor(a);
    return `
    <article class="card" data-id="${esc(a.id)}" tabindex="0" role="link" aria-label="${esc(a.title)}">
      ${a.image ? `<div class="card-img"><img src="${esc(a.image)}" alt="" loading="lazy"></div>` : ''}
      <div class="card-body">
        <div class="card-meta">
          ${sec ? `<span class="badge">${esc(sec)}</span>` : ''}
          ${a.demo ? `<span class="badge demo">SAMPLE</span>` : ''}
          <span class="when">${esc(timeAgo(a.date))}</span>
        </div>
        <h2>${esc(a.title)}</h2>
        ${a.excerpt ? `<p class="excerpt">${esc(a.excerpt)}</p>` : ''}
        ${a.author ? `<div class="byline">${esc(a.author)}</div>` : ''}
      </div>
    </article>`;
  }

  function skeletonHTML(n) {
    let s = '';
    for (let i = 0; i < n; i++) {
      s += `<div class="card skeleton"><div class="card-img shimmer"></div><div class="card-body">
        <div class="line shimmer w40"></div><div class="line shimmer w90 tall"></div>
        <div class="line shimmer w70"></div></div></div>`;
    }
    return s;
  }

  function feedNoticeHTML() {
    if (state.demoMode) {
      return `<div class="notice warn"><strong>Showing sample content.</strong>
        The live article feed isn’t reachable right now. If you run this app, see the
        first sample article below for setup pointers.</div>`;
    }
    if (state.feedError && state.articles.length) {
      return `<div class="notice">You’re offline — showing the most recent articles from
        ${esc(timeAgo(state.lastFetched))}. <button class="linklike" id="retryBtn">Retry</button></div>`;
    }
    return '';
  }

  function feedHTML() {
    const listing = state.loading && !state.articles.length
      ? skeletonHTML(5)
      : state.articles.map(cardHTML).join('') ||
        `<div class="empty">${state.search ? 'No articles match “' + esc(state.search) + '”.' : 'No articles found.'}</div>`;
    return `
      ${chipsHTML()}
      ${state.search ? `<div class="search-note">Results for “${esc(state.search)}”
        <button class="linklike" id="clearSearch">Clear</button></div>` : ''}
      ${feedNoticeHTML()}
      <div class="feed">${listing}</div>
      <div class="feed-foot" id="feedFoot">${feedFootHTML()}</div>
      <div id="sentinel" aria-hidden="true"></div>`;
  }

  function feedFootHTML() {
    if (state.loading && state.articles.length) return `<div class="spinner" role="status" aria-label="Loading"></div>`;
    if (state.hasMore) return `<button class="btn subtle" id="moreBtn">Load more</button>`;
    if (state.articles.length && !state.demoMode) return `<div class="feed-end">You’re all caught up.</div>`;
    return '';
  }
  function renderFeedFooter() { const f = $('#feedFoot'); if (f) f.innerHTML = feedFootHTML(); }

  let observer = null;
  function wireFeed() {
    const feed = $('#view');
    feed.querySelectorAll('.card[data-id]').forEach(card => {
      const open = () => goToArticle(card.dataset.id);
      card.addEventListener('click', open);
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
    feed.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
      const idx = parseInt(chip.dataset.section, 10);
      state.section = idx >= 0 ? state.sections[idx] : null;
      state.articles = [];
      window.scrollTo(0, 0);
      loadFeed();
    }));
    const more = $('#moreBtn');
    if (more) more.addEventListener('click', loadMore);
    const retry = $('#retryBtn');
    if (retry) retry.addEventListener('click', () => { state.articles = []; loadFeed(); });
    const clearS = $('#clearSearch');
    if (clearS) clearS.addEventListener('click', () => { state.search = ''; $('#searchInput').value = ''; state.articles = []; loadFeed(); });

    if (observer) observer.disconnect();
    const sentinel = $('#sentinel');
    if (sentinel && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver(entries => {
        if (entries.some(e => e.isIntersecting)) loadMore();
      }, { rootMargin: '600px' });
      observer.observe(sentinel);
    }
  }

  function loadMore() {
    if (!state.hasMore || state.loading || state.demoMode) return;
    state.page += 1;
    loadFeed({ append: true });
  }

  // — Article —
  function articleHTML(id) {
    const a = state.byId.get(String(id)) || savedList().find(x => String(x.id) === String(id));
    if (!a) return `<div class="article-shell"><div class="feed">${skeletonHTML(1)}</div></div>`;
    const saved = isSaved(a.id);
    const sec = sectionLabelFor(a);
    const body = a.protected
      ? `<div class="paywall">
           <p>${a.excerpt ? esc(a.excerpt) : 'This article is available on the website.'}</p>
           <p class="paywall-note">The full article is for members — read it on the site with your membership.</p>
           <a class="btn primary" href="${esc(a.link)}" target="_blank" rel="noopener">Read on ${esc(CFG.SITE_NAME)} ↗</a>
         </div>`
      : `<div class="article-body">${a.content}</div>
         <a class="btn subtle openlink" href="${esc(a.link)}" target="_blank" rel="noopener">Open on ${esc(CFG.SITE_NAME)} ↗</a>`;
    return `
    <article class="article-shell">
      <div class="article-actions">
        <button class="iconbtn" id="backBtn" aria-label="Back">‹ Back</button>
        <span class="spacer"></span>
        <button class="iconbtn" id="shareBtn" aria-label="Share">Share</button>
        <button class="iconbtn${saved ? ' on' : ''}" id="saveBtn" aria-pressed="${saved}">${saved ? '★ Saved' : '☆ Save'}</button>
      </div>
      <div class="article-head">
        <div class="card-meta">
          ${sec ? `<span class="badge">${esc(sec)}</span>` : ''}
          ${a.demo ? `<span class="badge demo">SAMPLE</span>` : ''}
        </div>
        <h1>${esc(a.title)}</h1>
        <div class="article-meta">${a.author ? esc(a.author) + ' · ' : ''}${esc(fullDate(a.date))}</div>
      </div>
      ${a.image ? `<img class="article-hero" src="${esc(a.image)}" alt="">` : ''}
      ${body}
    </article>`;
  }

  async function hydrateArticle(id) {
    let a = state.byId.get(String(id)) || savedList().find(x => String(x.id) === String(id));
    if (!a && /^\d+$/.test(id)) {
      try {
        a = await WPApi.fetchPost(id);
        state.byId.set(String(a.id), a);
        if (currentRoute().name === 'article') render();
        return;
      } catch (e) {
        $('#view').innerHTML = `<div class="article-shell"><div class="article-actions">
          <button class="iconbtn" id="backBtn">‹ Back</button></div>
          <div class="empty">Couldn’t load this article. Check your connection and try again.</div></div>`;
      }
    }
    const back = $('#backBtn');
    if (back) back.addEventListener('click', () => {
      if (history.length > 1) history.back(); else location.hash = '#/';
    });
    if (!a) return;
    const save = $('#saveBtn');
    if (save) save.addEventListener('click', () => { toggleSaved(a); render(); });
    const share = $('#shareBtn');
    if (share) share.addEventListener('click', async () => {
      const payload = { title: a.title, url: a.link };
      try {
        if (navigator.share) await navigator.share(payload);
        else { await navigator.clipboard.writeText(a.link); toast('Link copied'); }
      } catch (e) { /* user canceled share sheet */ }
    });
  }

  // — Saved —
  function savedHTML() {
    const list = savedList();
    return `
      <h1 class="page-title">Saved</h1>
      <p class="page-sub">Articles you save are stored on this device and readable offline.</p>
      <div class="feed">${list.length ? list.map(cardHTML).join('') : '<div class="empty">Nothing saved yet. Tap ☆ Save on any article.</div>'}</div>`;
  }

  // — About —
  function aboutHTML() {
    const iosNotInstalled = /iphone|ipad|ipod/i.test(navigator.userAgent) &&
      !window.matchMedia('(display-mode: standalone)').matches && !navigator.standalone;
    return `
      <h1 class="page-title">${esc(CFG.SITE_NAME)}</h1>
      <p class="page-sub">${esc(CFG.SITE_TAGLINE)}</p>
      <div class="about-card">
        <p>This app brings the news and articles from ${esc(CFG.SITE_NAME)} to your home screen —
        fast, readable, and available offline. All reporting lives on
        <a href="${esc(CFG.WP_BASE)}" target="_blank" rel="noopener">${esc(CFG.WP_BASE.replace(/^https?:\/\//, ''))}</a>.</p>
      </div>
      ${iosNotInstalled ? `
      <div class="about-card">
        <h3>Add to your Home Screen</h3>
        <p>Open the <strong>Share</strong> menu in Safari and choose
        <strong>“Add to Home Screen”</strong> — the app installs like any other,
        with its own icon and full-screen reading.</p>
      </div>` : ''}
      <div class="about-card">
        <h3>Elsewhere</h3>
        <ul class="linklist">
          ${(CFG.LINKS || []).map(l => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a></li>`).join('')}
        </ul>
      </div>
      <div class="about-foot">Reader app v1.0${WPApi.devApiBase() ? ' · dev API: ' + esc(WPApi.devApiBase()) : ''}</div>`;
  }

  // — Bottom nav —
  function updateNav(routeName) {
    document.querySelectorAll('.nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.route === routeName ||
        (routeName === 'article' && b.dataset.route === 'feed'));
    });
  }
  function updateNavBadge() {
    const n = savedList().length;
    const badge = $('#savedCount');
    if (badge) { badge.textContent = n || ''; badge.style.display = n ? '' : 'none'; }
  }

  // ── Search box ───────────────────────────────────────────────────────────
  function wireChrome() {
    document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.route === 'feed') { location.hash = '#/'; window.scrollTo(0, 0); }
      else location.hash = '#/' + b.dataset.route;
    }));
    const input = $('#searchInput');
    const form = $('#searchForm');
    form.addEventListener('submit', e => {
      e.preventDefault();
      const q = input.value.trim();
      if (q === state.search) return;
      state.search = q;
      state.section = null;
      state.articles = [];
      location.hash = '#/';
      loadFeed();
      input.blur();
    });
    $('#brandBtn').addEventListener('click', () => {
      location.hash = '#/';
      window.scrollTo(0, 0);
      if (Date.now() - state.lastFetched > 30000) { state.articles = []; loadFeed(); }
    });
  }

  // Refresh a stale feed when the app comes back to the foreground.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !CFG.REFRESH_AFTER_MINUTES) return;
    const staleMs = CFG.REFRESH_AFTER_MINUTES * 60000;
    if (Date.now() - state.lastFetched > staleMs && currentRoute().name === 'feed' &&
        !state.search && window.scrollY < 200) {
      loadFeed();
    }
  });

  // ── Boot ─────────────────────────────────────────────────────────────────
  function boot() {
    $('#brandName').textContent = CFG.SITE_NAME;
    document.title = CFG.SITE_NAME + ' — News';
    wireChrome();
    updateNavBadge();

    // Instant paint from cache, then refresh from network.
    const cached = readFeedCache();
    if (cached && cached.articles && cached.articles.length) {
      state.sections = cached.sections || [];
      state.articles = cached.articles;
      state.lastFetched = cached.at;
      state.articles.forEach(a => state.byId.set(String(a.id), a));
    }
    render();
    loadFeed();

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(() => { /* non-fatal */ });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
