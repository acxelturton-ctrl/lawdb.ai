// Tests for the Marketplace engine (src/lib/marketplace.js) on a real in-memory SQLite database (the engine D1 uses) with the real migrations:
// screening, what a firm may see before paying, price decay and expiry, the Featured head start, one-buyer-per-inquiry unlocking (including two firms racing),
// the append-only ledger, and Stripe top-ups that can never be credited twice.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import * as mp from '../src/lib/marketplace.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const fails = async (fn, status, m) => { try { await fn(); } catch (e) { eq(e.status, status, `${m} (got ${e.status} ${e.message})`); return e; } ok(false, `${m}: expected an error`); };

const raw = new DatabaseSync(':memory:');
for (const f of readdirSync(new URL('../migrations/', import.meta.url)).filter((x) => x.endsWith('.sql')).sort()) raw.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
const plain = (r) => (r ? { ...r } : r);
class Stmt {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...a) { this.args = a.map((x) => (typeof x === 'boolean' ? Number(x) : x === undefined ? null : x)); return this; }
  all() { return { results: raw.prepare(this.sql).all(...this.args).map(plain) }; }
  first() { return plain(raw.prepare(this.sql).get(...this.args)) ?? null; }
  run() { const r = raw.prepare(this.sql).run(...this.args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; }
}
const db = { prepare: (sql) => new Stmt(sql), batch: async (list) => { raw.exec('BEGIN'); try { const out = list.map((s) => s.run()); raw.exec('COMMIT'); return out; } catch (e) { raw.exec('ROLLBACK'); throw e; } } };
const env = { DB: db };

const firm = (slug, { featured = 0, verified = true, state = 'FL' } = {}) => {
  raw.prepare('INSERT INTO firms (slug, name, city, state, data, about, status, featured) VALUES (?,?,?,?,?,?,?,?)').run(slug, slug, 'Miami', state, '{}', 'x', 'live', featured);
  if (verified) raw.prepare("INSERT INTO firm_verifications (firm_slug, status, law_society, registrant_name) VALUES (?, 'verified', ?, 'Pat Partner')").run(slug, state);
};
for (const id of [1, 2, 3, 9]) raw.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run(id, `user${id}@lawdb.test`);
firm('alpha-law'); firm('beta-law'); firm('gold-law', { featured: 1 }); firm('unverified-law', { verified: false });

const good = { name: 'Jane Roe', email: 'jane.roe@example.com', phone: '(305) 555-0142', state: 'FL', city: 'Miami', practiceArea: 'family', issue: 'Divorce', urgency: 'week', description: 'My spouse and I are separating and we need help with the paperwork and the house.', consent: true };

// ---- screening
eq(mp.screenInquiry({ ...good }).clean.phone, '3055550142', 'phone digits are kept');
ok(mp.screenInquiry({ ...good, website: 'http://spam.example' }).spam, 'the hidden field marks a robot');
ok(mp.screenInquiry({ ...good, consent: false }).errors.some((e) => /agree/.test(e)), 'consent is required');
ok(mp.screenInquiry({ ...good, email: 'x@mailinator.com' }).errors, 'a throwaway email is refused');
ok(mp.screenInquiry({ ...good, state: 'ZZ' }).errors, 'a made-up state is refused');
ok(mp.screenInquiry({ ...good, practiceArea: 'nonsense' }).errors, 'an unknown practice area is refused');
ok(mp.screenInquiry({ ...good, description: 'too short' }).errors, 'a one-line description is refused');
ok(mp.screenInquiry({ ...good, phone: '12345' }).errors, 'a short phone number is refused');
ok(mp.screenInquiry({ ...good, description: 'Buy bitcoin and casino chips now at my site, great deals for everyone today' }).spam, 'spam words are dropped');
ok(mp.screenInquiry({ ...good, description: 'see http://a.example and http://b.example for my whole story about the house and the spouse' }).spam, 'two links are dropped');
ok(mp.screenInquiry({ ...good, description: 'My husband hit me last night and I am afraid, there was domestic violence and I need an order' }).hold, 'domestic violence is held for a person');
ok(mp.screenInquiry({ ...good, description: 'Please call me, my social security number is 123-45-6789 so you can look me up quickly' }).hold, 'an ID number is held');
eq(mp.screenInquiry({ ...good, issue: 'Not on the list' }).clean.issue, null, 'a made-up issue type is dropped');
ok(!mp.screenInquiry({ ...good, description: 'I had a minor accident on the highway and my car needs a lot of repair work done' }).hold, '"minor accident" is not a child-safety case');

