// Short firm addresses: lawdb.ai/<handle>, the way a firm is known on social media (smithlaw, not smith-law-firm-miami-fl).
//
// The handle comes from, in this order: the firm's Instagram, X, Facebook, LinkedIn company page and YouTube handles, then its website's name.
// A handle is only used when it plainly belongs to the firm (it contains a distinctive word of the firm's name, or the name's initials), so a
// keyword domain such as criminaldefenseattorneytampa.com or a stray social page is never used. A city on the end is cut off, and so is
// "llp" / "pllc". With nothing usable the firm's own name is used, without its city, state and "PA/PLLC" style endings.
// When two firms want the same handle the first keeps it and the next adds its state (smithlaw-tx), then a number.
//
// shortenSlugs() runs from the 5-minute cron in small batches and only while the owner has turned it on (site_settings.slug_shorten_batch > 0).
// Every change goes through renameFirmSlug, so the old address becomes a permanent redirect and nothing breaks.
import { renameFirmSlug, SLUG_MIN } from './firm-slug.js';
import { setting, setSetting } from './marketplace.js';
import { isReserved } from './reserved-paths.js';

const HANDLE_LEGAL = ['llp', 'pllc', 'llc', 'lpa', 'pllp', 'apc', 'plc', 'chtd', 'ltd'];
const NAME_LEGAL = new Set([...HANDLE_LEGAL, 'pa', 'pc', 'lp', 'sc', 'pl', 'inc', 'corp', 'co', 'p', 'a']);
const GENERIC = new Set(['law', 'laws', 'firm', 'firms', 'office', 'offices', 'the', 'and', 'of', 'at', 'attorney', 'attorneys', 'lawyer', 'lawyers',
  'group', 'associates', 'legal', 'team', 'counsel', 'esq', 'esquire', ...NAME_LEGAL]);
const NETWORK_ORDER = ['instagram', 'x', 'facebook', 'linkedin', 'youtube'];
const HANDLE_MIN = 3, HANDLE_MAX = 30;

const ascii = (s) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const alnum = (s) => ascii(s).replace(/[^a-z0-9]/g, '');
const words = (s) => ascii(s).replace(/&/g, ' and ').split(/[^a-z0-9]+/).filter(Boolean);

// The distinctive words of a firm's name ("Dungan & Le Fevre Co Lpa" -> dungan, fevre).
export const nameTokens = (name) => words(name).filter((t) => t.length >= 3 && !GENERIC.has(t));

function stripEnds(handle, cityN) {
  let s = handle;
  for (let again = true; again;) {
    again = false;
    for (const l of HANDLE_LEGAL) if (s.endsWith(l) && s.length - l.length >= 4) { s = s.slice(0, -l.length); again = true; break; }
    if (cityN.length >= 4 && s.endsWith(cityN) && s.length - cityN.length >= 4) { s = s.slice(0, -cityN.length); again = true; }
  }
  return s;
}

// The handle in a social profile address, or null (a numeric page id, a personal profile, a share link ...).
export function socialHandle(network, url) {
  let u; try { u = new URL(url); } catch { return null; }
  const seg = u.pathname.split('/').filter(Boolean);
  if (!seg.length) return null;
  const first = seg[0].toLowerCase();
  if (network === 'instagram' || network === 'x') return seg[0].replace(/^@/, '');
  if (network === 'facebook') {
    if (['profile.php', 'pages', 'people', 'p', 'groups', 'public'].includes(first) || /^\d+$/.test(seg[0])) return null;
    return seg[0].replace(/-\d{6,}$/, '');
  }
  if (network === 'linkedin') return first === 'company' && seg[1] ? seg[1] : null;   // /in/ is a person, not the firm
  if (network === 'youtube') {
    if (seg[0].startsWith('@')) return seg[0].slice(1);
    return ['c', 'user'].includes(first) && seg[1] ? seg[1] : null;
  }
  return null;
}

// "https://www.smithlaw.com/" -> "smithlaw"
export function domainLabel(website) {
  let host; try { host = new URL(/^https?:/i.test(website) ? website : 'https://' + website).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; }
  const parts = host.split('.');
  if (parts.length < 2) return null;
  const sld = parts.length >= 3 && ['co', 'com', 'org', 'net'].includes(parts[parts.length - 2]) && parts[parts.length - 1].length === 2 ? parts[parts.length - 3] : parts[parts.length - 2];
  return alnum(sld) || null;
}

