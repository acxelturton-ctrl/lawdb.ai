// LawDB Marketplace routes (engine: src/lib/marketplace.js).
//   public   GET  /api/marketplace/form       what the "get matched" form shows (and whether the Marketplace is open)
//            POST /api/marketplace/inquiry    a person's inquiry (only while the owner has switched the Marketplace on)
//   firms    /api/account/firms/:slug/marketplace...   behind the firm login; only approved owners of a VERIFIED firm see anything
//   admin    /api/admin/marketplace...         approve held inquiries, test inquiries, credit, settings
import { json, NO_STORE, readJson, HttpError, clampInt } from '../lib/http.js';
import { sha256Hex } from '../lib/crypto.js';
import { requireUser, requireAdmin } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { STATES } from '../lib/us.js';
import * as mp from '../lib/marketplace.js';

const reply = (body, status = 200) => json(body, status, NO_STORE);

// ---------------------------------------------------------------- public
export async function form({ env }) {
  return json({ open: await mp.isLive(env), consent: mp.CONSENT, areas: mp.AREAS, issues: mp.ISSUES, urgency: mp.URGENCY, states: STATES }, 200, { 'cache-control': 'public, max-age=60' });
}

export async function inquiry({ request, env }) {
  if (!(await mp.isLive(env))) throw new HttpError(503, 'Matching is not open yet. Please check back soon.');
  const body = await readJson(request, 6000);
  const ipHash = await sha256Hex('ip:' + (request.headers.get('cf-connecting-ip') || 'local'));
  await mp.createInquiry(env, body, { ipHash, ua: request.headers.get('user-agent') || '' });
  // Dropped spam and repeats answer exactly like a success, so nobody can probe the filters.
  return reply({ ok: true });
}

// ---------------------------------------------------------------- firms
async function owner(env, request, slug) {
  const user = await requireUser(env, request);
  const m = await env.DB.prepare("SELECT 1 FROM firm_members WHERE user_id = ? AND firm_slug = ? AND status = 'approved'").bind(user.id, slug).first();
  if (!m) throw new HttpError(403, 'You do not manage this firm');
  return user;
}

export async function firmGet({ request, env, params }) {
  const user = await owner(env, request, params.slug);
  const access = await mp.marketplaceAccess(env, params.slug);
  const base = { open: await mp.isLive(env), access, areas: mp.AREAS, states: STATES, consent: null };
  if (!access.verified) return reply({ ...base, message: 'The Marketplace is for verified firms. Ask for verification from your firm page, and it opens as soon as LawDB approves it.' });
  const account = mp.accountView(await mp.ensureAccount(env, params.slug));
  return reply({ ...base, account, topups: mp.topupOptions(env, params.slug, user.email), decay: mp.DECAY });
}

export async function firmSave({ request, env, params }) {
  await owner(env, request, params.slug);
  if (!(await mp.marketplaceAccess(env, params.slug)).verified) throw new HttpError(403, 'Your firm must be verified first.');
  return reply({ ok: true, account: await mp.saveAccount(env, params.slug, await readJson(request, 4000)) });
}

export async function firmFeed({ request, env, params, url }) {
  await owner(env, request, params.slug);
  const r = await mp.feed(env, params.slug, { all: url.searchParams.get('all') === '1', city: url.searchParams.get('city') || '', limit: clampInt(url.searchParams.get('limit'), 30, 1, 60) });
  return reply(r);
}

export async function firmUnlock({ request, env, params }) {
  const user = await owner(env, request, params.slug);
  const id = clampInt(params.id, 0, 0, 1e12);
  if (!id) throw new HttpError(404, 'Inquiry not found');
  return reply(await mp.unlockLead(env, params.slug, user.id, id));
}

export async function firmUnlocked({ request, env, params }) {
  await owner(env, request, params.slug);
  if (!(await mp.marketplaceAccess(env, params.slug)).verified) throw new HttpError(403, 'Your firm must be verified first.');
  return reply({ leads: await mp.unlockedFor(env, params.slug) });
}

export async function firmLedger({ request, env, params }) {
  await owner(env, request, params.slug);
  if (!(await mp.marketplaceAccess(env, params.slug)).verified) throw new HttpError(403, 'Your firm must be verified first.');
  return reply({ ledger: await mp.ledgerFor(env, params.slug) });
}

