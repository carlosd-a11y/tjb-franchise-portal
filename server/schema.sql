-- Franchisee location portal. One SQLite file, mirroring the collections the
-- Firestore version used. See docs/adr-001-backend-on-the-vps.md.
--
-- Timestamps are ISO-8601 UTC strings ("2026-11-27T15:04:05Z"). They sort
-- lexicographically, which is why the list query can order on them.

PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS users (
  uid    TEXT PRIMARY KEY,
  email  TEXT NOT NULL,
  name   TEXT NOT NULL,
  role   TEXT NOT NULL CHECK (role IN ('admin', 'franchisee')),
  active INTEGER NOT NULL CHECK (active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS invites (
  id         TEXT PRIMARY KEY,          -- lowercased email
  email      TEXT NOT NULL,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('admin', 'franchisee')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('pending', 'provisioned'))
);

CREATE TABLE IF NOT EXISTS locations (
  id                 TEXT PRIMARY KEY,
  address            TEXT NOT NULL,
  city               TEXT NOT NULL,
  state              TEXT NOT NULL,
  zip                TEXT NOT NULL,
  normalized_address TEXT NOT NULL UNIQUE,
  lat                REAL,
  lng                REAL,
  sqft               INTEGER NOT NULL,
  rent               INTEGER NOT NULL,
  source             TEXT NOT NULL,
  status             TEXT NOT NULL CHECK (status IN
                       ('pool','claimed','researching','touring','submitted','approved','rejected')),
  claimed_by         TEXT,
  claimed_by_name    TEXT,
  claimed_at         TEXT,
  last_activity_at   TEXT NOT NULL,
  created_by         TEXT NOT NULL,
  created_at         TEXT NOT NULL,
  pass_reason        TEXT
);

CREATE INDEX IF NOT EXISTS locations_activity ON locations (last_activity_at DESC);

CREATE TABLE IF NOT EXISTS notes (
  id          TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES locations (id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  author_uid  TEXT NOT NULL,
  author_name TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS notes_location ON notes (location_id, created_at);

CREATE TABLE IF NOT EXISTS history (
  id          TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES locations (id) ON DELETE CASCADE,
  from_status TEXT NOT NULL,
  to_status   TEXT NOT NULL,
  actor_uid   TEXT NOT NULL,
  actor_name  TEXT NOT NULL,
  reason      TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS history_location ON history (location_id, created_at);

CREATE TABLE IF NOT EXISTS rejections (
  id                 TEXT PRIMARY KEY,
  address            TEXT NOT NULL,
  city               TEXT NOT NULL,
  state              TEXT NOT NULL,
  zip                TEXT NOT NULL,
  normalized_address TEXT NOT NULL,
  rejected_by        TEXT NOT NULL,
  rejected_at        TEXT NOT NULL,
  reason_code        TEXT NOT NULL,
  reason_text        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS rejections_address ON rejections (normalized_address);
CREATE INDEX IF NOT EXISTS rejections_zip ON rejections (zip);

-- Fixed-window counters for the bot intake endpoint. Survives a restart, which
-- the PHP version's file-based limiter also did.
CREATE TABLE IF NOT EXISTS intake_hits (
  bucket       TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL,
  PRIMARY KEY (bucket, window_start)
);

-- A scouting platform allowed to push finds in: Muse, Grokbot, and whatever
-- comes next. Admins add these from Admin -> Scouts. The key itself is never
-- stored, only its hash, so a leak of this file cannot be replayed.
CREATE TABLE IF NOT EXISTS scouts (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,   -- slug; the row's source becomes "bot:<name>"
  label        TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  active       INTEGER NOT NULL CHECK (active IN (0, 1)),
  created_by   TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  last_seen_at TEXT,
  submitted    INTEGER NOT NULL DEFAULT 0
);
