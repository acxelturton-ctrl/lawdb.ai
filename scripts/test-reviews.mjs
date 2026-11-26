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
const D2 = 'Our family is so grateful. The team handled our case with real compassion and I would recommend them to anyone going through a divorce.';
const D3 = 'They were professional, responsive and honest with me from the first call. Highly recommend this firm for a car accident case.';
const D4 = 'I was charged with a DUI and was terrified. My lawyer answered my calls at night and got the charge reduced. Highly recommend.';
const th = testimonialsHtml({ name: 'Firm & Sons', testimonials: [tm(T1, 'Maria G.'), tm(D2, ''), tm('<script>alert(1)</script> ' + D3, 'Evil <b>x</b>'), tm(D4, 'Fourth')] });
assert.ok(th.includes('Maria G.'), 'the author is shown');
assert.ok(testimonialsHtml({ name: 'Anon', testimonials: [tm(T1, 'Maria G.'), tm(D2, '')] }).includes('A client of the firm'), 'or "A client of the firm" when there is none');
assert.equal((th.match(/<figure/g) || []).length, 3, 'at most three are shown');
assert.ok(!th.includes('<script>') && !th.includes('<b>x</b>') && th.includes('&lt;script&gt;'), 'text from a website is escaped');
assert.ok(th.includes('has not verified these testimonials') && th.includes('Posted by the firm on its own website'), 'it says whose words they are and that LawDB has not verified them');
assert.ok(th.includes('href="https://firm.test/testimonials"'), 'and links to the firm\'s page');
assert.ok(!testimonialsHtml({ name: 'Bad', testimonials: [{ text: T1, author: '', url: 'javascript:alert(1)' }] }).includes('javascript:'), 'an unsafe address is never linked');
assert.ok(!/aggregateRating|"@type":\s*"Review"/.test(th), 'never marked up as review structured data');

// the same testimonial saved twice (the case in the screenshot) is shown once
const SA = 'Roy and especially America gave me 100% amazing service and I was so relieved. They explained everything so clearly. I will absolutely be recommending them to anyone who is looking for a firm who treats you like family and not a number.';
const SB = 'Roy and especially America gave me 100% amazing service and I was so relieved. I will absolutely be recommending them to anyone who is looking for a firm who treats you like family and not a number.';
const dup = testimonialsHtml({ name: 'Dup Law', testimonials: [tm(SA, 'Sheila Volante'), tm(SB, 'Sheila Volante'), tm(T1, 'Maria G.')] });
assert.equal((dup.match(/<figure/g) || []).length, 2, 'two copies of one testimonial are shown once');
assert.equal((dup.match(/Sheila Volante/g) || []).length, 1, 'with its name once');
assert.ok(dup.includes('They explained everything so clearly'), 'the fuller copy is the one kept');
const distinct = testimonialsHtml({ name: 'Two', testimonials: [tm(T1, 'Maria G.'), tm('Our family is so grateful. The team handled our case with real compassion and I would recommend them to anyone going through a divorce.', 'The Okafor family')] });
assert.equal((distinct.match(/<figure/g) || []).length, 2, 'different testimonials are all shown');

// a review widget saved as it came (reviewer and time in front, stars after, one owner name on every card), and the same person twice
const wd = (who, when, body) => tm(`${who} ${when} ${body} \u2b50\u2b50\u2b50\u2b50\u2b50`, 'Bee Lopez');
const widget = testimonialsHtml({ name: 'Widget Law', testimonials: [wd('Karina Rangel', '5 years ago', 'Jenny is simply the best ! She is very professional and attentive and I highly recommend them to anyone.'), wd('Nancy Aragon', '6 years ago', 'it took a little longer than expected but she cooperated good with us and we left here happy and satisfied.'), wd('Alena Escalante', '7 years ago', 'Jenny is amazing. She responded super fast and the whole process was easy. I would highly recommend it.')] });
assert.ok(widget.includes('Karina Rangel') && widget.includes('Nancy Aragon') && widget.includes('Alena Escalante'), 'the reviewer in front of the words is the name shown');
assert.ok(!widget.includes('Bee Lopez') && !widget.includes('years ago') && !widget.includes('\u2b50'), 'the owner name, the time and the stars are gone');
const twice = testimonialsHtml({ name: 'Twice', testimonials: [tm(T1, 'Maria G.'), tm('Our family is so grateful. The team handled our case with real compassion and I would recommend them to anyone going through a divorce.', 'Maria G.'), tm('They were professional, responsive and honest with me from the first call. Highly recommend this firm for a car accident case.', 'Lee S.')] });
assert.equal((twice.match(/Maria G\./g) || []).length, 1, 'the same person is shown once');
assert.equal((twice.match(/<figure/g) || []).length, 2, 'the other testimonials stay');
const two = testimonialsHtml({ name: 'Two only', testimonials: [tm(T1, 'Maria G.'), tm('They were professional, responsive and honest with me from the first call. Highly recommend this firm for a car accident case.', 'Lee S.')] });
assert.equal((two.match(/<figure/g) || []).length, 2, 'a firm with two shows two');
assert.equal((testimonialsHtml({ name: 'One only', testimonials: [tm(T1, 'Maria G.')] }).match(/<figure/g) || []).length, 1, 'and a firm with one shows one');

console.log('reviews: ok');
