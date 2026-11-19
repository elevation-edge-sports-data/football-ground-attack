import type { Object3D } from "three";
import { readPrefs } from "../game/prefs";

/**
 * Field frame. Yards match field.js (length 100, end zones 10, default width 75).
 * World X is canvas X: left sideline 0, right sideline width.
 * World Y is up.
 * World Z is −canvas Y, so north (increasing yard line) is −Z.
 *
 * Width is live. The WIDTH slider runs 10–100 yards in steps of 5.
 */
export const FIELD_WIDTH_MIN = 10;
export const FIELD_WIDTH_MAX = 100;
export const FIELD_WIDTH_STEP = 5;
const DEFAULT_WIDTH = 75;

export function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

/** field.js `clampWidth`, with the narrow end raised to 10. A non-number falls back to 75. */
export function clampFieldWidth(w: unknown) {
  const n = typeof w === "number" ? w : Number.parseInt(String(w ?? ""), 10);
  if (!Number.isFinite(n)) return DEFAULT_WIDTH;
  return clamp(Math.trunc(n), FIELD_WIDTH_MIN, FIELD_WIDTH_MAX);
}

function widthFromPrefs() {
  return clampFieldWidth(readPrefs().field?.width ?? DEFAULT_WIDTH);
}

let width = widthFromPrefs();

export function readFieldWidth() {
  return width;
}

/** Live width used by hashes, uprights, and placement. Does not write prefs. */
export function writeFieldWidth(next: unknown) {
  width = clampFieldWidth(next);
  return width;
}

export const FIELD = {
  length: 100,
  endZone: 10,
  get width() {
    return width;
  },
  postGapFrac: 0.082,
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
/** Right edge of the playable ground. Follows the live field width. */
export function playMaxX() {
  return readFieldWidth() + PLAY_MARGIN;
}
export const PLAY_MIN_YARD = SOUTH_BACK - PLAY_MARGIN;
export const PLAY_MAX_YARD = NORTH_BACK + PLAY_MARGIN;

/**
 * Half the distance between the inner hashes, and half the crossbar.
 * At 50 yards this is 4.1: 20.9 from each hash to the nearer sideline,
 * 8.2 between the hashes, hash ticks 0.656, crossbar 8.2.
 * Those lengths stay the same fraction of every field width.
 */
export function hashHalf(width = FIELD.width) {
  return width * FIELD.postGapFrac;
}

export function hashLeft(width = FIELD.width) {
  return width * 0.5 - hashHalf(width);
}

export function hashRight(width = FIELD.width) {
  return width * 0.5 + hashHalf(width);
}

/**
 * How far a hash tick sticks out from the hash toward the nearer sideline.
 * The field paint uses the same reach.
 */
export function hashReach(width = FIELD.width) {
  return hashHalf(width) * 0.16;
}

/**
 * Sideline end of the hash mark nearest to `x`.
 * An out-of-bounds spot uses this X. It sits on the hash, not on a sideline.
 */
export function hashNearSide(x: number, width = FIELD.width) {
  const reach = hashReach(width);
  const spot = !Number.isFinite(x) || x <= width * 0.5 ? hashLeft(width) - reach : hashRight(width) + reach;
  if (!(width > 0)) return spot;
  return clamp(spot, Math.min(reach, width * 0.5), Math.max(width - reach, width * 0.5));
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
