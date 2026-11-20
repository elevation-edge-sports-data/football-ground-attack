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
import { FIELD, PLAY_MARGIN, SPOT_YARD_MAX, SPOT_YARD_MIN, clamp, hashHalf } from "../../field/spec";
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

/**
 * Slots from a 3-OL, 0-TE line, numbered 1–5 left to right.
 * 1 and 5 sit behind the outer linemen. 3 sits on the snap.
 * The halfway gaps, 2 and 4, are not used.
 * Multiples of the live OL gap, not of the real row.
 */
const FB_REFERENCE_GAPS = [-1, 0, 1] as const;
/** Yards south of the LOS for a fullback on the deep slots. */
const FB_SLOT_DEPTH = 3;
/** Yards south of the LOS for the fourth fullback. He cannot take the middle slot. */
const FB_UP_DEPTH = 1.5;
/** Yards south of the LOS for a wide receiver on the line. */
const WR_LINE_DEPTH = 0.5;
/** Yards south of the LOS for a wide receiver off the line. */
const WR_BACK_DEPTH = 1.5;
/** TE+WR on one side of the snap may lead the other side by at most this many. */
const RECEIVER_BALANCE = 4;

type FullbackSeat = { gap: number; depth: number };

let fullbackRoll = 0;
let fullbackHold = false;
let fullbackMemo: { roll: number; count: number; seats: FullbackSeat[] } | null = null;
let qbDepthMemo: { roll: number; depth: number } | null = null;

/** A restaged snap keeps the chosen fullback slots. Field width still scales them. */
export function holdFullbackSlots(hold: boolean) {
  fullbackHold = hold;
}

/** Call once per new snap, before placement. A hold leaves the roll where it is. */
export function advanceFullbackSlots() {
  if (!fullbackHold) fullbackRoll += 1;
}

function fbUnit(random: (() => number) | undefined): number {
  if (random) return unit(random);
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    const buf = new Uint32Array(1);
    cryptoObj.getRandomValues(buf);
    return buf[0]! / 4294967296;
  }
  return Math.random();
}

/** Distinct reference gaps, left to right. A repeat of the same snap reuses the seats. */
function pickGaps(pool: readonly number[], count: number, random: () => number): number[] {
  const slots = [...pool];
  const n = Math.min(count, slots.length);
  for (let i = 0; i < n; i++) {
    const span = slots.length - i;
    const j = i + Math.min(span - 1, Math.floor(unit(random) * span));
    const swap = slots[i]!;
    slots[i] = slots[j]!;
    slots[j] = swap;
  }
  return slots.slice(0, n).sort((a, b) => a - b);
}

/** Always 1.5 yards. The draw stays so a restage does not shift the fullback picks. */
function quarterbackDepth(random: () => number): number {
  if (qbDepthMemo && qbDepthMemo.roll === fullbackRoll) return qbDepthMemo.depth;
  unit(random);
  const depth = FB_UP_DEPTH;
  qbDepthMemo = { roll: fullbackRoll, depth };
  return depth;
}

function occupiesCenter(seats: readonly FullbackSeat[]): boolean {
  return seats.some((seat) => seat.gap === 0 && seat.depth === FB_SLOT_DEPTH);
}

