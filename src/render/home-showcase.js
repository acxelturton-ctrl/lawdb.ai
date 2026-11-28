// The real-data pieces of the home page: firm cards, the daily firm spotlight and the article rows. One template each, used by the Worker
// (src/routes/home-showcase.js) when it puts today's firms and stories into the page.
import { STATES } from '../lib/us.js';
import { safeUrl } from './firm-page.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
const img = (u) => { const s = safeUrl(u); return s && !/^https?:/.test(s) && !s.startsWith('/') ? '/' + s : s; };
const initials = (name) => String(name || '?').replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
const bg = (f) => (/^#[0-9a-fA-F]{6}$/.test(f.logoBg || '') ? f.logoBg : '');

// The first sentence-ish chunk of a firm's own description, cut at a word, for the spotlight.
export function excerpt(about, words = 34) {
  const w = String(about || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (w.length <= words) return w.join(' ');
  const cut = w.slice(0, words).join(' ').replace(/[,;:\s]+$/, '');
  return cut + (/[.!?]$/.test(cut) ? '' : '…');
}

function logo(f, big) {
  const b = bg(f);
  const style = b ? ` style="background:${b}"` : '';
  return `<span class="hv-logo${big ? ' hv-logo-lg' : ''}${b ? ' hv-logo-fill' : ''}"${style}><b aria-hidden="true">${esc(initials(f.name))}</b><img src="${esc(img(f.src))}" alt="${esc(f.name)} logo" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('nologo');this.remove()"></span>`;
}
const cover = (f, eager) => `<img src="${esc(img(f.heroImage))}" alt="" loading="${eager ? 'eager' : 'lazy'}" referrerpolicy="no-referrer" onerror="this.remove()">`;

// Chips that are true to the firm's data: Verified, plus the perks crawled from its own site.
export function badges(f) {
  const out = [];
  if (f.verified) out.push('Verified by LawDB');
  if (f.perks?.free) out.push('Free consultation');
  if (f.perks?.h24) out.push('24/7');
  if (f.perks?.virtual || f.virtual === true) out.push('Virtual consults');
  if ((f.details?.languages || []).some((l) => /spanish/i.test(l))) out.push('Habla español');
  return out.slice(0, 3);
}

// f: { slug, name, city, state, tags, phone, src, heroImage, featured, verified, perks, details }
export function firmCard(f, { eager = false } = {}) {
  const href = '/' + esc(f.slug);
  const tags = (f.tags || []).slice(0, 2).map((t) => `<span>${esc(t)}</span>`).join('');
  const chips = badges(f).map((b) => `<li>${esc(b)}</li>`).join('');
  return `<article class="hv-card" data-state="${esc(f.state)}">` +
    `<a class="hv-cover" href="${href}" tabindex="-1" aria-hidden="true">${cover(f, eager)}</a>` +
    (f.featured ? '<span class="hv-flag">Featured</span>' : '') + logo(f) +
    `<div class="hv-body"><h3><a href="${href}">${esc(f.name)}</a></h3>` +
    `<p class="hv-loc">${esc(f.city)}, ${esc(STATES[f.state] || f.state)}</p>` +
    (tags ? `<p class="hv-tags">${tags}</p>` : '') + (chips ? `<ul class="hv-perks">${chips}</ul>` : '') +
    `<div class="hv-btns"><a class="hv-view" href="${href}">View profile</a>` + (f.phone ? `<a class="hv-call" href="tel:${esc(f.phone)}" aria-label="Call ${esc(f.name)}">Call</a>` : '') + '</div></div></article>';
}

export function spotlightHtml(f, about) {
  const href = '/' + esc(f.slug);
  const tags = (f.tags || []).slice(0, 3).map((t) => `<span>${esc(t)}</span>`).join('');
  const chips = badges(f).map((b) => `<li>${esc(b)}</li>`).join('');
  return `<article class="hv-spot"><p class="hv-kicker">Firm spotlight${f.featured ? ' <i>Featured</i>' : ''}</p>` +
    `<a class="hv-spot-cover" href="${href}" tabindex="-1" aria-hidden="true">${cover(f)}</a>` +
    `<div class="hv-spot-body">${logo(f, true)}<h3><a href="${href}">${esc(f.name)}</a></h3>` +
    `<p class="hv-loc">${esc(f.city)}, ${esc(STATES[f.state] || f.state)}</p>` + (tags ? `<p class="hv-tags">${tags}</p>` : '') +
    `<p class="hv-spot-bio">${esc(excerpt(about))}</p>` + (chips ? `<ul class="hv-perks">${chips}</ul>` : '') +
    `<div class="hv-btns"><a class="hv-view" href="${href}">View profile</a>` + (f.phone ? `<a class="hv-call" href="tel:${esc(f.phone)}">Call</a>` : '') + '</div></div></article>';
}

const fmtDate = (d) => {
  const t = Date.parse(String(d || '').replace(' ', 'T') + (/Z|[+-]\d\d:?\d\d$/.test(String(d)) ? '' : 'Z'));
  return Number.isNaN(t) ? '' : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};

// p: { title, image, publishedAt, firmName, city, state, storyHref }
export function newsRow(p) {
  const meta = [p.firmName, [p.city, p.state].filter(Boolean).join(', '), fmtDate(p.publishedAt)].filter(Boolean).map(esc).join(' &middot; ');
  const pic = safeUrl(p.image);
  return `<li><a class="hv-news" href="${esc(p.storyHref)}"><span class="hv-news-img">${pic ? `<img src="${esc(pic)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>` +
    `<span class="hv-news-tx"><small>${meta}</small><b>${esc(p.title)}</b></span></a></li>`;
}
