# Type Master

A timed typing game. Type the highlighted word, then press Space or Enter to move to the next one.

Live: https://rbmrs.dev/type-master (standalone: https://rbmrs.dev/thetypemaster/)

## Features

- 30s, 1m or 3m rounds. The timer starts on your first letter key and the round ends exactly 30 s, 1 min or 3 min later. A key at or after that moment does not count.
- On-screen keyboard that flashes green or red for each key.
- Results at the end: the score in characters per minute (big), precision, words typed, correct words.
- The last round's result is saved in `localStorage` under `typeMasterStats` (`version: 2`; nothing reads it back).
- Language menu (flag, top right): English or Brazilian Portuguese. It sets the words and all game text. The choice is saved under `typeMasterLang`; without one, the browser language decides.
- Quiet sound cues, made with Web Audio: a light tick for a correct word, a low tone for a wrong word, a chime when time is up. No sound per letter. The speaker button (top right) turns them on or off; the choice is saved under `typeMasterSound`. On by default.
- Leaderboard per round length (all-time and this week), with separate desktop and phone boards. The player sees the board for their device, marked by a small icon. Save from the results card; the last name is kept under `typeMasterName`. The standalone page also has a Leaderboard link. Backend: `leaderboard/` (Cloudflare Worker + D1, see its README).

### Scoring

The score is **net characters per minute** (CPM) = net characters ÷ minutes, a whole number. Below 0 shows as 0. At 30s it is net characters × 2, at 1m net characters, at 3m net characters ÷ 3 rounded. 71.2 net WPM is 356 CPM.

- Net characters = correct characters − 5 per wrong word.

- Correct characters: the letters of each correct word + 1 for its space, plus the correct start of the word being typed when time runs out (letters before its first mistake, no space). That last word is never a wrong word.
- Each wrong word costs 5 characters, so a skipped word always loses. A fixed typo costs only time.
- Net WPM = (correct characters ÷ 5 − wrong words) ÷ minutes, and raw WPM = correct characters ÷ 5 ÷ minutes (before the wrong-word cost). Not shown; the Worker still stores net WPM.
- Precision = correct letter keys ÷ all letter keys, deleted ones included. A key is correct when it matches the word's letter at that position. Example: type "cst", delete "st", type "at" = 5 letter keys, 4 correct = 80%.
- Leaderboard order: net characters, then fewer wrong words, then lead, then the earlier score. Net characters, not the rounded CPM, so at 3m one more character always ranks higher.
- Lead: how long you were ahead. Picture your net characters over the round: each correct word adds its letters + 1 when you send it, each wrong word takes 5 away, and the unfinished word adds its correct start at its last correct letter. Lead is the area under that line. Two players with the same score: the one who got there sooner was ahead for longer. The board shows no number for it; when two rows show the same score, the upper one gets a short note on why ("ahead for longer", "fewer wrong words", "more net characters" or "saved first").
- The clock uses `performance.now()` (key event times), not `Date.now()`. The countdown reads the real time left, so it does not drift.

The code is `src/scoring.js` (the leaderboard Worker uses the same file) and `src/round.js` (the round clock and the word times for the lead).

## Development

```sh
npm install
npm run dev      # local dev server
npm run build    # production build to dist/
npm run preview  # serve the production build
npm test         # word list and scoring tests (node --test, no extra deps)
npm run bot      # test bot: plays 30s, 1m and 3m rounds in Chrome, no save
```

The test bot (`scripts/bot.mjs`, Playwright with the installed Google Chrome) types like a fast human: about 70–90 WPM, uneven key timing, short pauses, a few typos fixed with Backspace. It starts its own Vite server and checks that each round ends with a score on the results card. It checks that the card, the Worker and the board show the same score, and prints each round's score (CPM) and precision.

- `--mode 30` (or `60`, `180`, `30s`, `1m`, `3m`, a comma list, `all`): rounds to play. Default: all three.
- `--save`: save each score as "Bot Ada" or "Bot Turing" (they take turns) and check the save. It goes to the local Worker at `http://localhost:8787`, and starts `wrangler dev` in `leaderboard/` when none runs. That needs `leaderboard/.dev.vars` and the local D1 (see `leaderboard/README.md`).
- `--live`: with `--save`, save to the live board instead. Without it the game never talks to the live Worker.
- `--headed` shows the browser; `--wpm 80` sets the speed.
- `--clear`: play nothing; delete every "Bot Ada" and "Bot Turing" score from the local board (`--clear --live` for the live board). Other names are not touched.

- `--device mobile`: play as a phone (touch emulation), so the score goes to the phone board.

Short forms (`alias bot='node ~/dev/thetypemaster/scripts/bot.mjs'`):

- `bot run desktop|mobile 30s|1m|3m [live]`: play one round and save it. Names take turns per board: Ada, Turing, Ada ... (kept in `scripts/.bot-state.json`, gitignored).
- `bot delete [live]`: delete every bot score, all round lengths and devices.

Without `live` both use the local board.

## Project layout

```
index.html                  entry HTML, includes word-layout CSS overrides
src/main.jsx                React root
src/App.jsx                 game state, timer, key counts, input, results modal
src/scoring.js              score (net CPM), net and raw WPM, precision and lead (shared with the Worker)
src/round.js                round clock: time limit cut-off and word times for the lead
src/sound.js                sound cues (Web Audio) and the saved on/off choice
src/leaderboard.js          leaderboard API client, Worker URL (VITE_LEADERBOARD_URL), random names
src/i18n.js                 game text in English and Portuguese
src/components/Leaderboard.jsx  top 10 table with round length and period tabs, and a device icon
src/components/SaveScore.jsx    save row on the results card
leaderboard/                Cloudflare Worker + D1 backend (not part of the Pages build)
src/components/WordDisplay.jsx  scrolling word row (3 history, 1 current, 3 upcoming)
src/components/Keyboard.jsx     on-screen keyboard
src/words.js                word list and random picker
src/index.css               styles
test/                       node --test tests: word lengths, scoring, lead, the Worker's checks and board SQL (node:sqlite)
scripts/bot.mjs             test bot (npm run bot): plays full rounds in Chrome like a fast human
```

## History

The original source was lost. This code was rebuilt from the published Netlify bundle (deploy `682cb334`). A headless Chrome test confirmed the rebuild behaves the same as the original. The first commit holds the original built files.

Known quirks kept from the original:

- `WordDisplay` exposes `window.advanceWords`, and `App` calls it to move the word row.
- Three hidden `debug1` words fill the history slots at start.
- `index.html` points to a `/vite.svg` icon that does not exist.

## Deployment

Pushes to `main` build and deploy to GitHub Pages (`.github/workflows/deploy.yml`). The site is served at `rbmrs.dev/thetypemaster/` because the user site repo (`rbmrs/rbmrs.github.io`) owns the `rbmrs.dev` domain.

- `?embed=1` hides the title and nav. `rbmrs.dev/type-master` uses it and forwards keys typed on the page into the game, so no click is needed.
- The theme reads the `theme` key in `sessionStorage`, the same key as rbmrs.dev. Without a value it follows the system theme. Same origin, so the site toggle updates the game live through the `storage` event. An old `theme` value in `localStorage` is removed on load.
