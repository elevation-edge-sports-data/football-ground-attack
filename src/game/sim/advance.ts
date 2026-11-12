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
 * Blockers drop a beaten target and claim another. Overlap with that target
 * becomes a hold, a pancake, or a shed in `contact.ts`. `step` still separates
 * the roster and still owns the stiff-arm push.
 *
 * Opt-in. `createSim` never calls this. Put `attachAssignments(...).players`
 * on the sim before the first call so the controlled halfback is the carrier
 * `step` moves.
 */
import { PLAY_MAX_X, PLAY_MAX_YARD, PLAY_MIN_X, PLAY_MIN_YARD, clamp } from "../../field/spec";
import { step, type Input, type Player, type Sim } from "../sim";
import type { PlayInput } from "./types";
import type { AssignedPlay, AssignedPlayer, ReplayFrame } from "./assign";
import { contactOf, resolveBlockContact, resolveTackle, tickContact } from "./contact";
import { bodyTravelScale, setUserOnOffense } from "./tuning";
import { attackSign, downfieldDelta, furtherDownfield, shiftDownfield } from "./attack";
import { consumeDefenseFinish, readUserDefenderId, tickDefenseLive, userTackleScale, type DefenseStick } from "./defense";
import { flushStanceReleases, releaseStance } from "./stance";
import type { BlockAssignment, ContactResult, DefenseAssignment, PlayAssignment, RouteAssignment } from "./types";

/** Canvas abandons a route when either stick axis passes this. */
const ROUTE_LEAVE = 0.15;
/** One replay sample. About 12 samples a second. */
const REPLAY_SAMPLE = 0.08;
/** How much of the play the scrub can still see. */
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
    if (block.pullPhase === 0) {
      const dist = Math.hypot(owner.x - via.x, owner.yard - via.y);
      if (downfieldDelta(los, owner.yard) >= 0.6 || dist < 1.1) block.pullPhase = 1;
      return { x: via.x, yard: via.y };
    }
    if (Math.abs(owner.x - via.x2) < 1.4) block.pullPhase = 2;
    return { x: via.x2, yard: via.y2 };
  }
  const target = block.targetId ? players.find((player) => player.id === block.targetId) : undefined;
  if (target) {
    if (block.mode === "reach") return { x: target.x + side * 1.15, yard: shiftDownfield(target.yard, 0.12) };
    if (block.mode === "climb") return { x: target.x + side * 0.9, yard: shiftDownfield(target.yard, 0.25) };
    return { x: target.x + side * 0.9, yard: shiftDownfield(target.yard, 0.35) };
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

const ZONE_JOBS = new Set(["deep", "drop", "flat", "curl", "hook", "robber", "contain", "spy", "shade"]);

/** Box starts tight, then opens a little. Deterministic from seconds since the snap. */
function boxBreath(age: number): number {
  if (age < 0.35) return 0.82;
  if (age < 1.2) return 0.82 + ((age - 0.35) / 0.85) * 0.33;
  return 1.15;
}

function aimFor(player: AssignedPlayer, players: readonly Player[], carrier: Player, los: number, age: number, style: "storm" | "base" | "standard") {
  const assignment = player.assignment;
  if (isBlock(assignment)) return blockAim(assignment, player, players, carrier, los);
  if (isDefense(assignment)) {
    const gap = Math.hypot(player.x - carrier.x, player.yard - carrier.yard);
    const pastAt = style === "storm" ? 1.4 : style === "base" ? 3.6 : 2.4;
    const past = downfieldDelta(carrier.yard, assignment.yard) > pastAt;
    const delay = style === "storm" ? assignment.blitzDelay * 0.45 : assignment.blitzDelay;
    if ((assignment.job === "blitz" || assignment.job === "man") && delay > 0 && age < delay && gap >= 3.2) {
      return {
        x: player.x + (assignment.x - player.x) * 0.08,
        yard: shiftDownfield(player.yard, 0.15),
      };
    }
    if (ZONE_JOBS.has(assignment.job) && gap >= 3.2 && !past) {
      let breath = boxBreath(age);
      if (style === "storm") breath = Math.max(breath, 1.12);
      if (style === "base") breath = Math.min(breath, 0.86);
      const span = style === "storm" ? 1.22 : style === "base" ? 0.78 : 1;
      const rx = Math.max(0.8, assignment.zoneRx * 1.2 * breath * span);
      const ry = Math.max(0.8, assignment.zoneRy * 1.15 * breath * span);
      return {
        x: clamp(carrier.x, assignment.x - rx, assignment.x + rx),
        yard: clamp(
          shiftDownfield(carrier.yard, 0.8),
          Math.min(shiftDownfield(assignment.yard, -ry), shiftDownfield(assignment.yard, 2.2)),
          Math.max(shiftDownfield(assignment.yard, -ry), shiftDownfield(assignment.yard, 2.2)),
        ),
      };
    }
    const reach = keyDistance(assignment) * (style === "storm" ? 1.45 : style === "base" ? 0.68 : 1);
    const keyed = gap < reach || past;
    if (keyed) {
      const shade = style === "storm" ? 0.05 : style === "base" ? 0.32 : 0.18;
      return { x: carrier.x + assignment.laneOffset * shade, yard: carrier.yard };
    }
    return { x: assignment.x, yard: assignment.yard };
  }
  if (assignment.kind === "pursue") return { x: carrier.x, yard: carrier.yard };
  return null;
}

function dist(a: Player, b: Player): number {
  return Math.hypot(a.x - b.x, a.yard - b.yard);
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
 * in the blocker's lane. A finished or shed block climbs to the second level.
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
    if (!isBlock(block) || block.targetId) continue;
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

function seek(player: Player, x: number, yard: number, dt: number, scale = 1) {
  const dx = x - player.x;
  const dy = yard - player.yard;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-4 || dt <= 0) return;
  const stepLen = Math.min(roleSpeed(player.role) * scale * dt, dist);
  if (stepLen <= 0) return;
  player.x = clamp(player.x + (dx / dist) * stepLen, PLAY_MIN_X, PLAY_MAX_X);
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

function pushReplayFrame(sim: Sim, assigned: AssignedPlay) {
  const tape = assigned.replay;
  if (!tape) return;
  tape.frames.push({
    age: assigned.age,
    pose: sim.pose,
    ballX: sim.ballX,
    ballYard: sim.ballYard,
    players: sim.players.map((player) => ({
      id: player.id,
      x: player.x,
      yard: player.yard,
      hop: player.hop,
      facingX: player.facingX,
      facingYard: player.facingYard,
    })),
  });
  const newest = tape.frames[tape.frames.length - 1];
  while (tape.frames.length > 2 && newest && tape.frames[0] && newest.age - tape.frames[0].age > REPLAY_HORIZON) {
    tape.frames.shift();
  }
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
      };
    }),
  };
}

