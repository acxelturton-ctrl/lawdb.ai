// The Professional Network API (see src/lib/network.js). Every route needs a signed-in user who is an APPROVED manager of the acting firm (:slug).
// The Network is part of the Featured plan (paid or the free month): a Basic firm gets the locked preview from GET .../network.
import { json, readJson, NO_STORE, HttpError } from '../lib/http.js';
import { requireUser, requireAdmin, adminEmails } from '../lib/auth.js';
import { sha256Hex } from '../lib/crypto.js';
import { bump } from '../lib/counter.js';
import { planInfo, ownerEmails } from '../lib/stripe.js';
import { isFeatured } from '../lib/leads.js';
import { mailInBackground, networkRequestEmail, networkAcceptedEmail, networkReportEmail } from '../lib/email.js';
import * as net from '../lib/network.js';

const reply = (body, status = 200) => json(body, status, NO_STORE);
const PER_VISITOR_HOUR = 30;
const DEFAULT_DAILY_MODEL_CAP = 3000;

async function owner(env, request, slug) {
  const user = await requireUser(env, request);
  const m = await env.DB.prepare("SELECT 1 FROM firm_members WHERE user_id = ? AND firm_slug = ? AND status = 'approved'").bind(user.id, slug).first();
  if (!m) throw new HttpError(403, 'You do not manage this firm');
  return user;
}
const needFeatured = async (env, slug) => { if (!(await isFeatured(env, slug))) throw new HttpError(403, 'The Professional Network is part of the Featured plan. Start your free month from your dashboard.'); };
const firmName = async (env, slug) => (await env.DB.prepare('SELECT name, city, state FROM firms WHERE slug = ?').bind(slug).first()) || { name: slug, city: '', state: '' };

// Basic firms get the locked preview (and the way to start the free month); Featured firms get their network.
export async function get({ request, env, params }) {
  const user = await owner(env, request, params.slug);
  const plan = await planInfo(env, user, params.slug);
  const planBits = { featured: plan.featured, trial: plan.trial, trialAvailable: plan.trialAvailable, trialDays: plan.trialDays, upgradeUrl: plan.upgradeUrl, price: plan.price, subscription: plan.subscription };
  if (!plan.featured) return reply({ locked: true, plan: planBits, members: await net.memberCount(env) });
  return reply({ locked: false, plan: planBits, ...(await net.overview(env, params.slug)), rules: net.RULES, rulesVersion: net.RULES_VERSION, kinds: net.KINDS, firmTypes: net.FIRM_TYPES, blocked: await net.blockedList(env, params.slug) });
}

export async function save({ request, env, params }) {
  const user = await owner(env, request, params.slug);
  const body = await readJson(request, 4000);
  const profile = await net.saveProfile(env, user, params.slug, body, { featured: await isFeatured(env, params.slug) });
  return reply({ ok: true, profile });
}

export async function facets({ request, env, params }) {
  await owner(env, request, params.slug);
  await needFeatured(env, params.slug);
  return reply({ states: await net.facets(env, params.slug), kinds: net.KINDS, firmTypes: net.FIRM_TYPES });
}

export async function search({ request, env, params, url }) {
  await owner(env, request, params.slug);
  await needFeatured(env, params.slug);
  const q = Object.fromEntries(url.searchParams);
  return reply(await net.searchMembers(env, params.slug, q));
}

// "I'm looking for an immigration lawyer in Houston who accepts referrals": the AI reads it into filters, then the same search runs.
export async function ask({ request, env, params }) {
  const user = await owner(env, request, params.slug);
  await needFeatured(env, params.slug);
  const body = await readJson(request, 2000);
  const text = typeof body.text === 'string' ? body.text.replace(/\s+/g, ' ').trim().slice(0, 400) : '';
  if (text.length < 3) throw new HttpError(422, 'Describe the kind of lawyer you are looking for.');
  const ip = await sha256Hex('net:' + user.id);
  if ((await bump(env, 'ai-visitor', ip.slice(0, 20), String(new Date().getUTCHours()))) > PER_VISITOR_HOUR) throw new HttpError(429, 'Too many searches for now. Please try again in a little while.');
  const cap = Number(env.AI_DAILY_CAP) || DEFAULT_DAILY_MODEL_CAP;
  const useModel = !!env.AI && (await bump(env, 'ai-model', '', '')) <= cap;
  const cities = (await net.facets(env, params.slug)).flatMap((s) => s.cities.map((c) => ({ city: c.city, state: s.code, n: c.n })));
  const { filters, mode } = await net.parseQuery(useModel ? env : { ...env, AI: undefined }, text, cities);
  return reply({ mode, ...(await net.searchMembers(env, params.slug, filters)) });
}

