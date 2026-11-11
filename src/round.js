// The round clock and the times the lead needs (see roundLead in scoring.js).
//
// Times are in ms on the performance.now() clock (event.timeStamp uses the
// same clock). The round starts at the first letter key and ends at exactly
// start + duration: a key at or after that time does not count.

import { roundLead } from "./scoring.js";

export class RoundTrace {
  constructor(duration, start) {
    this.duration = duration;
    this.endMs = duration * 1000;
    this.start = start;
    this.ended = false;
    // [ms since start, change in net characters] per sent word.
    this.steps = [];
    // ms since start of each letter in the word being typed (Backspace removes the last).
    this.letters = [];
  }

  // ms since the first key.
  at(t) {
    return Math.max(0, Math.floor(t - this.start));
  }

  // True when `t` is at or after the end of the round.
  over(t) {
    return t - this.start >= this.endMs;
  }

  // ms left at `t` (0 at the end).
  left(t) {
    return Math.max(0, this.endMs - (t - this.start));
  }

  letter(t) {
    this.letters.push(this.at(t));
  }

  backspace() {
    this.letters.pop();
  }

  // A sent word: `step` from wordStep (letters + 1, or -5).
  word(t, step) {
    this.steps.push([this.at(t), step]);
    this.letters = [];
  }

  // The round's lead. `prefix`: the correct start of the unfinished word
  // (correctPrefix); those letters count at the time of the last one.
  lead(prefix = 0) {
    const steps = prefix > 0 ? [...this.steps, [this.letters[prefix - 1] ?? 0, prefix]] : this.steps;
    return roundLead(steps, this.duration);
  }
}

// When an input event happened, on the performance.now() clock. Uses the
// event's timeStamp when it is on that clock (it is the time of the key, not
// of the handler), else now.
export function eventTime(e) {
  const now = performance.now();
  const ts = (e?.nativeEvent ?? e)?.timeStamp;
  return typeof ts === "number" && ts > now - 1000 && ts <= now ? ts : now;
}
