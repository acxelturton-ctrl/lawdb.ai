// Tests that every form submission is saved, goes to the right firm owners, and also reaches the site's admin(s) (src/routes/public.js createLead), on a real in-memory SQLite database.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import * as pub from '../src/routes/public.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
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
const db = { prepare: (sql) => new Stmt(sql), batch: async (l) => l.map((s) => s.run()) };
const pending = [];
const exec = (p) => pending.push(p);
const send = async (env, body) => {
  const res = await pub.createLead({ request: new Request('http://localhost/api/leads', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '1.2.3.' + Math.floor(Math.random() * 250) }, body: JSON.stringify(body) }), env, url: new URL('http://localhost/api/leads'), exec });
  await Promise.all(pending.splice(0));
  return res.status;
};
const mails = () => raw.prepare("SELECT entity_id AS to_, detail FROM audit_log WHERE action = 'mail.dev' ORDER BY id").all().map((r) => ({ to: r.to_, subject: JSON.parse(r.detail).subject }));
const clear = () => raw.exec("DELETE FROM audit_log WHERE action = 'mail.dev'");

raw.prepare('INSERT INTO users (id, email) VALUES (1, ?)').run('owner@claimed.test');
for (const [slug, name] of [['claimed-law', 'Claimed Law'], ['unclaimed-law', 'Unclaimed Law']]) raw.prepare('INSERT INTO firms (slug, name, city, state, data, about, status) VALUES (?,?,?,?,?,?,?)').run(slug, name, 'Miami', 'FL', '{}', 'x', 'live');
raw.prepare("INSERT INTO firm_members (user_id, firm_slug, status, contact_name) VALUES (1, 'claimed-law', 'approved', 'Pat')").run();
const env = { DB: db, DEV_ECHO_LINK: '1', ADMIN_EMAILS: 'info@lawdb.test, boss@lawdb.test', SITE_ORIGIN: 'https://lawdb.ai' };

// a general contact form: saved, copied to the admins
eq(await send(env, { form: 'contact', name: 'Casey', email: 'casey@example.com', message: 'Hello there' }), 201, 'a contact form is accepted');
eq(raw.prepare('SELECT COUNT(*) AS n FROM leads').get().n, 1, 'and saved');
let m = mails();
eq(m.length, 1, 'one email goes out');
ok(m[0].to.includes('info@lawdb.test') && m[0].to.includes('boss@lawdb.test'), 'to every admin address');
eq(m[0].subject, 'New contact form', 'with a plain subject');

// a consultation form on a firm nobody manages: saved, copied to the admins, nobody else emailed
clear();
await send(env, { form: 'firm-profile', firm: 'unclaimed-law', name: 'Lee', email: 'lee@example.com', phone: '3055550100', message: 'I need a lawyer' });
m = mails();
eq(m.length, 1, 'an unclaimed firm: only the admin copy');
eq(m[0].subject, 'New inquiry for Unclaimed Law', 'which names the firm');
eq(raw.prepare("SELECT firm_slug FROM leads WHERE email = 'lee@example.com'").get().firm_slug, 'unclaimed-law', 'and the lead is attached to the firm');

// a consultation form on a claimed firm: the owner is emailed and the admins get a copy that says so
clear();
await send(env, { form: 'firm-profile', firm: 'claimed-law', name: 'Sam', email: 'sam@example.com', message: 'Please call me' });
m = mails();
eq(m.length, 2, 'a claimed firm: the owner and the admins');
ok(m.some((x) => x.to === 'owner@claimed.test' && /New inquiry for Claimed Law/.test(x.subject)), 'the owner is told');
ok(m.some((x) => x.to.includes('info@lawdb.test')), 'the admins get a copy');

// no admin configured: nothing extra
clear();
await send({ ...env, ADMIN_EMAILS: '' }, { form: 'contact', name: 'Kim', email: 'kim@example.com', message: 'Hi again' });
eq(mails().length, 0, 'no admin address, no copy');

// a robot is still ignored, and spam reports and waiting-list entries keep their own emails
clear();
await send(env, { form: 'contact', name: 'Bot', email: 'bot@example.com', botcheck: '1' });
eq(mails().length, 0, 'the hidden field still stops robots');
await send(env, { form: 'report-listing', name: 'Pat', email: 'pat@example.com', reportedFirm: 'claimed-law', reason: 'closed' });
m = mails();
eq(m.length, 1, 'a report goes to the admins once, not twice');

console.log(`lead copy: ok (${n} checks)`);
