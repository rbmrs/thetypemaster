// Small, quiet sound cues made with the Web Audio API. No audio files.
// One shared AudioContext, made on the first key press or tap, so browser
// autoplay rules are kept. Without Web Audio every call does nothing.

const SOUND_KEY = "typeMasterSound";

let ctx = null;
let enabled = true;
let lastAt = 0;

try {
  enabled = localStorage.getItem(SOUND_KEY) !== "off";
} catch {
  // No storage: sound stays on, the default.
}

export const soundOn = () => enabled;

export const setSoundOn = (on) => {
  enabled = on;
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    // Private mode: the choice lasts for this visit only.
  }
};

// Make or wake the context. Call it inside a user gesture.
export const unlockSound = () => {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!ctx) ctx = new Ctx();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
};

// One soft tone: a short attack, then an exponential fade to near zero, so
// there is no click at the start or the end.
function tone(ac, { freq, endFreq, type = "sine", peak, duration, delay = 0 }) {
  const start = ac.currentTime + 0.005 + delay;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.008, duration / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

// Phone swipe typing can submit several words in one event; play one cue.
function play(tones) {
  if (!enabled) return;
  const now = Date.now();
  if (now - lastAt < 40) return;
  lastAt = now;
  try {
    const ac = unlockSound();
    if (!ac) return;
    for (const t of tones) tone(ac, t);
  } catch {
    // Sound is a nice extra; never break the game for it.
  }
}

// Correct word: a light, high tick.
export const playCorrect = () => play([{ freq: 1320, type: "triangle", peak: 0.05, duration: 0.05 }]);

// Wrong word: a muted, lower tone that bends down a little.
export const playWrong = () => play([{ freq: 220, endFreq: 180, peak: 0.07, duration: 0.12 }]);

// Time up: one gentle chime, a G5 with a soft octave above.
export const playTimeUp = () =>
  play([
    { freq: 784, peak: 0.06, duration: 0.45 },
    { freq: 1568, peak: 0.02, duration: 0.3 },
  ]);
