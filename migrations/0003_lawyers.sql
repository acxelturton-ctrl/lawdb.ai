-- A page for each lawyer a firm shows on its own website: /firms/<firm>/lawyers/<lawyer>.
-- Rows are loaded by tools/us-data/lawyers.py (data/lawyers/<ST>.sql). A lawyer is stored only with a photo that passed the image checks there.
-- Everything here is what the firm itself publishes on that lawyer's own page; nothing is copied word for word (the page text is written from these facts, src/lib/lawyer-bio.js).
CREATE TABLE firm_lawyers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  firm_slug  TEXT NOT NULL REFERENCES firms (slug) ON DELETE CASCADE,
  slug       TEXT NOT NULL,                       -- the lawyer's address part, unique within the firm
  name       TEXT NOT NULL,
  title      TEXT,                                -- Partner, Associate, Of Counsel ...
  photo_url  TEXT NOT NULL,                       -- https address of the photo on the firm's site (checked: a real picture, big enough, not shared between lawyers)
  phone      TEXT,                                -- only if shown on this lawyer's own page
  email      TEXT,                                -- same; never a general office address
  socials    TEXT,                                -- JSON {"linkedin": "...", "x": "..."} personal profiles only, never the firm's own
  areas      TEXT,                                -- JSON list of practice areas this lawyer's page mentions
  source_url TEXT NOT NULL,                       -- the lawyer's page on the firm's website
  status     TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'hidden')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (firm_slug, slug)
);
CREATE INDEX idx_firm_lawyers_firm ON firm_lawyers (firm_slug, status);
