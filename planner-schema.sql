CREATE TABLE IF NOT EXISTS planner_state (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK(version > 0),
  ciphertext TEXT NOT NULL
);
