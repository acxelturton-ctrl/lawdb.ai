-- Lawyers are their own kind of listing, separate from law firms: /lawyers/<lawyer> (not under a firm).
-- A lawyer may be linked to a firm (firm_slug) or stand alone (firm_slug NULL). Either way the lawyer pays for the Lawyer plan on their own: it never
-- depends on whether the firm is listed, or on what plan it is on. While paid_until is in the future the lawyer has a page of their own.
-- Rows from the crawler (tools/us-data/lawyers.py) are lawyers a firm names on its own website, so they carry that firm; a lawyer who signs up alone
-- has no firm until the firm confirms them. A lawyer is shown on a firm's Lawyers tab only through firm_slug.
CREATE TABLE lawyers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL UNIQUE,                -- the address /lawyers/<slug>: name, city and state, e.g. jane-roe-miami-fl
  name       TEXT NOT NULL,
  title      TEXT,                                -- Partner, Associate, Of Counsel ...
  city       TEXT NOT NULL,
  state      TEXT NOT NULL,
  firm_slug  TEXT REFERENCES firms (slug) ON DELETE SET NULL,   -- NULL: not linked to a listed firm
  photo_url  TEXT,                                -- where the crawler found the photo (the firm's own site); never shown to the public, only to the admin who reviews it
  photo_status TEXT NOT NULL DEFAULT 'pending' CHECK (photo_status IN ('pending', 'approved', 'rejected')),   -- an admin looks at every photo; only an approved one is copied to LawDB's own storage and shown
  photo_id   TEXT,                                -- the approved photo's own copy: served at /img/<photo_id> (src/routes/images.js)
  photo_type TEXT,                                -- its content type
  photo_reviewed_at TEXT,
  phone      TEXT,                                -- a direct number only; never the firm's main line
  email      TEXT,                                -- never a general office address
  socials    TEXT,                                -- JSON {"linkedin": "...", "x": "..."} personal profiles only
  areas      TEXT,                                -- JSON list of practice areas
  bio        TEXT,                                -- written by the lawyer (Lawyer plan); when empty the page shows a short text written from the facts above
  source_url TEXT,                                -- the lawyer's own page on the firm's website, if the lawyer came from there
  status     TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'hidden')),
  paid_until TEXT,                                -- Lawyer plan paid up to this time (UTC, 'YYYY-MM-DD HH:MM:SS'); NULL: not on the plan
  owner_email TEXT,                               -- the account that claimed this lawyer (nobody else can edit or pay for it)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_lawyers_firm ON lawyers (firm_slug, status);
CREATE INDEX idx_lawyers_paid ON lawyers (paid_until);
CREATE INDEX idx_lawyers_photo ON lawyers (photo_status, id);
CREATE UNIQUE INDEX idx_lawyers_photo_id ON lawyers (photo_id) WHERE photo_id IS NOT NULL;
CREATE INDEX idx_lawyers_place ON lawyers (state, city);
