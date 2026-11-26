ALTER TABLE requests
ADD COLUMN is_withdrawn INTEGER NOT NULL DEFAULT 0
CHECK (is_withdrawn IN (0,1));

ALTER TABLE requests
ADD COLUMN withdrawn_at TEXT;

ALTER TABLE requests
ADD COLUMN withdrawn_by TEXT
REFERENCES users(id)
ON UPDATE CASCADE
ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS
idx_requests_is_withdrawn
ON requests(is_withdrawn);
