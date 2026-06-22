ALTER TABLE leaderboards ADD COLUMN deletion_key_hash TEXT;
ALTER TABLE leaderboards ADD COLUMN creation_request_id TEXT;
ALTER TABLE leaderboards ADD COLUMN creation_request_fingerprint TEXT;

CREATE UNIQUE INDEX leaderboards_creation_request_idx
  ON leaderboards(creation_request_id)
  WHERE creation_request_id IS NOT NULL;
