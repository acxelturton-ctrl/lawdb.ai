// LawDB Marketplace, phase 2: email alerts and the daily digest. Every email carries only what the blurred preview carries (practice area, city, state, urgency, price, a one-line
// summary) and a link to the dashboard; the first firm to unlock gets the inquiry, so a wave is only sent while the inquiry is still unclaimed.
//
// Waves: Featured firms are told at once (their head start); everyone else from the moment the inquiry opens to all firms. Each wave is at most WAVE.size firms, Featured first,
// at least WAVE.gapMinutes apart, at most WAVE.maxWaves after the first, and only for inquiries less than WAVE.windowHours old. A day's emails are capped (Brevo's free plan sends
// 300 a day and sign-in links share it). Nothing is sent, or recorded as sent, while the mail key is missing, so alerts start cleanly the day the key is added.
import { sendMail, emailConfigured, esc } from './email.js';
import { audit } from './audit.js';
import { AREAS, URGENCY, setting, setSetting, PRICE_SQL } from './marketplace.js';
import { STATES } from './us.js';

export const WAVE = { size: 15, gapMinutes: 5, maxWaves: 3, windowHours: 24, dailyCap: 150, digestMax: 10, digestHourUtc: 14 };

const matchSql = `
  FROM mp_accounts a
  JOIN firms f ON f.slug = a.firm_slug AND f.status = 'live'
  JOIN firm_verifications v ON v.firm_slug = a.firm_slug AND v.status = 'verified'
  WHERE EXISTS (SELECT 1 FROM json_each(a.practice_areas) WHERE value = ?)
    AND EXISTS (SELECT 1 FROM json_each(a.states) WHERE value = ?)
    AND (json_array_length(a.cities) = 0 OR EXISTS (SELECT 1 FROM json_each(a.cities) WHERE LOWER(value) = LOWER(?)))`;

const ownersOf = async (env, slug) => (await env.DB.prepare("SELECT u.email FROM firm_members m JOIN users u ON u.id = m.user_id WHERE m.firm_slug = ? AND m.status = 'approved' AND u.disabled = 0").bind(slug).all()).results.map((r) => r.email);

const button = (link, label) => `<p><a href="${esc(link)}" style="background:#c9a050;color:#2a2a2a;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:700">${esc(label)}</a></p>`;
const money = (c) => '$' + ((c || 0) / 100).toFixed(2);

export function alertEmail(origin, slug, lead) {
  const link = `${origin}/account/#marketplace/${slug}`;
  const where = `${lead.city}, ${STATES[lead.state] || lead.state}`;
  return {
    subject: `New ${AREAS[lead.practice_area]} inquiry in ${where}`,
    text: `${lead.summary_public}\n\nPrice to unlock: ${money(lead.price_cents)}. The first firm to unlock it receives it; the person's name and contact details are shown after you unlock.\n\nOpen the Marketplace: ${link}\n\nChange or stop these emails in the Marketplace settings. LawDB is an independent directory and is not a law firm.`,
    html: `<p>${esc(lead.summary_public)}</p><p>Price to unlock: <b>${esc(money(lead.price_cents))}</b>. The first firm to unlock it receives it; the person's name and contact details are shown after you unlock.</p>${button(link, 'Open the Marketplace')}<p style="color:#5f5f5f;font-size:13px">Change or stop these emails in the Marketplace settings. LawDB is an independent directory and is not a law firm.</p>`,
  };
}

export function digestEmail(origin, slug, leads) {
  const link = `${origin}/account/#marketplace/${slug}`;
  return {
    subject: `${leads.length} new ${leads.length === 1 ? 'inquiry matches' : 'inquiries match'} your firm on LawDB`,
    text: `Open inquiries that match your practice areas:\n\n${leads.map((l) => `- ${l.summary_public} (${money(l.price_cents)})`).join('\n')}\n\nThe first firm to unlock an inquiry receives it.\nOpen the Marketplace: ${link}\n\nChange or stop these emails in the Marketplace settings.`,
    html: `<p>Open inquiries that match your practice areas:</p><ul>${leads.map((l) => `<li>${esc(l.summary_public)} (${esc(money(l.price_cents))})</li>`).join('')}</ul><p>The first firm to unlock an inquiry receives it.</p>${button(link, 'Open the Marketplace')}`,
  };
}

const sentToday = async (env) => (await env.DB.prepare("SELECT COUNT(*) AS n FROM mp_alerts WHERE sent_at > datetime('now', '-1 day')").first()).n;

