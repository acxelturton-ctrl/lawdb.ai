// One projection for the home page map: the drawing (scripts/build-us-map.mjs) and the pins (src/routes/map.js) both use it.
import { geoAlbersUsa } from 'd3-geo';
export const W = 975, H = 610;
export const projection = () => geoAlbersUsa().scale(1300).translate([W / 2, H / 2]);
