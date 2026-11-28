// Short firm addresses (src/lib/handle-slug.js): where the handle comes from, and what it must never be.
import assert from 'node:assert/strict';
import { baseHandle, uniqueHandle, socialHandle, domainLabel, nameSlug } from '../src/lib/handle-slug.js';

const h = (f) => baseHandle(f).slug;
const src = (f) => baseHandle(f).source;

// social handles win, in the order Instagram, X, Facebook, LinkedIn, YouTube
const eric = { name: 'Eric Ramos Law, PLLC', city: 'San Antonio', website: 'https://ericramoslaw.com',
  social: { facebook: 'https://www.facebook.com/SAPDcentral', x: 'https://x.com/ericramoslaw', instagram: 'https://www.instagram.com/ericramoslawpllcsanantonio' } };
assert.equal(h(eric), 'ericramoslaw', 'the city and "pllc" are cut off the Instagram handle');
assert.equal(src(eric), 'instagram');
assert.equal(h({ ...eric, social: { x: eric.social.x } }), 'ericramoslaw');
assert.equal(src({ ...eric, social: { facebook: eric.social.facebook } }), 'website', 'a Facebook page that is not the firm is ignored, the website name is used');

assert.equal(h({ name: 'Dorsey & Whitney', city: 'New York', website: 'https://dorsey.com', social: { instagram: 'https://www.instagram.com/dorseywhitneyllp' } }), 'dorseywhitney');
assert.equal(h({ name: 'Dungan & Le Fevre Co Lpa: Hemm John E', city: 'Troy', website: 'https://dunganattorney.com', social: { facebook: 'https://www.facebook.com/dunganlefevre' } }), 'dunganlefevre');
assert.equal(h({ name: 'The Cifarelli Law Firm', city: 'Irvine', website: 'https://cifarelliinjurylaw.com', social: { facebook: 'https://www.facebook.com/California.Child.Abuse.Lawyers', youtube: 'https://www.youtube.com/@CifarelliLaw' } }), 'cifarellilaw', 'a keyword Facebook page is skipped; the YouTube handle is the firm');

// website name, only when it is the firm
assert.equal(h({ name: 'Hamo Law Firm', city: 'Flint', website: 'https://hamolaw.com' }), 'hamolaw');
assert.equal(h({ name: 'Parker & Bain', city: 'Gaffney', website: 'https://www.parkerbainlaw.com/' }), 'parkerbainlaw');

// a keyword/location domain is never used: fall back to the name, without city, state or PA
assert.equal(h({ name: 'Sammis Law Firm, PA', city: 'Clearwater', website: 'https://criminaldefenseattorneytampa.com' }), 'sammis-law-firm');
assert.equal(src({ name: 'Sammis Law Firm, PA', city: 'Clearwater', website: 'https://criminaldefenseattorneytampa.com' }), 'name');
assert.equal(h({ name: 'Patrick Toscano Law Firm', city: 'San Antonio', website: 'https://sanantonioinjurylawyer.pro' }), 'patrick-toscano-law-firm');

// the name fallback
assert.equal(nameSlug('The Smith Group, LLC', 'Miami'), 'smith-group');
assert.equal(nameSlug('Jones & Jones Miami', 'Miami'), 'jones-and-jones');
assert.equal(nameSlug('A Very Long Firm Name That Keeps Going On And On Forever Associates', 'Austin').length <= 40, true);

// pieces
assert.equal(socialHandle('facebook', 'https://www.facebook.com/profile.php?id=1000123'), null);
assert.equal(socialHandle('facebook', 'https://www.facebook.com/pages/Some-Firm/123456789'), null);
assert.equal(socialHandle('facebook', 'https://www.facebook.com/SmithLawFirm-100012345678'), 'SmithLawFirm');
assert.equal(socialHandle('linkedin', 'https://www.linkedin.com/in/ericramoslaw'), null, 'a personal LinkedIn page is not the firm');
assert.equal(socialHandle('linkedin', 'https://www.linkedin.com/company/dungan-lefevre'), 'dungan-lefevre');
assert.equal(socialHandle('youtube', 'https://www.youtube.com/channel/UCabc'), null);
assert.equal(domainLabel('https://www.smithlaw.co.uk/x'), 'smithlaw');
assert.equal(domainLabel('smith-law.com'), 'smithlaw');

// too short or too long is not a handle
assert.equal(h({ name: 'Xi Law', city: 'Austin', website: 'https://xi.com' }), 'xi-law');

// clashes: plain handle, then the state, then a number
const taken = new Set(['smithlaw', 'smithlaw-tx']);
const free = async (s) => !taken.has(s);
assert.equal(await uniqueHandle('jonesfirm', 'TX', free), 'jonesfirm');
assert.equal(await uniqueHandle('smithlaw', 'FL', free), 'smithlaw-fl');
assert.equal(await uniqueHandle('smithlaw', 'TX', free), 'smithlaw-tx-2');
assert.equal(await uniqueHandle('', 'TX', free), null);

// no address ever contains a city/state suffix pattern or odd characters
for (const f of [eric, { name: 'Ünïcode & Söns, P.C.', city: 'Austin', website: '' }]) assert.match(h(f), /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
console.log('handle slugs: ok');
