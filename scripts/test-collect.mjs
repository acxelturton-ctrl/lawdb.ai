// Checks for the admin "Collect firms" helpers (input rules, GitHub calls). Run: node scripts/test-collect.mjs
import assert from 'node:assert/strict';
import { parseCollectInput, startCollect, recentRuns, parseLawyersInput, startLawyers, lawyerRuns } from '../src/lib/collect.js';

const fails = (fn, status) => { try { fn(); } catch (e) { assert.equal(e.status, status); return; } assert.fail('should have thrown'); };

assert.deepEqual(parseCollectInput({ states: ['ca', 'NY', 'ca'] }), { states: 'CA NY', target: 100, limit: 0 });
assert.deepEqual(parseCollectInput({ states: 'GA, IL', target: '50', limit: 10 }), { states: 'GA IL', target: 50, limit: 10 });
fails(() => parseCollectInput({ states: [] }), 422);
fails(() => parseCollectInput({ states: ['CA', 'NY', 'GA', 'IL', 'TX'] }), 422);
fails(() => parseCollectInput({ states: ['ZZ'] }), 422);
fails(() => parseCollectInput({ states: ['CA; rm -rf'] }), 422);
fails(() => parseCollectInput({ states: ['CA'], target: 5 }), 422);
fails(() => parseCollectInput({ states: ['CA'], target: 1.5 }), 422);
fails(() => parseCollectInput({ states: ['CA'], limit: 999 }), 422);

const calls = [];
const respond = (runs) => async (url, init) => { calls.push({ url, init }); return url.includes('/runs') ? new Response(JSON.stringify({ workflow_runs: runs }), { status: 200 }) : new Response(null, { status: 204 }); };
const env = { GITHUB_TOKEN: 'x' };

globalThis.fetch = respond([{ id: 1, display_title: 't', status: 'completed', conclusion: 'success', created_at: 'a', updated_at: 'b', html_url: 'u' }]);
await startCollect(env, { states: 'CA NY', target: 100, limit: 0 });
const post = calls.find((c) => c.init?.method === 'POST');
assert.match(post.url, /acxelturton-ctrl\/lawdb\.ai\/actions\/workflows\/us-states\.yml\/dispatches$/);
assert.deepEqual(JSON.parse(post.init.body), { ref: 'main', inputs: { states: 'CA NY', target: '100', limit: '0' } });
assert.equal(post.init.headers.Authorization, 'Bearer x');

calls.length = 0;
globalThis.fetch = respond([{ id: 2, status: 'in_progress', conclusion: null }]);
await assert.rejects(() => startCollect(env, { states: 'CA', target: 100, limit: 0 }), (e) => e.status === 409);
assert.equal(calls.some((c) => c.init?.method === 'POST'), false, 'no second run while one is going');

await assert.rejects(() => recentRuns({}), (e) => e.status === 503);
globalThis.fetch = async () => new Response('{}', { status: 404 });
await assert.rejects(() => recentRuns(env), (e) => e.status === 502);
// ---- lawyers and their photos
assert.deepEqual(parseLawyersInput({}), { limit: 0 }, 'no number means every live firm');
assert.deepEqual(parseLawyersInput({ limit: '25' }), { limit: 25 }, 'a test run');
for (const bad of [-1, 1.5, 5001, 'abc']) assert.throws(() => parseLawyersInput({ limit: bad }), (e) => e.status === 422, `refused: ${bad}`);
calls.length = 0;
globalThis.fetch = respond([{ id: 3, status: 'completed', conclusion: 'success' }]);
await startLawyers(env, { limit: 0 });
const lpost = calls.find((c) => c.init?.method === 'POST');
assert.ok(lpost.url.includes('/actions/workflows/lawyers.yml/dispatches'), 'it starts the lawyers workflow');
assert.deepEqual(JSON.parse(lpost.init.body), { ref: 'main', inputs: { limit: '0', load: 'yes' } }, 'always loaded: every photo waits for approval');
calls.length = 0;
globalThis.fetch = respond([{ id: 4, status: 'in_progress', conclusion: null }]);
await assert.rejects(() => startLawyers(env, { limit: 0 }), (e) => e.status === 409, 'not while another run is going');
assert.equal(calls.some((c) => c.init?.method === 'POST'), false);
assert.ok(typeof lawyerRuns === 'function');

console.log('collect: ok');
