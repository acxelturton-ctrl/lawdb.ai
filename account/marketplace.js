// LawDB Marketplace, firm side: set what you want, see blurred inquiries, unlock one with prepaid credit, and read what you unlocked.
// SECURITY: everything an inquiry contains is inserted as text nodes only (h() never uses innerHTML).
import { h, api, note, when } from '/admin/ui.js';

const money = (cents) => '$' + ((cents || 0) / 100).toFixed(2);
const ageText = (hours) => (hours < 1 ? 'just now' : hours < 48 ? `${hours} hour${hours === 1 ? '' : 's'} ago` : `${Math.floor(hours / 24)} days ago`);

export async function viewMarketplace({ mine, slug }) {
  if (!mine.length) return h('div', null, h('h1', null, 'Marketplace'), h('div', { class: 'card' }, h('p', null, 'Claim your firm first. The Marketplace opens to verified firms.'), h('a', { href: '#find' }, h('button', { class: 'primary', type: 'button' }, 'Find or add my firm'))));
  if (!slug) {
    if (mine.length === 1) { location.replace(`#marketplace/${mine[0].slug}`); return h('p', { class: 'muted' }, 'Loading…'); }
    return h('div', null, h('h1', null, 'Marketplace'), mine.map((m) => h('a', { class: 'firm-row', href: `#marketplace/${m.slug}` }, h('span', null, m.name))));
  }
  if (!mine.some((m) => m.slug === slug)) return note('msg-err', 'You do not manage this firm.');
  const base = `/api/account/firms/${encodeURIComponent(slug)}/marketplace`;
  const info = await api('GET', base);
  const root = h('div', null);
  const msg = h('div', null);
  const balanceEl = h('b', null, '');
  let state = info;

  if (!info.access.verified) {
    root.append(h('h1', null, 'Marketplace'), h('div', { class: 'card' }, h('p', null, info.message), h('a', { href: `#edit/${slug}` }, h('button', { class: 'primary', type: 'button' }, 'Open my profile to ask for verification'))));
    return root;
  }
  const setBalance = (c) => { state.account.balanceCents = c; balanceEl.textContent = money(c); };
  setBalance(info.account.balanceCents);

  // ---- credit
  const topups = info.topups.length
    ? h('div', { class: 'row' }, info.topups.map((t) => h('a', { href: t.url, target: '_blank', rel: 'noopener' }, h('button', { type: 'button', class: 'primary' }, `Add $${t.dollars}`))), h('span', { class: 'muted' }, 'You pay on Stripe, then your balance updates within a minute.'))
    : h('p', { class: 'muted' }, 'Adding credit by card opens soon. If you need credit now, write to info@lawdb.ai.');
  root.append(h('h1', null, 'Marketplace'),
    !info.open && note('muted', 'The Marketplace is not open to the public yet, so no real inquiries appear. A sample inquiry may show so you can try it out.'),
    h('div', { class: 'card' }, h('div', { class: 'row spread' }, h('span', null, 'Your credit: ', balanceEl), info.access.featured ? h('span', { class: 'badge featured' }, 'Featured: first look at new inquiries') : h('span', { class: 'badge' }, 'New inquiries reach you a little after Featured firms')), topups,
      h('p', { class: 'muted' }, `Unlocking an inquiry is a flat advertising fee, shown before you pay. It is the same whether or not the person hires you. Inquiries cost full price for ${info.decay.fullHours} hours, then ${Math.round((1 - info.decay.discount) * 100)}% less until day ${info.decay.expireDays}, then they expire.`)),
    msg);

  // ---- what you want to see
  const areaBoxes = Object.entries(info.areas).map(([k, label]) => { const cb = h('input', { type: 'checkbox', value: k }); cb.checked = state.account.practiceAreas.includes(k); return { k, cb, el: h('label', { class: 'check' }, cb, ' ', label) }; });
  const stateSel = h('select', { multiple: true, size: 8, 'aria-label': 'States' }, Object.entries(info.states).map(([c, n]) => { const o = h('option', { value: c }, n); o.selected = state.account.states.includes(c); return o; }));
  const cityIn = h('input', { type: 'text', maxlength: 400, placeholder: 'Optional: Miami, Tampa', value: state.account.cities.join(', ') });
  const alertSel = h('select', null, [['instant', 'Email me right away'], ['daily', 'One daily summary'], ['off', 'No emails']].map(([v, t]) => { const o = h('option', { value: v }, t); o.selected = state.account.alerts === v; return o; }));
  const saveMsg = h('span', { class: 'muted' });
  const prefs = h('div', { class: 'card' }, h('h2', null, 'What you want to see'),
    h('p', { class: 'muted' }, 'You see inquiries in your practice areas and states. You can always widen the list to browse everything.'),
    h('b', null, 'Practice areas'), h('div', { class: 'checks' }, areaBoxes.map((a) => a.el)),
    h('b', null, 'States you are licensed in'), stateSel, h('p', { class: 'muted' }, 'Hold Ctrl (or Cmd) to choose several.'),
    h('b', null, 'Cities'), cityIn, h('b', null, 'Email alerts'), alertSel,
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'primary', onclick: async (e) => {
      e.currentTarget.disabled = true; saveMsg.textContent = 'Saving…';
      try {
        const r = await api('PUT', base, { practiceAreas: areaBoxes.filter((a) => a.cb.checked).map((a) => a.k), states: [...stateSel.selectedOptions].map((o) => o.value), cities: cityIn.value.split(',').map((c) => c.trim()).filter(Boolean), alerts: alertSel.value });
        state.account = { ...r.account }; saveMsg.textContent = 'Saved.'; await loadFeed();
      } catch (err) { saveMsg.textContent = err.message; }
      e.currentTarget.disabled = false;
    } }, 'Save'), saveMsg));
  root.append(prefs);

  // ---- the feed
  const feedBox = h('div', null);
  const cityFilter = h('input', { type: 'text', maxlength: 60, placeholder: 'City (optional)', 'aria-label': 'City filter' });
  const allBox = h('input', { type: 'checkbox' });
  const feedHead = h('div', { class: 'row' }, h('label', { class: 'check' }, allBox, ' Show everything, not only my areas'), cityFilter, h('button', { type: 'button', onclick: () => loadFeed() }, 'Refresh'));
  root.append(h('div', { class: 'card' }, h('h2', null, 'Inquiries waiting'), feedHead, feedBox));

  function leadCard(l) {
    const out = h('div', null);
    const btn = h('button', { type: 'button', class: 'primary' }, `Unlock for ${money(l.priceCents)}`);
    btn.addEventListener('click', async () => {
      if (!confirm(`Unlock this inquiry for ${money(l.priceCents)}? The amount is taken from your credit and the person's contact details are shown to you only.`)) return;
      btn.disabled = true; out.replaceChildren();
      try {
        const r = await api('POST', `${base}/leads/${l.id}/unlock`);
        setBalance(state.account.balanceCents - r.paidCents);
        card.replaceChildren(h('b', null, `${r.lead.practiceLabel}: ${r.lead.city}, ${r.lead.state}`), note('msg-ok', `Unlocked for ${money(r.paidCents)}. These details are yours.`), detailsView(r.lead));
      } catch (err) { btn.disabled = false; out.append(note('msg-err', err.message)); if (err.status === 409) setTimeout(loadFeed, 1500); }
    });
    const card = h('div', { class: 'card' },
      h('div', { class: 'row spread' }, h('b', null, `${l.practiceLabel}: ${l.city}, ${l.state}`), l.test && h('span', { class: 'badge new' }, 'Sample inquiry'), l.early && h('span', { class: 'badge featured' }, 'Early look')),
      h('p', null, l.summary), h('p', { class: 'muted' }, `${l.urgencyLabel} · ${ageText(l.ageHours)}`),
      h('div', { class: 'row' }, btn, h('span', { class: 'muted' }, 'Name, email and phone are shown after you unlock.')), out);
    return card;
  }
  async function loadFeed() {
    feedBox.replaceChildren(h('p', { class: 'muted' }, 'Loading…'));
    try {
      const q = new URLSearchParams(); if (allBox.checked) q.set('all', '1'); if (cityFilter.value.trim()) q.set('city', cityFilter.value.trim());
      const r = await api('GET', `${base}/feed?${q}`);
      if (r.needsSetup) return feedBox.replaceChildren(note('muted', 'Choose at least one practice area and one state above, then save, to see the inquiries that fit your firm.'));
      feedBox.replaceChildren(...(r.leads.length ? r.leads.map(leadCard) : [note('muted', 'No open inquiries match right now. New ones appear here as they come in.')]));
    } catch (err) { feedBox.replaceChildren(note('msg-err', err.message)); }
  }

  // ---- what you unlocked, and the ledger
  const detailsView = (d) => h('div', { class: 'ml-details' },
    h('p', null, h('b', null, 'Name: '), d.name), h('p', null, h('b', null, 'Email: '), h('a', { href: `mailto:${d.email}` }, d.email)), d.phone && h('p', null, h('b', null, 'Phone: '), h('a', { href: `tel:${d.phone}` }, d.phone)),
    h('p', null, h('b', null, 'Their words: '), d.description));
  const history = h('div', { class: 'card' }, h('h2', null, 'Your history'));
  const histBody = h('div', null);
  history.append(h('div', { class: 'row' }, h('button', { type: 'button', onclick: () => showUnlocked() }, 'Unlocked inquiries'), h('button', { type: 'button', onclick: () => showLedger() }, 'Credit history')), histBody);
  root.append(history);
  async function showUnlocked() {
    try {
      const { leads } = await api('GET', `${base}/unlocked`);
      histBody.replaceChildren(...(leads.length ? leads.map((l) => h('div', { class: 'card' }, h('b', null, `${l.practiceLabel}: ${l.city}, ${l.state}`), h('p', { class: 'muted' }, `${l.urgency} · unlocked ${when(l.unlockedAt)} for ${money(l.paidCents)}`), detailsView(l))) : [note('muted', 'You have not unlocked any inquiries yet.')]));
    } catch (err) { histBody.replaceChildren(note('msg-err', err.message)); }
  }
  async function showLedger() {
    try {
      const { ledger } = await api('GET', `${base}/ledger`);
      const label = { topup: 'Top-up', unlock: 'Unlocked an inquiry', refund: 'Refund', promo: 'Credit from LawDB', adjust: 'Adjustment' };
      histBody.replaceChildren(ledger.length ? h('table', { class: 'tbl' }, h('thead', null, h('tr', null, ['When', 'What', 'Amount', 'Balance'].map((t) => h('th', null, t)))),
        h('tbody', null, ledger.map((r) => h('tr', null, h('td', null, when(r.at)), h('td', null, label[r.kind] || r.kind, r.note ? ` (${r.note})` : ''), h('td', null, (r.amountCents < 0 ? '-' : '+') + money(Math.abs(r.amountCents))), h('td', null, money(r.balanceAfter)))))) : note('muted', 'Nothing yet.'));
    } catch (err) { histBody.replaceChildren(note('msg-err', err.message)); }
  }

  allBox.addEventListener('change', loadFeed);
  cityFilter.addEventListener('change', loadFeed);
  await loadFeed();
  return root;
}
