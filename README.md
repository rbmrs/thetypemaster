# Type Master

A timed typing game. Type the highlighted word, then press Space or Enter to move to the next one.

Live: https://thetypemaster.netlify.app

## Features

- 30s, 1m or 3m rounds. The timer starts on your first keystroke.
- On-screen keyboard that flashes green or red for each key.
- Results at the end: score, words per minute, accuracy, words typed, correct words.
- Stats saved in `localStorage` under `typeMasterStats`.

### Scoring

| Action | Points |
| --- | --- |
| Correct letter | +1 |
| Incorrect letter | −1 |
| Correct word | +5 |
| Incorrect word | −3 |

The score never drops below 0.

## Development

```sh
npm install
npm run dev      # local dev server
npm run build    # production build to dist/
npm run preview  # serve the production build
```

## Project layout

```
index.html                  entry HTML, includes word-layout CSS overrides
src/main.jsx                React root
src/App.jsx                 game state, timer, scoring, input, results modal
src/components/WordDisplay.jsx  scrolling word row (3 history, 1 current, 3 upcoming)
src/components/Keyboard.jsx     on-screen keyboard
src/words.js                word list and random picker
src/index.css               styles
```

## Deployment

Netlify builds every push to `main` (`npm run build`, publish `dist/`). The settings live in `netlify.toml`.

## History

The original source was lost. This code was rebuilt from the published Netlify bundle (deploy `682cb334`). A headless Chrome test confirmed the rebuild behaves the same as the original. The first commit holds the original built files.

Known quirks kept from the original:

- `WordDisplay` exposes `window.advanceWords`, and `App` calls it to move the word row.
- Three hidden `debug1` words fill the history slots at start.
- `index.html` points to a `/vite.svg` icon that does not exist.
