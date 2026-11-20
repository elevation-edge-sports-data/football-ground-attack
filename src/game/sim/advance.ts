/**
 * Walk assignments one frame, then hand the carrier to `step`.
 *
 * The route cursor matches the canvas rule: each step is a direction held for
 * `t` seconds, and a stick past 0.15 leaves the path except during a locked
 * first step. The direction becomes `Input.x` / `Input.yard`. Juke, spin,
 * hurdle, truck, stiff-arm, dive, sprint, separation, the ball, and pose sync
 * stay inside `step`.
 *
 * Defenders stay on a landmark until the runner is close or past it, then chase.
 * Blockers drop a beaten target and claim another. After the first level sheds,
 * an open crease is washed beside the runner instead of climbing to the next body.
 * Overlap with that target becomes a hold, a pancake, or a shed in `contact.ts`.
 * `step` still separates the roster and still owns the stiff-arm push.
 *
 * Opt-in. `createSim` never calls this. Put `attachAssignments(...).players`
 * on the sim before the first call so the controlled halfback is the carrier
 * `step` moves.
 */
import { FIELD, playMaxX, PLAY_MAX_YARD, PLAY_MIN_X, PLAY_MIN_YARD, clamp, readFieldWidth } from "../../field/spec";
import { step, type Input, type Player, type Sim } from "../sim";
import type { PlayInput } from "./types";
import type { AssignedPlay, AssignedPlayer, ReplayFrame } from "./assign";
import { contactOf, resolveBlockContact, resolveTackle, tickContact } from "./contact";
import { bodyTravelScale, setUserOnOffense } from "./tuning";
import { attackSign, downfieldDelta, furtherDownfield, readAttackNorth, shiftDownfield } from "./attack";
import { readPlaySide } from "./boot";
import { playSideSign } from "./plays";
import { consumeDefenseFinish, poseForReplay, readUserDefenderId, tickDefenseLive, userTackleScale, type DefenseStick } from "./defense";
import { flushStanceReleases, releaseStance } from "./stance";
import type { AttackKind, BlockAssignment, BlockStyle, ContactResult, DefenseAssignment, PlayAssignment, RouteAssignment } from "./types";

/** Canvas abandons a route when either stick axis passes this. */
const ROUTE_LEAVE = 0.15;
/** One replay sample. About 12 samples a second. */
const REPLAY_SAMPLE = 0.08;
/** How much of the play, after the opening stances, the scrub can still see. */
const REPLAY_HORIZON = 10;

const ROLE_SPEED: Record<string, number> = {
  OL: 8.8,
  TE: 8.7,
  QB: 7.35,
  FB: 8.95,
  HB: 9,
  DT: 7.7,
  LB: 8.55,
  DB: 9.15,
};

function roleSpeed(role: string): number {
  return ROLE_SPEED[role] ?? 8.5;
}

function isRoute(assignment: PlayAssignment): assignment is RouteAssignment {
  return assignment.kind === "route";
}

function isBlock(assignment: PlayAssignment): assignment is BlockAssignment {
  return assignment.kind === "block";
}

function isDefense(assignment: PlayAssignment): assignment is DefenseAssignment {
  return assignment.kind === "defense";
}

function carrierRoute(assigned: AssignedPlay): { player: Player; route: RouteAssignment } | null {
  const player =
    assigned.players.find((body) => body.controlled && isRoute(body.assignment)) ??
    assigned.players.find((body) => isRoute(body.assignment));
  if (!player || !isRoute(player.assignment)) return null;
  return { player, route: player.assignment };
}

/**
 * Route aim for this frame, or the raw stick once the path is finished or broken.
 * Advances `scriptIndex` / `scriptTimer` and the carrier route together.
 */
function desiredCarrierInput(assigned: AssignedPlay, input: Input, dt: number): Input {
  const found = carrierRoute(assigned);
  if (!found) return input;
  const { route } = found;
  let x = input.x;
  let yard = input.yard;
  if (route.index < route.steps.length) {
    const beat = route.steps[route.index];
    if (beat) {
      x = beat.dx;
      yard = beat.dy * attackSign();
      route.timer += dt;
      const stick = Math.abs(input.x) > ROUTE_LEAVE || Math.abs(input.yard) > ROUTE_LEAVE;
      const locked = route.index === 0 && route.lockFirst;
      if (stick && !locked) {
        route.index = route.steps.length;
        x = input.x;
        yard = input.yard;
      } else if (route.timer >= beat.t) {
        route.timer = 0;
        route.index += 1;
      }
    }
  }
  assigned.scriptIndex = route.index;
  assigned.scriptTimer = route.timer;
  return { x, yard, action: input.action, sprint: input.sprint };
}

function blockAim(
  block: BlockAssignment,
  owner: Player,
  players: readonly Player[],
  carrier: Player,
  los: number,
): { x: number; yard: number } {
  const side = block.sealSide;
  if (block.mode === "pull" && block.pullVia && block.pullPhase < 2) {
    const via = block.pullVia;
    const gained = Math.max(0, downfieldDelta(carrier.yard, los));
    const heat = block.pullBoost || 1;
    // archive/v10/game.js 8848–8858. Landmarks stay put. Depth or arrival
    // releases a phase, and so does a runner who has already cleared it.
    if (block.pullPhase === 0) {
      const distVia = Math.hypot(owner.x - via.x, owner.yard - via.y);
      const dropped = downfieldDelta(los, owner.yard) >= 0.6 || distVia < 1.1;
      const runnerGone = gained > 1.6 && downfieldDelta(carrier.yard, via.y) > 0.8;
      if (dropped || runnerGone) block.pullPhase = 1;
    }
    if (block.pullPhase === 1) {
      const squared = Math.abs(owner.x - via.x2) < 1.4;
      const runnerPast = gained > 2.4 && downfieldDelta(carrier.yard, via.y2) > 1.2;
      if (squared || runnerPast) block.pullPhase = 2;
    }
    if (block.pullPhase === 0) {
      const bend = Math.min(0.85, gained * 0.1 * heat);
      const kick = washSide(block, owner, carrier);
      return { x: via.x + kick * bend, yard: via.y };
    }
    if (block.pullPhase === 1) {
      const lift = Math.min(1.1, Math.max(0, downfieldDelta(carrier.yard, via.y2)) * 0.16 * heat);
      return { x: via.x2, yard: shiftDownfield(via.y2, lift) };
    }
  }
  const target = block.targetId ? players.find((player) => player.id === block.targetId) : undefined;
  if (target) {
    if (block.mode === "reach") return { x: target.x + side * 1.15, yard: shiftDownfield(target.yard, 0.12) };
    if (block.mode === "climb") return { x: target.x + side * 0.9, yard: shiftDownfield(target.yard, 0.25) };
    return { x: target.x + side * 0.9, yard: shiftDownfield(target.yard, 0.35) };
  }
  // archive/v10/game.js 8919–8922. Second level with no body washes the crease.
  // A live target above is the climb-to-next-defender fallback.
  if (block.secondLevel && !block.backsideSeal) {
    const wash = openCrease(block, owner, carrier, players, los);
    if (wash) return wash;
  }
  // archive/v10/game.js 8863–8865. Pull is done and nobody is left: track the runner.
  if (block.mode === "pull" && block.pullPhase >= 2) {
    const kick = washSide(block, owner, carrier);
    return {
      x: carrier.x + kick * 3.2,
      yard: furtherDownfield(shiftDownfield(los, 3.5), shiftDownfield(carrier.yard, 2.2)),
    };
  }
  if (block.gapAimX != null && block.gapAimY != null) return { x: block.gapAimX, yard: block.gapAimY };
  return {
    x: carrier.x + side * 2.2,
    yard: furtherDownfield(shiftDownfield(los, block.levelY), shiftDownfield(carrier.yard, 1)),
  };
}

