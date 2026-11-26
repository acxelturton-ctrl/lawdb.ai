// LawDB Marketplace (phase 1). People send an inquiry; verified firms see a blurred preview and pay prepaid credit to unlock the contact details; each inquiry goes to exactly one firm.
//
// Rules this file keeps (they come from the build brief and from the law-firm advertising rules, which a lawyer should still review before launch):
//  - The price is a flat advertising fee for seeing an inquiry. It never depends on whether the person hires the firm.
//  - What a firm sees before paying is generated from fields the person picked from lists (practice area, city, state, urgency, issue type). Nothing they typed.
//  - Only verified firms (the existing state-bar check in verification.js) can see any inquiry. Nothing here is ever public.
//  - Unlocking is one atomic database batch: the inquiry, the balance and the ledger change together or not at all, so two firms can never buy the same one.
//  - The ledger is append only (the migration's triggers refuse changes).
import { PRACTICE } from './practice.js';
import { STATES, isState } from './us.js';
import { HttpError, isEmail } from './http.js';
import { randomToken } from './crypto.js';
import { audit } from './audit.js';

export const AREAS = Object.fromEntries(Object.entries(PRACTICE).map(([k, v]) => [k, v[1]]));
export const URGENCY = { now: 'Needs help now', week: 'Within a week', month: 'Within a month', research: 'Just researching' };
// The "type of matter" list shown on the form, per practice area. The person picks one; it is the only detail that reaches a firm before it pays.
export const ISSUES = {
  family: ['Divorce', 'Child custody', 'Child support', 'Other family matter'],
  criminal: ['Charged with a crime', 'Under investigation', 'Record sealing or expungement', 'Other criminal matter'],
  traffic: ['Speeding ticket', 'DUI or DWI', 'License suspension', 'Other traffic matter'],
  injury: ['Car accident', 'Workplace injury', 'Medical injury', 'Other injury'],
  employment: ['Fired or laid off', 'Discrimination or harassment', 'Unpaid wages', 'Other employment matter'],
  business: ['Starting a business', 'Contract dispute', 'Partnership dispute', 'Other business matter'],
  litigation: ['Being sued', 'Suing someone', 'Debt collection', 'Other civil matter'],
  wills: ['Will or trust', 'Probate', 'Power of attorney', 'Other estate matter'],
  immigration: ['Visa or green card', 'Citizenship', 'Deportation defense', 'Other immigration matter'],
  realestate: ['Buying or selling', 'Landlord or tenant', 'Title or boundary dispute', 'Other real estate matter'],
};

// What the person agrees to on the form. The version and the exact text are stored with every inquiry. THIS WORDING NEEDS A LAWYER'S REVIEW BEFORE THE MARKETPLACE GOES LIVE.
export const CONSENT = {
  version: '2026-11-v1',
  text: 'I agree that LawDB may share my inquiry and my contact details with one law firm that pays to receive it. Only one firm will receive it. LawDB is an independent directory, not a law firm, and nothing here is legal advice.',
};

// Starting prices in cents (editable: the site setting mp_prices overrides any of them).
export const DEFAULT_PRICES = { immigration: 8000, wills: 7000, family: 8000, traffic: 5000, realestate: 7000, employment: 12500, criminal: 12500, litigation: 15000, injury: 17500, business: 20000 };
// Full price for the first 48 hours, discounted until day 7, gone after day 7.
export const DECAY = { fullHours: 48, expireDays: 7, discount: 0.6 };
export const DEFAULT_HEAD_START_MINUTES = 20; // Featured firms see a new inquiry this long before everyone else (site setting mp_head_start_minutes)

const AGE_HOURS = "((julianday('now') - julianday(approved_at)) * 24)";
export const PRICE_SQL = `(CASE WHEN ${AGE_HOURS} < ${DECAY.fullHours} THEN base_price_cents ELSE CAST(ROUND(base_price_cents * ${DECAY.discount}) AS INTEGER) END)`;
const OPEN_SQL = `(status = 'approved' AND approved_at IS NOT NULL AND ${AGE_HOURS} < ${DECAY.expireDays * 24})`;
export const priceFor = (baseCents, ageHours) => (ageHours < DECAY.fullHours ? baseCents : Math.round(baseCents * DECAY.discount));

