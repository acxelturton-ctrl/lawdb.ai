// "Collect firms" in the admin: starts the GitHub workflow that pulls firms for new states and builds their import SQL.
// The crawl itself cannot run inside a Worker (it visits hundreds of firm websites, politely, for up to hours), so this only
// starts the workflow and reports how it is going. Needs a GitHub token (secret GITHUB_TOKEN: Actions read and write on this repo).
import { HttpError } from './http.js';

const WORKFLOW = 'us-states.yml';
const LAWYERS_WORKFLOW = 'lawyers.yml';   // reads each live firm's own website for its lawyers and their photos (photos wait in the Lawyer photos tab for approval)
const STATE_CODES = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));
export const MAX_STATES = 4;

const repoOf = (env) => (/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPO || '') ? env.GITHUB_REPO : 'acxelturton-ctrl/lawdb.ai');

// Only these values are ever passed on to GitHub: known state codes and whole numbers in a fixed range.
export function parseCollectInput(body) {
  const states = [...new Set((Array.isArray(body?.states) ? body.states : String(body?.states || '').split(/[\s,]+/)).map((s) => String(s).trim().toUpperCase()).filter(Boolean))];
  if (!states.length) throw new HttpError(422, 'Pick at least one state');
  if (states.length > MAX_STATES) throw new HttpError(422, `Pick at most ${MAX_STATES} states at a time`);
  const bad = states.find((s) => !STATE_CODES.has(s));
  if (bad) throw new HttpError(422, `"${bad}" is not a state code`);
  const whole = (v, lo, hi, name, dflt) => {
    if (v === undefined || v === null || v === '') return dflt;
    const n = Number(v);
    if (!Number.isInteger(n) || n < lo || n > hi) throw new HttpError(422, `${name} must be a whole number from ${lo} to ${hi}`);
    return n;
  };
  return { states: states.join(' '), target: whole(body?.target, 10, 300, 'Firms per state', 100), limit: whole(body?.limit, 0, 300, 'Test limit', 0) };
}

async function gh(env, path, init = {}) {
  if (!env.GITHUB_TOKEN) throw new HttpError(503, 'GitHub is not connected yet. Add the GITHUB_TOKEN secret (steps are on this page).');
  let res;
  try {
    res = await fetch(`https://api.github.com/repos/${repoOf(env)}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'lawdb-admin', ...(init.headers || {}) },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new HttpError(502, 'Could not reach GitHub. Try again in a minute.');
  }
  if (res.status === 401 || res.status === 403 || res.status === 404) throw new HttpError(502, 'GitHub refused the request. The token may have expired, or it may not have Actions read and write access to the repository.');
  if (!res.ok && res.status !== 204) throw new HttpError(502, `GitHub answered ${res.status}`);
  return res;
}

export async function recentRuns(env, workflow = WORKFLOW) {
  const res = await gh(env, `/actions/workflows/${workflow}/runs?per_page=8`);
  const j = await res.json();
  return (j.workflow_runs || []).map((r) => ({ id: r.id, title: String(r.display_title || '').slice(0, 120), status: r.status, conclusion: r.conclusion, startedAt: r.run_started_at || r.created_at, updatedAt: r.updated_at, url: r.html_url }));
}

export const isBusy = (runs) => runs.some((r) => r.status !== 'completed');

export async function startCollect(env, input) {
  const runs = await recentRuns(env);
  if (isBusy(runs)) throw new HttpError(409, 'A collection is already running. Wait for it to finish before starting another.');
  await gh(env, `/actions/workflows/${WORKFLOW}/dispatches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main', inputs: { states: input.states, target: String(input.target), limit: String(input.limit) } }),
  });
}

// how many firms each state has in the database now
export async function loadedByState(env) {
  const { results } = await env.DB.prepare("SELECT state, COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'live') AS live FROM firms GROUP BY state").all();
  return Object.fromEntries(results.map((r) => [r.state, { total: r.total, live: r.live }]));
}

// ---------------------------------------------------------------- lawyers and their photos
// Only a whole number is ever passed on: how many firms to visit (0 = every live firm). Always loaded into the database: every photo then waits for approval and nothing shows before that.
export function parseLawyersInput(body) {
  const v = body?.limit;
  if (v === undefined || v === null || v === '') return { limit: 0 };
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 5000) throw new HttpError(422, 'The number of firms must be a whole number from 0 to 5000 (0 = every live firm)');
  return { limit: n };
}

export const lawyerRuns = (env) => recentRuns(env, LAWYERS_WORKFLOW);

export async function startLawyers(env, input) {
  const runs = await lawyerRuns(env);
  if (isBusy(runs)) throw new HttpError(409, 'Lawyers are already being collected. Wait for that to finish first.');
  await gh(env, `/actions/workflows/${LAWYERS_WORKFLOW}/dispatches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main', inputs: { limit: String(input.limit), load: 'yes' } }),
  });
}
