// The bulk address shortener (shortenSlugs) on a real in-memory SQLite with the real migrations: it renames in batches, keeps old addresses as
// permanent redirects, settles clashes, moves Marketplace rows too, leaves a firm with credit history alone, and stops by itself at the end.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { shortenSlugs } from '../src/lib/handle-slug.js';
import { redirectTarget } from '../src/lib/firm-slug.js';
import { setting, setSetting } from '../src/lib/marketplace.js';

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
raw.prepare("INSERT INTO mp_accounts (firm_slug) VALUES ('smith-law-miami-fl')").run();
raw.prepare("INSERT INTO mp_ledger (firm_slug, kind, amount_cents, balance_after) VALUES ('has-credit-orlando-fl', 'promo', 500, 500)").run();

// off by default
assert.equal(await shortenSlugs(env), null);
assert.equal(raw.prepare("SELECT count(*) c FROM firm_redirects").get().c, 0);

await setSetting(env, 'slug_shorten_batch', '2');
let s = await shortenSlugs(env);                       // batch of 2 (alphabetical): eric-ramos..., has-credit...
assert.equal(s.renamed, 1, 'eric is renamed; the firm with credit history is refused and counted as an error');
assert.equal(s.errors, 1); assert.match(s.lastError, /credit history/);
assert.ok(raw.prepare("SELECT 1 FROM firms WHERE slug = 'ericramoslaw'").get(), 'new short address');
assert.equal(await redirectTarget(env, 'eric-ramos-law-pllc-san-antonio-tx'), 'ericramoslaw', 'old address redirects');
assert.equal(JSON.parse(raw.prepare("SELECT data FROM firms WHERE slug = 'ericramoslaw'").get().data).slug, 'ericramoslaw');

await setSetting(env, 'slug_shorten_batch', '50');
s = await shortenSlugs(env);
assert.ok(raw.prepare("SELECT 1 FROM firms WHERE slug = 'smithlaw'").get() || raw.prepare("SELECT 1 FROM firms WHERE slug = 'smithlaw-fl'").get());
const smith = raw.prepare("SELECT slug FROM firms WHERE name = 'Smith Law' ORDER BY slug").all().map((r) => r.slug);
assert.deepEqual(smith, ['smithlaw', 'smithlaw-fl'], 'two firms with one handle: the first keeps it, the other adds its state');
assert.equal(raw.prepare("SELECT slug FROM firms WHERE name LIKE 'Sammis%'").get().slug, 'sammis-law-firm', 'keyword domain ignored, name used without city, state or PA');
assert.equal(raw.prepare('SELECT firm_slug FROM mp_accounts').get().firm_slug, 'smithlaw-fl', 'Marketplace account moved with the firm (Miami, FL)');
assert.ok(raw.prepare("SELECT 1 FROM firms WHERE slug = 'has-credit-orlando-fl'").get(), 'the firm with credit history keeps its address');

// it reaches the end, turns itself off, and a second run changes nothing
// (firms renamed into the part not yet visited are looked at once more and found unchanged)
for (let i = 0; i < 5 && !s?.finished; i++) s = await shortenSlugs(env);
assert.ok(s.finished && await setting(env, 'slug_shorten_batch') === '0', 'stops at the end and switches itself off');
const before = raw.prepare('SELECT count(*) c FROM firm_redirects').get().c;
await setSetting(env, 'slug_shorten_batch', '50'); await setSetting(env, 'slug_shorten_cursor', '');
await shortenSlugs(env);
assert.equal(raw.prepare('SELECT count(*) c FROM firm_redirects').get().c, before, 'running it again renames nothing');
console.log('handle job: ok');