// ---- what a firm sees before paying never comes from what the person typed
const sum = mp.publicSummary({ practiceArea: 'family', city: 'Miami', state: 'FL', urgency: 'week', issue: 'Divorce' });
eq(sum, 'Someone in Miami, Florida is looking for a family law / divorce lawyer about divorce. Within a week.', 'a generated one-line summary');

// ---- intake
const live = async (v) => mp.setSetting(env, 'marketplace_live', v ? '1' : '0');
await live(false);
const a1 = await mp.createInquiry(env, good, { ipHash: 'ip1', ua: 'test' });
eq(a1.status, 'approved', 'a clean inquiry is approved at once');
const stored = raw.prepare('SELECT * FROM mp_leads WHERE id = ?').get(a1.id);
eq(stored.base_price_cents, 8000, 'family starts at $80');
const consent = JSON.parse(stored.consent);
ok(consent.version === mp.CONSENT.version && consent.text === mp.CONSENT.text && consent.at && consent.ipHash === 'ip1', 'the consent wording, version, time and connection are stored');
eq(await mp.createInquiry(env, good, { ipHash: 'ip1' }), null, 'the same person asking twice about the same thing is one inquiry');
eq(await mp.createInquiry(env, { ...good, website: 'x' }), null, 'a robot is dropped quietly');
const held = await mp.createInquiry(env, { ...good, email: 'sam@example.com', description: 'My brother was arrested last night and I need to know what to do about the bail hearing' }, { ipHash: 'ip2' });
eq(held.status, 'held', 'a sensitive inquiry waits for a person');
for (let i = 0; i < 3; i++) await mp.createInquiry(env, { ...good, email: `r${i}@example.com`, practiceArea: 'wills', issue: 'Probate' }, { ipHash: 'ip3' });
await fails(() => mp.createInquiry(env, { ...good, email: 'r9@example.com', practiceArea: 'wills' }, { ipHash: 'ip3' }), 429, 'a fourth inquiry in an hour from one connection');
await mp.setSetting(env, 'mp_prices', JSON.stringify({ family: 9900 }));
eq(await mp.basePrice(env, 'family'), 9900, 'a price set in the admin overrides the default');
await mp.setSetting(env, 'mp_prices', '{}');

// ---- the feed: verified firms only, preview only
await fails(() => mp.feed(env, 'unverified-law'), 403, 'an unverified firm sees nothing');
await fails(() => mp.unlockLead(env, 'unverified-law', 1, a1.id), 403, 'and cannot unlock');
let f = await mp.feed(env, 'alpha-law');
ok(f.needsSetup, 'a verified firm that has not chosen practice areas is asked to');
eq((await mp.feed(env, 'alpha-law', { all: true })).leads.length, 0, 'while the Marketplace is off only test inquiries show (none yet)');

// ---- go live: real inquiries show, test ones stop
await live(true);
await mp.saveAccount(env, 'alpha-law', { practiceAreas: ['family'], states: ['FL'], alerts: 'daily' });
await mp.saveAccount(env, 'beta-law', { practiceAreas: ['family'], states: ['FL'] });
await mp.saveAccount(env, 'gold-law', { practiceAreas: ['family'], states: ['FL'] });
eq((await mp.feed(env, 'alpha-law')).leads.length, 0, 'a brand-new inquiry is not open to ordinary firms until the head start ends');
const early = await mp.feed(env, 'gold-law');
eq(early.leads.length, 1, 'a Featured firm sees it at once');
ok(early.leads[0].early, 'and it is marked early');
const feedText = JSON.stringify(early);
ok(!/Jane|Roe|jane\.roe|555|spouse|house/i.test(feedText), 'the feed carries no name, email, phone or typed words');
raw.prepare("UPDATE mp_leads SET opens_at = datetime('now', '-1 minute') WHERE id = ?").run(a1.id);
eq((await mp.feed(env, 'alpha-law')).leads.length, 1, 'after the head start everyone sees it');
eq((await mp.feed(env, 'alpha-law', { city: 'Tampa' })).leads.length, 0, 'the city filter narrows the feed');
await mp.saveAccount(env, 'alpha-law', { practiceAreas: ['criminal'], states: ['TX'] });
eq((await mp.feed(env, 'alpha-law')).leads.length, 0, 'a firm outside the practice area and state sees none by default');
eq((await mp.feed(env, 'alpha-law', { all: true })).leads.length, 1, 'but can widen to browse everything');
await mp.saveAccount(env, 'alpha-law', { practiceAreas: ['family'], states: ['FL'] });

