// A lawyer's own page: /lawyers/<name>-<city>-<state>. Lawyers are listed apart from law firms; this page exists only while the lawyer is on the Lawyer plan
// (src/lib/lawyers.js), and it works the same whether or not the lawyer is linked to a listed firm, and whatever plan that firm is on.
import * as C from './firm-chunks.generated.js';
import { esc, jsonForHtml } from './firm-page.js';
import { PHOTO, TABNAV_CSS } from './firm-tabs.js';
import { NET_LABEL, showPhone } from '../lib/lawyers.js';
import { lawyerAbout } from '../lib/lawyer-bio.js';
import { STATES, STATE_SLUG } from '../lib/us.js';

const CSS = `<style>
.lp-wrap{max-width:860px;margin:0 auto;padding:22px 18px 40px}
.lp-crumb{font-size:13px;color:#5f5f5f;margin:0 0 14px}.lp-crumb a{color:inherit}
.lp-head{display:flex;gap:22px;align-items:center;flex-wrap:wrap;margin:0 0 20px}
.lp-head img,.lp-head .tl-av{width:140px;height:140px;border-radius:16px;object-fit:cover;background:#f3ecd8;display:flex;align-items:center;justify-content:center;font-size:38px}
.lp-head h1{margin:0 0 4px;font-size:30px;line-height:1.15}
.lp-role{margin:0 0 12px;color:#5f5f5f}.lp-role a{color:inherit}
.lp-tag{display:inline-block;margin:0 0 10px;padding:3px 12px;border-radius:999px;background:#b8892b;color:#fff;font-size:12px;font-weight:700}
.lp-links{display:flex;flex-wrap:wrap;gap:8px}
.lp-btn{display:inline-block;padding:9px 14px;border:1px solid #b8892b;border-radius:8px;background:#fff;color:#1a1a1a;text-decoration:none;font-weight:600;font-size:14px}.lp-btn:hover{background:#faf6ea}
.lp-soc{display:flex;flex-wrap:wrap;gap:14px;margin:12px 0 0;padding:0;list-style:none;font-size:14px}
.lp-p{margin:0 0 12px;line-height:1.65}
.lp-areas{margin:22px 0 0}.lp-areas h2{margin:0 0 8px;font-size:18px}
.lp-areas ul{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none}
.lp-areas li{padding:6px 12px;border:1px solid #e3dcc7;border-radius:999px;font-size:14px;background:#faf6ea}
.lp-firm{margin:22px 0 0;padding:14px 16px;border:1px solid #e3dcc7;border-radius:12px;background:#fff}
</style>`;