/** Yards at which a job gives up the landmark. Deep holds longer. Blitz waits until the runner is on him. */
function keyDistance(job: DefenseAssignment): number {
  if (job.job === "deep" || job.job === "robber" || job.isSafety) return 7.2;
  if (job.job === "blitz" || job.job === "man" || job.job === "pursue") return 3.2;
  return 6.4;
}

/** Storm rushes the ball. Base holds the gap. Every other scheme id is unchanged. */
function defenseStyle(schemeId: string): "storm" | "base" | "standard" {
  if (schemeId === "stormBlitz") return "storm";
  if (schemeId === "base") return "base";
  return "standard";
}

type ChaseStyle = "storm" | "base" | "standard";
type Spot = { x: number; yard: number };

const ZONE_JOBS = new Set(["deep", "drop", "flat", "curl", "hook", "robber", "contain", "spy", "shade"]);

/** Canvas `spyPhase`. Caught up with the landmark, then it follows the runner. */
const spyPhaseOf = new WeakMap<DefenseAssignment, "fake" | "catch" | "follow">();

/** Last sample of the carrier, so the chase can lead his velocity. */
const carrierMotion = new WeakMap<Player, { x: number; yard: number }>();

/** Canvas `idleCarrierT`. Seconds the carrier has been stopped without a user drive. */
const idleCarrier = new WeakMap<AssignedPlay, number>();

/** Last sample of a defender, so a hit can require real closing speed. */
const defenderMotion = new WeakMap<Player, { x: number; yard: number }>();

/**
 * Dive, hit, and wrap clocks. Canvas `atkKind` / `atkT` / `atkDecideT`.
 * Contact still judges the tackle. This only decides when an attack starts.
 */
type DefenderAttack = {
  kind: AttackKind | null;
  time: number;
  decide: number;
  aimX: number;
  aimY: number;
  /** Canvas `dtLag`. Tackles open slow until the runner is 10 yards past them. */
  dtLag: boolean;
};

const defenderAttack = new WeakMap<Player, DefenderAttack>();

function attackOf(player: Player): DefenderAttack {
  let row = defenderAttack.get(player);
  if (!row) {
    row = {
      kind: null,
      time: 0,
      decide: 0,
      aimX: 0,
      aimY: 0,
      dtLag: player.role === "DT",
    };
    defenderAttack.set(player, row);
  }
  return row;
}

function defenderClosing(player: Player, dt: number): number {
  const prev = defenderMotion.get(player);
  const vx = prev && dt > 1e-4 ? (player.x - prev.x) / dt : 0;
  const vy = prev && dt > 1e-4 ? (player.yard - prev.yard) / dt : 0;
  defenderMotion.set(player, { x: player.x, yard: player.yard });
  return Math.hypot(vx, vy);
}

/**
 * archive/v10/game.js `chooseDefenderAttack` 5778–5821.
 * DBs dive first, linebackers less often, tackles only wrap. A non-penetrating
 * tackle does not launch while the runner is still behind the line.
 */
function chooseDefenderAttack(
  player: AssignedPlayer,
  carrier: Player,
  los: number,
  distToRb: number,
  closing: number,
  carrierVx: number,
) {
  const clock = contactOf(player);
  const row = attackOf(player);
  if (clock.pancake > 0 || clock.engage > 0 || clock.recover > 0) return;
  if (row.time > 0) return;
  if (row.decide > 0) return;
  row.decide = 0.12 + Math.random() * 0.1;
  if (distToRb > 5.2 || distToRb < 1.05) return;
  const penetrate = player.assignment.kind === "defense" && player.assignment.dtPenetrate;
  if (player.role === "DT" && !penetrate && downfieldDelta(carrier.yard, los) < 0.25) return;
  const ang = Math.atan2(carrier.yard - player.yard, carrier.x - player.x);
  const face = Math.atan2(player.facingYard, player.facingX);
  let turn = Math.abs(ang - face);
  if (turn > Math.PI) turn = Math.PI * 2 - turn;
  const headUp = turn < 0.85;
  const crossing = Math.abs(carrierVx) > 2.4 && Math.abs(carrier.x - player.x) < 3.2;
  const roll = Math.random();
  let kind: AttackKind | null = null;
  if (player.role !== "DT" && distToRb > 1.85 && distToRb < 5.15) {
    let diveP = player.role === "DB" ? 0.56 : 0.48;
    if (crossing) diveP += 0.22;
    if (roll < diveP) kind = "dive";
  }
  if (!kind && player.role !== "DT" && distToRb > 1.55 && distToRb < 3.45 && headUp && closing > 5.4 && roll < 0.3) {
    kind = "hit";
  }
  if (!kind && distToRb < 2.95) kind = "wrap";
  if (!kind) return;
  row.kind = kind;
  row.aimX = Math.cos(ang);
  row.aimY = Math.sin(ang);
  if (kind === "dive") {
    row.time = 0.5 + Math.random() * 0.16;
    player.hop = 0.22;
  } else if (kind === "hit") {
    row.time = 0.26 + Math.random() * 0.1;
  } else {
    row.time = 0.55;
  }
}

function sampleCarrierVelocity(carrier: Player, dt: number): { vx: number; vy: number } {
  const prev = carrierMotion.get(carrier);
  const vx = prev && dt > 1e-4 ? (carrier.x - prev.x) / dt : 0;
  const vy = prev && dt > 1e-4 ? (carrier.yard - prev.yard) / dt : 0;
  carrierMotion.set(carrier, { x: carrier.x, yard: carrier.yard });
  return { vx, vy };
}

/** Held move or a burst still playing out. Canvas `activeMove` plus the button list. */
function carrierSpecial(input: Input, sim: Sim): boolean {
  if (sim.burst !== "carry") return true;
  switch (input.action) {
    case "carry":
    case "sprint":
      return false;
    default:
      return true;
  }
}

/**
 * archive/v10/game.js 8425–8427.
 * Idle grows only when the carrier is slower than 2.4 yd/s and the user is
 * not driving him. A stick past 0.16, sprint, or any special — including a
 * burst that is still finishing after the button is up — resets the clock.
 */
function noteCarrierIdle(
  assigned: AssignedPlay,
  input: Input,
  sim: Sim,
  playingDefense: boolean,
  vx: number,
  vy: number,
  dt: number,
): number {
  const userDrive =
    !playingDefense &&
    (Math.hypot(input.x, input.yard) > 0.16 || input.sprint || carrierSpecial(input, sim));
  const stopped = Math.hypot(vx, vy) < 2.4;
  const next = !userDrive && stopped ? (idleCarrier.get(assigned) ?? 0) + dt : 0;
  idleCarrier.set(assigned, next);
  return next;
}

