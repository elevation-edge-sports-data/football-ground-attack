import type { Object3D } from "three";

/**
 * Field frame. Yards match field.js (length 100, end zones 10, width 75).
 * World X is canvas X: left sideline 0, right sideline width.
 * World Y is up.
 * World Z is −canvas Y, so north (increasing yard line) is −Z.
 */
export const FIELD = {
  length: 100,
  endZone: 10,
  width: 75,
  postGapFrac: 0.082,
  postGapMin: 2.6,
  postGapMax: 9,
  grassLight: "#5d8f4a",
  grassDark: "#4e7d3e",
  line: "#ecf0e6",
  endPrimary: "#002244",
  endSecondary: "#fb4f14",
  apron: "#121a16",
  sky: "#1c3144",
} as const;

export const SOUTH_BACK = -FIELD.endZone;
export const NORTH_BACK = FIELD.length + FIELD.endZone;

/**
 * How far a spot may sit past either goal line.
 * Goal lines are yard 0 and yard 100. Just outside is this far into the end zone.
 */
export const SPOT_PAST_GOAL = 0.5;
export const SPOT_YARD_MIN = -SPOT_PAST_GOAL;
export const SPOT_YARD_MAX = FIELD.length + SPOT_PAST_GOAL;

/**
 * Playable ground past the painted field.
 * Sidelines are x = 0 and x = width. End lines are the back of each end zone.
 * Players are not pinned to the paint; they stop at this outer rectangle.
 */
export const PLAY_MARGIN = 5;
export const PLAY_MIN_X = -PLAY_MARGIN;
export const PLAY_MAX_X = FIELD.width + PLAY_MARGIN;
export const PLAY_MIN_YARD = SOUTH_BACK - PLAY_MARGIN;
export const PLAY_MAX_YARD = NORTH_BACK + PLAY_MARGIN;

export function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

/** Same gap the canvas uses for hashes and the uprights. */
export function hashHalf(width = FIELD.width) {
  return clamp(width * FIELD.postGapFrac, FIELD.postGapMin, FIELD.postGapMax);
}

export function hashLeft(width = FIELD.width) {
  return width * 0.5 - hashHalf(width);
}

export function hashRight(width = FIELD.width) {
  return width * 0.5 + hashHalf(width);
}

export function yardLabel(yard: number) {
  if (yard === 0 || yard === FIELD.length) return "G";
  return String(yard > FIELD.length * 0.5 ? FIELD.length - yard : yard);
}

/** Lay a +Z-facing plane onto the ground. spinZ then turns it about world up. */
export function layFlat(object: Object3D, spinZ = 0) {
  object.rotation.set(0, 0, 0);
  object.rotateX(-Math.PI / 2);
  object.rotateZ(spinZ);
}
