// The bulk address shortener (shortenSlugs) on a real in-memory SQLite with the real migrations: it renames in batches, keeps old addresses as
// permanent redirects, settles clashes, moves Marketplace rows too, leaves a firm with credit history alone, and stops by itself at the end.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { shortenSlugs } from '../src/lib/handle-slug.js';
import { redirectTarget } from '../src/lib/firm-slug.js';
import { setting, setSetting } from '../src/lib/marketplace.js';
import { firmPage } from '../src/routes/firm-page.js';

const raw = new DatabaseSync(':memory:');
raw.exec('PRAGMA foreign_keys = ON');
for (const f of readdirSync(new URL('../migrations/', import.meta.url)).filter((x) => x.endsWith('.sql')).sort()) raw.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
const plain = (r) => (r ? { ...r } : r);
class Stmt {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...a) { this.args = a.map((x) => (x === undefined ? null : x)); return this; }
  all() { return { results: raw.prepare(this.sql).all(...this.args).map(plain) }; }
  first() { return plain(raw.prepare(this.sql).get(...this.args)) ?? null; }
  run() { if (/^\s*PRAGMA/i.test(this.sql)) { raw.exec(this.sql); return { meta: {} }; } const r = raw.prepare(this.sql).run(...this.args); return { meta: { changes: r.changes } }; }
}
const env = { DB: { prepare: (sql) => new Stmt(sql), batch: async (list) => { raw.exec('BEGIN'); try { const out = list.map((s) => s.run()); raw.exec('COMMIT'); return out; } catch (e) { raw.exec('ROLLBACK'); throw e; } } } };

const add = (slug, name, city, state, data = {}) => raw.prepare("INSERT INTO firms (slug, name, city, state, data, about, status) VALUES (?,?,?,?,?,?,'live')").run(slug, name, city, state, JSON.stringify({ slug, ...data }), 'x');
add('eric-ramos-law-pllc-san-antonio-tx', 'Eric Ramos Law, PLLC', 'San Antonio', 'TX', { website: 'https://ericramoslaw.com', social: { instagram: 'https://www.instagram.com/ericramoslawpllcsanantonio' } });
add('smith-law-miami-fl', 'Smith Law', 'Miami', 'FL', { website: 'https://smithlaw.com' });
add('smith-law-dallas-tx', 'Smith Law', 'Dallas', 'TX', { website: 'https://smithlaw.com' });
add('sammis-law-firm-pa-clearwater-fl', 'Sammis Law Firm, PA', 'Clearwater', 'FL', { website: 'https://criminaldefenseattorneytampa.com' });
add('has-credit-orlando-fl', 'Hascredit Law', 'Orlando', 'FL', { website: 'https://hascredit.com' });
add('marketplace-co-tampa-fl', 'Marketplace Law', 'Tampa', 'FL', { website: 'https://marketplace.com' });
raw.prepare("INSERT INTO mp_accounts (firm_slug) VALUES ('smith-law-miami-fl')").run();
raw.prepare("INSERT INTO mp_ledger (firm_slug, kind, amount_cents, balance_after) VALUES ('has-credit-orlando-fl', 'promo', 500, 500)").run();

const run = async () => { await setSetting(env, 'slug_shorten_lock', '0'); return shortenSlugs(env); };   // (the real job skips a run that starts within 55 seconds of the last)
// off by default
assert.equal(await run(), null);
assert.equal(raw.prepare("SELECT count(*) c FROM firm_redirects").get().c, 0);

await setSetting(env, 'slug_shorten_batch', '2');
let s = await run();                       // batch of 2 (alphabetical): eric-ramos..., has-credit...
assert.equal(s.renamed, 1, 'eric is renamed; the firm with credit history is refused and counted as an error');
assert.equal(s.errors, 1); assert.match(s.lastError, /credit history/);
assert.ok(raw.prepare("SELECT 1 FROM firms WHERE slug = 'ericramoslaw'").get(), 'new short address');
assert.equal(await redirectTarget(env, 'eric-ramos-law-pllc-san-antonio-tx'), 'ericramoslaw', 'old address redirects');
assert.equal(JSON.parse(raw.prepare("SELECT data FROM firms WHERE slug = 'ericramoslaw'").get().data).slug, 'ericramoslaw');