// ---------------------------------------------------------------- admin
export async function adminOverview({ request, env }) {
  await requireAdmin(env, request);
  const [o, headStart, welcome, prices] = await Promise.all([mp.adminOverview(env), mp.setting(env, 'mp_head_start_minutes', String(mp.DEFAULT_HEAD_START_MINUTES)), mp.setting(env, 'mp_welcome_credit_cents', '0'), mp.setting(env, 'mp_prices', '{}')]);
  let custom = {}; try { custom = JSON.parse(prices) || {}; } catch { custom = {}; }
  const priceList = Object.fromEntries(await Promise.all(Object.keys(mp.AREAS).map(async (k) => [k, await mp.basePrice(env, k)])));
  return reply({ ...o, headStartMinutes: Number(headStart), welcomeCreditCents: Number(welcome), prices: priceList, customPrices: custom, areas: mp.AREAS, consent: mp.CONSENT });
}

export async function adminLeads({ request, env, url }) {
  await requireAdmin(env, request);
  return reply({ leads: await mp.adminLeads(env, url.searchParams.get('status') || 'held') });
}

export async function adminDecide({ request, env, params }) {
  const admin = await requireAdmin(env, request);
  const body = await readJson(request, 300);
  return reply(await mp.decideLead(env, admin, clampInt(params.id, 0, 0, 1e12), body.action));
}

export async function adminTestLead({ request, env }) {
  const admin = await requireAdmin(env, request);
  const body = await readJson(request, 500).catch(() => ({}));
  const r = await mp.createTestLead(env, admin, body);
  return reply({ ok: true, id: r?.id || null });
}

export async function adminCredit({ request, env }) {
  const admin = await requireAdmin(env, request);
  const body = await readJson(request, 600);
  const slug = typeof body.slug === 'string' ? body.slug : '';
  const firm = await env.DB.prepare('SELECT slug FROM firms WHERE slug = ?').bind(slug).first();
  if (!firm) throw new HttpError(404, 'Firm not found');
  const cents = Math.round(Number(body.dollars) * 100);
  if (!Number.isFinite(cents) || cents === 0 || Math.abs(cents) > 500000) throw new HttpError(422, 'Enter a dollar amount between -5,000 and 5,000.');
  await mp.addCredit(env, slug, cents > 0 ? 'promo' : 'adjust', cents, { note: String(body.note || '').slice(0, 200) || (cents > 0 ? 'Credit from LawDB' : 'Adjustment'), actor: admin.id });
  await audit(env, admin, 'marketplace.credit', 'firm', slug, { cents });
  return reply({ ok: true });
}

export async function adminSettings({ request, env }) {
  const admin = await requireAdmin(env, request);
  const b = await readJson(request, 2000);
  const changed = {};
  if (typeof b.live === 'boolean') {
    // Switching on opens the public form and collects people's details for sale to firms. It needs a deliberate confirmation that the consent wording has been reviewed.
    if (b.live && b.reviewedByLawyer !== true) throw new HttpError(422, 'Confirm that a lawyer has reviewed the consent wording, the privacy policy and the terms before opening the Marketplace.');
    await mp.setSetting(env, 'marketplace_live', b.live ? '1' : '0'); changed.live = b.live;
  }
  if (b.headStartMinutes != null) { const v = clampInt(b.headStartMinutes, 20, 0, 180); await mp.setSetting(env, 'mp_head_start_minutes', v); changed.headStartMinutes = v; }
  if (b.welcomeCreditDollars != null) { const v = Math.round(Number(b.welcomeCreditDollars) * 100); if (!Number.isFinite(v) || v < 0 || v > 50000) throw new HttpError(422, 'The welcome credit must be between $0 and $500.'); await mp.setSetting(env, 'mp_welcome_credit_cents', v); changed.welcomeCreditCents = v; }
  if (b.prices && typeof b.prices === 'object') {
    const cur = {}; try { Object.assign(cur, JSON.parse(await mp.setting(env, 'mp_prices', '{}'))); } catch { /* start fresh */ }
    for (const [k, dollars] of Object.entries(b.prices)) { if (!Object.hasOwn(mp.AREAS, k)) continue; const cents = Math.round(Number(dollars) * 100); if (Number.isFinite(cents) && cents >= 0 && cents <= 100000) cur[k] = cents; }
    await mp.setSetting(env, 'mp_prices', JSON.stringify(cur)); changed.prices = cur;
  }
  await audit(env, admin, 'marketplace.settings', 'site', 'marketplace', changed);
  return reply({ ok: true, changed });
}