/**
 * archive/v10/game.js 8939–8946.
 * Fatigue ramps after 4.5s. Wall, zone, pull, and backside seal keep the
 * canvas multipliers, so that surge is strongest before fatigue cuts speed.
 * A free blocker, and a carrier idle past 0.4s, each add the canvas 1.06.
 */
function blockerPace(block: BlockAssignment, style: BlockStyle, age: number, idle: number): number {
  let pace = age < 4.5 ? 1 : Math.max(0.55, 1 - (age - 4.5) * 0.1);
  if (style === "wallL" || style === "wallR") pace *= 1.12;
  if (style === "zoneL" || style === "zoneR") pace *= 1.08;
  if (block.mode === "pull" && block.pullPhase < 2) pace *= 1.18 * (block.pullBoost || 1);
  if (block.backsideSeal) pace *= 1.22;
  if (!block.targetId) pace *= 1.06;
  if (idle > 0.4) pace *= 1.06;
  return pace;
}

/** Box starts tight, then opens a little. Deterministic from seconds since the snap. */
function boxBreath(age: number): number {
  if (age < 0.35) return 0.82;
  if (age < 1.2) return 0.82 + ((age - 0.35) / 0.85) * 0.33;
  return 1.15;
}

/**
 * Zone box from archive/v10/game.js 9268–9275.
 * Storm and Base still scale the box. `home` is the station during a read,
 * or the landmark once the zone is allowed to slide.
 */
function zoneSlide(
  assignment: DefenseAssignment,
  player: AssignedPlayer,
  carrier: Player,
  los: number,
  age: number,
  style: ChaseStyle,
  homeX: number,
  homeYard: number,
): Spot {
  let breath = boxBreath(age);
  if (style === "storm") breath = Math.max(breath, 1.12);
  if (style === "base") breath = Math.min(breath, 0.86);
  const span = style === "storm" ? 1.22 : style === "base" ? 0.78 : 1;
  const rx = Math.max(0.8, assignment.zoneRx * 1.2 * breath * span);
  const ry = Math.max(0.8, assignment.zoneRy * 1.15 * breath * span);
  let yard = clamp(
    shiftDownfield(carrier.yard, 0.8),
    Math.min(shiftDownfield(homeYard, -ry), shiftDownfield(homeYard, 2.2)),
    Math.max(shiftDownfield(homeYard, -ry), shiftDownfield(homeYard, 2.2)),
  );
  const north = readAttackNorth();
  const nearGoal = north ? player.yard >= FIELD.length - 1 : player.yard <= 1;
  if (nearGoal && downfieldDelta(carrier.yard, los) < 1.2) {
    yard = furtherDownfield(yard, shiftDownfield(player.yard, -0.4));
  }
  return { x: clamp(carrier.x, homeX - rx, homeX + rx), yard };
}

/**
 * Goal-line safeties, archive/v10/game.js 9318–9320.
 * Within 1.6 yards of the goal they sit between the runner and the end line.
 */
function withGoalLine(player: AssignedPlayer, assignment: DefenseAssignment, carrier: Player, aim: Spot): Spot {
  if (!(assignment.isSafety || assignment.job === "deep")) return aim;
  const north = readAttackNorth();
  const atGoal = north ? carrier.yard >= FIELD.length - 1.6 : carrier.yard <= 1.6;
  if (!atGoal) return aim;
  const goal = north ? FIELD.length : 0;
  const capNear = shiftDownfield(goal, -1.2);
  const capFar = shiftDownfield(goal, -3.5);
  const ahead = shiftDownfield(carrier.yard, 1.4);
  const towardGoal = furtherDownfield(ahead, capFar);
  const yard = north ? Math.min(towardGoal, capNear) : Math.max(towardGoal, capNear);
  return { x: carrier.x * 0.7 + player.x * 0.3, yard };
}

/**
 * Leveled contain once a job is keyed. archive/v10/game.js 9296–9317.
 * Deep stays further downfield. Underneath shades a lane. The front arrives on the ball.
 */
function keyedContain(
  player: AssignedPlayer,
  assignment: DefenseAssignment,
  players: readonly Player[],
  carrier: Player,
  los: number,
  snap: number,
  vel: { vx: number; vy: number },
): Spot {
  const gap = Math.hypot(player.x - carrier.x, player.yard - carrier.yard);
  const level =
    assignment.job === "deep" || assignment.isSafety
      ? 2
      : assignment.job === "drop" || assignment.job === "hook" || assignment.job === "robber"
        ? 1
        : 0;
  const width = readFieldWidth();
  const nearSideline = carrier.x <= 7.2 || carrier.x >= width - 7.2;
  const wideRun = nearSideline || Math.abs(carrier.x - snap) > 9.5;
  const behindLos = downfieldDelta(los, carrier.yard) > 0.35;
  const lead = gap < 3.2 ? 0 : Math.min(2.4, gap * (0.12 + level * 0.04));
  const sideBias = wideRun ? 0 : assignment.laneOffset * (0.35 + level * 0.15);
  const containDepth = wideRun ? 0 : level === 2 ? 2.8 : level === 1 ? 1.1 : 0;
  let x = carrier.x + vel.vx * lead * 0.12 + sideBias;
  let yard = (behindLos ? carrier.yard : shiftDownfield(carrier.yard, containDepth)) + vel.vy * lead * 0.06;
  if (wideRun) x = carrier.x;
  if (level < 2 && gap > 4.5) {
    let nearest: Player | null = null;
    let nearestDist = 99;
    for (const other of players) {
      if (other === player || other.team !== "def") continue;
      if (contactOf(other).pancake > 0) continue;
      const gapAlly = Math.hypot(other.x - player.x, other.yard - player.yard);
      if (gapAlly < nearestDist && gapAlly < 9) {
        nearestDist = gapAlly;
        nearest = other;
      }
    }
    if (nearest) x += (Math.sign(player.x - nearest.x) || 1) * 0.55;
  }
  return { x, yard };
}

/**
 * Spy phases from archive/v10/game.js 9242–9258.
 * Fake the stutter, catch the landmark, then follow just off the runner's hip.
 */
function spyAim(player: AssignedPlayer, assignment: DefenseAssignment, carrier: Player, age: number): Spot {
  if (age < 0.28) {
    spyPhaseOf.set(assignment, "fake");
    return {
      x: assignment.stutter ? assignment.stutterX : player.x + 1.6,
      yard: assignment.stutter ? assignment.stutterYard : shiftDownfield(player.yard, -1),
    };
  }
  const reachJob = Math.hypot(assignment.x - player.x, assignment.yard - player.yard);
  if (reachJob > 0.85 && age < 0.85) {
    spyPhaseOf.set(assignment, "catch");
    return { x: assignment.x, yard: assignment.yard };
  }
  spyPhaseOf.set(assignment, "follow");
  assignment.zoneFollow = true;
  assignment.x = player.x;
  assignment.yard = player.yard;
  const hip = player.x < carrier.x ? -0.8 : 0.8;
  return { x: carrier.x + hip, yard: shiftDownfield(carrier.yard, 0.35) };
}

