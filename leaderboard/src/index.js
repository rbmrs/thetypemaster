// Type Master leaderboard: Cloudflare Worker + D1.
//
//   POST /start  {duration, device}          -> {token}
//   POST /submit {token, name, correctChars, letterKeys, correctLetterKeys, wordsTyped, wordsCorrect, lead}
//                                            -> {name, device, result, rank, top}
//   GET  /top?duration=30&board=alltime|weekly&device=desktop|phone&limit=10 -> {rows}
//
// Desktop and phone rounds have separate boards. The device comes from the
// browser at /start and is signed into the round token, so a player could
// fake it; that is accepted.
//
// Anti-cheat is "good enough": a signed, single-use round token with a
// minimum and maximum age, plausibility checks against the game's scoring,
// and a per-IP rate limit (only a salted hash of the IP is stored).
//
// The game sends raw counts; the Worker computes the score (net characters
// per minute), net WPM and precision itself with the game's own scoring code
// (src/scoring.js).
//
// Ranking: net characters (correct characters - 5 per wrong word), then
// fewer wrong words, then lead (ahead for longer), then the earlier entry.

import { WRONG_WORD_CHARS, netCpm, scoreRound } from "../../src/scoring.js";

const DURATIONS = [30, 60, 180];
const DEVICES = ["desktop", "phone"];
const START_SLACK_MS = 2000; // a submit may come this much before `duration` elapses
const TOKEN_MAX_AGE_MS = 10 * 60 * 1000;
const RATE_LIMIT = 10; // submit attempts per hour per IP
const MAX_WPM = 250; // character WPM (correct characters / 5 per minute)
const MAX_WORD_LEN = 8; // longest word in src/words.js and src/words-pt.js (test/words.test.js)
const MIN_WORD_LEN = 3; // shortest word, same lists
const MAX_KEYS_PER_SEC = 25; // letter keys, a loose cap
const TOP_CACHE_SECONDS = 30;

const ALLOWED_ORIGIN = "https://rbmrs.dev";
const LOCALHOST_ORIGIN = /^http:\/\/localhost(:\d+)?$/;

const NAME_RE = /^[A-Za-z0-9 _-]{2,16}$/;
// Blocked anywhere in the name (spaces, "_" and "-" removed, lower-case).
const BLOCK_ANYWHERE = ["fuck", "shit", "cunt", "nigg", "whore", "hitler", "kkk"];
// Blocked as a whole word (or plural), or as the whole name joined up, so
// "Peacock", "Dickens" and "Grapefruit" stay allowed.
const BLOCK_WORDS = new Set([
  "fag", "faggot", "bitch", "slut", "rape", "rapist", "nazi", "penis", "vagina", "pussy",
  "porn", "cock", "dick", "dildo", "anal", "ass", "asshole", "retard", "admin", "moderator",
]);

// --- helpers ---------------------------------------------------------------

const enc = new TextEncoder();

function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str) {
  const s = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

async function sign(secret, data) {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(data));
  return b64url(new Uint8Array(sig));
}

async function verify(secret, data, sigB64) {
  try {
    return await crypto.subtle.verify("HMAC", await hmacKey(secret), b64urlDecode(sigB64), enc.encode(data));
  } catch {
    return false;
  }
}

async function ipHash(secret, ip) {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(`${secret}:ip:${ip}`));
  return b64url(new Uint8Array(digest)).slice(0, 32);
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const h = { Vary: "Origin" };
  if (origin === ALLOWED_ORIGIN || LOCALHOST_ORIGIN.test(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Content-Type";
    h["Access-Control-Max-Age"] = "86400";
  }
  return h;
}

function json(request, status, body, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(request), ...extra },
  });
}

const fail = (request, status, error) => json(request, status, { error });

const isInt = (v) => Number.isInteger(v);

// Missing or unknown device counts as desktop.
const cleanDevice = (v) => (DEVICES.includes(v) ? v : "desktop");

