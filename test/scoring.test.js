import { test } from "node:test";
import assert from "node:assert/strict";
import { correctPrefix, formatWpm, scoreRound } from "../src/scoring.js";
import { checkResult } from "../leaderboard/src/index.js";

// Plays keys on target words the way App.jsx counts them. `keys` per word:
// letters, "<" for Backspace, " " to send. A last entry without " " is the
// unfinished word when time runs out.
function play(duration, words) {
  let correctChars = 0, letterKeys = 0, correctLetterKeys = 0, wordsTyped = 0, wordsCorrect = 0;
  let typed = "";
  let word = "";
  for (const [target, keys] of words) {
    word = target;
    typed = "";
    for (const k of keys) {
      if (k === "<") typed = typed.slice(0, -1);
      else if (k === " ") {
        if (!typed) continue;
        wordsTyped++;
        if (typed === word) {
          wordsCorrect++;
          correctChars += word.length + 1;
        }
        typed = "";
      } else {
        letterKeys++;
        if (word[typed.length] === k) correctLetterKeys++;
        typed += k;
      }
    }
  }
  correctChars += correctPrefix(typed, word);
  return { duration, correctChars, letterKeys, correctLetterKeys, wordsTyped, wordsCorrect };
}

test("fixed typo: cst, delete st, at = 5 letter keys, 4 correct = 80%", () => {
  const r = play(30, [["cat", "cst<<at "]]);
  assert.equal(r.letterKeys, 5);
  assert.equal(r.correctLetterKeys, 4);
  assert.equal(r.correctChars, 4);
  assert.equal(scoreRound(r).precision, 80);
  assert.equal(checkResult(r), null);
});

test("net WPM: correct chars / 5 minus wrong words, per minute", () => {
  // cat (4) + house (6) correct, "dgo" wrong, unfinished "tabxe" -> "tab" = 3.
  const r = play(30, [["cat", "cat "], ["house", "house "], ["dog", "dgo "], ["table", "tabxe"]]);
  assert.equal(r.correctChars, 13);
  assert.equal(r.wordsTyped, 3);
  assert.equal(r.wordsCorrect, 2);
  const s = scoreRound(r);
  assert.equal(s.wrongWords, 1);
  // (13 / 5 - 1) / 0.5 = 3.2
  assert.equal(s.netWpm10, 32);
  assert.equal(formatWpm(s.netWpm10), "3.2");
  // 13 / 5 / 0.5 = 5.2
  assert.equal(s.rawWpm10, 52);
  // letters: 3 + 5 + 3 + 5 = 16; wrong keys: g, o (dgo), x (tabxe). The "e"
  // after the x matches "table" at that position, so it counts as correct.
  assert.equal(r.letterKeys, 16);
  assert.equal(r.correctLetterKeys, 13);
  assert.equal(s.precision, 81); // 13 / 16 = 81.25, floored
  assert.equal(checkResult(r), null);
});

test("the unfinished word is never a wrong word and has no space credit", () => {
  const r = play(60, [["cat", "cat "], ["table", "tab"]]);
  assert.equal(r.wordsTyped, 1);
  assert.equal(r.correctChars, 4 + 3);
});

test("below 0 shows as 0", () => {
  const r = play(30, [["cat", "cat "], ["dog", "x "], ["dog", "y "], ["dog", "z "]]);
  assert.equal(scoreRound(r).netWpm10, 0);
  assert.equal(checkResult(r), null);
});

test("ties: a skipped word always loses", () => {
  // Same correct words; one more wrong word lowers net WPM.
  const a = scoreRound(play(30, [["cat", "cat "]]));
  const b = scoreRound(play(30, [["cat", "cat "], ["dog", "d "]]));
  assert.ok(b.netWpm10 < a.netWpm10);
});

// A plausible 60 s round: 50 correct 5-letter words, 2 wrong, a few typos.
const valid = { duration: 60, correctChars: 300, letterKeys: 270, correctLetterKeys: 262, wordsTyped: 52, wordsCorrect: 50 };

test("valid rounds pass", () => {
  assert.equal(checkResult(valid), null);
  const s = scoreRound(valid);
  assert.equal(s.netWpm10, 580); // (300 / 5 - 2) / 1
  assert.equal(s.precision, 97);
  // The floor: 50 shortest (3-letter) words, 4 characters each.
  assert.equal(checkResult({ ...valid, correctChars: 50 * 4, letterKeys: 200, correctLetterKeys: 150 }), null);
});

test("inflated correctChars fail", () => {
  // Over the word-length bound: 5.96*50 + 4.2*sqrt(50) + 13 = 340.7
  assert.equal(checkResult({ ...valid, correctChars: 341, letterKeys: 400, correctLetterKeys: 400 }), "too many characters");
  assert.equal(checkResult({ ...valid, correctChars: 340, letterKeys: 400, correctLetterKeys: 400 }), null);
  // More characters than letter keys + spaces.
  assert.equal(checkResult({ ...valid, correctChars: 330, letterKeys: 270 }), "characters do not match keys");
  // More characters than correct letter keys + spaces.
  assert.equal(checkResult({ ...valid, correctLetterKeys: 240 }), "characters do not match keys");
  // Fewer than 4 per correct word.
  assert.equal(checkResult({ ...valid, correctChars: 199 }), "too few characters");
  // Character WPM over 250.
  const fast = { duration: 60, wordsTyped: 250, wordsCorrect: 250, letterKeys: 1300, correctLetterKeys: 1300 };
  assert.equal(checkResult({ ...fast, correctChars: 1251 }), "wpm too high");
});

test("bad counts fail", () => {
  assert.equal(checkResult({ ...valid, correctLetterKeys: 271 }), "correctLetterKeys > letterKeys");
  assert.equal(checkResult({ ...valid, wordsCorrect: 53 }), "wordsCorrect > wordsTyped");
  assert.equal(checkResult({ ...valid, letterKeys: 1.5 }), "bad numbers");
  assert.equal(checkResult({ ...valid, wordsTyped: 0, wordsCorrect: 0 }), "bad numbers");
  assert.equal(checkResult({ ...valid, correctChars: undefined }), "bad numbers");
  assert.equal(checkResult({ ...valid, letterKeys: -1 }), "bad numbers");
  // An old client's body (score, wpm, accuracy) has no counts.
  assert.equal(checkResult({ duration: 60, score: 100, wpm: 50, accuracy: 90, wordsTyped: 52, wordsCorrect: 50 }), "bad numbers");
});
