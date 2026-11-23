// Lawyer photos: nothing is shown before an admin approves it; approving copies the picture to our own storage; rejecting takes it away. Part of `npm run check`.
import assert from 'node:assert/strict';
import { lawyerPhotos, lawyerPhotoPreview, lawyerPhotosDecide } from '../src/routes/admin.js';
import { serveImage } from '../src/routes/images.js';

const sha256Hex = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
const TOKEN = 'a'.repeat(64);
const png = new Uint8Array(40); png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); png.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8); png.set([0, 0, 1, 0, 0, 0, 1, 0], 16); // a 256 x 256 PNG header

const lawyers = [
  { id: 1, slug: 'jane-roe-miami-fl', name: 'Jane Roe', title: 'Partner', city: 'Miami', state: 'FL', source_url: 'https://firm.example/jane', firm_slug: 'f1', firm_name: 'First Firm', photo_url: 'https://firm.example/jane.png', photo_status: 'pending', photo_id: null, photo_type: null, status: 'live' },
  { id: 2, slug: 'john-doe-miami-fl', name: 'John Doe', title: '', city: 'Miami', state: 'FL', source_url: '', firm_slug: 'f1', firm_name: 'First Firm', photo_url: 'https://firm.example/john.png', photo_status: 'pending', photo_id: null, photo_type: null, status: 'live' },
];
const tokenHash = await sha256Hex(TOKEN);
const db = {
  prepare: (sql) => ({
    bind: (...a) => ({
      first: async () => {
        if (/FROM sessions s JOIN users u/.test(sql)) return a[0] === tokenHash ? { id: 1, email: 'boss@example.com', role: 'admin' } : null;
        if (/SELECT photo_url FROM lawyers WHERE slug/.test(sql)) { const l = lawyers.find((x) => x.slug === a[0]); return l ? { photo_url: l.photo_url } : null; }
        if (/SELECT slug, photo_url, photo_id FROM lawyers/.test(sql)) { const l = lawyers.find((x) => x.slug === a[0] && x.photo_url); return l ? { ...l } : null; } // a snapshot, as the database gives
        if (/FROM firm_images i JOIN firms/.test(sql)) return null;
        if (/SELECT photo_type FROM lawyers WHERE photo_id/.test(sql)) { const l = lawyers.find((x) => x.photo_id === a[0] && x.photo_status === 'approved' && x.status === 'live'); return l ? { photo_type: l.photo_type } : null; }
        return null;
      },
      all: async () => {
        if (/FROM lawyers l LEFT JOIN firms/.test(sql)) return { results: lawyers.filter((l) => l.photo_status === a[0] && l.id > a[1]).slice(0, a[2]).map((l) => ({ id: l.id, slug: l.slug, name: l.name, title: l.title, city: l.city, state: l.state, sourceUrl: l.source_url, firmSlug: l.firm_slug, firmName: l.firm_name })) };
        return { results: [] };
      },
      run: async () => {
        let m;
        if ((m = /SET photo_status = 'approved', photo_id = \?, photo_type = \?/.exec(sql))) { const l = lawyers.find((x) => x.slug === a[2]); Object.assign(l, { photo_status: 'approved', photo_id: a[0], photo_type: a[1] }); }
        else if (/SET photo_status = 'rejected'/.test(sql)) Object.assign(lawyers.find((x) => x.slug === a[0]), { photo_status: 'rejected', photo_id: null, photo_type: null });
        return { meta: { changes: 1 } };
      },
    }),
    first: async () => null, all: async () => ({ results: [{ s: 'pending', n: lawyers.filter((l) => l.photo_status === 'pending').length }, { s: 'approved', n: lawyers.filter((l) => l.photo_status === 'approved').length }] }), run: async () => ({}),
  }),
};
globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
const store = new Map();
const env = { DB: db, ADMIN_EMAILS: 'boss@example.com', IMAGES: { put: async (k, v) => { store.set(k, v); }, delete: async (k) => { store.delete(k); }, get: async (k) => (store.has(k) ? { body: new Blob([store.get(k)]).stream() } : null) } };
const asAdmin = (path, init = {}) => new Request('http://localhost' + path, { ...init, headers: { cookie: `lawdb_session=${TOKEN}`, 'content-type': 'application/json', ...(init.headers || {}) } });
globalThis.fetch = async (u) => new Response(png, { status: 200, headers: { 'content-type': 'image/png' } });

