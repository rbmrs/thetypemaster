#!/usr/bin/env node
// Test bot: plays full rounds in a real Chrome like a fast human (about
// 70-90 WPM, uneven key timing, short pauses, a few typos fixed with
// Backspace), then checks the results card and optionally saves the score.
//
//   npm run bot                        all modes (30s, 1m, 3m), no save
//   npm run bot -- --mode 30           one mode (30, 60, 180 or 30s, 1m, 3m; comma list ok)
//   npm run bot -- --save              save to the LOCAL Worker (http://localhost:8787)
//   npm run bot -- --save --live       save to the live board (needs both flags)
//   npm run bot -- --headed            show the browser
//   npm run bot -- --wpm 80            target speed (default: random 70-90 per round)
//
// It starts its own Vite dev server. With --save (and no --live) it uses the
// local Worker on :8787, and starts `wrangler dev` in leaderboard/ when none runs.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_WORKER = "http://localhost:8787";
const LIVE_WORKER = "https://typemaster-leaderboard.rbmrs.workers.dev";
const BOT_NAMES = ["Bot Ada", "Bot Turing"];
const MODES = { 30: 30, "30s": 30, 60: 60, "1m": 60, 180: 180, "3m": 180 };
const LABEL = { 30: "30s", 60: "1m", 180: "3m" };

// --- options ----------------------------------------------------------------

function parseArgs(argv) {
  const opts = { modes: [30, 60, 180], save: false, live: false, headed: false, wpm: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = a.includes("=") ? a.split("=")[1] : argv[++i];
      if (v === undefined) fail(`${a} needs a value`);
      return v;
    };
    if (a === "--save") opts.save = true;
    else if (a === "--live") opts.live = true;
    else if (a === "--headed") opts.headed = true;
    else if (a.startsWith("--mode")) {
      const v = value();
      if (v === "all") continue;
      opts.modes = v.split(",").map((m) => MODES[m.trim()] ?? fail(`unknown mode "${m}" (use 30, 60, 180, 30s, 1m, 3m or all)`));
    } else if (a.startsWith("--wpm")) {
      opts.wpm = Number(value());
      if (!(opts.wpm >= 20 && opts.wpm <= 120)) fail("--wpm must be 20-120");
    } else if (a === "--help" || a === "-h") {
      console.log("usage: npm run bot -- [--mode 30|60|180|all] [--save [--live]] [--headed] [--wpm N]");
      process.exit(0);
    } else fail(`unknown option ${a}`);
  }
  if (opts.live && !opts.save) fail("--live only makes sense with --save");
  return opts;
}

function fail(msg) {
  console.error(`bot: ${msg}`);
  process.exit(1);
}

// --- timing -----------------------------------------------------------------

const rand = (a, b) => a + Math.random() * (b - a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Normal sample (Box-Muller).
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());

// Keys that sit next to each other on QWERTY, for believable typos.
const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
function neighbour(ch) {
  const r = ROWS.findIndex((row) => row.includes(ch));
  if (r < 0) return "e";
  const c = ROWS[r].indexOf(ch);
  const near = [ROWS[r][c - 1], ROWS[r][c + 1], ROWS[r - 1]?.[c], ROWS[r + 1]?.[c]].filter(Boolean);
  return near[Math.floor(Math.random() * near.length)];
}

// Paces keys so the round averages `wpm` (5 characters a word, the space
// included). Each gap is jittered around a mean that is nudged toward the
// target as the round goes, so typos and pauses don't drag the speed down.
class Pacer {
  constructor(wpm) {
    this.msPerChar = 60000 / (wpm * 5);
    this.mean = this.msPerChar * 0.8;
    this.start = null;
    this.chars = 0;
  }
  // Called for each character that counts toward speed (letters and spaces of words).
  count() {
    this.chars++;
    if (this.start === null) this.start = Date.now();
    const behind = Date.now() - this.start - this.chars * this.msPerChar;
    // Positive when slower than target: shorten the gaps a little (bounded).
    const target = this.msPerChar * 0.8 - behind / 8;
    this.mean = Math.min(this.msPerChar * 1.2, Math.max(this.msPerChar * 0.5, target));
  }
  // Time from one key down to the next, hold included.
  interval() {
    return Math.max(60, this.mean * (1 + 0.3 * gauss()));
  }
  hold() {
    return rand(25, 70);
  }
}

// --- one round --------------------------------------------------------------

const roundOver = (page) => page.locator(".modal .score-number").count().then((n) => n > 0);

