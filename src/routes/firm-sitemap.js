// /sitemap-firms.xml: every live firm with a real description, and its Lawyers / Articles pages when it has them (a page with only a two-line stub stays out until it has one).
// Lets Google find new listings the day they go live, with no file to edit.
// Profiles without a real description yet (see src/lib/indexing.js) are left out and carry a noindex tag.
import { isIndexable } from '../lib/indexing.js';
import { tabsFor } from '../render/firm-tabs.js';
import { PAID_SQL } from '../lib/lawyers.js';

// One sitemap file may hold 50,000 addresses; we stop well short of that. If the table ever reaches the limit the file says so in a header and the log,
// and the answer is a sitemap index (see docs/ARCHITECTURE.md, "Search engines").
export const FIRM_SITEMAP_LIMIT = 15000;

export async function firmSitemap({ request, env }) {
  const origin = (env.SITE_ORIGIN || new URL(request.url).origin).replace(/\/+$/, '');
  try {
    const { results } = await env.DB.prepare(
      `SELECT slug, updated_at AS updatedAt, about, json_extract(data, '$.details') AS details,
        (SELECT COUNT(*) FROM firm_posts p JOIN firm_feeds f ON f.firm_slug = p.firm_slug WHERE p.firm_slug = firms.slug AND f.enabled = 1) AS posts
       FROM firms WHERE status = 'live' ORDER BY slug LIMIT ${FIRM_SITEMAP_LIMIT}`
    ).all();
    const truncated = results.length >= FIRM_SITEMAP_LIMIT;
    if (truncated) console.error(`firm sitemap reached its limit of ${FIRM_SITEMAP_LIMIT} firms: some firms are missing from it; split it into a sitemap index`);
    const listed = results.filter((r) => isIndexable(r.about));
    // How many lawyers each firm shows (a lawyer's own page is in /sitemap-lawyers.xml, not here). If the table is missing the sitemap simply has none.
    const counts = new Map();
    try {
      const { results: ls } = await env.DB.prepare(`SELECT firm_slug AS firm, COUNT(*) AS n FROM lawyers WHERE status = 'live' AND firm_slug IS NOT NULL AND (photo_url IS NOT NULL OR ${PAID_SQL}) GROUP BY firm_slug`).all();
      for (const l of ls) counts.set(l.firm, Number(l.n) || 0);
    } catch { /* no lawyers table yet */ }
    const day = (d) => { const t = d ? new Date(String(d).replace(' ', 'T') + 'Z') : null; return t && !Number.isNaN(t.getTime()) ? t.toISOString().slice(0, 10) : ''; };
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      listed.flatMap((r) => {
        let details = null;
        try { details = r.details ? JSON.parse(r.details) : null; } catch { /* a firm with unreadable details simply has no sub-pages */ }
        // The Overview, plus a page for each tab the firm has content for (the same rule the pages use, src/render/firm-tabs.js).
        const people = { length: counts.get(r.slug) || 0 };
        const lm = day(r.updatedAt) ? `<lastmod>${day(r.updatedAt)}</lastmod>` : '';
        const base = `${origin}/firms/${encodeURIComponent(r.slug)}`;
        return [
          ...tabsFor({ details }, Math.min(Number(r.posts) || 0, 20), people.length).map((t) => `  <url><loc>${base}${t === 'overview' ? '' : '/' + t}</loc>${lm}</url>`),
        ];
      }).slice(0, 49000).join('\n') + '\n</urlset>\n'; // one sitemap file holds at most 50,000 addresses
    return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=600', ...(truncated ? { 'x-sitemap-truncated': '1' } : {}) } });
  } catch (err) {
    console.error('firm sitemap failed', err);
    return new Response('Unavailable', { status: 503, headers: { 'retry-after': '60' } });
  }
}
