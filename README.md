# LawDB (lawdb.ai)

A directory of US law firms: static pages + a Cloudflare Worker API + a D1 database. US only.
See [docs/US-PLAN.md](docs/US-PLAN.md) for the plan and status and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it works.

```bash
npm install
npm run check          # syntax, generated pages, Worker bundle
npm run db:migrate:local && wrangler d1 execute DB --local --file=data/states/FL/import.sql
npm run dev
```
