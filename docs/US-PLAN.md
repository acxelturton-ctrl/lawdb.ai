# LawDB US (lawdb.ai): build plan

Started from a copy of lawdb.ca (Canada). **This is a skeleton, not a working site yet.** All Canadian firms, logos,
photos, blog posts, province pages and firm data were left out on purpose. `npm run check` and CI will fail until the
steps below are done, because many scripts expect that data.

First state: **Florida**. Domain: **lawdb.ai** (redirect `www`). Separate Cloudflare Worker, D1 database, KV and R2 bucket.

## Safety first (done)
- `wrangler.jsonc` renamed the Worker to `lawdb-ai` and replaced the D1, KV and R2 bindings with placeholders so this
  copy can never read or write the Canadian database. Create new ones in the Cloudflare account and fill them in.
- `STRIPE_PAYMENT_LINK` was blanked. Make a new Stripe product and link for the US site.

## Built to scale: what we do differently from lawdb.ca
Each point below is something lawdb.ca had to work around (see its `docs/ARCHITECTURE.md`), and the US rule that avoids it.

1. **One source of truth for firms: the database.** lawdb.ca keeps firm facts in JSON files, SQL update files and the
   database, then runs a pile of `apply-*.mjs --check` scripts to keep them in step. US rule: firms exist **only in D1**.
   Imports and enrichment are versioned import scripts that write to the database; no firm JSON or seed SQL in git.
2. **No per-firm static pages.** lawdb.ca started with about 370 hand-built HTML firm pages and later moved every firm to
   one dynamic template, keeping the old pages only as a fallback. US rule: every firm page is rendered from D1 from day
   one and cached at the edge. Hosting thousands of generated files also runs into the per-deploy file limits on
   Cloudflare static assets.
3. **Regions are data, not code.** Provinces are hard-coded in 40+ files in lawdb.ca. US rule: a `regions` table
   (country, state, city, slug, timezone, phone/ZIP rules) drives routes (`/{state}/{city}/{practice}`), the map and the
   sitemaps. Adding a state is a data import, and a third country later is a config change, not another fork.
4. **Sitemaps as an index from the start.** lawdb.ca's firm sitemap stops at 15,000 firms and needs a rewrite past that.
   US rule: a sitemap index with chunked files (well under 50,000 URLs each) and an `indexable` flag stored on each firm,
   so the sitemap never has to read page text.
5. **Images live in R2 (resized), never in git.** lawdb.ca has about 100 MiB of git history, mostly firm logos, photos and
   email previews. US rule: git holds code only; firm images go to R2 and are served resized through the image route.
6. **Lean checks.** lawdb.ca's `npm run check` chains around 80 scripts. US rule: a small set of fast checks (syntax,
   SEO rules, link integrity, unit tests) on every pull request, and slow data checks run on a schedule.
7. **Generated pages are built, not committed.** City, practice and case pages are generated at build or render time from
   the regions and case-types data, not checked in as thousands of near-identical files.
8. **Capacity plan written down.** Per-firm daily counters (`firm_stats_daily`) are pruned at 400 days in lawdb.ca; keep that,
   add D1 size alerts, and index the columns used by city, state and practice lookups from the first migration.
9. **Search quality over page count.** A page with no real description is noindex and out of the sitemap (a rule lawdb.ca
   already has). Keep it and never ship thin city or practice pages for states with few firms.
10. **Environments.** A staging Worker and D1 database from day one, so data imports and migrations are tried before they touch
    production.

## Phase 1: make it US
1. **States, not provinces.** Replace the ON/QC/BC/AB/MB maps (`PROVINCES`, `PROV_SLUG`, `inCanada`, the home-page
   province chips, province hub pages) with US states. Start with Florida only, written so more states are a data change.
2. **Addresses and phones.** ZIP codes instead of postal codes, US phone formatting, a US map bounding box in
   `src/lib/geocode.js`, dollars and US spelling (defence -> defense, licence -> license).
3. **Case types.** Rewrite `data/case-types.json` and the `*-lawyers.html` pages for US terms: personal injury, criminal
   defense, family law (divorce and custody), wills and estates (probate), immigration, employment, real estate,
   DUI, bankruptcy. Remove "traffic ticket" wording that is Ontario-specific.
4. **Copy.** Replace "Canada's law firm directory" and every Canadian reference (grep for Canada, Canadian, Ontario,
   Quebec, Alberta, province, CAD, Google reviews wording the owner removed on the News cards).
5. **Legal pages.** Terms, privacy and refund policy need US versions reviewed by a lawyer.
   **Attorney advertising rules vary by state (Florida Bar Rules 4-7).** Check the Florida rules on directories and
   lawyer referral services before launch.

## Phase 2: Florida data
1. Choose a source for firms (Google Places API is what lawdb.ca used; needs an API key and costs money).
2. Build the list: Florida cities (Miami, Orlando, Tampa, Jacksonville, Fort Lauderdale, ...) x case types.
3. Run the existing scripts (build-seed, build-extra-firms, logo/photo/hours finders) against the new data.
4. Generate the Florida city and practice-area pages with the existing generators.

## Phase 3: launch
1. New Cloudflare resources and domain: add `lawdb.ai` as a Worker custom domain, redirect `www`.
2. New Brevo (email) sender for `info@lawdb.ai`, new Google Search Console property, new sitemap.
3. Re-enable CI once `npm run check` passes.
4. Keep SEO clean: US content must not duplicate lawdb.ca pages (rewrite, do not copy), and each site only lists its own
   addresses in its sitemap and canonical tags.

## Not copied (rebuild or rewrite)
firms/, province folders, blog/, grow-your-practice/, email-previews/, firm photos and logos, firm and city data
JSON, db seed SQL files, sitemap.xml, news.html (regenerated by `scripts/build-news-fallback.mjs`).
