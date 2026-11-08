/**
 * Extra camera moves that apply only while instant replay is open.
 * Live play never reads these. Closing replay asks the orbit camera
 * to sit back behind the carrier.
 */

const DEFAULT_Y = 17.1;
const DEFAULT_Z = 16;
const DEFAULT_DIST = Math.hypot(DEFAULT_Y, DEFAULT_Z);
const DEFAULT_PITCH = Math.asin(DEFAULT_Y / DEFAULT_DIST);

export const replayCam = {
  on: false,
  /** One frame: sit at the normal offset behind the scrubbed carrier. */
  snap: false,
  /** One frame after replay closes: sit behind the live carrier. */
  exitSnap: false,
  /** Track the scrubbed carrier. Off leaves the orbit where it is. */
  follow: true,
};

const held = new Set<string>();

export function setReplayCamera(on: boolean) {
  if (replayCam.on === on) return;
  replayCam.on = on;
  held.clear();
  replayCam.follow = true;
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
