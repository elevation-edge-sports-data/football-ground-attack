/**
 * User defender for Game and Practice. One body, huddle and live controls.
 * The ball carrier stays the controlled halfback. Other defenders stay on AI.
 * The saved key is whoever was selected at the snap. A live switch does not change it.
 * Huddle: A or Enter snaps. Y changes player. X and B do not. A stick, d-pad, or WASD
 * at the Y press points; a plain Y takes the next defender. Live Y does the same
 * while this defender is free. A Y press on a blocked defender still sheds.
 */
import { FIELD, clamp } from "../../field/spec";
import type { Player } from "../sim";
import { contactOf } from "./contact";
import { bodyTravelScale, readPlaySpeed } from "./tuning";
import { attackSign, shiftDownfield } from "./attack";
import { flushStanceReleases, releaseStance } from "./stance";
import type { BlockAssignment, PlayAssignment } from "./types";

const SPRINT_MULT = 1.38;
const ROLE_SPEED: Record<string, number> = { DT: 7.7, LB: 8.55, DB: 9.15 };
/** Same pools SimView uses for dt-*, lb-*, and db-* jerseys. */
const JERSEY: Record<string, number[]> = {
  DT: [90, 92, 95, 97, 98],
  LB: [54, 55, 56, 58],
  DB: [20, 21, 24, 26, 31, 32],
};

export type DefenseBody = Player & { assignment: PlayAssignment };

/** Field axes. +x is the right sideline. +yard is north. The view converts the camera. */
export type DefenseStick = {
  x: number;
  yard: number;
  sprint: boolean;
  /** Y. Point with the stick, or take the next defender. */
  changeOn: boolean;
  dive: boolean;
  shed: boolean;
  wrap: boolean;
  punch: boolean;
  strafe: boolean;
  hitX: number;
  hitY: number;
  dpadX: number;
  dpadY: number;
  cyclePrev: boolean;
  cycleNext: boolean;
  snapEnter: boolean;
  /** Gamepad A. Snaps in the huddle. */
  padA: boolean;
  /** Ignore A and Enter for this frame. The button edge still updates. */
  blockSnap: boolean;
  aimCarrier: boolean;
};

export type DefenseLive = {
  /** Multiply the offense carrier's stick. Wrap drags it down. */
  carrierScale: number;
  endPlay: boolean;
  fumble: boolean;
};

type DefKey = {
  role: string;
  dbRole: string | null;
  number: number;
  xRank: number;
  x: number;
};

let key: DefKey | null = null;
let currentId: string | null = null;
let pose: string | null = null;
let suppressA = false;
let aDown = true;
let changeDown = true;
let cycleEdge = true;
let enterEdge = true;
let shedEdge = false;
let wrapEdge = false;
let punchEdge = false;
let diveEdge = false;
let hitLatch = false;
let hitCool = 0;
let wrapPhase: "none" | "wrapped" = "none";
let wrapT = 0;
let wrapFrom: "lt" | "rt" | null = null;
let wrapDrag = 1;
let attack: "dive" | "hit" | null = null;
let atkT = 0;
let atkX = 0;
let atkY = 0;
let hitAim = 0;
let strafeNow = false;
let whiffLeft = 0;
let finished = false;
let finishKind: "fumble" | null = null;

function bodyCap() {
  return FIELD.length + FIELD.endZone - 1.5;
}

export function defenderNumber(player: { id: string; role: string }) {
  const pool = JERSEY[player.role];
  if (!pool) return 0;
  const index = Number(player.id.split("-")[1] ?? 0);
  return pool[index % pool.length] ?? pool[0] ?? 0;
}

export function defenderSpeed(role: string, sprint: boolean, strafe: boolean, engaged: boolean) {
  let speed = ROLE_SPEED[role] ?? 8.6;
  if (sprint) speed *= SPRINT_MULT;
  if (strafe) speed *= 0.64;
  if (engaged) speed *= 0.34;
  return speed;
}

export function shadeSpeed(role: string) {
  return (ROLE_SPEED[role] ?? 8.6) * 0.7;
}

/** Connect window. Strafe accepts a wider aim and a longer reach. */
export function hitDecision(aim: number, dist: number, strafe: boolean): "whiff" | "connect" | "lunge" {
  if (aim < (strafe ? -0.72 : -0.55)) return "whiff";
  if (dist <= (strafe ? 8.2 : 6.4) && aim >= (strafe ? -0.32 : -0.12)) return "connect";
  return "lunge";
}

