// Tabs on a firm profile: /firms/<slug> (Overview), /firms/<slug>/lawyers, /firms/<slug>/articles.
// Every tab is its own page with its own address, title, description, canonical and breadcrumb, so each can be found in search on its own.
// A tab exists only when the firm has real content for it (tabsFor); a firm without it has no page at that address and no tab button, so nothing thin is published.
import { cleanDetails } from '../lib/details.js';
import { NET_LABEL, showPhone } from '../lib/lawyers.js';
import { lawyerAbout } from '../lib/lawyer-bio.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const MIN_LAWYERS = 2;  // a "Lawyers" page of one name would be a stub
export const MIN_ARTICLES = 3; // same for the articles page
export const TAB_SLUGS = ['lawyers', 'articles'];

// Which tabs this firm has. `postCount` is how many of its blog posts are shown on LawDB (the feed is switched on); `lawyerCount` is how many lawyers
// with their own profile (and checked photo) it has. One full profile is real content; a bare list needs MIN_LAWYERS names.
export function tabsFor(firm, postCount = 0, lawyerCount = 0) {
  const d = cleanDetails(firm && firm.details);
  const tabs = ['overview'];
  if (lawyerCount >= 1 || (d && d.lawyers && d.lawyers.length >= MIN_LAWYERS)) tabs.push('lawyers');
  if (postCount >= MIN_ARTICLES) tabs.push('articles');
  return tabs;
}

export const tabPath = (slug, tab, sub) => `/firms/${slug}${tab && tab !== 'overview' ? `/${tab}${sub ? `/${sub}` : ''}` : ''}`;

const LABEL = { overview: 'Overview', lawyers: 'Lawyers', articles: 'Articles' };

// The tab bar: real links to separate pages (not a script that hides and shows parts of one page). Nothing is drawn for a firm with only an Overview.
export function tabNavHtml(f, tabs, current) {
  if (!tabs || tabs.length < 2) return '';
  const items = tabs.map((t) => {
    const on = t === current;
    return `<li><a href="${esc(tabPath(f.slug, t))}"${on ? ' aria-current="page" class="on"' : ''}>${esc(LABEL[t])}</a></li>`;
  }).join('');
  return `<nav class="pf-ptabs" aria-label="${esc(f.name)} sections"><ul>${items}</ul></nav>`;
}

export const TABNAV_CSS = `<style>
.pf-ptabs{margin:0 0 18px;border-bottom:1px solid #e3dcc7;overflow-x:auto;-webkit-overflow-scrolling:touch}
.pf-ptabs ul{display:flex;gap:4px;margin:0;padding:0;list-style:none;white-space:nowrap}
.pf-ptabs a{display:block;padding:12px 16px;font-weight:600;font-size:15px;color:#5f5f5f;text-decoration:none;border-bottom:3px solid transparent;margin-bottom:-1px}
.pf-ptabs a:hover{color:#1a1a1a}
.pf-ptabs a.on{color:#1a1a1a;border-bottom-color:#b8892b}
.pf-ptabs a:focus-visible{outline:2px solid #b8892b;outline-offset:-2px}
.pf-tabpage h2{margin:0 0 6px;font-size:22px}
.pf-tabpage .pf-lead{margin:0 0 18px;color:#5f5f5f}
.tl-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;margin:0;padding:0;list-style:none}
.tl-card{display:flex;gap:12px;align-items:center;padding:14px;border:1px solid #e3dcc7;border-radius:12px;background:#fff}
.tl-av{flex:none;width:44px;height:44px;border-radius:50%;background:#f3ecd8;color:#7a5a14;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px}
.tl-card b{display:block;font-size:16px;line-height:1.25}
.tl-card span{display:block;color:#5f5f5f;font-size:14px}
.tl-note{margin:16px 0 0;color:#5f5f5f;font-size:14px}
.tl-areas{margin:22px 0 0}.tl-areas h3{margin:0 0 8px;font-size:17px}
.tl-areas ul{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none}
.tl-areas li{padding:6px 12px;border:1px solid #e3dcc7;border-radius:999px;font-size:14px;background:#faf6ea}
.tl-cta{margin:22px 0 0}
.tl-pro{padding:12px}.tl-ph{flex:none;line-height:0}.tl-ph img{width:64px;height:64px;border-radius:50%;object-fit:cover;background:#f3ecd8}
.tl-nm{color:#1a1a1a;text-decoration:none}.tl-nm:hover b{text-decoration:underline}
.tl-head{display:flex;gap:20px;align-items:center;flex-wrap:wrap;margin:0 0 18px}
.tl-big img{width:140px;height:140px;border-radius:16px;object-fit:cover;background:#f3ecd8;display:block}
.tl-role{margin:2px 0 12px;color:#5f5f5f}.tl-role a{color:inherit}
.tl-links{display:flex;flex-wrap:wrap;gap:8px}
.tl-soc{display:flex;flex-wrap:wrap;gap:14px;margin:12px 0 0;padding:0;list-style:none;font-size:14px}
.tl-p{margin:0 0 12px;line-height:1.65}
</style>`;

