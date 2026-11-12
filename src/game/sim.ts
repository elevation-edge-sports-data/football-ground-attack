import {
  FIELD,
  PLAY_MAX_X,
  PLAY_MAX_YARD,
  PLAY_MIN_X,
  PLAY_MIN_YARD,
  clamp,
} from "../field/spec";
import {
  advanceStride,
  carrierPoseName,
  DEAD_TIME,
  DIVE_POSE_TIME,
  isHurdle,
  isScript,
  isSpinBurst,
  oppositeStride,
  SHAKE_P1,
  SHAKE_P2_END,
  SPIN_P1,
  SPIN_TIME,
  STRIDE_YARDS,
  type CarrierAction,
  type ScriptAction,
  type StrideType,
} from "./carrierPose";
import { carrierTravelScale } from "./sim/tuning";

/** Yards per second while carrying. A few seconds of input crosses the formation. */
const SPEED = 8.5;
/** v10 sprint factor. With fatigue off, a held sprint uses the full multiplier. */
const SPRINT_MULT = 1.38;
const BALL_AHEAD = 0.22;
const BALL_RIGHT = 0.4;
/** Carry height in world units, at the right hand. */
export const BALL_CARRY_Y = 0.95;

export const INITIAL_LOS = 25;

export type Team = "off" | "def";

export type Player = {
  id: string;
  team: Team;
  role: string;
  x: number;
  yard: number;
  /** Unit direction on the field. +facingX is the right sideline, +facingYard is north. */
  facingX: number;
  facingYard: number;
  controlled: boolean;
  /** Yards off the ground. The hurdle arc lifts the whole mesh. */
  hop: number;
};

export type Sim = {
  players: Player[];
  ballX: number;
  ballYard: number;
  /** Yard line of the line of scrimmage. Offense is south of it. */
  los: number;
  /**
   * Set when the assignment layer records a play-ending tackle.
   * `step` does not read this. The six-player preview leaves it false.
   */
  playOver: boolean;
  /** Step currently under the ball carrier. 1 is left leg forward. */
  strideType: StrideType;
  /** Yards traveled since the last stride flip. */
  strideTravel: number;
  /** Action shown last step, so a hurdle can latch once. */
  action: CarrierAction;
  /** First hurdle pose. The opposite of the stride active when the hurdle started. */
  hurdleType: StrideType | null;
  /** Heading latched halfway through the first hurdle pose. */
  hurdleLockX: number;
  hurdleLockY: number;
  hurdleLocked: boolean;
  /** Seconds of this frame still inside the hurdle. */
  hurdleDt: number;
  /** Travel heading for this hurdle, relative to velocity when it started. */
  hurdleAimX: number;
  hurdleAimY: number;
  /** Velocity heading this hurdle was aimed from. */
  hurdleHeadX: number;
  hurdleHeadY: number;
  /** Last nonzero field displacement of the carrier. Hurdles aim from this vector. */
  velX: number;
  velY: number;
  /** Burst time at the start of this frame's hurdle slice. Survives the reset at the end. */
  hurdleT0: number;
  /** Hurdle button still held after both poses. The next hurdle waits one stride. */
  hurdleChain: "hurdle" | "hurdleL" | "hurdleR" | null;
  /** Yards run since the hurdle ended, while that button stays down. */
  hurdleGap: number;
  /** Pose name applied to the ball carrier. */
  pose: string;
  /** Special whose burst is running. Carry means none. */
  burst: CarrierAction;
  /** Seconds since that burst started. */
  burstTime: number;
  /**
   * Field direction of the runner's right when the current juke was pressed.
   * Left is the opposite. Taken from the velocity heading at that moment.
   */
  jukeRightX: number;
  jukeRightY: number;
  /**
   * Juke button still held after its slide. The next juke waits until the
   * runner covers one stride. Null when not chaining.
   */
  jukeChain: "jukeL" | "jukeR" | null;
  /** Actual yards since the last juke, while that button stays down. */
  jukeGap: number;
  /** Seconds left in the v10 post-dive get-up. Zero means full speed. */
  diveRecover: number;
  /** Dive button still held after dive C. The next dive waits until one stride. */
  diveChain: boolean;
  /** Yards run since dive C ended, while dive stays held. */
  diveGap: number;
  /** Heading latched halfway through dive A. Held through dive B and the first half of dive C. */
  diveLockX: number;
  diveLockY: number;
  diveLocked: boolean;
  /**
   * Last clear stick toward the runner's right (+1) or left (−1).
   * Zero when the push was straight, slight, or has aged out.
   */
  clearSteerSide: -1 | 0 | 1;
  /** Seconds since that clear stick. A stale push does not pick the spin. */
  clearSteerAge: number;
  /** Heading and the runner's right when a shake, hesitate, or spin was pressed. */
  moveHeadX: number;
  moveHeadY: number;
  moveRightX: number;
  moveRightY: number;
  /** +1 turns a spin toward the runner's left. −1 turns toward the right. */
  spinTurn: number;
  /** This frame's scripted slice. Kind stays set after the burst hands back to a run. */
  scriptKind: ScriptAction | null;
  scriptT0: number;
  scriptDt: number;
  scriptEnded: boolean;
  /** Button held through the end of its sequence. Another press waits for a release. */
  moveSpent: CarrierAction | null;
};

export type Input = {
  /** -1 toward the left sideline, +1 toward the right. Stick values stay inside that range. */
  x: number;
  /** -1 south, +1 north. */
  yard: number;
  /** Held Basic special. Carry is normal running. */
  action: CarrierAction;
  /** Sprint is held. Juke wins the action slot, so this stays separate. */
  sprint: boolean;
};

function player(
  id: string,
  team: Team,
  role: string,
  x: number,
  yard: number,
  controlled = false,
): Player {
  const facingYard = team === "def" ? -1 : 1;
  return { id, team, role, x, yard, facingX: 0, facingYard, controlled, hop: 0 };
}