function aimFor(
  player: AssignedPlayer,
  players: readonly Player[],
  carrier: Player,
  los: number,
  snap: number,
  age: number,
  dt: number,
  vel: { vx: number; vy: number },
  style: ChaseStyle,
): Spot | null {
  // Wide receivers keep the pre-snap spot. They are not blockers, and pursue would run them at the ball.
  if (player.role === "WR") return { x: player.x, yard: player.yard };
  const assignment = player.assignment;
  if (isBlock(assignment)) return blockAim(assignment, player, players, carrier, los);
  if (isDefense(assignment)) {
    // archive/v10/game.js 9157–9158. Engagement skips this function, so the read pauses in a block.
    if (dt > 0) {
      if (assignment.readTime > 0) assignment.readTime = Math.max(0, assignment.readTime - dt);
      if (assignment.reactTime > 0) assignment.reactTime = Math.max(0, assignment.reactTime - dt);
    }
    // Moving zones copy the defender before the past-landmark test. archive/v10/game.js 9189–9192.
    if (assignment.zoneFollow) {
      assignment.x = player.x;
      assignment.yard = player.yard;
    }
    const gap = Math.hypot(player.x - carrier.x, player.yard - carrier.yard);
    const pastAt = style === "storm" ? 1.4 : style === "base" ? 3.6 : 2.4;
    const past = downfieldDelta(carrier.yard, assignment.yard) > pastAt;
    const reach = keyDistance(assignment) * (style === "storm" ? 1.45 : style === "base" ? 0.68 : 1);
    const keyed = gap < reach || past;
    const width = readFieldWidth();
    const nearSideline = carrier.x <= 7.2 || carrier.x >= width - 7.2;
    const wideRun = nearSideline || Math.abs(carrier.x - snap) > 9.5;
    const outsideZoneX = Math.abs(carrier.x - assignment.x) > (assignment.zoneRx || 5) * 0.52;
    const pastZone = downfieldDelta(carrier.yard, assignment.yard) > 2.4 || outsideZoneX || nearSideline || wideRun;
    const reading = assignment.readTime > 0;
    const behindLos = downfieldDelta(los, carrier.yard) > 0.35;
    const atLevel =
      ZONE_JOBS.has(assignment.job) &&
      !pastZone &&
      downfieldDelta(carrier.yard, los) > -1 &&
      downfieldDelta(carrier.yard, assignment.yard) > -8 &&
      reading;
    // archive/v10/game.js 9199 and 9237. These keep the zone after the simple gate would chase.
    const keepDeep =
      (assignment.job === "deep" || assignment.job === "robber" || assignment.isSafety) &&
      !pastZone &&
      !wideRun &&
      gap > 7.2 &&
      downfieldDelta(assignment.yard, carrier.yard) > 1.5 &&
      reading;
    const holdZone =
      ZONE_JOBS.has(assignment.job) && !pastZone && !wideRun && reading && gap > 6.4 && (atLevel || behindLos);
    const finish = (aim: Spot) => withGoalLine(player, assignment, carrier, aim);
    if (assignment.job === "spy") return finish(spyAim(player, assignment, carrier, age));
    // Storm contains and Base arcs. archive/v10/game.js 9259–9261. The key trigger still wins.
    if ((style === "storm" || style === "base") && assignment.stutter && age < 0.5 && !keyed) {
      return finish({ x: assignment.stutterX, yard: assignment.stutterYard });
    }
    // Misfire aims at the wrong blocker. archive/v10/game.js 9235–9264. Spy and stutter still win.
    if (assignment.misfireTime > 0 && gap > 7 && assignment.misfireTargetId) {
      const wrong = players.find((body) => body.id === assignment.misfireTargetId);
      if (wrong) return finish({ x: wrong.x, yard: wrong.yard });
    }
    const delay = style === "storm" ? assignment.blitzDelay * 0.45 : assignment.blitzDelay;
    if ((assignment.job === "blitz" || assignment.job === "man") && delay > 0 && age < delay && gap >= 3.2) {
      return finish({
        x: player.x + (assignment.x - player.x) * 0.08,
        yard: shiftDownfield(player.yard, 0.15),
      });
    }
    if (keepDeep || holdZone) {
      return finish(zoneSlide(assignment, player, carrier, los, age, style, assignment.stationX, assignment.stationYard));
    }
    // archive/v10/game.js 9229–9231 and 9283–9285. A fake show, or an unread blitz, stays on its landmark.
    const shownBlitz =
      assignment.fakeBlitz && assignment.reactTime > 0 ? assignment.job !== "blitz" : assignment.job === "blitz";
    if (reading && age < 0.7 + assignment.blitzDelay && shownBlitz && gap >= 3.2) {
      return finish({ x: assignment.x, yard: assignment.yard });
    }
    if (ZONE_JOBS.has(assignment.job) && gap >= 3.2 && !past) {
      return finish(zoneSlide(assignment, player, carrier, los, age, style, assignment.x, assignment.yard));
    }
    if (assignment.job === "man" && age < 1.05 && gap > 5 && assignment.manTargetId) {
      const mark = players.find((body) => body.id === assignment.manTargetId);
      if (mark) return finish({ x: mark.x, yard: shiftDownfield(mark.yard, 0.8) });
    }
    if (keyed) return finish(keyedContain(player, assignment, players, carrier, los, snap, vel));
    return finish({ x: assignment.x, yard: assignment.yard });
  }
  if (assignment.kind === "pursue") return { x: carrier.x, yard: carrier.yard };
  return null;
}

function dist(a: Player, b: Player): number {
  return Math.hypot(a.x - b.x, a.yard - b.yard);
}

/** Canvas `sealSide || driveSide`, then the blocker's side of the runner. */
function washSide(block: BlockAssignment, blocker: Player, carrier: Player): -1 | 1 {
  if (block.sealSide === -1 || block.sealSide === 1) return block.sealSide;
  if (block.driveSide === -1 || block.driveSide === 1) return block.driveSide;
  return Math.sign(blocker.x - carrier.x) < 0 ? -1 : 1;
}

/**
 * archive/v10/game.js 8919–8922.
 * Lane beside the runner. It opens after 6.2 yards gained and widens from there.
 */
function creaseWashPoint(
  block: BlockAssignment,
  blocker: Player,
  carrier: Player,
  los: number,
): { x: number; yard: number } | null {
  const gained = downfieldDelta(carrier.yard, los);
  if (gained <= 6.2) return null;
  const side = washSide(block, blocker, carrier);
  const widen = Math.min(3.6, (gained - 6) * 0.32);
  return {
    x: carrier.x + side * (3.3 + widen),
    yard: shiftDownfield(carrier.yard, 0.55),
  };
}

function blockClaims(players: readonly Player[]): Set<string> {
  const claimed = new Set<string>();
  for (const player of players) {
    const assignment = (player as AssignedPlayer).assignment;
    if (assignment && isBlock(assignment) && assignment.targetId) claimed.add(assignment.targetId);
  }
  return claimed;
}

/**
 * archive/v10/game.js 8900–8913.
 * A free defender in the window means the crease is not open. The blocker's
 * own target still counts, so a climb already in the lane is not released.
 */
