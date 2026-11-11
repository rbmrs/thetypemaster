import { test } from "node:test";
import assert from "node:assert/strict";
import { WRONG_WORD_CHARS, correctPrefix, netCpm, roundLead, scoreRound, wordStep } from "../src/scoring.js";
import { RoundTrace } from "../src/round.js";
import { checkResult } from "../leaderboard/src/index.js";

// Plays keys on target words the way App.jsx counts them. `keys` per word:
// letters, "<" for Backspace, " " to send. A last entry without " " is the
// unfinished word when time runs out. One key every `msPerKey` ms from 0;
// keys at or after the time limit do not count, as in the game.
function play(duration, words, msPerKey = 100) {
  let correctChars = 0, letterKeys = 0, correctLetterKeys = 0, wordsTyped = 0, wordsCorrect = 0;
  let typed = "";
  let word = "";
  let t = 0;
  const trace = new RoundTrace(duration, 0);
  for (const [target, keys] of words) {
    word = target;
    typed = "";
    for (const k of keys) {
      const at = t;
      t += msPerKey;
      if (trace.over(at)) break;
      if (k === "<") {
        typed = typed.slice(0, -1);
        trace.backspace();
      } else if (k === " ") {
        if (!typed) continue;
        wordsTyped++;
        const ok = typed === word;
        if (ok) {
          wordsCorrect++;
          correctChars += word.length + 1;
        }
        trace.word(at, wordStep(word, ok));
        typed = "";
      } else {
        letterKeys++;
        if (word[typed.length] === k) correctLetterKeys++;
        typed += k;
        trace.letter(at);
      }
    }
  }
  const prefix = correctPrefix(typed, word);
  correctChars += prefix;
  return { duration, correctChars, letterKeys, correctLetterKeys, wordsTyped, wordsCorrect, lead: trace.lead(prefix) };
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
  // Score: net characters 13 - 5 = 8 in 30 s = 16 per minute.
  assert.equal(s.netChars, 8);
  assert.equal(s.cpm, 16);
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
  assert.equal(scoreRound(r).cpm, 0);
  assert.equal(checkResult(r), null);
});

test("ties: a skipped word always loses", () => {
  // Same correct words; one more wrong word lowers net WPM.
  const a = scoreRound(play(30, [["cat", "cat "]]));
  const b = scoreRound(play(30, [["cat", "cat "], ["dog", "d "]]));
  assert.ok(b.netWpm10 < a.netWpm10);
  assert.ok(b.cpm < a.cpm);
});

test("score: net characters per minute, a whole number", () => {
  // Exact at 30 s and 1 m.
  assert.equal(netCpm(178, 30), 356);
  assert.equal(netCpm(356, 60), 356);
  // 3 m: net characters / 3, rounded.
  assert.equal(netCpm(300, 180), 100);
  assert.equal(netCpm(301, 180), 100);
  assert.equal(netCpm(302, 180), 101);
  // Never below 0.
  assert.equal(netCpm(-7, 30), 0);
  assert.equal(netCpm(0, 60), 0);
  // From net characters, not the rounded net WPM: 301 and 302 both store
  // net_wpm10 201 at 3 m, but show 100 and 101.
  const at3m = (c) => scoreRound({ duration: 180, correctChars: c, letterKeys: c, correctLetterKeys: c, wordsTyped: 75, wordsCorrect: 75 });
  assert.deepEqual([at3m(301).netWpm10, at3m(302).netWpm10], [201, 201]);
  assert.deepEqual([at3m(301).cpm, at3m(302).cpm], [100, 101]);
});

// A plausible 60 s round: 50 correct 5-letter words, 2 wrong, a few typos.
const valid = {
  duration: 60, correctChars: 300, letterKeys: 270, correctLetterKeys: 262, wordsTyped: 52, wordsCorrect: 50, lead: 9_000_000,
};