export async function connect({ request, env, params, url, exec }) {
  const user = await owner(env, request, params.slug);
  await needFeatured(env, params.slug);
  const body = await readJson(request, 2000);
  const to = String(body.to || '');
  const id = await net.requestConnection(env, user, params.slug, to, body.message);
  const [from, target] = [await firmName(env, params.slug), await firmName(env, to)];
  const person = (await env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(user.id).first())?.name || '';
  const emails = await ownerEmails(env, to);
  if (emails.length) mailInBackground(env, exec, { to: emails, ...networkRequestEmail(env.SITE_ORIGIN || url.origin, { toName: target.name, fromName: from.name, fromCity: from.city, fromState: from.state, person, message: String(body.message || '').trim() }) });
  return reply({ ok: true, id }, 201);
}

export async function decide({ request, env, params, url, exec }) {
  const user = await owner(env, request, params.slug);
  const body = await readJson(request, 500);
  const r = await net.decideConnection(env, user, params.slug, Number(params.id), String(body.action || ''));
  if (r.status === 'accepted') {
    const [asker, other] = [await firmName(env, r.fromSlug), await firmName(env, params.slug)];
    const emails = await ownerEmails(env, r.fromSlug);
    if (emails.length) mailInBackground(env, exec, { to: emails, ...networkAcceptedEmail(env.SITE_ORIGIN || url.origin, { askerName: asker.name, otherName: other.name }) });
  }
  return reply({ ok: true, status: r.status });
}

export async function block({ request, env, params }) {
  const user = await owner(env, request, params.slug);
  const body = await readJson(request, 500);
  await net.blockFirm(env, user, params.slug, String(body.slug || ''));
  return reply({ ok: true, blocked: await net.blockedList(env, params.slug) });
}
export async function unblock({ request, env, params }) {
  const user = await owner(env, request, params.slug);
  await net.unblockFirm(env, user, params.slug, params.other);
  return reply({ ok: true, blocked: await net.blockedList(env, params.slug) });
}

export async function report({ request, env, params, url, exec }) {
  const user = await owner(env, request, params.slug);
  const body = await readJson(request, 2000);
  const r = await net.reportFirm(env, user, params.slug, body);
  const to = [...adminEmails(env)];
  if (to.length) mailInBackground(env, exec, { to, ...networkReportEmail(env.SITE_ORIGIN || url.origin, { reporterName: (await firmName(env, params.slug)).name, reportedName: r.name, reportedSlug: String(body.slug), reason: r.reason, detail: r.detail }) });
  return reply({ ok: true }, 201);
}

// ---- admin
export async function adminReports({ request, env, url }) {
  await requireAdmin(env, request);
  const status = ['new', 'reviewed', 'actioned'].includes(url.searchParams.get('status')) ? url.searchParams.get('status') : 'new';
  return reply({ reports: await net.listReports(env, status) });
}
export async function adminReview({ request, env, params }) {
  const admin = await requireAdmin(env, request);
  const body = await readJson(request, 500);
  await net.reviewReport(env, admin, Number(params.id), { status: body.status, suspend: body.suspend === true });
  return reply({ ok: true });
}
export async function adminSuspend({ request, env, params }) {
  const admin = await requireAdmin(env, request);
  const body = await readJson(request, 500);
  await net.setSuspended(env, admin, params.slug, body.suspended !== false, typeof body.why === 'string' ? body.why.slice(0, 200) : 'admin');
  return reply({ ok: true });
}
