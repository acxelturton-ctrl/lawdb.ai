// LawDB Connect in the firm dashboard: Overview, Find lawyers, Connections, My profile. Featured firms (paid or the free month) use it;
// a Basic firm sees a preview made of clearly marked sample firms. All text from the server is inserted as text nodes, never as HTML.
import { h, api, note, STATES, CASE_LABELS, lockIcon } from '/admin/ui.js';
import { SAMPLE_FIRMS, SAMPLE_TILES } from '/account/network-sample.js';

const TABS = [['overview', 'Overview'], ['find', 'Find lawyers'], ['connections', 'Connections'], ['profile', 'My network profile']];
const date = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString([], { dateStyle: 'medium' }) : '');
const initials = (n) => { const w = String(n || '?').split(/\W+/).filter(Boolean); return ((w[0] || '?')[0] + (w[1] ? w[1][0] : '')).toUpperCase(); };
const caseLabel = (id) => CASE_LABELS[id] || id;
const KINDS = { referral: 'Client referrals', cocounsel: 'Co-counsel', local: 'Local representation', specialist: 'Specialist consultation', collab: 'Professional collaboration' };
const FIRM_TYPES = { solo: 'Solo practitioner', boutique: 'Boutique firm', midsize: 'Mid-size firm', large: 'Large firm' };
const REASONS = { 'not-a-lawyer': 'Not a practising lawyer', spam: 'Spam or solicitation', confidential: 'Shared confidential client information', fees: 'Asked about fee-sharing or referral fees', other: 'Something else' };
const check = () => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', '13'); s.setAttribute('height', '13'); s.setAttribute('aria-hidden', 'true'); const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', 'M5 12.5l4.5 4.5L19 7.5'); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '3'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round'); s.appendChild(p); return s; };

// ---------------------------------------------------------------- one firm, as the network shows it
function firmCard(f, { me, onConnect, onRespond, onMenu } = {}) {
  const r = f.reported || {};
  const logo = h('span', { class: 'pn-logo' }, f.logo ? h('img', { src: f.logo, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onerror: (e) => e.target.remove() }) : null, initials(f.name));
  const verified = f.verified
    ? h('span', { class: 'pn-badge ver', title: 'LawDB checked this firm’s lawyer against the state bar directory and the office details' }, check(), ` Verified by LawDB · ${date(f.verified.at)}`)
    : null;
  const accepting = r.accepting
    ? h('span', { class: 'pn-badge ' + (r.accepting.value ? 'yes' : 'no'), title: 'The firm told us this' }, r.accepting.value ? 'Accepting referrals' : 'Not accepting referrals right now', r.accepting.at ? ` · updated ${date(r.accepting.at)}` : '')
    : null;
  const meta = [r.firmType && FIRM_TYPES[r.firmType], r.years != null && `${r.years} years in practice`, (r.languages || []).length && `Languages: ${r.languages.join(', ')}`].filter(Boolean);
  const link = f.link;
  const actions = h('div', { class: 'pn-actions' });
  if (f.preview) { /* the firm's own preview: no buttons */ }
  else if (f.sample) actions.append(h('button', { type: 'button', disabled: true, class: 'primary' }, 'Connect'));
  else if (link && link.status === 'accepted') actions.append(h('span', { class: 'pn-state ok' }, 'Connected'));
  else if (link && link.status === 'pending' && link.direction === 'out') actions.append(h('span', { class: 'pn-state' }, 'Request sent'));
  else if (link && link.status === 'pending') actions.append(h('button', { type: 'button', class: 'primary', onclick: () => onRespond && onRespond(link.id, 'accept') }, 'Accept request'), h('button', { type: 'button', onclick: () => onRespond && onRespond(link.id, 'decline') }, 'Decline'));
  else if (onConnect) actions.append(h('button', { type: 'button', class: 'primary', onclick: () => onConnect(f) }, 'Connect'));
  if (!f.sample && !f.preview) actions.append(h('a', { class: 'pn-link', href: `/${encodeURIComponent(f.slug)}`, target: '_blank', rel: 'noopener' }, 'Public profile ↗'));
  if (onMenu && !f.sample && !f.preview) actions.append(h('button', { type: 'button', class: 'pn-more', 'aria-label': `More about ${f.name}`, onclick: () => onMenu(f) }, '⋯'));
  return h('article', { class: 'pn-card' + (f.sample ? ' sample' : ''), 'data-slug': f.slug },
    f.sample ? h('span', { class: 'pn-ribbon' }, 'Sample') : null,
    h('div', { class: 'pn-top' }, logo, h('div', { class: 'pn-id' }, h('h3', null, f.name), h('p', { class: 'muted' }, `${f.city}, ${STATES[f.state] || f.state}`)),
    ),
    h('div', { class: 'pn-badges' }, verified, accepting),
    f.practice && f.practice.length ? h('div', { class: 'pn-chips', 'aria-label': 'Practice areas, from the firm’s public profile' }, f.practice.map((id) => h('span', null, caseLabel(id)))) : null,
    r.headline ? h('p', { class: 'pn-headline' }, `“${r.headline}”`) : null,
    (r.openTo || []).length ? h('p', { class: 'pn-open' }, h('b', null, 'Open to: '), r.openTo.map((k) => KINDS[k]).join(' · ')) : null,
    meta.length ? h('p', { class: 'muted pn-meta' }, meta.join(' · ')) : null,
    f.why && f.why.length ? h('ul', { class: 'pn-why', 'aria-label': 'Why this matches' }, f.why.map((w) => h('li', null, w))) : null,
    h('p', { class: 'pn-src' }, f.verified ? 'Verified information is from LawDB’s check; the rest is reported by the firm.' : 'Reported by the firm. Not yet verified by LawDB.'),
    f.preview ? null : actions, h('div', { class: 'pn-slot' }));
}