function dbRoleOf(player: DefenseBody): string | null {
  return player.assignment.kind === "defense" ? player.assignment.dbRole : null;
}

function isSafety(player: DefenseBody) {
  const role = dbRoleOf(player);
  return role === "FS" || role === "SS" || role === "DIME";
}

function defenders(players: readonly DefenseBody[]) {
  return players.filter((player) => player.team === "def");
}

function sequence(players: readonly DefenseBody[]) {
  const byX = (role: string) => defenders(players).filter((player) => player.role === role).sort((a, b) => a.x - b.x);
  return [...byX("DT"), ...byX("LB"), ...byX("DB")];
}

function current(players: readonly DefenseBody[]) {
  return players.find((player) => player.id === currentId) ?? null;
}

export function readUserDefenderId() {
  return currentId;
}

export function readUserDefPose() {
  return pose;
}

/** 0 skips the normal tackle. Strafe widens it. Dive, hit, and wrap use the body reach. */
export function userTackleScale() {
  if (!currentId || finished) return 0;
  if (wrapPhase === "wrapped" || attack === "dive" || attack === "hit") return 1;
  if (strafeNow) return 1.48;
  return 0;
}

export function consumeDefenseFinish(): "fumble" | null {
  const kind = finishKind;
  finishKind = null;
  return kind;
}

export function resetDefense() {
  key = null;
  currentId = null;
  pose = null;
  clearAttack();
  suppressA = false;
  aDown = true;
  changeDown = true;
  cycleEdge = true;
  enterEdge = true;
  shedEdge = false;
  wrapEdge = false;
  punchEdge = false;
  diveEdge = false;
  hitLatch = false;
  hitCool = 0;
  whiffLeft = 0;
  finished = false;
  finishKind = null;
}

function clearAttack() {
  attack = null;
  atkT = 0;
  atkX = 0;
  atkY = 0;
  wrapPhase = "none";
  wrapT = 0;
  wrapFrom = null;
  wrapDrag = 1;
  strafeNow = false;
  if (pose === "dive A" || pose === "tackle 1" || pose === "tackle 2") pose = null;
}

function remember(players: readonly DefenseBody[], player: DefenseBody) {
  const mates = defenders(players).filter((body) => body.role === player.role).sort((a, b) => a.x - b.x);
  key = {
    role: player.role,
    dbRole: dbRoleOf(player),
    number: defenderNumber(player),
    xRank: Math.max(0, mates.indexOf(player)),
    x: player.x,
  };
}

function findByKey(players: readonly DefenseBody[], saved: DefKey): DefenseBody | null {
  const pool = defenders(players).filter((player) => player.role === saved.role);
  if (!pool.length) return sequence(players)[0] ?? null;
  const unique = saved.dbRole != null && saved.dbRole !== "CB" && saved.dbRole !== "DB";
  if (unique) {
    const byRole = pool.find((player) => dbRoleOf(player) === saved.dbRole);
    if (byRole) return byRole;
  }
  const rolePool = saved.dbRole ? pool.filter((player) => dbRoleOf(player) === saved.dbRole) : [];
  const cand = (rolePool.length ? rolePool : pool).slice().sort((a, b) => {
    const dx = Math.abs(a.x - saved.x) - Math.abs(b.x - saved.x);
    if (Math.abs(dx) > 0.35) return dx;
    return Math.abs(defenderNumber(a) - saved.number) - Math.abs(defenderNumber(b) - saved.number);
  });
  if (cand[0]) return cand[0];
  const byNum = pool.find((player) => defenderNumber(player) === saved.number);
  if (byNum) return byNum;
  const sorted = pool.slice().sort((a, b) => a.x - b.x);
  return sorted[clamp(saved.xRank, 0, sorted.length - 1)] ?? sorted[0] ?? null;
}

