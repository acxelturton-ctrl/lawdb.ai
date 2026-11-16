/* LawDB.ai motion layer (see motion.css). Nothing here is needed for the site to work. */
(function () {
  var root = document.documentElement;
  // header glass
  var hdr = document.querySelector('.site-header');
  if (hdr) {
    var tick = false;
    var on = function () { hdr.classList.toggle('is-scrolled', window.scrollY > 8); tick = false; };
    window.addEventListener('scroll', function () { if (!tick) { tick = true; requestAnimationFrame(on); } }, { passive: true });
    on();
  }
  if (!('IntersectionObserver' in window) || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
  // reveal on scroll: whole sections, plus a stagger for the items inside grids
  var sections = [].slice.call(document.querySelectorAll('body.pg-home > section, body.pg-home > div > section, .h4-wrap, .bsl-in, .hz-firms-in, .join-c-in, .how-in'));
  var items = [].slice.call(document.querySelectorAll('.h4-case-grid > li, .how-steps > *, .cs-col, .join-c-list > *'));
  var targets = [];
  sections.forEach(function (el) { if (!el.hasAttribute('hidden')) targets.push(el); });
  items.forEach(function (el, i) { el.style.setProperty('--i', (i % 10) + ''); targets.push(el); });
  // do not hide anything that is already on screen when the page opens
  var vh = window.innerHeight || 800;
  targets = targets.filter(function (el) { return el.getBoundingClientRect().top > vh * 0.9; });
  if (!targets.length) return;
  root.classList.add('mo-on');
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('mo-in'); io.unobserve(e.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  targets.forEach(function (el) { el.classList.add('mo-rv'); io.observe(el); });
})();
