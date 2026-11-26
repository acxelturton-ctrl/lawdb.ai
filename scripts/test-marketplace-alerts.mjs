// Tests for Marketplace phase 2 (src/lib/marketplace-alerts.js and the report/refund parts of src/lib/marketplace.js) on a real in-memory SQLite database with the real migrations:
// alert waves (Featured first, capped, spaced, only matching firms, only while unclaimed), what an email may contain, the daily cap and digest, and bad-inquiry reports and refunds.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import * as mp from '../src/lib/marketplace.js';
import * as al from '../src/lib/marketplace-alerts.js';

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
const env = { DB: db, BREVO_API_KEY: 'test-key', SITE_ORIGIN: 'https://lawdb.ai' };

// Brevo is replaced by a recorder
const mails = [];
globalThis.fetch = async (url, init) => { const b = JSON.parse(init.body); mails.push({ to: b.to.map((x) => x.email), subject: b.subject, html: b.htmlContent, text: b.textContent }); return { ok: true, json: async () => ({}) }; };
const take = () => mails.splice(0, mails.length);
const ageAlerts = () => raw.prepare("UPDATE mp_alerts SET sent_at = datetime('now', '-10 minutes')").run();

// ---- firms: f1 Featured; f2..f16 ordinary; f17 wants only Tampa; f18 alerts off; f19 daily digest; f20 criminal law
for (let i = 1; i <= 20; i++) {
  raw.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run(i, `owner${i}@firm${i}.test`);
  raw.prepare('INSERT INTO firms (slug, name, city, state, data, about, status, featured) VALUES (?,?,?,?,?,?,?,?)').run(`f${i}`, `Firm ${i}`, 'Miami', 'FL', '{}', 'x', 'live', i === 1 ? 1 : 0);
  raw.prepare("INSERT INTO firm_verifications (firm_slug, status, law_society, registrant_name) VALUES (?, 'verified', 'FL', 'Pat')").run(`f${i}`);
  raw.prepare("INSERT INTO firm_members (user_id, firm_slug, status, contact_name) VALUES (?, ?, 'approved', 'Pat')").run(i, `f${i}`);
  await mp.saveAccount(env, `f${i}`, { practiceAreas: [i === 20 ? 'criminal' : 'family'], states: ['FL'], cities: i === 17 ? ['Tampa'] : [], alerts: i === 18 ? 'off' : i === 19 ? 'daily' : 'instant' });
}
const good = { name: 'Jane Roe', email: 'jane.roe@example.com', phone: '3055550142', state: 'FL', city: 'Miami', practiceArea: 'family', issue: 'Divorce', urgency: 'week', description: 'My spouse and I are separating and we need help with the paperwork and the house.', consent: true };
const newLead = async (over = {}) => (await mp.createInquiry(env, { ...good, email: `p${Math.random().toString(36).slice(2)}@example.com`, ...over }, { ipHash: 'x' + Math.random() })).id;

// ---- nothing is sent while closed, without a mail key, or for an old inquiry
await mp.setSetting(env, 'marketplace_live', '0');
const L1 = await newLead();
eq(await al.processAlerts(env), 0, 'closed Marketplace: no alerts');
await mp.setSetting(env, 'marketplace_live', '1');
eq(await al.processAlerts({ ...env, BREVO_API_KEY: '' }), 0, 'no mail key: nothing is sent');
eq(raw.prepare('SELECT COUNT(*) AS n FROM mp_alerts').get().n, 0, 'and nothing is recorded as sent');
const old = await newLead();
raw.prepare("UPDATE mp_leads SET approved_at = datetime('now', '-25 hours') WHERE id = ?").run(old);
raw.prepare("UPDATE mp_leads SET status = 'expired' WHERE id = ?").run(old);

// ---- wave 0: only the Featured firm, during the head start
eq(await al.processAlerts(env), 1, 'during the head start only the Featured firm is told');
let m = take();
eq(m[0].to, ['owner1@firm1.test'], 'it goes to the firm\'s owner');
ok(/Family Law/.test(m[0].subject) && /Miami, Florida/.test(m[0].subject), 'the subject names the practice area and place');
ok(m[0].html.includes('Someone in Miami, Florida is looking for a family law / divorce lawyer about divorce.') && m[0].html.includes('#marketplace/f1'), 'the body is the one-line summary and a dashboard link');
ok(!/Jane|Roe|jane\.roe|5550142|spouse|house|paperwork/i.test(m[0].html + m[0].text), 'no name, email, phone or typed words are in the email');
eq(await al.processAlerts(env), 0, 'a second tick adds nothing before the inquiry opens');

// ---- wave 1: it opens to everyone: 15 ordinary firms, never the ones who should not be told
raw.prepare("UPDATE mp_leads SET opens_at = datetime('now', '-1 minute') WHERE id = ?").run(L1);
eq(await al.processAlerts(env), 0, 'right after wave 0 the gap between waves is respected');
ageAlerts();
eq(await al.processAlerts(env), 15, 'then a wave of 15 goes out');
m = take();
const told = new Set(m.map((x) => x.to[0]));
ok(![...told].some((e) => /owner1@|owner17@|owner18@|owner19@|owner20@/.test(e)), 'not Featured again, not a Tampa-only firm, not "off", not "daily", not another practice area');
ok(told.size === 15 && [...told].every((e) => /owner([2-9]|1[0-6])@/.test(e)), 'exactly firms 2 to 16');
eq(await al.processAlerts(env), 0, 'and no second wave straight away');
ageAlerts();
eq(await al.processAlerts(env), 0, 'nobody is left to tell');
ageAlerts(); await al.processAlerts(env); ageAlerts(); await al.processAlerts(env); ageAlerts();
eq(take().length, 0, 'waves stop after the limit');
eq(await al.processAlerts(env), 0, 'and never restart');