/** Deepest middle DB, else deepest middle LB, else the DT nearest the middle. */
export function pickDefaultDefender(players: readonly DefenseBody[]): DefenseBody | null {
  const mid = FIELD.width * 0.5;
  const dbs = defenders(players).filter((player) => player.role === "DB");
  if (dbs.length) {
    const fs = dbs.find((player) => dbRoleOf(player) === "FS")
      ?? dbs.find((player) => isSafety(player) && dbRoleOf(player) !== "SS" && dbRoleOf(player) !== "CB" && dbRoleOf(player) !== "NCB");
    if (fs) return fs;
    return dbs.slice().sort((a, b) => {
      if (Math.abs(b.yard - a.yard) > 0.8) return b.yard - a.yard;
      return Math.abs(a.x - mid) - Math.abs(b.x - mid);
    })[0] ?? null;
  }
  const lbs = defenders(players).filter((player) => player.role === "LB");
  if (lbs.length) {
    return lbs.slice().sort((a, b) => {
      if (Math.abs(b.yard - a.yard) > 0.6) return b.yard - a.yard;
      return Math.abs(a.x - mid) - Math.abs(b.x - mid);
    })[0] ?? null;
  }
  const dts = defenders(players).filter((player) => player.role === "DT");
  if (dts.length) return dts.slice().sort((a, b) => Math.abs(a.x - mid) - Math.abs(b.x - mid))[0] ?? null;
  return defenders(players)[0] ?? null;
}

function select(players: readonly DefenseBody[], next: DefenseBody | null, save: boolean) {
  if (!next) return;
  if (next.id !== currentId) {
    clearAttack();
    whiffLeft = 0;
    pose = null;
    const prev = current(players);
    if (prev) prev.hop = 0;
  }
  currentId = next.id;
  if (save) remember(players, next);
}

function ensure(players: readonly DefenseBody[]) {
  if (current(players)) return;
  const found = key ? findByKey(players, key) : null;
  select(players, found ?? pickDefaultDefender(players), false);
}

/** Call when a new roster is on the field. Restores the last snap, or the free safety. */
export function seatDefender(players: readonly DefenseBody[]) {
  clearAttack();
  whiffLeft = 0;
  finished = false;
  pose = null;
  shedEdge = false;
  wrapEdge = false;
  punchEdge = false;
  diveEdge = false;
  hitLatch = false;
  hitCool = 0;
  const found = key ? findByKey(players, key) : null;
  const pick = found ?? pickDefaultDefender(players);
  currentId = pick?.id ?? null;
}

/** The arming press is still down. Ignore it until it lifts. */
export function beginDefenseHuddle(padAHeld: boolean) {
  suppressA = padAHeld;
  aDown = true;
  changeDown = true;
  cycleEdge = true;
  enterEdge = true;
}

function cycle(players: readonly DefenseBody[], dir: number, save: boolean) {
  const seq = sequence(players);
  if (!seq.length) return;
  ensure(players);
  let index = seq.findIndex((player) => player.id === currentId);
  if (index < 0) index = 0;
  select(players, seq[(index + dir + seq.length) % seq.length] ?? null, save);
}

/**
 * Stick, d-pad, or WASD at the press. A unit vector in field axes, or null.
 * The stick is already past the radial deadzone, so any leftover deflection counts.
 */
function aimVector(hold: DefenseStick): { x: number; y: number } | null {
  const stick = Math.hypot(hold.x, hold.yard);
  if (stick > 1e-4) return { x: hold.x / stick, y: hold.yard / stick };
  const pad = Math.hypot(hold.dpadX, hold.dpadY);
  if (pad > 1e-4) return { x: hold.dpadX / pad, y: hold.dpadY / pad };
  return null;
}

/** Point along the stick, or take the next defender when nothing is aimed. */
function chooseDefender(players: readonly DefenseBody[], hold: DefenseStick, me: DefenseBody | null, save: boolean) {
  const aim = aimVector(hold);
  if (aim) {
    select(players, pointSelect(players, aim.x, aim.y, me), save);
    return;
  }
  cycle(players, 1, save);
}

function pointSelect(players: readonly DefenseBody[], dx: number, dy: number, from: DefenseBody | null) {
  const mag = Math.hypot(dx, dy);
  if (mag < 0.28) return null;
  const ux = dx / mag;
  const uy = dy / mag;
  const origin = from ?? { x: FIELD.width * 0.5, yard: 0 };
  let best: DefenseBody | null = null;
  let score = 0.16;
  for (const player of defenders(players)) {
    if (player === from) continue;
    const clock = contactOf(player);
    if (clock.pancake > 0 || clock.recover > 0) continue;
    const vx = player.x - origin.x;
    const vy = player.yard - origin.yard;
    const dist = Math.hypot(vx, vy);
    if (dist < 0.35 || dist > 30) continue;
    const dot = (vx * ux + vy * uy) / dist;
    if (dot < 0.18) continue;
    const next = dot * 1.4 - dist * 0.02;
    if (next > score) {
      score = next;
      best = player;
    }
  }
  return best;
}