function creaseOccupied(
  block: BlockAssignment,
  blocker: Player,
  carrier: Player,
  defenders: readonly Player[],
  claimed: ReadonlySet<string>,
): boolean {
  const seal = washSide(block, blocker, carrier);
  for (const defender of defenders) {
    if (defender.id !== block.targetId && claimed.has(defender.id)) continue;
    const clock = contactOf(defender);
    if (clock.pancake > 0 || clock.recover > 0) continue;
    const ahead = downfieldDelta(defender.yard, carrier.yard);
    if (ahead < -1.2 || ahead > 7) continue;
    if (Math.abs(defender.x - carrier.x) > 5.5) continue;
    if (seal > 0 && defender.x < carrier.x - 3.2) continue;
    if (seal < 0 && defender.x > carrier.x + 3.2) continue;
    const near = dist(defender, blocker) * 0.55 + dist(defender, carrier) * 0.45;
    if (near < 8.2) return true;
  }
  return false;
}

/** Wash point when the crease is open. Null keeps the climb-to-next-defender path. */
function openCrease(
  block: BlockAssignment,
  blocker: Player,
  carrier: Player,
  players: readonly Player[],
  los: number,
  claimed?: ReadonlySet<string>,
): { x: number; yard: number } | null {
  const wash = creaseWashPoint(block, blocker, carrier, los);
  if (!wash) return null;
  const defenders = players.filter((player) => player.team === "def");
  const held = claimed ?? blockClaims(players);
  if (creaseOccupied(block, blocker, carrier, defenders, held)) return null;
  return wash;
}

function promoteSecondLevel(block: BlockAssignment) {
  block.secondLevel = true;
  block.mode = "climb";
  block.levelY = Math.max(block.levelY, 5.5);
  block.targetId = null;
}

/**
 * After the first block sheds or the hold ends, climb to a linebacker or a
 * deeper gap instead of standing on the line.
 */
function claimSecondLevel(
  block: BlockAssignment,
  defenders: readonly AssignedPlayer[],
  claimed: Set<string>,
  snap: number,
  los: number,
) {
  const aimX = snap + block.sealSide * 6.5;
  const aimY = shiftDownfield(los, block.levelY);
  block.gapAimX = aimX;
  block.gapAimY = aimY;
  let best: AssignedPlayer | null = null;
  let bestDist = 14;
  for (const defender of defenders) {
    if (claimed.has(defender.id)) continue;
    const clock = contactOf(defender);
    if (clock.pancake > 0 || clock.recover > 0) continue;
    if (defender.role === "DT" && downfieldDelta(defender.yard, los) < 1.5) continue;
    const score = Math.hypot(defender.x - aimX, defender.yard - aimY);
    const bias = defender.role === "LB" ? 0.75 : defender.role === "DB" ? 0.9 : 1;
    if (score * bias < bestDist) {
      bestDist = score * bias;
      best = defender;
    }
  }
  if (best) {
    block.targetId = best.id;
    claimed.add(best.id);
  }
}

/**
 * Drop a target the runner has beaten or left behind, then claim a free defender
 * in the blocker's lane. A finished or shed block climbs to the second level,
 * or washes the crease when that lane is open.
 */
function retargetBlockers(players: readonly AssignedPlayer[], carrier: Player, snap: number, los: number) {
  const blockers = players.filter((player) => isBlock(player.assignment));
  const defenders = players.filter((player) => player.team === "def");
  const claimed = new Set<string>();
  for (const blocker of blockers) {
    const block = blocker.assignment;
    if (!isBlock(block)) continue;
    const target = block.targetId ? defenders.find((player) => player.id === block.targetId) : undefined;
    if (target && !block.backsideSeal) {
      const beaten = downfieldDelta(carrier.yard, target.yard) > 1.8 && dist(target, carrier) + 0.4 < dist(blocker, carrier);
      const stale = downfieldDelta(carrier.yard, target.yard) > 6.2;
      const clock = contactOf(target);
      const holdDone = clock.pushYards > 0 && clock.engage <= 0 && clock.pancake <= 0 && clock.recover <= 0;
      if (beaten || stale || holdDone || clock.pancake > 0 || clock.recover > 0) {
        if (beaten) clock.engage = 0;
        promoteSecondLevel(block);
      }
    }
    if (target && block.backsideSeal && (target.x - snap) * block.sealSide < 1.1) block.targetId = null;
    if (block.targetId) claimed.add(block.targetId);
  }
  for (const blocker of blockers) {
    const block = blocker.assignment;
    if (!isBlock(block)) continue;
    // archive/v10/game.js 8897–8922. Wash instead of locking the next body.
    if (block.secondLevel && !block.backsideSeal && openCrease(block, blocker, carrier, players, los, claimed)) {
      if (block.targetId) claimed.delete(block.targetId);
      block.targetId = null;
      continue;
    }
    if (block.targetId) continue;
    if (block.secondLevel) {
      claimSecondLevel(block, defenders, claimed, snap, los);
      continue;
    }
    let best: AssignedPlayer | null = null;
    let bestDist = block.backsideSeal ? 12 : 8.8;
    for (const defender of defenders) {
      if (claimed.has(defender.id)) continue;
      const clock = contactOf(defender);
      if (clock.pancake > 0 || clock.recover > 0) continue;
      if (downfieldDelta(carrier.yard, defender.yard) > 1.6) continue;
      if (block.backsideSeal && (defender.x - snap) * block.sealSide < 1.1) continue;
      if (!block.backsideSeal) {
        const sameLane = Math.abs(defender.x - blocker.x) < 3.6;
        const playSide = block.sealSide > 0 ? defender.x >= carrier.x - 1.4 : defender.x <= carrier.x + 1.4;
        if (!sameLane && !playSide) continue;
      }
      const groupBias = blocker.role === "OL" && defender.role === "DT" ? 0.72 : 1;
      const score = (dist(defender, blocker) * 0.65 + dist(defender, carrier) * 0.35) * groupBias;
      if (score < bestDist) {
        bestDist = score;
        best = defender;
      }
    }
    if (best) {
      block.targetId = best.id;
      claimed.add(best.id);
    }
  }
}

const STEER_ROLES = new Set(["OL", "TE", "FB"]);

/** Nearest OL, TE, or FB on the carrier's left (−1) or right (+1). */
function nearestTeammate(players: readonly AssignedPlayer[], carrier: Player, side: -1 | 1): AssignedPlayer | null {
  let best: AssignedPlayer | null = null;
  let bestDist = Infinity;
  for (const player of players) {
    if (player.controlled || !STEER_ROLES.has(player.role)) continue;
    const dx = player.x - carrier.x;
    if (side < 0 ? dx > -0.2 : dx < 0.2) continue;
    const gap = Math.hypot(dx, player.yard - carrier.yard);
    if (gap < bestDist) {
      bestDist = gap;
      best = player;
    }
  }
  return best;
}

/**
 * A point ahead of the blocker along the stick. A dead stick holds him
 * so the block assignment does not run while he is selected.
 */
function steerPoint(blocker: Player, stickX: number, stickYard: number): { x: number; yard: number } {
  const mag = Math.hypot(stickX, stickYard);
  if (mag < ROUTE_LEAVE) return { x: blocker.x, yard: blocker.yard };
  const lead = 8;
  return {
    x: blocker.x + (stickX / mag) * lead,
    yard: blocker.yard + (stickYard / mag) * lead,
  };
}

/** Capped pancake or recover drift. archive/v10/game.js 9119–9144. */
function slideContact(player: Player, dt: number, rate: number) {
  const clock = contactOf(player);
  let vx = clock.slideX * rate;
  let vy = clock.slideY * rate;
  if (rate >= 1) {
    vx = clamp(vx, -5.5, 5.5);
    vy = clamp(vy, -2.5, 4);
  }
  player.x = clamp(player.x + vx * dt, PLAY_MIN_X, playMaxX());
  player.yard = clamp(player.yard + vy * dt, PLAY_MIN_YARD, PLAY_MAX_YARD);
}

