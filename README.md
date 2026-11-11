# Type Master

A timed typing game. Type the highlighted word, then press Space or Enter to move to the next one.

Live: https://rbmrs.dev/type-master (standalone: https://rbmrs.dev/thetypemaster/)

## Features

- 30s, 1m or 3m rounds. The timer starts on your first keystroke.
- On-screen keyboard that flashes green or red for each key.
- Results at the end: net WPM (big), precision, words typed, correct words.
- The last round's result is saved in `localStorage` under `typeMasterStats` (`version: 2`; nothing reads it back).
- Language menu (flag, top right): English or Brazilian Portuguese. It sets the words and all game text. The choice is saved under `typeMasterLang`; without one, the browser language decides.
- Quiet sound cues, made with Web Audio: a light tick for a correct word, a low tone for a wrong word, a chime when time is up. No sound per letter. The speaker button (top right) turns them on or off; the choice is saved under `typeMasterSound`. On by default.
- Leaderboard per round length (all-time and this week), with separate desktop and phone boards. The player sees the board for their device, marked by a small icon. Save from the results card; the last name is kept under `typeMasterName`. The standalone page also has a Leaderboard link. Backend: `leaderboard/` (Cloudflare Worker + D1, see its README).

### Scoring

The score is **net WPM** = (correct characters ÷ 5 − wrong words) ÷ minutes, shown to 1 decimal. Below 0 shows as 0.

- Correct characters: the letters of each correct word + 1 for its space, plus the correct start of the word being typed when time runs out (letters before its first mistake, no space). That last word is never a wrong word.
- Each wrong word costs 5 characters, so a skipped word always loses. A fixed typo costs only time.
- Raw WPM = correct characters ÷ 5 ÷ minutes (before the wrong-word cost).
- Precision = correct letter keys ÷ all letter keys, deleted ones included. A key is correct when it matches the word's letter at that position. Example: type "cst", delete "st", type "at" = 5 letter keys, 4 correct = 80%.
- Leaderboard ties: fewer wrong words, then the earlier score.

The code is `src/scoring.js`; the leaderboard Worker uses the same file.

## Development

```sh
npm install
npm run dev      # local dev server
npm run build    # production build to dist/
npm run preview  # serve the production build
npm test         # word list and scoring tests (node --test, no extra deps)
npm run bot      # test bot: plays 30s, 1m and 3m rounds in Chrome, no save
```

The test bot (`scripts/bot.mjs`, Playwright with the installed Google Chrome) types like a fast human: about 70–90 WPM, uneven key timing, short pauses, a few typos fixed with Backspace. It starts its own Vite server and checks that each round ends with a score on the results card. It prints each round's net WPM and precision.

- `--mode 30` (or `60`, `180`, `30s`, `1m`, `3m`, a comma list, `all`): rounds to play. Default: all three.
- `--save`: save each score as "Bot Ada" or "Bot Turing" (they take turns) and check the save. It goes to the local Worker at `http://localhost:8787`, and starts `wrangler dev` in `leaderboard/` when none runs. That needs `leaderboard/.dev.vars` and the local D1 (see `leaderboard/README.md`).
- `--live`: with `--save`, save to the live board instead. Without it the game never talks to the live Worker.
- `--headed` shows the browser; `--wpm 80` sets the speed.

## Project layout

```
index.html                  entry HTML, includes word-layout CSS overrides
src/main.jsx                React root
src/App.jsx                 game state, timer, key counts, input, results modal
src/scoring.js              net WPM, raw WPM and precision (shared with the Worker)
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
test/                       node --test tests: word lengths, scoring and the Worker's checks
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