await setSetting(env, 'slug_shorten_batch', '50');
s = await run();
assert.ok(raw.prepare("SELECT 1 FROM firms WHERE slug = 'smithlaw'").get() || raw.prepare("SELECT 1 FROM firms WHERE slug = 'smithlaw-fl'").get());
const smith = raw.prepare("SELECT slug FROM firms WHERE name = 'Smith Law' ORDER BY slug").all().map((r) => r.slug);
assert.deepEqual(smith, ['smithlaw', 'smithlaw-fl'], 'two firms with one handle: the first keeps it, the other adds its state');
assert.equal(raw.prepare("SELECT slug FROM firms WHERE name LIKE 'Sammis%'").get().slug, 'sammis-law-firm', 'keyword domain ignored, name used without city, state or PA');
assert.equal(raw.prepare('SELECT firm_slug FROM mp_accounts').get().firm_slug, 'smithlaw-fl', 'Marketplace account moved with the firm (Miami, FL)');
assert.ok(raw.prepare("SELECT 1 FROM firms WHERE slug = 'has-credit-orlando-fl'").get(), 'the firm with credit history keeps its address');

assert.ok(raw.prepare("SELECT 1 FROM firms WHERE slug = 'marketplace-fl'").get() || raw.prepare("SELECT 1 FROM firms WHERE slug LIKE 'marketplace-%' AND slug <> 'marketplace-co-tampa-fl'").get(), 'a handle equal to a site page (marketplace) is never used as it is');
assert.ok(!raw.prepare("SELECT 1 FROM firms WHERE slug = 'marketplace'").get());

// the pages: /<handle> serves the firm, the old /firms/<address> and the very old addresses go there for good
const assets = { fetch: async (req) => new Response('static ' + new URL(req.url).pathname, { status: 404 }) };
const penv = { ...env, ASSETS: assets, PUBLIC_CACHE_TTL: '0' };
const ask = (path) => firmPage({ request: new Request('https://lawdb.ai' + path), env: penv, ctx: { waitUntil() {} } });
let r = await ask('/firms/ericramoslaw'); assert.equal(r.status, 301); assert.equal(r.headers.get('location'), '/ericramoslaw', '/firms/<handle> -> /<handle>');
r = await ask('/firms/eric-ramos-law-pllc-san-antonio-tx'); assert.equal(r.status, 301); assert.equal(r.headers.get('location'), '/ericramoslaw', 'the original long address -> /<handle>');
r = await ask('/firms/eric-ramos-law-pllc-san-antonio-tx/lawyers'); assert.equal(r.headers.get('location'), '/ericramoslaw/lawyers', 'tabs are kept');
r = await ask('/eric-ramos-law-pllc-san-antonio-tx'); assert.equal(r.status, 301); assert.equal(r.headers.get('location'), '/ericramoslaw', 'the long address without /firms/ too');
r = await ask('/contact'); assert.equal(r.status, 404, 'a site page is left to the static files');
r = await ask('/no-such-firm'); assert.equal(r.status, 404);

// it reaches the end, turns itself off, and a second run changes nothing
// (firms renamed into the part not yet visited are looked at once more and found unchanged)
for (let i = 0; i < 5 && !s?.finished; i++) s = await run();
assert.ok(s.finished && await setting(env, 'slug_shorten_batch') === '0', 'stops at the end and switches itself off');
const before = raw.prepare('SELECT count(*) c FROM firm_redirects').get().c;
await setSetting(env, 'slug_shorten_batch', '50'); await setSetting(env, 'slug_shorten_cursor', '');
await run();
assert.equal(raw.prepare('SELECT count(*) c FROM firm_redirects').get().c, before, 'running it again renames nothing');
await setSetting(env, 'slug_shorten_batch', '50'); await setSetting(env, 'slug_shorten_cursor', '');
await shortenSlugs(env); assert.equal(await shortenSlugs(env), null, 'a second run right away is skipped while the first may still be going');
console.log('handle job: ok');
