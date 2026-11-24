// Google reviews on the firm page: three, word for word, with Google as the source; hidden when fewer than three or older than 35 days. Part of `npm run check`.
import assert from 'node:assert/strict';
import { reviewsHtml } from '../src/render/firm-page.js';

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
console.log('reviews: ok');