function bodyRadius(role: string): number {
  if (role === "OL" || role === "DT") return 0.95;
  if (role === "FB" || role === "TE") return 0.9;
  return 0.85;
}

/**
 * Push apart bodies that are sharing a landmark.
 * archive/v10/game.js `applyAssignmentRepulsion` 2512–2548.
 * `separate` in sim.ts still runs. This push is the extra one.
 */
function applyAssignmentRepulsion(
  players: readonly AssignedPlayer[],
  dt: number,
  userId: string | null,
  steered: ReadonlySet<string>,
) {
  const width = readFieldWidth();
  const wide = clamp((width - 50) / 50, 0, 1);
  const minSep = 1.05 + wide * 0.7;
  const pushRate = 5.4;
  const pack = (list: AssignedPlayer[], skip: (player: AssignedPlayer) => boolean) => {
    const body = list.filter((player) => {
      if (skip(player)) return false;
      const clock = contactOf(player);
      return clock.pancake <= 0 && clock.recover <= 0;
    });
    for (let i = 0; i < body.length; i++) {
      for (let j = i + 1; j < body.length; j++) {
        const a = body[i];
        const b = body[j];
        if (!a || !b) continue;
        if (Math.abs(a.yard - b.yard) > 2.6) continue;
        const dx = a.x - b.x;
        const dy = a.yard - b.yard;
        const distAB = Math.hypot(dx, dy) || 1e-4;
        const need = minSep + (bodyRadius(a.role) + bodyRadius(b.role)) * 0.12;
        if (distAB >= need) continue;
        const push = (need - distAB) * pushRate * dt;
        const nx = dx / distAB;
        const ny = (dy / distAB) * 0.32;
        a.x += nx * push * 0.5;
        b.x -= nx * push * 0.5;
        a.yard += ny * push * 0.5;
        b.yard -= ny * push * 0.5;
      }
    }
  };
  const defenders = players.filter((player) => player.team === "def");
  const blockers = players.filter(
    (player) => player.role === "OL" || player.role === "TE" || player.role === "QB" || player.role === "FB",
  );
  pack(defenders, (player) => player.id === userId);
  pack(blockers, (player) => steered.has(player.id));
  const cap = FIELD.length + 10 - 1.5;
  for (const player of defenders) {
    player.x = clamp(player.x, 0.8, Math.max(0.8, width - 0.8));
    player.yard = Math.min(player.yard, cap);
  }
  for (const player of blockers) {
    player.x = clamp(player.x, 0.8, Math.max(0.8, width - 0.8));
    player.yard = Math.min(player.yard, cap);
  }
}

function seek(player: Player, x: number, yard: number, dt: number, scale = 1) {
  const dx = x - player.x;
  const dy = yard - player.yard;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-4 || dt <= 0) return;
  const stepLen = Math.min(roleSpeed(player.role) * scale * dt, dist);
  if (stepLen <= 0) return;
  player.x = clamp(player.x + (dx / dist) * stepLen, PLAY_MIN_X, playMaxX());
  player.yard = clamp(player.yard + (dy / dist) * stepLen, PLAY_MIN_YARD, PLAY_MAX_YARD);
  player.facingX = dx / dist;
  player.facingYard = dy / dist;
  releaseStance(player);
}

function copyPose(from: Player, to: Player) {
  if (from === to) return;
  to.x = from.x;
  to.yard = from.yard;
  to.facingX = from.facingX;
  to.facingYard = from.facingYard;
  to.hop = from.hop;
}

/** Spots to put back so a dead-ball shove cannot drag a frozen player. */
function holdPlaces(players: readonly Player[], exceptId: string | null) {
  return players
    .filter((player) => player.id !== exceptId)
    .map((player) => ({ player, x: player.x, yard: player.yard }));
}

function restorePlaces(held: { player: Player; x: number; yard: number }[]) {
  for (const row of held) {
    row.player.x = row.x;
    row.player.yard = row.yard;
  }
}

/**
 * Whistle is already blown. AI and teammates stay where they are.
 * Offense still steps the ball carrier. Defense still steps the user defender.
 */
function stepUserAfterWhistle(
  sim: Sim,
  assigned: AssignedPlay,
  input: Input & Partial<PlayInput> & { defense?: DefenseStick | null },
  dt: number,
): Input {
  const bounded = dt > 0 ? Math.min(dt, 0.05) : 0;
  assigned.age += bounded;
  const playingDef = input.defense != null;
  const carrier = assigned.players.find((player) => player.controlled) ?? null;
  syncById(assigned.players, sim.players);
  if (playingDef) {
    const userId = readUserDefenderId();
    const held = holdPlaces(sim.players, userId);
    if (carrier && input.defense && bounded > 0) {
      tickDefenseLive(assigned.players, carrier, input.defense, bounded, sim.los);
      syncById(assigned.players, sim.players);
      // A dead-ball hit must not rename the next whistle.
      consumeDefenseFinish();
    }
    restorePlaces(held);
    setUserOnOffense(false);
  } else {
    const held = holdPlaces(sim.players, carrier?.id ?? null);
    setUserOnOffense(true);
    step(sim, input, dt);
    restorePlaces(held);
  }
  syncById(sim.players, assigned.players);
  flushStanceReleases();
  return input;
}

function pushReplayFrame(sim: Sim, assigned: AssignedPlay, opening = false) {
  const tape = assigned.replay;
  if (!tape) return;
  tape.frames.push({
    age: opening ? tape.prelude : assigned.age,
    pose: sim.pose,
    ballX: sim.ballX,
    ballYard: sim.ballYard,
    side: readPlaySide(),
    players: sim.players.map((player) => ({
      id: player.id,
      x: player.x,
      yard: player.yard,
      hop: player.hop,
      facingX: player.facingX,
      facingYard: player.facingYard,
      pose: poseForReplay(player, sim.pose),
    })),
    ...(opening ? { opening: true } : {}),
  });
  // The 10s window trims the live play only. Lineup stances stay at the front.
  const frames = tape.frames;
  const newest = frames[frames.length - 1];
  while (frames.length > 2 && newest) {
    let drop = -1;
    for (let i = 0; i < frames.length - 1; i++) {
      const frame = frames[i];
      if (!frame || frame.opening) continue;
      if (newest.age - frame.age > REPLAY_HORIZON) drop = i;
      break;
    }
    if (drop < 0) break;
    frames.splice(drop, 1);
  }
}

/**
 * Sample the armed formation. Ages count up on `prelude` and are shifted
 * onto the snap when `sealOpeningReplay` runs, so the scrub starts in the stances.
 */
export function noteOpeningReplay(sim: Sim, assigned: AssignedPlay, dt: number) {
  const tape = assigned.replay;
  if (!tape || tape.sealed) return;
  const step = dt > 0 ? Math.min(dt, 0.05) : 0;
  tape.since += step;
  const due = tape.frames.length === 0 || tape.since >= REPLAY_SAMPLE;
  if (!due) return;
  const consumed = tape.since >= REPLAY_SAMPLE ? REPLAY_SAMPLE : tape.since;
  if (tape.since >= REPLAY_SAMPLE) tape.since -= REPLAY_SAMPLE;
  else tape.since = 0;
  tape.prelude += consumed;
  pushReplayFrame(sim, assigned, true);
}

