/**
 * Who the defense camera centers on.
 * The ball carrier is the opening choice, and again when the user takes defense.
 * The crosshair switches to the controlled player and back.
 * Offense, replay, and the practice spot marker ignore this.
 */
export type CameraCenter = "user" | "carrier";

let center: CameraCenter = "carrier";
const listeners = new Set<() => void>();

function publish() {
  for (const listener of listeners) listener();
}

export function readCameraCenter(): CameraCenter {
  return center;
}

export function setCameraCenter(next: CameraCenter) {
  if (center === next) return;
  center = next;
  publish();
}

export function toggleCameraCenter() {
  center = center === "user" ? "carrier" : "user";
  publish();
}

export function subscribeCameraCenter(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
