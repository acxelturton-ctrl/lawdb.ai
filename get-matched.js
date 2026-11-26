// The "get matched" form: loads the lists and the exact consent wording from the server, and sends the request. Nothing the person types is ever inserted as HTML.
(function () {
  var form = document.getElementById('gmForm'); if (!form) return;
  var closed = document.getElementById('gmClosed'), ok = document.getElementById('gmOk'), err = document.getElementById('gmErr'), go = document.getElementById('gmGo');
  var area = form.practiceArea, issue = form.issue, urgency = form.urgency, state = form.state, consentText = document.getElementById('gmConsentText');
  var info = null;
  function option(sel, value, text) { var o = document.createElement('option'); o.value = value; o.textContent = text; sel.appendChild(o); }
  function fillIssues() {
    issue.length = 1;
    ((info && info.issues[area.value]) || []).forEach(function (t) { option(issue, t, t); });
  }
  function showError(t) { err.textContent = t; err.style.display = t ? 'block' : 'none'; }
  fetch('/api/marketplace/form').then(function (r) { return r.json(); }).then(function (d) {
    info = d;
    if (!d.open) { closed.hidden = false; return; }
    Object.keys(d.areas).forEach(function (k) { option(area, k, d.areas[k]); });
    Object.keys(d.urgency).forEach(function (k) { option(urgency, k, d.urgency[k]); });
    Object.keys(d.states).forEach(function (k) { option(state, k, d.states[k]); });
    consentText.textContent = d.consent.text;
    area.addEventListener('change', fillIssues);
    form.hidden = false;
  }).catch(function () { closed.hidden = false; });
  form.addEventListener('submit', function (e) {
    e.preventDefault(); showError('');
    var body = {
      practiceArea: area.value, issue: issue.value, urgency: urgency.value, state: state.value, city: form.city.value, name: form.name.value, email: form.email.value, phone: form.phone.value,
      description: form.description.value, website: form.website.value, consent: form.consent.checked
    };
    go.disabled = true; go.textContent = 'Sending...';
    fetch('/api/marketplace/inquiry', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error((r.d && r.d.error) || 'Sorry, that did not go through. Please try again.');
        form.hidden = true; ok.style.display = 'block';
      })
      .catch(function (x) { go.disabled = false; go.textContent = 'Send my request'; showError(x.message); });
  });
})();