/** Stamp the lineup, then put that frame at age 0. Later samples use the live clock. */
export function sealOpeningReplay(sim: Sim, assigned: AssignedPlay) {
  const tape = assigned.replay;
  if (!tape || tape.sealed) return;
  // A snap with no elapsed time still needs its own sample, or it shares an age
  // with the armed frame and the scrub never lands on it.
  const gap = Math.max(0, tape.since);
  tape.prelude += gap > 0 || tape.frames.length === 0 ? gap : 1e-3;
  tape.since = 0;
  pushReplayFrame(sim, assigned, true);
  const end = tape.prelude;
  if (end !== 0) {
    for (const frame of tape.frames) {
      if (frame.opening) frame.age -= end;
    }
  }
  tape.sealed = true;
}

/** Sample the roster after the carrier step. A tackle frame is kept even if it is early. */
function recordReplay(sim: Sim, assigned: AssignedPlay, dt: number, force: boolean) {
  const tape = assigned.replay;
  if (!tape) return;
  tape.since += dt;
  const due = tape.frames.length === 0 || tape.since >= REPLAY_SAMPLE || force;
  if (!due) return;
  if (tape.since >= REPLAY_SAMPLE) tape.since -= REPLAY_SAMPLE;
  else tape.since = 0;
  pushReplayFrame(sim, assigned);
}

/** Frame at `age`, with positions blended between samples. The pose snaps at the halfway mark. */
export function sampleReplay(frames: readonly ReplayFrame[], age: number): ReplayFrame | null {
  const first = frames[0];
  if (!first) return null;
  if (frames.length === 1 || age <= first.age) return first;
  const last = frames[frames.length - 1];
  if (!last || age >= last.age) return last;
  let hi = 1;
  while (hi < frames.length && frames[hi]!.age < age) hi += 1;
  const after = frames[hi];
  const before = frames[hi - 1];
  if (!after || !before) return last;
  const span = after.age - before.age;
  const t = span <= 1e-6 ? 1 : (age - before.age) / span;
  const nextById = new Map(after.players.map((player) => [player.id, player]));
  return {
    age,
    pose: t < 0.5 ? before.pose : after.pose,
    ballX: before.ballX + (after.ballX - before.ballX) * t,
    ballYard: before.ballYard + (after.ballYard - before.ballYard) * t,
    side: t < 0.5 ? before.side : after.side,
    players: before.players.map((left) => {
      const right = nextById.get(left.id);
      if (!right) return left;
      const facingX = left.facingX + (right.facingX - left.facingX) * t;
      const facingYard = left.facingYard + (right.facingYard - left.facingYard) * t;
      const mag = Math.hypot(facingX, facingYard) || 1;
      return {
        id: left.id,
        x: left.x + (right.x - left.x) * t,
        yard: left.yard + (right.yard - left.yard) * t,
        hop: left.hop + (right.hop - left.hop) * t,
        facingX: facingX / mag,
        facingYard: facingYard / mag,
        pose: t < 0.5 ? (left.pose ?? null) : (right.pose ?? left.pose ?? null),
      };
    }),
  };
}

/**
 * Offense runs the called route, then the canvas post-script drive, when the user is on defense.
 * The route cursor itself stays in `desiredCarrierInput`.
 */
function cpuCarry(assigned: AssignedPlay, aimed: Input): Input {
  const found = carrierRoute(assigned);
  if (found && found.route.index < found.route.steps.length) return { ...aimed, action: "carry", sprint: false };
  const carrier = found?.player ?? assigned.players.find((player) => player.controlled);
  const side = playSideSign(assigned.play);
  if (!carrier) return { x: side * 0.2, yard: attackSign(), action: "carry", sprint: false };
  // archive/v10/game.js 5753–5772. Play-side drift, then bend off the nearest
  // live defender inside 4.4 yards. Clear of 6 yards is the small 1.12 gear.
  // Step clamps a stick at 1, so that gear is the sprint flag.
  let x = side * 0.2;
  let yard = attackSign();
  let nearest = Infinity;
  let nearestX = carrier.x;
  for (const player of assigned.players) {
    if (player.team !== "def") continue;
    const clock = contactOf(player);
    if (clock.pancake > 0) continue;
    if (clock.recover > 0 && clock.last?.outcome === "whiff") continue;
    const gap = dist(player, carrier);
    if (gap < nearest) {
      nearest = gap;
      nearestX = player.x;
    }
  }
  if (nearest < 4.4) {
    const away = Math.sign(carrier.x - nearestX) || side;
    x += away * (nearest < 2.15 ? 1.2 : 0.72);
  }
  const mag = Math.hypot(x, yard) || 1;
  return { x: x / mag, yard: yard / mag, action: "carry", sprint: nearest > 6 };
}

function syncById(from: readonly Player[], to: readonly Player[]) {
  const byId = new Map(from.map((player) => [player.id, player]));
  for (const player of to) {
    const source = byId.get(player.id);
    if (source) copyPose(source, player);
  }
}

/**
 * Advance the route and the other players, then run `step` for the carrier.
 * Returns the input `step` actually received. The route replaces the stick
 * until the path ends or the stick breaks it.
 */
