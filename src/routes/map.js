// GET /api/map: every live firm as a point for the home page map (public/home-map.js): [slug, name, city, state, x, y, logo].
// x and y are already projected onto the drawing in images/us-map.svg (src/lib/map-projection.js), so the page needs no map library.
// The logo is the firm's own picture (a LawDB image or an https address on its site), or '' when it has none (the page draws initials).
import { projection } from '../lib/map-projection.js';
import { cached } from '../lib/http.js';

const logoOf = (src) => (typeof src === 'string' && /^img\/[0-9a-f]{24}$/.test(src) ? `/${src}` : typeof src === 'string' && /^https:\/\/[^\s"'<>]{4,500}$/.test(src) ? src : '');

export async function mapPoints({ env }) {
  const proj = projection();
  const { results } = await env.DB.prepare(
    "SELECT slug, json_extract(data, '$.name') AS name, city, state, json_extract(data, '$.lat') AS lat, json_extract(data, '$.lng') AS lng, json_extract(data, '$.src') AS src FROM firms WHERE status = 'live' ORDER BY state, city, slug LIMIT 5000"
  ).all();
  const pts = [];
  for (const r of results) {
    const lat = Number(r.lat), lng = Number(r.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !r.name) continue;
    const p = proj([lng, lat]);
    if (!p) continue; // not in the US
    pts.push([r.slug, String(r.name).slice(0, 80), r.city, r.state, Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10, logoOf(r.src)]);
  }
  return cached({ w: 975, h: 610, firms: pts }, 600);
}
