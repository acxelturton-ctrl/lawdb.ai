// Does a person's email address belong to the firm's own website? A work address on the firm's domain is the strongest cheap signal that the person
// really is the firm: they just proved they can read mail there (the sign-in link). 'free' = Gmail and similar (proves nothing), 'nosite' = the
// firm has no usable website of its own (a Facebook page or a site builder address is not a domain the firm controls), 'mismatch' = a different domain.
// Used by the admin approvals screen (to show the signal) and by claims (to approve at once when the signal is 'match').

export const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'hotmail.com', 'outlook.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com',
  'proton.me', 'protonmail.com', 'pm.me', 'gmx.com', 'mail.com', 'zoho.com', 'yandex.com',
  'comcast.net', 'att.net', 'sbcglobal.net', 'verizon.net', 'bellsouth.net', 'cox.net', 'charter.net', 'earthlink.net', 'frontier.com', 'windstream.net',
]);

// Website addresses that are shared by many businesses: owning an address there says nothing about the firm.
const SHARED_HOSTS = [
  'facebook.com', 'instagram.com', 'linkedin.com', 'twitter.com', 'x.com', 'youtube.com', 'google.com', 'business.site', 'g.page', 'yelp.com',
  'wixsite.com', 'wix.com', 'squarespace.com', 'weebly.com', 'godaddysites.com', 'wordpress.com', 'blogspot.com', 'webs.com', 'site123.me', 'carrd.co',
  'avvo.com', 'justia.com', 'lawyers.com', 'findlaw.com', 'martindale.com', 'superlawyers.com', 'nolo.com', 'lawinfo.com', 'attorneys.com',
];
const isShared = (host) => SHARED_HOSTS.some((s) => host === s || host.endsWith('.' + s));

export function emailMatch(email, website) {
  const domain = String(email).split('@')[1]?.toLowerCase();
  if (!domain) return 'mismatch';
  if (FREE_MAIL.has(domain)) return 'free';
  let host;
  try { host = new URL(website).hostname.toLowerCase().replace(/^www\./, ''); } catch { return 'nosite'; }
  if (!host.includes('.') || isShared(host) || isShared(domain)) return 'nosite';
  return domain === host || domain.endsWith('.' + host) || host.endsWith('.' + domain) ? 'match' : 'mismatch';
}