const abs = (html) => html.replace(/\b(href|src)="\.\.\//g, '$1="/');

export function lawyerMeta(l) {
  const about = lawyerAbout({ lawyer: l, firmName: l.firmName, city: l.city, state: l.state });
  const where = `${l.city}, ${l.state}`;
  return {
    about,
    title: `${l.name}${l.title ? ` - ${l.title}` : ''}${l.firmName ? ` at ${l.firmName}` : ''} | ${where} | LawDB`,
    description: (l.bio && l.bio.length ? l.bio[0].slice(0, 200) : about.description),
  };
}

export function lawyerLd(l, url, origin) {
  return {
    '@context': 'https://schema.org', '@type': 'Person', name: l.name, ...(l.title ? { jobTitle: l.title } : {}), ...(l.photo ? { image: l.photo.startsWith('/') ? origin + l.photo : l.photo } : {}), url,
    address: { '@type': 'PostalAddress', addressLocality: l.city, addressRegion: l.state, addressCountry: 'US' },
    ...(l.firmSlug ? { worksFor: { '@type': 'LegalService', name: l.firmName, url: `${origin}/${l.firmSlug}` } } : {}),
    ...(l.phone ? { telephone: `+1${l.phone}` } : {}), ...(l.email ? { email: l.email } : {}),
    ...(Object.keys(l.socials || {}).length || l.sourceUrl ? { sameAs: [...Object.values(l.socials || {}), ...(l.sourceUrl ? [l.sourceUrl] : [])] } : {}),
    ...((l.areas || []).length ? { knowsAbout: l.areas } : {}),
  };
}

export function renderLawyerPage(l, { origin = 'https://lawdb.ai' } = {}) {
  const { about, title, description } = lawyerMeta(l);
  const url = `${origin}/lawyers/${l.slug}`;
  const prov = STATES[l.state] || l.state;
  const ps = STATE_SLUG[l.state];
  const first = l.name.split(' ')[0];
  const thin = !((l.bio && l.bio.length) || (l.areas && l.areas.length));
  const trail = [['LawDB', `${origin}/`], ['United States', `${origin}/find-lawyers`], ...(ps ? [[prov, `${origin}/${ps}/`]] : []), [l.name, url]];
  const crumbLd = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: trail.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })) };
  const links = [];
  if (l.phone) links.push(`<a class="lp-btn" href="tel:+1${esc(l.phone)}"><span>${esc(showPhone(l.phone))}</span></a>`);
  if (l.email) links.push(`<a class="lp-btn" href="mailto:${esc(l.email)}"><span>Email ${esc(first)}</span></a>`);
  if (l.sourceUrl) links.push(`<a class="lp-btn" href="${esc(l.sourceUrl)}" target="_blank" rel="noopener nofollow"><span>${esc(first)}'s page on the firm's website</span></a>`);
  const socials = Object.keys(l.socials || {}).map((k) => `<li><a href="${esc(l.socials[k])}" target="_blank" rel="noopener nofollow me">${esc(NET_LABEL[k])}</a></li>`).join('');
  const paras = (l.bio && l.bio.length ? l.bio : about.paragraphs).map((p) => `<p class="lp-p">${esc(p)}</p>`).join('');
  const areas = (l.areas || []).length ? `<section class="lp-areas"><h2>Practice areas</h2><ul>${l.areas.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></section>` : '';
  const firm = l.firmSlug ? `<p class="lp-firm">${esc(first)} is listed with <a href="/${esc(l.firmSlug)}">${esc(l.firmName)}</a>, a law firm in ${esc(l.city)}, ${esc(l.state)}.</p>` : '';
  const role = `${l.title ? `${esc(l.title)} &middot; ` : ''}${esc(l.city)}, ${esc(l.state)}`;
  const page = [
    '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n' + C.FAVICONS + '\n<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<meta property="og:title" content="${esc(title.replace(/ \| LawDB$/, ''))}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    '<meta property="og:type" content="profile">',
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    ...(thin ? ['<meta name="robots" content="noindex,follow">'] : []), // a page with nothing but the generated text stays out of search until the lawyer adds a biography or practice areas
    '<meta property="og:site_name" content="LawDB.ai">',
    `<meta property="og:image" content="${l.photo ? esc(l.photo.startsWith('/') ? origin + l.photo : l.photo) : `${origin}/images/og-default.jpg`}">`,
    `<script type="application/ld+json">\n${jsonForHtml(lawyerLd(l, url, origin))}\n</script>`,
    `<script type="application/ld+json">\n${jsonForHtml(crumbLd)}\n</script>`,
    C.STYLE + TABNAV_CSS + CSS + '\n</head>',
    '<body class="pg-firm pg-msp">\n  ' + C.HEADER,
    `  <main class="lp-wrap"><nav class="lp-crumb" aria-label="Breadcrumb"><a href="/">LawDB</a> &rsaquo; <a href="/find-lawyers">United States</a>${ps ? ` &rsaquo; <a href="/${esc(ps)}/">${esc(prov)}</a>` : ''} &rsaquo; ${esc(l.name)}</nav>` +
    `<article aria-label="${esc(l.name)}"><div class="lp-head"><div>${PHOTO(l, null, 140)}</div><div><span class="lp-tag">LawDB Lawyer</span><h1>${esc(l.name)}</h1><p class="lp-role">${role}</p>` +
    (links.length ? `<div class="lp-links">${links.join('')}</div>` : '') + (socials ? `<ul class="lp-soc" aria-label="Profiles">${socials}</ul>` : '') + '</div></div>' +
    paras + areas + firm + '</article></main>',
    '  ' + C.FOOTER,
  ].join('\n');
  return abs(page);
}
