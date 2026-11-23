// Firm profile tabs: which tabs a firm has, what each page says about itself, and the sitemap. Part of `npm run check`.
import assert from 'node:assert/strict';
import { renderFirmPage } from '../src/render/firm-page.js';
import { tabsFor, tabPath, MIN_LAWYERS, MIN_ARTICLES } from '../src/render/firm-tabs.js';
import { firmSitemap } from '../src/routes/firm-sitemap.js';
import { cleanLawyer, lawyerSlug, MAX_LAWYERS, profilesOn } from '../src/lib/lawyers.js';
import { lawyerAbout } from '../src/lib/lawyer-bio.js';

const lawyers = [{ name: 'Jane Roe', title: 'Partner' }, { name: 'John Doe', title: 'Associate' }];
const firm = { slug: 'test-law', name: 'Test Law', city: 'Miami', state: 'FL', phone: '+13055550100', website: 'https://example.com', about: 'We help people with injuries. '.repeat(30), details: { lawyers, areas: ['Personal injury'] }, tags: ['Personal injury'] };
const post = (n) => ({ id: n, title: `Post ${n}`, url: `https://example.com/p${n}`, publishedAt: '2026-01-01', excerpt: 'Short excerpt.' });

// --- which tabs a firm has
assert.deepEqual(tabsFor(firm, 0), ['overview', 'lawyers']);
assert.deepEqual(tabsFor({ ...firm, details: { lawyers: lawyers.slice(0, MIN_LAWYERS - 1) } }, 0), ['overview'], 'one named lawyer is not a page');
assert.deepEqual(tabsFor({ ...firm, details: null }, MIN_ARTICLES), ['overview', 'articles']);
assert.deepEqual(tabsFor({ ...firm, details: null }, MIN_ARTICLES - 1), ['overview']);
assert.deepEqual(tabsFor({ ...firm, details: { lawyers: [{ name: 'Our Team', title: '' }, { name: 'Contact Us' }] } }, 0), ['overview'], 'junk names do not count');
assert.equal(tabPath('x', 'overview'), '/firms/x');
assert.equal(tabPath('x', 'lawyers'), '/firms/x/lawyers');

