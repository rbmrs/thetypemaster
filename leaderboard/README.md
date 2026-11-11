# Type Master leaderboard

Cloudflare Worker + D1 behind the game's leaderboard. Not part of the Vite build or the Pages deploy.

- Worker: `typemaster-leaderboard` (on `*.workers.dev`)
- D1: `typemaster-leaderboard` (`9e9b8edc-d7c3-42b6-ac65-cebca4f2d0e2`)
- Secret: `TOKEN_SECRET` (HMAC key for round tokens and the IP-hash salt)

## API

| Route | Body / query | Returns |
| --- | --- | --- |
| `POST /start` | `{duration, device}` (30, 60, 180; `desktop` or `phone`) | `{token}` |
| `POST /submit` | `{token, name, correctChars, letterKeys, correctLetterKeys, wordsTyped, wordsCorrect}` | `{name, device, result: {netWpm10, rawWpm10, precision, wrongWords}, rank: {alltime, weekly}, top: {alltime, weekly}}` |
| `GET /top` | `duration=30&board=alltime\|weekly&device=desktop\|phone&limit=10` | `{rows: [{name, netWpm10, precision, wrongWords, date}]}` (cached 30s) |

- Devices: desktop and phone rounds have separate boards. The game sends the device at `/start` (missing or unknown is `desktop`); it is signed into the token, and `/submit` uses that. `/top` defaults to `desktop`. The browser decides the device, so a player could fake it.
- Scoring: the game sends counts only. The Worker computes the score with the game's own code (`src/scoring.js`) and ignores any score the client sends.
  - Net WPM = (correct characters ÷ 5 − wrong words) ÷ minutes, never below 0. Stored as `net_wpm10`, an integer in tenths (123 = 12.3).
  - Correct characters: letters + 1 (space) per correct word, plus the correct start of the unfinished last word.
  - Wrong words = `wordsTyped − wordsCorrect`.
  - Precision = correct letter keys ÷ all letter keys (deleted ones included), floored %.
- Ranking: net WPM, then fewer wrong words, then earlier entry. One row per name (case-insensitive) per board, its best. `rank.*.current` is true when that best is the row just saved.
- Count checks: `4 × wordsCorrect ≤ correctChars ≤ 5.96 × wc + 4.2 × √wc + 13`; `correctChars ÷ 5` per minute under 250; `correctChars ≤ letterKeys + wc`; `correctChars − wc ≤ correctLetterKeys ≤ letterKeys`. The word lists must keep 3–8 letters (`npm test` in the game root checks it).
- Weekly board: from Monday 00:00 UTC.
- A submit is rejected when the token is bad, used, older than 10 min, or younger than the round length minus 2s; when the counts do not fit the game; when the name is not allowed; or after 10 attempts per hour from one IP (only a salted hash is stored).
- CORS: `https://rbmrs.dev` and `http://localhost:*`.

## Commands

```sh
cd leaderboard
npm install
npm run schema                                  # apply schema.sql to the remote D1
npm run migrate:device                          # once, on a D1 made before device boards (before deploy)
npx wrangler secret put TOKEN_SECRET            # random string, e.g. openssl rand -base64 48
npm run deploy

# Local: put TOKEN_SECRET=... in .dev.vars, then
npx wrangler d1 execute typemaster-leaderboard --local --file=schema.sql
npm run dev                                     # http://localhost:8787
```

## Deploy net WPM scoring (season 2)

The new Worker needs the new `scores` table, and the new game needs the new Worker. Old scores are deleted. In order:

1. `npm run backup` — exports the remote `scores` table to `backup-scores-<UTC time>.sql` (gitignored). Keep it somewhere safe.
2. `npm run migrate:net-wpm` — applies `migrations/0002_net_wpm.sql`: drops `scores` and makes it again in the new shape. `used_tokens` and `submit_log` stay.
3. `npm run deploy` — the new Worker.
4. Push the game to `main` (Pages deploys it).

Between steps 2 and 4 the live game cannot save (its old body fails the checks); rounds in flight then are lost. That is accepted.

The game reads the Worker URL from `VITE_LEADERBOARD_URL` (default in `src/leaderboard.js`).

Clear the board: `npx wrangler d1 execute typemaster-leaderboard --remote --command "DELETE FROM scores; DELETE FROM used_tokens; DELETE FROM submit_log"`
