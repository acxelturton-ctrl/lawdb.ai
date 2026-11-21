// Tabs on a firm profile: /firms/<slug> (Overview), /firms/<slug>/lawyers, /firms/<slug>/articles.
// Every tab is its own page with its own address, title, description, canonical and breadcrumb, so each can be found in search on its own.
// A tab exists only when the firm has real content for it (tabsFor); a firm without it has no page at that address and no tab button, so nothing thin is published.
import { cleanDetails } from '../lib/details.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const MIN_LAWYERS = 2;  // a "Lawyers" page of one name would be a stub
export const MIN_ARTICLES = 3; // same for the articles page
export const TAB_SLUGS = ['lawyers', 'articles'];

// Which tabs this firm has. `postCount` is how many of its blog posts are shown on LawDB (the feed is switched on).
export function tabsFor(firm, postCount = 0) {
  const d = cleanDetails(firm && firm.details);
  const tabs = ['overview'];
  if (d && d.lawyers && d.lawyers.length >= MIN_LAWYERS) tabs.push('lawyers');
  if (postCount >= MIN_ARTICLES) tabs.push('articles');
  return tabs;
}

export const tabPath = (slug, tab) => `/firms/${slug}${tab && tab !== 'overview' ? `/${tab}` : ''}`;

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
</style>`;

const initials = (name) => String(name).replace(/^(?:Me|Mr\.?|Ms\.?|Mrs\.?|Dr\.?)\s+/i, '').split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

// Page-level facts for a tab: title, description, heading text. Plain text; the caller escapes it.
export function tabMeta(f, tab, { lawyers = [], postCount = 0 } = {}) {
  const where = `${f.city}, ${f.state}`;
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

export function lawyersBodyHtml(f, details) {
  const lawyers = (details && details.lawyers) || [];
  const cards = lawyers.map((l) =>
    `<li class="tl-card"><span class="tl-av" aria-hidden="true">${esc(initials(l.name))}</span><div><b>${esc(l.name)}</b>${l.title ? `<span>${esc(l.title)}</span>` : ''}</div></li>`).join('');
  const areas = (details && details.areas) || [];
  return `<section class="pf-tabpage" aria-label="Lawyers at ${esc(f.name)}"><h2>Lawyers at ${esc(f.name)}</h2>` +
    `<p class="pf-lead">${esc(f.name)} is a law firm in ${esc(f.city)}, ${esc(f.state)}. These are the lawyers it names on its own website.</p>` +
    `<ul class="tl-list">${cards}</ul>` +
    `<p class="tl-note">Names and titles are taken from the firm's website. LawDB does not rank lawyers or vouch for any of them; check a lawyer's license with the state bar before you hire.</p>` +
    (areas.length ? `<div class="tl-areas"><h3>Practice areas the firm lists</h3><ul>${areas.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>` : '') +
    `<p class="tl-cta"><a class="pf-btn pf-primary" href="#contact" data-open-contact><span>Request a consultation</span></a></p></section>`;
}
