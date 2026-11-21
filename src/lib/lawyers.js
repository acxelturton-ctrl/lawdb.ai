// Lawyers a firm shows on its own website, one row each in `firm_lawyers` (migrations/0003_lawyers.sql, loaded by tools/us-data/lawyers.py).
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
  const photo = httpsUrl(r.photo_url ?? r.photo);
  if (!slug || !name || !photo) return null; // a lawyer without a checked photo is never shown
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
  };
}

export const showPhone = (d) => `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;

// A firm's live lawyers, oldest first (the order the firm lists them). The page works without them if the table is missing or the query fails.
export async function listLawyers(env, firmSlug) {
  try {
    const { results } = await env.DB.prepare("SELECT slug, name, title, photo_url, phone, email, socials, areas, source_url FROM firm_lawyers WHERE firm_slug = ? AND status = 'live' ORDER BY id LIMIT 60").bind(firmSlug).all();
    return results.map(cleanLawyer).filter(Boolean);
  } catch (err) {
    console.error('lawyers lookup failed', firmSlug, err);
    return [];
  }
}
