/**
 * Block overlap for the assignment layer.
 *
 * A blocker meeting his target becomes a held block, a pancake, or a shed.
 * The record is a `ContactResult`. Timed effects live on the player clock:
 * a hold slows the defender and keeps him from chasing, a pancake leaves him
 * down, and a shed lets him recover.
 *
 * This does not push for a stiff-arm. That shove stays inside `step`.
 */
import type { Player } from "../sim";
import type { BlockAssignment, ContactResult } from "./types";

/** Canvas default. Above 1 sheds more often. */
const BREAK_BLOCK = 0.75;
/** Canvas default. Above 1 means more yards after contact and fewer finished tackles. */
const BREAK_TACKLE = 1.5;

export type BodyContact = {
  /** Remaining seconds of a held block. */
  engage: number;
  /** Remaining seconds on the ground. */
  pancake: number;
  /** Remaining seconds after a shed or a get-up. */
  recover: number;
  /** Remaining slow after contact. */
  slowed: number;
  pushYards: number;
  pancaked: boolean;
  /** True after this approach has already been judged a tackle or a miss. */
  tackleArmed: boolean;
  /** Logged once while this defender is close but not yet in a real tackle. */
  nearLogged: boolean;
  /** How many tackle attempts this defender has made. Changes the next roll. */
  tackleTries: number;
  /** Latest result for this defender. Null before any overlap. */
  last: ContactResult | null;
};

const clocks = new WeakMap<Player, BodyContact>();

/** Runner yard when he first touches a defender on this snap. */
let firstContactYard: number | null = null;

export function noteFirstContact(yard: number) {
  if (firstContactYard == null && Number.isFinite(yard)) firstContactYard = yard;
}

/** Contact yard for yards-after-contact, then clear it. */
export function consumeFirstContact(): number | null {
  const yard = firstContactYard;
  firstContactYard = null;
  return yard;
}

export function resetFirstContact() {
  firstContactYard = null;
}

export function contactOf(player: Player): BodyContact {
  let clock = clocks.get(player);
  if (!clock) {
    clock = {
      engage: 0,
      pancake: 0,
      recover: 0,
      slowed: 0,
      pushYards: 0,
      pancaked: false,
      tackleArmed: false,
      nearLogged: false,
      tackleTries: 0,
      last: null,
    };
    clocks.set(player, clock);
  }
  return clock;
}

function radius(role: string): number {
  if (role === "OL" || role === "DT") return 0.95;
  if (role === "FB" || role === "TE") return 0.9;
  return 0.85;
}

