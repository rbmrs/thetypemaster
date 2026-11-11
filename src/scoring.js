// Net WPM and precision. Pure functions, shared by the game and the
// leaderboard Worker (leaderboard/src/index.js imports this file), so both
// compute the same numbers.
//
// - Correct characters: letters of each correct word + 1 for its space, plus
//   the correct start of the word being typed when time runs out (letters
//   before its first mistake, no space).
// - Net WPM = (correct characters / 5 - wrong words) / minutes. Below 0 is 0.
// - Raw WPM = correct characters / 5 / minutes (before the wrong-word cost).
// - Precision = correct letter keys / all letter keys, deleted ones included.
//   A key is correct when it matches the word's letter at that position.
// - Net characters = correct characters - 5 per wrong word. The leaderboard
//   ranks by it (an integer), then fewer wrong words, then lead.
// - Lead = how long the player was ahead: the area under the net-characters
//   curve over the round, in char·ms (see roundLead).

// Letters at the start of `typed` that match `word`, up to the first mistake.
export function correctPrefix(typed, word) {
  let n = 0;
  while (n < typed.length && n < word.length && typed[n] === word[n].toLowerCase()) n++;
  return n;
}

// Each wrong word costs this many characters.
export const WRONG_WORD_CHARS = 5;

// The change in net characters when a word is sent: its letters + 1 for the
// space when correct, -5 when wrong.
export const wordStep = (word, isCorrect) => (isCorrect ? word.length + 1 : -WRONG_WORD_CHARS);

// Lead: area under the net-characters-over-time curve, an integer in char·ms.
// `steps` is a list of [ms since the first key, change in net characters];
// each step counts for the rest of the round. Higher is better: the same
// final score reached sooner was ahead for longer.
//   lead = sum of step * (duration * 1000 - t)
// Times are floored to whole ms and kept inside the round.
export function roundLead(steps, duration) {
  const endMs = duration * 1000;
  let lead = 0;
  for (const [t, step] of steps) {
    const ms = Math.min(Math.max(Math.floor(t), 0), endMs);
    lead += step * (endMs - ms);
  }
  return lead;
}

// WPM values are integers in tenths (123 = 12.3 WPM), so no float drift.
// (chars / 5) / (duration / 60) * 10 = chars * 120 / duration.
export function scoreRound({ duration, correctChars, letterKeys, correctLetterKeys, wordsTyped, wordsCorrect }) {
  const wrongWords = wordsTyped - wordsCorrect;
  const netChars = correctChars - WRONG_WORD_CHARS * wrongWords;
  const netWpm10 = Math.max(0, Math.round((netChars * 120) / duration));
  const rawWpm10 = Math.round((correctChars * 120) / duration);
  // Floor, so any wrong key shows below 100%.
  const precision = letterKeys > 0 ? Math.floor((correctLetterKeys * 100) / letterKeys) : 0;
  return { wrongWords, netChars, netWpm10, rawWpm10, precision };
}

export const formatWpm = (wpm10) => (wpm10 / 10).toFixed(1);