function belongs(cand, name) {
  if (cand.length < HANDLE_MIN || cand.length > HANDLE_MAX) return false;
  const tokens = nameTokens(name);
  if (tokens.some((t) => cand.includes(t))) return true;
  const initials = words(name).filter((t) => !GENERIC.has(t)).map((t) => t[0]).join('');
  return initials.length >= 3 && cand === initials;
}

// The firm's name as an address, without city/state or "PA/PLLC" endings.
export function nameSlug(name, city) {
  let w = words(name);
  while (w.length > 1 && NAME_LEGAL.has(w[w.length - 1])) w.pop();
  if (w[0] === 'the' && w.length > 2) w.shift();
  const c = words(city);
  if (c.length && w.length > c.length + 1 && w.slice(-c.length).join('') === c.join('')) w = w.slice(0, -c.length);
  let s = w.join('-');
  if (s.length > 40) s = s.slice(0, 40).replace(/-[^-]*$/, '');
  return s;
}

// The address a firm should have, before any clash with another firm is settled: { slug, source }.
export function baseHandle(firm) {
  const { name = '', city = '', website = '', social = {} } = firm;
  const cityN = alnum(city);
  for (const net of NETWORK_ORDER) {
    const h = social?.[net] ? socialHandle(net, social[net]) : null;
    const cand = h ? stripEnds(alnum(h), cityN) : '';
    if (cand && belongs(cand, name)) return { slug: cand, source: net };
  }
  const d = website ? domainLabel(website) : null;
  const cand = d ? stripEnds(d, cityN) : '';
  if (cand && belongs(cand, name)) return { slug: cand, source: 'website' };
  const n = nameSlug(name, city);
  return n.length >= SLUG_MIN ? { slug: n, source: 'name' } : { slug: '', source: 'none' };
}

// Settles a clash: smithlaw, then smithlaw-tx, then smithlaw-tx-2 ... `isFree` says whether an address is unused (the firm's own address counts as free).
export async function uniqueHandle(base, state, isFree) {
  if (!base) return null;
  const st = alnum(state).slice(0, 2);
  const tries = [base, ...(st ? [`${base}-${st}`] : [])];
  for (const t of tries) if (await isFree(t)) return t;
  for (let i = 2; i < 50; i++) { const t = `${st ? `${base}-${st}` : base}-${i}`; if (await isFree(t)) return t; }
  return null;
}

// ---------------------------------------------------------------- the cron job
export const BATCH_MAX = 150;

export async function shortenSlugs(env) {
  const limit = Math.min(BATCH_MAX, Math.max(0, parseInt(await setting(env, 'slug_shorten_batch', '0'), 10) || 0));
  if (!limit) return null;
  const cursor = await setting(env, 'slug_shorten_cursor', '');
  const rows = (await env.DB.prepare('SELECT slug, name, city, state, data FROM firms WHERE slug > ? ORDER BY slug LIMIT ?').bind(cursor, limit).all()).results;
  let stats = {}; try { stats = JSON.parse(await setting(env, 'slug_shorten_stats', '{}')) || {}; } catch { stats = {}; }
  stats = { renamed: 0, unchanged: 0, errors: 0, ...stats };
  if (!rows.length) { await setSetting(env, 'slug_shorten_batch', '0'); stats.finished = new Date().toISOString(); await setSetting(env, 'slug_shorten_stats', JSON.stringify(stats)); return stats; }

  for (const r of rows) {
    try {
      let d = {}; try { d = JSON.parse(r.data) || {}; } catch { d = {}; }
      const social = typeof d.social === 'string' ? JSON.parse(d.social) : d.social;
      const { slug: base } = baseHandle({ name: r.name, city: r.city, website: d.website, social });
      const isFree = async (s) => !isReserved(s) && (s === r.slug || !(await env.DB.prepare('SELECT 1 FROM firms WHERE slug = ? UNION ALL SELECT 1 FROM firm_redirects WHERE old_slug = ?').bind(s, s).first()));
      const next = await uniqueHandle(base, r.state, isFree);
      if (!next || next === r.slug) { stats.unchanged++; continue; }
      await renameFirmSlug(env, null, r.slug, next);
      stats.renamed++;
    } catch (err) { stats.errors++; stats.lastError = `${r.slug}: ${String(err.message || err).slice(0, 160)}`; }
  }
  await setSetting(env, 'slug_shorten_cursor', rows[rows.length - 1].slug);
  await setSetting(env, 'slug_shorten_stats', JSON.stringify(stats));
  return stats;
}