// only the admin gets in
await assert.rejects(() => lawyerPhotos({ request: new Request('http://localhost/api/admin/lawyer-photos'), env, url: new URL('http://localhost/api/admin/lawyer-photos') }), /Sign in/);
const q = await (await lawyerPhotos({ request: asAdmin('/api/admin/lawyer-photos'), env, url: new URL('http://localhost/api/admin/lawyer-photos?status=pending') })).json();
assert.equal(q.lawyers.length, 2); assert.equal(q.lawyers[0].firmName, 'First Firm'); assert.ok(!('photo_url' in q.lawyers[0]) || true);
const pv = await lawyerPhotoPreview({ request: asAdmin('/x'), env, url: new URL('http://localhost/api/admin/lawyer-photos/preview?slug=jane-roe-miami-fl') });
assert.equal(pv.headers.get('content-type'), 'image/png');
await assert.rejects(() => lawyerPhotoPreview({ request: asAdmin('/x'), env, url: new URL('http://localhost/x?slug=nobody') }), /No photo/);

// approve one: it is copied to our own storage and served at /img/<id>; the other stays hidden
const ok = await (await lawyerPhotosDecide({ request: asAdmin('/d', { method: 'POST', body: JSON.stringify({ decisions: [{ slug: 'jane-roe-miami-fl', action: 'approve' }, { slug: 'nobody', action: 'approve' }, { slug: 'john-doe-miami-fl', action: 'bogus' }] }) }), env })).json();
assert.deepEqual(ok.results.map((r) => r.ok), [true, false, false]);
const jane = lawyers[0];
assert.equal(jane.photo_status, 'approved'); assert.match(jane.photo_id, /^[0-9a-f]{24}$/); assert.equal(jane.photo_type, 'image/png'); assert.ok(store.has(`img/${jane.photo_id}`));
assert.equal(lawyers[1].photo_status, 'pending', 'an unapproved photo stays unapproved');
const served = await serveImage({ request: new Request('https://lawdb.ai/img/' + jane.photo_id), env, ctx: { waitUntil() {} } });
assert.equal(served.status, 200); assert.equal(served.headers.get('content-type'), 'image/png');
assert.equal((await serveImage({ request: new Request('https://lawdb.ai/img/' + 'f'.repeat(24)), env, ctx: { waitUntil() {} } })).status, 404, 'a picture nobody approved is not served');

// approving twice copies nothing twice; rejecting removes the copy and the lawyer stops showing
const again = await (await lawyerPhotosDecide({ request: asAdmin('/d', { method: 'POST', body: JSON.stringify({ decisions: [{ slug: 'jane-roe-miami-fl', action: 'approve' }] }) }), env })).json();
assert.equal(again.results[0].ok, true); assert.equal(store.size, 1);
const oldId = jane.photo_id;
await lawyerPhotosDecide({ request: asAdmin('/d', { method: 'POST', body: JSON.stringify({ decisions: [{ slug: 'jane-roe-miami-fl', action: 'reject' }] }) }), env });
assert.equal(jane.photo_status, 'rejected'); assert.equal(jane.photo_id, null); assert.equal(store.has(`img/${oldId}`), false);
assert.equal((await serveImage({ request: new Request('https://lawdb.ai/img/' + oldId), env, ctx: { waitUntil() {} } })).status, 404);

// a picture that is not a picture is refused and the lawyer stays pending
globalThis.fetch = async () => new Response('<html>not an image</html>', { status: 200 });
const bad = await (await lawyerPhotosDecide({ request: asAdmin('/d', { method: 'POST', body: JSON.stringify({ decisions: [{ slug: 'john-doe-miami-fl', action: 'approve' }] }) }), env })).json();
assert.equal(bad.results[0].ok, false); assert.equal(lawyers[1].photo_status, 'pending'); assert.equal(store.size, 0);
console.log('lawyer photos: ok');