function face(player: Player, x: number, yard: number) {
  const mag = Math.hypot(x, yard);
  if (mag < 1e-4) return;
  player.facingX = x / mag;
  player.facingYard = yard / mag;
}

function slide(player: Player, vx: number, vy: number, dt: number, los: number, presnap: boolean) {
  player.x += vx * dt;
  player.yard += vy * dt;
  const cap = bodyCap();
  if (presnap) {
    player.x = clamp(player.x, 2.2, FIELD.width - 2.2);
    const near = shiftDownfield(los, 1.15);
    const far = shiftDownfield(los, 18);
    player.yard = clamp(player.yard, Math.max(0.5, Math.min(near, far)), Math.min(cap, Math.max(near, far)));
  } else {
    player.x = clamp(player.x, 0.8, FIELD.width - 0.8);
    const back = shiftDownfield(los, -12);
    const front = attackSign() > 0 ? cap : 0;
    player.yard = clamp(player.yard, Math.min(back, front), Math.max(back, front));
  }
}

function shade(player: DefenseBody | null, hold: DefenseStick, dt: number, los: number) {
  if (!player || dt <= 0) return;
  const mag = Math.hypot(hold.x, hold.yard);
  if (mag < 0.16) return;
  const speed = shadeSpeed(player.role) * readPlaySpeed();
  const vx = (hold.x / mag) * speed;
  const vy = (hold.yard / mag) * speed;
  slide(player, vx, vy, dt, los, true);
  face(player, hold.x, hold.yard);
}

/** Huddle. Y changes player. A or Enter snaps. The stick shades. */
export function tickDefenseHuddle(players: readonly DefenseBody[], hold: DefenseStick, dt: number, los: number): "hold" | "snap" {
  ensure(players);
  const me = current(players);
  const changeEdge = hold.changeOn && !changeDown;
  if (changeEdge) chooseDefender(players, hold, me, true);
  changeDown = hold.changeOn;
  if (hold.cyclePrev && !cycleEdge) cycle(players, -1, true);
  if (hold.cycleNext && !cycleEdge) cycle(players, 1, true);
  cycleEdge = hold.cyclePrev || hold.cycleNext;

  let snapped = false;
  if (hold.snapEnter && !enterEdge && !hold.blockSnap) snapped = true;
  enterEdge = hold.snapEnter;
  if (suppressA) {
    if (!hold.padA) suppressA = false;
  } else if (hold.padA && !aDown && !hold.blockSnap) {
    snapped = true;
  }
  aDown = hold.padA;
  if (!changeEdge) shade(current(players), hold, dt, los);
  if (snapped) {
    const chosen = current(players);
    if (chosen) remember(players, chosen);
    return "snap";
  }
  return "hold";
}

export function beginDefenseLive(players: readonly DefenseBody[]) {
  clearAttack();
  whiffLeft = 0;
  finished = false;
  hitLatch = false;
  hitCool = 0;
  diveEdge = false;
  shedEdge = false;
  wrapEdge = false;
  punchEdge = false;
  changeDown = true;
  const me = current(players);
  if (me) releaseStance(me);
  flushStanceReleases();
}

function finishPlay(fumble: boolean) {
  finished = true;
  if (fumble) finishKind = "fumble";
  attack = null;
  atkT = 0;
  wrapPhase = "none";
  pose = fumble ? "tackle 1" : pose;
}

function resolveHit(dist: number, aim: number, strafe: boolean) {
  const punch = 0.28 + Math.max(aim, 0) * 0.16 + clamp(aim, 0, 1) * 0.22 + (dist < 2.4 ? 0.12 : 0) + (strafe ? 0.22 : 0);
  const fumble = Math.random() < punch;
  finishPlay(fumble);
  pose = "tackle 1";
}

