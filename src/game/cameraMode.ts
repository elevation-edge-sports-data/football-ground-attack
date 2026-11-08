/**
 * Live camera modes. Names match hockey-fast-break (`CamMode` / `camMode`).
 * Classic is the opening follow: 16 yards south of the ball, 18 yards up, world up,
 * so stick-up stays north. Chase, broadcast, and high are the other scripted rigs.
 * Freestyle keeps theta / phi / radius across pause and mode switches.
 */
import { FIELD } from "../field/spec";

export type CamMode = "classic" | "chase" | "broadcast" | "high" | "freestyle";

export const CAM_MODES: { id: CamMode; label: string; blurb: string }[] = [
  { id: "classic", label: "Classic", blurb: "Behind the play, looking north" },
  { id: "chase", label: "Chase", blurb: "Third-person behind the ball carrier" },
  { id: "broadcast", label: "Broadcast", blurb: "Sideline TV angle on the ball" },
  { id: "high", label: "High", blurb: "Straight down, north at the top" },
  { id: "freestyle", label: "Freestyle", blurb: "Drag to orbit, scroll to zoom, right-drag to pan" },
];

/** Opening eye in main.tsx: height 18, focus 0.9, 16 yards south (+Z). */
export const CLASSIC_SOUTH = 16;
export const CLASSIC_LIFT = 18 - 0.9;
export const CLASSIC_FOV = 42;

/** Hockey chase distances, in yards. Back is along the carrier's forward. */
export const CHASE_BACK = 7.1;
export const CHASE_HEIGHT = 2.7;
export const CHASE_AHEAD = 0.9;
export const CHASE_LOOK_LIFT = 0.32;
export const CHASE_FOV = 44;

/** West of the left sideline. Length eases 16% of the way from midfield toward the ball. */
export const BROADCAST_X = -8;
export const BROADCAST_Y = 28;
export const BROADCAST_FOV = 44;

export const HIGH_Y = 32;
export const HIGH_FOV = 48;

/** Same lens as Classic so seeding freestyle from the live view does not zoom. */
export const FREESTYLE_FOV = 42;

export const CAM_PHI_MIN = 0.12;
export const CAM_PHI_MAX = Math.PI / 2 - 0.04;
export const CAM_RADIUS_MIN = 2;
export const CAM_RADIUS_MAX = 260;

export type CamPoint = { x: number; y: number; z: number };

export type CamPlacement = {
  eye: CamPoint;
  look: CamPoint;
  up: CamPoint;
  fov: number;
};

export type CamOrbit = { theta: number; phi: number; radius: number };

/** Saved freestyle orbit. Theta 0 is south of the focus (+Z). */
export const freeCam: CamOrbit & { captured: boolean } = {
  theta: 0,
  phi: 0.75,
  radius: Math.hypot(CLASSIC_LIFT, CLASSIC_SOUTH),
  captured: false,
};

let camMode: CamMode = "classic";
const listeners = new Set<() => void>();

export function readCamMode(): CamMode {
  return camMode;
}

export function setCamMode(mode: CamMode) {
  if (camMode === mode) return;
  camMode = mode;
  for (const listener of listeners) listener();
}

