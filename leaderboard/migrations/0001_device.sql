-- Separate desktop and phone boards. For a D1 made from the old schema.sql.
-- Scores saved before this stay on the desktop board. Apply once with:
--   npm run migrate:device

ALTER TABLE scores ADD COLUMN device TEXT NOT NULL DEFAULT 'desktop';

DROP INDEX IF EXISTS scores_board;
DROP INDEX IF EXISTS scores_name;
CREATE INDEX scores_board ON scores (duration, device, created_at);
CREATE INDEX scores_name ON scores (duration, device, name_key);