// --- the Lawyers page
const tabs = ['overview', 'lawyers', 'articles'];
const lw = renderFirmPage({ firm, tab: 'lawyers', tabs, allPosts: [post(1), post(2), post(3)] });
assert.match(lw, /<title>Lawyers at Test Law \| Miami, FL \| LawDB<\/title>/);
assert.match(lw, /rel="canonical" href="https:\/\/lawdb\.ai\/firms\/test-law\/lawyers"/);
assert.match(lw, /Jane Roe/); assert.match(lw, /John Doe/);
assert.match(lw, /"name": "Lawyers",\s+"item": "https:\/\/lawdb\.ai\/firms\/test-law\/lawyers"/, 'breadcrumb ends at the tab');
assert.match(lw, /<a href="\/firms\/test-law\/lawyers" aria-current="page" class="on">Lawyers<\/a>/);
assert.match(lw, /<a href="\/firms\/test-law">Overview<\/a>/);
assert.doesNotMatch(lw, /(?:href|src)="\.\.\//, 'no relative links on a page one folder deeper');
assert.doesNotMatch(lw, /class="pf-about"/, 'the Overview text is not repeated on a tab');
assert.match(lw, /id="contact"/, 'the consultation buttons still have a form to open');

// --- the Articles page
const ar = renderFirmPage({ firm, tab: 'articles', tabs, allPosts: [post(1), post(2), post(3)] });
assert.match(ar, /<title>Articles by Test Law \| Miami, FL \| LawDB<\/title>/);
assert.match(ar, /href="https:\/\/lawdb\.ai\/firms\/test-law\/articles"/);
assert.match(ar, /Post 3/);

// --- the Overview keeps its address and gains only the tab bar
const ov = renderFirmPage({ firm, tabs, posts: [post(1)] });
assert.match(ov, /rel="canonical" href="https:\/\/lawdb\.ai\/firms\/test-law"/);
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
const people = [{ firm: 'c-firm', slug: 'maria-lopez' }, { firm: 'c-firm', slug: 'sam-lee' }];
const env = { SITE_ORIGIN: 'https://lawdb.ai', LAWYER_PROFILES: 'on', DB: { prepare: (sql) => ({ all: async () => ({ results: /firm_lawyers/.test(sql) ? people : rows }) }) } };
const xml = await (await firmSitemap({ request: new Request('https://lawdb.ai/sitemap-firms.xml'), env })).text();
const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
assert.deepEqual(locs, ['https://lawdb.ai/firms/a-firm', 'https://lawdb.ai/firms/a-firm/lawyers', 'https://lawdb.ai/firms/b-firm', 'https://lawdb.ai/firms/b-firm/articles', 'https://lawdb.ai/firms/c-firm', 'https://lawdb.ai/firms/c-firm/lawyers', 'https://lawdb.ai/firms/c-firm/lawyers/maria-lopez', 'https://lawdb.ai/firms/c-firm/lawyers/sam-lee']);

// --- lawyer rows: only what is safe and complete reaches a page
const raw = { slug: 'maria-lopez', name: 'Maria Lopez', title: 'Partner', photo_url: 'https://example.com/maria.jpg', phone: '(305) 555-0199', email: 'maria@example.com', source_url: 'https://example.com/team/maria',
  socials: JSON.stringify({ linkedin: 'https://www.linkedin.com/in/maria-lopez', x: 'https://evil.example/x', facebook: 'javascript:alert(1)' }), areas: JSON.stringify(['Personal injury', '<b>x</b>']) };
const maria = cleanLawyer(raw);
assert.equal(maria.phone, '3055550199');
assert.deepEqual(Object.keys(maria.socials), ['linkedin'], 'only recognised personal profiles are kept');
assert.deepEqual(maria.areas, ['Personal injury']);
assert.equal(cleanLawyer({ ...raw, photo_url: '' }), null, 'no photo, no profile');
assert.equal(cleanLawyer({ ...raw, photo_url: 'http://example.com/a.jpg' }), null, 'photo must be https');
assert.equal(cleanLawyer({ ...raw, email: 'info@example.com' }).email, '', 'a general office address is not a lawyer contact');
assert.equal(lawyerSlug('José  Núñez-Smith, Esq.'), 'jose-nunez-smith-esq');
const sam = cleanLawyer({ slug: 'sam-lee', name: 'Sam Lee', title: '', photo_url: 'https://example.com/sam.jpg', source_url: '' });
assert.equal(tabsFor({ details: null }, 0, 1).includes('lawyers'), true, 'one full profile is enough for the tab');

// --- a lawyer's page
const ls = [maria, sam];
const lp = renderFirmPage({ firm, tab: 'lawyers', tabs: ['overview', 'lawyers'], lawyers: ls, lawyer: maria });
assert.match(lp, /<title>Maria Lopez - Partner at Test Law \| Miami, FL \| LawDB<\/title>/);
assert.match(lp, /rel="canonical" href="https:\/\/lawdb\.ai\/firms\/test-law\/lawyers\/maria-lopez"/);
assert.match(lp, /"@type": "Person"/); assert.match(lp, /"jobTitle": "Partner"/);
assert.match(lp, /href="tel:\+13055550199"/); assert.match(lp, /href="mailto:maria@example\.com"/);
assert.match(lp, /linkedin\.com\/in\/maria-lopez/);
assert.match(lp, /<img src="https:\/\/example\.com\/maria\.jpg" alt="Maria Lopez, Partner at Test Law"/);
assert.match(lp, /"name": "Lawyers",\s+"item": "https:\/\/lawdb\.ai\/firms\/test-law\/lawyers"/);
assert.match(lp, /Other lawyers at Test Law/); assert.match(lp, /Sam Lee/);
assert.doesNotMatch(lp, /(?:href|src)="\.\.\//);
const lst = renderFirmPage({ firm, tab: 'lawyers', tabs: ['overview', 'lawyers'], lawyers: ls, profileLinks: true });
assert.match(lst, /href="\/firms\/test-law\/lawyers\/maria-lopez"/);
// profile pages are closed for now: cards are not links, at most MAX_LAWYERS are shown
const closed = renderFirmPage({ firm, tab: 'lawyers', tabs: ['overview', 'lawyers'], lawyers: ls });
assert.doesNotMatch(closed, /href="\/firms\/test-law\/lawyers\/maria-lopez"/); assert.match(closed, /Maria Lopez/);
const many = Array.from({ length: 14 }, (_, i) => ({ slug: 'l' + i, name: 'Lawyer Number' + String.fromCharCode(65 + i), title: 'Associate', photo: 'https://example.com/p.jpg' }));
assert.equal((renderFirmPage({ firm, tab: 'lawyers', tabs: ['overview', 'lawyers'], lawyers: many }).match(/class="tl-card/g) || []).length, MAX_LAWYERS);
assert.equal(profilesOn({}), false); assert.equal(profilesOn({ LAWYER_PROFILES: 'on' }), true);
const off = await firmSitemap({ request: new Request('https://lawdb.ai/sitemap-firms.xml'), env: { ...env, LAWYER_PROFILES: '' } });
assert.doesNotMatch(await off.text(), /\/lawyers\/maria-lopez/, 'no lawyer pages in the sitemap while they are closed');

// --- descriptions differ from lawyer to lawyer
const names = ['Ana Ruiz', 'Ben Cole', 'Cara Diaz', 'Dan Eng', 'Eva Fox', 'Gus Hill', 'Hal Ito', 'Ivy Jay'];
const texts = new Set(names.map((n) => { const l = { slug: lawyerSlug(n), name: n, title: 'Partner', areas: ['Personal injury'] }; return lawyerAbout({ lawyer: l, firmName: 'Test Law', city: 'Miami', state: 'FL' }).paragraphs.join(' ').replace(n, 'X').replace(n.split(' ')[0], 'X'); }));
assert.ok(texts.size >= 4, 'wording varies across lawyers');
assert.doesNotMatch([...texts].join(' '), /\b(best|top-rated|guarantee|leading)\b/i, 'no rankings or promises');

console.log('firm tabs: ok');