const initials = (name) => String(name).replace(/^(?:Me|Mr\.?|Ms\.?|Mrs\.?|Dr\.?)\s+/i, '').split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

// Page-level facts for a tab: title, description, heading text. Plain text; the caller escapes it.
export function tabMeta(f, tab, { lawyers = [], postCount = 0, lawyer = null, glance = null } = {}) {
  const where = `${f.city}, ${f.state}`;
  if (tab === 'lawyers' && lawyer) {
    const about = lawyerAbout({ lawyer, firmName: f.name, city: f.city, state: f.state, firmAreas: (glance && glance.areas) || [] });
    return {
      title: `${lawyer.name}${lawyer.title ? ` - ${lawyer.title}` : ''} at ${f.name} | ${where} | LawDB`,
      description: about.description,
      crumb: lawyer.name, parentCrumb: 'Lawyers', about,
    };
  }
  if (tab === 'lawyers') {
    const n = lawyers.length;
    return {
      title: `Lawyers at ${f.name} | ${where} | LawDB`,
      description: `Meet the ${n} lawyers ${f.name} names on its website, with their titles. ${f.name} is a law firm in ${where}.`.slice(0, 300),
      crumb: 'Lawyers',
    };
  }
  if (tab === 'articles') {
    return {
      title: `Articles by ${f.name} | ${where} | LawDB`,
      description: `Recent articles from the ${f.name} blog (${where}): headlines and short excerpts, with links to the full articles on the firm's website.`.slice(0, 300),
      crumb: 'Articles',
    };
  }
  return null;
}

const PHOTO = (l, f, size) => `<img src="${esc(l.photo)}" alt="${esc(`${l.name}${l.title ? `, ${l.title}` : ''} at ${f.name}`)}" width="${size}" height="${size}" loading="lazy" referrerpolicy="no-referrer">`;

// The Lawyers page: a card for each lawyer who has a profile (photo, name, title, a link), or, for a firm with only names, the plain list.
export function lawyersBodyHtml(f, details, lawyers = []) {
  const areas = (details && details.areas) || [];
  const cards = lawyers.length
    ? lawyers.map((l) =>
      `<li class="tl-card tl-pro"><a class="tl-ph" href="${esc(tabPath(f.slug, 'lawyers', l.slug))}" tabindex="-1" aria-hidden="true">${PHOTO(l, f, 64)}</a><div><a class="tl-nm" href="${esc(tabPath(f.slug, 'lawyers', l.slug))}"><b>${esc(l.name)}</b></a>${l.title ? `<span>${esc(l.title)}</span>` : ''}</div></li>`).join('')
    : ((details && details.lawyers) || []).map((l) =>
      `<li class="tl-card"><span class="tl-av" aria-hidden="true">${esc(initials(l.name))}</span><div><b>${esc(l.name)}</b>${l.title ? `<span>${esc(l.title)}</span>` : ''}</div></li>`).join('');
  return `<section class="pf-tabpage" aria-label="Lawyers at ${esc(f.name)}"><h2>Lawyers at ${esc(f.name)}</h2>` +
    `<p class="pf-lead">${esc(f.name)} is a law firm in ${esc(f.city)}, ${esc(f.state)}. These are the lawyers it shows on its own website.</p>` +
    `<ul class="tl-list">${cards}</ul>` +
    `<p class="tl-note">Names, titles and photos are taken from the firm's website. LawDB does not rank lawyers or vouch for any of them; check a lawyer's license with the state bar before you hire.</p>` +
    (areas.length ? `<div class="tl-areas"><h3>Practice areas the firm lists</h3><ul>${areas.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>` : '') +
    `<p class="tl-cta"><a class="pf-btn pf-primary" href="#contact" data-open-contact><span>Request a consultation</span></a></p></section>`;
}

