// Checks for GET /api/whereami. Run: node scripts/test-whereami.mjs
import assert from 'node:assert/strict';
import { whereAmI } from '../src/routes/whereami.js';

const ask = async (cf) => (await whereAmI({ request: { cf } })).json();
assert.deepEqual(await ask({ country: 'US', regionCode: 'fl', city: 'Miami', latitude: '25.7743', longitude: '-80.1937' }), { found: true, city: 'Miami', state: 'FL', lat: 25.77, lng: -80.19 });
assert.equal((await ask({ country: 'CA', regionCode: 'ON', city: 'Toronto', latitude: '43.7', longitude: '-79.4' })).found, false, 'US only');
assert.equal((await ask({ country: 'US', regionCode: 'FL', city: 'Miami' })).found, false, 'needs a position');
assert.equal((await ask({})).found, false);
assert.equal((await ask(undefined)).found, false);
assert.equal((await ask({ country: 'US', regionCode: 'NY', city: '<b>New</b> York"', latitude: '40.7', longitude: '-74' })).city, 'bNewb York', 'markup characters are dropped');
console.log('whereami: ok');