// ---------------------------------------------------------------- settings
export async function setting(env, key, def = '') {
  const r = await env.DB.prepare('SELECT value FROM site_settings WHERE key = ?').bind(key).first();
  return r && r.value != null ? r.value : def;
}
export const setSetting = (env, key, value) => env.DB.prepare('INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').bind(key, String(value)).run();
export const isLive = async (env) => (await setting(env, 'marketplace_live', '0')) === '1';

export async function basePrice(env, area) {
  let custom = {};
  try { custom = JSON.parse(await setting(env, 'mp_prices', '{}')) || {}; } catch { custom = {}; }
  const c = custom[area];
  return Number.isInteger(c) && c >= 0 && c <= 1_000_000 ? c : DEFAULT_PRICES[area] ?? 10000;
}

// ---------------------------------------------------------------- what a firm sees before it pays
export function publicSummary({ practiceArea, city, state, urgency, issue }) {
  const area = (AREAS[practiceArea] || 'legal').toLowerCase();
  const matter = issue ? ` about ${String(issue).toLowerCase()}` : '';
  return `Someone in ${city}, ${STATES[state] || state} is looking for a ${area} lawyer${matter}. ${URGENCY[urgency]}.`;
}

// ---------------------------------------------------------------- screening an inquiry
const DISPOSABLE = /@(mailinator|guerrillamail|10minutemail|tempmail|trashmail|yopmail|sharklasers|getnada|throwawaymail)\./i;
const SPAM = /\b(casino|crypto ?currency|bitcoin|viagra|cialis|backlinks?|seo (services|expert)|click here|telegram|whatsapp me|loan offer|forex|make money fast|adult)\b/i;
// Anything in these words is read by a person before the inquiry is listed.
const SENSITIVE = /\b(abus(e|ed|ive)|domestic violence|assault(ed)?|rape[d]?|molest\w*|suicid\w*|kill (myself|him|her|them)|self[- ]?harm|restraining order|protective order|child (abuse|neglect)|minor (child|children)|minors|underage|juvenile|deport\w*|detain(ed|ee)|arrest(ed)?|jail|bail|trafficking|stalk\w*|threat(en|ened|s)?\w*|police)\b/i;
const IDENTIFIERS = /\b\d{3}-\d{2}-\d{4}\b|\b(?:\d[ -]?){13,16}\b/; // a Social Security number or a card number typed into the description

export const phoneDigits = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; };

// Returns { errors: [..] } for a form to fix, { spam: true } for something to drop quietly, or { clean } with tidy values.
export function screenInquiry(body) {
  const b = body && typeof body === 'object' ? body : {};
  if (typeof b.website === 'string' && b.website.trim()) return { spam: true }; // the hidden field only a robot fills in
  const errors = [];
  const text = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
  const name = text(b.name, 80), city = text(b.city, 60), email = text(b.email, 254).toLowerCase();
  const description = typeof b.description === 'string' ? b.description.replace(/\r/g, '').trim().slice(0, 2000) : '';
  const phone = phoneDigits(b.phone);
  if (!/[A-Za-z]{2}/.test(name)) errors.push('Please enter your name.');
  if (!isEmail(email) || DISPOSABLE.test(email)) errors.push('Please enter a working email address.');
  if (b.phone && phone.length !== 10) errors.push('A phone number needs 10 digits (or leave it blank).');
  if (!isState(b.state)) errors.push('Please choose your state.');
  if (city.length < 2) errors.push('Please enter your city.');
  if (!Object.hasOwn(AREAS, b.practiceArea)) errors.push('Please choose the kind of help you need.');
  if (!Object.hasOwn(URGENCY, b.urgency)) errors.push('Please say how soon you need help.');
  const issue = Object.hasOwn(AREAS, b.practiceArea) && ISSUES[b.practiceArea].includes(b.issue) ? b.issue : null;
  if (description.length < 30) errors.push('Please describe your situation in a few sentences (at least 30 characters).');
  if (b.consent !== true) errors.push('Please tick the box to agree before sending.');
  if (errors.length) return { errors };
  const links = (description.match(/https?:\/\/|www\./gi) || []).length;
  const words = new Set(description.toLowerCase().split(/\W+/).filter(Boolean));
  if (SPAM.test(description) || links > 1 || words.size < 5 || /(.)\1{9,}/.test(description)) return { spam: true };
  let hold = '';
  if (SENSITIVE.test(description)) hold = 'sensitive wording: read it before listing';
  else if (IDENTIFIERS.test(description)) hold = 'looks like an ID or card number: remove it before listing';
  return { clean: { name, email, phone: phone || '', state: b.state, city, practiceArea: b.practiceArea, urgency: b.urgency, issue, description }, hold };
}