function pairUnit(a: string, b: string): number {
  let hash = 2166136261 >>> 0;
  const text = `${a}|${b}`;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function result(
  outcome: ContactResult["outcome"],
  actorId: string,
  targetId: string,
  duration: number,
  pushYards: number,
): ContactResult {
  return { outcome, actorId, targetId, duration, pushYards };
}

/** Count down holds, pancakes, recoveries, and slows. */
export function tickContact(player: Player, dt: number) {
  if (dt <= 0) return;
  const clock = contactOf(player);
  if (clock.pancake > 0) {
    clock.pancake = Math.max(0, clock.pancake - dt);
    if (clock.pancake === 0) {
      clock.pancaked = false;
      clock.recover = Math.max(clock.recover, 0.4);
    }
    return;
  }
  if (clock.engage > 0) clock.engage = Math.max(0, clock.engage - dt);
  if (clock.recover > 0) clock.recover = Math.max(0, clock.recover - dt);
  if (clock.slowed > 0) clock.slowed = Math.max(0, clock.slowed - dt);
}

function shed(
  clock: BodyContact,
  blocker: Player,
  defender: Player,
  block: BlockAssignment,
  duration: number,
) {
  clock.engage = 0;
  clock.pancake = 0;
  clock.pancaked = false;
  clock.recover = duration;
  clock.last = result("broken", blocker.id, defender.id, duration, clock.pushYards);
  if (block.targetId === defender.id) block.targetId = null;
  block.secondLevel = true;
  block.mode = "climb";
  block.levelY = Math.max(block.levelY, 5.5);
}

/**
 * One blocker against his current target.
 * `allowPush` is false while a stiff-arm is the carrier action, so `step`
 * remains the only stiff-arm shove.
 */
export function resolveBlockContact(
  blocker: Player,
  defender: Player,
  block: BlockAssignment,
  carrier: Player,
  dt: number,
  allowPush: boolean,
): ContactResult | null {
  const clock = contactOf(defender);
  if (clock.pancake > 0 || clock.recover > 0) return null;
  const gap = radius(blocker.role) + radius(defender.role) + 0.12;
  const dist = Math.hypot(blocker.x - defender.x, blocker.yard - defender.yard);
  const toCarrier = Math.hypot(defender.x - carrier.x, defender.yard - carrier.yard);
  const blockerToCarrier = Math.hypot(blocker.x - carrier.x, blocker.yard - carrier.yard);
  const beaten = toCarrier + 0.25 < blockerToCarrier;
  const far = toCarrier > 9.2;
  if (beaten || far) {
    if (clock.engage > 0 || dist < gap + 0.08) {
      const duration = beaten ? 0.08 : 0.16;
      shed(clock, blocker, defender, block, duration);
      return clock.last;
    }
    return null;
  }
  if (dist >= gap + 0.08) return null;

  const olOnDt = defender.role === "DT" && (blocker.role === "OL" || blocker.role === "TE" || blocker.role === "FB");
  const shedAt = olOnDt ? 2.1 : 1.15;
  let started: ContactResult | null = null;
  if (clock.engage <= 0 && clock.pushYards > shedAt) {
    shed(clock, blocker, defender, block, olOnDt ? 0.28 : 0.16);
    return clock.last;
  }
  if (clock.engage <= 0) {
    const pancakeChance = defender.role === "DT" ? (blocker.role === "OL" ? 0.11 : 0.08) : blocker.role === "FB" ? 0.1 : 0.07;
    const level = blocker.yard <= defender.yard + 0.55;
    if (level && pairUnit(blocker.id, defender.id) < pancakeChance) {
      clock.pancake = 0.7;
      clock.pancaked = true;
      clock.engage = 0;
      clock.slowed = Math.max(clock.slowed, 0.7);
      const side = Math.sign(defender.x - blocker.x) || 1;
      if (allowPush) {
        defender.x += side * 0.35;
        defender.yard += 0.25;
      }
      clock.last = result("pancaked", blocker.id, defender.id, 0.7, clock.pushYards);
      return clock.last;
    }
    const hold = ((olOnDt || block.driveBlock ? 1.15 : 0.55) + (olOnDt || block.driveBlock ? 0.22 : 0.15))
      * (block.sturdyBlock ? 1.2 : 1)
      / Math.max(0.45, BREAK_BLOCK);
    clock.engage = hold;
    clock.slowed = Math.max(clock.slowed, defender.role === "DT" ? 0.62 : 0.42);
    clock.last = result("engaged", blocker.id, defender.id, hold, clock.pushYards);
    started = clock.last;
  }

  const overlap = Math.max(0.04, gap - dist + 0.1);
  clock.pushYards += overlap * (defender.role === "DT" ? 1.25 : 1) * dt * 60;
  clock.slowed = Math.max(clock.slowed, defender.role === "DT" ? 0.62 : 0.42);
  if (block.sturdyBlock && !block.backsideSeal) clock.slowed = Math.max(clock.slowed, 0.78);
  if (allowPush) {
    const frames = dt * 60;
    let push = Math.min(block.sturdyBlock ? 0.22 : 0.48, (0.09 + overlap * 0.55) * (defender.role === "DT" ? 1.65 : 1));
    if (block.driveBlock && !block.sturdyBlock) push *= 1.45;
    if (block.sturdyBlock && !block.backsideSeal) push *= 0.55;
    if (block.backsideSeal) push *= 1.55;
    const drive = Math.min(block.sturdyBlock ? 0.28 : 0.58, (0.12 + overlap * 0.7) * (defender.role === "DT" ? 1.65 : 1));
    defender.x += block.sealSide * push * frames;
    defender.yard += drive * frames;
  }
  return started;
}

function tackleChance(carrier: Player, defender: Player, sprinting: boolean): number {
  const fx = carrier.facingX;
  const fy = carrier.facingYard;
  const flen = Math.hypot(fx, fy) || 1;
  const dx = defender.x - carrier.x;
  const dy = defender.yard - carrier.yard;
  const dlen = Math.hypot(dx, dy) || 1;
  const dot = (fx / flen) * (dx / dlen) + (fy / flen) * (dy / dlen);
  let chance = dot > 0.35 ? 0.62 : dot < -0.15 ? 0.22 : 0.38;
  if (sprinting) chance *= 0.75;
  return Math.max(0.08, Math.min(0.85, chance / BREAK_TACKLE));
}

/**
 * Shoulder-width bodies meet at 0.72 yards (`separate` in sim.ts).
 * A tackle is judged only inside that contact, plus a short step so the
 * arriving frame counts. The old role-radius halo (~2 yards) ended the play
 * several frames before the meshes touched. A wider gap is a near miss.
 */
const TACKLE_REACH = 0.72 + 0.16;

function round3(value: number) {
  return Number(value.toFixed(3));
}

/**
 * Carrier against a free defender.
 * A squared-up angle finishes more often. `BREAK_TACKLE` (1.5) and a sprint
 * lower that. A miss delays the defender and does not end the play. A finish
 * is `tackled` and does not shove anyone; the stiff-arm shove stays in `step`.
 * Returns null on a near miss, an early overlap, a blocked defender, or an
 * approach that was already judged. `age` is seconds since the snap, for the
 * contact log.
 */
export function resolveTackle(
  carrier: Player,
  defender: Player,
  sprinting: boolean,
  stiffArm: boolean,
  age = 0,
  reachScale = 1,
): ContactResult | null {
  const clock = contactOf(defender);
  const dist = Math.hypot(carrier.x - defender.x, carrier.yard - defender.yard);
  const reach = TACKLE_REACH * (reachScale > 0 ? reachScale : 1);
  const frame = Math.round(age * 60);
  if (!Number.isFinite(dist)) {
    console.error("[contact] non-finite distance", { frame, carrier: carrier.id, defender: defender.id, dist });
    return null;
  }
  if (dist > reach + 0.8) {
    clock.tackleArmed = false;
    clock.nearLogged = false;
    return null;
  }
  if (dist > reach) {
    if (!clock.nearLogged) {
      clock.nearLogged = true;
      console.log("[contact] near miss", {
        frame,
        age: round3(age),
        carrier: carrier.id,
        defender: defender.id,
        dist: round3(dist),
        reach,
        playOver: false,
      });
    }
    return null;
  }
  noteFirstContact(carrier.yard);
  if (clock.tackleArmed || clock.engage > 0 || clock.pancake > 0 || clock.recover > 0) return null;
  clock.tackleArmed = true;
  clock.tackleTries += 1;
  const chance = tackleChance(carrier, defender, sprinting);
  const roll = pairUnit(`${carrier.id}:${clock.tackleTries}`, defender.id);
  const miss = stiffArm || roll >= chance;
  console.log("[contact] detect", {
    frame,
    age: round3(age),
    carrier: carrier.id,
    defender: defender.id,
    dist: round3(dist),
    reach,
    sprinting,
    stiffArm,
  });
  console.log("[contact] judge", {
    frame,
    age: round3(age),
    defender: defender.id,
    outcome: miss ? "whiff" : "tackled",
    reason: stiffArm ? "stiff-arm" : miss ? "roll" : "finish",
    chance: round3(chance),
    roll: round3(roll),
    endsPlay: !miss,
  });
  if (miss) {
    clock.recover = 0.4;
    clock.slowed = Math.max(clock.slowed, 0.45);
    clock.last = result("whiff", defender.id, carrier.id, 0.4, clock.pushYards);
    return clock.last;
  }
  clock.last = result("tackled", defender.id, carrier.id, 0, clock.pushYards);
  return clock.last;
}
