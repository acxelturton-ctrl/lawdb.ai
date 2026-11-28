// A firm's page is lawdb.ai/<handle>, so no handle may equal one of the site's own pages. This reads the repository: every top-level page, folder and
// worker route must be in src/lib/reserved-paths.js, every state hub too, and the router must send firm handles (and only those) to the firm page.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { RESERVED, isReserved, isFirmRoot } from '../src/lib/reserved-paths.js';
import { cleanSlug } from '../src/lib/firm-slug.js';
import { STATES } from '../src/lib/us.js';

const root = new URL('../', import.meta.url);
for (const name of readdirSync(root)) {
  if (name.startsWith('.')) continue;
  const dir = statSync(new URL(name, root)).isDirectory();
  const base = name.replace(/\.html$/, '');
  if (!dir && !name.endsWith('.html')) continue;       // files with a dot (follow.js, site.css ...) can never be a handle
  assert.ok(isReserved(base.replace(/_/g, '-')), `${name} must be in RESERVED (src/lib/reserved-paths.js), or a firm could take its address`);
}
// routes the worker answers itself
const w = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');
for (const m of w.matchAll(/path === '\/([a-z-]+)'/g)) assert.ok(isReserved(m[1]), `/${m[1]} is a worker route and must be reserved`);
for (const m of w.matchAll(/path\.startsWith\('\/([a-z-]+)\/'\)/g)) assert.ok(isReserved(m[1]), `/${m[1]}/ is a worker route and must be reserved`);
// every state hub (/florida ...)
for (const st of Object.values(STATES)) assert.ok(isReserved(st.toLowerCase().replace(/ /g, '-')), `${st} hub must be reserved`);

// the router
assert.equal(isFirmRoot('/ericramoslaw'), true);
assert.equal(isFirmRoot('/ericramoslaw/lawyers'), true);
assert.equal(isFirmRoot('/ericramoslaw/articles'), true);
assert.equal(isFirmRoot('/contact'), false, 'a site page is not a firm');
assert.equal(isFirmRoot('/florida'), false, 'a state hub is not a firm');
assert.equal(isFirmRoot('/florida/miami'), false, 'a city hub is not a firm');
assert.equal(isFirmRoot('/'), false);
assert.equal(isFirmRoot('/a/b/c'), false);
assert.equal(isFirmRoot('/admin'), false);

// a firm cannot be given a reserved address
assert.throws(() => cleanSlug('contact'), (e) => e.status === 422);
assert.throws(() => cleanSlug('florida'), (e) => e.status === 422);
assert.equal(cleanSlug('smithlaw'), 'smithlaw');
console.log('reserved paths: ok (' + RESERVED.size + ' names)');