test("valid rounds pass", () => {
  assert.equal(checkResult(valid), null);
  const s = scoreRound(valid);
  assert.equal(s.netWpm10, 580); // (300 / 5 - 2) / 1
  assert.equal(s.cpm, 290); // 300 - 5 * 2 in 1 minute
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
  const fast = { duration: 60, wordsTyped: 250, wordsCorrect: 250, letterKeys: 1300, correctLetterKeys: 1300, lead: 0 };
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

// --- lead ---------------------------------------------------------------------

test("lead: each step counts for the rest of the round", () => {
  // One correct 3-letter word sent at 0 ms holds +4 for all 30 s.
  assert.equal(roundLead([[0, 4]], 30), 4 * 30_000);
  // "cat " at 1 s (+4), a wrong word at 2 s (-5), then "ta" of "table" with
  // its last correct letter at 2.5 s (+2): 4*29000 - 5*28000 + 2*27500.
  assert.equal(roundLead([[1000, 4], [2000, -5], [2500, 2]], 30), 31_000);
  // Times are floored to whole ms and kept inside the round.
  assert.equal(roundLead([[999.9, 1]], 1), 1);
  assert.equal(roundLead([[-5, 1], [40_000, 3]], 30), 30_000);
  assert.equal(wordStep("house", true), 6);
  assert.equal(wordStep("house", false), -WRONG_WORD_CHARS);
});

test("lead: same score, the faster start was ahead for longer", () => {
  const words = [["cat", "cat "], ["dog", "dog "]];
  const quick = play(30, words, 100);
  const slow = play(30, words, 300);
  assert.equal(scoreRound(quick).netWpm10, scoreRound(slow).netWpm10);
  assert.ok(quick.lead > slow.lead);
  // cat sent at 300 ms, dog at 700 ms: 4*29700 + 4*29300.
  assert.equal(quick.lead, 4 * 29_700 + 4 * 29_300);
});

test("lead: the unfinished word counts at its last correct letter", () => {
  // "tabxe" on "table": prefix "tab", last correct letter "b" at 200 ms.
  const r = play(30, [["table", "tabxe"]]);
  assert.equal(r.correctChars, 3);
  assert.equal(r.lead, 3 * (30_000 - 200));
  // A deleted letter's time is gone: "tx<b" -> "tb", "b" at 300 ms.
  assert.equal(play(30, [["tbd", "tx<b"]]).lead, 2 * (30_000 - 300));
});

test("lead: a wrong word drags it down", () => {
  const clean = play(30, [["cat", "cat "]]);
  const wrong = play(30, [["cat", "cat "], ["dog", "dgo "]]);
  assert.ok(wrong.lead < clean.lead);
  assert.equal(checkResult(wrong), null);
});

test("round clock: keys at or after the time limit do not count", () => {
  const trace = new RoundTrace(30, 1000);
  assert.equal(trace.over(1000 + 29_999.9), false);
  assert.equal(trace.over(1000 + 30_000), true);
  assert.equal(trace.left(1000), 30_000);
  assert.equal(trace.left(1000 + 29_000.5), 999.5);
  assert.equal(trace.left(99_999), 0);
  // 1 s round, one key per 100 ms: keys at 0..900 ms count, so 10 letters.
  const r = play(1, [["abcdefghijkl", "abcdefghijkl"]]);
  assert.equal(r.letterKeys, 10);
  assert.equal(r.correctChars, 10);
});

test("lead bounds: between -5 per wrong word and every character, for the whole round", () => {
  const endMs = valid.duration * 1000;
  assert.equal(checkResult({ ...valid, lead: valid.correctChars * endMs }), null);
  assert.equal(checkResult({ ...valid, lead: valid.correctChars * endMs + 1 }), "bad lead");
  assert.equal(checkResult({ ...valid, lead: -5 * 2 * endMs }), null);
  assert.equal(checkResult({ ...valid, lead: -5 * 2 * endMs - 1 }), "bad lead");
  assert.equal(checkResult({ ...valid, lead: 1.5 }), "bad lead");
  assert.equal(checkResult({ ...valid, lead: "9000000" }), "bad lead");
  // An older game sends no lead: it counts as 0 and the round still saves.
  assert.equal(checkResult({ ...valid, lead: undefined }), null);
  const { lead, ...noLead } = valid;
  assert.equal(checkResult(noLead), null);
  assert.equal(checkResult({ ...valid, lead: null }), "bad lead");
});
