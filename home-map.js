/* Home page map: draws a pin with the firm's logo for each live firm on images/us-map.svg.
   Only firms whose logo loads are drawn. Data: GET /api/map -> {w, h, firms: [[slug, name, city, state, x, y, logo], ...]} with x/y already projected onto the drawing.
   Firms in the same city fan out in a spiral so every logo shows.  */
(function () {
  'use strict';
  var root = document.getElementById('hmMap');
  if (!root) return;
  var STATES = { FL: 'Florida', TX: 'Texas' };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  fetch('/api/map', { credentials: 'omit' }).then(function (r) { return r.ok ? r.json() : Promise.reject(); }).then(function (d) {
    var W = d.w, H = d.h, firms = d.firms || [];
    if (!firms.length) return;
    // Only firms whose logo really loads get a pin. Logos load a few at a time and each pin appears as its logo arrives;
    // a firm with no logo, or one that fails to load, is left off the map.
    var card = el('div', 'hm-card'); card.hidden = true;
    var ci = el('img'), tx = el('div'), cn = el('b'), cs = el('span'), cl = el('a', null, 'View profile \u2192');
    ci.alt = ''; ci.referrerPolicy = 'no-referrer'; tx.appendChild(cn); tx.appendChild(cs); tx.appendChild(cl);
    card.appendChild(ci); card.appendChild(tx);
    root.appendChild(card);
    var perCity = {}, by = {}, shown = 0, order = 0, cx = 0, cities = 0, queue = firms.filter(function (f) { return f[6] && !/white/i.test(f[6].split('?')[0]); }), active = 0, POOL = 12;
    var sub = document.getElementById('hmSub');
    function say() {
      var st = document.getElementById('hmStats'); if (!st || !shown) return;
      var items = [[shown.toLocaleString('en-US'), 'law firms'], [cities.toLocaleString('en-US'), 'cities'], [Object.keys(by).length, Object.keys(by).length === 1 ? 'state' : 'states']];
      st.textContent = '';
      items.forEach(function (it) { var d = el('div', 'hm-stat'); d.appendChild(el('b', null, String(it[0]))); d.appendChild(document.createTextNode(it[1])); st.appendChild(d); });
    }
    function place(f, im) {
      var k = f[3] + '|' + f[2], i = perCity[k] = (perCity[k] || 0) + 1, n = i - 1;
      var a = n * 2.4, r = n === 0 ? 0 : 10 * Math.sqrt(n);          // sunflower spiral around the city's point
      var x = f[4] + r * Math.cos(a), y = f[5] + r * Math.sin(a);
      if (n === 0) { var dt = el('span', 'hm-dot'); dt.style.left = (f[4] / W * 100).toFixed(2) + '%'; dt.style.top = (f[5] / H * 100).toFixed(2) + '%'; root.insertBefore(dt, root.firstChild.nextSibling); cities++; }
      var p = el('a', 'hm-pin'); p.style.animationDelay = Math.min(shown * 12, 900) + 'ms'; p.href = '/firms/' + f[0]; p.tabIndex = -1; p.setAttribute('aria-label', f[1] + ', ' + f[2] + ', ' + f[3]);
      p.style.left = (x / W * 100).toFixed(2) + '%'; p.style.top = (y / H * 100).toFixed(2) + '%'; p.style.zIndex = String(++order % 40);
      p.dataset.n = f[1]; p.dataset.c = f[2] + ', ' + f[3]; p.dataset.h = p.href; p.dataset.l = f[6];
      im.alt = ''; p.appendChild(im); root.insertBefore(p, card);
      by[f[3]] = (by[f[3]] || 0) + 1; shown++; cx += x;
    }
    function next() {
      if (!queue.length) { if (!active) { say(); if (!shown && sub) sub.textContent = 'Browse law firms by state and city.'; recenter(); } return; }
      var f = queue.shift(), im = new Image(), done = false;
      active++;
      function fin(ok) {
        if (done) return; done = true; active--;
        if (ok && im.naturalWidth >= 24 && im.naturalHeight >= 24) place(f, im);
        if (shown % 20 === 1) say();
        next();
      }
      im.referrerPolicy = 'no-referrer'; im.decoding = 'async';
      im.addEventListener('load', function () { fin(true); });
      im.addEventListener('error', function () { fin(false); });
      setTimeout(function () { fin(false); }, 12000);
      im.src = f[6];
    }
    [['Texas', 440, 470], ['Florida', 756, 505]].forEach(function (l) { var e = el('span', 'hm-lbl', l[0]); e.style.left = (l[1] / W * 100) + '%'; e.style.top = (l[2] / H * 100) + '%'; root.insertBefore(e, root.firstChild.nextSibling); });
    for (var j = 0; j < POOL; j++) next();

    function show(p) {
      var all = root.querySelectorAll('.hm-pin.on'); for (var i = 0; i < all.length; i++) all[i].classList.remove('on');
      p.classList.add('on'); ci.src = p.dataset.l; cn.textContent = p.dataset.n; cs.textContent = p.dataset.c; cl.href = p.dataset.h;
      card.style.left = p.style.left; card.style.top = p.style.top;
      card.classList.toggle('below', parseFloat(p.style.top) < 30);
      card.hidden = false;
    }
    root.addEventListener('click', function (e) { var p = e.target.closest && e.target.closest('.hm-pin'); if (p) { e.preventDefault(); show(p); } else if (!e.target.closest('.hm-card')) { card.hidden = true; } });
    root.addEventListener('mouseover', function (e) { var p = e.target.closest && e.target.closest('.hm-pin'); if (p && matchMedia('(hover:hover)').matches) show(p); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') card.hidden = true; });

    // On a phone the map is wider than the screen: start with the live states in the middle.
    function recenter() {
      var sc = document.getElementById('hmScroll');
      if (sc && shown && sc.scrollWidth > sc.clientWidth) sc.scrollLeft = Math.max(0, (cx / shown / W) * sc.scrollWidth - sc.clientWidth / 2);
    }
  }).catch(function () { var s = document.getElementById('hmSub'); if (s) s.textContent = 'Browse law firms by state and city.'; });
})();
