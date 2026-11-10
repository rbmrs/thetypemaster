# Type Master leaderboard

Cloudflare Worker + D1 behind the game's leaderboard. Not part of the Vite build or the Pages deploy.

- Worker: `typemaster-leaderboard` (on `*.workers.dev`)
- D1: `typemaster-leaderboard` (`9e9b8edc-d7c3-42b6-ac65-cebca4f2d0e2`)
- Secret: `TOKEN_SECRET` (HMAC key for round tokens and the IP-hash salt)

## API

| Route | Body / query | Returns |
| --- | --- | --- |
| `POST /start` | `{duration}` (30, 60, 180) | `{token}` |
| `POST /submit` | `{token, name, score, wpm, accuracy, wordsTyped, wordsCorrect}` | `{name, rank: {alltime, weekly}, top: {alltime, weekly}}` |
| `GET /top` | `duration=30&board=alltime\|weekly&limit=10` | `{rows: [{name, score, wpm, accuracy, date}]}` (cached 30s) |

- Ranking: score, then WPM, then earlier entry. One row per name (case-insensitive), its best.
- Weekly board: from Monday 00:00 UTC.
- A submit is rejected when the token is bad, used, older than 10 min, or younger than the round length minus 2s; when the numbers do not fit the game's scoring; when the name is not allowed; or after 10 attempts per hour from one IP (only a salted hash is stored).
- CORS: `https://rbmrs.dev` and `http://localhost:*`.

## Commands

```sh
cd leaderboard
npm install
npm run schema                                  # apply schema.sql to the remote D1
npx wrangler secret put TOKEN_SECRET            # random string, e.g. openssl rand -base64 48
npm run deploy

# Local: put TOKEN_SECRET=... in .dev.vars, then
npx wrangler d1 execute typemaster-leaderboard --local --file=schema.sql
npm run dev                                     # http://localhost:8787
```

The game reads the Worker URL from `VITE_LEADERBOARD_URL` (default in `src/leaderboard.js`).

Clear the board: `npx wrangler d1 execute typemaster-leaderboard --remote --command "DELETE FROM scores; DELETE FROM used_tokens; DELETE FROM submit_log"`