export function createSim(): Sim {
  const mid = FIELD.width * 0.5;
  const los = INITIAL_LOS;
  const qb = player("qb", "off", "QB", mid, los - 1.8, true);
  const sim: Sim = {
    los,
    playOver: false,
    ballX: qb.x,
    ballYard: qb.yard,
    strideType: 1,
    strideTravel: 0,
    action: "carry",
    hurdleType: null,
    hurdleLockX: 0,
    hurdleLockY: 1,
    hurdleLocked: false,
    hurdleDt: 0,
    hurdleAimX: 0,
    hurdleAimY: 1,
    hurdleHeadX: 0,
    hurdleHeadY: 1,
    velX: 0,
    velY: 1,
    hurdleT0: 0,
    hurdleChain: null,
    hurdleGap: 0,
    pose: "carry 1",
    burst: "carry",
    burstTime: 0,
    jukeRightX: 1,
    jukeRightY: 0,
    jukeChain: null,
    jukeGap: 0,
    diveRecover: 0,
    diveChain: false,
    diveGap: 0,
    diveLockX: 0,
    diveLockY: 1,
    diveLocked: false,
    clearSteerSide: 0,
    clearSteerAge: 1,
    moveHeadX: 0,
    moveHeadY: 1,
    moveRightX: 1,
    moveRightY: 0,
    spinTurn: 1,
    scriptKind: null,
    scriptT0: 0,
    scriptDt: 0,
    scriptEnded: false,
    moveSpent: null,
    players: [
      player("ol-l", "off", "OL", mid - 2.3, los - 0.5),
      player("ol-r", "off", "OL", mid + 2.3, los - 0.5),
      qb,
      player("dl-l", "def", "DL", mid - 1.6, los + 1.2),
      player("dl-r", "def", "DL", mid + 1.6, los + 1.2),
      player("lb", "def", "LB", mid, los + 4.2),
    ],
  };
  placeBall(sim, qb);
  return sim;
}

export function controlledPlayer(sim: Sim) {
  return sim.players.find((p) => p.controlled) ?? null;
}

function placeBall(sim: Sim, carrier: Player) {
  // Field right of forward (facingX, facingYard). North → +X. Matches forward × up in world.
  const rightX = carrier.facingYard;
  const rightYard = -carrier.facingX;
  sim.ballX = clamp(carrier.x + carrier.facingX * BALL_AHEAD + rightX * BALL_RIGHT, PLAY_MIN_X, PLAY_MAX_X);
  sim.ballYard = clamp(
    carrier.yard + carrier.facingYard * BALL_AHEAD + rightYard * BALL_RIGHT,
    PLAY_MIN_YARD,
    PLAY_MAX_YARD,
  );
}

/** About a shoulder width. Two players closer than twice this get pushed apart. */
const BODY_RADIUS = 0.36;

function separate(sim: Sim) {
  const minDist = BODY_RADIUS * 2;
  const players = sim.players;
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const a = players[i];
        const b = players[j];
        let dx = b.x - a.x;
        let dy = b.yard - a.yard;
        let dist = Math.hypot(dx, dy);
        if (dist >= minDist) continue;
        if (dist < 1e-6) {
          dx = 1;
          dy = 0;
          dist = 1;
        }
        const push = (minDist - dist) * 0.5;
        const nx = dx / dist;
        const ny = dy / dist;
        a.x = clamp(a.x - nx * push, PLAY_MIN_X, PLAY_MAX_X);
        a.yard = clamp(a.yard - ny * push, PLAY_MIN_YARD, PLAY_MAX_YARD);
        b.x = clamp(b.x + nx * push, PLAY_MIN_X, PLAY_MAX_X);
        b.yard = clamp(b.yard + ny * push, PLAY_MIN_YARD, PLAY_MAX_YARD);
      }
    }
  }
}

/**
 * Open-field canvas bursts. A juke slides one stride, 90 degrees off the
 * heading from when it was pressed. A hurdle covers two strides.
 * Truck adds north. Other times match the canvas move lengths.
 */
const JUKE_TIME = 0.4;
const HURDLE_PHASE = 0.4;
const HURDLE_TIME = HURDLE_PHASE * 2;
/** Each hurdle pose covers one stride. */
const HURDLE_SPEED = STRIDE_YARDS / HURDLE_PHASE;
/** Lock from the second half of the first pose through the first half of the second. */
const HURDLE_LOCK_AT = HURDLE_PHASE / 2;
const HURDLE_LOCK_END = HURDLE_PHASE + HURDLE_PHASE / 2;
const TRUCK_TIME = 0.85;
const STIFF_TIME = 0.45;
const DIVE_TIME = DIVE_POSE_TIME * 3;
/** v10 getUpT after a dive with no tackle. Speed eases from 0.18× back toward a run. */
const DIVE_GETUP = 0.92;
/** Slowdown starts halfway through dive C, 0.2s before that pose ends. */
const DIVE_SLOW_AT = DIVE_TIME - DIVE_POSE_TIME / 2;
/** Direction lock starts halfway through dive A and ends with the slowdown. */
const DIVE_LOCK_AT = DIVE_POSE_TIME / 2;
/** One stride over the juke window. The stick does not add to this. */
const JUKE_SPEED = STRIDE_YARDS / JUKE_TIME;
/** Sprint steps are ~22% shorter than carry steps, so the poses alternate that much faster. */
const SPRINT_GAIT = 1.225;
const TRUCK_FORWARD = 1.15;
/** Canvas stiff reach, and 2.1 * 8 yards/sec away from the carrier. */
const STIFF_REACH = 3.35;
const STIFF_PUSH = 2.1 * 8;

type SpecialMotion = {
  extraX: number;
  extraY: number;
  speedMul: number;
  hop: number;
  stiffSide: -1 | 0 | 1;
};

const NO_SPECIAL: SpecialMotion = { extraX: 0, extraY: 0, speedMul: 1, hop: 0, stiffSide: 0 };

/** v10 get-up curve. At the start of the 0.92s, speed is 0.18×. It rises to 0.88×. */
function diveGetUpFactor(remaining: number) {
  const rise = 1 - Math.min(1, remaining / DIVE_GETUP);
  return 0.18 + 0.7 * rise * rise;
}

