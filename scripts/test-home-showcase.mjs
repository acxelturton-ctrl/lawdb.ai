// Tests for the home page's real-data sections (src/routes/home-showcase.js, src/render/home-showcase.js): who is eligible, the daily pick,
// the spotlight, the cards' HTML, and the database query, on a real in-memory SQLite database (the engine D1 uses) with the real migrations.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { pickShowcase, eligibleFirms, showcase, seeded, CARDS, FEATURED_MAX, PER_CITY, PER_KIND } from '../src/routes/home-showcase.js';
import { firmCard, spotlightHtml, newsRow, excerpt, badges } from '../src/render/home-showcase.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

// ---- the picker (pure)
const KINDS = ['Family law', 'Criminal defense', 'Immigration', 'Personal injury', 'Real estate', 'Wills, Trusts & Probate'];
const CITIES = { FL: ['Miami', 'Tampa', 'Orlando', 'Jacksonville'], TX: ['Houston', 'Dallas', 'Austin', 'San Antonio'] };
const mk = (i, st, extra = {}) => ({ slug: `f-${st}-${i}`, name: `Firm ${st} ${i}`, city: CITIES[st][i % 4], state: st, tags: [KINDS[i % 6]], phone: '+13055550100', src: 'https://x.test/l.png', heroImage: 'https://x.test/c.jpg', featured: false, verified: false, look: 4.5 + (i % 7) / 20, about: 'word '.repeat(95), ...extra });
const FIRMS = [];
for (let i = 0; i < 60; i++) { FIRMS.push(mk(i, 'FL')); FIRMS.push(mk(i, 'TX')); }
FIRMS.push(mk(100, 'FL', { featured: true, look: 4.9, slug: 'feat-fl-a', city: 'Naples' }), mk(101, 'TX', { featured: true, look: 4.95, slug: 'feat-tx-a', city: 'Waco' }), mk(102, 'TX', { featured: true, look: 4.2, slug: 'feat-tx-b', city: 'Plano' }));

const a = pickShowcase(FIRMS, '2026-11-18');
eq(a.cards.length, CARDS, 'twelve cards');
eq(new Set(a.cards.map((f) => f.slug)).size, CARDS, 'no firm twice');
eq(a.cards.slice(0, 3).map((f) => f.slug).sort(), ['feat-fl-a', 'feat-tx-a', 'feat-tx-b'], 'Featured firms lead the row');
ok(a.cards.filter((f) => f.featured).length <= FEATURED_MAX, 'no more than the Featured limit');
const states = a.cards.reduce((m, f) => ({ ...m, [f.state]: (m[f.state] || 0) + 1 }), {});
ok(Math.abs(states.FL - states.TX) <= 3, `states are balanced: ${JSON.stringify(states)}`);
const perCity = a.cards.reduce((m, f) => ({ ...m, [f.city + f.state]: (m[f.city + f.state] || 0) + 1 }), {});
ok(Object.values(perCity).every((c) => c <= PER_CITY), 'at most two firms per city');
const perKind = a.cards.reduce((m, f) => ({ ...m, [f.tags[0]]: (m[f.tags[0]] || 0) + 1 }), {});
ok(Object.values(perKind).every((c) => c <= PER_KIND + 1), `at most about three per kind of practice: ${JSON.stringify(perKind)}`); // +1: a Featured firm can add one beyond the day's pick
ok(a.spotlight && !a.cards.some((f) => f.slug === a.spotlight.slug), 'the spotlight is not also a card');
ok(a.spotlight.featured === false || FIRMS.filter((f) => f.featured && !a.cards.includes(f)).length > 0, 'the spotlight prefers a Featured firm that is not already a card');

eq(pickShowcase(FIRMS, '2026-11-18').cards.map((f) => f.slug), a.cards.map((f) => f.slug), 'the same day always gives the same cards');
eq(pickShowcase([...FIRMS].reverse(), '2026-11-18').cards.map((f) => f.slug).sort(), a.cards.map((f) => f.slug).sort(), 'the input order does not matter');
const days = new Set(['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21'].map((d) => pickShowcase(FIRMS, d).cards.map((f) => f.slug).join()));
ok(days.size >= 3, 'other days give other cards');
const rand = seeded('x'); const r1 = rand(); ok(r1 >= 0 && r1 < 1 && seeded('x')() === r1, 'the seeded generator is stable');

const few = pickShowcase(FIRMS.slice(0, 5), '2026-11-18');
eq(few.cards.length, 5, 'with five eligible firms, five cards (the limits give way)');
eq(pickShowcase([], '2026-11-18'), { cards: [], spotlight: null }, 'no firms: nothing, no crash');
const one = pickShowcase(FIRMS.filter((f) => f.state === 'FL'), '2026-11-18');
ok(one.cards.length === CARDS && one.cards.every((f) => f.state === 'FL'), 'a single state fills the row');
const verOnly = pickShowcase(FIRMS.map((f, i) => ({ ...f, featured: false, verified: i === 7 })), '2026-11-18');
ok(verOnly.spotlight, 'a spotlight is still chosen');