// ---------------------------------------------------------------- the preview a Basic firm sees
function preview({ data, slug, onStart }) {
  const plan = data.plan;
  const cta = [];
  if (plan.trialAvailable) cta.push(h('button', { class: 'primary', type: 'button', onclick: (e) => onStart(e.currentTarget) }, `Start my free month (${plan.trialDays} days, no card)`));
  if (plan.upgradeUrl) cta.push(h('a', { href: plan.upgradeUrl }, h('button', { class: plan.trialAvailable ? '' : 'primary', type: 'button' }, `Subscribe, ${plan.price}`)));
  if (!cta.length) cta.push(h('p', { class: 'muted' }, plan.trial && plan.trial.status !== 'active' ? 'Your free month has ended. Subscribe from the Analytics tab to keep Featured.' : 'Featured can be started once your listing is live.'));
  return h('div', { class: 'pn' },
    h('h1', null, 'LawDB Connect'),
    h('div', { class: 'card pn-lock' },
      h('div', { class: 'row spread' }, h('h2', null, 'Meet and connect with other law firms'), h('span', { class: 'ed-pill big' }, lockIcon(), 'Featured')),
      h('p', null, 'A members-only directory where Featured firms find lawyers in other cities and states for referrals, co-counsel and local representation, and connect with them. Included in Featured, ', h('b', null, plan.price), ', with a free first month.'),
      h('ul', { class: 'pn-list' }, ['Search other firms by practice area, state, city, language and more', 'Ask in plain language: “immigration lawyer in Houston who accepts referrals”', 'See what is verified by LawDB, kept apart from what a firm says about itself', 'Send and answer connection requests; share contact details only when both agree']
        .map((t) => h('li', null, t))),
      h('div', { class: 'row' }, cta),
      h('p', { class: 'muted' }, `Right now ${data.members} ${data.members === 1 ? 'firm is' : 'firms are'} in the network. Membership does not guarantee referrals, introductions or any business result.`)),
    h('div', { class: 'pn-sample' }, h('div', { class: 'row spread' }, h('h2', null, 'What it looks like'), h('span', { class: 'pn-badge' }, 'Sample data, not real firms')),
      h('div', { class: 'lx-tiles' }, SAMPLE_TILES.map(([n, l]) => h('div', { class: 'lx-tile' }, h('b', null, n), h('span', null, l)))),
      h('div', { class: 'pn-grid' }, SAMPLE_FIRMS.map((f) => firmCard(f)))));
}