function moveDuration(action: CarrierAction) {
  switch (action) {
    case "jukeL":
    case "jukeR":
      return JUKE_TIME;
    case "shakeL":
    case "shakeR":
      return SHAKE_P2_END + JUKE_TIME;
    case "hesitate left":
    case "hesitate right":
      return DEAD_TIME;
    case "spinL":
    case "spinR":
      return SPIN_TIME;
    case "hurdle":
    case "hurdleL":
    case "hurdleR":
      return HURDLE_TIME;
    case "truck":
      return TRUCK_TIME;
    case "stiffL":
    case "stiffR":
      return STIFF_TIME;
    case "dive":
      return DIVE_TIME;
    default:
      return 0;
  }
}

/** Canvas burst at `moveTime` seconds into the special. Past the window, the pose can remain with no extra motion. */
export function specialMotion(action: CarrierAction, moveTime: number): SpecialMotion {
  const dur = moveDuration(action);
  if (dur <= 0 || moveTime <= 0 || moveTime > dur) return NO_SPECIAL;
  switch (action) {
    case "jukeL":
    case "jukeR":
      return { extraX: 0, extraY: 0, speedMul: 0, hop: 0, stiffSide: 0 };
    case "hurdle":
    case "hurdleL":
    case "hurdleR":
      return {
        extraX: 0,
        extraY: 0,
        speedMul: 0,
        hop: 0,
        stiffSide: 0,
      };
    case "truck":
      return { extraX: 0, extraY: TRUCK_FORWARD, speedMul: 1.08, hop: 0, stiffSide: 0 };
    case "stiffL":
      return { extraX: 0, extraY: 0, speedMul: 1, hop: 0, stiffSide: -1 };
    case "stiffR":
      return { extraX: 0, extraY: 0, speedMul: 1, hop: 0, stiffSide: 1 };
    default:
      return NO_SPECIAL;
  }
}

/** Runner's right from the heading they had when the juke button went down. */
function latchJukeRight(sim: Sim, carrier: Player) {
  const mag = Math.hypot(carrier.facingX, carrier.facingYard);
  if (mag < 1e-6) {
    sim.jukeRightX = 1;
    sim.jukeRightY = 0;
    return;
  }
  sim.jukeRightX = carrier.facingYard / mag;
  sim.jukeRightY = -carrier.facingX / mag;
}

function headingOf(carrier: Player) {
  const mag = Math.hypot(carrier.facingX, carrier.facingYard);
  if (mag < 1e-6) return { x: 0, y: 1 };
  return { x: carrier.facingX / mag, y: carrier.facingYard / mag };
}

/** Actual travel direction. The stick and the camera are not a substitute. */
function velocityHeading(sim: Sim, carrier: Player) {
  const mag = Math.hypot(sim.velX, sim.velY);
  if (mag > 1e-6) return { x: sim.velX / mag, y: sim.velY / mag };
  return headingOf(carrier);
}

/** Hurdle left and right turn this far off the velocity heading. */
const HURDLE_LEAN = Math.PI / 4;

/**
 * Straight hurdle keeps the velocity heading. Left and right rotate 45° off it.
 * Field right of (hx, hy) is (hy, -hx). A positive turn uses that right.
 * North (0, 1) turned right 45° is (+x, +yard). East (1, 0) turned right 45° is (+x, −yard).
 */
function hurdleAim(which: "hurdle" | "hurdleL" | "hurdleR", heading: { x: number; y: number }) {
  const side = which === "hurdleL" ? -1 : which === "hurdleR" ? 1 : 0;
  if (side === 0) return { x: heading.x, y: heading.y };
  const turn = side * HURDLE_LEAN;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  return {
    x: heading.x * cos + heading.y * sin,
    y: heading.y * cos - heading.x * sin,
  };
}

function beginHurdle(
  sim: Sim,
  which: "hurdle" | "hurdleL" | "hurdleR",
  carrier: Player,
  travel?: { x: number; y: number },
) {
  const given = travel ? Math.hypot(travel.x, travel.y) : 0;
  const heading = given > 1e-6 ? { x: travel!.x / given, y: travel!.y / given } : velocityHeading(sim, carrier);
  const aim = hurdleAim(which, heading);
  sim.hurdleHeadX = heading.x;
  sim.hurdleHeadY = heading.y;
  sim.hurdleAimX = aim.x;
  sim.hurdleAimY = aim.y;
  sim.burst = which;
  sim.burstTime = 0;
  sim.hurdleLocked = false;
  sim.hurdleChain = null;
  sim.hurdleGap = 0;
  sim.hurdleType = oppositeStride(sim.strideType);
}

function endHurdle(sim: Sim, which: "hurdle" | "hurdleL" | "hurdleR", stillHeld: boolean) {
  const first = sim.hurdleType ?? oppositeStride(sim.strideType);
  sim.strideType = first;
  sim.strideTravel = 0;
  sim.burst = "carry";
  sim.burstTime = 0;
  sim.hurdleChain = stillHeld ? which : null;
  sim.hurdleGap = 0;
}

function beginJuke(sim: Sim, which: "jukeL" | "jukeR", carrier: Player) {
  latchJukeRight(sim, carrier);
  sim.burst = which;
  sim.burstTime = 0;
  sim.jukeChain = null;
}

/** Left juke leads into a type 2 step. Right juke leads into a type 1 step. */
function endJuke(sim: Sim, which: "jukeL" | "jukeR", stillHeld: boolean) {
  sim.strideType = which === "jukeL" ? 2 : 1;
  sim.strideTravel = 0;
  sim.jukeGap = 0;
  sim.burst = "carry";
  sim.burstTime = 0;
  sim.jukeChain = stillHeld ? which : null;
}

function beginDive(sim: Sim) {
  sim.burst = "dive";
  sim.burstTime = 0;
  sim.diveChain = false;
  sim.diveGap = 0;
  sim.diveLocked = false;
}

