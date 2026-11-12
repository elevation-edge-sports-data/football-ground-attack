/**
 * v10 gameplay sliders. The panel shows the labeled value (default 1.00).
 * Speed, break block, and break tackle apply the canvas UI scales:
 * labeled 1.00 runs at 1.10, 0.75, and 1.50.
 * A saved set replaces those defaults. The write happens when a slider moves.
 */
import { readPrefs, writePrefs } from "../prefs";
export const SLIDER_MIN = 0.5;
export const SLIDER_MAX = 2;
export const SLIDER_STEP = 0.05;

/** Labeled 1.00× runs at 1.10. The whole scale is +10%. */
export const SPEED_UI_SCALE = 1.1;
/** Labeled 1.00 runs at 0.75. Above 1 sheds sooner. */
export const BREAK_BLOCK_UI_SCALE = 0.75;
/** Labeled 1.00 runs at 1.50. Above 1 means fewer finished tackles. */
export const BREAK_TACKLE_UI_SCALE = 1.5;

export type SliderSnap = {
  you: number;
  mates: number;
  cpu: number;
  speed: number;
  breakBlock: number;
  breakTackle: number;
};

function savedLabeled(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const clamped = Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, value));
  const steps = Math.round((clamped - SLIDER_MIN) / SLIDER_STEP);
  return Number((SLIDER_MIN + steps * SLIDER_STEP).toFixed(2));
}

const savedTuning = readPrefs().tuning;
let youLabeled = savedLabeled(savedTuning?.you) ?? 1;
let matesLabeled = savedLabeled(savedTuning?.mates) ?? 1;
let cpuLabeled = savedLabeled(savedTuning?.cpu) ?? 1;
let speedLabeled = savedLabeled(savedTuning?.speed) ?? 1;
let breakBlockLabeled = savedLabeled(savedTuning?.breakBlock) ?? 1;
let breakTackleLabeled = savedLabeled(savedTuning?.breakTackle) ?? 1;
/** True when the user is the ball carrier. Defense leaves the runner on CPU strength. */
let userOnOffense = true;

let snap: SliderSnap = {
  you: youLabeled,
  mates: matesLabeled,
  cpu: cpuLabeled,
  speed: speedLabeled,
  breakBlock: breakBlockLabeled,
  breakTackle: breakTackleLabeled,
};

const listeners = new Set<() => void>();

function clampLabeled(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, value));
}

function publish() {
  snap = {
    you: youLabeled,
    mates: matesLabeled,
    cpu: cpuLabeled,
    speed: speedLabeled,
    breakBlock: breakBlockLabeled,
    breakTackle: breakTackleLabeled,
  };
  for (const listener of listeners) listener();
}

function write(slot: "you" | "mates" | "cpu" | "speed" | "breakBlock" | "breakTackle", value: number) {
  const next = clampLabeled(value);
  if (slot === "you" && next === youLabeled) return;
  if (slot === "mates" && next === matesLabeled) return;
  if (slot === "cpu" && next === cpuLabeled) return;
  if (slot === "speed" && next === speedLabeled) return;
  if (slot === "breakBlock" && next === breakBlockLabeled) return;
  if (slot === "breakTackle" && next === breakTackleLabeled) return;
  if (slot === "you") youLabeled = next;
  else if (slot === "mates") matesLabeled = next;
  else if (slot === "cpu") cpuLabeled = next;
  else if (slot === "speed") speedLabeled = next;
  else if (slot === "breakBlock") breakBlockLabeled = next;
  else breakTackleLabeled = next;
  publish();
  writePrefs({
    tuning: {
      you: youLabeled,
      mates: matesLabeled,
      cpu: cpuLabeled,
      speed: speedLabeled,
      breakBlock: breakBlockLabeled,
      breakTackle: breakTackleLabeled,
    },
  });
}

/** Labeled slider values. Defaults are 1.00. */
export function readTuning(): SliderSnap {
  return snap;
}

export function subscribeTuning(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setYouStrength(labeled: number) {
  write("you", labeled);
}

export function setMateStrength(labeled: number) {
  write("mates", labeled);
}

export function setCpuStrength(labeled: number) {
  write("cpu", labeled);
}

export function setSpeed(labeled: number) {
  write("speed", labeled);
}

export function setBreakBlock(labeled: number) {
  write("breakBlock", labeled);
}

export function setBreakTackle(labeled: number) {
  write("breakTackle", labeled);
}

export function readYouStrength() {
  return youLabeled;
}

export function readMateStrength() {
  return matesLabeled;
}

export function readCpuStrength() {
  return cpuLabeled;
}

/** Canvas `playSpeed`. Labeled 1.00× is 1.10. */
export function readPlaySpeed() {
  return speedLabeled * SPEED_UI_SCALE;
}

/** Canvas `breakBlock`. Labeled 1.00 is 0.75. */
export function readBreakBlock() {
  return breakBlockLabeled * BREAK_BLOCK_UI_SCALE;
}

/** Canvas `breakTackle`. Labeled 1.00 is 1.50. */
export function readBreakTackle() {
  return breakTackleLabeled * BREAK_TACKLE_UI_SCALE;
}

/** Full-play offense keeps the user on the ball. Defense does not. */
export function setUserOnOffense(on: boolean) {
  userOnOffense = on;
}

/**
 * v10 `offMult` for the carrier, times play speed.
 * Preview and offense use You. Defense uses CPU for the runner.
 */
export function carrierTravelScale(): number {
  return (userOnOffense ? youLabeled : cpuLabeled) * readPlaySpeed();
}

/**
 * v10 `offMult` / `defMult` for everyone except the carrier, times play speed.
 * `userBody` is the controlled defender. Other teammates use mate strength.
 */
export function bodyTravelScale(team: "off" | "def", playingDefense: boolean, userBody: boolean): number {
  const strength = team === "off"
    ? (playingDefense ? cpuLabeled : userBody ? youLabeled : matesLabeled)
    : (!playingDefense ? cpuLabeled : userBody ? youLabeled : matesLabeled);
  return strength * readPlaySpeed();
}
