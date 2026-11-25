// LawDB Marketplace "coming soon" page: SEO basics, the labelled example, the waiting-list form, and no real or brown colours. Part of `npm run check`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { marketplaceWaitlistEmail, marketplaceWaitlistAdminEmail } from '../src/lib/email.js';

const html = readFileSync('marketplace.html', 'utf8');
assert.match(html, /<title>LawDB Marketplace for Law Firms/);
assert.match(html, /<link rel="canonical" href="https:\/\/lawdb\.ai\/marketplace">/);
assert.match(html, /<meta name="description" content="[^"]{80,200}"/);
assert.match(html, /property="og:title"/);
assert.match(html, /"@type": "FAQPage"/);
assert.match(html, /Example inquiry, not a real inquiry/);
assert.match(html, /name="botcheck"/);
assert.match(html, /form:'marketplace-waitlist'/);
assert.match(html, /How it works/);
assert.match(html, /<h1>/);
assert.equal((html.match(/<h1>/g) || []).length, 1);
assert.doesNotMatch(html, /\b(referral|commission|client for sale)\b/i, 'language the brief rules out');
assert.doesNotMatch(html, /#(7a5f1f|5a4a1f|8b4513|a0522d|6b4423|5c4033)/i, 'no brown');
assert.match(html, /href="\/marketplace">LawDB Marketplace<\/a>/, 'footer link');
assert.match(readFileSync('for-firms.html', 'utf8'), /href="\/marketplace"/);

const m = marketplaceWaitlistEmail('https://lawdb.ai', { name: 'Pat Lee', firm: 'Lee & Co <b>' });
assert.match(m.subject, /LawDB Marketplace/);
assert.match(m.html, /Lee &amp; Co &lt;b&gt;/);              // escaped
assert.match(m.text, /Nothing is sent by text message/);
const a = marketplaceWaitlistAdminEmail('https://lawdb.ai', { name: 'Pat', email: 'p@x.com', firm: 'Lee', state: 'FL', areas: 'family' });
assert.match(a.text, /Firm: Lee/); assert.match(a.text, /State: FL/);
console.log('marketplace: ok');