function latchDiveLock(sim: Sim, carrier: Player) {
  const mag = Math.hypot(carrier.facingX, carrier.facingYard);
  if (mag > 1e-6) {
    sim.diveLockX = carrier.facingX / mag;
    sim.diveLockY = carrier.facingYard / mag;
  } else {
    sim.diveLockX = 0;
    sim.diveLockY = 1;
  }
  sim.diveLocked = true;
}

/** Dive C is over. A held dive runs a stride before the next dive, instead of staying on dive C. */
function endDive(sim: Sim, stillHeld: boolean) {
  sim.burst = "carry";
  sim.burstTime = 0;
  sim.diveChain = stillHeld;
  sim.diveGap = 0;
}

const HALF_STRIDE = STRIDE_YARDS * 0.5;
const THREE_QUARTER_STRIDE = STRIDE_YARDS * 0.75;
/** Stick magnitude below this is too light to choose a spin. */
const SPIN_CLEAR_MAG = 0.45;
/** Unit-stick lateral. Straight running with a small drift stays under this. */
const SPIN_CLEAR_LATERAL = 0.5;
/** A clear stick still counts for this long after it is released. */
const SPIN_STEER_WINDOW = 0.2;
/** Canvas spin looks this far for a defender to cut away from. */
const SPIN_REACH = 9;

type ScriptSlide = {
  start: number;
  end: number;
  /** −1 is the runner's left, +1 the right. 0 is not a lateral cut. */
  side: -1 | 0 | 1;
  yards: number;
  mode: "cut" | "dead" | "spin";
};

function shakeTime() {
  return SHAKE_P2_END + JUKE_TIME;
}

function scriptSlides(kind: ScriptAction): ScriptSlide[] {
  if (kind === "shakeL" || kind === "shakeR") {
    const left = kind === "shakeL";
    const end = shakeTime();
    return [
      { start: 0, end: SHAKE_P1, side: left ? -1 : 1, yards: HALF_STRIDE, mode: "cut" },
      { start: SHAKE_P1, end: SHAKE_P2_END, side: left ? 1 : -1, yards: THREE_QUARTER_STRIDE, mode: "cut" },
      { start: SHAKE_P2_END, end, side: left ? -1 : 1, yards: STRIDE_YARDS, mode: "cut" },
    ];
  }
  if (kind === "hesitate left" || kind === "hesitate right") {
    return [{ start: 0, end: DEAD_TIME, side: 0, yards: HALF_STRIDE, mode: "dead" }];
  }
  const left = kind === "spinL";
  return [
    { start: 0, end: SPIN_P1, side: left ? 1 : -1, yards: HALF_STRIDE, mode: "cut" },
    { start: SPIN_P1, end: SPIN_TIME, side: 0, yards: 0, mode: "spin" },
  ];
}

/**
 * Sole of the planted foot in the spin pose, in the runner's frame.
 * Measured from the posed mesh after it is centered on the ring.
 * Spin left plants the left foot. Spin right plants the right foot.
 */
const SPIN_PLANT = {
  spinL: { right: -0.56097, forward: -0.298455 },
  spinR: { right: 0.580867, forward: -0.298454 },
} as const;

/** Field offset from the ring to the planted sole at this facing. */
function plantedFootField(kind: "spinL" | "spinR", facingX: number, facingY: number) {
  const plant = SPIN_PLANT[kind];
  return {
    x: facingX * plant.forward + facingY * plant.right,
    y: facingY * plant.forward - facingX * plant.right,
  };
}

/** Positive angles turn toward the runner's left. North goes to the left sideline. */
function rotateHeading(hx: number, hy: number, angle: number) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: hx * cos - hy * sin, y: hx * sin + hy * cos };
}

/** Hesitate left steps back-right of the latched velocity. Hesitate right mirrors that. */
function deadLegAim(which: "hesitate left" | "hesitate right", hx: number, hy: number, rx: number, ry: number) {
  const side = which === "hesitate left" ? 1 : -1;
  const x = -hx + side * rx;
  const y = -hy + side * ry;
  const mag = Math.hypot(x, y);
  if (mag < 1e-6) return { x: -hx, y: -hy };
  return { x: x / mag, y: y / mag };
}

/** +1 when the stick is toward the runner's right. Straight and slight pushes are 0. */
function clearStickSide(x: number, yard: number, facingX: number, facingYard: number): -1 | 0 | 1 {
  const mag = Math.hypot(x, yard);
  if (mag < SPIN_CLEAR_MAG) return 0;
  const face = Math.hypot(facingX, facingYard) || 1;
  const right = (x / mag) * (facingYard / face) - (yard / mag) * (facingX / face);
  if (Math.abs(right) < SPIN_CLEAR_LATERAL) return 0;
  return right > 0 ? 1 : -1;
}

function noteSpinSteer(sim: Sim, carrier: Player, input: Input, dt: number) {
  if (dt > 0) sim.clearSteerAge += dt;
  const side = clearStickSide(input.x, input.yard, carrier.facingX, carrier.facingYard);
  if (side === 0) return;
  sim.clearSteerSide = side;
  sim.clearSteerAge = 0;
}

/**
 * Spin side.
 * A clear stick at the press, or within a moment before it, wins: stick right
 * steps right then spins left, and stick left is the mirror.
 * Otherwise juke toward the nearest defender and spin away, even by a sideline.
 * With nobody close, juke toward the nearer sideline and spin back to the open field.
 * On the exact midpoint with no stick and no defender, pick at random.
 */
