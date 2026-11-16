// Practice areas as the state practice pages know them (/florida/family-lawyers ...), and the cards on a firm's profile that link to them.
import { PRACTICE_PAGES } from './practice-pages.generated.js';

export const PRACTICE = {
  business: ['business-lawyers', 'Business / Corporate'],
  criminal: ['criminal-defense-lawyers', 'Criminal Defense'],
  traffic: ['traffic-ticket-lawyers', 'Traffic Tickets'],
  injury: ['personal-injury-lawyers', 'Personal Injury'],
  employment: ['employment-lawyers', 'Employment Law'],
  family: ['family-lawyers', 'Family Law / Divorce'],
  litigation: ['litigation-lawyers', 'Civil Litigation'],
  wills: ['wills-estate-lawyers', 'Wills & Estates'],
  immigration: ['immigration-lawyers', 'Immigration'],
  realestate: ['real-estate-lawyers', 'Real Estate'],
};
import { STATE_SLUG } from './us.js';
export const STATE_PATH = STATE_SLUG;

// The page for a case type in a state, or null when there is no such page (not every state has every practice page).
export function practicePath(state, caseType) {
  const p = PRACTICE[caseType];
  const dir = STATE_PATH[state];
  return p && dir && PRACTICE_PAGES.includes(`${dir}/${p[0]}`) ? `/${dir}/${p[0]}` : null;
}
