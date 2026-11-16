-- LawDB.ai database schema (the US edition). One clean starting point: no data, no history. Firms are imported by tools/us-data/build_import_sql.py.
-- Columns: firms.state is the two-letter state code (FL, TX, ...). Every firm page is rendered from this database (page_mode = 'dynamic').

CREATE TABLE firms (
  slug         TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  city         TEXT NOT NULL,
  state     TEXT NOT NULL,
  region       TEXT,
  featured     INTEGER NOT NULL DEFAULT 0,
  rating       REAL,
  review_count INTEGER,
  lat          REAL,
  lng          REAL,
  data         TEXT NOT NULL,   -- full firm record (JSON)
  hours        TEXT,            -- opening hours (JSON), nullable
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
, page_mode TEXT NOT NULL DEFAULT 'dynamic', about TEXT, status TEXT NOT NULL DEFAULT 'live', created_by INTEGER, inquiry_email TEXT);
CREATE TABLE blog_posts (
  slug       TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  city       TEXT,
  state   TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  data       TEXT NOT NULL,     -- full post record (JSON)
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE leads (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  form       TEXT NOT NULL,
  name       TEXT,
  email      TEXT,
  phone      TEXT,
  message    TEXT,
  payload    TEXT NOT NULL,     -- everything submitted (JSON)
  page       TEXT,
  status     TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
, firm_slug TEXT, ip_hash TEXT, note TEXT, seen_at TEXT);
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  disabled      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
, name TEXT, kind TEXT CHECK (kind IS NULL OR kind IN ('lawyer', 'staff', 'public', 'other')), provider TEXT, welcomed_at TEXT, city TEXT, state TEXT, job_title TEXT, employer TEXT, goal TEXT CHECK (goal IS NULL OR goal IN ('find', 'clients', 'staff', 'follow', 'study', 'other')), onboarded_at TEXT, feed_seen_at TEXT, avatar_type TEXT, avatar_at TEXT, cover_type TEXT, cover_at TEXT, photo_offer_url TEXT, photo_offer_provider TEXT, photo_offer_declined INTEGER NOT NULL DEFAULT 0);
CREATE TABLE login_tokens (
  token_hash TEXT PRIMARY KEY,
  email      TEXT NOT NULL COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  used_at    TEXT
, signup INTEGER NOT NULL DEFAULT 0, ip_hash TEXT);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE TABLE audit_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  at            TEXT NOT NULL DEFAULT (datetime('now')),
  actor_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
  actor_email   TEXT,
  action        TEXT NOT NULL,
  entity        TEXT,
  entity_id     TEXT,
  detail        TEXT
);
CREATE TABLE firm_members (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  firm_slug    TEXT NOT NULL REFERENCES firms (slug) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  contact_name TEXT NOT NULL,
  job_title    TEXT,
  message      TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at   TEXT,
  decided_by   INTEGER REFERENCES users (id) ON DELETE SET NULL, terms_accepted_at TEXT, digest_at TEXT, report_at TEXT, reports_off INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, firm_slug)
);
CREATE TABLE firm_images (
  id           TEXT PRIMARY KEY,             -- random, 24 hex characters; also the public address /img/<id>
  firm_slug    TEXT NOT NULL REFERENCES firms (slug) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('logo', 'cover', 'photo')),
  alt          TEXT,
  content_type TEXT NOT NULL,
  bytes        INTEGER NOT NULL,
  width        INTEGER,
  height       INTEGER,
  uploaded_by  INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE firm_feeds (
  firm_slug       TEXT PRIMARY KEY REFERENCES firms (slug) ON DELETE CASCADE,
  feed_url        TEXT,                       -- discovered from the firm's website, or entered by hand
  source          TEXT NOT NULL DEFAULT 'auto' CHECK (source IN ('auto', 'manual')),
  enabled         INTEGER NOT NULL DEFAULT 1, -- 0 = switched off (by the firm or the admin); stays off
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ok', 'error', 'none')),
  last_checked_at TEXT,
  last_error      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
, kind TEXT NOT NULL DEFAULT 'rss' CHECK (kind IN ('rss', 'wp')), page_only INTEGER NOT NULL DEFAULT 0);
CREATE TABLE firm_posts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  firm_slug    TEXT NOT NULL REFERENCES firms (slug) ON DELETE CASCADE,
  guid         TEXT NOT NULL,
  title        TEXT NOT NULL,
  url          TEXT NOT NULL,
  published_at TEXT,
  excerpt      TEXT NOT NULL,                 -- plain text, at most 600 characters
  fetched_at   TEXT NOT NULL DEFAULT (datetime('now')), image_url TEXT,
  UNIQUE (firm_slug, guid)
);
CREATE TABLE firm_subscriptions (
  subscription_id      TEXT PRIMARY KEY,         -- Stripe's sub_...
  customer_id          TEXT,
  firm_slug            TEXT REFERENCES firms (slug) ON DELETE SET NULL,
  payer_email          TEXT,
  status               TEXT NOT NULL CHECK (status IN ('active', 'past_due', 'canceled', 'needs_review', 'dismissed')),
  amount_cents         INTEGER,
  currency             TEXT,
  period_end           TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  featured_before      INTEGER NOT NULL DEFAULT 0, -- firm was already Featured (e.g. set by hand) when this started: never undone
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE stripe_events (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE site_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE search_pages (
  url              TEXT PRIMARY KEY,
  verdict          TEXT,              -- PASS (on Google), NEUTRAL, FAIL, or NULL if the check failed
  coverage_state   TEXT,              -- Google's own wording, e.g. "Submitted and indexed", "Crawled - currently not indexed"
  indexing_state   TEXT,
  last_crawl_at    TEXT,
  google_canonical TEXT,
  error            TEXT,
  checked_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE follows (
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  firm_slug  TEXT NOT NULL REFERENCES firms (slug) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, firm_slug)
);
CREATE TABLE saved_stories (
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  post_id    INTEGER NOT NULL REFERENCES firm_posts (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, post_id)
);
CREATE TABLE oauth_states (
  state_hash TEXT PRIMARY KEY,
  provider   TEXT NOT NULL,
  verifier   TEXT NOT NULL,
  next_path  TEXT NOT NULL DEFAULT '/account/',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE firm_ratings (
  user_id        INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  firm_slug      TEXT NOT NULL REFERENCES firms (slug) ON DELETE CASCADE,
  stars          INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment        TEXT,
  comment_status TEXT NOT NULL DEFAULT 'none' CHECK (comment_status IN ('none', 'pending', 'approved', 'rejected')),
  status         TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'hidden')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, firm_slug)
);
CREATE TABLE firm_invites (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash  TEXT NOT NULL UNIQUE,
  email       TEXT NOT NULL,
  firm_slug   TEXT NOT NULL REFERENCES firms (slug) ON DELETE CASCADE,
  switch_page INTEGER NOT NULL DEFAULT 0,
  invited_by  INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL,
  used_at     TEXT
);
CREATE TABLE stats_daily (
  day  TEXT NOT NULL,
  kind TEXT NOT NULL,
  k1   TEXT NOT NULL DEFAULT '',
  k2   TEXT NOT NULL DEFAULT '',
  n    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind, k1, k2)
) WITHOUT ROWID;
CREATE TABLE projects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  detail     TEXT NOT NULL DEFAULT '',
  source     TEXT NOT NULL DEFAULT 'you' CHECK (source IN ('you', 'claude')),
  asked_on   TEXT,
  status     TEXT NOT NULL DEFAULT 'idea' CHECK (status IN ('idea', 'next', 'doing', 'done')),
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  done_at    TEXT
);
CREATE TABLE ship_log (
  pr    INTEGER PRIMARY KEY,
  day   TEXT NOT NULL,
  at    TEXT NOT NULL,
  title TEXT NOT NULL
);
CREATE TABLE journal (
  day        TEXT PRIMARY KEY,
  body       TEXT NOT NULL,
  note       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE outreach (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  person       TEXT NOT NULL,
  firm_slug    TEXT,
  firm_name    TEXT NOT NULL DEFAULT '',
  channel      TEXT NOT NULL DEFAULT 'linkedin' CHECK (channel IN ('linkedin', 'phone', 'email', 'in-person', 'other')),
  link         TEXT NOT NULL DEFAULT '',
  stage        TEXT NOT NULL DEFAULT 'connected' CHECK (stage IN ('connected', 'messaged', 'replied', 'call', 'agreed', 'not-now')),
  note         TEXT NOT NULL DEFAULT '',
  follow_up    TEXT,
  last_contact TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT
);
CREATE TABLE firm_stats_daily (
  firm_slug TEXT NOT NULL REFERENCES firms (slug) ON DELETE CASCADE,
  day       TEXT NOT NULL,
  metric    TEXT NOT NULL,
  k         TEXT NOT NULL DEFAULT '',
  n         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (firm_slug, day, metric, k)
) WITHOUT ROWID;
CREATE TABLE firm_trials (
  firm_slug  TEXT PRIMARY KEY REFERENCES firms (slug) ON DELETE CASCADE,
  started_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
  source     TEXT NOT NULL DEFAULT 'owner' CHECK (source IN ('owner', 'admin')),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ends_at    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'subscribed', 'kept')),
  warned_at  TEXT,
  ended_at   TEXT,
  views      INTEGER,
  actions    INTEGER,
  enquiries  INTEGER
);
CREATE TABLE firm_verifications (
  firm_slug            TEXT PRIMARY KEY REFERENCES firms (slug) ON DELETE CASCADE,
  status               TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'verified')),
  law_society          TEXT NOT NULL,                       -- ON, QC, BC, AB or MB (see src/lib/verification.js)
  registrant_name      TEXT NOT NULL,                       -- the lawyer who is registered, as the firm gave it; private
  registration_ref     TEXT,                                -- the law society number, if the firm gave it; private
  requested_by         INTEGER REFERENCES users (id) ON DELETE SET NULL,
  requested_at         TEXT NOT NULL DEFAULT (datetime('now')),
  checked_identity     INTEGER NOT NULL DEFAULT 0,          -- the person who manages the profile is who they say they are
  checked_registration INTEGER NOT NULL DEFAULT 0,          -- the lawyer is in the law society's directory
  checked_office       INTEGER NOT NULL DEFAULT 0,          -- the office address and phone match
  verified_by          INTEGER REFERENCES users (id) ON DELETE SET NULL,
  verified_at          TEXT,
  note                 TEXT                                 -- the admin's own note; private
);
CREATE TABLE firm_redirects (
  old_slug   TEXT PRIMARY KEY,
  new_slug   TEXT NOT NULL,
  created_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE firm_locations (
  location_slug TEXT PRIMARY KEY REFERENCES firms (slug) ON DELETE CASCADE,
  main_slug     TEXT NOT NULL REFERENCES firms (slug) ON DELETE CASCADE,
  created_by    INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (location_slug <> main_slug)
);
CREATE INDEX idx_firms_state ON firms (state);
CREATE INDEX idx_firms_city ON firms (state, city);
CREATE INDEX idx_blog_state ON blog_posts (state);
CREATE INDEX idx_leads_created ON leads (created_at);
CREATE INDEX idx_leads_status ON leads (status);
CREATE INDEX idx_login_tokens_email ON login_tokens (email, created_at);
CREATE INDEX idx_sessions_user ON sessions (user_id);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);
CREATE INDEX idx_audit_at ON audit_log (at);
CREATE INDEX idx_members_firm ON firm_members (firm_slug, status);
CREATE INDEX idx_members_status ON firm_members (status, created_at);
CREATE INDEX idx_leads_firm ON leads (firm_slug, id);
CREATE INDEX idx_login_tokens_ip ON login_tokens (ip_hash, created_at);
CREATE INDEX idx_leads_ip ON leads (ip_hash, created_at);
CREATE INDEX idx_images_firm ON firm_images (firm_slug, kind, created_at);
CREATE INDEX idx_posts_firm ON firm_posts (firm_slug, published_at);
CREATE INDEX idx_subs_firm ON firm_subscriptions (firm_slug, status);
CREATE INDEX idx_subs_status ON firm_subscriptions (status, created_at);
CREATE INDEX idx_follows_firm ON follows (firm_slug);
CREATE INDEX idx_ratings_firm ON firm_ratings (firm_slug, status);
CREATE INDEX idx_ratings_pending ON firm_ratings (comment_status, updated_at);
CREATE INDEX idx_firms_live_city ON firms (status, city, state);
CREATE INDEX idx_invites_firm ON firm_invites (firm_slug, created_at);
CREATE INDEX idx_leads_firm_status ON leads (firm_slug, status, id);
CREATE INDEX idx_stats_kind_day ON stats_daily (kind, day);
CREATE INDEX idx_ship_log_day ON ship_log (day);
CREATE INDEX idx_outreach_follow ON outreach (follow_up);
CREATE INDEX idx_outreach_stage ON outreach (stage);
CREATE INDEX idx_firm_stats_day ON firm_stats_daily (day);
CREATE INDEX idx_trials_status ON firm_trials (status, ends_at);
CREATE INDEX idx_verifications_status ON firm_verifications (status, requested_at);
CREATE INDEX idx_redirects_new ON firm_redirects (new_slug);
CREATE INDEX idx_locations_main ON firm_locations (main_slug);

INSERT INTO site_settings (key, value) VALUES ('news_featured_only', '0');
