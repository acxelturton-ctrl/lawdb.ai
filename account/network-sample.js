// SAMPLE firms for the locked preview of LawDB Connect. Every name is invented and every card is marked "Sample" on screen.
// Nothing here is ever shown as a real firm, and none of it is sent to or from the server.
const f = (slug, name, city, state, practice, rep) => ({
  slug, name, city, state, logo: '', phone: '', website: '', sample: true, link: null, why: [],
  verified: rep.verified ? { at: '2026-11-10' } : null, practice,
  reported: { headline: rep.headline, openTo: rep.openTo, languages: rep.languages || [], firmType: rep.firmType, years: rep.years, accepting: rep.accepting ? { value: true, at: '2026-11-12' } : null },
});
export const SAMPLE_FIRMS = [
  f('s1', 'Sample Immigration Law Group', 'Houston', 'TX', ['immigration'], { verified: true, headline: 'Family sponsorship and complex immigration matters.', openTo: ['referral', 'local'], languages: ['Spanish'], firmType: 'boutique', years: 14, accepting: true }),
  f('s2', 'Sample Injury Attorneys', 'Tampa', 'FL', ['injury'], { verified: true, headline: 'Car accident and serious injury claims.', openTo: ['cocounsel', 'referral'], firmType: 'midsize', years: 22, accepting: true }),
  f('s3', 'Sample Estate Planning Firm', 'Austin', 'TX', ['wills'], { headline: 'Wills, trusts and probate for families and small businesses.', openTo: ['specialist', 'collab'], firmType: 'solo', years: 9 }),
  f('s4', 'Sample Business Law Partners', 'Miami', 'FL', ['business', 'litigation'], { verified: true, headline: 'Business formation and commercial disputes.', openTo: ['cocounsel', 'local'], languages: ['Spanish', 'Portuguese'], firmType: 'boutique', years: 17 }),
];
export const SAMPLE_TILES = [['248', 'Firms in the network'], ['3', 'Waiting for your answer'], ['5', 'Connections'], ['8', 'Requests sent']];
