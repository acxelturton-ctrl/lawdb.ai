-- LawDB Marketplace, phase 1: verified firms unlock consumer legal inquiries with prepaid credit. See src/lib/marketplace.js.
-- Nothing here is public: every table is read only through the firm login (verified firms) or the admin area.

-- A firm's marketplace settings and credit balance. One row per firm (created the first time the firm opens the Marketplace).
CREATE TABLE mp_accounts (
  firm_slug      TEXT PRIMARY KEY REFERENCES firms (slug) ON DELETE CASCADE,
  practice_areas TEXT NOT NULL DEFAULT '[]',           -- JSON array of practice keys (src/lib/practice.js)
  states         TEXT NOT NULL DEFAULT '[]',           -- JSON array of state codes the firm is licensed and wants inquiries from
  cities         TEXT NOT NULL DEFAULT '[]',           -- optional narrower filter
  alerts         TEXT NOT NULL DEFAULT 'instant' CHECK (alerts IN ('instant', 'daily', 'off')),
  balance_cents  INTEGER NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  promo_given    INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- An inquiry from a person looking for a lawyer. Firms see only the public fields until they unlock; details_private is revealed to exactly one firm.
CREATE TABLE mp_leads (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  source           TEXT NOT NULL DEFAULT 'form',        -- 'form' (get matched), 'test' (an admin's test inquiry)
  practice_area    TEXT NOT NULL,
  state            TEXT NOT NULL,
  city             TEXT NOT NULL,
  urgency          TEXT NOT NULL CHECK (urgency IN ('now', 'week', 'month', 'research')),
  issue            TEXT,                                -- a type picked from a list, never free text
  summary_public   TEXT NOT NULL,                       -- generated from the fields above only: it never contains anything the person typed
  details_private  TEXT NOT NULL,                       -- JSON { name, email, phone, description }
  consent          TEXT NOT NULL,                       -- JSON { version, text, at, ipHash, ua, form }: what the person agreed to, word for word
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'held', 'rejected', 'unlocked', 'expired')),
  hold_reason      TEXT,
  base_price_cents INTEGER NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at      TEXT,
  opens_at         TEXT,                                -- Featured firms see an inquiry at approved_at, everyone else from here
  unlock_token     TEXT,
  unlocked_by      TEXT,                                -- the firm's slug
  unlocked_by_user INTEGER,
  unlocked_at      TEXT,
  paid_cents       INTEGER,
  ip_hash          TEXT,
  reviewed_by      INTEGER,
  reviewed_at      TEXT
);
CREATE INDEX idx_mp_leads_feed ON mp_leads (status, state, practice_area, approved_at);
CREATE INDEX idx_mp_leads_status ON mp_leads (status, created_at);
CREATE INDEX idx_mp_leads_ip ON mp_leads (ip_hash, created_at);
CREATE INDEX idx_mp_leads_unlocked ON mp_leads (unlocked_by, unlocked_at);

-- Every top-up, unlock, refund and promotion. Append only: a row is never changed or removed (the triggers below refuse it); a mistake is fixed with a new row.
CREATE TABLE mp_ledger (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  firm_slug     TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('topup', 'unlock', 'refund', 'promo', 'adjust')),
  amount_cents  INTEGER NOT NULL,                       -- positive adds credit, negative spends it
  balance_after INTEGER NOT NULL,
  lead_id       INTEGER,
  ref           TEXT,                                   -- the Stripe checkout session for a top-up, so one payment can never be credited twice
  note          TEXT,
  actor         INTEGER,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_mp_ledger_ref ON mp_ledger (kind, ref) WHERE ref IS NOT NULL;
CREATE INDEX idx_mp_ledger_firm ON mp_ledger (firm_slug, id);
CREATE TRIGGER mp_ledger_no_update BEFORE UPDATE ON mp_ledger BEGIN SELECT RAISE(ABORT, 'the ledger is append only'); END;
CREATE TRIGGER mp_ledger_no_delete BEFORE DELETE ON mp_ledger BEGIN SELECT RAISE(ABORT, 'the ledger is append only'); END;

-- Bad-inquiry reports (phase 2 reads these; the table is here so the schema is complete).
CREATE TABLE mp_reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id     INTEGER NOT NULL,
  firm_slug   TEXT NOT NULL,
  reason      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'approved', 'denied')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_by INTEGER,
  resolved_at TEXT
);
CREATE UNIQUE INDEX idx_mp_reports_once ON mp_reports (lead_id, firm_slug);

-- Which firms were alerted about which inquiry, and in which wave (phase 2).
CREATE TABLE mp_alerts (
  lead_id   INTEGER NOT NULL,
  firm_slug TEXT NOT NULL,
  wave      INTEGER NOT NULL,
  sent_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (lead_id, firm_slug)
);

-- Off until the owner switches it on (after the consent wording has been reviewed by a lawyer).
INSERT OR IGNORE INTO site_settings (key, value) VALUES ('marketplace_live', '0');