// ---- unlock: credit is required, and one buyer wins
await fails(() => mp.unlockLead(env, 'alpha-law', 1, a1.id), 402, 'no credit, no unlock');
eq((await mp.addCredit(env, 'alpha-law', 'topup', 20000, { ref: 'cs_1' })).credited, true, 'a top-up adds credit');
eq((await mp.addCredit(env, 'alpha-law', 'topup', 20000, { ref: 'cs_1' })).credited, false, 'the same payment is never credited twice');
eq(raw.prepare("SELECT balance_cents FROM mp_accounts WHERE firm_slug = 'alpha-law'").get().balance_cents, 20000, 'one top-up of $200');
await mp.addCredit(env, 'beta-law', 'topup', 20000, { ref: 'cs_2' });

const race = await Promise.allSettled([mp.unlockLead(env, 'alpha-law', 1, a1.id), mp.unlockLead(env, 'beta-law', 2, a1.id)]);
eq(race.filter((r) => r.status === 'fulfilled').length, 1, 'two firms racing for one inquiry: exactly one gets it');
eq(raw.prepare("SELECT COUNT(*) AS n FROM mp_ledger WHERE kind = 'unlock'").get().n, 1, 'and exactly one charge is written');
const winner = raw.prepare('SELECT unlocked_by, paid_cents, status FROM mp_leads WHERE id = ?').get(a1.id);
eq(winner.status, 'unlocked', 'the inquiry is unlocked');
eq(winner.paid_cents, 8000, 'at the full price inside 48 hours');
const [wSlug, lSlug] = winner.unlocked_by === 'alpha-law' ? ['alpha-law', 'beta-law'] : ['beta-law', 'alpha-law'];
eq(raw.prepare('SELECT balance_cents FROM mp_accounts WHERE firm_slug = ?').get(wSlug).balance_cents, 12000, 'the winner paid $80');
eq(raw.prepare('SELECT balance_cents FROM mp_accounts WHERE firm_slug = ?').get(lSlug).balance_cents, 20000, 'the other firm paid nothing');
const rejected = race.find((r) => r.status === 'rejected');
eq(rejected.reason.status, 409, 'the loser is told it was taken');
eq((await mp.feed(env, lSlug)).leads.length, 0, 'it disappears from everyone else\'s feed');
const mine = await mp.unlockedFor(env, wSlug);
ok(mine.length === 1 && mine[0].email === 'jane.roe@example.com' && mine[0].phone === '3055550142' && mine[0].name === 'Jane Roe', 'the winner sees the contact details');
eq((await mp.unlockedFor(env, lSlug)).length, 0, 'the other firm sees none');
await fails(() => mp.unlockLead(env, wSlug, 1, a1.id), 409, 'unlocking it again does not charge again');
eq(raw.prepare("SELECT COUNT(*) AS n FROM mp_ledger WHERE kind = 'unlock'").get().n, 1, 'still one charge');

// ---- the ledger is append only
let blocked = false; try { raw.prepare('UPDATE mp_ledger SET amount_cents = 1').run(); } catch { blocked = true; } ok(blocked, 'a ledger row cannot be changed');
blocked = false; try { raw.prepare('DELETE FROM mp_ledger').run(); } catch { blocked = true; } ok(blocked, 'or removed');
const led = await mp.ledgerFor(env, wSlug);
eq(led.map((r) => r.kind).sort(), ['topup', 'unlock'], 'the winner\'s ledger shows the top-up and the unlock');
eq(led.find((r) => r.kind === 'unlock').balanceAfter, 12000, 'with the balance after each row');

// ---- price decay and expiry
const day3 = await mp.createInquiry(env, { ...good, email: 'p3@example.com', practiceArea: 'immigration', issue: 'Citizenship' }, { ipHash: 'ip4' });
const day9 = await mp.createInquiry(env, { ...good, email: 'p9@example.com', practiceArea: 'traffic', issue: 'Speeding ticket' }, { ipHash: 'ip5' });
raw.prepare("UPDATE mp_leads SET approved_at = datetime('now', '-3 days'), opens_at = datetime('now', '-3 days') WHERE id = ?").run(day3.id);
raw.prepare("UPDATE mp_leads SET approved_at = datetime('now', '-9 days'), opens_at = datetime('now', '-9 days') WHERE id = ?").run(day9.id);
await mp.saveAccount(env, 'gold-law', { practiceAreas: ['immigration', 'traffic', 'family'], states: ['FL'] });
const decayed = (await mp.feed(env, 'gold-law')).leads;
eq(decayed.map((l) => l.id), [day3.id], 'an inquiry older than 7 days never displays');
eq(decayed[0].priceCents, 4800, 'day 3 costs 60% of $80');
eq(mp.priceFor(8000, 10), 8000, 'full price when fresh'); eq(mp.priceFor(8000, 60), 4800, 'discounted after 48 hours');
await mp.addCredit(env, 'gold-law', 'promo', 5000, { note: 'welcome' });
const bought = await mp.unlockLead(env, 'gold-law', 3, day3.id);
eq(bought.paidCents, 4800, 'the discounted price is what is charged');
await fails(() => mp.unlockLead(env, 'gold-law', 3, day9.id), 409, 'an expired inquiry cannot be unlocked');
eq(await mp.expireOld(env), 1, 'the hourly sweep expires it');
eq(raw.prepare('SELECT status FROM mp_leads WHERE id = ?').get(day9.id).status, 'expired', 'and marks it expired');

