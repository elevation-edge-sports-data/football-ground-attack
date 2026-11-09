/**
 * Personnel alignment and the line of scrimmage.
 *
 * This is the canvas `placeEntitiesForNewPlay` spacing: hash-clamped snap,
 * offense south of the LOS, defense from the scheme cluster and depths.
 * It does not assign blocks, routes, or defensive jobs. Call
 * `attachAssignments` for the snap jobs. `applyPresnapLook` and
 * `spreadInteriorDefense` still are not applied here.
 *
 * `createSim` in `sim.ts` is still the six-player preview at the 25.
 * `createPlaySim` is the companion that builds a full roster when a caller
 * asks for one. The carrier specials and pose sync are not involved.
 */
import { FIELD, PLAY_MARGIN, SPOT_YARD_MAX, SPOT_YARD_MIN, clamp } from "../../field/spec";
import { createSim, type Player, type Sim } from "../sim";
import { playSideSign } from "./plays";
import {
  DEFAULT_PERSONNEL,
  type BlockStyle,
  type ClusterMode,
  type DbAlignRole,
  type DefenseScheme,
  type PersonnelCounts,
  type YardCall,
  type YardSide,
} from "./types";

export { DEF_SCHEMES } from "./plays";

/** Same right-hand offset as `placeBall` in sim.ts. Kept here so that file stays unchanged. */
const BALL_AHEAD = 0.22;
const BALL_RIGHT = 0.4;

/** field.js `spec.bodyInset`. Bodies stay this far inside the north back line. */
const BODY_INSET = 1.5;
/** field.js `spec.wideRef`. Width 50 is the narrow end of `fieldWideT`. */
const WIDE_REF = 50;

/** Enough of an offense play to pick the play side. Steps are not used here. */
export type PlacementPlay = {
  id: string;
  blockStyle: BlockStyle;
};

export type PlacementCall = {
  /** Missing groups use `DEFAULT_PERSONNEL`. */
  personnel?: Partial<PersonnelCounts>;
  /** Absolute yard line, or an own/opp call such as opp 30. */
  los: number | YardCall;
  /** Ball X before the hash rule. Defaults to the middle of the field. */
  ballX?: number;
  /** Keep ballX as the snap. Practice re-spots and a hash-corrected out-of-bounds spot use this. */
  exactSnap?: boolean;
  /** Out of bounds spots on the hash toward the sideline the ball crossed. */
  oob?: boolean;
  play: PlacementPlay;
  scheme: DefenseScheme;
  /** Mirrors the play id and block style, which moves the nickel and dime. */
  offenseFlipped?: boolean;
  /** Mirrors every defender across midfield. */
  defenseFlipped?: boolean;
  /** Yards wide. Defaults to the 3D field width. */
  width?: number;
  /**
   * One draw in 0..1 for each canvas jitter, in the same order game.js uses.
   * The default is 0.5, the center of every jitter, so one call always
   * stands in the same place.
   */
  random?: () => number;
};

export type PlaySetup = {
  players: Player[];
  /** Absolute LOS. Offense is south of it. */
  los: number;
  /** Hash-clamped snap X. Formation X is measured from here. */
  snapX: number;
  /** HB who is carrying. Null when the call has no halfback. */
  carrierId: string | null;
  /** The canvas marks the exchange done because the HB starts with the ball. */
  handoff: "done";
  /** Slot tag for each DB id. The player's role stays "DB". */
  dbRoles: Record<string, DbAlignRole>;
};

/** Own N is that yard. Opp N is `100 - N`. Both land on 1–99. 50 is midfield. */
export function sideYardToAbsolute(side: YardSide, yard50: number): number {
  const yard = clamp(Math.round(yard50), 1, 50);
  if (side === "opp") return clamp(100 - yard, 1, 99);
  return clamp(yard, 1, 99);
}

/** 50 and everything north of it reads as the opponent's number. */
export function absoluteToSideYard(abs: number): YardCall {
  const yard = clamp(Math.round(abs), 1, 99);
  if (yard >= 50) return { side: "opp", yard: clamp(100 - yard, 1, 50) };
  return { side: "own", yard: clamp(yard, 1, 50) };
}

/**
 * Absolute yard line used as the LOS. A yard call goes through `sideYardToAbsolute`.
 * A raw yard is kept continuous, including a spot just outside either goal line.
 */
export function resolveLos(los: number | YardCall): number {
  if (typeof los === "number") {
    if (!Number.isFinite(los)) return 50;
    return clamp(los, SPOT_YARD_MIN, SPOT_YARD_MAX);
  }
  return sideYardToAbsolute(los.side, los.yard);
}

