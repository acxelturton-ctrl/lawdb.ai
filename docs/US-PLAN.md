# LawDB US: plan and status

US only. Built to scale: one schema, states loaded in waves, thin pages stay `noindex` until they have real content.

## Done
- Site, Worker, schema (`migrations/0001_schema.sql`), US state data (`src/lib/us.js`), state-bar verification, US case types, US legal pages (drafts).
- Data pipeline in `tools/us-data` (Overture Maps -> website crawl -> SQL). 70,494 US firms identified; Florida first (500 imported).

## Next
1. Put the Cloudflare resources behind the Worker (D1, KV, R2) and load Florida.
2. State and city hub pages, then Find Your Lawyer redesign.
3. Waves of states (CA, TX, NY, IL, ...) with the same pipeline; move firm images to R2.
4. Connect lawdb.ai once bought; then turn off `workers_dev`/`preview_urls`, remove the noindex rule in `_headers`.
5. A US attorney must review `terms.html` and `privacy-policy.html` before launch.
