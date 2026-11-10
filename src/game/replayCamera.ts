/**
 * Extra camera moves that apply only while instant replay is open.
 * Live play never reads these. Closing replay asks the orbit camera
 * to sit back behind the carrier.
 */

const DEFAULT_Y = 17.1;
const DEFAULT_Z = 16;
const DEFAULT_DIST = Math.hypot(DEFAULT_Y, DEFAULT_Z);
const DEFAULT_PITCH = Math.asin(DEFAULT_Y / DEFAULT_DIST);

/** Ground point the replay camera is looking at. The on-field X reads this. */
export const replayFocus = { x: 0, y: 0.08, z: 0, on: false };

export function markReplayFocus(x: number, z: number, on: boolean) {
  replayFocus.on = on;
  if (!on) return;
  replayFocus.x = x;
  replayFocus.y = 0.08;
  replayFocus.z = z;
}

export const replayCam = {
  on: false,
  /** One frame: sit at the normal offset behind the scrubbed carrier. */
  snap: false,
  /** One frame after replay closes: sit behind the live carrier. */
  exitSnap: false,
  /** Track the scrubbed carrier. Off leaves the orbit where it is. */
  follow: true,
  /** One frame: keep this eye offset while the look point jumps to a new mark. */
  snapOffset: null as { x: number; y: number; z: number } | null,
};

/** Center the replay camera on a new mark without changing the orbit distance. */
export function replayFocusJump(x: number, y: number, z: number) {
  replayCam.follow = true;
  replayCam.snapOffset = { x, y, z };
}

const held = new Set<string>();

export function setReplayCamera(on: boolean) {
  if (replayCam.on === on) return;
  replayCam.on = on;
  held.clear();
  replayCam.follow = true;
  replayCam.snapOffset = null;
  if (!on) replayCam.exitSnap = true;
}

export function replaySnapFollow() {
  if (!replayCam.on) return;
  replayCam.snap = true;
}

export function replayKeyDown(code: string) {
  if (!replayCam.on) return;
  held.add(code);
}

export function replayKeyUp(code: string) {
  held.delete(code);
}

export function replayHeld() {
  return held;
}

export function defaultReplaySphere() {
  return { dist: DEFAULT_DIST, yaw: 0, pitch: DEFAULT_PITCH };
}

export function sphereFromOffset(x: number, y: number, z: number) {
  const dist = Math.max(0.001, Math.hypot(x, y, z));
  return {
    dist,
    yaw: Math.atan2(x, z),
    pitch: Math.asin(Math.max(-1, Math.min(1, y / dist))),
  };
}

export function offsetFromSphere(sphere: { dist: number; yaw: number; pitch: number }) {
  const horiz = Math.cos(sphere.pitch) * sphere.dist;
  return {
    x: Math.sin(sphere.yaw) * horiz,
    y: Math.sin(sphere.pitch) * sphere.dist,
    z: Math.cos(sphere.yaw) * horiz,
  };
}
