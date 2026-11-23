// GET /lawyers/<slug>: a lawyer's own page. Only a live lawyer on the Lawyer plan has one; anyone else is a plain 404 (the lawyer, not their firm, pays for it).
import { getPaidLawyer } from '../lib/lawyers.js';
import { renderLawyerPage } from '../render/lawyer-page.js';

export async function lawyerPage({ request, env }) {
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/lawyers\/([a-z0-9][a-z0-9-]{1,100})\/?$/);
  if (!m) return env.ASSETS.fetch(request);
  let l = null;
  try { l = await getPaidLawyer(env, m[1]); } catch (err) {
    console.error('lawyer lookup failed', m[1], err);
    return env.ASSETS.fetch(new Request(url.origin + '/__no-such-lawyer__'));
  }
  if (!l) return env.ASSETS.fetch(new Request(url.origin + '/__no-such-lawyer__'));
  const html = renderLawyerPage(l, { origin: env.SITE_ORIGIN || url.origin });
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' } });
}
