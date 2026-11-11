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

// Letters at the start of `typed` that match `word`, up to the first mistake.
export function correctPrefix(typed, word) {
  let n = 0;
  while (n < typed.length && n < word.length && typed[n] === word[n].toLowerCase()) n++;
  return n;
}

// WPM values are integers in tenths (123 = 12.3 WPM), so no float drift.
// (chars / 5) / (duration / 60) * 10 = chars * 120 / duration.
export function scoreRound({ duration, correctChars, letterKeys, correctLetterKeys, wordsTyped, wordsCorrect }) {
  const wrongWords = wordsTyped - wordsCorrect;
  const netWpm10 = Math.max(0, Math.round(((correctChars - 5 * wrongWords) * 120) / duration));
  const rawWpm10 = Math.round((correctChars * 120) / duration);
  // Floor, so any wrong key shows below 100%.
  const precision = letterKeys > 0 ? Math.floor((correctLetterKeys * 100) / letterKeys) : 0;
  return { wrongWords, netWpm10, rawWpm10, precision };
}

export const formatWpm = (wpm10) => (wpm10 / 10).toFixed(1);
