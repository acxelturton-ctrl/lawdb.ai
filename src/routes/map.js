// GET /api/map: a small, spread-out set of firm logos for the decorative map on /find-lawyers (home-map.js): [cityKey, x, y, logo].
// x and y are already projected onto the drawing in images/us-map.svg (src/lib/map-projection.js), so the page needs no map library.
// The map is only a picture, so it shows a fixed number of logos per state (more in Texas than Florida), taken one city at a time round-robin
// so every city in a state is represented before any city gets a second.
import { projection } from '../lib/map-projection.js';
import { cached } from '../lib/http.js';

const QUOTA = { TX: 70, FL: 25 }, QUOTA_OTHER = 15; // logos per state
const logoOf = (src) => (typeof src === 'string' && /^img\/[0-9a-f]{24}$/.test(src) ? `/${src}` : typeof src === 'string' && /^https:\/\/[^\s"'<>]{4,500}$/.test(src) && !/white/i.test(src.split('?')[0]) ? src : '');

export async function mapPoints({ env }) {
  const proj = projection();
  const { results } = await env.DB.prepare(
    "SELECT slug, city, state, json_extract(data, '$.lat') AS lat, json_extract(data, '$.lng') AS lng, json_extract(data, '$.src') AS src FROM firms WHERE status = 'live' ORDER BY state, city, slug LIMIT 5000"
  ).all();
  const byCity = new Map();
  for (const r of results) {
    const lat = Number(r.lat), lng = Number(r.lng), logo = logoOf(r.src);
    if (!logo || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const p = proj([lng, lat]);
    if (!p) continue; // not in the US
    const key = `${r.state}|${r.city}`;
    if (!byCity.has(key)) byCity.set(key, []);
    byCity.get(key).push([key, Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10, logo]);
  }
  const states = new Map();
  for (const [key, list] of byCity) {
    const st = key.split('|')[0];
    if (!states.has(st)) states.set(st, []);
    states.get(st).push(list);
  }
  const logos = [];
  for (const [st, lists] of states) {
    const max = QUOTA[st] ?? QUOTA_OTHER;
    let n = 0;
    for (let i = 0; n < max && lists.some((l) => i < l.length); i++) {
      for (const l of lists) if (i < l.length && n < max) { logos.push(l[i]); n++; }
    }
  }
  return cached({ w: 975, h: 610, logos }, 3600);
}