// ---- the card's HTML
const nasty = { slug: 'x"><script>1</script>', name: 'A <b>&</b> "Co"', city: 'Mi<ami', state: 'FL', tags: ['Fam<ily'], phone: '+13055550100"', src: 'javascript:alert(1)', heroImage: 'https://x.test/c.jpg" onerror="alert(1)', featured: true, verified: true, perks: { free: true, h24: true }, details: { languages: ['Spanish'] } };
const html = firmCard(nasty);
ok(!/<script|onerror="alert|<b>/.test(html), 'names, tags, slugs and picture addresses cannot break out of the markup');
ok(!/javascript:/.test(html), 'a javascript: address is never used as a picture');
ok(html.includes('class="hv-flag">Featured'), 'a Featured firm is marked');
ok(/Verified by LawDB/.test(html) && /Free consultation/.test(html) && /24\/7/.test(html) && !/Habla/.test(html), 'chips for what is true, three at most');
ok(badges({ details: { languages: ['Spanish', 'English'] } }).includes('Habla español'), 'a Spanish-speaking firm says so');
eq(badges({ perks: {}, details: {} }), [], 'no perks, no chips');
eq(badges({ verified: true, perks: { free: true, h24: true, virtual: true }, details: { languages: ['Spanish'] } }).length, 3, 'at most three chips');
const plain = firmCard(mk(1, 'FL'));
ok(!plain.includes('hv-flag') && plain.includes('href="/f-FL-1"') && plain.includes('tel:+13055550100') && plain.includes('Miami, Florida') || plain.includes('Tampa, Florida'), 'a plain card links to the firm page, shows the full state name and a Call link');
ok(firmCard(mk(1, 'FL'), { eager: true }).includes('loading="eager"') && firmCard(mk(1, 'FL')).includes('loading="lazy"'), 'the first cards load at once');
eq(excerpt('one two three', 5), 'one two three', 'short text is kept');
ok(excerpt('word '.repeat(80), 34).endsWith('…') && excerpt('word '.repeat(80), 34).split(' ').length === 34, 'long text is cut at a word with an ellipsis');
ok(spotlightHtml(mk(2, 'TX'), 'word '.repeat(80)).includes('Firm spotlight'), 'the spotlight card');
const row = newsRow({ title: 'T <i>x</i>', image: 'https://x.test/p.jpg', publishedAt: '2026-11-16 10:00:00', firmName: 'F & Co', city: 'Houston', state: 'TX', storyHref: '/news/f/1-t' });
ok(row.includes('Nov 16, 2026') && row.includes('F &amp; Co') && !row.includes('<i>x'), 'an article row: escaped, with a readable date');
ok(newsRow({ title: 'T', image: 'javascript:1', publishedAt: 'junk', firmName: 'F', storyHref: '/n' }).includes('hv-news-img"></span>'), 'an unsafe picture is left out, a bad date is left out');

// ---- the database query, on a D1-shaped wrapper over SQLite
const raw = new DatabaseSync(':memory:');
raw.exec(readFileSync(new URL('../migrations/0001_schema.sql', import.meta.url), 'utf8'));
const plainRow = (r) => (r ? { ...r } : r);
class Stmt {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...x) { this.args = x; return this; }
  all() { return { results: raw.prepare(this.sql).all(...this.args).map(plainRow) }; }
  first() { return plainRow(raw.prepare(this.sql).get(...this.args)) ?? null; }
}
const env = { DB: { prepare: (sql) => new Stmt(sql) } };
const long = 'word '.repeat(95).trim();
const put = (slug, st, { about = long, status = 'live', featured = 0, data = {} } = {}) => raw.prepare('INSERT INTO firms (slug, name, city, state, featured, data, about, status) VALUES (?,?,?,?,?,?,?,?)').run(slug, `Firm ${slug}`, 'Miami', st, featured, JSON.stringify({ slug, name: `Firm ${slug}`, city: 'Miami', state: st, tags: ['Family law'], phone: '+13055550100', type: 'logo', src: 'https://x.test/l.png', heroImage: 'https://x.test/c.jpg', ...data }), about, status);
put('good', 'FL'); put('good-tx', 'TX', { featured: 1 });
put('thin-bio', 'FL', { about: 'too short' }); put('no-bio', 'FL', { about: null });
put('hidden', 'FL', { status: 'hidden' }); put('pending', 'FL', { status: 'pending' });
put('no-logo', 'FL', { data: { src: '' } }); put('no-cover', 'FL', { data: { heroImage: '' } }); put('monogram', 'FL', { data: { type: 'mono' } });
put('no-phone', 'FL', { data: { phone: '' } }); put('no-tags', 'FL', { data: { tags: [] } }); put('bad-state', 'FL', { data: { state: 'ZZ' } });
raw.prepare("INSERT INTO firm_verifications (firm_slug, status, law_society, registrant_name) VALUES ('good', 'verified', 'FL', 'X Y')").run();
const el = await eligibleFirms(env);
eq(el.map((f) => f.slug).sort(), ['good', 'good-tx'], 'only live firms with a logo, a cover, a phone, a practice area and a 90-word bio are eligible');
eq([el.find((f) => f.slug === 'good').verified, el.find((f) => f.slug === 'good-tx').featured], [true, true], 'Verified and Featured come from the database');
ok(el.every((f) => typeof f.look === 'number' && f.about.length > 100), 'each firm carries its look score and its description');

const d = await showcase(env, '2026-11-18');
ok(d && d.cards === '' && d.spotlight === '', 'two firms: too few for a row of cards (fewer than four are not shown), and none left over for a spotlight');
for (let i = 0; i < 8; i++) put(`more-${i}`, i % 2 ? 'TX' : 'FL', { data: { city: `City${i}` } });
const d2 = await showcase(env, '2026-11-19');
ok(d2.cards.includes('hv-card') && d2.states.join() === 'FL,TX', 'with enough firms, the row of cards is made, with both states');
const d3 = await showcase(env, '2026-11-19');
ok(d3 === d2, 'the same day is served from memory');
console.log(`home showcase: ${n} checks passed`);