function fireHit(me: DefenseBody, carrier: Player, hx: number, hy: number) {
  const mag = Math.hypot(hx, hy);
  if (mag < 0.22 || hitCool > 0) return;
  let ux = hx / mag;
  let uy = hy / mag;
  hitLatch = true;
  hitCool = 0.28;
  const toX = carrier.x - me.x;
  const toY = carrier.yard - me.yard;
  const dist = Math.hypot(toX, toY) || 1;
  const tx = toX / dist;
  const ty = toY / dist;
  const aim = ux * tx + uy * ty;
  if (aim > -0.42) {
    const blend = aim < 0.15 ? 0.72 : 0.48;
    let mx = ux * (1 - blend) + tx * blend;
    let my = uy * (1 - blend) + ty * blend;
    const blended = Math.hypot(mx, my) || 1;
    ux = mx / blended;
    uy = my / blended;
  }
  const decision = hitDecision(aim, dist, strafeNow);
  me.facingX = ux;
  me.facingYard = uy;
  if (decision === "whiff") {
    whiffLeft = 0.45;
    pose = "whiff";
    me.hop = 0.2;
    contactOf(me).recover = Math.max(contactOf(me).recover, 0.45);
    return;
  }
  if (decision === "connect") {
    resolveHit(dist, Math.max(aim, strafeNow ? 0.62 : 0.45), strafeNow);
    return;
  }
  attack = "hit";
  atkT = strafeNow ? 0.66 : 0.58;
  atkX = ux;
  atkY = uy;
  hitAim = Math.max(aim, strafeNow ? 0.5 : 0.35);
  pose = "tackle 1";
}

function tryWrap(me: DefenseBody, carrier: Player, which: "lt" | "rt") {
  const dist = Math.hypot(me.x - carrier.x, me.yard - carrier.yard);
  const maxR = strafeNow ? 3.95 : 2.65;
  if (dist > maxR) return;
  if (wrapPhase !== "wrapped") {
    wrapPhase = "wrapped";
    wrapT = 0.9;
    wrapFrom = which;
    wrapDrag = 0.38;
    attack = null;
    pose = "tackle 2";
    me.hop = 0.05;
    return;
  }
  if (wrapFrom && wrapFrom !== which) {
    const cdX = carrier.facingX;
    const cdY = carrier.facingYard;
    const toX = me.x - carrier.x;
    const toY = me.yard - carrier.yard;
    const len = Math.hypot(toX, toY) || 1;
    const side = Math.abs(cdX * (toY / len) - cdY * (toX / len));
    let chance = 0.16 + side * 0.58;
    if (dist < 1.4) chance += 0.08;
    finishPlay(Math.random() < chance);
    pose = "tackle 1";
  }
}

function defenderEngaged(players: readonly DefenseBody[], me: DefenseBody) {
  if (contactOf(me).engage > 0) return true;
  return players.some((player) => {
    if (player.assignment.kind !== "block") return false;
    return player.assignment.targetId === me.id || Math.hypot(player.x - me.x, player.yard - me.yard) < 2.4;
  });
}

function shed(players: readonly DefenseBody[], me: DefenseBody) {
  const clock = contactOf(me);
  let blocker: DefenseBody | null = null;
  for (const player of players) {
    if (player.assignment.kind !== "block") continue;
    if (player.assignment.targetId === me.id) {
      blocker = player;
      break;
    }
  }
  if (!blocker) {
    let best = 2.7;
    for (const player of players) {
      if (player.assignment.kind !== "block") continue;
      const dist = Math.hypot(player.x - me.x, player.yard - me.yard);
      if (dist < best) {
        best = dist;
        blocker = player;
      }
    }
  }
  if (!defenderEngaged(players, me)) return;
  clock.engage = 0;
  clock.slowed = 0;
  if (blocker && blocker.assignment.kind === "block") {
    const block: BlockAssignment = blocker.assignment;
    const away = Math.sign(blocker.x - me.x) || 1;
    blocker.x += away * 0.42;
    blocker.yard -= 0.95;
    block.targetId = null;
  }
}

function startDive(me: DefenseBody, carrier: Player, hold: DefenseStick) {
  if (attack === "dive" && atkT > 0) return;
  let dx = hold.x;
  let dy = hold.yard;
  if (Math.hypot(dx, dy) < 0.18) {
    dx = carrier.x - me.x;
    dy = carrier.yard - me.yard;
  }
  const mag = Math.hypot(dx, dy) || 1;
  attack = "dive";
  atkX = dx / mag;
  atkY = dy / mag;
  atkT = 0.5;
  pose = "dive A";
  me.hop = 0.3;
}

