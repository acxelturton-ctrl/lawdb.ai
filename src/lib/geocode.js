import { inUS, zipOf, STATE_CENTERS } from './us.js';
// Best-effort address lookup for owner-submitted listings (OpenStreetMap Nominatim, free, no key).
// Returns { lat, lng } inside the United States, or null. Never throws: when it fails the admin enters the
// coordinates while approving. Skipped in local development so tests never depend on the internet.
export async function geocode(env, { address, city, state }) {
  if (env.DEV_ECHO_LINK === '1') return null;
  try {
    const q = [address, city, state, 'USA'].filter(Boolean).join(', ');
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(q)}`, {
      headers: { 'user-agent': 'LawDB.ai listing verification (info@lawdb.ai)', accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const hit = (await res.json())[0];
    const lat = Number(hit?.lat), lng = Number(hit?.lon);
    return inUS(lat, lng) ? { lat, lng } : null;
  } catch {
    return null;
  }
}

// Rough middle of each state: the last resort for a pin (see src/lib/us.js).

// A map position for a listing, so nobody has to look up coordinates by hand: the exact address when it can be found, otherwise the middle of
// the city (the average of the firms already listed there, or a city lookup, or the state). `approx` says the pin is not the exact address.
// The ZIP code written in an address, if any: { full: '33131', area: '331' }.
export const postalOf = zipOf;

export async function placeFor(env, { address, city, state }) {
  const exact = address ? await geocode(env, { address, city, state }) : null;
  if (exact) return { ...exact, approx: false };
  // The ZIP code alone: a full ZIP is a small area (good enough for the map), the first three digits are a region.
  const pc = zipOf(address);
  if (pc) {
    const block = await geocode(env, { address: pc.full, state });
    if (block) return { ...block, approx: false };
    const area = await geocode(env, { address: pc.area, state });
    if (area) return { ...area, approx: true };
  }
  try {
    const near = await env.DB.prepare("SELECT AVG(lat) AS lat, AVG(lng) AS lng, COUNT(*) AS n FROM firms WHERE status = 'live' AND city = ? AND state = ? AND lat IS NOT NULL AND lng IS NOT NULL").bind(city, state).first();
    if (near && near.n > 0 && inUS(near.lat, near.lng)) return { lat: near.lat, lng: near.lng, approx: true };
  } catch { /* fall through */ }
  const town = await geocode(env, { city, state });
  if (town) return { ...town, approx: true };
  const c = STATE_CENTERS[String(state).toUpperCase()];
  return c ? { lat: c[0], lng: c[1], approx: true } : null;
}
