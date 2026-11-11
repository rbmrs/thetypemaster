// Every word has 3 to 8 letters a-z. The Worker's limits (MIN_WORD_LEN,
// MAX_WORD_LEN and the 5.96 mean in checkResult) depend on it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { WORDS } from "../src/words.js";
import { PT_WORDS } from "../src/words-pt.js";

for (const [name, list] of [["words.js", WORDS], ["words-pt.js", PT_WORDS]]) {
  test(`${name}: every word has 3-8 letters a-z`, () => {
    const bad = list.filter((w) => !/^[a-z]{3,8}$/.test(w));
    assert.deepEqual(bad, []);
  });

  // checkResult assumes mean length + 1 is at most 5.96 (pt is 5.952).
  test(`${name}: mean length + 1 is at most 5.96`, () => {
    const mean = list.reduce((n, w) => n + w.length, 0) / list.length;
    assert.ok(mean + 1 <= 5.96, `mean ${mean}`);
  });
}
