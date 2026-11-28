// Firm profile tabs: which tabs a firm has, what each page says about itself, and the sitemap. Part of `npm run check`.
import assert from 'node:assert/strict';
import { renderFirmPage } from '../src/render/firm-page.js';
import { tabsFor, tabPath, MIN_LAWYERS, MIN_ARTICLES } from '../src/render/firm-tabs.js';
import { firmSitemap } from '../src/routes/firm-sitemap.js';
import { lawyerSitemap } from '../src/routes/lawyer-sitemap.js';
import { lawyerPage } from '../src/routes/lawyer-page.js';
import { renderLawyerPage } from '../src/render/lawyer-page.js';
import { cleanLawyer, lawyerSlug, getPaidLawyer, MAX_LAWYERS } from '../src/lib/lawyers.js';
import { lawyerAbout } from '../src/lib/lawyer-bio.js';
import { SLUG_TABLES } from '../src/lib/firm-slug.js';
import { readFileSync } from 'node:fs';

const lawyers = [{ name: 'Jane Roe', title: 'Partner' }, { name: 'John Doe', title: 'Associate' }];
const firm = { slug: 'test-law', name: 'Test Law', city: 'Miami', state: 'FL', phone: '+13055550100', website: 'https://example.com', about: 'We help people with injuries. '.repeat(30), details: { lawyers, areas: ['Personal injury'] }, tags: ['Personal injury'] };
const post = (n) => ({ id: n, title: `Post ${n}`, url: `https://example.com/p${n}`, publishedAt: '2026-01-01', excerpt: 'Short excerpt.' });

// --- which tabs a firm has
assert.deepEqual(tabsFor(firm, 0), ['overview', 'lawyers']);
assert.deepEqual(tabsFor({ ...firm, details: { lawyers: lawyers.slice(0, MIN_LAWYERS - 1) } }, 0), ['overview'], 'one named lawyer is not a page');
assert.deepEqual(tabsFor({ ...firm, details: null }, MIN_ARTICLES), ['overview', 'articles']);
assert.deepEqual(tabsFor({ ...firm, details: null }, MIN_ARTICLES - 1), ['overview']);
assert.deepEqual(tabsFor({ ...firm, details: { lawyers: [{ name: 'Our Team', title: '' }, { name: 'Contact Us' }] } }, 0), ['overview'], 'junk names do not count');
assert.equal(tabPath('x', 'overview'), '/x');
assert.equal(tabPath('x', 'lawyers'), '/x/lawyers');