/**
 * Live defense. Moves only the user defender.
 * The caller skips that body in the AI seek and applies `carrierScale` to the runner.
 */
export function tickDefenseLive(
  players: readonly DefenseBody[],
  carrier: Player,
  hold: DefenseStick,
  dt: number,
  los: number,
): DefenseLive {
  ensure(players);
  finished = false;
  strafeNow = false;
  if (hitCool > 0) hitCool = Math.max(0, hitCool - dt);
  if (whiffLeft > 0) whiffLeft = Math.max(0, whiffLeft - dt);
  const result = (): DefenseLive => ({
    carrierScale: wrapPhase === "wrapped" ? wrapDrag : 1,
    endPlay: finished,
    fumble: finishKind === "fumble",
  });
  if (wrapPhase === "wrapped") {
    wrapT -= dt;
    wrapDrag = Math.max(0.12, wrapDrag * Math.max(0, 1 - 1.6 * dt));
    if (wrapT <= 0) finishPlay(false);
  }
  const meBefore = current(players);
  const stickMag = Math.hypot(hold.x, hold.yard);
  const changeEdge = hold.changeOn && !changeDown;
  // Shed stays on Y while a block is on, even if the stick is pushing. A free defender
  // uses that same press to point or take the next teammate.
  const shedPlain = changeEdge && !!meBefore && defenderEngaged(players, meBefore);
  if (changeEdge && !shedPlain) chooseDefender(players, hold, meBefore, false);
  changeDown = hold.changeOn;
  const me = current(players);
  if (!me || finished) {
    pose = finished ? pose : null;
    return result();
  }
  if (whiffLeft > 0) {
    pose = "whiff";
    me.hop = 0.12;
    return result();
  }
  strafeNow = hold.strafe;
  if (hold.shed && !shedEdge && !(changeEdge && !shedPlain)) shed(players, me);
  shedEdge = hold.shed;
  if (hold.wrap && !wrapEdge) tryWrap(me, carrier, "lt");
  if (hold.punch && !punchEdge) tryWrap(me, carrier, "rt");
  wrapEdge = hold.wrap;
  punchEdge = hold.punch;
  if (hold.aimCarrier) {
    const ax = carrier.x - me.x;
    const ay = carrier.yard - me.yard;
    if (Math.hypot(ax, ay) > 0.35 && !hitLatch) fireHit(me, carrier, ax, ay);
  } else {
    const hitMag = Math.hypot(hold.hitX, hold.hitY);
    if (hitMag > 0.26 && !hitLatch) fireHit(me, carrier, hold.hitX, hold.hitY);
    if (hitMag < 0.16) hitLatch = false;
  }
  if (hold.dive && !diveEdge) startDive(me, carrier, hold);
  diveEdge = hold.dive;
  if (finished) return result();

  const clock = contactOf(me);
  let speed = defenderSpeed(me.role, hold.sprint, strafeNow, clock.engage > 0) * bodyTravelScale("def", true, true);
  if (strafeNow && Math.hypot(carrier.x - me.x, carrier.yard - me.yard) > 0.35) {
    face(me, carrier.x - me.x, carrier.yard - me.yard);
  }
  if (attack === "dive" && atkT > 0) {
    slide(me, atkX * speed * 1.4, atkY * speed * 1.4, dt, los, false);
    face(me, atkX, atkY);
    me.hop = 0.3 * Math.max(0, atkT / 0.5);
    pose = "dive A";
    atkT -= dt;
    if (atkT <= 0) {
      attack = null;
      whiffLeft = 0.45;
      pose = "whiff";
      me.hop = 0.16;
      clock.recover = Math.max(clock.recover, 0.45);
    }
  } else if (attack === "hit" && atkT > 0) {
    let hx = atkX;
    let hy = atkY;
    const tx = carrier.x - me.x;
    const ty = carrier.yard - me.yard;
    const tl = Math.hypot(tx, ty) || 1;
    hx = hx * 0.42 + (tx / tl) * 0.58;
    hy = hy * 0.42 + (ty / tl) * 0.58;
    const hm = Math.hypot(hx, hy) || 1;
    hx /= hm;
    hy /= hm;
    slide(me, hx * speed * 1.95, hy * speed * 1.95, dt, los, false);
    face(me, hx, hy);
    pose = "tackle 1";
    atkT -= dt;
    const dist = Math.hypot(me.x - carrier.x, me.yard - carrier.yard);
    if (dist < 2.85) resolveHit(dist, Math.max(hitAim, 0.55), strafeNow);
    else if (atkT <= 0) {
      if (dist < 5.4) resolveHit(dist, Math.max(hitAim, 0.4), strafeNow);
      else {
        attack = null;
        whiffLeft = 0.45;
        pose = "whiff";
        me.hop = 0.16;
        clock.recover = Math.max(clock.recover, 0.45);
      }
    }
  } else if (wrapPhase === "wrapped") {
    pose = "tackle 2";
    me.hop = 0.05;
    if (stickMag > 0.16) {
      slide(me, (hold.x / stickMag) * speed * 0.45, (hold.yard / stickMag) * speed * 0.45, dt, los, false);
    }
  } else {
    if (pose === "whiff" || pose === "dive A" || pose === "tackle 1" || pose === "tackle 2") pose = null;
    me.hop = 0;
    if (stickMag > 1e-4) {
      const ux = hold.x / Math.max(1, stickMag);
      const uy = hold.yard / Math.max(1, stickMag);
      slide(me, ux * speed, uy * speed, dt, los, false);
      if (!strafeNow && speed > 0.45) face(me, ux, uy);
      releaseStance(me);
    }
  }
  return result();
}

