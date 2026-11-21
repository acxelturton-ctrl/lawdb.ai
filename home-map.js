/* Decorative US map on /find-lawyers: a ring of firm logos laid over images/us-map.svg. It is only a picture (nothing to click or hover).
   Data: GET /api/map -> {w, h, logos: [[cityKey, x, y, logoUrl], ...]}, x/y already projected onto the drawing, about 90 logos in all.
   Nothing is fetched until the map is about to scroll into view. A logo that fails to load is simply left out. */
(function () {
  'use strict';
  var root = document.getElementById('hmMap');
  if (!root) return;
  var started = false;

  function start() {
    if (started) return; started = true;
    fetch('/api/map', { credentials: 'omit' }).then(function (r) { return r.ok ? r.json() : Promise.reject(); }).then(function (d) {
      var W = d.w, H = d.h, queue = (d.logos || []).slice(), perCity = {}, order = 0, active = 0, POOL = 8;
      function place(l, im) {
        var n = perCity[l[0]] = (perCity[l[0]] || 0) + 1; n -= 1;
        var a = n * 2.4, r = n === 0 ? 0 : 10 * Math.sqrt(n);          // sunflower spiral around the city's point
        var p = document.createElement('span'); p.className = 'hm-pin'; p.setAttribute('aria-hidden', 'true');
        p.style.left = ((l[1] + r * Math.cos(a)) / W * 100).toFixed(2) + '%';
        p.style.top = ((l[2] + r * Math.sin(a)) / H * 100).toFixed(2) + '%';
        p.style.zIndex = String(++order % 40);
        p.style.animationDelay = Math.min(order * 14, 900) + 'ms';
        im.alt = ''; p.appendChild(im); root.appendChild(p);
      }
      function next() {
        if (!queue.length) return;
        var l = queue.shift(), im = new Image(), done = false;
        active++;
        function fin(ok) {
          if (done) return; done = true; active--;
          if (ok && im.naturalWidth >= 24 && im.naturalHeight >= 24) place(l, im);
          next();
        }
        im.referrerPolicy = 'no-referrer'; im.decoding = 'async';
        im.addEventListener('load', function () { fin(true); });
        im.addEventListener('error', function () { fin(false); });
        setTimeout(function () { fin(false); }, 10000);
        im.src = l[3];
      }
      for (var j = 0; j < POOL; j++) next();
    }).catch(function () { /* the plain map is still a fine picture */ });
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es, o) { if (es[0].isIntersecting) { o.disconnect(); start(); } }, { rootMargin: '300px 0px' }).observe(root);
  } else start();
})();