// --- the Lawyers page
const tabs = ['overview', 'lawyers', 'articles'];
const lw = renderFirmPage({ firm, tab: 'lawyers', tabs, allPosts: [post(1), post(2), post(3)] });
assert.match(lw, /<title>Lawyers at Test Law \| Miami, FL \| LawDB<\/title>/);
assert.match(lw, /rel="canonical" href="https:\/\/lawdb\.ai\/test-law\/lawyers"/);
assert.match(lw, /Jane Roe/); assert.match(lw, /John Doe/);
assert.match(lw, /"name": "Lawyers",\s+"item": "https:\/\/lawdb\.ai\/test-law\/lawyers"/, 'breadcrumb ends at the tab');
assert.match(lw, /<a href="\/test-law\/lawyers" aria-current="page" class="on">Lawyers<\/a>/);
assert.match(lw, /<a href="\/test-law">Overview<\/a>/);
assert.doesNotMatch(lw, /(?:href|src)="\.\.\//, 'no relative links on a page one folder deeper');
assert.doesNotMatch(lw, /class="pf-about"/, 'the Overview text is not repeated on a tab');
assert.match(lw, /id="contact"/, 'the consultation buttons still have a form to open');

// --- the Articles page
const ar = renderFirmPage({ firm, tab: 'articles', tabs, allPosts: [post(1), post(2), post(3)] });
assert.match(ar, /<title>Articles by Test Law \| Miami, FL \| LawDB<\/title>/);
assert.match(ar, /href="https:\/\/lawdb\.ai\/test-law\/articles"/);
assert.match(ar, /Post 3/);

// --- the Overview keeps its address and gains only the tab bar
const ov = renderFirmPage({ firm, tabs, posts: [post(1)] });
assert.match(ov, /rel="canonical" href="https:\/\/lawdb\.ai\/test-law"/);
assert.match(ov, /<title>Test Law \| Miami, FL Lawyers \| LawDB<\/title>/);
assert.match(ov, /class="pf-ptabs"/);
assert.match(ov, /class="pf-about"/);
const alone = renderFirmPage({ firm, tabs: ['overview'] });
assert.doesNotMatch(alone, /pf-ptabs/, 'a firm with only an Overview shows no tab bar');

// --- the sitemap lists a tab only for a firm that has it
const rows = [
  { slug: 'a-firm', updatedAt: '2026-05-01 10:00:00', about: firm.about, details: JSON.stringify({ lawyers }), posts: 0 },
  { slug: 'b-firm', updatedAt: null, about: firm.about, details: null, posts: 4 },
  { slug: 'c-firm', updatedAt: null, about: firm.about, details: null, posts: 0 },
  { slug: 'd-firm', updatedAt: null, about: '', details: JSON.stringify({ lawyers }), posts: 9 }, // no real description yet: stays out
];
const counts = [{ firm: 'c-firm', n: 2 }]; // c-firm shows two lawyers on its Lawyers tab
const env = { SITE_ORIGIN: 'https://lawdb.ai', DB: { prepare: (sql) => ({ all: async () => ({ results: /FROM lawyers/.test(sql) ? counts : rows }) }) } };
const xml = await (await firmSitemap({ request: new Request('https://lawdb.ai/sitemap-firms.xml'), env })).text();
const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
assert.deepEqual(locs, ['https://lawdb.ai/a-firm', 'https://lawdb.ai/a-firm/lawyers', 'https://lawdb.ai/b-firm', 'https://lawdb.ai/b-firm/articles', 'https://lawdb.ai/c-firm', 'https://lawdb.ai/c-firm/lawyers']); // a lawyer's own page is never listed under a firm

// --- lawyer rows: only what is safe and complete reaches a page
const raw = { slug: 'maria-lopez', name: 'Maria Lopez', title: 'Partner', photo_status: 'approved', photo_id: 'a'.repeat(24), photo_url: 'https://example.com/maria.jpg', phone: '(305) 555-0199', email: 'maria@example.com', source_url: 'https://example.com/team/maria',
  socials: JSON.stringify({ linkedin: 'https://www.linkedin.com/in/maria-lopez', x: 'https://evil.example/x', facebook: 'javascript:alert(1)' }), areas: JSON.stringify(['Personal injury', '<b>x</b>']) };
const maria = cleanLawyer(raw);
assert.equal(maria.phone, '3055550199');
assert.deepEqual(Object.keys(maria.socials), ['linkedin'], 'only recognised personal profiles are kept');
assert.deepEqual(maria.areas, ['Personal injury']);
assert.equal(cleanLawyer({ ...raw, photo_id: null }).photo, '', 'a lawyer without an approved photo is kept, with no photo');
assert.equal(cleanLawyer({ ...raw, photo_status: 'pending' }).photo, '', 'a photo nobody approved is never shown');
assert.equal(cleanLawyer({ ...raw, photo_status: 'rejected' }).photo, '');
assert.equal(cleanLawyer({ ...raw, photo_id: '../etc' }).photo, '', 'only our own 24-hex picture id is used');
assert.equal(cleanLawyer(raw).photo, '/img/' + 'a'.repeat(24));
assert.doesNotMatch(JSON.stringify(cleanLawyer(raw)), /example\.com\/maria\.jpg/, 'the address on the firm\'s site never reaches a page');
assert.equal(cleanLawyer({ ...raw, email: 'info@example.com' }).email, '', 'a general office address is not a lawyer contact');
assert.equal(lawyerSlug('José  Núñez-Smith, Esq.'), 'jose-nunez-smith-esq');
const sam = cleanLawyer({ slug: 'sam-lee', name: 'Sam Lee', title: '', photo_status: 'approved', photo_id: 'b'.repeat(24), source_url: '' });
assert.equal(tabsFor({ details: null }, 0, 1).includes('lawyers'), true, 'one full profile is enough for the tab');

// --- a lawyer's own page: /lawyers/<slug>, separate from firms
const linked = { ...maria, slug: 'maria-lopez-miami-fl', city: 'Miami', state: 'FL', firmSlug: 'test-law', firmName: 'Test Law', paid: true };
const lp = renderLawyerPage(linked);
assert.match(lp, /<title>Maria Lopez - Partner at Test Law \| Miami, FL \| LawDB<\/title>/);
assert.match(lp, /rel="canonical" href="https:\/\/lawdb\.ai\/lawyers\/maria-lopez-miami-fl"/);
assert.match(lp, /"@type": "Person"/); assert.match(lp, /"jobTitle": "Partner"/); assert.match(lp, /"worksFor"/);
assert.match(lp, /href="tel:\+13055550199"/); assert.match(lp, /href="mailto:maria@example\.com"/); assert.match(lp, /linkedin\.com\/in\/maria-lopez/);
assert.match(lp, new RegExp('<img src="/img/' + 'a'.repeat(24) + '"')); assert.match(lp, /href="\/test-law"/);
assert.doesNotMatch(lp, /(?:href|src)="\.\.\//);
// a lawyer with no firm at all has the same page: no firm line, no worksFor, and no photo is fine
const solo = renderLawyerPage({ ...linked, slug: 'sam-lee-austin-tx', name: 'Sam Lee', title: '', city: 'Austin', state: 'TX', firmSlug: '', firmName: '', photo: '', phone: '', email: '', socials: {}, sourceUrl: '' });
assert.match(solo, /<title>Sam Lee \| Austin, TX \| LawDB<\/title>/); assert.doesNotMatch(solo, /worksFor/); assert.doesNotMatch(solo, /is listed with/); assert.match(solo, /class="tl-av"/);
// the lawyer's own biography replaces the generated text
assert.match(renderLawyerPage({ ...linked, bio: ['I handle injury claims.', 'Second paragraph.'] }), /<p class="lp-p">I handle injury claims\.<\/p>/);
assert.equal(cleanLawyer({ ...raw, bio: 'A\n\n<b>B</b>' }).bio.length, 2);

// Who gets a page: only a live lawyer on the Lawyer plan, whatever their firm is
const row = { slug: 'maria-lopez-miami-fl', name: 'Maria Lopez', title: 'Partner', city: 'Miami', state: 'FL', firm_slug: 'ghost-firm', firm_name: null, photo_status: 'approved', photo_id: 'a'.repeat(24), paid: 1 };
const dbWith = (r) => ({ DB: { prepare: (sql) => ({ bind: (slug) => ({ first: async () => { assert.match(sql, /paid_until > datetime\('now'\)/); assert.match(sql, /status = 'live'/); return r && r.slug === slug ? r : null; } }) }) }, ASSETS: { fetch: async () => new Response('nope', { status: 404 }) } });
const got = await getPaidLawyer(dbWith(row), 'maria-lopez-miami-fl');
assert.equal(got.firmSlug, '', 'a link to a firm that is not listed is shown as an independent lawyer'); assert.equal(got.paid, true);
assert.equal((await lawyerPage({ request: new Request('https://lawdb.ai/lawyers/maria-lopez-miami-fl'), env: dbWith(row) })).status, 200);
assert.equal((await lawyerPage({ request: new Request('https://lawdb.ai/lawyers/not-a-lawyer'), env: dbWith(row) })).status, 404, 'unknown or unpaid: a plain 404');
const lsx = await lawyerSitemap({ request: new Request('https://lawdb.ai/sitemap-lawyers.xml'), env: { SITE_ORIGIN: 'https://lawdb.ai', DB: { prepare: (sql) => ({ all: async () => { assert.match(sql, /paid_until > datetime\('now'\)/); return { results: [{ slug: 'maria-lopez-miami-fl', updatedAt: null }] }; } }) } } });
assert.deepEqual([...(await lsx.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]), ['https://lawdb.ai/lawyers/maria-lopez-miami-fl']);

// On a firm's Lawyers tab a paying lawyer's card links to their page (whatever plan the firm is on); any other lawyer is a plain card
const lst = renderFirmPage({ firm, tab: 'lawyers', tabs: ['overview', 'lawyers'], lawyers: [linked, sam] });
assert.match(lst, /href="\/lawyers\/maria-lopez-miami-fl"/); assert.match(lst, /View profile/);
assert.doesNotMatch(lst, /href="\/lawyers\/sam-lee"/); assert.match(lst, /Sam Lee/);
assert.equal(cleanLawyer({ ...raw, paid: 1 }).paid, true); assert.equal(cleanLawyer(raw).paid, false);
// at most MAX_LAWYERS cards
const many = Array.from({ length: 14 }, (_, i) => ({ slug: 'l' + i, name: 'Lawyer Number' + String.fromCharCode(65 + i), title: 'Associate', photo: '/img/' + 'c'.repeat(24) }));
assert.equal((renderFirmPage({ firm, tab: 'lawyers', tabs: ['overview', 'lawyers'], lawyers: many }).match(/class="tl-card/g) || []).length, MAX_LAWYERS);

// --- descriptions differ from lawyer to lawyer
const names = ['Ana Ruiz', 'Ben Cole', 'Cara Diaz', 'Dan Eng', 'Eva Fox', 'Gus Hill', 'Hal Ito', 'Ivy Jay'];
const texts = new Set(names.map((n) => { const l = { slug: lawyerSlug(n), name: n, title: 'Partner', areas: ['Personal injury'] }; return lawyerAbout({ lawyer: l, firmName: 'Test Law', city: 'Miami', state: 'FL' }).paragraphs.join(' ').replace(n, 'X').replace(n.split(' ')[0], 'X'); }));
assert.ok(texts.size >= 4, 'wording varies across lawyers');
assert.doesNotMatch([...texts].join(' '), /\b(best|top-rated|guarantee|leading)\b/i, 'no rankings or promises');

console.log('firm tabs: ok');

// --- renaming a firm moves its lawyers with it, and a long address is still a valid lawyer
assert.ok(SLUG_TABLES.includes('lawyers'), 'a firm rename must update lawyers.firm_slug');
const longSlug = 'a-very-long-name-that-goes-on-and-on-for-a-while-miami-fl-with-extra-words-here-2'; // 80 characters
assert.equal(cleanLawyer({ ...raw, slug: longSlug }).slug, longSlug);
assert.match(renderLawyerPage({ ...linked, firmSlug: '', firmName: '', photo: '/img/' + 'd'.repeat(24) }), /alt="Maria Lopez, Partner"/, 'no firm: the photo text does not name the city as a firm');
for (const f of ['migrations/0003_lawyers.sql']) assert.doesNotMatch(readFileSync(new URL('../' + f, import.meta.url), 'utf8'), /firm_lawyers/);
assert.match(renderLawyerPage({ ...linked, areas: [], bio: [] }), /<meta name="robots" content="noindex,follow">/, 'no biography and no practice areas: not indexed yet');
assert.doesNotMatch(lp, /noindex/, 'a page with practice areas is indexed');
console.log('lawyers: ok');