function body(id: string, role: string, x: number, yard: number, dbRole: "FS" | "SS" | "CB" | "NCB" | "DIME" | "DB" | null): DefenseBody {
  const assignment: PlayAssignment = role === "DB" || role === "LB" || role === "DT"
    ? {
        kind: "defense",
        job: "deep",
        x,
        yard,
        zoneRx: 3,
        zoneRy: 2,
        zoneFollow: false,
        station: "alley",
        stationX: x,
        stationYard: yard,
        manTargetId: null,
        readTime: 0,
        blitzDelay: 0,
        stutter: false,
        stutterX: x,
        stutterYard: yard,
        artCurve: false,
        fakeBlitz: false,
        reactTime: 0,
        dbRole: role === "DB" ? dbRole : null,
        isCorner: dbRole === "CB" || dbRole === "NCB",
        isSafety: dbRole === "FS" || dbRole === "SS" || dbRole === "DIME",
        aggressor: false,
        misfireTime: 0,
        misfireTargetId: null,
        laneOffset: 0,
        dtPenetrate: false,
      }
    : { kind: "pursue" };
  return {
    id,
    team: "def",
    role,
    x,
    yard,
    facingX: 0,
    facingYard: -1,
    controlled: false,
    hop: 0,
    assignment,
  };
}

const idleStick: DefenseStick = {
  x: 0,
  yard: 0,
  sprint: false,
  changeOn: false,
  dive: false,
  shed: false,
  wrap: false,
  punch: false,
  strafe: false,
  hitX: 0,
  hitY: 0,
  dpadX: 0,
  dpadY: 0,
  cyclePrev: false,
  cycleNext: false,
  snapEnter: false,
  padA: false,
  blockSnap: false,
  aimCarrier: false,
};