// One lawyer's page: photo, name, title, how to reach them, the firm, and a short description written from the facts (src/lib/lawyer-bio.js).
export function lawyerProfileHtml(f, l, about, others = []) {
  const links = [];
  if (l.phone) links.push(`<a class="pf-btn" href="tel:+1${esc(l.phone)}"><span>${esc(showPhone(l.phone))}</span></a>`);
  if (l.email) links.push(`<a class="pf-btn" href="mailto:${esc(l.email)}"><span>Email ${esc(l.name.split(' ')[0])}</span></a>`);
  if (l.sourceUrl) links.push(`<a class="pf-btn" href="${esc(l.sourceUrl)}" target="_blank" rel="noopener nofollow"><span>Profile on the firm's website</span></a>`);
  const socials = Object.keys(l.socials || {}).map((k) => `<li><a href="${esc(l.socials[k])}" target="_blank" rel="noopener nofollow me">${esc(NET_LABEL[k])}</a></li>`).join('');
  const areas = (l.areas || []).length ? `<div class="tl-areas"><h3>Practice areas on ${esc(l.name.split(' ')[0])}'s page</h3><ul>${l.areas.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>` : '';
  const more = others.length ? `<div class="tl-areas"><h3>Other lawyers at ${esc(f.name)}</h3><ul>${others.slice(0, 8).map((o) => `<li><a href="${esc(tabPath(f.slug, 'lawyers', o.slug))}">${esc(o.name)}</a></li>`).join('')}</ul></div>` : '';
  return `<article class="pf-tabpage tl-profile" aria-label="${esc(l.name)}">` +
    `<div class="tl-head"><div class="tl-big">${PHOTO(l, f, 140)}</div><div><h2>${esc(l.name)}</h2>` +
    `<p class="tl-role">${l.title ? `${esc(l.title)} at ` : ''}<a href="${esc(tabPath(f.slug))}">${esc(f.name)}</a>, ${esc(f.city)}, ${esc(f.state)}</p>` +
    (links.length ? `<div class="tl-links">${links.join('')}</div>` : '') +
    (socials ? `<ul class="tl-soc" aria-label="Profiles">${socials}</ul>` : '') + `</div></div>` +
    about.paragraphs.map((p) => `<p class="tl-p">${esc(p)}</p>`).join('') + areas + more +
    `<p class="tl-cta"><a class="pf-btn pf-primary" href="#contact" data-open-contact><span>Request a consultation</span></a></p></article>`;
}

// Schema.org Person for a lawyer page (what the firm shows about them, and nothing more).
export function lawyerLd(f, l, url, origin) {
  return {
    '@context': 'https://schema.org', '@type': 'Person', name: l.name, ...(l.title ? { jobTitle: l.title } : {}), image: l.photo, url,
    worksFor: { '@type': 'LegalService', name: f.name, url: `${origin}/firms/${f.slug}` },
    ...(l.phone ? { telephone: `+1${l.phone}` } : {}), ...(l.email ? { email: l.email } : {}),
    ...(Object.keys(l.socials || {}).length || l.sourceUrl ? { sameAs: [...Object.values(l.socials || {}), ...(l.sourceUrl ? [l.sourceUrl] : [])] } : {}),
    ...((l.areas || []).length ? { knowsAbout: l.areas } : {}),
  };
}
