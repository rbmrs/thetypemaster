-- Type Master leaderboard (D1). Apply with:
--   npx wrangler d1 execute typemaster-leaderboard --remote --file=schema.sql

-- Every accepted submission. Boards return the best row per name.
CREATE TABLE IF NOT EXISTS scores (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  name                TEXT    NOT NULL,     -- as typed (trimmed)
  name_key            TEXT    NOT NULL,     -- lower-case, for one-entry-per-name
  duration            INTEGER NOT NULL,     -- 30, 60 or 180
  device              TEXT    NOT NULL DEFAULT 'desktop', -- 'desktop' or 'phone', its own board
  net_wpm10           INTEGER NOT NULL,     -- net WPM in tenths (123 = 12.3), never below 0; shown
  precision           INTEGER NOT NULL,     -- correct letter keys / letter keys, % (floored)
  correct_chars       INTEGER NOT NULL,     -- as sent by the game
  letter_keys         INTEGER NOT NULL,
  correct_letter_keys INTEGER NOT NULL,
  words_typed         INTEGER NOT NULL,
  words_correct       INTEGER NOT NULL,
  wrong_words         INTEGER NOT NULL,     -- words_typed - words_correct
  created_at          INTEGER NOT NULL,     -- ms since epoch
  ip_hash             TEXT    NOT NULL,
  -- Last, as migrations/0003_lead.sql adds them.
  net_chars           INTEGER NOT NULL DEFAULT 0, -- correct_chars - 5 * wrong_words; ranks first
  lead                INTEGER NOT NULL DEFAULT 0  -- area under net chars over time (char·ms); ranks after wrong_words
);
CREATE INDEX IF NOT EXISTS scores_board ON scores (duration, device, created_at);
-- Each name's best on a board, in the board order (see RANK_ORDER in src/index.js).
CREATE INDEX IF NOT EXISTS scores_best ON scores (duration, device, name_key, net_chars DESC, wrong_words, lead DESC, created_at);

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
