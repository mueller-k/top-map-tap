PRAGMA foreign_keys = ON;

CREATE TABLE dashboards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  time_zone TEXT NOT NULL,
  password_algorithm TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE participants (
  id TEXT PRIMARY KEY,
  dashboard_id TEXT NOT NULL REFERENCES dashboards(id),
  display_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (dashboard_id, normalized_name)
);
CREATE INDEX participants_dashboard_idx ON participants(dashboard_id);

CREATE TABLE results (
  id TEXT PRIMARY KEY,
  dashboard_id TEXT NOT NULL REFERENCES dashboards(id),
  participant_id TEXT NOT NULL REFERENCES participants(id),
  result_year INTEGER NOT NULL,
  result_month INTEGER NOT NULL CHECK (result_month BETWEEN 1 AND 12),
  result_day INTEGER NOT NULL CHECK (result_day BETWEEN 1 AND 31),
  is_calendar_date INTEGER NOT NULL CHECK (is_calendar_date IN (0, 1)),
  round_1 INTEGER NOT NULL CHECK (round_1 BETWEEN 0 AND 100),
  round_2 INTEGER NOT NULL CHECK (round_2 BETWEEN 0 AND 100),
  round_3 INTEGER NOT NULL CHECK (round_3 BETWEEN 0 AND 100),
  round_4 INTEGER NOT NULL CHECK (round_4 BETWEEN 0 AND 100),
  round_5 INTEGER NOT NULL CHECK (round_5 BETWEEN 0 AND 100),
  final_score INTEGER NOT NULL CHECK (final_score BETWEEN 0 AND 1000),
  source_text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (dashboard_id, participant_id, result_year, result_month, result_day)
);
CREATE INDEX results_dashboard_date_idx
  ON results(dashboard_id, result_year, result_month, result_day);
CREATE INDEX results_participant_idx ON results(participant_id);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE session_dashboards (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  dashboard_id TEXT NOT NULL REFERENCES dashboards(id),
  last_accessed_at TEXT NOT NULL,
  PRIMARY KEY (session_id, dashboard_id)
);
CREATE INDEX session_dashboards_recent_idx
  ON session_dashboards(session_id, last_accessed_at DESC);
