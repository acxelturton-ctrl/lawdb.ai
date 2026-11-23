// /sitemap-lawyers.xml: the pages of lawyers who are on the Lawyer plan, and no others.
import { PAID_SQL } from '../lib/lawyers.js';

export async function lawyerSitemap({ request, env }) {
  const origin = (env.SITE_ORIGIN || new URL(request.url).origin).replace(/\/+$/, '');
  try {
    const { results } = await env.DB.prepare(`SELECT slug, updated_at AS updatedAt FROM lawyers WHERE status = 'live' AND ${PAID_SQL} ORDER BY slug LIMIT 40000`).all();
    const day = (d) => { const t = d ? new Date(String(d).replace(' ', 'T') + 'Z') : null; return t && !Number.isNaN(t.getTime()) ? t.toISOString().slice(0, 10) : ''; };
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      results.map((r) => `  <url><loc>${origin}/lawyers/${encodeURIComponent(r.slug)}</loc>${day(r.updatedAt) ? `<lastmod>${day(r.updatedAt)}</lastmod>` : ''}</url>`).join('\n') + '\n</urlset>\n';
    return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=600' } });
  } catch (err) {
    console.error('lawyer sitemap failed', err);
    return new Response('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n', { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=60' } }); // no table yet: an empty sitemap
  }
}
