// The words on a lawyer's page, written from FACTS (name, title, firm, city, the practice areas the lawyer's own page mentions), never copied from the firm's own text.
// The wording is chosen from the lawyer's address, so two profiles do not read alike; every sentence is attributed to the firm's website or stays neutral:
// no rankings, no "best", no promises of results, nothing the data does not say.
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const pick = (arr, seed, salt) => arr[hash(seed + ':' + salt) % arr.length];
const list = (a) => (a.length <= 1 ? a.join('') : a.length === 2 ? a.join(' and ') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const article = (t) => (/^[aeiou]/i.test(t) ? 'an' : 'a');
const lower = (a) => a.map((x) => x.toLowerCase().replace(/\bdui\b/, 'DUI'));

export function lawyerAbout({ lawyer: l, firmName, city, state, firmAreas = [] }) {
  if (!firmName) return soloAbout({ lawyer: l, city, state });
  const first = l.name.split(/\s+/)[0];
  const areas = lower((l.areas && l.areas.length ? l.areas : firmAreas).slice(0, 4));
  const own = !!(l.areas && l.areas.length);
  const where = `${city}, ${state}`;
  const t = l.title;
  const intro = t
    ? pick([
      `${l.name} is ${article(t)} ${t} at ${firmName}, a law firm in ${where}.`,
      `${firmName}, a law firm in ${where}, lists ${l.name} as ${article(t)} ${t} on its website.`,
      `On the ${firmName} website in ${where}, ${l.name} appears with the title ${t}.`,
    ], l.slug, 'i')
    : pick([
      `${l.name} is one of the lawyers listed by ${firmName}, a law firm in ${where}.`,
      `${firmName}, a law firm in ${where}, shows ${l.name} on its website as one of its lawyers.`,
    ], l.slug, 'i');
  const focus = areas.length
    ? (own
      ? pick([`The firm's page for ${first} mentions ${list(areas)}.`, `${first}'s page on the firm's website refers to ${list(areas)}.`], l.slug, 'a')
      : pick([`${firmName} says it handles ${list(areas)}.`, `The firm lists ${list(areas)} among the matters it takes on.`], l.slug, 'a'))
    : '';
  const more = pick([
    `The full biography, bar admissions and background are on ${first}'s page at the firm's own website, which is linked below.`,
    `For ${first}'s complete biography, education and licensing details, see the firm's own page, linked below.`,
    `${firmName} publishes ${first}'s full profile on its own site; the link is below.`,
  ], l.slug, 'm');
  const care = pick([
    `LawDB lists lawyers as the firms present them. It does not rank lawyers or recommend one over another, and a lawyer's license status can change, so check it with the state bar before you hire anyone.`,
    `This page is a directory listing taken from the firm's website, not an endorsement. Before you hire a lawyer, confirm the license with the state bar.`,
  ], l.slug, 'c');
  const paragraphs = [[intro, focus].filter(Boolean).join(' '), more, care];
  const description = `${l.name}${t ? `, ${t}` : ''} at ${firmName} in ${where}.${areas.length ? ` ${areas.length ? `Practice: ${list(areas.slice(0, 3))}.` : ''}` : ''} Photo, contact details and a link to the firm's profile.`.slice(0, 300);
  return { paragraphs, description };
}

// A lawyer who is not linked to a listed firm: only what their own listing says. Same rules (no ranking, nothing the data does not say).
function soloAbout({ lawyer: l, city, state }) {
  const first = l.name.split(/\s+/)[0];
  const areas = lower((l.areas || []).slice(0, 4));
  const where = `${city}, ${state}`;
  const t = l.title;
  const intro = t
    ? pick([`${l.name} is listed on LawDB as ${article(t)} ${t} in ${where}.`, `LawDB lists ${l.name}, ${t}, in ${where}.`], l.slug, 'i')
    : pick([`${l.name} is a lawyer listed on LawDB in ${where}.`, `LawDB lists ${l.name} as a lawyer in ${where}.`], l.slug, 'i');
  const focus = areas.length ? pick([`${first}'s listing mentions ${list(areas)}.`, `${first} lists ${list(areas)} as areas of work.`], l.slug, 'a') : '';
  const more = `Use the contact details on this page to reach ${first} directly.`;
  const care = pick([
    `LawDB does not rank lawyers or recommend one over another, and a lawyer's license status can change, so check it with the state bar before you hire anyone.`,
    `This page is a directory listing, not an endorsement. Before you hire a lawyer, confirm the license with the state bar.`,
  ], l.slug, 'c');
  const description = `${l.name}${t ? `, ${t}` : ''} in ${where}.${areas.length ? ` Practice: ${list(areas.slice(0, 3))}.` : ''} Photo and contact details on LawDB.`.slice(0, 300);
  return { paragraphs: [[intro, focus].filter(Boolean).join(' '), more, care], description };
}