export function spinSide(sim: Sim, carrier: Player, random: () => number = Math.random): "spinL" | "spinR" {
  if (sim.clearSteerSide !== 0 && sim.clearSteerAge <= SPIN_STEER_WINDOW) {
    return sim.clearSteerSide > 0 ? "spinL" : "spinR";
  }
  const head = headingOf(carrier);
  const rightX = head.y;
  const rightY = -head.x;
  let best: Player | null = null;
  let bestDist = SPIN_REACH;
  for (const other of sim.players) {
    if (other.team !== "def") continue;
    const dist = Math.hypot(other.x - carrier.x, other.yard - carrier.yard);
    if (dist < bestDist) {
      bestDist = dist;
      best = other;
    }
  }
  if (best) {
    const towardRight = (best.x - carrier.x) * rightX + (best.yard - carrier.yard) * rightY;
    if (Math.abs(towardRight) > 1e-3) return towardRight > 0 ? "spinL" : "spinR";
  }
  const mid = FIELD.width * 0.5;
  if (Math.abs(carrier.x - mid) <= 1e-6) return random() < 0.5 ? "spinL" : "spinR";
  const nearSideline = carrier.x > mid ? 1 : -1;
  const towardSideline = nearSideline * rightX;
  if (Math.abs(towardSideline) <= 1e-6) return carrier.x > mid ? "spinL" : "spinR";
  return towardSideline > 0 ? "spinL" : "spinR";
}

function latchMoveFrame(sim: Sim, carrier: Player) {
  const head = headingOf(carrier);
  sim.moveHeadX = head.x;
  sim.moveHeadY = head.y;
  sim.moveRightX = head.y;
  sim.moveRightY = -head.x;
}

/** Hesitate steps back from the velocity at the press. Facing is only the fallback. */
function latchDeadLeg(sim: Sim, carrier: Player) {
  const head = velocityHeading(sim, carrier);
  sim.moveHeadX = head.x;
  sim.moveHeadY = head.y;
  sim.moveRightX = head.y;
  sim.moveRightY = -head.x;
}

function beginScript(sim: Sim, which: ScriptAction, carrier: Player) {
  if (which === "hesitate left" || which === "hesitate right") latchDeadLeg(sim, carrier);
  else latchMoveFrame(sim, carrier);
  sim.spinTurn = which === "spinL" ? -1 : 1;
  sim.burst = which;
  sim.burstTime = 0;
  sim.moveSpent = null;
}

function endScript(sim: Sim, which: ScriptAction, held: CarrierAction) {
  if (which === "shakeL") {
    sim.strideType = 2;
    sim.strideTravel = 0;
  } else if (which === "shakeR") {
    sim.strideType = 1;
    sim.strideTravel = 0;
  }
  sim.burst = "carry";
  sim.burstTime = 0;
  const button: CarrierAction = isSpinBurst(which) ? "spin" : which;
  if (held === button) sim.moveSpent = button;
}

function scriptDelta(sim: Sim, kind: ScriptAction, t0: number, t1: number) {
  let x = 0;
  let y = 0;
  let facing: { x: number; y: number } | null = null;
  for (const slide of scriptSlides(kind)) {
    const a = Math.max(t0, slide.start);
    const b = Math.min(t1, slide.end);
    const span = slide.end - slide.start;
    if (b - a <= 1e-8 || span <= 0) continue;
    const frac = (b - a) / span;
    if (slide.mode === "dead" && (kind === "hesitate left" || kind === "hesitate right")) {
      const aim = deadLegAim(kind, sim.moveHeadX, sim.moveHeadY, sim.moveRightX, sim.moveRightY);
      x += aim.x * slide.yards * frac;
      y += aim.y * slide.yards * frac;
      facing = { x: sim.moveHeadX, y: sim.moveHeadY };
    } else if (slide.mode === "spin" && (kind === "spinL" || kind === "spinR")) {
      const u0 = (a - slide.start) / span;
      const u1 = (b - slide.start) / span;
      // 270° over this phase. The planted sole stays put while the body turns.
      const spinAngle = Math.PI * 1.5;
      const face0 = rotateHeading(sim.moveHeadX, sim.moveHeadY, sim.spinTurn * u0 * spinAngle);
      const face1 = rotateHeading(sim.moveHeadX, sim.moveHeadY, sim.spinTurn * u1 * spinAngle);
      facing = face1;
      const from = plantedFootField(kind, face0.x, face0.y);
      const to = plantedFootField(kind, face1.x, face1.y);
      x += from.x - to.x;
      y += from.y - to.y;
    } else {
      x += sim.moveRightX * slide.side * slide.yards * frac;
      y += sim.moveRightY * slide.side * slide.yards * frac;
      if (isSpinBurst(kind)) facing = { x: sim.moveHeadX, y: sim.moveHeadY };
    }
  }
  return { x, y, facing };
}

function shownHeld(held: CarrierAction, sim: Sim): CarrierAction {
  if (held === "spin" && isSpinBurst(sim.burst)) return sim.burst;
  return held;
}

/**
 * Pose follows the held special. A tap still finishes the canvas burst,
 * so the pose and the motion stay together until that window ends.
 * Motion is sampled after the clock steps, including the first frame of a new special.
 */
