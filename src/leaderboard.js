// Client for the leaderboard Worker (leaderboard/ in this repo).
// The one config spot: set VITE_LEADERBOARD_URL to point the game at another Worker.
export const LEADERBOARD_URL = (
  import.meta.env.VITE_LEADERBOARD_URL || "https://typemaster-leaderboard.rbmrs.workers.dev"
).replace(/\/$/, "");

export const NAME_KEY = "typeMasterName";
export const NAME_RE = /^[A-Za-z0-9 _-]{2,16}$/;

export const cleanName = (raw) => raw.trim().replace(/\s+/g, " ");

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
  post("/start", { duration })
    .then((d) => d.token || null)
    .catch(() => null);

export const submitScore = (payload) => post("/submit", payload);

export const fetchTop = async (duration, board) => {
  const res = await fetch(`${LEADERBOARD_URL}/top?duration=${duration}&board=${board}&limit=10`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).rows;
};

const ADJECTIVES = [
  "Swift", "Calm", "Bold", "Quick", "Quiet", "Brave", "Clever", "Lucky", "Sly", "Keen",
  "Witty", "Nimble", "Sunny", "Gentle", "Rapid", "Steady", "Bright", "Jolly", "Proud", "Zesty",
];
const ANIMALS = [
  "Otter", "Heron", "Lynx", "Falcon", "Badger", "Fox", "Panda", "Gecko", "Raven", "Koala",
  "Marten", "Puffin", "Ibex", "Tapir", "Walrus", "Wombat", "Bison", "Moose", "Lemur", "Owl",
];
const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const randomName = () => `${pick(ADJECTIVES)} ${pick(ANIMALS)}`;

export const BOARDS = [
  { id: "alltime", label: "All-time" },
  { id: "weekly", label: "This week" },
];
