/* LawDB AI on the home page: a small chat that reads what the visitor describes and shows matching firms (POST /api/ai/match).
   Everything the server sends is written with textContent, never as HTML. Nothing typed here is stored. */
(function () {
  var card = document.getElementById('aiCard');
  if (!card) return;
  card.classList.add('aic-on');
  var log = document.getElementById('aiLog'), form = document.getElementById('aiForm'), input = document.getElementById('aiInput'), send = form.querySelector('button');
  var S = { texts: [], ctx: {}, busy: false };
  var SUGGEST = ['I was rear-ended in Tampa', 'I need a divorce lawyer in Houston', 'My landlord won’t return my deposit', 'Charged with a DUI in Miami'];

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function scroll() { log.scrollTop = log.scrollHeight; }
  function bubble(text, who) { var b = el('div', 'aic-msg ' + (who === 'me' ? 'aic-me' : 'aic-bot'), text); log.appendChild(b); scroll(); return b; }
  function retire() { var old = log.querySelectorAll('.aic-chips:not(.used)'); for (var i = 0; i < old.length; i++) old[i].classList.add('used'); }
  function chips(list, extra) {
    var wrap = el('div', 'aic-chips');
    list.forEach(function (c) {
      var b = el('button', 'aic-chip' + (c.active ? ' on' : ''), c.label); b.type = 'button';
      b.addEventListener('click', function () { choose(c.label, c.pick, c.text); });
      wrap.appendChild(b);
    });
    if (extra) wrap.appendChild(extra);
    log.appendChild(wrap); scroll();
  }
  function typing(on) {
    var t = log.querySelector('.aic-typing-wrap');
    if (on && !t) { t = el('div', 'aic-msg aic-bot aic-typing-wrap'); var d = el('span', 'aic-typing'); d.appendChild(el('i')); d.appendChild(el('i')); d.appendChild(el('i')); t.appendChild(d); log.appendChild(t); scroll(); }
    if (!on && t) t.remove();
  }
  function logo(f) {
    var l = el('span', 'aic-logo');
    if (/^https:\/\//.test(f.logo || '')) { var i = new Image(); i.src = f.logo; i.alt = ''; i.referrerPolicy = 'no-referrer'; i.onerror = function () { i.remove(); l.textContent = initials(f.name); }; l.appendChild(i); }
    else l.textContent = initials(f.name);
    return l;
  }
  function initials(n) { var w = String(n || '').split(/\W+/).filter(Boolean); return ((w[0] || '?')[0] + (w[1] ? w[1][0] : '')).toUpperCase(); }
  function firms(list) {
    var wrap = el('div', 'aic-firms');
    list.forEach(function (f) {
      var c = el('article', 'aic-firm'), top = el('div', 'aic-firm-top'), body = el('div');
      var name = el('b', null, f.name); if (f.featured) name.appendChild(el('span', null, 'Featured')); body.appendChild(name);
      var meta = f.city + ', ' + f.state + (f.tags && f.tags.length ? ' · ' + f.tags.join(', ') : '') + (f.miles != null && f.miles > 0 ? ' · about ' + f.miles + ' mi' : '');
      body.appendChild(el('small', null, meta));
      if (f.languages && f.languages.length) body.appendChild(el('small', null, 'Languages: ' + f.languages.join(', ')));
      top.appendChild(logo(f)); top.appendChild(body); c.appendChild(top);
      if (f.blurb) c.appendChild(el('p', null, f.blurb));
      var btns = el('div', 'aic-btns');
      var v = el('a', 'go', 'View profile'); v.href = '/firms/' + encodeURIComponent(f.slug); btns.appendChild(v);
      if (f.phone) { var p = el('a', 'call', 'Call'); p.href = 'tel:' + f.phone; btns.appendChild(p); }
      var q = el('a', 'ask', 'Request consultation'); q.href = '/firms/' + encodeURIComponent(f.slug) + (S.ctx.summary ? '?ask=' + encodeURIComponent(S.ctx.summary) : '') + '#contact'; btns.appendChild(q);
      c.appendChild(btns); wrap.appendChild(c);
    });
    log.appendChild(wrap); scroll();
  }
  function locate() {
    if (!navigator.geolocation) { bubble('Your browser can’t share a location. Type your city instead.', 'bot'); return; }
    bubble('Use my location', 'me'); retire(); typing(true);
    navigator.geolocation.getCurrentPosition(function (p) { typing(false); post({ messages: [], context: S.ctx, pick: { lat: p.coords.latitude, lng: p.coords.longitude } }); },
      function () { typing(false); bubble('No problem. Type your city, or pick one of the cities above.', 'bot'); }, { timeout: 9000, maximumAge: 600000 });
  }
  function render(j) {
    S.ctx = j.ctx || S.ctx;
    if (j.safety) { var s = el('div', 'aic-safety', j.safety.text); s.setAttribute('role', 'alert'); log.appendChild(s); }
    if (j.reply) bubble(j.reply, 'bot');
    if (j.firms && j.firms.length) firms(j.firms);
    if (j.ask && j.ask.chips) {
      var extra = null;
      if (j.ask.locate) { extra = el('button', 'aic-chip loc', 'Use my location'); extra.type = 'button'; extra.addEventListener('click', locate); }
      chips(j.ask.chips, extra);
    }
  }
  function post(payload) {
    S.busy = true; send.disabled = true; typing(true);
    fetch('/api/ai/match', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) { typing(false); if (!x.ok) throw new Error((x.j && x.j.error) || 'error'); render(x.j); })
      .catch(function (e) {
        typing(false);
        bubble(/Too many/.test(e.message) ? e.message : 'I couldn’t reach the matcher just now. You can still search by case type and city.', 'bot');
        var a = el('a', 'aic-chip', 'Browse all lawyers'); a.href = '/find-lawyers'; var w = el('div', 'aic-chips'); w.appendChild(a); log.appendChild(w);
      })
      .then(function () { S.busy = false; send.disabled = false; });
  }
  function choose(label, pick, text) {
    if (S.busy) return;
    retire(); bubble(label, 'me');
    if (text) { S.texts.push({ role: 'user', content: text }); post({ messages: S.texts.slice(-6), context: S.ctx }); }
    else post({ messages: [], context: S.ctx, pick: pick });
  }
  function ask(text) {
    text = String(text || '').replace(/\s+/g, ' ').trim(); if (!text || S.busy) return;
    retire(); bubble(text, 'me'); S.texts.push({ role: 'user', content: text }); input.value = ''; grow();
    post({ messages: S.texts.slice(-6), context: S.ctx });
  }
  function grow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 110) + 'px'; }

  form.addEventListener('submit', function (e) { e.preventDefault(); ask(input.value); });
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); } });
  input.addEventListener('input', grow);

  bubble('Hi! Tell me what’s going on in your own words, and where you are. I’ll find law firms that handle it.', 'bot');
  chips(SUGGEST.map(function (t) { return { label: t, text: t }; }));
})();