function fullbackSeats(count: number, random: () => number, blockCenter: boolean): FullbackSeat[] {
  if (
    fullbackMemo &&
    fullbackMemo.roll === fullbackRoll &&
    fullbackMemo.count === count &&
    !(blockCenter && occupiesCenter(fullbackMemo.seats))
  ) {
    return fullbackMemo.seats;
  }
  const deepPool = blockCenter ? FB_REFERENCE_GAPS.filter((gap) => gap !== 0) : [...FB_REFERENCE_GAPS];
  let seats: FullbackSeat[];
  if (count === 4) {
    const upGaps = FB_REFERENCE_GAPS.filter((gap) => gap !== 0);
    const up = pickGaps(upGaps, 1, random)[0] ?? -1;
    const deep = pickGaps(
      deepPool.filter((gap) => gap !== up),
      3,
      random,
    );
    seats = [
      ...deep.map((gap) => ({ gap, depth: FB_SLOT_DEPTH })),
      { gap: up, depth: FB_UP_DEPTH },
    ].sort((a, b) => a.gap - b.gap);
  } else {
    seats = pickGaps(deepPool, count, random).map((gap) => ({ gap, depth: FB_SLOT_DEPTH }));
  }
  fullbackMemo = { roll: fullbackRoll, count, seats };
  return seats;
}

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
  const half = hashHalf(width);
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
    wr: countOf(mixed.wr),
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
  const corner = (slot: DbSlot): DbSlot => ({ ...slot, yard: los + 3 });
  const deep = (slot: DbSlot): DbSlot => ({ ...slot, yard: los + 8 });
  const slots: DbSlot[] = [];
  if (count <= 1) slots.push(deep(fs));
  else if (count === 2) {
    const spread = Math.min(span * 0.18, 9.5);
    slots.push(
      { x: fieldMid - spread, yard: los + 8, role: "SS" },
      { x: fieldMid + spread, yard: los + 8, role: "FS" },
    );
  } else if (count === 3) slots.push(corner(cbL), corner(cbR), deep(fs));
  else if (count === 4) slots.push(corner(cbL), corner(cbR), deep(ss), deep(fs));
  else if (count === 5) slots.push(corner(cbL), deep(nick), corner(cbR), deep(ss), deep(fs));
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