// Monday 00:00 UTC of the week that holds `now`.
function weekStart(now) {
  const d = new Date(now);
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysSinceMonday);
}

export function cleanName(raw) {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ");
  if (!NAME_RE.test(name)) return null;
  const flat = name.toLowerCase().replace(/[\s_-]/g, "");
  if (flat.length < 2) return null;
  if (BLOCK_ANYWHERE.some((w) => flat.includes(w))) return null;
  const words = name.toLowerCase().split(/[\s_-]+/).filter(Boolean);
  const blocked = (w) => BLOCK_WORDS.has(w) || (w.endsWith("s") && BLOCK_WORDS.has(w.slice(0, -1)));
  if (blocked(flat) || words.some(blocked)) return null;
  return name;
}

// Returns an error string, or null when the counts are plausible.
// A missing lead (an older game) counts as 0.
export function checkResult({ duration, correctChars, letterKeys, correctLetterKeys, wordsTyped, wordsCorrect, lead = 0 }) {
  const nums = [correctChars, letterKeys, correctLetterKeys, wordsTyped, wordsCorrect];
  if (!nums.every(isInt) || nums.some((n) => n < 0) || wordsTyped < 1) return "bad numbers";
  if (wordsCorrect > wordsTyped) return "wordsCorrect > wordsTyped";
  if (wordsTyped > 8 * duration) return "too many words";
  if (letterKeys > MAX_KEYS_PER_SEC * duration) return "too many keys";
  if (correctLetterKeys > letterKeys) return "correctLetterKeys > letterKeys";

  // Each correct word gives its letters + 1 (space). Shortest word: 3 letters.
  const wc = wordsCorrect;
  if (correctChars < (MIN_WORD_LEN + 1) * wc) return "too few characters";
  // Mean word length + 1 is at most 5.96 (pt list 5.952, sd about 1.03): allow 4.2
  // standard deviations, 5 more, and the unfinished last word's prefix.
  if (correctChars > 5.96 * wc + 4.2 * Math.sqrt(wc) + 5 + MAX_WORD_LEN) return "too many characters";
  if ((correctChars * 12) / duration > MAX_WPM) return "wpm too high";
  // Every counted letter was a letter key, a correct one at that position.
  if (correctChars > letterKeys + wc) return "characters do not match keys";
  if (correctChars - wc > correctLetterKeys) return "characters do not match keys";
  // Lead: each step counts for at most the whole round (duration * 1000 ms),
  // so it lies between all wrong words at the start and all characters at the start.
  if (!isInt(lead)) return "bad lead";
  const endMs = duration * 1000;
  if (lead < -WRONG_WORD_CHARS * (wordsTyped - wordsCorrect) * endMs || lead > correctChars * endMs) return "bad lead";
  return null;
}

// Board order, best first. Also in BEST_CTE and rankOf.
const RANK_ORDER = "net_chars DESC, wrong_words ASC, lead DESC, created_at ASC, id ASC";

// Why a row ranks above the next one when both show the same score (CPM).
function tieBreak(a, b) {
  if (a.net_chars !== b.net_chars) return "chars";
  if (a.wrong_words !== b.wrong_words) return "wrongWords";
  if (a.lead !== b.lead) return "lead";
  return "time";
}

// Best row per name (RANK_ORDER), for one duration and device since `since`.
const BEST_CTE = `
  WITH best AS (
    SELECT * FROM (
      SELECT id, name, name_key, net_wpm10, net_chars, lead, precision, wrong_words, created_at,
             ROW_NUMBER() OVER (PARTITION BY name_key ORDER BY ${RANK_ORDER}) AS rn
      FROM scores WHERE duration = ?1 AND device = ?2 AND created_at >= ?3
    ) WHERE rn = 1
  )`;

