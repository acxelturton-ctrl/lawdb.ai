// A firm's page lives at lawdb.ai/<handle>, right under the site's own pages, so a handle must never be the name of one of them.
// scripts/test-reserved-paths.mjs reads the repository and fails if a page, folder or route is missing here, so a new page cannot be shadowed by a firm.
import { SLUG_STATE } from './us.js';

const OWN = [
  // folders and routes
  'api', 'admin', 'account', 'img', 'images', 'firms', 'firm', 'news', 'lawyers', 'lawyer', 'new-firms', 'report-listing', 'data', 'docs', 'migrations', 'scripts', 'src', 'tools',
  'node-modules', 'index', 'sitemap', 'robots', 'favicon',
  // pages (every top-level .html file)
  'add-your-firm', 'badge', 'book-a-call', 'business-lawyers', 'contact', 'criminal-defense-lawyers', 'employment-lawyers', 'family-lawyers', 'find-lawyers', 'for-firms',
  'get-matched', 'google2ac42884da01fc7b', 'how-it-works', 'immigration-lawyers', 'list-your-firm', 'litigation-lawyers', 'marketplace', 'personal-injury-lawyers', 'privacy-policy',
  'real-estate-lawyers', 'refund-policy', 'terms', 'traffic-ticket-lawyers', 'wills-estate-lawyers',
  // words the site may use later, and ones people would expect to work
  'about', 'about-us', 'login', 'logout', 'sign-in', 'sign-up', 'signin', 'signup', 'join', 'register', 'dashboard', 'settings', 'search', 'blog', 'help', 'faq', 'support', 'careers',
  'press', 'partners', 'pricing', 'plans', 'privacy', 'cookies', 'security', 'states', 'cities', 'city', 'state', 'directory', 'attorneys', 'attorney', 'law-firms', 'lawyers-near-me',
  'practice-areas', 'practice', 'cases', 'reviews', 'ratings', 'new', 'featured', 'map', 'status', 'www', 'mail', 'static', 'assets', 'public', 'www-lawdb-ai', 'lawdb', 'lawdb-ai', 'lawdbai',
];

export const RESERVED = new Set([...OWN, ...Object.keys(SLUG_STATE)]);
export const isReserved = (s) => RESERVED.has(String(s || '').toLowerCase());

// "/smithlaw" or "/smithlaw/lawyers" (and not one of the site's own pages)
export const FIRM_ROOT = /^\/([a-z0-9][a-z0-9-]*)(?:\/(lawyers|articles))?$/;
export function isFirmRoot(path) { const m = FIRM_ROOT.exec(path); return !!m && !isReserved(m[1]); }
