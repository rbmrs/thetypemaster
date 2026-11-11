// Client for the leaderboard Worker (leaderboard/ in this repo).
// The one config spot: set VITE_LEADERBOARD_URL to point the game at another Worker.
export const LEADERBOARD_URL = (
  import.meta.env?.VITE_LEADERBOARD_URL || "https://typemaster-leaderboard.rbmrs.workers.dev"
).replace(/\/$/, "");

export const NAME_KEY = "typeMasterName";
export const NAME_RE = /^[A-Za-z0-9 _-]{2,16}$/;

export const cleanName = (raw) => raw.trim().replace(/\s+/g, " ");

// The name of the player's last save, or "" when none (or one that no longer
// passes NAME_RE). Rounds save on their own once there is one.
export const storedName = (storage = globalThis.localStorage) => {
  try {
    const name = cleanName(storage?.getItem(NAME_KEY) || "");
    return NAME_RE.test(name) ? name : "";
  } catch {
    return "";
  }
};

// Each round token saves once, even when React runs an effect twice.
const claimed = new WeakSet();
export const claimRound = (token) => {
  if (!token || claimed.has(token)) return false;
  claimed.add(token);
  return true;
};

// A failed save to what the results card shows: `key` is the string key,
// `retry` offers Retry (the token is still good), `ask` shows the name field.
// Worker error text is unchanged English.
export const saveOutcome = (err) => {
  const msg = err?.message;
  if (msg === "bad name") return { key: "badName", retry: false, ask: true };
  if (msg === "token already used") return { key: "alreadySaved", retry: false, ask: false };
  if (msg === "token expired") return { key: "tooOld", retry: false, ask: false };
  // The limit is per hour and the token lasts 10 minutes: no Retry.
  if (err?.status === 429) return { key: "tooMany", retry: false, ask: false };
  // Offline, a server error, or a save a moment too early: worth another try.
  const retry = !err?.status || err.status >= 500 || msg === "round not finished";
  return { key: "saveFailed", retry, ask: false };
};

// Desktop and phone rounds have separate boards. Phones and tablets get the
// html.touch class in index.html; they type on a screen keyboard.
export const DEVICE = globalThis.document?.documentElement.classList.contains("touch") ? "phone" : "desktop";

const post = async (path, body) => {
  const res = await fetch(`${LEADERBOARD_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
};

// Resolves to a round token, or null when the leaderboard is unreachable.
export const startRound = (duration) =>
  post("/start", { duration, device: DEVICE })
    .then((d) => d.token || null)
    .catch(() => null);

export const submitScore = (payload) => post("/submit", payload);

export const fetchTop = async (duration, board, device) => {
  const res = await fetch(`${LEADERBOARD_URL}/top?duration=${duration}&board=${board}&device=${device}&limit=10`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).rows;
};

// Random names per language. Portuguese puts the animal first and uses
// adjectives that fit both genders. Every pair must pass NAME_RE (ASCII, at
// most 16 characters), so no accents.
const NAMES = {
  en: {
    first: [
      "Swift", "Calm", "Bold", "Quick", "Quiet", "Brave", "Clever", "Lucky", "Sly", "Keen",
      "Witty", "Nimble", "Sunny", "Gentle", "Rapid", "Steady", "Bright", "Jolly", "Proud", "Zesty",
    ],
    second: [
      "Otter", "Heron", "Lynx", "Falcon", "Badger", "Fox", "Panda", "Gecko", "Raven", "Koala",
      "Marten", "Puffin", "Ibex", "Tapir", "Walrus", "Wombat", "Bison", "Moose", "Lemur", "Owl",
    ],
  },
  pt: {
    first: [
      "Lontra", "Lince", "Texugo", "Raposa", "Panda", "Corvo", "Coala", "Tucano", "Tatu", "Capivara",
      "Morsa", "Alce", "Coruja", "Jaguar", "Golfinho", "Pinguim", "Esquilo", "Castor", "Arara", "Quati",
    ],
    second: [
      "Veloz", "Feliz", "Audaz", "Leal", "Gentil", "Forte", "Valente", "Alegre", "Livre", "Firme",
      "Nobre", "Tenaz", "Sagaz", "Sutil", "Jovial", "Genial", "Capaz", "Doce", "Rebelde", "Vivaz",
    ],
  },
};
const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const randomName = (lang) => {
  const { first, second } = NAMES[lang] || NAMES.en;
  return `${pick(first)} ${pick(second)}`;
};
