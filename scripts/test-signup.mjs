// Tests for sign-up and the way into LawDB Connect: the work-email check (src/lib/email-match.js), which links and redirects point where, what the sign-in page may offer,
// the sign-in link flow (request, verify, one use only) and claiming a firm (approved at once only with a work email on the firm's own website), on a real in-memory
// SQLite database (the engine D1 uses) with the real migrations.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { emailMatch } from '../src/lib/email-match.js';
import { siteOrigin } from '../src/lib/auth.js';
import { emailConfigured, newClaimEmail } from '../src/lib/email.js';
import * as authRoutes from '../src/routes/auth.js';
import * as account from '../src/routes/account.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

// ---- the work-email check
eq(emailMatch('pat@morrislaw.com', 'https://morrislaw.com'), 'match', 'same domain');
eq(emailMatch('pat@morrislaw.com', 'https://www.morrislaw.com/contact'), 'match', 'www and paths are ignored');
eq(emailMatch('pat@mail.morrislaw.com', 'https://morrislaw.com'), 'match', 'a sub-domain mail address');
eq(emailMatch('PAT@MorrisLaw.com', 'https://morrislaw.com'), 'match', 'case does not matter');
eq(emailMatch('pat@gmail.com', 'https://morrislaw.com'), 'free', 'Gmail proves nothing');
eq(emailMatch('pat@comcast.net', 'https://morrislaw.com'), 'free', 'an internet provider address proves nothing');
eq(emailMatch('pat@otherfirm.com', 'https://morrislaw.com'), 'mismatch', 'another domain');
eq(emailMatch('pat@evilmorrislaw.com', 'https://morrislaw.com'), 'mismatch', 'a look-alike domain is not a sub-domain');
eq(emailMatch('pat@morrislaw.com.evil.io', 'https://morrislaw.com'), 'mismatch', 'a domain that merely starts with the firm name');
eq(emailMatch('pat@morrislaw.com', ''), 'nosite', 'no website');
eq(emailMatch('pat@morrislaw.com', 'not a url'), 'nosite', 'a broken website');
eq(emailMatch('pat@facebook.com', 'https://www.facebook.com/morrislaw'), 'nosite', 'a Facebook page is not a domain the firm controls');
eq(emailMatch('pat@wixsite.com', 'https://morris.wixsite.com/law'), 'nosite', 'a site-builder address is shared by many');
eq(emailMatch('pat@findlaw.com', 'https://lawyers.findlaw.com/x'), 'nosite', 'a directory page is shared by many');
eq(emailMatch('nobody', 'https://morrislaw.com'), 'mismatch', 'not an email');

// ---- where links point
const prod = { SITE_ORIGIN: 'https://lawdb.ai' };
eq(siteOrigin(prod, new URL('https://lawdb.ai/api/auth/request-link')), 'https://lawdb.ai', 'the real site, on the real site');
eq(siteOrigin(prod, new URL('https://lawdb-ai.acxelturton.workers.dev/api/auth/request-link')), 'https://lawdb-ai.acxelturton.workers.dev', 'a workers.dev preview links to itself, so emailed sign-in links open');
eq(siteOrigin(prod, new URL('https://evil.example/api/auth/request-link')), 'https://lawdb.ai', 'any other host still gets the real site');
eq(siteOrigin(prod, new URL('https://lawdb.ai.evil.workers.dev/x')), 'https://lawdb.ai.evil.workers.dev', 'a preview address is only ever our own worker route');
eq(siteOrigin({ SITE_ORIGIN: 'https://lawdb.ai/', DEV_ECHO_LINK: '1' }, new URL('http://127.0.0.1:8799/x')), 'http://127.0.0.1:8799', 'local development');
eq(siteOrigin({}, new URL('https://x.test/y')), 'https://x.test', 'no setting: the request host');

