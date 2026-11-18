// The real-data sections of the home page: "Law firms to explore" (12 cards), the daily "Firm spotlight" and a list of recent articles.
//
// Who can appear (all of these): a live firm with its own logo, a cover picture and a written description of 90 words or more (the bar the whole site
// uses to show a firm), a phone number, a city and at least one practice area. Featured firms (the paid plan) come first and are marked "Featured";
// the rest are a daily pick, "random" but fixed for the day (seeded by the date), spread over states, cities and kinds of practice, so every visitor
// and every server sees the same set and tomorrow's is different. Nothing is invented: every name, picture and chip comes from the database.
import { STATES } from '../lib/us.js';
import { firmCard, spotlightHtml, newsRow } from '../render/home-showcase.js';
import { profileStrength } from '../lib/profile-strength.js';
import { aboutWords } from '../lib/indexing.js';
import { easternDay } from '../lib/stats.js';
import { loadCandidates, rankPosts } from '../lib/home-feed.js';
import { sliderPosts } from './home-news.js';
import { storyPath } from '../lib/stories.js';

export const CARDS = 12, FEATURED_MAX = 4, TOP = 160, PER_CITY = 2, PER_KIND = 3, NEWS_ROWS = 5, MIN_WORDS = 90;

// A small seeded random number generator, so one date always gives one order.
export function seeded(text) {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) { h = Math.imul(h ^ text.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = (h ^ (h >>> 16)) >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const shuffle = (list, rand) => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// rating weighted by how many reviews it rests on (4.5 is the prior, worth 50 reviews), plus a little for a complete profile and for being Verified
export const lookScore = (f, strength) => ((Number(f.count) || 0) * (Number(f.rating) || 0) + 50 * 4.5) / ((Number(f.count) || 0) + 50) + strength / 500 + (f.verified ? 0.15 : 0);

// firms: [{ ...firm record, about, verified, look }]. Returns { cards, spotlight }.
export function pickShowcase(firms, day, { cards = CARDS } = {}) {
  const rand = seeded('home:' + day);
  const byLook = (a, b) => b.look - a.look || (a.slug < b.slug ? -1 : 1);
  const out = [];
  const city = {}, kind = {};
  const take = (f) => { out.push(f); city[`${f.city}|${f.state}`] = (city[`${f.city}|${f.state}`] || 0) + 1; const k = (f.tags || [])[0]; kind[k] = (kind[k] || 0) + 1; };
  const room = (f) => (city[`${f.city}|${f.state}`] || 0) < PER_CITY && (kind[(f.tags || [])[0]] || 0) < PER_KIND;

  // Featured first (best look first, at most FEATURED_MAX, a different city each), so a paying firm is always among the first cards.
  for (const f of firms.filter((x) => x.featured).sort(byLook)) { if (out.length >= Math.min(FEATURED_MAX, cards)) break; if (room(f)) take(f); }

  // Then the day's pick, one state after the other so no state crowds the row out.
  const pool = shuffle(firms.filter((x) => !x.featured).sort(byLook).slice(0, TOP), rand);
  const queues = new Map();
  for (const f of pool) { if (!queues.has(f.state)) queues.set(f.state, []); queues.get(f.state).push(f); }
  const states = shuffle([...queues.keys()].sort(), rand);
  let progressed = true;
  while (out.length < cards && progressed) {
    progressed = false;
    for (const st of states) {
      if (out.length >= cards) break;
      const q = queues.get(st);
      const i = q.findIndex(room);
      if (i >= 0) { take(q.splice(i, 1)[0]); progressed = true; }
    }
  }
  for (const f of pool) { if (out.length >= cards) break; if (!out.includes(f)) take(f); } // too few firms to keep every limit: fill up anyway

  // The spotlight: a firm that is not already a card; Featured, then Verified, then the best look; drawn at random among the top of that group.
  const rest = firms.filter((x) => !out.includes(x)).sort(byLook);
  const group = rest.filter((x) => x.featured).length ? rest.filter((x) => x.featured) : rest.filter((x) => x.verified).length ? rest.filter((x) => x.verified) : rest;
  const candidates = group.slice(0, 24);
  const spotlight = candidates.length ? candidates[Math.floor(rand() * candidates.length)] : null;
  // card order for the page: interleave states so "All" shows a mix, Featured leading
  const lead = out.filter((x) => x.featured), more = out.filter((x) => !x.featured);
  return { cards: [...lead, ...more], spotlight };
}

export async function eligibleFirms(env) {
  const { results } = await env.DB.prepare(
    `SELECT slug, data, hours, about, featured, EXISTS (SELECT 1 FROM firm_verifications v WHERE v.firm_slug = firms.slug AND v.status = 'verified') AS verified
     FROM firms WHERE status = 'live'`
  ).all();
  const out = [];
  for (const r of results) {
    if (aboutWords(r.about) < MIN_WORDS) continue;
    let f; try { f = JSON.parse(r.data); } catch { continue; }
    if (f.type !== 'logo' || !f.src || !f.heroImage || !f.phone || !f.city || !STATES[f.state] || !(f.tags || []).length) continue;
    const verified = !!r.verified, featured = !!r.featured;
    const strength = profileStrength(f, { about: r.about, hours: r.hours, verified }).score;
    out.push({ ...f, featured, verified, about: r.about, look: lookScore({ ...f, verified }, strength) });
  }
  return out;
}

// The recent articles that the slider above does not show.
export async function newsList(env, n = NEWS_ROWS) {
  const ranked = rankPosts(await loadCandidates(env), {});
  const shown = new Set(sliderPosts(ranked).map((p) => p.id));
  const seen = new Set(), out = [];
  for (const p of ranked) {
    if (shown.has(p.id) || !p.image || seen.has(p.firmSlug)) continue;
    seen.add(p.firmSlug);
    out.push({ ...p, storyHref: storyPath(p.firmSlug, p.id, p.title) });
    if (out.length >= n) break;
  }
  return out;
}

let memo = null; // { day, at, data } kept by each server for ten minutes, so the database is asked a few times an hour, not once a visit
let failedAt = 0;
const MEMO_MS = 10 * 60 * 1000;

export async function showcase(env, day = easternDay()) {
  if (memo && memo.day === day && Date.now() - memo.at < MEMO_MS) return memo.data;
  if (Date.now() - failedAt < 60000) return null;
  try {
    const { cards, spotlight } = pickShowcase(await eligibleFirms(env), day);
    let news = [];
    try { news = await newsList(env); } catch (err) { console.error('home articles failed', err); }
    const data = {
      cards: cards.length >= 4 ? cards.map((f, i) => firmCard(f, { eager: i < 4 })).join('') : '',
      states: [...new Set(cards.map((f) => f.state))].sort(),
      spotlight: spotlight ? spotlightHtml(spotlight, spotlight.about) : '',
      news: news.length >= 3 ? news.map(newsRow).join('') : '',
    };
    memo = { day, at: Date.now(), data };
    return data;
  } catch (err) { failedAt = Date.now(); console.error('home showcase failed, page served without it', err); return null; }
}

const tabs = (states) => states.length < 2 ? '' :
  '<button type="button" class="on" data-st="">All</button>' + states.map((s) => `<button type="button" data-st="${s}">${STATES[s]}</button>`).join('');

// Puts the cards, the spotlight and the articles into the page. The sections are hidden in the file and only shown here, so if the
// database cannot answer the page is the same as before, minus them.
export async function withHomeShowcase(html, env) {
  if (!html.includes('id="hvFirms"')) return html;
  const d = await showcase(env);
  if (!d) return html;
  const rw = new HTMLRewriter();
  if (d.cards) {
    rw.on('section#hvFirms', { element(el) { el.removeAttribute('hidden'); } })
      .on('div#hvGrid', { element(el) { el.setInnerContent(d.cards, { html: true }); } })
      .on('div#hvTabs', { element(el) { el.setInnerContent(tabs(d.states), { html: true }); } });
  }
  if (d.spotlight || d.news) {
    rw.on('section#hvInsights', { element(el) { el.removeAttribute('hidden'); if (!d.news) el.setAttribute('data-nonews', ''); if (!d.spotlight) el.setAttribute('data-nospot', ''); } })
      .on('ul#hvNewsList', { element(el) { if (d.news) el.setInnerContent(d.news, { html: true }); } })
      .on('div#hvSpot', { element(el) { if (d.spotlight) el.setInnerContent(d.spotlight, { html: true }); } });
  }
  return rw.transform(new Response(html)).text();
}