/**
 * Canvas `setSpotFromPlay` / `snapX`.
 * In bounds, X is clamped onto the hashes. Out of bounds, the spot is the
 * hash on the side the ball crossed.
 */
function hashMarks(width: number): { left: number; right: number } {
  const half = clamp(width * FIELD.postGapFrac, FIELD.postGapMin, FIELD.postGapMax);
  const mid = width * 0.5;
  return { left: mid - half, right: mid + half };
}

export function hashSnapX(ballX: number, oob = false, width: number = FIELD.width): number {
  const { left, right } = hashMarks(width);
  if (oob) return ballX < width * 0.5 ? left : right;
  return clamp(ballX, left, right);
}

function fieldWideT(width: number): number {
  return clamp((width - WIDE_REF) / WIDE_REF, 0, 1);
}

function bodyCapYard(): number {
  return FIELD.length + FIELD.endZone - BODY_INSET;
}

function countOf(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function personnelFrom(partial: Partial<PersonnelCounts> | undefined): PersonnelCounts {
  const mixed = { ...DEFAULT_PERSONNEL, ...partial };
  return {
    ol: countOf(mixed.ol),
    fb: countOf(mixed.fb),
    te: countOf(mixed.te),
    qb: countOf(mixed.qb),
    hb: countOf(mixed.hb),
    dt: countOf(mixed.dt),
    lb: countOf(mixed.lb),
    db: countOf(mixed.db),
  };
}

function unit(random: () => number): number {
  const draw = random();
  if (!Number.isFinite(draw)) return 0.5;
  return Math.min(1, Math.max(0, draw));
}

function makePlayer(id: string, team: Player["team"], role: string, x: number, yard: number, controlled: boolean): Player {
  return {
    id,
    team,
    role,
    x,
    yard,
    facingX: 0,
    facingYard: team === "def" ? -1 : 1,
    controlled,
    hop: 0,
  };
}

function clusterX(index: number, count: number, mode: ClusterMode, mid: number, width: number): number {
  if (count <= 1) return mid;
  const t = index / (count - 1);
  if (mode === "middle") return mid + (t - 0.5) * width * 0.5;
  if (mode === "wide") return mid + (t - 0.5) * width * 0.78;
  if (mode === "left") return mid - width * 0.28 + t * width * 0.42;
  if (mode === "right") return mid - width * 0.14 + t * width * 0.42;
  return mid + (t - 0.5) * width * 0.64;
}

type DbSlot = {
  x: number;
  yard: number;
  role: DbAlignRole;
};

function dbSlots(snap: number, los: number, count: number, scheme: DefenseScheme, side: -1 | 1, width: number, depthScale: number): DbSlot[] {
  const fieldMid = width * 0.5;
  const span = Math.max(8, width);
  const clusterMid = snap + (fieldMid - snap) * 0.38;
  const cbInset = Math.min(span * 0.22, 9.5) + Math.max(0, span - 53) * 0.2;
  const cbL: DbSlot = { x: cbInset, yard: los + 2.35, role: "CB" };
  const cbR: DbSlot = { x: width - cbInset, yard: los + 2.35, role: "CB" };
  const fs: DbSlot = {
    x: fieldMid,
    yard: los + Math.min(scheme.depthDB * depthScale, 13.2),
    role: "FS",
  };
  const ss: DbSlot = {
    x: snap + (snap >= clusterMid ? 1 : -1) * Math.min(span * 0.18, 9.2),
    yard: los + 8.4,
    role: "SS",
  };
  const nick: DbSlot = {
    x: snap - side * Math.min(span * 0.16, 8.4),
    yard: los + 4.1,
    role: "NCB",
  };
  const dime: DbSlot = {
    x: snap + side * Math.min(span * 0.14, 7.2),
    yard: los + 6.4,
    role: "DIME",
  };
  const slots: DbSlot[] = [];
  if (count <= 1) slots.push(fs);
  else if (count === 2) {
    const spread = Math.min(span * 0.18, 9.5);
    slots.push(
      { x: fieldMid - spread, yard: los + Math.min(scheme.depthDB * depthScale, 12.4), role: "SS" },
      { x: fieldMid + spread, yard: los + Math.min(scheme.depthDB * depthScale, 13), role: "FS" },
    );
  } else if (count === 3) slots.push(cbL, cbR, fs);
  else if (count === 4) slots.push(cbL, cbR, ss, fs);
  else if (count === 5) slots.push(cbL, nick, cbR, ss, fs);
  else {
    slots.push(cbL, nick, dime, cbR, ss, fs);
    for (let extra = 6; extra < count; extra++) {
      const t = (extra - 5) / Math.max(1, count - 5);
      slots.push({
        x: clusterMid + (t - 0.5) * span * 0.28,
        yard: los + 7.2 + extra * 0.4,
        role: "DB",
      });
    }
  }
  return slots;
}

function alignFewDbs(players: Player[], dbRoles: Record<string, DbAlignRole>, los: number, width: number) {
  const cap = bodyCapYard();
  const dbs = players.filter((player) => player.role === "DB").sort((a, b) => a.x - b.x);
  if (dbs.length === 1) {
    const only = dbs[0];
    if (!only) return;
    only.x = width * 0.5;
    only.yard = clamp(Math.max(only.yard, los + 8.2), los + 2.4, cap);
    dbRoles[only.id] = "FS";
    return;
  }
  if (dbs.length !== 2) return;
  const spread = Math.min(width * 0.12, 5.8);
  const deep = clamp(Math.max(los + 10.6, los + 6), los + 2.4, cap);
  dbs.forEach((player, index) => {
    player.x = width * 0.5 + (index === 0 ? -spread : spread);
    player.yard = Math.max(player.yard, deep);
    dbRoles[player.id] = index === 0 ? "SS" : "FS";
  });
}

function clampDbWings(players: Player[], width: number, wide: number) {
  if (wide <= 0.02) return;
  const dbs = players.filter((player) => player.role === "DB").sort((a, b) => a.x - b.x);
  if (dbs.length < 4) return;
  const inset = 3.4 + wide * 14.2;
  const left = dbs[0];
  const right = dbs[dbs.length - 1];
  if (left && left.x < inset) left.x = inset;
  if (right && right.x > width - inset) right.x = width - inset;
}

function pinOffense(players: Player[], los: number) {
  for (const player of players) {
    if (player.team !== "off") continue;
    if (player.role === "OL" || player.role === "TE") player.yard = Math.min(player.yard, los - 0.28);
    else if (player.role === "QB") player.yard = Math.min(player.yard, los - 0.85);
    else if (player.role === "FB") player.yard = Math.min(player.yard, los - 2);
    else if (player.role === "HB") player.yard = Math.min(player.yard, los - 4.2);
  }
}

/**
 * Full presnap roster for one called play.
 * The first HB is the carrier and the only controlled player.
 * The canvas aligns a single QB even when the stepper reads higher. A count
 * above one still gets a body: the first is under center, the rest stand beside him.
 */
export function placeEntitiesForNewPlay(call: PlacementCall): PlaySetup {
  const width = Number.isFinite(call.width) && (call.width ?? 0) > 0 ? (call.width as number) : FIELD.width;
  const los = resolveLos(call.los);
  const snap = call.exactSnap
    ? (call.ballX ?? width * 0.5)
    : hashSnapX(call.ballX ?? width * 0.5, !!call.oob, width);
  const personnel = personnelFrom(call.personnel);
  const wide = fieldWideT(width);
  const random = call.random ?? (() => 0.5);
  const side = playSideSign(call.play, !!call.offenseFlipped);
  const cap = bodyCapYard();
  const room = Math.max(4.2, cap - los);
  const depthScale = Math.min(1, room / 16);
  const players: Player[] = [];
  const dbRoles: Record<string, DbAlignRole> = {};

  const hbSpread = 1.4 + wide * 1.2;
  const backGap = 1.4 + wide * 0.8;
  for (let i = 0; i < personnel.hb; i++) {
    const along = (i - (personnel.hb - 1) / 2) * backGap;
    const jitter = i === 0 ? (unit(random) - 0.5) * hbSpread : 0;
    players.push(makePlayer(`hb-${i}`, "off", "HB", snap + along + jitter, los - 5, i === 0));
  }

  const olGap = 2.6 + wide * 1.55;
  for (let i = 0; i < personnel.ol; i++) {
    const x = snap + (i - (personnel.ol - 1) / 2) * olGap;
    players.push(makePlayer(`ol-${i}`, "off", "OL", x, los - 0.48, false));
  }

  const olHalf = Math.max(0, personnel.ol - 1) / 2 * olGap;
  const teOff = 1.85 + wide * 2.2;
  const teRank = 1.55 + wide * 1.35;
  for (let i = 0; i < personnel.te; i++) {
    const teSide = i % 2 === 0 ? -1 : 1;
    const rank = Math.floor(i / 2);
    const x = snap + teSide * (olHalf + teOff + rank * teRank);
    players.push(makePlayer(`te-${i}`, "off", "TE", x, los - 0.4, false));
  }

  const qbYard = los - 1.05;
  for (let i = 0; i < personnel.qb; i++) {
    players.push(makePlayer(`qb-${i}`, "off", "QB", snap - 0.35 + i * 1.2, qbYard, false));
  }

  const fbAnchor = personnel.qb > 0 ? qbYard : los - 1.05;
  for (let i = 0; i < personnel.fb; i++) {
    const x = snap + (i - (personnel.fb - 1) / 2) * backGap;
    players.push(makePlayer(`fb-${i}`, "off", "FB", x, fbAnchor - 1.85 - i * 0.55, false));
  }

  const clusterMid = snap + (width * 0.5 - snap) * 0.38;
  const dtSpan = Math.min(width * 0.32, (3.7 + wide * 2.2) * Math.max(1, personnel.dt));
  const dtDepth = Math.min(3.25, room * 0.22);
  for (let i = 0; i < personnel.dt; i++) {
    const t = personnel.dt <= 1 ? 0.5 : i / (personnel.dt - 1);
    const x = snap + (t - 0.5) * dtSpan + (unit(random) - 0.5) * 0.4;
    const yard = clamp(los + dtDepth + (unit(random) - 0.5) * 0.3, los + 1.15, cap);
    players.push(makePlayer(`dt-${i}`, "def", "DT", x, yard, false));
  }

  const lbDepth = Math.min(call.scheme.depthLB * depthScale, room * 0.42);
  for (let i = 0; i < personnel.lb; i++) {
    const x = clusterX(i, personnel.lb, call.scheme.cluster, clusterMid, width) + (unit(random) - 0.5) * 1.3;
    const yard = clamp(los + lbDepth + (unit(random) - 0.5) * 0.4, los + 1.15, cap);
    players.push(makePlayer(`lb-${i}`, "def", "LB", x, yard, false));
  }

  const slots = dbSlots(snap, los, personnel.db, call.scheme, side, width, depthScale);
  const fsSlot = slots.find((slot) => slot.role === "FS") ?? slots[0];
  for (let i = 0; i < personnel.db; i++) {
    const slot = slots[i] ?? fsSlot;
    if (!slot) continue;
    const jitterX = personnel.db <= 2 ? 0 : (unit(random) - 0.5) * 0.45;
    const jitterY = personnel.db <= 2 ? 0 : (unit(random) - 0.5) * 0.25;
    const x = personnel.db === 1 ? width * 0.5 : slot.x + jitterX;
    const yard = clamp(slot.yard + jitterY, los + 1.15, cap);
    const id = `db-${i}`;
    players.push(makePlayer(id, "def", "DB", x, yard, false));
    dbRoles[id] = slot.role;
  }

  if (call.defenseFlipped) {
    const mid = width * 0.5;
    for (const player of players) {
      if (player.team === "def") player.x = mid - (player.x - mid);
    }
  }

  alignFewDbs(players, dbRoles, los, width);
  clampDbWings(players, width, wide);
  pinOffense(players, los);

  const carrier = players.find((player) => player.controlled) ?? null;
  return {
    players,
    los,
    snapX: snap,
    carrierId: carrier ? carrier.id : null,
    handoff: "done",
    dbRoles,
  };
}

/** Seat the ball on the carrier the same way the movement machine does each frame. */
function seatBall(sim: Sim, carrier: Player, width: number) {
  const rightX = carrier.facingYard;
  const rightYard = -carrier.facingX;
  const minX = -PLAY_MARGIN;
  const maxX = width + PLAY_MARGIN;
  const minYard = -FIELD.endZone - PLAY_MARGIN;
  const maxYard = FIELD.length + FIELD.endZone + PLAY_MARGIN;
  sim.ballX = clamp(carrier.x + carrier.facingX * BALL_AHEAD + rightX * BALL_RIGHT, minX, maxX);
  sim.ballYard = clamp(carrier.yard + carrier.facingYard * BALL_AHEAD + rightYard * BALL_RIGHT, minYard, maxYard);
}

/**
 * A sim whose roster, LOS, and ball come from `placeEntitiesForNewPlay`.
 * Carrier clocks match `createSim`. The preview roster is replaced.
 * The ball sits on the HB. With no HB, it stays on the snap at the LOS.
 */
export function createPlaySim(call: PlacementCall): Sim {
  const setup = placeEntitiesForNewPlay(call);
  const width = Number.isFinite(call.width) && (call.width ?? 0) > 0 ? (call.width as number) : FIELD.width;
  const sim = createSim();
  sim.players = setup.players;
  sim.los = setup.los;
  const carrier = setup.carrierId ? setup.players.find((player) => player.id === setup.carrierId) ?? null : null;
  if (carrier) seatBall(sim, carrier, width);
  else {
    sim.ballX = setup.snapX;
    sim.ballYard = setup.los;
  }
  return sim;
}