function trackBurst(
  sim: Sim,
  held: CarrierAction,
  dt: number,
  carrier: Player,
): { action: CarrierAction; motion: SpecialMotion; jukeDt: number; jukeEnded: "jukeL" | "jukeR" | null } {
  const heldJuke = held === "jukeL" || held === "jukeR";
  sim.hurdleDt = 0;
  sim.scriptKind = null;
  sim.scriptDt = 0;
  sim.scriptT0 = 0;
  sim.scriptEnded = false;
  // Same juke is still held through the stride that separates repeats.
  if (heldJuke && sim.jukeChain === held) {
    return { action: "carry", motion: NO_SPECIAL, jukeDt: 0, jukeEnded: null };
  }
  if (held === "dive" && sim.diveChain) {
    return { action: "carry", motion: NO_SPECIAL, jukeDt: 0, jukeEnded: null };
  }
  // Both hurdle poses are done. Stay on a run pose until one stride has passed.
  if (isHurdle(held) && sim.hurdleChain === held) {
    return { action: "carry", motion: NO_SPECIAL, jukeDt: 0, jukeEnded: null };
  }
  // The sequence finished and the button is still down. Wait for a release.
  if (sim.moveSpent && held === sim.moveSpent) {
    return { action: "carry", motion: NO_SPECIAL, jukeDt: 0, jukeEnded: null };
  }
  if (sim.moveSpent && held !== sim.moveSpent) sim.moveSpent = null;
  if (sim.jukeChain && held !== sim.jukeChain) sim.jukeChain = null;
  if (sim.diveChain && held !== "dive") sim.diveChain = false;
  if (sim.hurdleChain && held !== sim.hurdleChain) sim.hurdleChain = null;
  const spinning = held === "spin" && isSpinBurst(sim.burst);
  if (isHurdle(held) && held !== sim.burst) beginHurdle(sim, held, carrier);
  else if (heldJuke && held !== sim.burst) beginJuke(sim, held, carrier);
  else if (held === "dive" && held !== sim.burst) beginDive(sim);
  else if ((held === "shakeL" || held === "shakeR" || held === "hesitate left" || held === "hesitate right") && held !== sim.burst) {
    beginScript(sim, held, carrier);
  } else if (held === "spin" && !isSpinBurst(sim.burst)) beginScript(sim, spinSide(sim, carrier), carrier);
  else if (held !== "carry" && held !== sim.burst && !spinning) {
    sim.burst = held;
    sim.burstTime = 0;
  }
  const dur = moveDuration(sim.burst);
  const jukeBurst = sim.burst === "jukeL" || sim.burst === "jukeR";
  let stepped = false;
  let jukeDt = 0;
  let jukeEnded: "jukeL" | "jukeR" | null = null;
  let diveEnded = false;
  if (sim.burst !== "carry" && dt > 0 && sim.burstTime < dur) {
    const start = sim.burstTime;
    sim.burstTime += dt;
    stepped = true;
    if (jukeBurst) {
      jukeDt = Math.max(0, Math.min(sim.burstTime, JUKE_TIME) - start);
      if ((sim.burst === "jukeL" || sim.burst === "jukeR") && start < JUKE_TIME && sim.burstTime >= JUKE_TIME) {
        jukeEnded = sim.burst;
        endJuke(sim, jukeEnded, held === jukeEnded);
      }
    } else if (isScript(sim.burst)) {
      const kind = sim.burst;
      sim.scriptKind = kind;
      sim.scriptT0 = start;
      sim.scriptDt = Math.max(0, Math.min(sim.burstTime, dur) - start);
      // A 60 Hz sum can land a hair short of the phase end and never quite cross it.
      if (start < dur && sim.burstTime >= dur - 1e-8) {
        sim.scriptDt = Math.max(0, dur - start);
        sim.scriptEnded = true;
        endScript(sim, kind, held);
      }
    } else if (isHurdle(sim.burst)) {
      sim.hurdleT0 = start;
      // Use dt itself while the window still covers this frame. Subtracting the
      // clock from itself can leave a tiny tail that turns the body toward the stick.
      const hurdleRemain = Math.max(0, HURDLE_TIME - start);
      sim.hurdleDt = Math.min(dt, hurdleRemain);
      if (start < HURDLE_TIME && sim.burstTime >= HURDLE_TIME) {
        const which = sim.burst;
        endHurdle(sim, which, held === which);
      }
    } else if (sim.burst === "dive") {
      if (start < DIVE_SLOW_AT && sim.burstTime >= DIVE_SLOW_AT) sim.diveRecover = DIVE_GETUP;
      if (start < DIVE_TIME && sim.burstTime >= DIVE_TIME) {
        diveEnded = true;
        endDive(sim, held === "dive");
      }
    }
  }
  const hurdleEnded = sim.hurdleChain !== null && held === sim.hurdleChain && sim.burst === "carry" && sim.burstTime === 0 && jukeDt === 0 && stepped;
  const motion = jukeEnded || diveEnded || hurdleEnded || !stepped ? NO_SPECIAL : specialMotion(sim.burst, Math.min(sim.burstTime, dur));
  if (jukeEnded) {
    const action = held === jukeEnded ? "carry" : held !== "carry" ? held : "carry";
    return { action, motion, jukeDt, jukeEnded };
  }
  if (diveEnded) {
    const action = held === "dive" ? "carry" : held !== "carry" ? held : "carry";
    return { action, motion, jukeDt, jukeEnded: null };
  }
  if (hurdleEnded) return { action: "carry", motion, jukeDt, jukeEnded: null };
  if (sim.scriptEnded) {
    const action = sim.moveSpent && held === sim.moveSpent ? "carry" : held !== "carry" ? shownHeld(held, sim) : "carry";
    return { action, motion: NO_SPECIAL, jukeDt, jukeEnded: null };
  }
  if (held !== "carry") return { action: shownHeld(held, sim), motion, jukeDt, jukeEnded: null };
  if (stepped || (sim.burst !== "carry" && sim.burstTime < dur)) return { action: sim.burst, motion, jukeDt, jukeEnded: null };
  sim.burst = "carry";
  sim.burstTime = 0;
  return { action: "carry", motion: NO_SPECIAL, jukeDt, jukeEnded: null };
}

function stiffPush(sim: Sim, carrier: Player, side: -1 | 1, dt: number) {
  let best: Player | null = null;
  let bestDist = STIFF_REACH;
  for (const other of sim.players) {
    if (other === carrier || other.team !== "def") continue;
    const dx = other.x - carrier.x;
    if (side < 0 && dx > -0.2) continue;
    if (side > 0 && dx < 0.2) continue;
    const dist = Math.hypot(dx, other.yard - carrier.yard);
    if (dist < bestDist) {
      bestDist = dist;
      best = other;
    }
  }
  if (!best) return;
  let dx = best.x - carrier.x;
  let dy = best.yard - carrier.yard;
  let dist = Math.hypot(dx, dy);
  if (dist < 1e-6) {
    dx = side;
    dy = 0;
    dist = 1;
  }
  const push = STIFF_PUSH * dt;
  best.x = clamp(best.x + (dx / dist) * push, PLAY_MIN_X, PLAY_MAX_X);
  best.yard = clamp(best.yard + (dy / dist) * push, PLAY_MIN_YARD, PLAY_MAX_YARD);
}