// ---- a held inquiry is listed only after a person approves it
const adm = { id: 9, email: 'admin@lawdb.test' };
eq((await mp.adminLeads(env, 'held')).length, 1, 'the admin sees the held inquiry');
await mp.decideLead(env, adm, held.id, 'approve');
eq(raw.prepare('SELECT status FROM mp_leads WHERE id = ?').get(held.id).status, 'approved', 'approving lists it');
await fails(() => mp.decideLead(env, adm, held.id, 'approve'), 404, 'it can be decided once');

// ---- not enough credit never charges
await mp.saveAccount(env, 'beta-law', { practiceAreas: ['family'], states: ['FL'] });
raw.prepare("UPDATE mp_leads SET opens_at = datetime('now', '-1 minute') WHERE id = ?").run(held.id);
raw.prepare("UPDATE mp_accounts SET balance_cents = 100 WHERE firm_slug = 'beta-law'").run();
const poor = await fails(() => mp.unlockLead(env, 'beta-law', 2, held.id), 402, 'a balance under the price');
ok(/\$80\.00|\$99|\$/.test(poor.message), 'the message says what it costs');
eq(raw.prepare("SELECT status FROM mp_leads WHERE id = ?").get(held.id).status, 'approved', 'the inquiry stays open');

// ---- Stripe top-ups
eq(mp.topupOptions({}, 'alpha-law'), [], 'no payment links, no top-up buttons');
const links = mp.topupOptions({ MP_TOPUP_LINK_100: 'https://buy.stripe.com/abc', MP_TOPUP_LINK_250: 'https://evil.example/x' }, 'alpha-law', 'a@b.co');
eq(links.length, 1, 'only a Stripe address is accepted as a payment link');
ok(links[0].url.includes('client_reference_id=mp_alpha-law') && links[0].amountCents === 10000, 'the firm rides in client_reference_id');
const session = { id: 'cs_live_1', client_reference_id: 'mp_beta-law', mode: 'payment', payment_status: 'paid', currency: 'usd', amount_total: 25000 };
const before = raw.prepare("SELECT balance_cents FROM mp_accounts WHERE firm_slug = 'beta-law'").get().balance_cents;
await mp.creditFromCheckout(env, session); await mp.creditFromCheckout(env, session);
eq(raw.prepare("SELECT balance_cents FROM mp_accounts WHERE firm_slug = 'beta-law'").get().balance_cents, before + 25000, 'a paid top-up is credited once, even if Stripe repeats the event');
await mp.creditFromCheckout(env, { ...session, id: 'cs_2', payment_status: 'unpaid' });
await mp.creditFromCheckout(env, { ...session, id: 'cs_3', currency: 'cad' });
await mp.creditFromCheckout(env, { ...session, id: 'cs_4', client_reference_id: 'mp_nobody' });
eq(raw.prepare("SELECT balance_cents FROM mp_accounts WHERE firm_slug = 'beta-law'").get().balance_cents, before + 25000, 'unpaid, non-dollar and unknown-firm payments credit nothing');

// ---- test inquiries: free, shown only while the Marketplace is off
await live(false);
const t = await mp.createTestLead(env, adm, { practiceArea: 'family', state: 'FL', city: 'Miami' });
const tf = await mp.feed(env, 'beta-law');
ok(tf.leads.length === 1 && tf.leads[0].test && tf.leads[0].priceCents === 0, 'a test inquiry shows, marked as a test, at no cost');
await live(true);
eq((await mp.feed(env, 'beta-law')).leads.filter((l) => l.test).length, 0, 'and disappears once the Marketplace is live');

const ov = await mp.adminOverview(env);
ok(ov.topupsCents >= 25000 && ov.unlockedCents === 8000 + 4800, 'the admin overview adds up the ledger');

console.log(`marketplace engine: ok (${n} checks)`);
