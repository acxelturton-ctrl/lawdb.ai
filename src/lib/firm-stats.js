// What a firm's profile says about the practice-area pages it can send a visitor to, and how many firms each page compares.
// Worked out from the database each time the page is built (the page is cached for a minute), so the numbers move as firms
// are added, never go stale the way figures typed into a page do.
import { PRACTICE, practicePath, STATE_PATH } from './practice.js';

// counts: { caseType: number of live firms in the state with it }; at most four cards, only to pages that exist.
export function practiceCards(state, caseTypes, counts) {
  const out = [];
  for (const t of caseTypes || []) {
    const href = practicePath(state, t);
    if (href && !out.some((c) => c.href === href)) out.push({ href, label: PRACTICE[t][1], count: counts[t] || 0 });
    if (out.length === 4) break;
  }
  return out;
}

export async function firmStats(env, f) {
  try {
    const { results: kinds } = await env.DB.prepare("SELECT j.value AS t, COUNT(*) AS c FROM firms m, json_each(m.data, '$.caseTypes') j WHERE m.status = 'live' AND m.state = ? GROUP BY j.value").bind(f.state).all();
    const counts = Object.fromEntries(kinds.map((k) => [k.t, k.c]));
    return { practice: practiceCards(f.state, f.caseTypes, counts), city: f.city };
  } catch (err) {
    console.error('profile stats failed', f.slug, err);
    return { practice: [], city: f.city }; // the page always works without them
  }
}
