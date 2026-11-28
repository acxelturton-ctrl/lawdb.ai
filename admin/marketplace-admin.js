// LawDB Marketplace, admin side: the on/off switch, inquiries waiting for a person, prices, credit and the money in and out.
// SECURITY: what people typed is inserted as text nodes only.
import { h, api, note, when } from './ui.js';

const money = (c) => '$' + ((c || 0) / 100).toFixed(2);

export async function viewMarketplaceAdmin() {
  const root = h('div', null);
  const o = await api('GET', '/api/admin/marketplace');
  const msg = h('div', null);
  const say = (cls, text) => msg.replaceChildren(note(cls, text));
  const reload = async () => root.replaceWith(await viewMarketplaceAdmin());

  // ---- the switch
  const reviewed = h('input', { type: 'checkbox' });
  const switchCard = h('div', { class: 'card' }, h('h2', null, 'Marketplace is ', o.live ? 'OPEN' : 'CLOSED'),
    o.live
      ? h('p', null, 'People can send inquiries on the Get matched page, and verified firms can unlock them.')
      : h('p', { class: 'muted' }, 'The Get matched page does not take inquiries. Firms see only sample inquiries you create below.'),
    !o.live && h('div', null,
      h('p', { class: 'muted' }, 'Before opening it, a lawyer who knows state bar advertising and lead-generation rules should read this consent wording, the privacy policy and the terms:'),
      h('blockquote', null, o.consent.text), h('p', { class: 'muted' }, `Wording version ${o.consent.version}.`),
      h('label', { class: 'check' }, reviewed, ' A lawyer has reviewed the consent wording, the privacy policy and the terms.')),
    h('div', { class: 'row' }, h('button', { type: 'button', class: o.live ? '' : 'primary', onclick: async () => {
      try { await api('PATCH', '/api/admin/marketplace', { live: !o.live, reviewedByLawyer: reviewed.checked }); await reload(); } catch (err) { say('msg-err', err.message); }
    } }, o.live ? 'Close the Marketplace' : 'Open the Marketplace')));

  // ---- numbers
  const stat = (label, v) => h('div', { class: 'card' }, h('b', null, v), h('p', { class: 'muted' }, label));
  const numbers = h('div', { class: 'two' }, stat('Credit paid in (top-ups)', money(o.topupsCents)), stat('Spent on unlocks', money(o.unlockedCents)), stat('Credit still held by firms', money(o.outstandingCents)),
    stat('Inquiries: waiting / open / unlocked', `${o.counts.held} / ${o.counts.approved} / ${o.counts.unlocked}`));

  // ---- inquiries waiting for a person
  const heldBox = h('div', null);
  async function loadHeld() {
    const { leads } = await api('GET', '/api/admin/marketplace/leads?status=held');
    heldBox.replaceChildren(...(leads.length ? leads.map((l) => h('div', { class: 'card' },
      h('b', null, `${l.practiceLabel}: ${l.city}, ${l.state}`), h('p', { class: 'muted' }, `${l.urgency} · held: ${l.holdReason || 'review'} · ${when(l.createdAt)}`),
      h('p', null, h('b', null, l.details.name), ' · ', l.details.email, l.details.phone ? ` · ${l.details.phone}` : ''), h('p', null, l.details.description),
      h('p', { class: 'muted' }, 'Firms would see: ', l.summary),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'primary', onclick: async () => { try { await api('PATCH', `/api/admin/marketplace/leads/${l.id}`, { action: 'approve' }); await loadHeld(); } catch (err) { say('msg-err', err.message); } } }, 'List it'),
        h('button', { type: 'button', onclick: async () => { try { await api('PATCH', `/api/admin/marketplace/leads/${l.id}`, { action: 'reject' }); await loadHeld(); } catch (err) { say('msg-err', err.message); } } }, 'Do not list')))) : [note('muted', 'Nothing is waiting for review.')]));
  }
  await loadHeld();

  // ---- reports of bad inquiries (a firm asked for its credit back)
  const reportBox = h('div', null);
  async function loadReports() {
    const { reports } = await api('GET', '/api/admin/marketplace/reports?status=open');
    const decide = async (id, action, noteIn) => { try { await api('PATCH', `/api/admin/marketplace/reports/${id}`, { action, note: noteIn.value }); await reload(); } catch (err) { say('msg-err', err.message); } };
    reportBox.replaceChildren(...(reports.length ? reports.map((r) => { const noteIn = h('input', { type: 'text', maxlength: 300, placeholder: 'Note (optional)' }); return h('div', { class: 'card' },
      h('b', null, `${r.firmName || r.firm}: ${r.practiceLabel}, ${r.city}, ${r.state}`), h('p', { class: 'muted' }, `Unlocked ${when(r.unlockedAt)} for ${money(r.paidCents)} · reported ${when(r.reportedAt)}`),
      h('p', null, h('b', null, r.reasonText), r.detail ? `: ${r.detail}` : ''), h('p', null, `${r.details.name} · ${r.details.email}${r.details.phone ? ' · ' + r.details.phone : ''}`), h('p', null, r.details.description),
      h('div', { class: 'row' }, noteIn, h('button', { type: 'button', class: 'primary', onclick: () => decide(r.id, 'approve', noteIn) }, `Refund ${money(r.paidCents)}`), h('button', { type: 'button', onclick: () => decide(r.id, 'deny', noteIn) }, 'No refund'))); }) : [note('muted', 'No reports waiting.')]));
  }
  await loadReports();

  // ---- prices and settings
  const priceInputs = Object.entries(o.areas).map(([k, label]) => { const i = h('input', { type: 'number', min: 0, max: 1000, step: 1, value: Math.round(o.prices[k] / 100), style: 'width:90px' }); return { k, i, el: h('label', null, `${label} $`, i) }; });
  const headIn = h('input', { type: 'number', min: 0, max: 180, value: o.headStartMinutes, style: 'width:80px' });
  const welcomeIn = h('input', { type: 'number', min: 0, max: 500, step: 5, value: Math.round(o.welcomeCreditCents / 100), style: 'width:80px' });
  const settings = h('div', { class: 'card' }, h('h2', null, 'Prices and settings'),
    h('p', { class: 'muted' }, 'Starting price per inquiry in dollars (full price for 48 hours, 40% off until day 7). Test inquiries are free.'),
    h('div', { class: 'checks' }, priceInputs.map((p) => p.el)),
    h('p', null, h('label', null, 'Featured head start (minutes) ', headIn)), h('p', null, h('label', null, 'Welcome credit for a newly verified firm ($) ', welcomeIn)),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'primary', onclick: async () => {
      try { await api('PATCH', '/api/admin/marketplace', { prices: Object.fromEntries(priceInputs.map((p) => [p.k, Number(p.i.value)])), headStartMinutes: Number(headIn.value), welcomeCreditDollars: Number(welcomeIn.value) }); say('msg-ok', 'Saved.'); } catch (err) { say('msg-err', err.message); }
    } }, 'Save')));

  // ---- try it, and credit a firm
  const testBtn = h('button', { type: 'button', onclick: async () => { try { await api('POST', '/api/admin/marketplace/test-lead', {}); say('msg-ok', 'A sample family-law inquiry in Miami, FL was created. A verified firm that wants family law in Florida will see it (while the Marketplace is closed).'); } catch (err) { say('msg-err', err.message); } } }, 'Create a sample inquiry');
  const slugIn = h('input', { type: 'text', placeholder: 'firm-slug' }), dollarsIn = h('input', { type: 'number', step: 5, placeholder: '50', style: 'width:90px' }), noteIn = h('input', { type: 'text', placeholder: 'Note', maxlength: 200 });
  const tools = h('div', { class: 'card' }, h('h2', null, 'Try it and give credit'),
    h('p', { class: 'muted' }, 'A sample inquiry costs nothing to unlock and only shows while the Marketplace is closed.'), h('div', { class: 'row' }, testBtn),
    h('p', { class: 'muted' }, 'Give a firm credit (or take it back with a negative amount). It is written to the ledger.'),
    h('div', { class: 'row' }, slugIn, dollarsIn, noteIn, h('button', { type: 'button', onclick: async () => {
      try { await api('POST', '/api/admin/marketplace/credit', { slug: slugIn.value.trim(), dollars: Number(dollarsIn.value), note: noteIn.value }); say('msg-ok', 'Done.'); await reload(); } catch (err) { say('msg-err', err.message); }
    } }, 'Apply')));

  // ---- firms with credit
  const accounts = h('div', { class: 'card' }, h('h2', null, 'Firms in the Marketplace'),
    o.accounts.length ? h('table', { class: 'tbl' }, h('thead', null, h('tr', null, ['Firm', 'Credit', 'Practice areas', 'States'].map((t) => h('th', null, t)))),
      h('tbody', null, o.accounts.map((a) => h('tr', null, h('td', null, h('a', { href: `/${a.slug}`, target: '_blank', rel: 'noopener' }, a.name)), h('td', null, money(a.balanceCents)), h('td', null, a.practiceAreas.map((k) => o.areas[k]).join(', ')), h('td', null, a.states.join(', ')))))) : note('muted', 'No firm has opened the Marketplace yet.'));

  root.append(h('h1', null, 'Marketplace'), msg, switchCard, numbers, h('div', { class: 'card' }, h('h2', null, `Waiting for your review (${o.counts.held})`), heldBox), h('div', { class: 'card' }, h('h2', null, 'Bad-inquiry reports'), h('p', { class: 'muted' }, 'Refund only for something clearly junk: a disconnected number, spam or a fake. Never because the person did not hire the firm.'), reportBox), settings, tools, accounts);
  return root;
}