// `cpm`: the score shown, net characters per minute. `netWpm10` stays for
// older games. `tieBreak` (only when the next row shows the same CPM): why
// this row ranks above it: "chars", "wrongWords", "lead" or "time".
export async function topRows(env, duration, device, since, limit) {
  const { results } = await env.DB.prepare(
    `${BEST_CTE}
     SELECT id, name, net_wpm10, net_chars, lead, precision, wrong_words, created_at FROM best
     ORDER BY ${RANK_ORDER} LIMIT ?4`,
  )
    .bind(duration, device, since, limit)
    .all();
  const cpm = (r) => netCpm(r.net_chars, duration);
  return results.map((r, i) => {
    const next = results[i + 1];
    const row = {
      name: r.name,
      cpm: cpm(r),
      netWpm10: r.net_wpm10,
      precision: r.precision,
      wrongWords: r.wrong_words,
      date: new Date(r.created_at).toISOString(),
    };
    if (next && cpm(next) === row.cpm) row.tieBreak = tieBreak(r, next);
    return row;
  });
}

// `best`: that best's net WPM in tenths (older games), `bestCpm`: its score.
// `current`: the player's best on this board is the row just saved.
// Rows ahead in RANK_ORDER: DESC columns are negated so one row-value
// comparison covers the whole order.
export async function rankOf(env, duration, device, since, nameKey, rowId) {
  const row = await env.DB.prepare(
    `${BEST_CTE}
     SELECT me.id AS id, me.net_wpm10 AS best, me.net_chars AS best_chars,
       (SELECT COUNT(*) FROM best b
         WHERE (-b.net_chars, b.wrong_words, -b.lead, b.created_at, b.id)
             < (-me.net_chars, me.wrong_words, -me.lead, me.created_at, me.id)
       ) + 1 AS rank
     FROM best me WHERE me.name_key = ?4`,
  )
    .bind(duration, device, since, nameKey)
    .first();
  return row ? { rank: row.rank, best: row.best, bestCpm: netCpm(row.best_chars, duration), current: row.id === rowId } : null;
}

// --- routes ----------------------------------------------------------------

async function handleStart(request, env) {
  const body = await request.json().catch(() => null);
  const duration = Number(body?.duration);
  if (!DURATIONS.includes(duration)) return fail(request, 400, "bad duration");
  const device = cleanDevice(body?.device);
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(12)));
  const payload = `${duration}.${device}.${Date.now()}.${nonce}`;
  const token = `${payload}.${await sign(env.TOKEN_SECRET, payload)}`;
  return json(request, 200, { token });
}

