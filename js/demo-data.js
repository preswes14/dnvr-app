/*
 * Demo/sample content — shown ONLY when the live feed can't be reached and
 * nothing is cached (e.g. first run with no network, or before the API is
 * configured). Every entry is explicitly labeled as sample content so it can
 * never be mistaken for real reporting. Safe to delete once live.
 */
window.DNVR_DEMO_ARTICLES = [
  {
    id: 'demo-1',
    demo: true,
    date: '2026-08-20T15:00:00Z',
    link: 'https://thednvr.com/',
    title: 'Sample article — this is placeholder content',
    excerpt: 'The app could not reach the live feed, so it is showing built-in sample data. Once the app is pointed at the live WordPress API, real articles appear here automatically.',
    content: '<p><strong>This is a built-in sample article, not real reporting.</strong></p><p>You are seeing it because the app could not reach the live article feed. The three usual reasons:</p><ul><li>No internet connection (and no previously cached articles).</li><li>The API origin in <code>js/config.js</code> is not set correctly.</li><li>The site’s firewall is blocking cross-origin requests — see the CORS section of <code>SETUP_FOR_DNVR.md</code> for the 15-minute fix.</li></ul><p>To verify the feed manually, open <code>&lt;your-site&gt;/wp-json/wp/v2/posts</code> in a browser — if JSON appears there, the app can read it.</p>',
    protected: false,
    image: null,
    author: 'Sample content',
    categoryIds: [],
    sectionLabel: 'Setup'
  },
  {
    id: 'demo-2',
    demo: true,
    date: '2026-08-20T14:00:00Z',
    link: 'https://thednvr.com/',
    title: 'Sample article — what readers will see here',
    excerpt: 'A quick tour of the app from the reader’s side: sections, saved articles, offline reading, and sharing.',
    content: '<p><strong>This is a built-in sample article, not real reporting.</strong></p><p>When live, this screen is a full article view: headline, byline, publish time, featured image, and the complete article body — with a share button and one-tap save for offline reading.</p><p>The feed behind it groups coverage into team sections (tabs along the top), supports search, and keeps recently read articles available offline automatically.</p>',
    protected: false,
    image: null,
    author: 'Sample content',
    categoryIds: [],
    sectionLabel: 'Setup'
  },
  {
    id: 'demo-3',
    demo: true,
    date: '2026-08-20T13:00:00Z',
    link: 'https://thednvr.com/',
    title: 'Sample article — members-only content stays members-only',
    excerpt: 'How the app treats subscriber articles: it shows exactly what the public API shows, and links members to the site to read in full.',
    content: '<p><strong>This is a built-in sample article, not real reporting.</strong></p><p>If an article’s body is restricted in the WordPress API (members-only), the app shows the public excerpt with a “Read on the site” button instead of the body. The app never works around access controls — it renders exactly what the site’s own public API returns.</p>',
    protected: false,
    image: null,
    author: 'Sample content',
    categoryIds: [],
    sectionLabel: 'Setup'
  }
];