// ---- an inquiry that is taken stops being announced
const L2 = await newLead();
raw.prepare("UPDATE mp_leads SET opens_at = datetime('now', '-1 minute') WHERE id = ?").run(L2);
raw.prepare("UPDATE mp_leads SET status = 'unlocked' WHERE id = ?").run(L2);
eq(await al.processAlerts(env), 0, 'an unlocked inquiry is not announced');

// ---- the daily cap
const L3 = await newLead({});
raw.prepare("UPDATE mp_leads SET opens_at = datetime('now', '-1 minute') WHERE id = ?").run(L3);
for (let i = 0; i < al.WAVE.dailyCap; i++) raw.prepare("INSERT INTO mp_alerts (lead_id, firm_slug, wave) VALUES (0, ?, 0)").run(`pad${i}`);
eq(await al.processAlerts(env), 0, 'the daily email cap holds');
raw.prepare("DELETE FROM mp_alerts WHERE lead_id = 0").run();

// ---- daily digest
const digest = async (d) => al.sendDigests(env, new Date(d));
eq(await digest('2026-11-26T10:00:00Z'), 0, 'no digest outside the digest hour');
eq(await digest('2026-11-26T14:05:00Z'), 1, 'one digest at the digest hour, to the one firm on "daily"');
m = take();
eq(m[0].to, ['owner19@firm19.test'], 'to that firm\'s owner');
ok(m[0].subject.includes('match') && m[0].html.includes('#marketplace/f19'), 'a list of matching inquiries and a link');
ok(!/Jane|Roe|jane\.roe|5550142/i.test(m[0].html + m[0].text), 'the digest carries no personal details either');
eq(await digest('2026-11-26T14:30:00Z'), 0, 'only once a day');

// ---- reports and refunds
await mp.addCredit(env, 'f2', 'topup', 50000, { ref: 'cs_f2' });
const R1 = await newLead(); raw.prepare("UPDATE mp_leads SET opens_at = datetime('now', '-1 minute') WHERE id = ?").run(R1);
const R2 = await newLead(); raw.prepare("UPDATE mp_leads SET opens_at = datetime('now', '-1 minute') WHERE id = ?").run(R2);
const R3 = await newLead(); raw.prepare("UPDATE mp_leads SET opens_at = datetime('now', '-1 minute') WHERE id = ?").run(R3);
for (const id of [R1, R2, R3]) await mp.unlockLead(env, 'f2', 2, id);
const bal = () => raw.prepare("SELECT balance_cents FROM mp_accounts WHERE firm_slug = 'f2'").get().balance_cents;
eq(bal(), 50000 - 24000, 'three unlocks at $80');
await fails(() => mp.reportLead(env, 'f3', 3, R1, { reason: 'spam' }), 403, 'a firm that did not unlock it cannot report it');
await fails(() => mp.reportLead(env, 'f2', 2, R1, { reason: 'he did not hire us' }), 422, 'a made-up reason (one that depends on hiring) is refused');
eq((await mp.reportLead(env, 'f2', 2, R1, { reason: 'disconnected', detail: 'number is out of service' })).ok, true, 'a real reason within 48 hours is accepted');
await fails(() => mp.reportLead(env, 'f2', 2, R1, { reason: 'spam' }), 409, 'one report per inquiry');
raw.prepare("UPDATE mp_leads SET unlocked_at = datetime('now', '-49 hours') WHERE id = ?").run(R3);
await fails(() => mp.reportLead(env, 'f2', 2, R3, { reason: 'spam' }), 409, 'after 48 hours it is too late');
const free = (await mp.createTestLead(env, { id: 1, email: 'a@b.c' }, { practiceArea: 'family', state: 'FL', city: 'Miami' })).id;
await mp.unlockLead(env, 'f2', 2, free);
await fails(() => mp.reportLead(env, 'f2', 2, free, { reason: 'fake' }), 409, 'a free inquiry has nothing to refund');
await mp.reportLead(env, 'f2', 2, R2, { reason: 'spam' });
const open = await mp.adminReports(env, 'open');
eq(open.length, 2, 'the admin sees both open reports');
ok(open[0].details.email && open[0].reasonText, 'with the inquiry details and the reason');
const before = bal();
const adm = { id: 1, email: 'admin@lawdb.test' };
const refundId = open.find((r) => r.leadId === R1).id, denyId = open.find((r) => r.leadId === R2).id;
await mp.resolveReport(env, adm, refundId, 'approve', 'out of service');
eq(bal(), before + 8000, 'an approved report returns the price');
await fails(() => mp.resolveReport(env, adm, refundId, 'approve'), 404, 'a report is decided once');
eq(bal(), before + 8000, 'so the refund cannot be paid twice');
await mp.resolveReport(env, adm, denyId, 'deny', 'looks real');
eq(bal(), before + 8000, 'a denied report returns nothing');
const led = await mp.ledgerFor(env, 'f2');
ok(led.some((r) => r.kind === 'refund' && r.amountCents === 8000 && r.leadId === R1), 'the refund is a ledger row');
const mine = await mp.unlockedFor(env, 'f2');
eq(mine.find((l) => l.id === R1).reportStatus, 'approved', 'the firm sees its report was approved');
eq(mine.find((l) => l.id === R1).canReport, false, 'and cannot report again');
eq(mine.find((l) => l.id === R2).reportStatus, 'denied', 'a denied report shows as denied');
eq((await mp.adminReports(env, 'open')).length, 0, 'nothing is left open');

console.log(`marketplace alerts and reports: ok (${n} checks)`);
