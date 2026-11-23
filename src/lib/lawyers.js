// Lawyers: one row each in `lawyers` (migrations/0003_lawyers.sql; the crawler tools/us-data/lawyers.py loads the ones a firm names on its own website).
// A lawyer is a listing of their own, apart from law firms: the page is /lawyers/<slug>, it may or may not be linked to a firm, and it is paid for by the lawyer.
// Everything read from the table goes through cleanLawyer, so a bad row can never put odd markup or a strange link on a page.
export const lawyerSlug = (name) => String(name || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

const NET = {
  linkedin: /^https:\/\/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9._%-]{2,100}\/?$/,
  x: /^https:\/\/(?:www\.)?(?:x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/?$/,
  facebook: /^https:\/\/(?:www\.)?facebook\.com\/[A-Za-z0-9.\-]{3,80}\/?$/,
  instagram: /^https:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9._]{1,30}\/?$/,
  youtube: /^https:\/\/(?:www\.)?youtube\.com\/(?:@[A-Za-z0-9._-]{2,50}|(?:c|user|channel)\/[A-Za-z0-9._-]{2,60})\/?$/,
};
export const NET_LABEL = { linkedin: 'LinkedIn', x: 'X', facebook: 'Facebook', instagram: 'Instagram', youtube: 'YouTube' };
const GENERIC_MAIL = /^(?:info|contact|office|admin|hello|mail|help|support|team|law|reception|intake|inquiries|inquiry|frontdesk|sales|marketing|billing|webmaster|service|services)$/i;
const text = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const httpsUrl = (u) => (typeof u === 'string' && /^https:\/\/[^\s"'<>]{4,500}$/.test(u) ? u : '');

export function cleanLawyer(r) {
  if (!r || typeof r !== 'object') return null;
  const slug = /^[a-z0-9][a-z0-9-]{1,60}$/.test(r.slug || '') ? r.slug : '';
  const name = text(r.name, 80);
  const photo = httpsUrl(r.photo_url ?? r.photo); // may be empty: a lawyer without a photo shows only on their own page, once they are on the Lawyer plan
  if (!slug || !name) return null;
  let socials = {}, areas = [];
  try { const s = typeof r.socials === 'string' ? JSON.parse(r.socials) : r.socials; if (s && typeof s === 'object') for (const k of Object.keys(NET)) if (typeof s[k] === 'string' && NET[k].test(s[k])) socials[k] = s[k]; } catch { /* no socials */ }
  try { const a = typeof r.areas === 'string' ? JSON.parse(r.areas) : r.areas; if (Array.isArray(a)) areas = a.map((x) => text(x, 60)).filter((x) => x.length >= 3 && !/[<>@]|https?:/i.test(x)).slice(0, 6); } catch { /* no areas */ }
  const digits = String(r.phone || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  const mail = text(r.email, 120).toLowerCase();
  return {
    slug, name,
    title: text(r.title, 60) || '',
    photo,
    phone: digits.length === 10 ? digits : '',
    email: /^[a-z0-9._%+-]{2,60}@[a-z0-9.-]{3,80}\.[a-z]{2,10}$/.test(mail) && !GENERIC_MAIL.test(mail.split('@')[0]) ? mail : '',
    socials, areas,
    sourceUrl: httpsUrl(r.source_url ?? r.sourceUrl),
    bio: String(r.bio || '').replace(/\r/g, '').split(/\n{2,}/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 8).map((p) => p.slice(0, 1500)),
    city: text(r.city, 60), state: /^[A-Z]{2}$/.test(r.state || '') ? r.state : '',
    firmSlug: /^[a-z0-9][a-z0-9-]{0,100}$/.test(r.firm_slug || '') ? r.firm_slug : '', firmName: text(r.firm_name, 120),
    paid: Number(r.paid) === 1 || r.paid === true, // on the Lawyer plan: has a page of their own
  };
}

export const showPhone = (d) => `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;

// A firm lists at most this many lawyers on its profile (the Firm plan includes ten). Extra names are not shown.
export const MAX_LAWYERS = 10;

// A lawyer's own page (/lawyers/<slug>) belongs to the Lawyer plan and to nothing else: the lawyer pays for it themselves, and it never depends on their
// firm being listed or on what plan the firm is on. A lawyer who has not paid is a plain card on their firm's Lawyers tab, with no link and no page (404).
export const PAID_SQL = "(paid_until IS NOT NULL AND paid_until > datetime('now'))";

const COLS = 'slug, name, title, city, state, firm_slug, photo_url, phone, email, socials, areas, source_url';

// The lawyers a firm names, for its Lawyers tab: paying lawyers first (so the cap never pushes one off), then the rest, oldest first. Only lawyers with a photo,
// or on the plan, are shown. The page works without them if the table is missing or the query fails.
export async function listLawyers(env, firmSlug) {
  try {
    const { results } = await env.DB.prepare(`SELECT ${COLS}, ${PAID_SQL} AS paid FROM lawyers WHERE firm_slug = ? AND status = 'live' AND (photo_url IS NOT NULL OR ${PAID_SQL}) ORDER BY paid DESC, id LIMIT ?`).bind(firmSlug, MAX_LAWYERS).all();
    return results.map(cleanLawyer).filter(Boolean);
  } catch (err) {
    console.error('lawyers lookup failed', firmSlug, err);
    return [];
  }
}

// One lawyer's own page: only a live lawyer who is on the Lawyer plan. Their firm (if they are linked to a live one) comes with them.
export async function getPaidLawyer(env, slug) {
  const row = await env.DB.prepare(`SELECT l.slug, l.name, l.title, l.city, l.state, l.firm_slug, l.photo_url, l.phone, l.email, l.socials, l.areas, l.bio, l.source_url, 1 AS paid,
      f.name AS firm_name, f.city AS firm_city, f.state AS firm_state
    FROM lawyers l LEFT JOIN firms f ON f.slug = l.firm_slug AND f.status = 'live'
    WHERE l.slug = ? AND l.status = 'live' AND ${PAID_SQL.replace(/paid_until/g, 'l.paid_until')}`).bind(slug).first();
  if (!row) return null;
  const l = cleanLawyer(row);
  if (!l) return null;
  if (!row.firm_name) { l.firmSlug = ''; l.firmName = ''; } // linked to a firm that is not listed (or not live): shown as an independent lawyer
  return l;
}