async function handleSubmit(request, env) {
  const now = Date.now();
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const hash = await ipHash(env.TOKEN_SECRET, ip);

  // Rate limit counts every attempt, valid or not.
  const hourAgo = now - 3600 * 1000;
  const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM submit_log WHERE ip_hash = ? AND at > ?")
    .bind(hash, hourAgo)
    .first();
  if (n >= RATE_LIMIT) return fail(request, 429, "too many submits, try again later");
  await env.DB.prepare("INSERT INTO submit_log (ip_hash, at) VALUES (?, ?)").bind(hash, now).run();

  const body = await request.json().catch(() => null);
  if (!body || typeof body.token !== "string") return fail(request, 400, "bad request");

  // Token: "<duration>.<device>.<issuedAt>.<nonce>.<sig>"
  const parts = body.token.split(".");
  if (parts.length !== 5) return fail(request, 400, "bad token");
  const [dStr, device, tStr, nonce, sig] = parts;
  if (!(await verify(env.TOKEN_SECRET, `${dStr}.${device}.${tStr}.${nonce}`, sig))) return fail(request, 400, "bad token");
  const duration = Number(dStr);
  const issuedAt = Number(tStr);
  const age = now - issuedAt;
  if (age < duration * 1000 - START_SLACK_MS) return fail(request, 400, "round not finished");
  if (age > TOKEN_MAX_AGE_MS) return fail(request, 400, "token expired");

  const name = cleanName(body.name);
  if (!name) return fail(request, 400, "bad name");

  // Only the counts are read; any score the client sends is ignored.
  const counts = {
    duration,
    correctChars: body.correctChars,
    letterKeys: body.letterKeys,
    correctLetterKeys: body.correctLetterKeys,
    wordsTyped: body.wordsTyped,
    wordsCorrect: body.wordsCorrect,
    // An older game sends no lead: 0, so its score still saves.
    lead: body.lead === undefined ? 0 : body.lead,
  };
  const problem = checkResult(counts);
  if (problem) return fail(request, 400, problem);
  const result = scoreRound(counts);

  // Single use: the primary key rejects a second insert of the same nonce.
  try {
    await env.DB.prepare("INSERT INTO used_tokens (nonce, used_at) VALUES (?, ?)").bind(nonce, now).run();
  } catch (err) {
    if (String(err?.message).includes("UNIQUE constraint failed")) return fail(request, 400, "token already used");
    throw err; // -> 500
  }

  const nameKey = name.toLowerCase();
  const inserted = await env.DB.prepare(
    `INSERT INTO scores (name, name_key, duration, device, net_wpm10, net_chars, lead, precision, correct_chars,
       letter_keys, correct_letter_keys, words_typed, words_correct, wrong_words, created_at, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      name, nameKey, duration, device, result.netWpm10, result.netChars, counts.lead, result.precision,
      counts.correctChars, counts.letterKeys, counts.correctLetterKeys, counts.wordsTyped, counts.wordsCorrect,
      result.wrongWords, now, hash,
    )
    .run();
  const rowId = inserted.meta.last_row_id;

  const week = weekStart(now);
  const [allRank, weekRank, allTop, weekTop] = await Promise.all([
    rankOf(env, duration, device, 0, nameKey, rowId),
    rankOf(env, duration, device, week, nameKey, rowId),
    topRows(env, duration, device, 0, 10),
    topRows(env, duration, device, week, 10),
  ]);

  // Housekeeping: drop rows no longer needed for checks.
  await env.DB.batch([
    env.DB.prepare("DELETE FROM used_tokens WHERE used_at < ?").bind(now - 2 * TOKEN_MAX_AGE_MS),
    env.DB.prepare("DELETE FROM submit_log WHERE at < ?").bind(hourAgo),
  ]);

  return json(request, 200, {
    name,
    device,
    result,
    rank: { alltime: allRank, weekly: weekRank },
    top: { alltime: allTop, weekly: weekTop },
  });
}

async function handleTop(request, env, ctx, url) {
  const duration = Number(url.searchParams.get("duration") || 30);
  const board = url.searchParams.get("board") || "alltime";
  const device = url.searchParams.get("device") || "desktop";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 10, 1), 10);
  if (!DURATIONS.includes(duration)) return fail(request, 400, "bad duration");
  if (board !== "alltime" && board !== "weekly") return fail(request, 400, "bad board");
  if (!DEVICES.includes(device)) return fail(request, 400, "bad device");

  // Cache the body by normalised URL; CORS headers are added per request.
  const cacheKey = new Request(`${url.origin}/top?duration=${duration}&board=${board}&device=${device}&limit=${limit}`);
  const cache = caches.default;
  let body = null;
  const hit = await cache.match(cacheKey);
  if (hit) body = await hit.text();
  if (!body) {
    const since = board === "weekly" ? weekStart(Date.now()) : 0;
    body = JSON.stringify({ duration, board, device, rows: await topRows(env, duration, device, since, limit) });
    ctx.waitUntil(
      cache.put(cacheKey, new Response(body, { headers: { "Cache-Control": `max-age=${TOP_CACHE_SECONDS}` } })),
    );
  }
  return new Response(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${TOP_CACHE_SECONDS}`,
      ...corsHeaders(request),
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
    try {
      if (request.method === "POST" && url.pathname === "/start") return await handleStart(request, env);
      if (request.method === "POST" && url.pathname === "/submit") return await handleSubmit(request, env);
      if (request.method === "GET" && url.pathname === "/top") return await handleTop(request, env, ctx, url);
      return fail(request, 404, "not found");
    } catch (err) {
      console.error(err);
      return fail(request, 500, "server error");
    }
  },
};