/** Selection, shade direction, snap memory, and the strafe window. */
export function defenseSelfCheck() {
  resetDefense();
  const roster = [
    body("dt-0", "DT", 30, 51, null),
    body("dt-1", "DT", 45, 51, null),
    body("lb-0", "LB", 37, 55, null),
    body("db-0", "DB", 12, 53, "CB"),
    body("db-5", "DB", 37.5, 63, "FS"),
  ];
  seatDefender(roster);
  if (readUserDefenderId() !== "db-5") throw new Error("default defender is the free safety");
  beginDefenseHuddle(false);
  const north = { ...idleStick, yard: 1 };
  const before = roster[4]!.yard;
  if (tickDefenseHuddle(roster, north, 0.1, 50) !== "hold") throw new Error("shade does not snap");
  if (!(roster[4]!.yard > before + 0.5)) throw new Error("shade moves north");
  if (roster[4]!.facingYard < 0.9 || Math.abs(roster[4]!.facingX) > 0.1) throw new Error("shade faces the stick");
  tickDefenseHuddle(roster, { ...idleStick, snapEnter: true }, 0.016, 50);
  const saved = readUserDefenderId();
  const carrier: Player = {
    id: "hb-0",
    team: "off",
    role: "HB",
    x: 37,
    yard: 48,
    facingX: 0,
    facingYard: 1,
    controlled: true,
    hop: 0,
  };
  beginDefenseLive(roster);
  tickDefenseLive(roster, carrier, idleStick, 0.016, 50);
  tickDefenseLive(roster, carrier, { ...idleStick, changeOn: true }, 0.016, 50);
  if (readUserDefenderId() === saved) throw new Error("live switch leaves the snap defender");
  tickDefenseLive(roster, carrier, idleStick, 0.016, 50);
  const xHeld = readUserDefenderId();
  tickDefenseLive(roster, carrier, { ...idleStick, dive: true }, 0.016, 50);
  if (readUserDefenderId() !== xHeld) throw new Error("X does not change player");
  const blocked = roster.find((player) => player.id === xHeld);
  if (!blocked) throw new Error("live defender missing");
  contactOf(blocked).engage = 0.4;
  tickDefenseLive(roster, carrier, { ...idleStick, changeOn: true, shed: true, yard: 1 }, 0.016, 50);
  if (readUserDefenderId() !== xHeld) throw new Error("Y on a block sheds instead of switching");
  if (contactOf(blocked).engage !== 0) throw new Error("Y sheds the block");
  seatDefender(roster);
  if (readUserDefenderId() !== saved) throw new Error("next huddle restores the snap defender");
  resetDefense();
  seatDefender(roster);
  beginDefenseHuddle(false);
  tickDefenseHuddle(roster, idleStick, 0.016, 50);
  if (tickDefenseHuddle(roster, { ...idleStick, changeOn: true, yard: -1 }, 0.016, 50) !== "hold") throw new Error("Y does not snap");
  if (readUserDefenderId() !== "lb-0") throw new Error("Y plus stick points south at the linebacker");
  tickDefenseHuddle(roster, idleStick, 0.016, 50);
  if (tickDefenseHuddle(roster, { ...idleStick, changeOn: true }, 0.016, 50) !== "hold") throw new Error("plain Y does not snap");
  if (readUserDefenderId() !== "db-0") throw new Error("plain Y takes the next defender");
  tickDefenseHuddle(roster, idleStick, 0.016, 50);
  const stayed = readUserDefenderId();
  tickDefenseHuddle(roster, { ...idleStick, dive: true, x: 1 }, 0.016, 50);
  if (readUserDefenderId() !== stayed) throw new Error("X does not change player in the huddle");
  beginDefenseHuddle(true);
  if (tickDefenseHuddle(roster, { ...idleStick, padA: true }, 0.016, 50) !== "hold") throw new Error("A held from the lineup does not snap");
  tickDefenseHuddle(roster, idleStick, 0.016, 50);
  if (tickDefenseHuddle(roster, { ...idleStick, padA: true, blockSnap: true }, 0.016, 50) !== "hold") throw new Error("a blocked A does not snap");
  if (tickDefenseHuddle(roster, { ...idleStick, padA: true }, 0.016, 50) !== "hold") throw new Error("A held through a block is not a new press");
  tickDefenseHuddle(roster, idleStick, 0.016, 50);
  if (tickDefenseHuddle(roster, { ...idleStick, padA: true }, 0.016, 50) !== "snap") throw new Error("A snaps");
  if (hitDecision(-0.2, 4, false) === "connect") throw new Error("narrow hit window");
  if (hitDecision(-0.2, 4, true) !== "connect") throw new Error("strafe widens the hit window");
  if (hitDecision(-0.8, 2, true) !== "whiff") throw new Error("a backward flick whiffs");
  const sprint = defenderSpeed("DB", true, false, false);
  const strafe = defenderSpeed("DB", true, true, false);
  if (!(strafe < sprint * 0.7)) throw new Error("strafe reduces speed");
  if (Math.abs(shadeSpeed("DB") - 9.15 * 0.7) > 1e-6) throw new Error("shade speed");
  resetDefense();
}