function syncCarrierPose(sim: Sim, action: CarrierAction, distance: number) {
  // Latch before the stride clock moves, so this frame's travel does not change the hurdle type.
  if (isHurdle(action) && !isHurdle(sim.action)) sim.hurdleType = oppositeStride(sim.strideType);
  const advanced = advanceStride(sim.strideType, sim.strideTravel, distance);
  sim.strideType = advanced.type;
  sim.strideTravel = advanced.travel;
  sim.action = action;
  const firstHurdle = sim.hurdleType ?? oppositeStride(sim.strideType);
  const hurdleShown = sim.burstTime < HURDLE_PHASE ? firstHurdle : oppositeStride(firstHurdle);
  const shown = isHurdle(action) ? hurdleShown : sim.strideType;
  sim.pose = carrierPoseName(action, shown, action === "dive" || isScript(action) ? sim.burstTime : 0);
}

/** Advance the controlled player, then keep bodies from overlapping. */
export function step(sim: Sim, input: Input, dt: number) {
  const carrier = controlledPlayer(sim);
  if (!carrier) return;
  const bounded = dt > 0 ? Math.min(dt, 0.05) : 0;
  noteSpinSteer(sim, carrier, input, bounded);
  if (bounded > 0 && sim.diveRecover > 0) sim.diveRecover = Math.max(0, sim.diveRecover - bounded);
  const tracked = trackBurst(sim, input.action, bounded, carrier);
  let poseAction = tracked.action;
  const { motion, jukeDt, jukeEnded } = tracked;
  const chaining = sim.jukeChain !== null && input.action === sim.jukeChain;
  if (chaining && (jukeEnded || jukeDt === 0)) poseAction = input.sprint ? "sprint" : "carry";
  if (sim.diveChain && input.action === "dive") poseAction = input.sprint ? "sprint" : "carry";
  if (sim.hurdleChain && input.action === sim.hurdleChain) poseAction = input.sprint ? "sprint" : "carry";
  if (sim.moveSpent && input.action === sim.moveSpent) poseAction = input.sprint ? "sprint" : "carry";
  let strideDist = 0;
  if (bounded > 0) {
    let mx = input.x;
    let my = input.yard;
    let mag = Math.hypot(mx, my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
      mag = 1;
    }
    const inDivePoses = poseAction === "dive" && sim.burstTime < DIVE_SLOW_AT;
    // You or CPU strength, times the v10 speed scale. Scripted burst distances stay put.
    const pace = carrierTravelScale();
    const speed =
      (sim.diveRecover > 0 && !inDivePoses
        ? SPEED * diveGetUpFactor(sim.diveRecover)
        : SPEED * (poseAction === "sprint" ? SPRINT_MULT : 1)) * pace;
    let moveX = 0;
    let moveY = 0;
    const slide = jukeEnded ?? (poseAction === "jukeL" || poseAction === "jukeR" ? poseAction : null);
    if (jukeDt > 0 && slide) {
      const side = slide === "jukeR" ? 1 : -1;
      moveX += sim.jukeRightX * side * JUKE_SPEED * jukeDt;
      moveY += sim.jukeRightY * side * JUKE_SPEED * jukeDt;
      if (mag > 0.001) {
        carrier.facingX = mx / mag;
        carrier.facingYard = my / mag;
      }
    }
    let scriptFacing: { x: number; y: number } | null = null;
    if (sim.scriptDt > 0 && sim.scriptKind) {
      const delta = scriptDelta(sim, sim.scriptKind, sim.scriptT0, sim.scriptT0 + sim.scriptDt);
      moveX += delta.x;
      moveY += delta.y;
      scriptFacing = delta.facing;
      if (!scriptFacing && (sim.scriptKind === "shakeL" || sim.scriptKind === "shakeR") && mag > 0.001) {
        carrier.facingX = mx / mag;
        carrier.facingYard = my / mag;
      }
    }
    if (scriptFacing) {
      carrier.facingX = scriptFacing.x;
      carrier.facingYard = scriptFacing.y;
    }
    const scriptOwnsFrame = sim.scriptKind !== null && !sim.scriptEnded;
    const freeDt = scriptOwnsFrame ? 0 : Math.max(0, bounded - jukeDt - sim.scriptDt);
    const freeMotion = jukeDt > 0 || sim.scriptDt > 0 ? NO_SPECIAL : motion;
    let startedJuke = false;
    // A held hurdle covers the gap on foot, then the next leap starts along velocity.
    const spendHurdleGap = (vx: number, vy: number, span: number, moved: number) => {
      if (!(sim.hurdleChain && input.action === sim.hurdleChain)) return;
      const gapSpeed = Math.hypot(vx, vy);
      const remain = Math.max(0, STRIDE_YARDS - sim.hurdleGap);
      if (!(gapSpeed > 1e-6) || moved + 1e-8 < remain) {
        sim.hurdleGap += moved;
        return;
      }
      const runDt = Math.min(span, remain / gapSpeed);
      const slideDt = span - runDt;
      moveX -= vx * slideDt;
      moveY -= vy * slideDt;
      strideDist -= gapSpeed * slideDt;
      const which = sim.hurdleChain;
      beginHurdle(sim, which, carrier, { x: vx, y: vy });
      moveX += sim.hurdleAimX * HURDLE_SPEED * slideDt;
      moveY += sim.hurdleAimY * HURDLE_SPEED * slideDt;
      carrier.facingX = sim.hurdleAimX;
      carrier.facingYard = sim.hurdleAimY;
      sim.burstTime = slideDt;
      poseAction = which;
    };
    if (freeDt > 0 && chaining) {
      const vx = mx * speed;
      const vy = my * speed;
      const spd = Math.hypot(vx, vy);
      const remain = Math.max(0, STRIDE_YARDS - sim.jukeGap);
      const reachesNext = spd > 1e-6 && remain / spd < freeDt;
      if (!reachesNext) {
        moveX += vx * freeDt;
        moveY += vy * freeDt;
        strideDist += spd * freeDt;
        sim.jukeGap += spd * freeDt;
        if (spd > 0.5) {
          carrier.facingX = vx / spd;
          carrier.facingYard = vy / spd;
        }
      } else {
        const runDt = remain / spd;
        moveX += vx * runDt;
        moveY += vy * runDt;
        strideDist += remain;
        if (spd > 0.5) {
          carrier.facingX = vx / spd;
          carrier.facingYard = vy / spd;
        }
        const which = sim.jukeChain;
        if (which) beginJuke(sim, which, carrier);
        const slideDt = freeDt - runDt;
        const side = which === "jukeR" ? 1 : -1;
        moveX += sim.jukeRightX * side * JUKE_SPEED * slideDt;
        moveY += sim.jukeRightY * side * JUKE_SPEED * slideDt;
        sim.burstTime = slideDt;
        if (mag > 0.001) {
          carrier.facingX = mx / mag;
          carrier.facingYard = my / mag;
        }
        poseAction = which ?? poseAction;
        startedJuke = true;
      }
    } else if (freeDt > 0 && sim.hurdleDt > 0) {
      const t0 = sim.hurdleT0;
      const t1 = t0 + sim.hurdleDt;
      const marks = [HURDLE_LOCK_AT, HURDLE_LOCK_END].filter((t) => t > t0 && t < t1);
      const points = [t0, ...marks, t1];
      for (let i = 0; i < points.length - 1; i++) {
        const dtSeg = points[i + 1]! - points[i]!;
        if (dtSeg <= 1e-8) continue;
        const lock = points[i]! >= HURDLE_LOCK_AT - 1e-9 && points[i]! < HURDLE_LOCK_END - 1e-9;
        if (lock && !sim.hurdleLocked) {
          sim.hurdleLockX = sim.hurdleAimX;
          sim.hurdleLockY = sim.hurdleAimY;
          sim.hurdleLocked = true;
        }
        const dirX = lock ? sim.hurdleLockX : sim.hurdleAimX;
        const dirY = lock ? sim.hurdleLockY : sim.hurdleAimY;
        carrier.facingX = dirX;
        carrier.facingYard = dirY;
        moveX += dirX * HURDLE_SPEED * dtSeg;
        moveY += dirY * HURDLE_SPEED * dtSeg;
      }
      const tail = freeDt - sim.hurdleDt;
      if (tail > 1e-6) {
        const vx = mx * speed;
        const vy = my * speed;
        moveX += vx * tail;
        moveY += vy * tail;
        const tailMoved = Math.hypot(vx, vy) * tail;
        strideDist += tailMoved;
        const spd = Math.hypot(vx, vy);
        if (spd > 0.5) {
          carrier.facingX = vx / spd;
          carrier.facingYard = vy / spd;
        }
        spendHurdleGap(vx, vy, tail, tailMoved);
      }
    } else if (freeDt > 0 && poseAction === "dive") {
      const diveRun = SPEED * pace;
      const diveSlow = (sim.diveRecover > 0 ? SPEED * diveGetUpFactor(sim.diveRecover) : SPEED) * pace;
      const t0 = sim.burstTime - freeDt;
      const marks = [DIVE_LOCK_AT, DIVE_SLOW_AT].filter((t) => t > t0 && t < sim.burstTime);
      const points = [t0, ...marks, sim.burstTime];
      for (let i = 0; i < points.length - 1; i++) {
        const dtSeg = points[i + 1]! - points[i]!;
        if (dtSeg <= 1e-8) continue;
        const lock = points[i]! >= DIVE_LOCK_AT - 1e-9 && points[i]! < DIVE_SLOW_AT - 1e-9;
        let vx = mx * diveRun;
        let vy = my * diveRun;
        if (lock) {
          if (!sim.diveLocked) latchDiveLock(sim, carrier);
          vx = sim.diveLockX * mag * diveRun;
          vy = sim.diveLockY * mag * diveRun;
          carrier.facingX = sim.diveLockX;
          carrier.facingYard = sim.diveLockY;
        } else if (points[i]! >= DIVE_SLOW_AT - 1e-9) {
          vx = mx * diveSlow;
          vy = my * diveSlow;
        }
        moveX += vx * dtSeg;
        moveY += vy * dtSeg;
        strideDist += Math.hypot(vx, vy) * dtSeg;
        const spd = Math.hypot(vx, vy);
        if (!lock && spd > 0.5) {
          carrier.facingX = vx / spd;
          carrier.facingYard = vy / spd;
        }
      }
    } else if (freeDt > 0) {
      const vx = mx * speed * freeMotion.speedMul + freeMotion.extraX;
      const vy = my * speed * freeMotion.speedMul + freeMotion.extraY;
      moveX += vx * freeDt;
      moveY += vy * freeDt;
      const moved = Math.hypot(vx, vy) * freeDt;
      strideDist += moved;
      const spd = Math.hypot(vx, vy);
      if (spd > 0.5) {
        carrier.facingX = vx / spd;
        carrier.facingYard = vy / spd;
      }
      if (sim.diveChain && input.action === "dive") {
        const remain = Math.max(0, STRIDE_YARDS - sim.diveGap);
        if (!(spd > 1e-6) || moved < remain) sim.diveGap += moved;
        else {
          beginDive(sim);
          sim.burstTime = freeDt - remain / spd;
          poseAction = "dive";
        }
      }
      spendHurdleGap(vx, vy, freeDt, moved);
    }
    if ((jukeDt > 0 && !jukeEnded && !startedJuke) || (sim.scriptDt > 0 && !sim.scriptEnded)) strideDist = 0;
    if (moveX !== 0 || moveY !== 0) {
      sim.velX = moveX;
      sim.velY = moveY;
      carrier.x = clamp(carrier.x + moveX, PLAY_MIN_X, PLAY_MAX_X);
      carrier.yard = clamp(carrier.yard + moveY, PLAY_MIN_YARD, PLAY_MAX_YARD);
    }
    carrier.hop = motion.hop;
    if (motion.stiffSide !== 0) stiffPush(sim, carrier, motion.stiffSide, bounded);
    separate(sim);
    placeBall(sim, carrier);
  } else {
    carrier.hop = motion.hop;
  }
  const gaitDist = poseAction === "sprint" && !chaining ? strideDist * SPRINT_GAIT : strideDist;
  syncCarrierPose(sim, poseAction, gaitDist);
}
