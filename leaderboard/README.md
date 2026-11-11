# Type Master leaderboard

Cloudflare Worker + D1 behind the game's leaderboard. Not part of the Vite build or the Pages deploy.

- Worker: `typemaster-leaderboard` (on `*.workers.dev`)
- D1: `typemaster-leaderboard` (`9e9b8edc-d7c3-42b6-ac65-cebca4f2d0e2`)
- Secret: `TOKEN_SECRET` (HMAC key for round tokens and the IP-hash salt)

## API

| Route | Body / query | Returns |
| --- | --- | --- |
| `POST /start` | `{duration, device}` (30, 60, 180; `desktop` or `phone`) | `{token}` |
| `POST /submit` | `{token, name, correctChars, letterKeys, correctLetterKeys, wordsTyped, wordsCorrect, lead}` (`lead` optional) | `{name, device, result: {cpm, netChars, netWpm10, rawWpm10, precision, wrongWords}, rank: {alltime, weekly}, top: {alltime, weekly}}` |
| `GET /top` | `duration=30&board=alltime\|weekly&device=desktop\|phone&limit=10` | `{rows: [{name, cpm, netWpm10, precision, wrongWords, date, tieBreak?}]}` (cached 30s) |

- Devices: desktop and phone rounds have separate boards. The game sends the device at `/start` (missing or unknown is `desktop`); it is signed into the token, and `/submit` uses that. `/top` defaults to `desktop`. The browser decides the device, so a player could fake it.
- Scoring: the game sends counts only. The Worker computes the score with the game's own code (`src/scoring.js`) and ignores any score the client sends.
  - Score (`cpm`) = net characters ÷ minutes, a whole number, never below 0 (`netCpm` in `src/scoring.js`). Not stored: `/top` and `rank` compute it from `net_chars`. The game shows it.
  - Net WPM = (correct characters ÷ 5 − wrong words) ÷ minutes, never below 0. Stored as `net_wpm10`, an integer in tenths (123 = 12.3). Still returned (`netWpm10`, `rank.*.best`) for older games; the current game does not show it.
  - Correct characters: letters + 1 (space) per correct word, plus the correct start of the unfinished last word.
  - Wrong words = `wordsTyped − wordsCorrect`.
  - Precision = correct letter keys ÷ all letter keys (deleted ones included), floored %.
  - Net characters = correct characters − 5 × wrong words. Stored as `net_chars`.
  - Lead: the area under the net-characters-over-time curve, an integer in char·ms, from the game (`roundLead` in `src/scoring.js`). Each correct word adds letters + 1 at its send time, each wrong word −5, the unfinished word its correct start at its last correct letter; each step counts for the rest of the round. Stored as `lead`. A body without `lead` (an older game) counts as lead 0 and still saves.
- Ranking: `net_chars DESC, wrong_words ASC, lead DESC, created_at ASC, id ASC`, the same in the best-per-name step, the top rows and the rank. Not the shown score: at 3m `cpm` rounds 3 net characters to the same value. One row per name (case-insensitive) per board, its best. `rank.*` is `{rank, best, bestCpm, current}`; `current` is true when that best is the row just saved.
- `tieBreak` on a `/top` row: only when the next row has the same `cpm`; why this row is above it: `chars` (more net characters), `wrongWords`, `lead` or `time` (earlier). The game shows it as a short note, never the lead number.
- Count checks: `4 × wordsCorrect ≤ correctChars ≤ 5.96 × wc + 4.2 × √wc + 13`; `correctChars ÷ 5` per minute under 250; `correctChars ≤ letterKeys + wc`; `correctChars − wc ≤ correctLetterKeys ≤ letterKeys`; `lead`, when sent, an integer with `−5 × wrongWords × D × 1000 ≤ lead ≤ correctChars × D × 1000` (D = round length in s). The word lists must keep 3–8 letters (`npm test` in the game root checks it).
- Weekly board: from Monday 00:00 UTC.
- A submit is rejected when the token is bad, used, older than 10 min, or younger than the round length minus 2s; when the counts do not fit the game; when the name is not allowed; or after 10 attempts per hour from one IP (only a salted hash is stored).
- CORS: `https://rbmrs.dev` and `http://localhost:*`.

## Commands

```sh
cd leaderboard
npm install
npm run schema                                  # apply schema.sql to the remote D1 (enough on a fresh D1)
npm run migrate:device                          # only on a D1 made before device boards, once (before deploy)
npm run migrate:lead                            # only on a D1 made before lead ranking, once (see below)
npx wrangler secret put TOKEN_SECRET            # random string, e.g. openssl rand -base64 48
npm run deploy

# Local: put TOKEN_SECRET=... in .dev.vars, then
npx wrangler d1 execute typemaster-leaderboard --local --file=schema.sql
npm run migrate:lead:local                      # only on a local D1 made before lead ranking, once
npm run dev                                     # http://localhost:8787
```

## Deploy the CPM score

No migration: `cpm` comes from the stored `net_chars`. The new game shows the `cpm` field, which only the new Worker sends. In order:

1. `npm run deploy` — the new Worker. Old game tabs keep working: `netWpm10` stays.
2. Push the game to `main` (Pages deploys it).

## Deploy lead ranking

Ties: rank by net characters, then fewer wrong words, then lead, then the earlier entry. Old scores stay (lead 0, `net_chars` rebuilt from their counts).

Warning: `npm run schema` fails on a D1 made before lead ranking (no `net_chars` column for the `scores_best` index) until `npm run migrate:lead` has run.

In order:

1. Ship the Worker that accepts an absent `lead`: the one in this repo (a body without `lead` saves with lead 0), so old game tabs and the time before step 5 still save. It goes live in step 3; do not deploy it before the migration, it needs the new columns.
2. `npm run backup` — exports the remote `scores` table to `backup-scores-<UTC time>.sql` (gitignored). Keep it somewhere safe.
3. `npm run migrate:lead`, then `npm run deploy` right after it. The migration adds `net_chars` and `lead`, fills `net_chars`, and swaps the `scores_name` index for `scores_best`. The new Worker needs those columns, so deploy only after the migration.
4. Right after the deploy, fill `net_chars` once more. The old Worker leaves it at 0 for rows it saves between the migration and the deploy. Safe to run any time:
   `npx wrangler d1 execute typemaster-leaderboard --remote --command "UPDATE scores SET net_chars = correct_chars - 5 * wrong_words"`
5. Push the game to `main` (Pages deploys it).

## Deploy net WPM scoring (season 2)

The new Worker needs the new `scores` table, and the new game needs the new Worker. Old scores are deleted. In order:

1. `npm run backup` — exports the remote `scores` table to `backup-scores-<UTC time>.sql` (gitignored). Keep it somewhere safe.
2. `npm run migrate:net-wpm` — applies `migrations/0002_net_wpm.sql`: drops `scores` and makes it again in the new shape. `used_tokens` and `submit_log` stay.
3. `npm run deploy` — the new Worker.
4. Push the game to `main` (Pages deploys it).

Between steps 2 and 4 the live game cannot save (its old body fails the checks); rounds in flight then are lost. That is accepted.

The game reads the Worker URL from `VITE_LEADERBOARD_URL` (default in `src/leaderboard.js`).

Clear the board: `npx wrangler d1 execute typemaster-leaderboard --remote --command "DELETE FROM scores; DELETE FROM used_tokens; DELETE FROM submit_log"`
