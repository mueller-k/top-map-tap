ALTER TABLE results ADD COLUMN submission_time TEXT NOT NULL DEFAULT '';
ALTER TABLE results ADD COLUMN submission_source TEXT NOT NULL DEFAULT 'legacy'
  CHECK (submission_source IN ('legacy', 'direct', 'groupme'));
ALTER TABLE results ADD COLUMN groupme_message_id TEXT;

UPDATE results
SET submission_time = updated_at
WHERE submission_time = '';

CREATE TABLE groupme_live_imports (
  id TEXT PRIMARY KEY,
  leaderboard_id TEXT NOT NULL UNIQUE REFERENCES leaderboards(id),
  callback_token_hash TEXT NOT NULL UNIQUE,
  group_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE groupme_message_receipts (
  integration_id TEXT NOT NULL REFERENCES groupme_live_imports(id),
  message_id TEXT NOT NULL,
  received_at TEXT NOT NULL,
  PRIMARY KEY (integration_id, message_id)
);

CREATE INDEX groupme_message_receipts_received_idx
  ON groupme_message_receipts(integration_id, received_at);
