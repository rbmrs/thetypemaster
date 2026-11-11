-- Ties: rank by net characters, then fewer wrong words, then lead (ahead
-- for longer), then the earlier entry. Keeps every score. Back up first
-- (npm run backup), then apply once with:
--   npm run migrate:lead
-- Old rows get net_chars from their counts and lead 0 (no word times).

ALTER TABLE scores ADD COLUMN net_chars INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scores ADD COLUMN lead INTEGER NOT NULL DEFAULT 0;

UPDATE scores SET net_chars = correct_chars - 5 * wrong_words;

DROP INDEX IF EXISTS scores_name;
CREATE INDEX scores_best ON scores (duration, device, name_key, net_chars DESC, wrong_words, lead DESC, created_at);
