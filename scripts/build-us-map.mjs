// Draws the US states (images/us-map.svg) for the home page map. Run: node scripts/build-us-map.mjs
// Uses the same projection as src/routes/map.js, so a firm's pin lands on its city. Florida and Texas (the live states) carry class "live".
import { readFileSync, writeFileSync } from 'node:fs';
import { feature } from 'topojson-client';
import { geoPath } from 'd3-geo';
import { projection, W, H } from '../src/lib/map-projection.js';

const us = JSON.parse(readFileSync(new URL('../node_modules/us-atlas/states-10m.json', import.meta.url)));
const LIVE = new Set(['12', '48']); // Florida, Texas
const path = geoPath(projection());
const states = feature(us, us.objects.states).features.filter((f) => path(f));
const d = (f) => path(f).replace(/(\d+)\.\d+/g, "$1");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Map of the United States"><title>United States</title><style>.st{fill:#efe8d3;stroke:#fffdf8;stroke-width:1}.live{fill:#e6d4a0;stroke:#fffdf8;stroke-width:1}</style>` +
  states.map((f) => `<path class="${LIVE.has(f.id) ? 'live' : 'st'}" d="${d(f)}"/>`).join('') + '</svg>\n';
writeFileSync(new URL('../images/us-map.svg', import.meta.url), svg);
console.log(`images/us-map.svg: ${states.length} states, ${(svg.length / 1024).toFixed(0)} KB`);
