// Google reviews on the firm page: three, word for word, with Google as the source; hidden when fewer than three or older than 35 days. Part of `npm run check`.
import assert from 'node:assert/strict';
import { reviewsHtml, testimonialsHtml } from '../src/render/firm-page.js';

const item = (n, t = 'x') => ({ author: `Reviewer ${n}`, authorUrl: 'https://www.google.com/maps/contrib/1', rating: 5, text: `Careful, quick and kind <b>${t}</b> ${n}`, when: '2 months ago' });
const now = Date.parse('2026-11-24T00:00:00Z');
const base = { name: 'Smith Law', reviews: { mapsUrl: 'https://maps.google.com/?cid=1', rating: 4.9, count: 120, fetchedAt: '2026-11-10', items: [item(1), item(2), item(3)] } };

const html = reviewsHtml(base, now);
assert.match(html, /Google reviews/);
assert.match(html, /Reviewer 1/); assert.match(html, /Reviewer 3/);
assert.match(html, /4\.9<\/b> from 120 Google reviews/);
assert.match(html, /Reviews from Google/);
assert.match(html, /See all on Google Maps/);
assert.doesNotMatch(html, /<b>x<\/b>/);                      // review text is escaped
assert.equal((html.match(/<figure/g) || []).length, 3);

assert.equal(reviewsHtml({ ...base, reviews: { ...base.reviews, items: [item(1), item(2)] } }, now), '');   // fewer than three: nothing is shown
assert.equal(reviewsHtml({ ...base, reviews: { ...base.reviews, fetchedAt: '2026-09-01' } }, now), '');     // older than 35 days: hidden until refreshed
assert.equal(reviewsHtml({ name: 'No Reviews' }, now), '');
assert.equal(reviewsHtml({ ...base, reviews: { ...base.reviews, mapsUrl: 'javascript:alert(1)' } }, now).includes('javascript:'), false);

// ---- testimonials the firm posts on its own website
const tm = (text, author = '') => ({ text, author, url: 'https://firm.test/testimonials' });
const T1 = 'I could not have asked for a better lawyer. She answered every question and explained each step along the way.';
assert.equal(testimonialsHtml({ name: 'None' }), '', 'no testimonials: nothing is shown');
assert.equal(testimonialsHtml({ name: 'Short', testimonials: [tm('Great.')] }), '', 'a fragment is not shown');
const th = testimonialsHtml({ name: 'Firm & Sons', testimonials: [tm(T1, 'Maria G.'), tm(T1 + ' Two', ''), tm('<script>alert(1)</script> ' + T1, 'Evil <b>x</b>'), tm(T1 + ' Four', 'Fourth')] });
assert.ok(th.includes('Maria G.') && th.includes('A client of the firm'), 'the author, or "A client of the firm" when there is none');
assert.equal((th.match(/<figure/g) || []).length, 3, 'at most three are shown');
assert.ok(!th.includes('<script>') && !th.includes('<b>x</b>') && th.includes('&lt;script&gt;'), 'text from a website is escaped');
assert.ok(th.includes('has not verified these testimonials') && th.includes('Posted by the firm on its own website'), 'it says whose words they are and that LawDB has not verified them');
assert.ok(th.includes('href="https://firm.test/testimonials"'), 'and links to the firm\'s page');
assert.ok(!testimonialsHtml({ name: 'Bad', testimonials: [{ text: T1, author: '', url: 'javascript:alert(1)' }] }).includes('javascript:'), 'an unsafe address is never linked');
assert.ok(!/aggregateRating|"@type":\s*"Review"/.test(th), 'never marked up as review structured data');

console.log('reviews: ok');
