-- Type Master leaderboard (D1). Apply with:
--   npx wrangler d1 execute typemaster-leaderboard --remote --file=schema.sql

-- Every accepted submission. Boards return the best row per name.
CREATE TABLE IF NOT EXISTS scores (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,           -- as typed (trimmed)
  name_key      TEXT    NOT NULL,           -- lower-case, for one-entry-per-name
  duration      INTEGER NOT NULL,           -- 30, 60 or 180
  score         INTEGER NOT NULL,
  wpm           INTEGER NOT NULL,
  accuracy      INTEGER NOT NULL,
  words_typed   INTEGER NOT NULL,
  words_correct INTEGER NOT NULL,
  created_at    INTEGER NOT NULL,           -- ms since epoch
  ip_hash       TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS scores_board ON scores (duration, created_at);
CREATE INDEX IF NOT EXISTS scores_name ON scores (duration, name_key);

-- Round tokens already used, so a token saves only once.
CREATE TABLE IF NOT EXISTS used_tokens (
  nonce   TEXT    PRIMARY KEY,
  used_at INTEGER NOT NULL
);

-- Submit attempts per hashed IP, for the hourly rate limit.
CREATE TABLE IF NOT EXISTS submit_log (
  ip_hash TEXT    NOT NULL,
  at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS submit_log_ip ON submit_log (ip_hash, at);