// ---- what the sign-in page may offer
ok(!emailConfigured({}) && !emailConfigured({ BREVO_API_KEY: '   ' }), 'no mail key: no email sign-in is promised');
ok(emailConfigured({ BREVO_API_KEY: 'xkeysib-abc' }) && emailConfigured({ DEV_ECHO_LINK: '1' }), 'a mail key, or local development');
const providers = await authRoutes.providers({ env: {} }).json();
eq(providers, { google: false, linkedin: false, email: false }, 'nothing configured: nothing offered');
eq(await authRoutes.providers({ env: { GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b', BREVO_API_KEY: 'k' } }).json(), { google: true, linkedin: false, email: true }, 'Google and email configured');

// ---- a D1-shaped wrapper over SQLite
const raw = new DatabaseSync(':memory:');
for (const f of ['0001_schema.sql', '0002_network.sql']) raw.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
const plainRow = (r) => (r ? { ...r } : r);
class Stmt {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...a) { this.args = a.map((x) => (typeof x === 'boolean' ? Number(x) : x === undefined ? null : x)); return this; }
  all() { return { results: raw.prepare(this.sql).all(...this.args).map(plainRow) }; }
  first() { return plainRow(raw.prepare(this.sql).get(...this.args)) ?? null; }
  run() { const r = raw.prepare(this.sql).run(...this.args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; }
}
const db = { prepare: (sql) => new Stmt(sql), batch: async (list) => list.map((s) => (/^\s*(SELECT|WITH)/i.test(s.sql) || /RETURNING/i.test(s.sql) ? s.all() : s.run())) };
const env = { DB: db, DEV_ECHO_LINK: '1', ADMIN_EMAILS: 'admin@lawdb.test', SITE_ORIGIN: 'https://lawdb.ai' };
const exec = () => {};
const BASE = 'http://localhost';
const post = (path, body, cookie) => new Request(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const callJson = async (res) => ({ status: res.status, body: await res.json(), cookie: res.headers.get('set-cookie') });

const firm = (slug, name, website, st = 'TX') => raw.prepare('INSERT INTO firms (slug, name, city, state, data, about, status) VALUES (?,?,?,?,?,?,?)').run(slug, name, 'Abilene', st, JSON.stringify({ slug, name, city: 'Abilene', state: st, website }), 'x', 'live');
firm('morris-law', 'Morris Law', 'https://morrislaw.com');
firm('no-site-law', 'No Site Law', '');
firm('fb-law', 'Facebook Law', 'https://www.facebook.com/fblaw');

// ---- sign-in link: request, verify, one use
async function signUp(email) {
  const req = await callJson(await authRoutes.requestLink({ request: post('/api/auth/request-link', { email, signup: true }), env, url: new URL(BASE + '/api/auth/request-link'), exec }));
  ok(req.status === 200 && /^http:\/\/localhost\/admin\/verify\.html#token=[0-9a-f]{64}$/.test(req.body.dev_link), 'the link points at this site and carries a 64-hex token in the fragment');
  const token = req.body.dev_link.split('token=')[1];
  const v = await callJson(await authRoutes.verify({ request: post('/api/auth/verify', { token }), env, url: new URL(BASE + '/api/auth/verify'), exec }));
  ok(v.status === 200 && v.body.user.email === email && /lawdb_session=[0-9a-f]{64}/.test(v.cookie), 'verifying creates the account and a session');
  try { await authRoutes.verify({ request: post('/api/auth/verify', { token }), env, url: new URL(BASE + '/api/auth/verify'), exec }); ok(false, 'a used link must be refused'); } catch (e) { ok(e.status === 400, 'the link works once'); }
  return v.cookie.split(';')[0];
}
const strangerNoSignup = await callJson(await authRoutes.requestLink({ request: post('/api/auth/request-link', { email: 'nobody@nowhere.test' }), env, url: new URL(BASE + '/x'), exec }));
ok(strangerNoSignup.status === 200 && !strangerNoSignup.body.dev_link, 'an unknown address that is not signing up gets no link (and no hint that it is unknown)');
try { await authRoutes.requestLink({ request: post('/api/auth/request-link', { email: 'not-an-email', signup: true }), env, url: new URL(BASE + '/x'), exec }); ok(false, 'a bad address must be refused'); } catch (e) { ok(e.status === 422, 'a bad address is refused'); }

const claimBody = { slug: 'morris-law', contactName: 'Pat Partner', jobTitle: 'Partner', acceptTerms: true, terms: true };
const claim = async (cookie, slug) => callJson(await account.claim({ request: post('/api/account/claims', { ...claimBody, slug }, cookie), env, url: new URL(BASE + '/api/account/claims'), exec }));
const memberStatus = (email, slug) => raw.prepare('SELECT m.status, m.decided_at AS decidedAt FROM firm_members m JOIN users u ON u.id = m.user_id WHERE u.email = ? AND m.firm_slug = ?').get(email, slug);

// ---- claiming
const work = await signUp('pat@morrislaw.com');
const c1 = await claim(work, 'morris-law');
ok(c1.status === 201 && c1.body.status === 'approved', `a work email on the firm's website is approved at once (${JSON.stringify(c1.body)})`);
eq(memberStatus('pat@morrislaw.com', 'morris-law').status, 'approved', 'and it is recorded as approved');
ok(memberStatus('pat@morrislaw.com', 'morris-law').decidedAt, 'with the time');
const auditRow = raw.prepare("SELECT action, detail FROM audit_log WHERE action LIKE 'member.claim%' ORDER BY id DESC LIMIT 1").get();
eq(auditRow.action, 'member.claim_auto_approved', 'the log says it was automatic');

const second = await signUp('lee@morrislaw.com');
const c2 = await claim(second, 'morris-law');
ok(c2.status === 201 && c2.body.status === 'pending', 'a second person from the same firm waits for an admin: someone already manages it');

const free = await signUp('someone@gmail.com');
const c3 = await claim(free, 'no-site-law');
ok(c3.body.status === 'pending', 'a Gmail address always waits for an admin');
const c3b = await claim(free, 'morris-law');
ok(c3b.body.status === 'pending', 'and so does Gmail on a firm that has a website');

const other = await signUp('pat@otherfirm.com');
ok((await claim(other, 'morris-law')).body.status === 'pending', 'a different company domain waits for an admin');

const fb = await signUp('pat@facebook.com');
ok((await claim(fb, 'fb-law')).body.status === 'pending', 'a social-media address is never enough');

try { await claim(work, 'morris-law'); ok(false, 'claiming twice must be refused'); } catch (e) { ok(e.status === 409 && /already manage/.test(e.message), 'claiming twice is refused'); }

const off = { ...env, AUTO_APPROVE_CLAIMS: '0' };
firm('solo-law', 'Solo Law', 'https://sololaw.com');
const solo = await signUp('pat@sololaw.com');
const c4 = await callJson(await account.claim({ request: post('/api/account/claims', { ...claimBody, slug: 'solo-law' }, solo), env: off, url: new URL(BASE + '/x'), exec }));
ok(c4.body.status === 'pending', 'AUTO_APPROVE_CLAIMS=0 turns instant approval off');

ok(account.autoApproves({}, { email: 'a@acmelaw.com' }, 'https://acmelaw.com', false) && !account.autoApproves({}, { email: 'a@acmelaw.com' }, 'https://acmelaw.com', true), 'the rule: work email and nobody manages the firm yet');

// ---- the admin's note
const auto = newClaimEmail('https://lawdb.ai', { email: 'pat@morrislaw.com', contactName: 'Pat Partner', jobTitle: 'Partner', firmName: 'Morris Law', city: 'Abilene', isNew: false, auto: true });
ok(/Claimed automatically/.test(auto.subject) && !/Approval needed/.test(auto.subject), 'the admin is told it happened, not asked');
ok(/Approval needed/.test(newClaimEmail('https://lawdb.ai', { email: 'a@b.com', contactName: 'A', firmName: 'F', city: 'C' }).subject), 'a normal claim still asks');

console.log(`sign-up: ${n} checks passed`);