async function press(page, pacer, key) {
  const t0 = Date.now();
  const interval = pacer.interval();
  const hold = Math.min(pacer.hold(), interval * 0.6);
  await page.keyboard.down(key);
  await sleep(hold);
  await page.keyboard.up(key);
  await sleep(interval - (Date.now() - t0));
}

// Types one word with human timing and maybe a typo it fixes. Returns false
// when the round ended mid-word.
async function typeWord(page, pacer, word) {
  const typoAt = Math.random() < 0.08 ? Math.floor(Math.random() * word.length) : -1;
  for (let i = 0; i < word.length; i++) {
    if (i === typoAt) {
      // Wrong key, sometimes one more letter before noticing, a short stop, then fix.
      const extra = Math.random() < 0.4 && i + 1 < word.length ? 1 : 0;
      await press(page, pacer, neighbour(word[i]));
      for (let k = 0; k < extra; k++) await press(page, pacer, word[i + 1 + k]);
      await sleep(rand(150, 400));
      for (let k = 0; k <= extra; k++) await press(page, pacer, "Backspace");
    }
    await press(page, pacer, word[i]);
    pacer.count();
  }
  if (await roundOver(page)) return false;
  // Space, then the pause a person takes to read the next word.
  await press(page, pacer, " ");
  pacer.count();
  const pause = Math.random() < 0.04 ? rand(400, 900) : rand(40, 160);
  await sleep(pause);
  return true;
}

async function playRound(page, duration, wpm) {
  await page.locator(".timer-option", { hasText: LABEL[duration] }).click();
  // The click gives the button focus; drop it so keys go to the game.
  await page.evaluate(() => document.activeElement?.blur());
  const pacer = new Pacer(wpm);
  const current = page.locator(".words-container .word.current");
  const next = page.locator(".words-container .word").nth(4);
  const started = Date.now();
  let words = 0;
  while (!(await roundOver(page))) {
    if (Date.now() - started > (duration + 30) * 1000) throw new Error("round did not end in time");
    const word = (await current.textContent()).trim();
    const upcoming = (await next.textContent()).trim();
    if (!(await typeWord(page, pacer, word))) break;
    words++;
    // Wait until the row moved on (the next word became current).
    await page.waitForFunction(
      (w) => document.querySelector(".words-container .word.current")?.textContent.trim() === w ||
        document.querySelector(".modal .score-number"),
      upcoming,
      { timeout: 2000 },
    );
  }
  await page.locator(".modal .score-number").waitFor({ timeout: 5000 });
  const elapsed = (Date.now() - started) / 1000;
  const netWpm = (await page.locator(".modal .score-number").textContent()).trim();
  const values = await page.locator(".modal .result-item .result-value").allTextContents();
  return { netWpm, precision: values[0], wordsTyped: values[1], wordsCorrect: values[2], botWords: words, elapsed };
}

async function saveScore(page, name) {
  const unavailable = page.locator(".lb-save-note");
  const input = page.locator(".lb-save .lb-input");
  await Promise.race([input.waitFor({ timeout: 10000 }), unavailable.waitFor({ timeout: 10000 })]);
  if (!(await input.count())) throw new Error(`save not possible: ${await unavailable.textContent()}`);
  await input.fill(name);
  const response = page.waitForResponse((r) => r.url().endsWith("/submit"), { timeout: 15000 });
  await page.locator(".lb-save .lb-save-button").click();
  const res = await response;
  const body = await res.json().catch(() => ({}));
  if (!res.ok()) throw new Error(`save failed: HTTP ${res.status()} ${body.error || ""}`);
  await page.locator(".modal .lb-rank").waitFor({ timeout: 5000 });
  const shown = (await page.locator(".modal .lb-rank strong").textContent()).trim();
  if (shown !== name) throw new Error(`results card shows "${shown}", expected "${name}"`);
  return body;
}

// --- servers ----------------------------------------------------------------

const children = [];
function start(cmd, args, opts) {
  const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], detached: true, ...opts });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  child.log = () => log;
  children.push(child);
  return child;
}
function stopAll() {
  for (const c of children) {
    try {
      process.kill(-c.pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }
}
process.on("exit", stopAll);
process.on("SIGINT", () => process.exit(130));

const freePort = () =>
  new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });

async function waitFor(url, child, what, timeoutMs = 60000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (child && child.exitCode !== null) throw new Error(`${what} exited:\n${child.log()}`);
    try {
      const res = await fetch(url);
      if (res.status < 500) return res;
    } catch {
      // Not up yet.
    }
    await sleep(300);
  }
  throw new Error(`${what} did not start at ${url}${child ? `:\n${child.log()}` : ""}`);
}

