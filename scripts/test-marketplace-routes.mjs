// Tests for the Marketplace routes (src/routes/marketplace.js) with real sessions on an in-memory SQLite database: who may see what, and that nothing opens by accident.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createSession } from '../src/lib/auth.js';
import * as r from '../src/routes/marketplace.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const raw = new DatabaseSync(':memory:');
for (const f of readdirSync(new URL('../migrations/', import.meta.url)).filter((x) => x.endsWith('.sql')).sort()) raw.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
const plain = (x) => (x ? { ...x } : x);
class Stmt {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...a) { this.args = a.map((x) => (typeof x === 'boolean' ? Number(x) : x === undefined ? null : x)); return this; }
  all() { return { results: raw.prepare(this.sql).all(...this.args).map(plain) }; }
  first() { return plain(raw.prepare(this.sql).get(...this.args)) ?? null; }
  run() { const x = raw.prepare(this.sql).run(...this.args); return { meta: { last_row_id: Number(x.lastInsertRowid), changes: x.changes } }; }
}
const db = { prepare: (sql) => new Stmt(sql), batch: async (list) => { raw.exec('BEGIN'); try { const out = list.map((s) => s.run()); raw.exec('COMMIT'); return out; } catch (e) { raw.exec('ROLLBACK'); throw e; } } };
const env = { DB: db, ADMIN_EMAILS: 'admin@lawdb.test', SITE_ORIGIN: 'https://lawdb.ai', MP_TOPUP_LINK_100: 'https://buy.stripe.com/test100' };
const BASE = 'http://localhost';
const req = (method, path, body, cookie) => new Request(BASE + path, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const status = async (fn) => { try { const res = await fn(); return { status: res.status, body: await res.json() }; } catch (e) { return { status: e.status, error: e.message }; } };

const user = (id, email, role = 'member') => raw.prepare('INSERT INTO users (id, email, role) VALUES (?,?,?)').run(id, email, role);
const sessionFor = async (id) => (await createSession(env, new Request('https://lawdb.ai/x'), id)).split(';')[0].replace('__Host-', '');
user(1, 'owner@verified.test'); user(2, 'owner@plain.test'); user(3, 'stranger@x.test'); user(4, 'admin@lawdb.test', 'admin');
const firm = (slug, verified) => { raw.prepare('INSERT INTO firms (slug, name, city, state, data, about, status) VALUES (?,?,?,?,?,?,?)').run(slug, slug, 'Miami', 'FL', '{}', 'x', 'live'); if (verified) raw.prepare("INSERT INTO firm_verifications (firm_slug, status, law_society, registrant_name) VALUES (?, 'verified', 'FL', 'Pat')").run(slug); };
firm('verified-law', true); firm('plain-law', false);
raw.prepare("INSERT INTO firm_members (user_id, firm_slug, status, contact_name) VALUES (1, 'verified-law', 'approved', 'Pat')").run();
raw.prepare("INSERT INTO firm_members (user_id, firm_slug, status, contact_name) VALUES (2, 'plain-law', 'approved', 'Lee')").run();
const cookie = async (id) => { const c = await createSession(env, new Request('http://localhost/x'), id); return c.split(';')[0]; };
const owner = await cookie(1), plainOwner = await cookie(2), stranger = await cookie(3), admin = await cookie(4);

// ---- the public form is closed until the owner opens it
const f0 = await status(() => r.form({ env }));
eq(f0.body.open, false, 'the form reports the Marketplace as closed');
ok(f0.body.consent.text.includes('one law firm that pays') && f0.body.consent.version, 'and carries the consent wording and its version');
const good = { name: 'Jane Roe', email: 'jane@example.com', state: 'FL', city: 'Miami', practiceArea: 'family', urgency: 'week', description: 'My spouse and I are separating and need help with the paperwork soon.', consent: true };
eq((await status(() => r.inquiry({ request: req('POST', '/api/marketplace/inquiry', good), env }))).status, 503, 'an inquiry is refused while the Marketplace is closed');
eq(raw.prepare('SELECT COUNT(*) AS n FROM mp_leads').get().n, 0, 'and nothing is stored');

// ---- firm side: login, ownership, verification
eq((await status(() => r.firmGet({ request: req('GET', '/x'), env, params: { slug: 'verified-law' } }))).status, 401, 'logged out: sign in required');
eq((await status(() => r.firmGet({ request: req('GET', '/x', null, stranger), env, params: { slug: 'verified-law' } }))).status, 403, 'not an owner of the firm: refused');
const pv = await status(() => r.firmGet({ request: req('GET', '/x', null, plainOwner), env, params: { slug: 'plain-law' } }));
ok(pv.status === 200 && !pv.body.account && /verified/i.test(pv.body.message), 'an unverified firm gets a message and no marketplace data');
eq((await status(() => r.firmFeed({ request: req('GET', '/x', null, plainOwner), env, params: { slug: 'plain-law' }, url: new URL(BASE + '/x') }))).status, 403, 'and cannot open the feed');
eq((await status(() => r.firmUnlock({ request: req('POST', '/x', {}, plainOwner), env, params: { slug: 'plain-law', id: '1' } }))).status, 403, 'or unlock');
const vv = await status(() => r.firmGet({ request: req('GET', '/x', null, owner), env, params: { slug: 'verified-law' } }));
ok(vv.status === 200 && vv.body.account.balanceCents === 0 && vv.body.topups.length === 1 && vv.body.topups[0].url.includes('mp_verified-law'), 'a verified owner sees their account, balance and top-up links');
const saved = await status(() => r.firmSave({ request: req('PUT', '/x', { practiceAreas: ['family', 'bogus'], states: ['FL', 'ZZ'], alerts: 'daily' }, owner), env, params: { slug: 'verified-law' } }));
eq(saved.body.account.practiceAreas, ['family'], 'only real practice areas are saved'); eq(saved.body.account.states, ['FL'], 'and only real states');

// ---- admin only
eq((await status(() => r.adminOverview({ request: req('GET', '/x', null, owner), env }))).status, 403, 'a firm owner cannot open the admin Marketplace');
eq((await status(() => r.adminOverview({ request: req('GET', '/x'), env }))).status, 401, 'nor a visitor');
const ov = await status(() => r.adminOverview({ request: req('GET', '/x', null, admin), env }));
ok(ov.status === 200 && ov.body.live === false && ov.body.prices.family === 8000, 'the admin sees the switch (off) and the prices');

// ---- opening it needs a deliberate confirmation
const noConfirm = await status(() => r.adminSettings({ request: req('PATCH', '/x', { live: true }, admin), env }));
eq(noConfirm.status, 422, 'opening the Marketplace without confirming the lawyer review is refused');
eq(raw.prepare("SELECT value FROM site_settings WHERE key = 'marketplace_live'").get().value, '0', 'it stays closed');
eq((await status(() => r.adminSettings({ request: req('PATCH', '/x', { live: true, reviewedByLawyer: true }, admin), env }))).status, 200, 'with the confirmation it opens');
eq((await status(() => r.form({ env }))).body.open, true, 'and the form reports open');
const sent = await status(() => r.inquiry({ request: req('POST', '/api/marketplace/inquiry', good), env }));
ok(sent.status === 200 && sent.body.ok, 'an inquiry is accepted');
eq(await status(() => r.inquiry({ request: req('POST', '/api/marketplace/inquiry', good), env })).then((x) => x.body), { ok: true }, 'a repeat looks exactly like a success');
eq(raw.prepare('SELECT COUNT(*) AS n FROM mp_leads').get().n, 1, 'but is stored once');
eq((await status(() => r.inquiry({ request: req('POST', '/api/marketplace/inquiry', { ...good, consent: false }), env }))).status, 422, 'without consent it is refused');

// ---- admin settings and credit are validated
eq((await status(() => r.adminSettings({ request: req('PATCH', '/x', { welcomeCreditDollars: 9999 }, admin), env }))).status, 422, 'a welcome credit above $500 is refused');
const pr = await status(() => r.adminSettings({ request: req('PATCH', '/x', { prices: { family: 99, bogus: 5 } }, admin), env }));
eq(pr.body.changed.prices, { family: 9900 }, 'prices are saved per real practice area only');
eq((await status(() => r.adminCredit({ request: req('POST', '/x', { slug: 'verified-law', dollars: 50 }, admin), env }))).status, 200, 'the admin can credit a firm');
eq(raw.prepare("SELECT balance_cents FROM mp_accounts WHERE firm_slug = 'verified-law'").get().balance_cents, 5000, 'and the balance moves');
eq((await status(() => r.adminCredit({ request: req('POST', '/x', { slug: 'nobody', dollars: 5 }, admin), env }))).status, 404, 'an unknown firm is refused');
eq((await status(() => r.adminCredit({ request: req('POST', '/x', { slug: 'verified-law', dollars: 0 }, admin), env }))).status, 422, 'a zero credit is refused');

console.log(`marketplace routes: ok (${n} checks)`);
