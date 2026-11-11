// The game's side of saving a round: the stored name that turns on
// auto-save, one save per round token, and what a failed save shows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { NAME_KEY, claimRound, saveOutcome, storedName } from "../src/leaderboard.js";

const storage = (value) => ({ getItem: (key) => (key === NAME_KEY ? value : null) });

test("storedName: the last saved name, or empty when there is none or it is not valid", () => {
  assert.equal(storedName(storage("Swift Otter")), "Swift Otter");
  assert.equal(storedName(storage("  Swift   Otter ")), "Swift Otter");
  assert.equal(storedName(storage(null)), "");
  assert.equal(storedName(storage("x")), "");
  assert.equal(storedName(storage("Lontra Veloz é")), "");
  assert.equal(storedName(undefined), "");
  const broken = { getItem: () => { throw new Error("blocked"); } };
  assert.equal(storedName(broken), "");
});

test("claimRound: each round token saves once", () => {
  const token = Promise.resolve("t1");
  assert.equal(claimRound(token), true);
  // A second effect run (StrictMode) or a re-render does not save again.
  assert.equal(claimRound(token), false);
  assert.equal(claimRound(Promise.resolve("t1")), true);
  assert.equal(claimRound(null), false);
});

const httpError = (status, message) => Object.assign(new Error(message), { status });

test("saveOutcome: what a failed save shows", () => {
  // A stored name the server refuses asks for a new one.
  assert.deepEqual(saveOutcome(httpError(400, "bad name")), { key: "badName", retry: false, ask: true });
  assert.deepEqual(saveOutcome(httpError(400, "token already used")), { key: "alreadySaved", retry: false, ask: false });
  assert.deepEqual(saveOutcome(httpError(400, "token expired")), { key: "tooOld", retry: false, ask: false });
  assert.deepEqual(saveOutcome(httpError(429, "too many submits, try again later")), { key: "tooMany", retry: false, ask: false });
  // Offline (fetch throws without a status), server errors, and a save a
  // moment early can be tried again with the same token.
  assert.deepEqual(saveOutcome(new TypeError("Failed to fetch")), { key: "saveFailed", retry: true, ask: false });
  assert.deepEqual(saveOutcome(httpError(500, "HTTP 500")), { key: "saveFailed", retry: true, ask: false });
  assert.deepEqual(saveOutcome(httpError(400, "round not finished")), { key: "saveFailed", retry: true, ask: false });
  // Counts the server rejects won't pass on a retry either.
  assert.deepEqual(saveOutcome(httpError(400, "too fast")), { key: "saveFailed", retry: false, ask: false });
});