export function subscribeCamMode(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Carrier forward on the ground. Field (facingX, facingYard) is world (facingX, 0, -facingYard).
 * North (0, 1) is (0, 0, -1). A zero facing falls back to that north vector.
 */
export function chaseForward(facingX: number, facingYard: number): { x: number; z: number } {
  let x = facingX;
  let z = -facingYard;
  const mag = Math.hypot(x, z);
  if (mag < 1e-4) return { x: 0, z: -1 };
  return { x: x / mag, z: z / mag };
}

export function placeClassic(subject: CamPoint): CamPlacement {
  return {
    eye: { x: subject.x, y: subject.y + CLASSIC_LIFT, z: subject.z + CLASSIC_SOUTH },
    look: { x: subject.x, y: subject.y, z: subject.z },
    up: { x: 0, y: 1, z: 0 },
    fov: CLASSIC_FOV,
  };
}

/**
 * Eye sits behind `forward`. North forward (0, -1) puts the eye at +Z (south):
 * eye.z = subject.z - (-1) * CHASE_BACK.
 */
export function placeChase(subject: CamPoint, forward: { x: number; z: number }): CamPlacement {
  const mag = Math.hypot(forward.x, forward.z) || 1;
  const fx = forward.x / mag;
  const fz = forward.z / mag;
  return {
    eye: {
      x: subject.x - fx * CHASE_BACK,
      y: subject.y + CHASE_HEIGHT,
      z: subject.z - fz * CHASE_BACK,
    },
    look: {
      x: subject.x + fx * CHASE_AHEAD,
      y: subject.y + CHASE_LOOK_LIFT,
      z: subject.z + fz * CHASE_AHEAD,
    },
    up: { x: 0, y: 1, z: 0 },
    fov: CHASE_FOV,
  };
}

export function placeBroadcast(subject: CamPoint): CamPlacement {
  const midZ = -FIELD.length / 2;
  const camZ = midZ + (subject.z - midZ) * 0.16;
  return {
    eye: { x: BROADCAST_X, y: BROADCAST_Y, z: camZ },
    look: { x: subject.x, y: subject.y, z: subject.z },
    up: { x: 0, y: 1, z: 0 },
    fov: BROADCAST_FOV,
  };
}

/** North (+yard, -Z) is screen up. A straight-down look needs that up or the picture spins. */
export function placeHigh(subject: CamPoint): CamPlacement {
  return {
    eye: { x: subject.x, y: HIGH_Y, z: subject.z },
    look: { x: subject.x, y: 0, z: subject.z },
    up: { x: 0, y: 0, z: -1 },
    fov: HIGH_FOV,
  };
}

export function placeScripted(
  mode: Exclude<CamMode, "freestyle">,
  subject: CamPoint,
  forward: { x: number; z: number },
): CamPlacement {
  if (mode === "classic") return placeClassic(subject);
  if (mode === "broadcast") return placeBroadcast(subject);
  if (mode === "high") return placeHigh(subject);
  return placeChase(subject, forward);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/** Spherical offset. Theta 0 is +Z. Phi 0 is straight up. This is the only rebuild of that frame. */
export function orbitFromOffset(dx: number, dy: number, dz: number): CamOrbit {
  const radius = clamp(Math.max(1e-4, Math.hypot(dx, dy, dz)), CAM_RADIUS_MIN, CAM_RADIUS_MAX);
  const phi = clamp(Math.acos(clamp(dy / radius, -1, 1)), CAM_PHI_MIN, CAM_PHI_MAX);
  return { theta: Math.atan2(dx, dz), phi, radius };
}

export function eyeFromOrbit(focus: CamPoint, orbit: CamOrbit): CamPoint {
  const sp = Math.sin(orbit.phi);
  const cp = Math.cos(orbit.phi);
  return {
    x: focus.x + orbit.radius * sp * Math.sin(orbit.theta),
    y: focus.y + orbit.radius * cp,
    z: focus.z + orbit.radius * sp * Math.cos(orbit.theta),
  };
}

/**
 * Angle passed to OrbitControls.rotateLeft.
 * Positive decreases theta, so from the south the eye moves toward -X (west).
 * Stick-right matches a mouse drag to the right. Key-east (E or ]) is the replay yaw and moves the eye toward +X.
 */
export function orbitYawCommand(stickRight: number, keyEast: number) {
  return stickRight * 2.15 - keyEast * 1.1;
}

/** Angle passed to OrbitControls.rotateUp. Positive lowers phi, so the eye rises. */
export function orbitPitchCommand(stickUp: number, keyUp: number) {
  return stickUp * 1.35 + keyUp * 0.7;
}

export function writeFreeCam(dx: number, dy: number, dz: number) {
  const orbit = orbitFromOffset(dx, dy, dz);
  freeCam.theta = orbit.theta;
  freeCam.phi = orbit.phi;
  freeCam.radius = orbit.radius;
  freeCam.captured = true;
}

export function selfTestCameras() {
  const subject = { x: 37.5, y: 0.9, z: -50 };
  const classic = placeClassic(subject);
  if (Math.abs(classic.eye.x - 37.5) > 1e-6) throw new Error("classic eye x");
  if (Math.abs(classic.eye.y - 18) > 1e-6) throw new Error("classic eye y");
  if (Math.abs(classic.eye.z - -34) > 1e-6) throw new Error("classic eye z");
  if (classic.up.y !== 1 || classic.fov !== 42) throw new Error("classic up/fov");

  const north = chaseForward(0, 1);
  if (Math.abs(north.x) > 1e-6 || Math.abs(north.z + 1) > 1e-6) throw new Error("north forward");
  const chase = placeChase(subject, north);
  if (!(chase.eye.z > subject.z)) throw new Error("chase north eye should sit south");
  if (Math.abs(chase.eye.x - subject.x) > 1e-6) throw new Error("chase north eye x");
  if (!(chase.look.z < subject.z)) throw new Error("chase north look should lead north");

  const east = placeChase(subject, chaseForward(1, 0));
  if (!(east.eye.x < subject.x)) throw new Error("chase east eye should sit west");

  const high = placeHigh(subject);
  if (high.eye.y !== HIGH_Y || high.up.z !== -1 || high.up.y !== 0) throw new Error("high placement");
  if (high.look.y !== 0) throw new Error("high look");

  const atMid = placeBroadcast(subject);
  if (atMid.eye.x !== BROADCAST_X) throw new Error("broadcast x");
  if (Math.abs(atMid.eye.z - subject.z) > 1e-6) throw new Error("broadcast midfield z");

  const orbit = orbitFromOffset(classic.eye.x - subject.x, classic.eye.y - subject.y, classic.eye.z - subject.z);
  const back = eyeFromOrbit(subject, orbit);
  if (Math.abs(back.x - classic.eye.x) > 1e-4) throw new Error("orbit x");
  if (Math.abs(back.y - classic.eye.y) > 1e-4) throw new Error("orbit y");
  if (Math.abs(back.z - classic.eye.z) > 1e-4) throw new Error("orbit z");
  if (!(orbitYawCommand(1, 0) > 0)) throw new Error("stick right should rotateLeft positive");
  if (!(orbitYawCommand(0, 1) < 0)) throw new Error("key east should rotateLeft negative");
  if (!(orbitPitchCommand(1, 0) > 0 && orbitPitchCommand(0, 1) > 0)) throw new Error("pitch up");
}