// Stores an inquiry. Approved at once when it passes every check; held for a person when it is sensitive. Returns { status } or null for dropped spam / a repeat.
export async function createInquiry(env, body, { ipHash = null, ua = '', source = 'form', now = new Date() } = {}) {
  const s = screenInquiry(body);
  if (s.errors) throw new HttpError(422, s.errors.join(' '));
  if (s.spam) return null;
  const c = s.clean;
  if (source === 'form') {
    if (ipHash) {
      const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM mp_leads WHERE ip_hash = ? AND created_at > datetime('now', '-1 hour')").bind(ipHash).first();
      if (recent.n >= 3) throw new HttpError(429, 'Too many requests from this connection. Please try again later.');
    }
    const dup = await env.DB.prepare("SELECT 1 FROM mp_leads WHERE json_extract(details_private, '$.email') = ? AND practice_area = ? AND created_at > datetime('now', '-7 days')").bind(c.email, c.practiceArea).first();
    if (dup) return null; // the same person asking twice about the same thing is one inquiry
  }
  const price = source === 'test' ? 0 : await basePrice(env, c.practiceArea);
  const status = s.hold ? 'held' : 'approved';
  const headStart = source === 'test' ? 0 : Math.max(0, Math.min(180, Number.parseInt(await setting(env, 'mp_head_start_minutes', String(DEFAULT_HEAD_START_MINUTES)), 10) || 0));
  const consent = { version: CONSENT.version, text: CONSENT.text, at: now.toISOString(), ipHash, ua: String(ua || '').slice(0, 200), form: 'get-matched' };
  const r = await env.DB.prepare(
    `INSERT INTO mp_leads (source, practice_area, state, city, urgency, issue, summary_public, details_private, consent, status, hold_reason, base_price_cents, approved_at, opens_at, ip_hash)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?, ${status === 'approved' ? "datetime('now')" : 'NULL'}, ${status === 'approved' ? `datetime('now', '+${headStart} minutes')` : 'NULL'}, ?)`
  ).bind(source, c.practiceArea, c.state, c.city, c.urgency, c.issue, publicSummary(c), JSON.stringify({ name: c.name, email: c.email, phone: c.phone, description: c.description }), JSON.stringify(consent), status, s.hold || null, price, ipHash).run();
  return { id: r.meta.last_row_id, status };
}

// ---------------------------------------------------------------- firms
// A firm may use the Marketplace only when it has passed the state-bar verification (verification.js) and is live.
export async function marketplaceAccess(env, slug) {
  const r = await env.DB.prepare(
    `SELECT f.featured AS featured, (v.status = 'verified') AS verified FROM firms f LEFT JOIN firm_verifications v ON v.firm_slug = f.slug WHERE f.slug = ? AND f.status = 'live'`
  ).bind(slug).first();
  return { exists: !!r, verified: !!(r && r.verified), featured: !!(r && r.featured) };
}

const parseList = (s) => { try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; } };

export async function ensureAccount(env, slug) {
  await env.DB.prepare('INSERT OR IGNORE INTO mp_accounts (firm_slug) VALUES (?)').bind(slug).run();
  const row = await env.DB.prepare('SELECT * FROM mp_accounts WHERE firm_slug = ?').bind(slug).first();
  const welcome = Number.parseInt(await setting(env, 'mp_welcome_credit_cents', '0'), 10) || 0;
  if (welcome > 0 && !row.promo_given && (await marketplaceAccess(env, slug)).verified) {
    await env.DB.prepare('UPDATE mp_accounts SET promo_given = 1 WHERE firm_slug = ? AND promo_given = 0').bind(slug).run();
    await addCredit(env, slug, 'promo', welcome, { ref: `welcome:${slug}`, note: 'Welcome credit' });
    return env.DB.prepare('SELECT * FROM mp_accounts WHERE firm_slug = ?').bind(slug).first();
  }
  return row;
}