function alignFewDbs(players: Player[], dbRoles: Record<string, DbAlignRole>, los: number, width: number, snap: number) {
  const dbs = players.filter((player) => player.role === "DB").sort((a, b) => a.x - b.x);
  if (dbs.length === 1) {
    const only = dbs[0];
    if (!only) return;
    only.x = snap;
    only.yard = los + 8;
    dbRoles[only.id] = "FS";
    return;
  }
  if (dbs.length !== 2) return;
  const spread = Math.min(width * 0.12, 5.8);
  dbs.forEach((player, index) => {
    player.x = width * 0.5 + (index === 0 ? -spread : spread);
    player.yard = los + 8;
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
    else if (player.role === "FB") player.yard = Math.min(player.yard, los - FB_UP_DEPTH);
    else if (player.role === "HB") player.yard = Math.min(player.yard, los - 4.2);
  }
}

/** OL strictly left of the anchor versus strictly right, for one contiguous OL block. */
function olSideGap(ol: number, leftTe: number, anchor: number): number {
  if (ol <= 0) return 0;
  let left = 0;
  let right = 0;
  const end = leftTe + ol - 1;
  for (let slot = leftTe; slot <= end; slot++) {
    if (slot < anchor) left += 1;
    else if (slot > anchor) right += 1;
  }
  return Math.abs(left - right);
}

/**
 * Tight ends standing left of the OL block. Half of them, rounded up, keeps the
 * first TE on the left. An odd count of both groups slides that block far enough
 * that one side has two more OL than the other. One left TE then moves to the right.
 */
function leftTightEndCount(ol: number, te: number, anchor: number): number {
  const preferred = Math.ceil(te / 2);
  if (olSideGap(ol, preferred, anchor) <= 1) return preferred;
  const shifted = preferred - 1;
  if (shifted >= 0 && olSideGap(ol, shifted, anchor) <= 1) return shifted;
  return preferred;
}

type WingSplit = { teL: number; teR: number; teC: boolean };

/**
 * Outside-packed ways to set an even number of tight ends on a fixed slot grid
 * when the row has no OL. Either wing may have up to two more than the other.
 */
function evenTightEndSplits(leftSlots: number, rightSlots: number, te: number): WingSplit[] {
  const splits: WingSplit[] = [];
  for (let center = 0; center <= 1; center++) {
    for (let teL = 0; teL <= leftSlots; teL++) {
      const teR = te - center - teL;
      if (teR < 0 || teR > rightSlots) continue;
      if (Math.abs(leftSlots - teL - (rightSlots - teR)) > 1) continue;
      if (Math.abs(teL - teR) > 2) continue;
      splits.push({ teL, teR, teC: center === 1 });
    }
  }
  return splits;
}

/** Wing counts for an even number of tight ends. The two sides differ by at most two. */
function evenTightEndWings(te: number): number[] {
  const wings: number[] = [];
  for (let teL = 0; teL <= te; teL++) {
    if (Math.abs(teL - (te - teL)) <= 2) wings.push(teL);
  }
  return wings;
}

/**
 * A centered row can leave a TE on the snap when the only OL sits beside it.
 * Slide the OL and TE together so that OL lands on the snap. QB and RB stay put.
 */
function anchorOffensiveLine(players: Player[], snap: number) {
  const ols = players.filter((player) => player.role === "OL").sort((a, b) => a.x - b.x);
  if (ols.length === 0 || ols.some((player) => player.x === snap)) return;
  let best = ols[0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = 0; i < ols.length; i++) {
    const left = i;
    const right = ols.length - 1 - i;
    const candidate = ols[i];
    if (!candidate) continue;
    const score = Math.abs(left - right) * 1000 + Math.abs(candidate.x - snap);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  if (!best || best.x === snap) return;
  const shift = snap - best.x;
  for (const player of players) {
    if (player.role === "OL" || player.role === "TE") player.x += shift;
  }
}

/**
 * Even TE counts pick a wing split after the side roll. With at least one OL,
 * that OL block stays where it is, so the snap OL stays on the snap, and the
 * tight ends slide along the same gap. A row with no OL keeps the centered slots.
 */
function repackEvenTightEnds(players: Player[], snap: number, te: number, random: () => number) {
  if (te < 2 || te % 2 !== 0) return;
  const ols = players.filter((player) => player.role === "OL").sort((a, b) => a.x - b.x);
  if (ols.length === 0) {
    repackEvenTightEndsOnGrid(players, snap, te, random);
    return;
  }
  const line = players.filter((player) => player.role === "OL" || player.role === "TE").sort((a, b) => a.x - b.x);
  const first = line[0];
  const second = line[1];
  if (!first || !second) return;
  const gap = second.x - first.x;
  if (!(gap > 0)) return;
  const wings = evenTightEndWings(te);
  if (wings.length <= 1) return;
  const teL = wings[Math.min(wings.length - 1, Math.floor(unit(random) * wings.length))];
  if (teL === undefined) return;
  const teR = te - teL;
  const leftEdge = ols[0];
  const rightEdge = ols[ols.length - 1];
  if (!leftEdge || !rightEdge) return;
  const xs: number[] = [];
  for (let i = teL; i >= 1; i--) xs.push(leftEdge.x - i * gap);
  for (let i = 1; i <= teR; i++) xs.push(rightEdge.x + i * gap);
  const tes = players.filter((player) => player.role === "TE").sort((a, b) => a.x - b.x);
  if (xs.length !== tes.length) return;
  tes.forEach((body, index) => {
    const x = xs[index];
    if (x !== undefined) body.x = x;
  });
}

/** No offensive lineman, so the centered slots may keep a tight end on the snap. */
function repackEvenTightEndsOnGrid(players: Player[], snap: number, te: number, random: () => number) {
  const line = players.filter((player) => player.role === "OL" || player.role === "TE").sort((a, b) => a.x - b.x);
  const anchor = line.findIndex((player) => player.x === snap);
  if (anchor < 0) return;
  const splits = evenTightEndSplits(anchor, line.length - anchor - 1, te);
  if (splits.length <= 1) return;
  const split = splits[Math.min(splits.length - 1, Math.floor(unit(random) * splits.length))];
  if (!split) return;
  const roles: Array<"OL" | "TE"> = [];
  for (let i = 0; i < line.length; i++) roles.push("OL");
  for (let i = 0; i < split.teL; i++) roles[i] = "TE";
  for (let i = 0; i < split.teR; i++) roles[line.length - 1 - i] = "TE";
  if (split.teC) roles[anchor] = "TE";
  const xs = line.map((player) => player.x);
  const gridOls = line.filter((player) => player.role === "OL").sort((a, b) => a.x - b.x);
  const tes = line.filter((player) => player.role === "TE").sort((a, b) => a.x - b.x);
  const next: Array<{ body: Player; x: number }> = [];
  let olIndex = 0;
  let teIndex = 0;
  for (let i = 0; i < roles.length; i++) {
    const body = roles[i] === "TE" ? tes[teIndex++] : gridOls[olIndex++];
    const x = xs[i];
    if (!body || x === undefined) return;
    next.push({ body, x });
  }
  for (const move of next) move.body.x = move.x;
}

/**
 * Slot of each TE, outside the OL. Even indexes take the left wing from the inside
 * out, odd indexes the right wing. A wing that is already full spills to the other.
 */
function tightEndSlots(ol: number, te: number, leftTe: number): number[] {
  const lineCount = ol + te;
  const left: number[] = [];
  for (let slot = leftTe - 1; slot >= 0; slot--) left.push(slot);
  const right: number[] = [];
  for (let slot = leftTe + ol; slot < lineCount; slot++) right.push(slot);
  const slots: number[] = [];
  let leftIndex = 0;
  let rightIndex = 0;
  for (let i = 0; i < te; i++) {
    const wantLeft = i % 2 === 0;
    const takeLeft = wantLeft ? leftIndex < left.length : rightIndex >= right.length && leftIndex < left.length;
    if (takeLeft) {
      const slot = left[leftIndex];
      leftIndex += 1;
      if (slot !== undefined) slots.push(slot);
    } else {
      const slot = right[rightIndex];
      rightIndex += 1;
      if (slot !== undefined) slots.push(slot);
    }
  }
  return slots;
}

/** Leftmost or rightmost OL/TE. With none, the snap stands in for that edge. */
function lineEdge(players: readonly Player[], side: -1 | 1, snap: number): number {
  let edge: number | null = null;
  for (const player of players) {
    if (player.role !== "OL" && player.role !== "TE") continue;
    if (edge === null || (side < 0 ? player.x < edge : player.x > edge)) edge = player.x;
  }
  return edge ?? snap;
}

/**
 * Field X from one alignment spot outside `edge` out to that sideline.
 * The spot width is the OL/TE gap. Empty when that segment misses this side of the snap.
 */
function wingSpan(
  edge: number,
  gap: number,
  side: -1 | 1,
  snap: number,
  width: number,
): { lo: number; hi: number } | null {
  const sideline = side < 0 ? 0 : width;
  const oneSpot = edge + side * gap;
  let lo = Math.max(0, Math.min(oneSpot, sideline));
  let hi = Math.min(width, Math.max(oneSpot, sideline));
  if (side < 0) hi = Math.min(hi, snap - 1e-4);
  else lo = Math.max(lo, snap + 1e-4);
  if (!(lo <= hi)) return null;
  return { lo, hi };
}

function eligibleSideCounts(players: readonly Player[], snap: number): { teL: number; teR: number } {
  let teL = 0;
  let teR = 0;
  for (const player of players) {
    if (player.role !== "TE") continue;
    if (player.x < snap) teL += 1;
    else if (player.x > snap) teR += 1;
  }
  return { teL, teR };
}

/** Left-side WR counts that keep TE+WR within `RECEIVER_BALANCE` and on an open wing. */
function balancedWideLeft(teL: number, teR: number, wr: number, leftOpen: boolean, rightOpen: boolean): number[] {
  const counts: number[] = [];
  for (let wrL = 0; wrL <= wr; wrL++) {
    const wrR = wr - wrL;
    if ((wrL > 0 && !leftOpen) || (wrR > 0 && !rightOpen)) continue;
    if (Math.abs(teL + wrL - (teR + wrR)) <= RECEIVER_BALANCE) counts.push(wrL);
  }
  return counts;
}

function chooseWideLeft(
  teL: number,
  teR: number,
  wr: number,
  leftOpen: boolean,
  rightOpen: boolean,
  random: () => number,
): number {
  const open = balancedWideLeft(teL, teR, wr, leftOpen, rightOpen);
  const pool = open.length > 0 ? open : balancedWideLeft(teL, teR, wr, true, true);
  if (pool.length > 0) {
    return pool[Math.min(pool.length - 1, Math.floor(unit(random) * pool.length))] ?? 0;
  }
  let bestScore = Infinity;
  const tied: number[] = [];
  for (let wrL = 0; wrL <= wr; wrL++) {
    const wrR = wr - wrL;
    let score = Math.abs(teL + wrL - (teR + wrR));
    if (wrL > 0 && !leftOpen) score += 100;
    if (wrR > 0 && !rightOpen) score += 100;
    if (score < bestScore) {
      bestScore = score;
      tied.length = 0;
      tied.push(wrL);
    } else if (score === bestScore) tied.push(wrL);
  }
  return tied[Math.min(tied.length - 1, Math.floor(unit(random) * tied.length))] ?? 0;
}

/** Keep sampled X inside the wing and at least one alignment spot apart when it fits. */
function spreadInSpan(raw: readonly number[], lo: number, hi: number, gap: number): number[] {
  const xs = raw.map((x) => clamp(x, lo, hi)).sort((a, b) => a - b);
  if (xs.length <= 1) return xs;
  const room = (hi - lo) / (xs.length - 1);
  const minGap = Math.min(Math.max(gap, 0), Math.max(0, room));
  if (!(minGap > 0)) return xs;
  for (let i = 1; i < xs.length; i++) {
    const prev = xs[i - 1]!;
    if (xs[i]! < prev + minGap) xs[i] = prev + minGap;
  }
  const overflow = xs[xs.length - 1]! - hi;
  if (overflow > 0) {
    for (let i = 0; i < xs.length; i++) xs[i] = xs[i]! - overflow;
  }
  for (let i = 0; i < xs.length; i++) xs[i] = clamp(xs[i]!, lo, hi);
  return xs;
}

function sampleWing(
  span: { lo: number; hi: number } | null,
  count: number,
  gap: number,
  side: -1 | 1,
  width: number,
  random: () => number,
): number[] {
  if (count <= 0) return [];
  const fallback = side < 0 ? 0 : width;
  const lo = span?.lo ?? fallback;
  const hi = span?.hi ?? fallback;
  const raw: number[] = [];
  for (let i = 0; i < count; i++) raw.push(lo + (hi - lo) * unit(random));
  return spreadInSpan(raw, lo, hi, gap);
}

/**
 * Wide receivers, after the OL/TE row is final.
 * Each one is 0.5 or 1.5 yards behind the LOS, from one spot outside the
 * outer OL/TE to the sideline. TE+WR left of the snap stays within 4 of the right.
 * Draws start after the fullback roll so that roll does not move.
 */
function placeWideReceivers(
  players: Player[],
  snap: number,
  los: number,
  width: number,
  count: number,
  gap: number,
  random: () => number,
) {
  if (count <= 0 || !(gap > 0)) return;
  const leftSpan = wingSpan(lineEdge(players, -1, snap), gap, -1, snap, width);
  const rightSpan = wingSpan(lineEdge(players, 1, snap), gap, 1, snap, width);
  const { teL, teR } = eligibleSideCounts(players, snap);
  const wrL = chooseWideLeft(teL, teR, count, leftSpan != null, rightSpan != null, random);
  const xs = [
    ...sampleWing(leftSpan, wrL, gap, -1, width, random),
    ...sampleWing(rightSpan, count - wrL, gap, 1, width, random),
  ];
  for (let i = 0; i < count; i++) {
    const x = xs[i] ?? snap;
    const yard = unit(random) < 0.5 ? los - WR_LINE_DEPTH : los - WR_BACK_DEPTH;
    players.push(makePlayer(`wr-${i}`, "off", "WR", x, yard, false));
  }
}

/**
 * Full presnap roster for one called play.
 * The first HB is the carrier and the only controlled player.
 * Every quarterback stands on the snap, 1.5 yards off the ball.
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

  // One gap across the OL+TE row. An even count anchors one central player on the snap,
  // which leaves the extra bodies toward the right sideline until the side roll below.
  // A quarter wider than the halved line gap. Field width still scales it the same way.
  const olGap = (2.6 + wide * 1.55) * 0.5 * 1.25;
  const lineCount = personnel.ol + personnel.te;
  const anchorSlot = lineCount % 2 === 0 ? lineCount / 2 - 1 : (lineCount - 1) / 2;
  const lineX = (slot: number) => snap + (slot - anchorSlot) * olGap;
  const leftTe = leftTightEndCount(personnel.ol, personnel.te, anchorSlot);
  const teSlots = tightEndSlots(personnel.ol, personnel.te, leftTe);

  for (let i = 0; i < personnel.hb; i++) {
    const along = (i - (personnel.hb - 1) / 2) * backGap;
    // The draw stays so later presnap jitter does not shift. It is not the primary back's x.
    const jitter = i === 0 ? (unit(random) - 0.5) * hbSpread : 0;
    const x = i === 0 && personnel.qb >= 1 ? snap : snap + along + jitter;
    players.push(makePlayer(`hb-${i}`, "off", "HB", x, los - 5, i === 0));
  }

  for (let i = 0; i < personnel.ol; i++) {
    players.push(makePlayer(`ol-${i}`, "off", "OL", lineX(leftTe + i), los - 0.48, false));
  }
  for (let i = 0; i < personnel.te; i++) {
    const slot = teSlots[i];
    if (slot === undefined) continue;
    players.push(makePlayer(`te-${i}`, "off", "TE", lineX(slot), los - 0.4, false));
  }

  // Depth is chosen after the line's side roll so that roll stays put.
  const quarterbacks: Player[] = [];
  for (let i = 0; i < personnel.qb; i++) {
    const body = makePlayer(`qb-${i}`, "off", "QB", snap, los - FB_UP_DEPTH, false);
    quarterbacks.push(body);
    players.push(body);
  }

  // 1–4 fullbacks are seated after the line's side roll so that roll stays put.
  // Any larger count stays stacked on the snap.
  const slottedFullbacks: Player[] = [];
  if ((personnel.fb >= 1 && personnel.fb <= 3) || personnel.fb === 4) {
    for (let i = 0; i < personnel.fb; i++) {
      const body = makePlayer(`fb-${i}`, "off", "FB", snap, los - FB_SLOT_DEPTH, false);
      slottedFullbacks.push(body);
      players.push(body);
    }
  } else if (personnel.fb > 4) {
    const fbAnchor = los - 1.05;
    for (let i = 0; i < personnel.fb; i++) {
      const x = snap + (i - (personnel.fb - 1) / 2) * backGap;
      players.push(makePlayer(`fb-${i}`, "off", "FB", x, fbAnchor - 1.85 - i * 0.55, false));
    }
  }

  const clusterMid = snap + (width * 0.5 - snap) * 0.38;
  const dtSpan = Math.min(width * 0.32, (3.7 + wide * 2.2) * Math.max(1, personnel.dt));
  const dtGap = personnel.dt <= 1 ? dtSpan : dtSpan / Math.max(1, personnel.dt - 1);
  // Wide rows keep the ±0.2 jitter. A tight row shrinks it so the snap and the gaps stay even.
  const dtXJitter = Math.min(0.4, Math.max(0, dtGap) * 0.15);
  // Same room curve as before, scaled so depth plus ±0.15 jitter stays under 1 yard.
  const dtDepth = Math.min(0.84, (room * 0.22 * 0.84) / 3.25);
  for (let i = 0; i < personnel.dt; i++) {
    const t = personnel.dt <= 1 ? 0.5 : i / (personnel.dt - 1);
    const x = snap + (t - 0.5) * dtSpan + (unit(random) - 0.5) * dtXJitter;
    const yard = clamp(los + dtDepth + (unit(random) - 0.5) * 0.3, los + 0.05, Math.min(cap, los + 0.99));
    players.push(makePlayer(`dt-${i}`, "def", "DT", x, yard, false));
  }

  // Authored depths run 3.6–6.8. Fold them into 2.25–4.75 so ±0.2 jitter stays inside 2–5.
  const lbAuthored = Math.min(6.8, Math.max(3.6, call.scheme.depthLB));
  const lbDepth = Math.min((2.25 + ((lbAuthored - 3.6) / 3.2) * 2.5) * depthScale, room * 0.42);
  const lbCeiling = Math.min(cap, los + 5);
  const lbFloor = Math.min(los + 2, lbCeiling);
  // One linebacker stands on the snap.
  // Two linebackers split by the hash gap and center on the snap.
  // A centered snap puts one on each hash.
  // Three keep that center. The outer pair is 1.5× the two-linebacker split.
  // Four keep that center. The outer pair is 2× the two-linebacker split.
  // Wider counts stay on the cluster.
  const hashGap = hashHalf(width);
  for (let i = 0; i < personnel.lb; i++) {
    // Drawn for every count so a one-, two-, three-, or four-linebacker row does not shift the depth roll.
    const lateralJitter = (unit(random) - 0.5) * 1.3;
    const x =
      personnel.lb === 1
        ? snap
        : personnel.lb === 2
          ? snap + (i === 0 ? -hashGap : hashGap)
          : personnel.lb === 3
            ? snap + (i - 1) * hashGap * 1.5
            : personnel.lb === 4
              ? snap + (i - 1.5) * ((hashGap * 4) / 3)
              : clusterX(i, personnel.lb, call.scheme.cluster, clusterMid, width) + lateralJitter;
    // Drawn for every count so the fixed linebacker depths do not shift the other rolls.
    const depthJitter = (unit(random) - 0.5) * 0.4;
    // Three linebackers: the outer pair stands 3 yards off the line. The middle keeps the authored depth.
    // Four linebackers: the outer pair stands 3 yards off the line. The inner pair stands together at 4.
    const outerFour = personnel.lb === 4 && (i === 0 || i === personnel.lb - 1);
    const innerFour = personnel.lb === 4 && !outerFour;
    const outerThree = personnel.lb === 3 && (i === 0 || i === personnel.lb - 1);
    const yard = clamp(
      los + (outerFour || outerThree ? 3 : innerFour ? 4 : lbDepth + depthJitter),
      lbFloor,
      lbCeiling,
    );
    players.push(makePlayer(`lb-${i}`, "def", "LB", x, yard, false));
  }

  const slots = dbSlots(snap, los, personnel.db, call.scheme, side, width, depthScale);
  const fsSlot = slots.find((slot) => slot.role === "FS") ?? slots[0];
  for (let i = 0; i < personnel.db; i++) {
    const slot = slots[i] ?? fsSlot;
    if (!slot) continue;
    const jitterX = personnel.db <= 2 ? 0 : (unit(random) - 0.5) * 0.45;
    const jitterY = personnel.db <= 2 ? 0 : (unit(random) - 0.5) * 0.25;
    const x = personnel.db === 1 ? snap : slot.x + jitterX;
    const yard = clamp(slot.yard + jitterY, los + 1.15, cap);
    const id = `db-${i}`;
    players.push(makePlayer(id, "def", "DB", x, yard, false));
    dbRoles[id] = slot.role;
  }

  // Even rows are built heavy toward the right sideline. Mirror them across the snap
  // half the time. This draw stays behind the presnap jitter. No call.random means Math.random.
  if (lineCount >= 2 && lineCount % 2 === 0 && unit(call.random ?? Math.random) < 0.5) {
    for (const player of players) {
      if (player.role === "OL" || player.role === "TE") player.x = snap * 2 - player.x;
    }
  }
  // Keep an OL on the snap whenever the row has one, then repack an even number of
  // tight ends around that block. The draw follows the side roll.
  anchorOffensiveLine(players, snap);
  repackEvenTightEnds(players, snap, personnel.te, call.random ?? Math.random);
  // Slots are the 3-OL reference, scaled by this snap's gap.
  // A quarterback at 3 yards would own the center slot. Depth is 1.5, so he does not.
  let blockCenter = false;
  if (quarterbacks.length > 0) {
    const depth = quarterbackDepth(() => fbUnit(call.random));
    blockCenter = depth === FB_SLOT_DEPTH;
    for (const body of quarterbacks) {
      body.x = snap;
      body.yard = los - depth;
    }
  }
  if (slottedFullbacks.length > 0) {
    const seats = fullbackSeats(slottedFullbacks.length, () => fbUnit(call.random), blockCenter);
    slottedFullbacks.forEach((body, index) => {
      const seat = seats[index];
      if (!seat) return;
      body.x = snap + seat.gap * olGap;
      body.yard = los - seat.depth;
    });
  }

  // After the line's side roll, the anchor, the tight-end repack, and the fullback draws.
  placeWideReceivers(players, snap, los, width, personnel.wr, olGap, call.random ?? Math.random);

  if (call.defenseFlipped) {
    const mid = width * 0.5;
    for (const player of players) {
      if (player.team === "def") player.x = mid - (player.x - mid);
    }
  }

  alignFewDbs(players, dbRoles, los, width, snap);
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