export function stepAssignments(
  sim: Sim,
  assigned: AssignedPlay,
  input: Input & Partial<PlayInput> & { defense?: DefenseStick | null },
  dt: number,
): Input {
  // Armed formation. Poses are already on the roster. Movement, the carrier
  // pose clock, and stance release wait until the user snaps.
  // After the whistle only the user keeps moving. Everyone else stays put until the lineup.
  if (!assigned.snapped) return input;
  // The view seals this before the snap releases a stance. This catches a step
  // that arrives first, while the bodies are still in the lineup.
  if (!assigned.replay.sealed) sealOpeningReplay(sim, assigned);
  if (sim.playOver) return stepUserAfterWhistle(sim, assigned, input, dt);
  const wasOver = sim.playOver;
  const bounded = dt > 0 ? Math.min(dt, 0.05) : 0;
  assigned.age += bounded;
  const playingDef = input.defense != null;
  const aimed = desiredCarrierInput(
    assigned,
    playingDef ? { x: 0, yard: 0, action: "carry", sprint: false } : input,
    bounded,
  );
  const desired: Input = playingDef
    ? cpuCarry(assigned, aimed)
    : { x: aimed.x, yard: aimed.yard, action: aimed.action, sprint: aimed.sprint };
  const carrier = assigned.players.find((player) => player.controlled) ?? null;
  const stiffArm = !playingDef && (input.action === "stiffL" || input.action === "stiffR");
  const userId = playingDef ? readUserDefenderId() : null;
  if (bounded > 0) {
    for (const player of assigned.players) tickContact(player, bounded);
  }
  if (carrier && bounded > 0) {
    const vel = sampleCarrierVelocity(carrier, bounded);
    const idle = noteCarrierIdle(assigned, input, sim, playingDef, vel.vx, vel.vy, bounded);
    retargetBlockers(assigned.players, carrier, assigned.snapX, sim.los);
    const steeredLeft = !playingDef && input.steerLeft ? nearestTeammate(assigned.players, carrier, -1) : null;
    const steeredRight = !playingDef && input.steerRight ? nearestTeammate(assigned.players, carrier, 1) : null;
    const style = defenseStyle(assigned.scheme.id);
    for (const player of assigned.players) {
      if (player.controlled || player.id === userId) continue;
      const clock = contactOf(player);
      if (clock.pancake > 0) {
        // archive/v10/game.js 9119–9131. A pancake slides, then stays down on the get-up.
        if (player.team === "def") slideContact(player, bounded, 1);
        continue;
      }
      const attack = player.team === "def" ? attackOf(player) : null;
      const closing = attack ? defenderClosing(player, bounded) : 0;
      if (player.team === "def" && clock.engage > 0) {
        // archive/v10/game.js 9057. A blocked tackle is no longer late off the ball.
        if (attack) attack.dtLag = false;
        continue;
      }
      if (player.team === "def" && clock.recover > 0) {
        // archive/v10/game.js 9136–9151. Recover slides. It does not wrap back into the tackle.
        slideContact(player, bounded, 0.3);
        continue;
      }
      if (attack && clock.recover <= 0) {
        if (attack.decide > 0) attack.decide = Math.max(0, attack.decide - bounded);
        if (attack.time > 0) {
          attack.time = Math.max(0, attack.time - bounded);
          if (attack.time === 0) {
            attack.kind = null;
            player.hop = 0;
          }
        }
        const assignment = player.assignment;
        if (isDefense(assignment) && assignment.misfireTime > 0) {
          assignment.misfireTime = Math.max(0, assignment.misfireTime - bounded);
        }
        const gap = Math.hypot(player.x - carrier.x, player.yard - carrier.yard);
        chooseDefenderAttack(player, carrier, sim.los, gap, closing, vel.vx);
      }
      let scale = clock.recover > 0 ? 0.35 : clock.slowed > 0 ? 0.55 : 1;
      // archive/v10/game.js 9203–9221. Storm and Base scales below stay as they were.
      if (attack && clock.slowed <= 0 && attack.dtLag) {
        const trail = downfieldDelta(carrier.yard, player.yard);
        if (trail < 10) scale *= 0.55 + Math.max(0, trail / 10) * 0.45;
        else attack.dtLag = false;
      }
      if (player.team === "def" && style === "storm") scale *= 1.18;
      if (player.team === "def" && style === "base") scale *= 0.88;
      if (attack) {
        const gap = Math.hypot(player.x - carrier.x, player.yard - carrier.yard);
        const trail = downfieldDelta(carrier.yard, player.yard);
        const behindLos = downfieldDelta(sim.los, carrier.yard) > 0.35;
        const sprintOn = !behindLos && ((gap < 8.6 && trail < 3.4) || gap < 4.2);
        if (sprintOn) scale *= 1.38;
        if (behindLos) {
          const depth = Math.max(0, downfieldDelta(sim.los, carrier.yard));
          scale *= clamp(0.78 - Math.min(0.18, depth * 0.025), 0.58, 0.82);
        }
        if (trail > 2.2 && gap > 3.6) scale *= 0.94;
        if (attack.kind === "dive" && attack.time > 0) scale *= 1.38;
        else if (attack.kind === "hit" && attack.time > 0) scale *= 1.2;
      }
      scale *= bodyTravelScale(player.team, playingDef, false);
      const steered = player === steeredLeft || player === steeredRight;
      const separateStick = input.steerMode === "independent" || input.steerMode === "classic";
      const stickX = separateStick ? (input.blockerX ?? 0) : input.x;
      const stickYard = separateStick ? (input.blockerYard ?? 0) : input.yard;
      const diving = attack && (attack.kind === "dive" || attack.kind === "hit") && attack.time > 0;
      const aim = steered
        ? steerPoint(player, stickX, stickYard)
        : diving
          ? { x: player.x + attack.aimX * 10, yard: player.yard + attack.aimY * 10 }
          : aimFor(player, assigned.players, carrier, sim.los, assigned.snapX, assigned.age, bounded, vel, style);
      if (isBlock(player.assignment)) {
        // archive/v10/game.js 8939–8946. Age, style, and idle before the seek.
        scale *= blockerPace(player.assignment, assigned.play.blockStyle, assigned.age, idle);
      }
      if (aim) seek(player, aim.x, aim.yard, bounded, scale);
    }
    const steeredIds = new Set<string>();
    if (steeredLeft) steeredIds.add(steeredLeft.id);
    if (steeredRight) steeredIds.add(steeredRight.id);
    applyAssignmentRepulsion(assigned.players, bounded, userId, steeredIds);
    const live = playingDef && input.defense
      ? tickDefenseLive(assigned.players, carrier, input.defense, bounded, sim.los)
      : null;
    if (live) {
      desired.x *= live.carrierScale;
      desired.yard *= live.carrierScale;
      if (live.carrierScale < 1) desired.sprint = false;
    }
    for (const player of assigned.players) {
      const block = player.assignment;
      if (!isBlock(block) || !block.targetId) continue;
      const targetId = block.targetId;
      const target = assigned.players.find((body) => body.id === targetId);
      if (!target) continue;
      resolveBlockContact(player, target, block, carrier, bounded, !stiffArm, assigned.age, target.id === userId);
    }
    const threats = assigned.players
      .filter((player) => player.team === "def" && !player.controlled)
      .sort((a, b) => dist(a, carrier) - dist(b, carrier));
    for (const defender of threats) {
      const reachScale = defender.id === userId ? userTackleScale() : 1;
      if (reachScale <= 0) continue;
      let tackle: ContactResult | null = null;
      try {
        tackle = resolveTackle(carrier, defender, desired.sprint, stiffArm, assigned.age, reachScale);
      } catch (err) {
        console.error("[contact] threw", {
          frame: Math.round(assigned.age * 60),
          defender: defender.id,
          err,
        });
        continue;
      }
      // A whiff, a near miss, and a thrown check leave the play running.
      // A tackle whistles. Later frames freeze everyone but the user.
      if (tackle?.outcome !== "tackled") continue;
      if (!sim.playOver) {
        sim.playOver = true;
        console.log("[playOver] set", {
          frame: Math.round(assigned.age * 60),
          age: Number(assigned.age.toFixed(3)),
          reason: "tackled",
          defender: defender.id,
          carrier: carrier.id,
          dist: Number(Math.hypot(carrier.x - defender.x, carrier.yard - defender.yard).toFixed(3)),
        });
      }
      break;
    }
    if (live?.endPlay && !sim.playOver) {
      sim.playOver = true;
      console.log("[playOver] set", {
        frame: Math.round(assigned.age * 60),
        age: Number(assigned.age.toFixed(3)),
        reason: live.fumble ? "fumble" : "user tackle",
        defender: userId,
        carrier: carrier.id,
      });
    }
  }
  syncById(assigned.players, sim.players);
  setUserOnOffense(!playingDef);
  // Defense whistle: the user defender already moved. Do not run the CPU carrier.
  if (!(sim.playOver && playingDef)) step(sim, desired, dt);
  syncById(sim.players, assigned.players);
  if (!wasOver) recordReplay(sim, assigned, bounded, sim.playOver);
  flushStanceReleases();
  return desired;
}
