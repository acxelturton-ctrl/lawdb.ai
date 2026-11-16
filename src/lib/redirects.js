// One address per page. Addresses ending in ".html" or "/index" are sent to the clean address with a permanent (301) redirect.

// Returns the clean path for an old path, or null when the path is already right (or is not ours to move).
export function cleanPath(pathname) {
  if (/^\/(api|admin|account|img)\//.test(pathname)) return null;
  let p = pathname;
  if (p.endsWith('.html')) p = p.slice(0, -5);
  if (p.endsWith('/index')) p = p.slice(0, -5) || '/';
  if (p === '/index') p = '/';
  return p === pathname ? null : p;
}

// Full redirect response for a request URL, or null.
export function legacyRedirect(url) {
  const to = cleanPath(url.pathname);
  return to ? Response.redirect(url.origin + to + url.search, 301) : null;
}