export const accountView = (row) => ({
  practiceAreas: parseList(row.practice_areas), states: parseList(row.states), cities: parseList(row.cities), alerts: row.alerts, balanceCents: row.balance_cents,
});

export async function saveAccount(env, slug, body) {
  const areas = [...new Set((Array.isArray(body.practiceAreas) ? body.practiceAreas : []).filter((a) => Object.hasOwn(AREAS, a)))];
  const states = [...new Set((Array.isArray(body.states) ? body.states : []).filter(isState))];
  const cities = [...new Set((Array.isArray(body.cities) ? body.cities : []).map((c) => String(c).replace(/\s+/g, ' ').trim().slice(0, 60)).filter((c) => c.length > 1))].slice(0, 30);
  const alerts = ['instant', 'daily', 'off'].includes(body.alerts) ? body.alerts : 'instant';
  await ensureAccount(env, slug);
  await env.DB.prepare("UPDATE mp_accounts SET practice_areas = ?, states = ?, cities = ?, alerts = ?, updated_at = datetime('now') WHERE firm_slug = ?").bind(JSON.stringify(areas), JSON.stringify(states), JSON.stringify(cities), alerts, slug).run();
  return accountView(await ensureAccount(env, slug));
}

// The blurred feed: only open inquiries, never any contact detail. The default view is the firm's own practice areas and states; `all` widens it to everything.
export async function feed(env, slug, { all = false, city = '', limit = 30 } = {}) {
  const access = await marketplaceAccess(env, slug);
  if (!access.verified) throw new HttpError(403, 'The Marketplace opens once your firm is verified.');
  const account = accountView(await ensureAccount(env, slug));
  const live = await isLive(env);
  const where = [OPEN_SQL, `source = '${live ? 'form' : 'test'}'`, `(opens_at IS NULL OR opens_at <= datetime('now') OR ${access.featured ? '1' : '0'} = 1)`];
  const args = [];
  if (!all) {
    if (!account.practiceAreas.length || !account.states.length) return { leads: [], needsSetup: true, account };
    where.push(`practice_area IN (${account.practiceAreas.map(() => '?').join(',')})`, `state IN (${account.states.map(() => '?').join(',')})`);
    args.push(...account.practiceAreas, ...account.states);
  }
  const c = String(city || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (c) { where.push('LOWER(city) = LOWER(?)'); args.push(c); }
  const { results } = await env.DB.prepare(
    `SELECT id, practice_area, state, city, urgency, issue, summary_public, source, opens_at > datetime('now') AS early, ${PRICE_SQL} AS price_cents, CAST(${AGE_HOURS} AS INTEGER) AS age_hours
     FROM mp_leads WHERE ${where.join(' AND ')} ORDER BY approved_at DESC, id DESC LIMIT ?`
  ).bind(...args, Math.max(1, Math.min(60, limit))).all();
  return {
    needsSetup: false, account,
    leads: results.map((r) => ({ id: r.id, practiceArea: r.practice_area, practiceLabel: AREAS[r.practice_area], state: r.state, city: r.city, urgency: r.urgency, urgencyLabel: URGENCY[r.urgency], issue: r.issue, summary: r.summary_public, priceCents: r.price_cents, ageHours: r.age_hours, early: !!r.early, test: r.source === 'test' })),
  };
}

// ---------------------------------------------------------------- credit
// Adds (or, with a negative amount, takes) credit and writes the ledger row, once per `ref`: the same Stripe payment can never be credited twice.
export async function addCredit(env, slug, kind, amountCents, { ref = null, leadId = null, note = null, actor = null } = {}) {
  if (!Number.isInteger(amountCents) || amountCents === 0 || Math.abs(amountCents) > 10_000_000) throw new HttpError(422, 'Bad amount');
  if (!['topup', 'refund', 'promo', 'adjust'].includes(kind)) throw new HttpError(422, 'Bad kind');
  await env.DB.prepare('INSERT OR IGNORE INTO mp_accounts (firm_slug) VALUES (?)').bind(slug).run();
  const r = ref || randomToken(8);
  const fresh = "NOT EXISTS (SELECT 1 FROM mp_ledger WHERE kind = ? AND ref = ?)";
  const [step] = await env.DB.batch([
    env.DB.prepare(`UPDATE mp_accounts SET balance_cents = balance_cents + ?, updated_at = datetime('now') WHERE firm_slug = ? AND ${fresh}`).bind(amountCents, slug, kind, r),
    env.DB.prepare(`INSERT OR IGNORE INTO mp_ledger (firm_slug, kind, amount_cents, balance_after, lead_id, ref, note, actor)
      SELECT firm_slug, ?, ?, balance_cents, ?, ?, ?, ? FROM mp_accounts WHERE firm_slug = ? AND ${fresh}`).bind(kind, amountCents, leadId, r, note, actor, slug, kind, r),
  ]);
  return { credited: (step?.meta?.changes ?? 1) > 0 };
}

// Where a firm tops up: Stripe Payment Links for fixed packs, set as MP_TOPUP_LINK_100, _250 and _500 (no Stripe API key is needed). The firm's slug rides in client_reference_id
// so the webhook knows whose balance to credit.
export function topupOptions(env, slug, email = '') {
  return [100, 250, 500].map((dollars) => {
    const base = String(env[`MP_TOPUP_LINK_${dollars}`] || '').trim();
    if (!/^https:\/\/(buy\.stripe\.com|checkout\.stripe\.com)\//.test(base)) return null;
    const u = new URL(base);
    u.searchParams.set('client_reference_id', `mp_${slug}`);
    if (email) u.searchParams.set('prefilled_email', email);
    return { dollars, amountCents: dollars * 100, url: u.toString() };
  }).filter(Boolean);
}

// checkout.session.completed from a top-up link (client_reference_id mp_<slug>): credit the amount that was paid.
export async function creditFromCheckout(env, session) {
  const slug = String(session.client_reference_id || '').replace(/^mp_/, '').trim().toLowerCase();
  const firm = slug && (await env.DB.prepare("SELECT slug FROM firms WHERE slug = ? AND status = 'live'").bind(slug).first());
  const paid = ['paid', 'no_payment_required'].includes(session.payment_status) && session.mode === 'payment' && String(session.currency || '').toLowerCase() === 'usd';
  if (!firm || !paid || !Number.isInteger(session.amount_total) || session.amount_total < 100) {
    return audit(env, null, 'marketplace.topup_ignored', 'event', session.id || '', { reason: !firm ? 'unknown firm' : !paid ? 'not a paid dollar payment' : 'bad amount' });
  }
  const r = await addCredit(env, slug, 'topup', session.amount_total, { ref: session.id, note: 'Stripe top-up' });
  await audit(env, null, 'marketplace.topup', 'firm', slug, { cents: session.amount_total, session: session.id, credited: r.credited });
}

export async function ledgerFor(env, slug, limit = 50) {
  const { results } = await env.DB.prepare('SELECT id, kind, amount_cents, balance_after, lead_id, note, created_at FROM mp_ledger WHERE firm_slug = ? ORDER BY id DESC LIMIT ?').bind(slug, limit).all();
  return results.map((r) => ({ id: r.id, kind: r.kind, amountCents: r.amount_cents, balanceAfter: r.balance_after, leadId: r.lead_id, note: r.note, at: r.created_at }));
}

// ---------------------------------------------------------------- unlocking
// One batch (D1 runs a batch as a single transaction): mark the inquiry unlocked only if it is still open, visible to this firm and affordable; take the price from the
// balance and write the ledger row only if that first step won. Two firms racing for one inquiry: one statement changes a row, the other changes none, and no one is charged twice.
export async function unlockLead(env, slug, userId, leadId) {
  const access = await marketplaceAccess(env, slug);
  if (!access.verified) throw new HttpError(403, 'Your firm must be verified to unlock inquiries.');
  await ensureAccount(env, slug);
  const token = randomToken(16);
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE mp_leads SET status = 'unlocked', unlock_token = ?, unlocked_by = ?, unlocked_by_user = ?, unlocked_at = datetime('now'), paid_cents = ${PRICE_SQL}
       WHERE id = ? AND ${OPEN_SQL} AND (opens_at IS NULL OR opens_at <= datetime('now') OR ? = 1)
         AND (SELECT balance_cents FROM mp_accounts WHERE firm_slug = ?) >= ${PRICE_SQL}`
    ).bind(token, slug, userId, leadId, access.featured ? 1 : 0, slug),
    env.DB.prepare(
      `UPDATE mp_accounts SET balance_cents = balance_cents - (SELECT paid_cents FROM mp_leads WHERE id = ? AND unlock_token = ?), updated_at = datetime('now')
       WHERE firm_slug = ? AND EXISTS (SELECT 1 FROM mp_leads WHERE id = ? AND unlock_token = ?)`
    ).bind(leadId, token, slug, leadId, token),
    env.DB.prepare(
      `INSERT INTO mp_ledger (firm_slug, kind, amount_cents, balance_after, lead_id, actor)
       SELECT ?, 'unlock', -l.paid_cents, a.balance_cents, l.id, ? FROM mp_leads l JOIN mp_accounts a ON a.firm_slug = ? WHERE l.id = ? AND l.unlock_token = ?`
    ).bind(slug, userId, slug, leadId, token),
  ]);
  const row = await env.DB.prepare(`SELECT unlock_token, details_private, paid_cents, practice_area, state, city, urgency, issue, summary_public, unlocked_at FROM mp_leads WHERE id = ?`).bind(leadId).first();
  if (row && row.unlock_token === token) {
    await audit(env, { id: userId, email: null }, 'marketplace.unlock', 'lead', String(leadId), { firm: slug, cents: row.paid_cents });
    const d = JSON.parse(row.details_private);
    return { ok: true, paidCents: row.paid_cents, lead: { id: leadId, practiceLabel: AREAS[row.practice_area], state: row.state, city: row.city, urgency: URGENCY[row.urgency], issue: row.issue, summary: row.summary_public, name: d.name, email: d.email, phone: d.phone, description: d.description, unlockedAt: row.unlocked_at } };
  }
  // Not ours: say why, without revealing anything about the inquiry.
  const lead = await env.DB.prepare(`SELECT status, ${PRICE_SQL} AS price, ${OPEN_SQL} AS is_open, (opens_at IS NULL OR opens_at <= datetime('now')) AS opened FROM mp_leads WHERE id = ?`).bind(leadId).first();
  if (!lead || !lead.is_open) throw new HttpError(409, 'This inquiry was already taken or has expired.');
  if (!lead.opened && !access.featured) throw new HttpError(409, 'This inquiry is not open to all firms yet.');
  const bal = await env.DB.prepare('SELECT balance_cents FROM mp_accounts WHERE firm_slug = ?').bind(slug).first();
  throw new HttpError(402, `Not enough credit: this inquiry costs $${(lead.price / 100).toFixed(2)} and your balance is $${((bal?.balance_cents || 0) / 100).toFixed(2)}.`);
}

// The inquiries a firm has unlocked (with the contact details it paid for), and whether each can still be reported (48 hours from the unlock).
export async function unlockedFor(env, slug, limit = 100) {
  const { results } = await env.DB.prepare(
    `SELECT l.id, l.practice_area, l.state, l.city, l.urgency, l.issue, l.details_private, l.paid_cents, l.unlocked_at,
            (l.unlocked_at > datetime('now', '-${REPORT_HOURS} hours')) AS can_report, r.status AS report_status
     FROM mp_leads l LEFT JOIN mp_reports r ON r.lead_id = l.id AND r.firm_slug = l.unlocked_by
     WHERE l.unlocked_by = ? ORDER BY l.unlocked_at DESC, l.id DESC LIMIT ?`
  ).bind(slug, limit).all();
  return results.map((r) => { const d = JSON.parse(r.details_private); return { id: r.id, practiceLabel: AREAS[r.practice_area], state: r.state, city: r.city, urgency: URGENCY[r.urgency], issue: r.issue, name: d.name, email: d.email, phone: d.phone, description: d.description, paidCents: r.paid_cents, unlockedAt: r.unlocked_at, canReport: !!r.can_report && !r.report_status && r.paid_cents > 0, reportStatus: r.report_status || null }; });
}

// ---------------------------------------------------------------- bad inquiries
// A firm may report an inquiry it unlocked within 48 hours, and only for something clearly junk: a number that is disconnected, spam, or a fake inquiry. Never because the person
// did not hire the firm. An admin decides; an approved report returns the price to the firm's credit (once, however often it is retried).
export const REPORT_HOURS = 48;
export const REPORT_REASONS = { disconnected: 'The phone number is disconnected or the email bounces', spam: 'It is spam or an advertisement', fake: 'It is fake, a test or a joke', other: 'Something else that is clearly not a real inquiry' };

export async function reportLead(env, slug, userId, leadId, { reason, detail } = {}) {
  if (!Object.hasOwn(REPORT_REASONS, reason)) throw new HttpError(422, 'Please choose a reason.');
  const lead = await env.DB.prepare(`SELECT unlocked_by, paid_cents, (unlocked_at > datetime('now', '-${REPORT_HOURS} hours')) AS in_window FROM mp_leads WHERE id = ?`).bind(leadId).first();
  if (!lead || lead.unlocked_by !== slug) throw new HttpError(403, 'You can only report an inquiry your firm unlocked.');
  if (!lead.paid_cents) throw new HttpError(409, 'This inquiry cost nothing, so there is nothing to refund.');
  if (!lead.in_window) throw new HttpError(409, `Reports must be made within ${REPORT_HOURS} hours of unlocking.`);
  const r = await env.DB.prepare('INSERT OR IGNORE INTO mp_reports (lead_id, firm_slug, reason, detail) VALUES (?, ?, ?, ?)').bind(leadId, slug, reason, String(detail || '').replace(/\s+/g, ' ').trim().slice(0, 500) || null).run();
  if (!r.meta.changes) throw new HttpError(409, 'You already reported this inquiry.');
  await audit(env, { id: userId, email: null }, 'marketplace.report', 'lead', String(leadId), { firm: slug, reason });
  return { ok: true, id: r.meta.last_row_id };
}

export async function adminReports(env, status = 'open', limit = 50) {
  const st = ['open', 'approved', 'denied'].includes(status) ? status : 'open';
  const { results } = await env.DB.prepare(
    `SELECT r.id, r.lead_id, r.firm_slug, r.reason, r.detail, r.status, r.admin_note, r.created_at, f.name AS firm_name, l.details_private, l.paid_cents, l.practice_area, l.city, l.state, l.unlocked_at
     FROM mp_reports r JOIN mp_leads l ON l.id = r.lead_id LEFT JOIN firms f ON f.slug = r.firm_slug WHERE r.status = ? ORDER BY r.id DESC LIMIT ?`
  ).bind(st, limit).all();
  return results.map((r) => ({ id: r.id, leadId: r.lead_id, firm: r.firm_slug, firmName: r.firm_name, reason: r.reason, reasonText: REPORT_REASONS[r.reason], detail: r.detail, status: r.status, adminNote: r.admin_note, reportedAt: r.created_at, paidCents: r.paid_cents, practiceLabel: AREAS[r.practice_area], city: r.city, state: r.state, unlockedAt: r.unlocked_at, details: JSON.parse(r.details_private) }));
}

export async function resolveReport(env, admin, id, action, note = '') {
  if (!['approve', 'deny'].includes(action)) throw new HttpError(422, 'Choose approve or deny');
  const r = await env.DB.prepare("UPDATE mp_reports SET status = ?, resolved_by = ?, resolved_at = datetime('now'), admin_note = ? WHERE id = ? AND status = 'open'").bind(action === 'approve' ? 'approved' : 'denied', admin.id, String(note || '').slice(0, 300) || null, id).run();
  if (!r.meta.changes) throw new HttpError(404, 'That report was already decided.');
  const rep = await env.DB.prepare('SELECT r.lead_id, r.firm_slug, r.reason, l.paid_cents FROM mp_reports r JOIN mp_leads l ON l.id = r.lead_id WHERE r.id = ?').bind(id).first();
  if (action === 'approve') await addCredit(env, rep.firm_slug, 'refund', rep.paid_cents, { ref: `report:${id}`, leadId: rep.lead_id, note: `Refund: ${rep.reason}`, actor: admin.id });
  await audit(env, admin, `marketplace.report_${action}`, 'lead', String(rep.lead_id), { firm: rep.firm_slug, report: id });
  return { ok: true };
}

// How many open inquiries match a firm right now (the dashboard says so; it is the in-dashboard notification).
export async function matchingCount(env, slug) {
  try { const f = await feed(env, slug, { limit: 60 }); return f.needsSetup ? 0 : f.leads.length; } catch { return 0; }
}

// ---------------------------------------------------------------- housekeeping and admin
export async function expireOld(env) {
  const r = await env.DB.prepare(`UPDATE mp_leads SET status = 'expired' WHERE status = 'approved' AND approved_at IS NOT NULL AND ${AGE_HOURS} >= ${DECAY.expireDays * 24}`).run();
  return r.meta?.changes || 0;
}

export async function adminOverview(env) {
  const [byStatus, money, accounts, owed] = await Promise.all([
    env.DB.prepare("SELECT status, COUNT(*) AS n FROM mp_leads WHERE source = 'form' GROUP BY status").all(),
    env.DB.prepare("SELECT COALESCE(SUM(CASE WHEN kind = 'topup' THEN amount_cents END), 0) AS topups, COALESCE(-SUM(CASE WHEN kind = 'unlock' THEN amount_cents END), 0) AS unlocks FROM mp_ledger").first(),
    env.DB.prepare('SELECT a.firm_slug AS slug, f.name, a.balance_cents, a.practice_areas, a.states FROM mp_accounts a JOIN firms f ON f.slug = a.firm_slug ORDER BY a.balance_cents DESC LIMIT 50').all(),
    env.DB.prepare('SELECT COALESCE(SUM(balance_cents), 0) AS n FROM mp_accounts').first(),
  ]);
  const outstanding = owed.n;
  const counts = { pending: 0, approved: 0, held: 0, rejected: 0, unlocked: 0, expired: 0 };
  for (const r of byStatus.results) counts[r.status] = r.n;
  return { live: await isLive(env), counts, topupsCents: money.topups, unlockedCents: money.unlocks, outstandingCents: outstanding, accounts: accounts.results.map((a) => ({ slug: a.slug, name: a.name, balanceCents: a.balance_cents, practiceAreas: parseList(a.practice_areas), states: parseList(a.states) })) };
}

export async function adminLeads(env, status = 'held', limit = 50) {
  const st = ['pending', 'approved', 'held', 'rejected', 'unlocked', 'expired'].includes(status) ? status : 'held';
  const { results } = await env.DB.prepare('SELECT id, source, practice_area, state, city, urgency, issue, summary_public, details_private, status, hold_reason, base_price_cents, created_at, unlocked_by FROM mp_leads WHERE status = ? ORDER BY id DESC LIMIT ?').bind(st, limit).all();
  return results.map((r) => ({ id: r.id, source: r.source, practiceLabel: AREAS[r.practice_area], state: r.state, city: r.city, urgency: URGENCY[r.urgency], issue: r.issue, summary: r.summary_public, details: JSON.parse(r.details_private), status: r.status, holdReason: r.hold_reason, priceCents: r.base_price_cents, createdAt: r.created_at, unlockedBy: r.unlocked_by }));
}

export async function decideLead(env, admin, id, action) {
  if (!['approve', 'reject'].includes(action)) throw new HttpError(422, 'Choose approve or reject');
  const headStart = Math.max(0, Math.min(180, Number.parseInt(await setting(env, 'mp_head_start_minutes', String(DEFAULT_HEAD_START_MINUTES)), 10) || 0));
  const r = action === 'approve'
    ? await env.DB.prepare(`UPDATE mp_leads SET status = 'approved', approved_at = datetime('now'), opens_at = datetime('now', '+${headStart} minutes'), reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ? AND status IN ('held', 'pending')`).bind(admin.id, id).run()
    : await env.DB.prepare("UPDATE mp_leads SET status = 'rejected', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ? AND status IN ('held', 'pending')").bind(admin.id, id).run();
  if (!r.meta.changes) throw new HttpError(404, 'That inquiry is not waiting for review.');
  await audit(env, admin, `marketplace.lead_${action}`, 'lead', String(id));
  return { ok: true };
}

// A clearly fake inquiry, free to unlock, shown only while the Marketplace is switched off: lets the owner walk through the firm side before launch.
export async function createTestLead(env, admin, { practiceArea = 'family', state = 'FL', city = 'Miami' } = {}) {
  const r = await createInquiry(env, {
    name: 'Test Person', email: `test+${randomToken(4)}@lawdb.ai`, phone: '5555550100', state, city, practiceArea, urgency: 'week', issue: ISSUES[practiceArea]?.[0] || null,
    description: 'This is a test inquiry created by an admin so the Marketplace can be tried out. It is not a real person.', consent: true,
  }, { source: 'test' });
  await audit(env, admin, 'marketplace.test_lead', 'lead', String(r?.id || ''));
  return r;
}
