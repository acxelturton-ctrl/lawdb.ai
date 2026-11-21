// GET /api/whereami: roughly where the visitor is (town and state), from the connection itself, so /find-lawyers can start from "near you".
// Cloudflare works this out from the IP address as the request arrives. It is approximate (a town or two off is normal), it is never stored or logged,
// and nothing is sent anywhere else. Outside the US, or when it cannot tell, it says found:false and the page asks the visitor instead.
import { json, NO_STORE } from '../lib/http.js';

export function whereAmI({ request }) {
  const cf = request.cf || {};
  const lat = Number(cf.latitude), lng = Number(cf.longitude);
  const state = String(cf.regionCode || '').toUpperCase();
  const city = String(cf.city || '').replace(/[^\p{L}\p{M}'. -]/gu, '').trim().slice(0, 60);
  if (cf.country !== 'US' || !/^[A-Z]{2}$/.test(state) || !city || !Number.isFinite(lat) || !Number.isFinite(lng)) return json({ found: false }, 200, NO_STORE);
  return json({ found: true, city, state, lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 }, 200, NO_STORE);
}