// ---------------------------------------------------------------- the live view
export async function viewPro({ mine, slug, tab = 'overview', onPlanChange }) {
  if (!mine.length) {
    return h('div', { class: 'pn' }, h('h1', null, 'LawDB Connect'), h('div', { class: 'card pn-lock' },
      h('div', { class: 'row spread' }, h('h2', null, 'Meet and connect with other law firms'), h('span', { class: 'ed-pill big' }, lockIcon(), 'Featured')),
      h('p', null, 'LawDB Connect is where Featured firms find lawyers in other places for referrals and co-counsel. Claim your firm to get started. It is free for your first month.'),
      h('a', { href: '#find' }, h('button', { class: 'primary', type: 'button' }, 'Find or add my firm'))),
      h('div', { class: 'pn-sample' }, h('div', { class: 'row spread' }, h('h2', null, 'What it looks like'), h('span', { class: 'pn-badge' }, 'Sample data, not real firms')), h('div', { class: 'pn-grid' }, SAMPLE_FIRMS.slice(0, 2).map((f) => firmCard(f)))));
  }
  if (!slug) {
    if (mine.length === 1) { location.replace(`#pro/${mine[0].slug}`); return h('p', { class: 'muted' }, 'Loading…'); }
    return h('div', { class: 'pn' }, h('h1', null, 'LawDB Connect'), h('p', { class: 'muted' }, 'Choose a firm.'), mine.map((m) => h('a', { class: 'firm-row', href: `#pro/${m.slug}` }, h('span', null, m.name, h('small', null, `${m.city}, ${STATES[m.state] || m.state}`)), h('span', { class: 'badge' + (m.featured ? ' featured' : '') }, m.featured ? 'Featured' : 'Basic'))));
  }
  if (!mine.some((m) => m.slug === slug)) return note('msg-err', 'You do not manage this firm.');
  const base = `/api/account/firms/${encodeURIComponent(slug)}`;
  const root = h('div', { class: 'pn' });
  let data = await api('GET', `${base}/network`);
  let current = TABS.some(([id]) => id === tab) ? tab : 'overview';
  let facets = null;
  const find = { filters: {}, ask: '', understood: null, results: null, total: 0, offset: 0, busy: false, error: '' };

  async function reload(msg) { data = await api('GET', `${base}/network`); draw(msg); }
  const fail = (err, where) => (where || root).prepend(note('msg-err', err.message));
  const startTrial = async (btn) => { btn.disabled = true; try { await api('POST', `${base}/trial`); if (onPlanChange) await onPlanChange(); await reload(); } catch (err) { btn.disabled = false; btn.after(note('msg-err', err.message)); } };

  function draw(flash) {
    if (data.locked) return root.replaceChildren(preview({ data, slug, onStart: startTrial }));
    const incoming = data.incoming.length;
    root.replaceChildren(...[
      h('div', { class: 'row spread pn-head' }, h('h1', null, 'LawDB Connect'), mine.length > 1 ? h('a', { href: '#pro' }, '← All my firms') : null),
      flash ? note('msg-ok', flash) : null,
      h('nav', { class: 'pn-tabs', 'aria-label': 'LawDB Connect sections' }, TABS.map(([id, label]) => h('button', { type: 'button', 'aria-current': id === current ? 'page' : false, onclick: () => go(id) }, label, id === 'connections' && incoming ? h('span', { class: 'lx-count', 'aria-label': `${incoming} waiting` }, incoming) : null))),
      current === 'find' ? findPanel() : current === 'connections' ? connectionsPanel() : current === 'profile' ? profilePanel() : overviewPanel()].filter(Boolean));
  }
  function go(id) { current = id; try { history.replaceState(null, '', `#pro/${slug}/${id}`); } catch (e) {} draw(); window.scrollTo({ top: 0 }); }

  // ---- shared actions
  async function respond(id, action) {
    try { await api('PATCH', `${base}/network/connections/${id}`, { action }); await reload(action === 'accept' ? 'Connected. You can now see their contact person under Connections.' : action === 'decline' ? 'Declined. Nothing was shared.' : action === 'withdraw' ? 'Request withdrawn.' : 'Connection ended.'); if (current === 'find') await runSearch(false); }
    catch (err) { fail(err); }
  }
  function connectBox(f, card) {
    const slot = card.querySelector('.pn-slot');
    if (slot.firstChild) return slot.replaceChildren();
    const ta = h('textarea', { maxlength: '300', rows: '3', placeholder: 'A short note: who you are and why you would like to connect. Please include no client information.', 'aria-label': `Note to ${f.name}` });
    const count = h('span', { class: 'muted' }, '0 / 300');
    ta.addEventListener('input', () => { count.textContent = `${ta.value.length} / 300`; });
    const send = h('button', { class: 'primary', type: 'button', onclick: async () => { send.disabled = true; try { await api('POST', `${base}/network/connections`, { to: f.slug, message: ta.value }); await reload(`Request sent to ${f.name}. They will get an email.`); if (current === 'find') await runSearch(false); } catch (err) { send.disabled = false; slot.append(note('msg-err', err.message)); } } }, 'Send request');
    slot.replaceChildren(h('div', { class: 'pn-box' }, h('label', null, `Connect with ${f.name}`), ta, h('div', { class: 'row spread' }, count, h('span', { class: 'row' }, h('button', { type: 'button', onclick: () => slot.replaceChildren() }, 'Cancel'), send)),
      h('p', { class: 'muted' }, 'If they accept, your name and email are shared with their contact person, and theirs with you.')));
    ta.focus();
  }
  function menuBox(f, card) {
    const slot = card.querySelector('.pn-slot');
    if (slot.firstChild) return slot.replaceChildren();
    slot.replaceChildren(h('div', { class: 'pn-box' },
      h('div', { class: 'row' },
        h('button', { type: 'button', onclick: async () => { if (!confirm(`Block ${f.name}? You will no longer see each other in the network, and any connection ends.`)) return; try { await api('POST', `${base}/network/blocks`, { slug: f.slug }); await reload(`${f.name} is blocked.`); if (current === 'find') await runSearch(false); } catch (err) { fail(err); } } }, 'Block this firm'),
        h('button', { type: 'button', onclick: () => reportBox(f, slot) }, 'Report this firm'),
        h('button', { type: 'button', onclick: () => slot.replaceChildren() }, 'Close'))));
  }
  function reportBox(f, slot) {
    const sel = h('select', { 'aria-label': 'Reason' }, h('option', { value: '' }, 'Choose a reason…'), Object.entries(REASONS).map(([k, v]) => h('option', { value: k }, v)));
    const ta = h('textarea', { maxlength: '500', rows: '3', placeholder: 'Anything that helps us look into it (optional). Please include no client information.', 'aria-label': 'Details' });
    const out = h('div');
    slot.replaceChildren(h('div', { class: 'pn-box' }, h('label', null, `Report ${f.name} to LawDB`), sel, ta, out,
      h('div', { class: 'row' }, h('button', { type: 'button', onclick: () => slot.replaceChildren() }, 'Cancel'), h('button', { class: 'primary', type: 'button', onclick: async (e) => { e.currentTarget.disabled = true; try { await api('POST', `${base}/network/reports`, { slug: f.slug, reason: sel.value, detail: ta.value }); slot.replaceChildren(note('msg-ok', 'Thank you. LawDB will review your report.')); } catch (err) { e.currentTarget.disabled = false; out.replaceChildren(note('msg-err', err.message)); } } }, 'Send report'))));
  }
  const withCard = (fn) => (f) => fn(f, root.querySelector(`.pn-card[data-slug="${CSS.escape(f.slug)}"]`));
  const card = (f) => firmCard(f, { onConnect: withCard(connectBox), onRespond: respond, onMenu: withCard(menuBox) });

  // ---- overview
  function overviewPanel() {
    const p = data.profile;
    const tile = (n, l, hot) => h('div', { class: 'lx-tile' + (hot ? ' hot' : '') }, h('b', null, n), h('span', null, l));
    const cards = [];
    if (!p.visible) cards.push(h('div', { class: 'card pn-setup' }, h('h2', null, p.suspended ? 'Your firm was removed from the network' : 'Your firm is not listed yet'),
      h('p', null, p.suspended ? 'Please contact LawDB if you think this is a mistake.' : 'You can look around, but other firms cannot find you, and you cannot send requests, until you switch your firm on and accept the network rules. It takes a minute.'),
      p.suspended ? null : h('button', { class: 'primary', type: 'button', onclick: () => go('profile') }, 'Set up my network profile')));
    cards.push(h('div', { class: 'lx-tiles' }, tile(data.members, data.members === 1 ? 'Firm in the network' : 'Firms in the network'), tile(data.incoming.length, 'Waiting for your answer', data.incoming.length > 0), tile(data.connected.length, 'Connections'), tile(data.outgoing.length, 'Requests you sent')));
    if (data.incoming.length) cards.push(h('section', null, h('h2', null, 'Waiting for your answer'), data.incoming.map((i) => requestRow(i, true))));
    cards.push(h('section', null, h('div', { class: 'row spread' }, h('h2', null, 'Firms in the network'), h('button', { type: 'button', onclick: () => go('find') }, 'Find lawyers →')), h('div', { class: 'pn-grid', id: 'pnPreview' }, h('p', { class: 'muted' }, 'Loading…'))));
    cards.push(h('div', { class: 'card pn-next' }, h('h2', null, 'Coming next'), h('p', { class: 'muted' }, 'Referral opportunities you can post and answer, secure messaging between firms, and AI matching for referral requests. LawDB will tell you when they are ready. No fees or commissions are charged on referrals.')));
    queueMicrotask(loadPreview);
    return h('div', null, cards);
  }
  async function loadPreview() {
    const box = root.querySelector('#pnPreview'); if (!box) return;
    try {
      const r = await api('GET', `${base}/network/search`);
      box.replaceChildren(...(r.results.length ? r.results.slice(0, 4).map(card) : [empty(r.total)]));
    } catch (err) { box.replaceChildren(note('msg-err', err.message)); }
  }
  const empty = () => h('div', { class: 'card pn-empty' }, h('h3', null, 'You are among the first'), h('p', { class: 'muted' }, 'No other firms have joined yet. The network grows as Featured firms switch themselves on. Invite a colleague at another firm: they can list their firm for free and start the free month.'),
    h('div', { class: 'row' }, h('button', { type: 'button', onclick: async (e) => { try { await navigator.clipboard.writeText(`${location.origin}/add-your-firm`); e.currentTarget.textContent = 'Link copied'; } catch (er) { prompt('Copy this link', `${location.origin}/add-your-firm`); } } }, 'Copy invite link')));

  function requestRow(i, incoming) {
    const f = i.firm;
    return h('div', { class: 'pn-req' }, h('div', null, h('b', null, f.name), h('small', { class: 'muted' }, ` ${f.city}, ${f.state} · ${date(i.at)}`),
      i.message ? h('p', { class: 'pn-note' }, `“${i.message}”`) : null,
      f.verified ? h('span', { class: 'pn-badge ver' }, check(), ' Verified by LawDB') : h('span', { class: 'pn-badge' }, 'Not yet verified'),
      h('a', { class: 'pn-link', href: `/${encodeURIComponent(f.slug)}`, target: '_blank', rel: 'noopener' }, 'Public profile ↗')),
      h('div', { class: 'row' }, incoming
        ? [h('button', { class: 'primary', type: 'button', onclick: () => respond(i.id, 'accept') }, 'Accept'), h('button', { type: 'button', onclick: () => respond(i.id, 'decline') }, 'Decline')]
        : h('button', { type: 'button', onclick: () => respond(i.id, 'withdraw') }, 'Withdraw')));
  }

  // ---- find lawyers
  const sel = (label, key, options, value) => h('label', { class: 'pn-f' }, label, h('select', { onchange: (e) => { find.filters[key] = e.target.value; if (key === 'state') find.filters.city = ''; runSearch(true); if (key === 'state') drawFilters(); } }, h('option', { value: '' }, 'Any'), options.map(([v, t]) => h('option', { value: v, selected: v === value }, t))));
  function filterBar() {
    const st = (facets || []).map((s) => [s.code, `${s.name} (${s.n})`]);
    const cities = ((facets || []).find((s) => s.code === find.filters.state) || { cities: [] }).cities.map((c) => [c.city, `${c.city} (${c.n})`]);
    const langs = ['Spanish', 'French', 'Portuguese', 'Mandarin', 'Arabic', 'Russian', 'Hebrew', 'Haitian Creole'].map((l) => [l, l]);
    const chk = (label, key) => h('label', { class: 'pn-chk' }, h('input', { type: 'checkbox', checked: !!find.filters[key], onchange: (e) => { find.filters[key] = e.target.checked; runSearch(true); } }), label);
    return h('div', { class: 'pn-filters', id: 'pnFilters' },
      sel('Practice area', 'caseType', Object.entries(CASE_LABELS).filter(([k]) => ['family', 'criminal', 'injury', 'immigration', 'wills', 'business', 'employment', 'realestate', 'litigation', 'traffic'].includes(k)), find.filters.caseType),
      sel('State', 'state', st, find.filters.state), sel('City', 'city', cities, find.filters.city),
      sel('Open to', 'openTo', Object.entries(KINDS), find.filters.openTo), sel('Language', 'language', langs, find.filters.language), sel('Kind of firm', 'firmType', Object.entries(FIRM_TYPES), find.filters.firmType),
      h('div', { class: 'pn-checks' }, chk('Said they accept referrals', 'accepting'), chk('Verified by LawDB only', 'verified'), h('button', { type: 'button', class: 'pn-clear', onclick: () => { find.filters = {}; find.understood = null; find.ask = ''; runSearch(true); drawFilters(); root.querySelector('#pnAsk').value = ''; } }, 'Clear filters')));
  }
  const drawFilters = () => { const old = root.querySelector('#pnFilters'); if (old) old.replaceWith(filterBar()); };
  function findPanel() {
    if (!facets) queueMicrotask(async () => { try { facets = (await api('GET', `${base}/network/facets`)).states; drawFilters(); } catch (err) { fail(err); } });
    if (!find.results) queueMicrotask(() => runSearch(true));
    const input = h('input', { type: 'search', id: 'pnAsk', value: find.ask, maxlength: '400', placeholder: 'e.g. I’m looking for an immigration lawyer in Houston who accepts referrals and speaks Spanish', 'aria-label': 'Describe the lawyer you are looking for', onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); askAI(input.value); } } });
    return h('div', null,
      h('div', { class: 'card pn-ask' }, h('label', { for: 'pnAsk' }, 'Search the network in your own words'),
        h('div', { class: 'row nowrap' }, input, h('button', { class: 'primary', type: 'button', onclick: () => askAI(input.value) }, 'Search network')),
        h('p', { class: 'muted' }, 'AI turns your sentence into the filters below. It only searches; it never judges a lawyer. Every result shows why it matched.'), h('div', { id: 'pnUnderstood', 'aria-live': 'polite' })),
      filterBar(), h('div', { id: 'pnResults', 'aria-live': 'polite' }, find.results ? resultsView() : h('p', { class: 'muted' }, 'Loading…')));
  }
  function understood(f) {
    const bits = [];
    if (f.caseType) bits.push(['Practice area', caseLabel(f.caseType)]); if (f.state) bits.push(['State', STATES[f.state] || f.state]); if (f.city) bits.push(['City', f.city]);
    if (f.openTo) bits.push(['Open to', KINDS[f.openTo]]); if (f.language) bits.push(['Language', f.language]); if (f.firmType) bits.push(['Kind of firm', FIRM_TYPES[f.firmType]]);
    if (f.accepting) bits.push(['', 'Accepts referrals']); if (f.verified) bits.push(['', 'Verified only']);
    return bits.length ? h('p', { class: 'pn-understood' }, h('b', null, 'I searched for: '), bits.map(([k, v]) => h('span', { class: 'pn-pill' }, k ? `${k}: ${v}` : v))) : h('p', { class: 'pn-understood muted' }, 'I could not pick out any filters. Try naming a practice area or a place, or use the filters below.');
  }
  function resultsView() {
    const rs = find.results;
    if (find.error) return note('msg-err', find.error);
    if (!rs.length) return h('div', { class: 'card pn-empty' }, h('h3', null, find.total === 0 && !Object.values(find.filters).some(Boolean) ? 'No other firms are in the network yet' : 'No firms match'), h('p', { class: 'muted' }, Object.values(find.filters).some(Boolean) ? 'Try removing a filter. Firms appear here only when they are Featured and have switched themselves on.' : 'The network grows as Featured firms join. Invite a colleague at another firm.'));
    return h('div', null, h('p', { class: 'muted pn-count' }, `${find.total} ${find.total === 1 ? 'firm' : 'firms'}`), h('div', { class: 'pn-grid' }, rs.map(card)),
      rs.length < find.total ? h('div', { class: 'row pn-more-row' }, h('button', { type: 'button', onclick: () => runSearch(false, true) }, 'Show more')) : null);
  }
  async function runSearch(fresh, more) {
    const box = () => root.querySelector('#pnResults');
    if (fresh) { find.offset = 0; find.results = null; }
    if (more) find.offset = find.results.length;
    const qs = new URLSearchParams(Object.entries(find.filters).filter(([, v]) => v !== '' && v !== false && v != null).map(([k, v]) => [k, v === true ? '1' : v]));
    if (find.offset) qs.set('offset', find.offset);
    try {
      const r = await api('GET', `${base}/network/search?${qs}`);
      find.error = ''; find.total = r.total; find.results = more ? [...find.results, ...r.results] : r.results;
    } catch (err) { find.error = err.message; find.results = find.results || []; }
    if (box()) box().replaceChildren(resultsView());
  }
  async function askAI(text) {
    text = String(text || '').trim(); if (text.length < 3) return;
    find.ask = text; const out = root.querySelector('#pnUnderstood'); if (out) out.replaceChildren(h('p', { class: 'muted' }, 'Searching…'));
    try {
      const r = await api('POST', `${base}/network/ask`, { text });
      find.filters = Object.fromEntries(Object.entries(r.filters).filter(([k, v]) => k !== 'offset' && v !== '' && v !== false)); find.error = ''; find.total = r.total; find.results = r.results;
      drawFilters(); if (out) out.replaceChildren(understood(r.filters)); const b = root.querySelector('#pnResults'); if (b) b.replaceChildren(resultsView());
    } catch (err) { if (out) out.replaceChildren(note('msg-err', err.message)); }
  }

  // ---- connections
  function connectionsPanel() {
    const sec = (title, list, body, emptyText) => h('section', null, h('h2', null, title, list.length ? h('span', { class: 'pn-n' }, list.length) : null), list.length ? list.map(body) : h('p', { class: 'muted' }, emptyText));
    const conn = (i) => {
      const f = i.firm, c = i.contact;
      return h('div', { class: 'pn-req' }, h('div', null, h('b', null, f.name), h('small', { class: 'muted' }, ` ${f.city}, ${f.state} · connected ${date(i.since)}`),
        c ? h('p', { class: 'pn-contact' }, h('b', null, 'Contact: '), c.name ? `${c.name}, ` : '', h('a', { href: `mailto:${c.email}` }, c.email)) : h('p', { class: 'muted' }, 'Their contact person is no longer available.'),
        h('p', { class: 'muted' }, [f.phone && `Firm phone: ${f.phone}`, f.website && f.website.replace(/^https?:\/\//, '')].filter(Boolean).join(' · ')),
        !f.active ? h('p', { class: 'muted' }, 'This firm is not listed in the network at the moment.') : null,
        h('a', { class: 'pn-link', href: `/${encodeURIComponent(f.slug)}`, target: '_blank', rel: 'noopener' }, 'Public profile ↗')),
        h('div', { class: 'row' }, h('button', { type: 'button', onclick: () => confirm(`End your connection with ${f.name}?`) && respond(i.id, 'remove') }, 'End connection')));
    };
    return h('div', null,
      sec('Waiting for your answer', data.incoming, (i) => requestRow(i, true), 'No requests waiting.'),
      sec('Connected', data.connected, conn, 'No connections yet. Use Find lawyers to ask a firm to connect.'),
      sec('Requests you sent', data.outgoing, (i) => requestRow(i, false), 'No requests waiting for an answer.'),
      data.blocked.length ? h('section', null, h('h2', null, 'Blocked firms'), data.blocked.map((b) => h('div', { class: 'pn-req' }, h('div', null, h('b', null, b.name), h('small', { class: 'muted' }, ` ${b.city}, ${b.state}`)),
        h('button', { type: 'button', onclick: async () => { try { await api('DELETE', `${base}/network/blocks/${encodeURIComponent(b.slug)}`); await reload('Unblocked.'); } catch (err) { fail(err); } } }, 'Unblock')))) : null);
  }

  // ---- my network profile
  function profilePanel() {
    const p = data.profile;
    const form = h('form', { class: 'card pn-form', onsubmit: (e) => e.preventDefault() });
    const agree = p.agreed ? null : h('input', { type: 'checkbox', id: 'pnAgree', required: true });
    const vis = h('input', { type: 'checkbox', id: 'pnVisible', checked: p.visible, disabled: p.suspended });
    const acc = (v, label) => h('label', { class: 'pn-chk' }, h('input', { type: 'radio', name: 'acc', value: v, checked: String(p.accepting) === v || (v === 'null' && p.accepting === null) }), label);
    const open = Object.entries(KINDS).map(([k, t]) => h('label', { class: 'pn-chk' }, h('input', { type: 'checkbox', name: 'open', value: k, checked: p.openTo.includes(k) }), t));
    const head = h('textarea', { maxlength: '200', rows: '2', id: 'pnHeadline', placeholder: 'One sentence about the work you do and the connections you would welcome. No client information.' }, p.headline);
    const hc = h('span', { class: 'muted' }, `${p.headline.length} / 200`); head.addEventListener('input', () => { hc.textContent = `${head.value.length} / 200`; });
    const type = h('select', { id: 'pnType' }, h('option', { value: '' }, 'Not set'), Object.entries(FIRM_TYPES).map(([k, t]) => h('option', { value: k, selected: p.firmType === k }, t)));
    const years = h('input', { type: 'number', id: 'pnYears', min: '0', max: '70', value: p.years == null ? '' : String(p.years), 'aria-label': 'Years in practice' });
    const out = h('div');
    const save = h('button', { class: 'primary', type: 'submit' }, 'Save');
    form.append(...[
      p.suspended ? note('msg-err', 'This firm was removed from LawDB Connect. Please contact LawDB.') : null,
      !p.agreed ? h('div', { class: 'pn-rules' }, h('h2', null, 'The network rules'), h('ul', null, data.rules.map((r) => h('li', null, r))), h('label', { class: 'pn-chk' }, agree, 'I have read and agree to these rules.')) : h('p', { class: 'muted' }, `You accepted the network rules on ${date((p.agreedAt || '').slice(0, 10))}.`),
      h('h2', null, 'Listing'), h('label', { class: 'pn-chk' }, vis, 'List my firm in the members-only directory. Only Featured firms that have done this can see and be found by each other.'),
      h('h2', null, 'Accepting referrals?'), h('p', { class: 'muted' }, 'Shown to other members with the date you set it. If you leave it unset, nothing is shown.'), h('div', { class: 'row pn-radio' }, acc('null', 'Not set'), acc('true', 'Yes, accepting'), acc('false', 'Not right now')),
      h('h2', null, 'Open to'), h('div', { class: 'pn-checks' }, open),
      h('h2', null, 'About your firm in the network'), h('label', { for: 'pnHeadline' }, 'Headline'), head, h('div', { class: 'row spread' }, hc),
      h('div', { class: 'row' }, h('label', { for: 'pnType', class: 'pn-f' }, 'Kind of firm', type), h('label', { for: 'pnYears', class: 'pn-f' }, 'Years in practice (self-reported)', years)),
      out, h('div', { class: 'row' }, save)].filter(Boolean));
    form.addEventListener('submit', async () => {
      save.disabled = true; out.replaceChildren();
      const acv = form.querySelector('input[name=acc]:checked').value;
      const body = { visible: vis.checked, accepting: acv === 'null' ? null : acv === 'true', openTo: [...form.querySelectorAll('input[name=open]:checked')].map((i) => i.value), headline: head.value, firmType: type.value, years: years.value };
      if (agree && agree.checked) body.agree = true;
      try { await api('PATCH', `${base}/network`, body); await reload('Saved.'); }
      catch (err) { save.disabled = false; out.replaceChildren(note('msg-err', err.message)); }
    });
    const side = h('aside', { class: 'pn-side' }, h('h2', null, 'How other members see you'), h('p', { class: 'muted' }, 'A preview from your saved profile.'), h('div', { id: 'pnMe' }, h('p', { class: 'muted' }, 'Loading…')));
    if (data.self) { side.querySelector('#pnMe').replaceChildren(firmCard({ ...data.self, link: null, why: [], sample: true, preview: true })); side.querySelector('.pn-ribbon').textContent = 'Preview'; }
    return h('div', { class: 'pn-two' }, form, side);
  }

  draw();
  return root;
}