// One tick (called every 5 minutes). Returns how many firms were emailed.
export async function processAlerts(env, origin = env.SITE_ORIGIN || 'https://lawdb.ai') {
  if (!emailConfigured(env)) return 0;
  if ((await setting(env, 'marketplace_live', '0')) !== '1') return 0;
  let budget = Math.max(0, WAVE.dailyCap - (await sentToday(env)));
  if (!budget) return 0;
  const { results: leads } = await env.DB.prepare(
    `SELECT id, practice_area, state, city, summary_public, ${PRICE_SQL} AS price_cents, (opens_at IS NULL OR opens_at <= datetime('now')) AS opened,
            (SELECT MAX(wave) FROM mp_alerts WHERE lead_id = mp_leads.id) AS last_wave,
            (SELECT MAX(sent_at) FROM mp_alerts WHERE lead_id = mp_leads.id) AS last_at,
            (SELECT COUNT(*) FROM mp_alerts WHERE lead_id = mp_leads.id AND sent_at > datetime('now', '-${WAVE.gapMinutes} minutes')) AS recent
     FROM mp_leads WHERE status = 'approved' AND source = 'form' AND approved_at > datetime('now', '-${WAVE.windowHours} hours') ORDER BY approved_at LIMIT 20`
  ).all();
  let emailed = 0;
  for (const lead of leads) {
    if (budget <= 0) break;
    const wave = lead.last_wave == null ? 0 : lead.last_wave + 1;
    if (wave > WAVE.maxWaves) continue;
    if (lead.recent) continue; // the last wave went out less than gapMinutes ago
    if (!lead.opened && wave > 0) continue; // before the head start ends only Featured firms are told, in wave 0
    const featuredOnly = !lead.opened;
    const { results: firms } = await env.DB.prepare(
      `SELECT a.firm_slug AS slug, f.featured ${matchSql} AND a.alerts = 'instant' ${featuredOnly ? 'AND f.featured = 1' : ''}
         AND NOT EXISTS (SELECT 1 FROM mp_alerts x WHERE x.lead_id = ? AND x.firm_slug = a.firm_slug)
       ORDER BY f.featured DESC, a.created_at, a.firm_slug LIMIT ?`
    ).bind(lead.practice_area, lead.state, lead.city, lead.id, Math.min(WAVE.size, budget)).all();
    if (!firms.length) {
      // Nobody to tell in this wave: record that the wave happened (so the next wave can follow), without a recipient.
      if (!featuredOnly) await env.DB.prepare("INSERT OR IGNORE INTO mp_alerts (lead_id, firm_slug, wave) VALUES (?, ?, ?)").bind(lead.id, `(wave ${wave})`, wave).run();
      continue;
    }
    for (const firm of firms) {
      const to = await ownersOf(env, firm.slug);
      if (!to.length) { await env.DB.prepare('INSERT OR IGNORE INTO mp_alerts (lead_id, firm_slug, wave) VALUES (?, ?, ?)').bind(lead.id, firm.slug, wave).run(); continue; }
      try {
        await sendMail(env, { to, ...alertEmail(origin, firm.slug, lead) });
        await env.DB.prepare('INSERT OR IGNORE INTO mp_alerts (lead_id, firm_slug, wave) VALUES (?, ?, ?)').bind(lead.id, firm.slug, wave).run();
        emailed++; budget--;
      } catch (err) {
        await audit(env, null, 'marketplace.alert_failed', 'firm', firm.slug, { lead: lead.id, error: String(err.message || err).slice(0, 200) });
        return emailed; // a mail problem stops this tick; the next one tries again
      }
    }
  }
  return emailed;
}

// The daily summary for firms that chose it: once a day, at digestHourUtc, only if something open matches.
export async function sendDigests(env, now = new Date(), origin = env.SITE_ORIGIN || 'https://lawdb.ai') {
  if (!emailConfigured(env) || (await setting(env, 'marketplace_live', '0')) !== '1') return 0;
  if (now.getUTCHours() !== WAVE.digestHourUtc) return 0;
  const day = now.toISOString().slice(0, 10);
  if ((await setting(env, 'mp_digest_day', '')) === day) return 0;
  await setSetting(env, 'mp_digest_day', day);
  const { results: firms } = await env.DB.prepare(
    `SELECT a.firm_slug AS slug, a.practice_areas, a.states, a.cities FROM mp_accounts a JOIN firms f ON f.slug = a.firm_slug AND f.status = 'live'
     JOIN firm_verifications v ON v.firm_slug = a.firm_slug AND v.status = 'verified' WHERE a.alerts = 'daily' LIMIT 200`
  ).all();
  let sent = 0;
  for (const firm of firms) {
    const areas = JSON.parse(firm.practice_areas || '[]'), states = JSON.parse(firm.states || '[]'), cities = JSON.parse(firm.cities || '[]');
    if (!areas.length || !states.length) continue;
    const { results: leads } = await env.DB.prepare(
      `SELECT summary_public, city, ${PRICE_SQL} AS price_cents FROM mp_leads
       WHERE status = 'approved' AND source = 'form' AND approved_at > datetime('now', '-1 day') AND (opens_at IS NULL OR opens_at <= datetime('now'))
         AND practice_area IN (${areas.map(() => '?').join(',')}) AND state IN (${states.map(() => '?').join(',')}) ORDER BY approved_at DESC LIMIT ${WAVE.digestMax * 3}`
    ).bind(...areas, ...states).all();
    const mine = leads.filter((l) => !cities.length || cities.some((c) => c.toLowerCase() === String(l.city).toLowerCase())).slice(0, WAVE.digestMax);
    if (!mine.length) continue;
    const to = await ownersOf(env, firm.slug);
    if (!to.length) continue;
    try { await sendMail(env, { to, ...digestEmail(origin, firm.slug, mine) }); sent++; } catch (err) { await audit(env, null, 'marketplace.digest_failed', 'firm', firm.slug, { error: String(err.message || err).slice(0, 200) }); }
  }
  return sent;
}