async function localWorkerUp() {
  try {
    const res = await fetch(`${LOCAL_WORKER}/top?duration=30&board=alltime&device=desktop&limit=1`);
    return res;
  } catch {
    return null;
  }
}

async function ensureLocalWorker() {
  let res = await localWorkerUp();
  if (!res) {
    const dir = join(ROOT, "leaderboard");
    if (!existsSync(join(dir, ".dev.vars"))) fail("leaderboard/.dev.vars is missing (TOKEN_SECRET=...); see leaderboard/README.md");
    if (!existsSync(join(dir, "node_modules"))) fail("run npm install in leaderboard/ first");
    console.log("Starting the local Worker (wrangler dev) ...");
    const child = start("npx", ["wrangler", "dev", "--port", "8787"], { cwd: dir });
    await waitFor(`${LOCAL_WORKER}/top?duration=30&board=alltime&device=desktop&limit=1`, child, "wrangler dev", 90000);
    res = await localWorkerUp();
  }
  if (!res?.ok) {
    fail(
      `local Worker answered HTTP ${res?.status}. Set up the local D1 (cd leaderboard): ` +
        "npx wrangler d1 execute typemaster-leaderboard --local --file=schema.sql " +
        "(a local D1 from before net WPM scoring needs --file=migrations/0002_net_wpm.sql)",
    );
  }
}

// --- main -------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  // Without --live the game never talks to the live Worker, saving or not.
  const workerUrl = opts.live ? LIVE_WORKER : LOCAL_WORKER;
  if (opts.save && !opts.live) await ensureLocalWorker();
  if (opts.live) console.log(`LIVE: scores will be saved to ${LIVE_WORKER}`);

  const port = await freePort();
  const vite = start(join(ROOT, "node_modules/.bin/vite"), ["--port", String(port), "--strictPort", "--host", "localhost"], {
    cwd: ROOT,
    env: { ...process.env, VITE_LEADERBOARD_URL: workerUrl },
  });
  const gameUrl = `http://localhost:${port}/thetypemaster/`;
  await waitFor(gameUrl, vite, "vite");

  const browser = await chromium.launch({ channel: "chrome", headless: !opts.headed });
  const results = [];
  let nameIndex = Math.floor(Math.random() * BOT_NAMES.length);
  let failed = false;
  try {
    for (const duration of opts.modes) {
      const wpm = opts.wpm ?? Math.round(rand(70, 90));
      const name = BOT_NAMES[nameIndex++ % BOT_NAMES.length];
      console.log(`\n${LABEL[duration]}: playing at ~${wpm} WPM${opts.save ? ` as "${name}"` : " (no save)"} ...`);
      // A fresh context per round: clean localStorage, English words, sound off.
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await context.addInitScript(() => {
        localStorage.setItem("typeMasterLang", "en");
        localStorage.setItem("typeMasterSound", "off");
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      try {
        await page.goto(gameUrl);
        await page.locator(".words-container .word.current").waitFor();
        const r = await playRound(page, duration, wpm);
        if (!(Number(r.netWpm) > 0)) throw new Error(`results card shows no score (${r.netWpm})`);
        if (errors.length) throw new Error(`page errors: ${errors.join("; ")}`);
        let line = `${LABEL[duration]}: net WPM ${r.netWpm}, precision ${r.precision}, words ${r.wordsCorrect}/${r.wordsTyped} correct, round ${r.elapsed.toFixed(1)}s`;
        if (opts.save) {
          const saved = await saveScore(page, name);
          const serverWpm = (saved.result.netWpm10 / 10).toFixed(1);
          if (serverWpm !== r.netWpm) throw new Error(`Worker scored ${serverWpm}, card shows ${r.netWpm}`);
          line += `; saved as "${saved.name}" (all-time #${saved.rank?.alltime?.rank}, weekly #${saved.rank?.weekly?.rank})`;
        }
        console.log(`PASS ${line}`);
        results.push({ duration, ok: true, ...r });
      } catch (err) {
        failed = true;
        console.log(`FAIL ${LABEL[duration]}: ${err.message}`);
        results.push({ duration, ok: false });
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  console.log("\nSummary");
  for (const r of results) {
    console.log(r.ok ? `  ${LABEL[r.duration].padEnd(3)}  net WPM ${r.netWpm.padStart(5)}  precision ${r.precision}` : `  ${LABEL[r.duration].padEnd(3)}  FAILED`);
  }
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`bot: ${err.stack || err.message}`);
  process.exit(1);
});
