/**
 * Ball-carrier poses. Type 1 is the left leg forward, type 2 the right.
 * One stride is one step, so the type flips every stride length.
 * The canvas gait keeps that step near 2 yards from a jog through a sprint.
 */
export const STRIDE_YARDS = 2;

export type StrideType = 1 | 2;

export type CarrierAction =
  | "carry"
  | "jukeL"
  | "jukeR"
  | "stiffL"
  | "stiffR"
  | "truck"
  | "hurdle"
  | "hurdleL"
  | "hurdleR"
  | "shakeL"
  | "shakeR"
  | "hesitate left"
  | "hesitate right"
  | "spin"
  | "spinL"
  | "spinR"
  | "sprint"
  | "dive";

export function isHurdle(action: CarrierAction): action is "hurdle" | "hurdleL" | "hurdleR" {
  return action === "hurdle" || action === "hurdleL" || action === "hurdleR";
}

/** Shake sells one way, crosses back, then finishes as a full juke. */
export const SHAKE_P1 = 0.2;
export const SHAKE_P2 = 0.25;
export const SHAKE_P2_END = SHAKE_P1 + SHAKE_P2;

/** Hesitate holds one pose while the runner gives ground. */
export const DEAD_TIME = 0.4;

/** Spin plants with a short juke, then turns. The turn has no third phase. */
export const SPIN_P1 = 0.25;
export const SPIN_P2 = 0.4;
export const SPIN_TIME = SPIN_P1 + SPIN_P2;

export type ScriptAction = "shakeL" | "shakeR" | "hesitate left" | "hesitate right" | "spinL" | "spinR";

export function isScript(action: CarrierAction): action is ScriptAction {
  return (
    action === "shakeL" ||
    action === "shakeR" ||
    action === "hesitate left" ||
    action === "hesitate right" ||
    action === "spinL" ||
    action === "spinR"
  );
}

export function isSpinBurst(action: CarrierAction): action is "spinL" | "spinR" {
  return action === "spinL" || action === "spinR";
}

/** Each dive pose holds this long, in order: dive A, dive B, dive C. */
export const DIVE_POSE_TIME = 0.4;
const DIVE_POSES = ["dive A", "dive B", "dive C"] as const;

export function oppositeStride(type: StrideType): StrideType {
  return type === 1 ? 2 : 1;
}

/** Fold distance into whole strides. Extra yards stay on the current step. */
export function advanceStride(type: StrideType, travel: number, distance: number): { type: StrideType; travel: number } {
  let nextType = type;
  let nextTravel = travel + Math.max(0, distance);
  while (nextTravel >= STRIDE_YARDS) {
    nextTravel -= STRIDE_YARDS;
    nextType = oppositeStride(nextType);
  }
  return { type: nextType, travel: nextTravel };
}

/**
 * Pose name for the action.
 * `stride` is the step to show. A hurdle uses both types, one after the other.
 */
export function carrierPoseName(action: CarrierAction, stride: StrideType, diveTime = 0): string {
  switch (action) {
    case "jukeL":
      return "juke left";
    case "jukeR":
      return "juke right";
    case "shakeL":
    case "shakeR": {
      const left = action === "shakeL";
      if (diveTime < SHAKE_P1) return left ? "shake left" : "shake right";
      if (diveTime < SHAKE_P2_END) return left ? "juke right" : "juke left";
      return left ? "juke left" : "juke right";
    }
    case "hesitate left":
    case "hesitate right":
      return "hesitate";
    case "spinL":
    case "spinR": {
      const left = action === "spinL";
      if (diveTime < SPIN_P1) return left ? "juke right" : "juke left";
      return left ? "spin left" : "spin right";
    }
    case "stiffL":
      return stride === 1 ? "stiff arm left 1" : "stiff arm left 2";
    case "stiffR":
      return stride === 1 ? "stiff arm right 1" : "stiff arm right 2";
    case "truck":
      return stride === 1 ? "truck 1" : "truck 2";
    case "hurdle":
    case "hurdleL":
    case "hurdleR":
      return stride === 1 ? "hurdle 1" : "hurdle 2";
    case "sprint":
      return stride === 1 ? "sprint 1" : "sprint 2";
    case "dive": {
      const index = Math.min(DIVE_POSES.length - 1, Math.floor(Math.max(0, diveTime) / DIVE_POSE_TIME));
      return DIVE_POSES[index] ?? "dive A";
    }
    default:
      return stride === 1 ? "carry 1" : "carry 2";
  }
}

/** Stiff-arm right keeps the ball in the left hand. Every other carry pose uses the right. */
export function poseBallSide(pose: string): "l" | "r" {
  return pose === "stiff arm right 1" || pose === "stiff arm right 2" ? "l" : "r";
}

/** First match wins. Existing specials stay ahead of dive and sprint. */
export function carrierAction(flags: {
  jukeL: boolean;
  jukeR: boolean;
  stiffL: boolean;
  stiffR: boolean;
  hurdle: boolean;
  hurdleL: boolean;
  hurdleR: boolean;
  truck: boolean;
  shakeL: boolean;
  shakeR: boolean;
  deadL: boolean;
  deadR: boolean;
  spin: boolean;
  dive: boolean;
  sprint: boolean;
}): CarrierAction {
  if (flags.jukeL) return "jukeL";
  if (flags.jukeR) return "jukeR";
  if (flags.stiffL) return "stiffL";
  if (flags.stiffR) return "stiffR";
  if (flags.hurdleL) return "hurdleL";
  if (flags.hurdleR) return "hurdleR";
  if (flags.hurdle) return "hurdle";
  if (flags.truck) return "truck";
  if (flags.shakeL) return "shakeL";
  if (flags.shakeR) return "shakeR";
  if (flags.deadL) return "hesitate left";
  if (flags.deadR) return "hesitate right";
  if (flags.spin) return "spin";
  if (flags.dive) return "dive";
  if (flags.sprint) return "sprint";
  return "carry";
}
