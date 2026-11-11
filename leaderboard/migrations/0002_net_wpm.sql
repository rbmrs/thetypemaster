-- Net WPM scoring (season 2). Replaces the scores table, so every old score
-- is deleted. Back up first (npm run backup), then apply once with:
--   npm run migrate:net-wpm
-- used_tokens and submit_log stay as they are.

DROP TABLE IF EXISTS scores;

CREATE TABLE scores (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  name                TEXT    NOT NULL,     -- as typed (trimmed)
  name_key            TEXT    NOT NULL,     -- lower-case, for one-entry-per-name
  duration            INTEGER NOT NULL,     -- 30, 60 or 180
  device              TEXT    NOT NULL DEFAULT 'desktop', -- 'desktop' or 'phone', its own board
  net_wpm10           INTEGER NOT NULL,     -- net WPM in tenths (123 = 12.3), never below 0
  precision           INTEGER NOT NULL,     -- correct letter keys / letter keys, % (floored)
  correct_chars       INTEGER NOT NULL,     -- as sent by the game
  letter_keys         INTEGER NOT NULL,
  correct_letter_keys INTEGER NOT NULL,
  words_typed         INTEGER NOT NULL,
  words_correct       INTEGER NOT NULL,
  wrong_words         INTEGER NOT NULL,     -- words_typed - words_correct
  created_at          INTEGER NOT NULL,     -- ms since epoch
  ip_hash             TEXT    NOT NULL
);
CREATE INDEX scores_board ON scores (duration, device, created_at);
CREATE INDEX scores_name ON scores (duration, device, name_key);
