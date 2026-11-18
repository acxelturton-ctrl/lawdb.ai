// POST /api/ai/match: the homepage's LawDB AI. Body: { messages: [{role:'user', content}], context, pick }. See src/lib/ai-match.js.
import { json, readJson, HttpError, NO_STORE } from '../lib/http.js';
import { sha256Hex } from '../lib/crypto.js';
import { answer } from '../lib/ai-match.js';

const PER_VISITOR_HOUR = 30;      // requests one visitor can make per hour
const DEFAULT_DAILY_MODEL_CAP = 3000; // model calls per day across the site; past it the keyword matcher answers (it costs nothing)

// Counts one request in stats_daily and says how many there have been (one write per count).
async function bump(env, kind, k1, k2) {
  const day = new Date().toISOString().slice(0, 10);
  const row = await env.DB.prepare(
    'INSERT INTO stats_daily (day, kind, k1, k2, n) VALUES (?, ?, ?, ?, 1) ON CONFLICT (day, kind, k1, k2) DO UPDATE SET n = n + 1 RETURNING n'
  ).bind(day, kind, k1, k2).first();
  return row ? row.n : 1;
}

export async function match({ request, env }) {
  const body = await readJson(request, 6000);
  const ip = await sha256Hex('ai:' + (request.headers.get('cf-connecting-ip') || 'local'));
  const hour = String(new Date().getUTCHours());
  if ((await bump(env, 'ai-visitor', ip.slice(0, 20), hour)) > PER_VISITOR_HOUR) throw new HttpError(429, 'Too many questions for now. Please try again in a little while.');
  const cap = Number(env.AI_DAILY_CAP) || DEFAULT_DAILY_MODEL_CAP;
  const useModel = !!env.AI && (await bump(env, 'ai-model', '', '')) <= cap;
  const out = await answer(useModel ? env : { ...env, AI: undefined }, body);
  return json(out, 200, NO_STORE);
}
