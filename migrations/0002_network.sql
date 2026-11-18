-- LawDB Professional Network, phase 1: a members-only directory of Featured law firms that opted in, and connection requests between them.
-- A firm appears here only when it is Featured (a paid plan or the free month), live, and has switched itself on and accepted the rules.

CREATE TABLE network_profiles (
  firm_slug    TEXT PRIMARY KEY REFERENCES firms (slug) ON DELETE CASCADE,
  visible      INTEGER NOT NULL DEFAULT 0,          -- 1 = listed in the members-only directory
  suspended    INTEGER NOT NULL DEFAULT 0,          -- 1 = an admin removed the firm from the network (it cannot list itself again)
  agreed_at    TEXT,                                -- when the firm accepted the network rules
  agreed_by    INTEGER REFERENCES users (id) ON DELETE SET NULL,
  accepting    INTEGER CHECK (accepting IS NULL OR accepting IN (0, 1)), -- NULL = never said; shown only once the firm has said it
  accepting_at TEXT,                                -- when the firm last said so; shown next to the status
  open_to      TEXT NOT NULL DEFAULT '[]',          -- JSON list: referral, cocounsel, local, specialist, collab
  headline     TEXT,                                -- one sentence from the firm, up to 200 characters
  firm_type    TEXT CHECK (firm_type IS NULL OR firm_type IN ('solo', 'boutique', 'midsize', 'large')),
  years        INTEGER,                             -- years in practice, as the firm reports it
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_network_listed ON network_profiles (visible, suspended);

CREATE TABLE network_connections (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  from_slug    TEXT NOT NULL REFERENCES firms (slug) ON DELETE CASCADE,   -- the firm that asked
  to_slug      TEXT NOT NULL REFERENCES firms (slug) ON DELETE CASCADE,   -- the firm that was asked
  requested_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
  message      TEXT,                                -- up to 300 characters; no client details
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn', 'removed')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at   TEXT,
  decided_by   INTEGER REFERENCES users (id) ON DELETE SET NULL,
  CHECK (from_slug <> to_slug)
);
-- two firms have at most one live link (waiting or connected), whichever way round it was asked
CREATE UNIQUE INDEX idx_network_pair ON network_connections (MIN(from_slug, to_slug), MAX(from_slug, to_slug)) WHERE status IN ('pending', 'accepted');
CREATE INDEX idx_network_conn_to ON network_connections (to_slug, status);
CREATE INDEX idx_network_conn_from ON network_connections (from_slug, status);

CREATE TABLE network_blocks (
  firm_slug    TEXT NOT NULL REFERENCES firms (slug) ON DELETE CASCADE,   -- the firm that blocked
  blocked_slug TEXT NOT NULL REFERENCES firms (slug) ON DELETE CASCADE,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (firm_slug, blocked_slug)
);

CREATE TABLE network_reports (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_slug TEXT NOT NULL REFERENCES firms (slug) ON DELETE CASCADE,
  reported_slug TEXT NOT NULL REFERENCES firms (slug) ON DELETE CASCADE,
  reported_by   INTEGER REFERENCES users (id) ON DELETE SET NULL,
  reason        TEXT NOT NULL CHECK (reason IN ('not-a-lawyer', 'spam', 'confidential', 'fees', 'other')),
  detail        TEXT,
  status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'actioned')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_network_reports_status ON network_reports (status, created_at);