/** Offense runs the called route, then north, when the user is on defense. */
function cpuCarry(assigned: AssignedPlay, aimed: Input): Input {
  const found = carrierRoute(assigned);
  if (found && found.route.index < found.route.steps.length) return { ...aimed, action: "carry", sprint: false };
  const carrier = found?.player ?? assigned.players.find((player) => player.controlled);
  if (!carrier) return { x: 0, yard: attackSign(), action: "carry", sprint: false };
  let x = 0.15;
  let yard = attackSign();
  let nearest = Infinity;
  let nearestX = carrier.x;
  for (const player of assigned.players) {
    if (player.team !== "def") continue;
    if (contactOf(player).pancake > 0) continue;
    const gap = dist(player, carrier);
    if (gap < nearest) {
      nearest = gap;
      nearestX = player.x;
    }
  }
  if (nearest < 4.4) {
    const away = Math.sign(carrier.x - nearestX) || 1;
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
    retargetBlockers(assigned.players, carrier, assigned.snapX, sim.los);
    const steeredLeft = !playingDef && input.steerLeft ? nearestTeammate(assigned.players, carrier, -1) : null;
    const steeredRight = !playingDef && input.steerRight ? nearestTeammate(assigned.players, carrier, 1) : null;
    const style = defenseStyle(assigned.scheme.id);
    for (const player of assigned.players) {
      if (player.controlled || player.id === userId) continue;
      const clock = contactOf(player);
      if (clock.pancake > 0) continue;
      if (player.team === "def" && clock.engage > 0) continue;
      let scale = clock.recover > 0 ? 0.35 : clock.slowed > 0 ? 0.55 : 1;
      if (player.team === "def" && style === "storm") scale *= 1.18;
      if (player.team === "def" && style === "base") scale *= 0.88;
      scale *= bodyTravelScale(player.team, playingDef, false);
      const steered = player === steeredLeft || player === steeredRight;
      const separateStick = input.steerMode === "independent" || input.steerMode === "classic";
      const stickX = separateStick ? (input.blockerX ?? 0) : input.x;
      const stickYard = separateStick ? (input.blockerYard ?? 0) : input.yard;
      const aim = steered
        ? steerPoint(player, stickX, stickYard)
        : aimFor(player, assigned.players, carrier, sim.los, assigned.age, style);
      if (aim) seek(player, aim.x, aim.yard, bounded, scale);
    }
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
      resolveBlockContact(player, target, block, carrier, bounded, !stiffArm);
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
