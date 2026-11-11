// The Worker's board SQL (ranking, best per name, rank-of) and the D1
// migrations, run on node:sqlite through a small stand-in for env.DB.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { rankOf, topRows } from "../leaderboard/src/index.js";
import { scoreRound } from "../src/scoring.js";

const sql = (path) => readFileSync(new URL(`../leaderboard/${path}`, import.meta.url), "utf8");

// D1's prepare().bind().all() / .first() / .run() on node:sqlite.
function d1(db) {
  return {
    prepare(query) {
      const stmt = db.prepare(query);
      const bound = (args) => ({
        all: async () => ({ results: stmt.all(...args) }),
        first: async () => stmt.get(...args) ?? null,
        run: async () => {
          const r = stmt.run(...args);
          return { meta: { last_row_id: Number(r.lastInsertRowid) } };
        },
      });
      return { bind: (...args) => bound(args), ...bound([]) };
    },
  };
}

function freshDb(schema = sql("schema.sql")) {
  const db = new DatabaseSync(":memory:");
  db.exec(schema);
  return db;
}

let clock = 1_000;
// Saves a 3-letter-word round the way the Worker does; returns the row id.
function save(db, { name, duration = 180, correctChars, wordsTyped, wordsCorrect, lead = 0, at = clock++ }) {
  const counts = { duration, correctChars, letterKeys: correctChars, correctLetterKeys: correctChars, wordsTyped, wordsCorrect };
  const r = scoreRound(counts);
  const row = db
    .prepare(
      `INSERT INTO scores (name, name_key, duration, device, net_wpm10, net_chars, lead, precision, correct_chars,
         letter_keys, correct_letter_keys, words_typed, words_correct, wrong_words, created_at, ip_hash)
       VALUES (?, ?, ?, 'desktop', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'x')`,
    )
    .run(name, name.toLowerCase(), duration, r.netWpm10, r.netChars, lead, r.precision, correctChars, correctChars,
      correctChars, wordsTyped, wordsCorrect, r.wrongWords, at);
  return Number(row.lastInsertRowid);
}

const top = (db, duration = 180) => topRows({ DB: d1(db) }, duration, "desktop", 0, 10);
const rank = (db, name, id, duration = 180) => rankOf({ DB: d1(db) }, duration, "desktop", 0, name.toLowerCase(), id);

test("3m: 3k+1 and 3k+2 net characters show the same score but rank by characters", async () => {
  // 301 and 302 net characters both store 201 (20.1 WPM) at 3m.
  assert.equal(scoreRound({ duration: 180, correctChars: 301, letterKeys: 301, correctLetterKeys: 301, wordsTyped: 75, wordsCorrect: 75 }).netWpm10, 201);
  assert.equal(scoreRound({ duration: 180, correctChars: 302, letterKeys: 302, correctLetterKeys: 302, wordsTyped: 75, wordsCorrect: 75 }).netWpm10, 201);
  const db = freshDb();
  // The lower one is saved first and has the higher lead: characters still win.
  save(db, { name: "Early", correctChars: 301, wordsTyped: 75, wordsCorrect: 75, lead: 30_000_000 });
  const late = save(db, { name: "Late", correctChars: 302, wordsTyped: 75, wordsCorrect: 75, lead: 1 });
  const rows = await top(db);
  assert.deepEqual(rows.map((r) => r.name), ["Late", "Early"]);
  assert.deepEqual(rows.map((r) => r.netWpm10), [201, 201]);
  assert.equal(rows[0].tieBreak, "chars");
  assert.equal(rows[1].tieBreak, undefined);
  assert.deepEqual(await rank(db, "Late", late), { rank: 1, best: 201, current: true });
});

test("ranking: net characters, fewer wrong words, lead, then earlier", async () => {
  const db = freshDb();
  // 200 net characters each way unless noted (30 s rounds).
  const base = { duration: 30, correctChars: 210, wordsTyped: 52, wordsCorrect: 50 };
  const ids = {
    first: save(db, { ...base, name: "Same A", lead: 500 }),
    second: save(db, { ...base, name: "Same B", lead: 500 }),
    lead: save(db, { ...base, name: "Lead", lead: 900 }),
    clean: save(db, { ...base, name: "Clean", correctChars: 200, wordsTyped: 50, lead: 0 }),
    more: save(db, { ...base, name: "More", correctChars: 211, lead: 0 }),
  };
  const rows = await top(db, 30);
  assert.deepEqual(rows.map((r) => r.name), ["More", "Clean", "Lead", "Same A", "Same B"]);
  // Net WPM: 211-10 = 201 -> 80.4; the others 200 -> 80.0.
  assert.deepEqual(rows.map((r) => r.netWpm10), [804, 800, 800, 800, 800]);
  assert.deepEqual(rows.map((r) => r.tieBreak), [undefined, "wrongWords", "lead", "time", undefined]);
  const ranks = await Promise.all(rows.map((r) => rank(db, r.name, ids.first, 30)));
  assert.deepEqual(ranks.map((r) => r.rank), [1, 2, 3, 4, 5]);
});

test("one row per name: its best, ties broken the same way", async () => {
  const db = freshDb();
  const base = { duration: 60, correctChars: 100, wordsTyped: 25, wordsCorrect: 25 };
  save(db, { ...base, name: "Ada", lead: 10 });
  const best = save(db, { ...base, name: "ada", lead: 20 });
  save(db, { ...base, name: "Ada", correctChars: 99, lead: 999_999 });
  save(db, { ...base, name: "Bo", lead: 15 });
  const rows = await top(db, 60);
  assert.deepEqual(rows.map((r) => r.name), ["ada", "Bo"]);
  assert.deepEqual(await rank(db, "Ada", best, 60), { rank: 1, best: 200, current: true });
});

test("migration 0003 keeps old scores and rebuilds net characters", async () => {
  const db = freshDb(sql("migrations/0002_net_wpm.sql"));
  db.exec(`INSERT INTO scores (name, name_key, duration, device, net_wpm10, precision, correct_chars, letter_keys,
             correct_letter_keys, words_typed, words_correct, wrong_words, created_at, ip_hash)
           VALUES ('Old', 'old', 180, 'desktop', 201, 100, 312, 312, 312, 77, 75, 2, 1, 'x')`);
  db.exec(sql("migrations/0003_lead.sql"));
  const old = db.prepare("SELECT net_chars, lead FROM scores WHERE name_key = 'old'").get();
  assert.equal(old.net_chars, 312 - 5 * 2);
  assert.equal(old.lead, 0);
  // A new round with the same counts: the old row has lead 0, so the new one wins on lead.
  save(db, { name: "New", correctChars: 312, wordsTyped: 77, wordsCorrect: 75, lead: 5 });
  const rows = await top(db);
  assert.deepEqual(rows.map((r) => r.name), ["New", "Old"]);
  assert.equal(rows[0].tieBreak, "lead");

  // The migrated table has the same columns, in the same order, as schema.sql.
  const columns = (d) => d.prepare("PRAGMA table_info(scores)").all().map((c) => `${c.name} ${c.type} ${c.notnull} ${c.dflt_value}`);
  assert.deepEqual(columns(db), columns(freshDb()));
  const indexes = (d) => d.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'scores' ORDER BY name").all().map((r) => r.name);
  assert.deepEqual(indexes(db), indexes(freshDb()));
});
