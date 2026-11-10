/**
 * Snap-time assignments. Ports `assignDefenseJobs`, `assignBlockJobs`,
 * the keeper-sheet tweaks, and `limitDtPenetration`.
 *
 * The route cursor starts at step 0. `stepAssignments` in `advance.ts` is what
 * walks it. Player x and yard stay where placement put them until that call.
 * A job pass may
 * slide its own working copy when a later landmark depends on that slide.
 * Those slides are not written back onto the roster.
 *
 * `src/game/sim.ts` is not involved. `createSim` stays the six-player preview.
 */
import { FIELD, clamp } from "../../field/spec";
import type { Player } from "../sim";
import type { PlaySetup } from "./place";
import {
  cellFacing,
  playBookKey,
  playSideSign,
  resolveCalledPlay,
  type PlayCallInput,
} from "./plays";
import type {
  BlockAssignment,
  BlockMode,
  DbAlignRole,
  DefenseAssignment,
  DefenseJob,
  DefenseScheme,
  OffensePlay,
  PlayAssignment,
  PullVia,
  PursuitAssignment,
  RouteAssignment,
  StationRole,
} from "./types";

const BODY_INSET = 1.5;
const WIDE_REF = 50;

type Rng = () => number;

type DefDraft = {
  id: string;
  role: string;
  x: number;
  y: number;
  job: DefenseJob;
  jobX: number | null;
  jobY: number | null;
  zoneRx: number;
  zoneRy: number;
  zoneFollow: boolean;
  readT: number;
  blitzDelay: number;
  stutter: boolean;
  stutterX: number;
  stutterY: number;
  artCurve: boolean;
  fakeBlitz: boolean;
  reactT: number;
  isCorner: boolean;
  isSafety: boolean;
  aggressor: boolean;
  misfireT: number;
  misfireId: string | null;
  laneOffset: number;
  dtPenetrate: boolean;
  manId: string | null;
  dbRole: DbAlignRole | null;
};

type BlockDraft = {
  id: string;
  role: string;
  x: number;
  y: number;
  target: DefDraft | null;
  mode: BlockMode;
  pullPhase: 0 | 1 | 2;
  pullVia: PullVia | null;
  driveSide: -1 | 0 | 1;
  sealSide: -1 | 1;
  levelY: number;
  driveBlock: boolean;
  sturdyBlock: boolean;
  backsideSeal: boolean;
  pullBoost: number;
  gapAimX: number | null;
  gapAimY: number | null;
};

type FieldCtx = {
  los: number;
  snap: number;
  fl: number;
  fr: number;
  mid: number;
  width: number;
  wide: number;
  cap: number;
  rnd: Rng;
  defs: DefDraft[];
  blocks: BlockDraft[];
  side: -1 | 1;
};

export type AssignedPlayer = Player & {
  assignment: PlayAssignment;
};

export type AssignedPlay = {
  players: AssignedPlayer[];
  play: OffensePlay;
  scheme: DefenseScheme;
  /** Canvas `scriptIndex`. The carrier route stores the same value. */
  scriptIndex: number;
  /** Canvas `scriptTimer`. */
  scriptTimer: number;
  /** Canvas `scriptLocked`. True when the first step ignores the stick. */
  scriptLocked: boolean;
  /** Hash-clamped snap, kept so blockers can retarget off the ball. */
  snapX: number;
  /** Seconds since this assignment state started stepping. Stays 0 until the snap. */
  age: number;
  /**
   * False while the formation is armed and waiting. The lineup poses stay up
   * until the user snaps. Stepping begins on that snap.
   */
  snapped: boolean;
  /** Positions sampled during the play, for the post-whistle scrub. */
  replay: ReplayTape;
};

export type ReplaySample = {
  id: string;
  x: number;
  yard: number;
  hop: number;
  facingX: number;
  facingYard: number;
};

export type ReplayFrame = {
  /** `AssignedPlay.age` when the sample was taken. */
  age: number;
  pose: string;
  /** Football at this sample. The scrub lock can sit on it, apart from any player. */
  ballX: number;
  ballYard: number;
  players: ReplaySample[];
};

export type ReplayTape = {
  frames: ReplayFrame[];
  /** Seconds since the last stored sample. */
  since: number;
};

function hashSeed(text: string): number {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): Rng {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fieldWideT(width: number): number {
  return clamp((width - WIDE_REF) / WIDE_REF, 0, 1);
}

function mirrorAround(x: number, mid: number): number {
  return mid - (x - mid);
}

function signOr(value: number, fallback: -1 | 1): -1 | 1 {
  if (value < 0) return -1;
  if (value > 0) return 1;
  return fallback;
}

function capY(ctx: FieldCtx, yard: number): number {
  return Math.min(ctx.cap, yard);
}

function coverFrac(frac: number, wide: number): number {
  const pull = wide * 0.44;
  return 0.5 + (frac - 0.5) * (1 - pull);
}

function roleSorted(list: DefDraft[], role: string): DefDraft[] {
  return list.filter((player) => player.role === role).sort((a, b) => a.x - b.x);
}

function pursue(): PursuitAssignment {
  return { kind: "pursue" };
}

function routeOf(play: OffensePlay): RouteAssignment {
  return {
    kind: "route",
    steps: play.steps.map((step) => ({ ...step })),
    index: 0,
    timer: 0,
    lockFirst: !!play.lockFirst,
  };
}

function stationForDefender(player: DefDraft, snap: number): StationRole {
  const dx = player.x - snap;
  if (player.job === "contain") return "contain";
  if (player.job === "blitz") return player.role === "DT" && Math.abs(dx) < 2.4 ? "gap" : "fold";
  if (player.job === "flat" || player.job === "shade") return "alley";
  if (player.job === "deep" || player.job === "robber" || player.isSafety || player.isCorner) return "alley";
  if (player.job === "drop" || player.job === "hook" || player.job === "curl" || player.job === "spy") return "cutback";
  if (player.job === "man") return Math.abs(dx) < 3.2 ? "gap" : "alley";
  if (player.role === "DT") return "gap";
  if (player.role === "LB") return "cutback";
  return "alley";
}

function stationForBlocker(player: BlockDraft, snap: number): StationRole {
  if (player.mode === "pull") return "fold";
  if (player.backsideSeal) return "cutback";
  if (player.mode === "reach" || player.mode === "seal") return "alley";
  if (Math.abs(player.x - snap) > 5) return "contain";
  return "gap";
}

function toDefense(player: DefDraft, snap: number): DefenseAssignment {
  const x = player.jobX ?? player.x;
  const yard = player.jobY ?? player.y;
  return {
    kind: "defense",
    job: player.job,
    x,
    yard,
    zoneRx: player.zoneRx,
    zoneRy: player.zoneRy,
    zoneFollow: player.zoneFollow,
    station: stationForDefender(player, snap),
    stationX: x,
    stationYard: yard,
    manTargetId: player.manId,
    readTime: player.readT,
    blitzDelay: player.blitzDelay,
    stutter: player.stutter,
    stutterX: player.stutterX,
    stutterYard: player.stutterY,
    artCurve: player.artCurve,
    fakeBlitz: player.fakeBlitz,
    reactTime: player.reactT,
    dbRole: player.dbRole,
    isCorner: player.isCorner,
    isSafety: player.isSafety,
    aggressor: player.aggressor,
    misfireTime: player.misfireT,
    misfireTargetId: player.misfireT > 0 ? player.misfireId : null,
    laneOffset: player.laneOffset,
    dtPenetrate: player.dtPenetrate,
  };
}

function toBlock(player: BlockDraft, snap: number): BlockAssignment {
  return {
    kind: "block",
    mode: player.mode,
    targetId: player.target ? player.target.id : null,
    driveSide: player.driveSide,
    sealSide: player.sealSide,
    levelY: player.levelY,
    driveBlock: player.driveBlock,
    sturdyBlock: player.sturdyBlock,
    backsideSeal: player.backsideSeal,
    pullPhase: player.pullPhase,
    pullVia: player.pullVia ? { ...player.pullVia } : null,
    pullBoost: player.pullBoost,
    gapAimX: player.gapAimX,
    gapAimY: player.gapAimY,
    station: stationForBlocker(player, snap),
    secondLevel: false,
  };
}

function clearBlock(player: BlockDraft, drive: -1 | 0 | 1, level: number) {
  player.target = null;
  player.mode = "man";
  player.pullPhase = 0;
  player.pullVia = null;
  player.driveSide = drive;
  player.levelY = level;
  player.pullBoost = 1;
  player.gapAimX = null;
  player.gapAimY = null;
  player.backsideSeal = false;
}

function takeDefender(
  defs: DefDraft[],
  used: Set<DefDraft>,
  preferX: number,
  maxDist: number,
  los: number,
  yardWeight: number,
  preferRole?: string,
  roleWeight = 0.5,
): DefDraft | null {
  let best: DefDraft | null = null;
  let bestDist = maxDist;
  for (const defender of defs) {
    if (used.has(defender)) continue;
    let dist = Math.hypot(defender.x - preferX, (defender.y - los) * yardWeight);
    if (preferRole && defender.role === preferRole) dist *= roleWeight;
    if (dist < bestDist) {
      bestDist = dist;
      best = defender;
    }
  }
  if (best) used.add(best);
  return best;
}

function assignBlockJobs(ctx: FieldCtx, style: string) {
  const { blocks, defs, los, snap, side, rnd } = ctx;
  const ols = blocks.filter((player) => player.role === "OL").sort((a, b) => a.x - b.x);
  const tes = blocks.filter((player) => player.role === "TE").sort((a, b) => a.x - b.x);
  const fbs = blocks.filter((player) => player.role === "FB").sort((a, b) => a.x - b.x);
  const qbs = blocks.filter((player) => player.role === "QB");
  const ordered = [...defs].sort((a, b) => a.x - b.x);

  if (style === "zoneR" || style === "zoneL") {
    const playSide: -1 | 1 = style === "zoneR" ? 1 : -1;
    const used = new Set<DefDraft>();
    const take = (preferX: number, maxDist: number, preferRole?: string) =>
      takeDefender(ordered, used, preferX, maxDist, los, 0.5, preferRole, 0.5);
    const gapX = snap + playSide * (ols.length >= 3 ? 2.4 : 1.9);
    for (const blocker of blocks) {
      clearBlock(blocker, playSide, 2.8);
      blocker.driveBlock = true;
      blocker.sturdyBlock = false;
    }
    ols.forEach((blocker, index) => {
      blocker.mode = "reach";
      blocker.driveSide = playSide;
      blocker.driveBlock = true;
      blocker.target = take(blocker.x + playSide * 0.9, 22, "DT") ?? take(blocker.x + playSide * 1.1, 24);
      blocker.levelY = 2.4 + index * 0.3;
    });
    tes.forEach((blocker, index) => {
      blocker.mode = "reach";
      blocker.driveSide = playSide;
      blocker.driveBlock = true;
      blocker.target = take(blocker.x + playSide * 1.4, 20, "DT") ?? take(blocker.x + playSide * 1.4, 20);
      blocker.levelY = 3 + index * 0.35;
    });
    fbs.forEach((blocker, index) => {
      blocker.mode = "climb";
      blocker.driveSide = playSide;
      blocker.driveBlock = true;
      blocker.levelY = 3.6 + index * 0.35;
      blocker.target = take(gapX + playSide * index * 0.7, 24) ?? take(gapX, 28);
      blocker.gapAimX = gapX + playSide * 0.8;
      blocker.gapAimY = los + 4.8 + index * 0.7;
    });
    for (const blocker of qbs) {
      blocker.mode = "man";
      blocker.driveSide = playSide;
      blocker.driveBlock = true;
      blocker.target = take(snap - playSide * 2.2, 14, "DT") ?? take(snap - playSide * 2.2, 14);
      blocker.levelY = 1.2;
    }
    for (const defender of ordered) {
      if (defender.role !== "DT" || used.has(defender)) continue;
      const free = ols.find((blocker) => !blocker.target) ?? ols[0];
      if (free) {
        free.target = defender;
        free.driveBlock = true;
        used.add(defender);
      }
    }
    return;
  }

  if (style === "wallL" || style === "wallR") {
    const playSide: -1 | 1 = style === "wallL" ? -1 : 1;
    const used = new Set<DefDraft>();
    const weight = playSide < 0 ? 0.55 : 0.5;
    const roleWeight = playSide < 0 ? 0.55 : 0.45;
    const take = (preferX: number, maxDist: number, preferRole?: string) =>
      takeDefender(ordered, used, preferX, maxDist, los, weight, preferRole, roleWeight);
    for (const blocker of blocks) {
      clearBlock(blocker, playSide, playSide < 0 ? 2.6 : 3);
      blocker.driveBlock = playSide > 0;
    }
    const line = [...ols, ...tes].sort((a, b) => a.x - b.x);
    const pullers = playSide < 0 ? line.slice(-2).reverse() : line.slice(0, Math.min(2, line.length));
    pullers.forEach((blocker, index) => {
      blocker.mode = "pull";
      blocker.pullPhase = 0;
      blocker.driveSide = playSide;
      blocker.driveBlock = playSide > 0 || blocker.driveBlock;
      blocker.pullVia =
        playSide < 0
          ? {
              x: blocker.x - playSide * 0.3,
              y: los - 1.5 - index * 0.35,
              x2: snap + playSide * (5.8 + index * 1.1),
              y2: los + 1.4 + index * 0.5,
            }
          : {
              x: blocker.x + playSide * 0.8,
              y: los + 0.4 + index * 0.2,
              x2: snap + playSide * (6 + index * 1.1),
              y2: los + 3.4 + index * 0.6,
            };
      blocker.target = take(snap + playSide * (7 + index), playSide < 0 ? 24 : 26);
      blocker.levelY = (playSide < 0 ? 4 : 4.5) + index * (playSide < 0 ? 0.4 : 0.3);
    });
    if (playSide < 0) {
      line.forEach((blocker, index) => {
        if (pullers.includes(blocker)) return;
        blocker.mode = "man";
        blocker.driveSide = signOr(blocker.x - snap, 1);
        const preferX = blocker.x + 0.6;
        blocker.target = take(preferX, 16, "DT") ?? take(preferX, 20);
        blocker.levelY = 2 + index * 0.25;
      });
      fbs.forEach((blocker, index) => {
        blocker.mode = "climb";
        blocker.driveSide = playSide;
        blocker.levelY = 5.5 + index * 0.4;
        const outsideX = snap + playSide * (8.5 + index * 1.2);
        blocker.target = take(outsideX, 26);
        blocker.gapAimX = outsideX;
        blocker.gapAimY = los + 5.5 + index * 0.6;
      });
      for (const blocker of qbs) {
        blocker.mode = "man";
        blocker.driveSide = playSide === -1 ? 1 : -1;
        blocker.target = take(snap - playSide * 2.2, 12, "DT") ?? take(snap - playSide * 2.2, 12);
        blocker.levelY = 1.2;
      }
    } else {
      for (const blocker of line) {
        if (pullers.includes(blocker)) continue;
        blocker.mode = "reach";
        blocker.driveSide = signOr(blocker.x - snap, -1);
        blocker.driveBlock = true;
        blocker.target = take(blocker.x, 18, "DT") ?? take(blocker.x, 22);
        blocker.levelY = 2.4;
      }
      for (const defender of ordered) {
        if (defender.role !== "DT" || used.has(defender)) continue;
        const free = line.find((blocker) => !pullers.includes(blocker) && (!blocker.target || blocker.target.role !== "DT"));
        const host = free ?? line[line.length - 1];
        if (host) {
          host.target = defender;
          host.mode = "reach";
          host.driveBlock = true;
          used.add(defender);
        }
      }
      fbs.forEach((blocker, index) => {
        blocker.mode = "climb";
        blocker.driveSide = playSide;
        blocker.driveBlock = true;
        blocker.levelY = 5.8;
        const outsideX = snap + playSide * (8.5 + index);
        blocker.target = take(outsideX, 26);
        blocker.gapAimX = outsideX;
        blocker.gapAimY = los + 6;
      });
      for (const blocker of qbs) {
        blocker.mode = "man";
        blocker.driveBlock = true;
        blocker.target = take(snap - 2, 14, "DT") ?? take(snap - 2, 14);
        blocker.levelY = 1.2;
      }
    }
    return;
  }

  if (style === "swingR" || style === "swingL") {
    const playSide: -1 | 1 = style === "swingR" ? 1 : -1;
    const used = new Set<DefDraft>();
    const take = (preferX: number, maxDist: number) => takeDefender(ordered, used, preferX, maxDist, los, 0.65);
    for (const blocker of blocks) {
      clearBlock(blocker, playSide, 2.8);
      blocker.driveBlock = true;
    }
    const line = [...ols, ...tes].sort((a, b) => a.x - b.x);
    if (!line.length) return;
    const count = line.length;
    const pivot = playSide > 0 ? line[count - 1] : line[0];
    if (!pivot) return;
    const hingeX = pivot.x;
    const hingeY = los + 0.2;
    const hingeGroup = playSide > 0 ? line.slice(-Math.min(3, count)) : line.slice(0, Math.min(3, count));
    hingeGroup.forEach((blocker, index) => {
      blocker.mode = "reach";
      blocker.driveSide = playSide;
      blocker.driveBlock = true;
      blocker.levelY = 3.6 + index * 0.35;
      blocker.target = take(blocker.x + playSide * (0.8 + index * 0.3), 16);
      blocker.gapAimX = blocker.x + playSide * 0.5;
      blocker.gapAimY = los + 3.5 + index * 0.5;
    });
    for (const blocker of line) {
      if (hingeGroup.includes(blocker)) continue;
      const index = line.indexOf(blocker);
      const rank = playSide > 0 ? count - 1 - index : index;
      const radius = Math.max(2.2, Math.abs(blocker.x - hingeX) + 0.4);
      const startAng = playSide > 0 ? Math.PI * 0.92 : Math.PI * 0.08;
      const endAng = playSide > 0 ? -0.25 - rank * 0.08 : Math.PI + 0.25 + rank * 0.08;
      const midAng = startAng + (endAng - startAng) * 0.45;
      const midR = radius * (0.85 + rank * 0.06);
      const midX = hingeX + Math.cos(midAng) * midR;
      const midY = hingeY + Math.sin(midAng) * midR - (0.8 + rank * 0.55);
      const endX = hingeX + playSide * (1.3 + rank * 1.55);
      const endY = los + 1.3 + rank * 0.25;
      blocker.mode = "pull";
      blocker.pullPhase = 0;
      blocker.driveSide = playSide;
      blocker.pullBoost = 1.05 + Math.min(0.22, rank * 0.05);
      blocker.pullVia = { x: midX, y: Math.min(los - 0.3, midY), x2: endX, y2: endY };
      blocker.target = take(endX + playSide * 0.8, 20);
      blocker.levelY = 2.5 + rank * 0.3;
    }
    for (const blocker of fbs) {
      blocker.mode = "climb";
      blocker.driveSide = playSide;
      blocker.driveBlock = true;
      blocker.levelY = 4.6;
      blocker.target = take(hingeX + playSide * 5, 20);
      blocker.gapAimX = hingeX + playSide * 5.2;
      blocker.gapAimY = los + 4.5;
    }
    for (const blocker of qbs) {
      blocker.mode = "man";
      blocker.target = take(snap - playSide * 2, 12);
      blocker.levelY = 1.2;
    }
    return;
  }

  if (style === "river") {
    const used = new Set<DefDraft>();
    const take = (preferX: number, maxDist: number) => takeDefender(ordered, used, preferX, maxDist, los, 0.6);
    for (const blocker of blocks) {
      clearBlock(blocker, 0, 3);
      blocker.sturdyBlock = true;
      blocker.driveBlock = false;
    }
    const line = [...ols, ...tes].sort((a, b) => a.x - b.x);
    const midIndex = (line.length - 1) / 2;
    line.forEach((blocker, index) => {
      const outward = signOr(index - midIndex, index % 2 === 0 ? -1 : 1);
      blocker.mode = "reach";
      blocker.driveSide = outward;
      blocker.sturdyBlock = true;
      blocker.target = take(blocker.x + outward * 1.4, 18);
      blocker.levelY = 2.2 + Math.abs(index - midIndex) * 0.9 + (index % 2) * 0.35;
    });
    fbs.forEach((blocker, index) => {
      blocker.mode = "climb";
      blocker.sturdyBlock = true;
      blocker.driveSide = index % 2 === 0 ? 1 : -1;
      blocker.levelY = 5 + index * 0.8;
      blocker.target = take(snap + blocker.driveSide * 2.5, 20);
      blocker.gapAimX = snap + blocker.driveSide * 3.2;
      blocker.gapAimY = los + 5.5;
    });
    for (const blocker of qbs) {
      blocker.mode = "man";
      blocker.sturdyBlock = true;
      blocker.target = take(snap, 12);
      blocker.levelY = 1.5;
    }
    return;
  }

  if (style === "wedgeL" || style === "wedgeR") {
    const left = style === "wedgeL";
    const used = new Set<DefDraft>();
    const take = (preferX: number, maxDist: number) => takeDefender(ordered, used, preferX, maxDist, los, 0.55);
    const line = [...ols, ...tes].sort((a, b) => a.x - b.x);
    const hinges = left ? line.slice(0, 2) : line.slice(-2);
    for (const blocker of blocks) {
      clearBlock(blocker, left ? -1 : 1, 3);
      blocker.driveBlock = true;
      blocker.sturdyBlock = true;
    }
    line.forEach((blocker, index) => {
      const rank = left ? line.length - 1 - index : index;
      if (hinges.includes(blocker)) {
        blocker.mode = "reach";
        blocker.driveBlock = true;
        blocker.sturdyBlock = true;
        blocker.pullVia = null;
        blocker.pullPhase = 0;
        blocker.gapAimX = blocker.x + (left ? -0.8 : 0.8);
        blocker.gapAimY = los + 2.2;
        blocker.target = take(blocker.x + (left ? -1.1 : 1.1), 14);
        blocker.levelY = 2.2;
        return;
      }
      blocker.mode = "pull";
      blocker.pullPhase = 0;
      blocker.pullBoost = 1.08 + rank * 0.08;
      const midX = snap + (left ? -1 : 1) * (2.8 + rank * 0.55);
      const midY = los - (1.1 + rank * 0.65);
      const endX = snap + (left ? -1 : 1) * (6.5 + rank * 1.55);
      const endY = los + 2.4 + rank * 0.95;
      blocker.pullVia = { x: midX, y: midY, x2: endX, y2: endY };
      blocker.target = take(endX, 22);
      blocker.gapAimX = endX;
      blocker.gapAimY = endY + 1.2;
      blocker.levelY = 3 + rank * 0.9;
      blocker.driveBlock = true;
    });
    fbs.forEach((blocker, index) => {
      blocker.mode = "man";
      blocker.pullVia = null;
      blocker.pullPhase = 0;
      blocker.driveSide = left ? 1 : -1;
      blocker.sealSide = left ? 1 : -1;
      blocker.backsideSeal = true;
      blocker.driveBlock = true;
      blocker.sturdyBlock = true;
      blocker.target = take(snap + (left ? 4.2 + index * 0.8 : -3.4 - index * 0.8), left ? 18 : 16);
      blocker.gapAimX = snap + (left ? 4.4 : -3.8);
      blocker.gapAimY = los + (left ? 2.8 : 1.2);
      blocker.levelY = left ? 2.6 : 1.8;
    });
    for (const blocker of qbs) {
      blocker.mode = "man";
      blocker.pullVia = null;
      blocker.driveSide = left ? 1 : -1;
      blocker.sealSide = left ? 1 : -1;
      blocker.backsideSeal = true;
      blocker.driveBlock = true;
      blocker.sturdyBlock = true;
      blocker.target = take(snap + (left ? 3.2 : -2.4), left ? 16 : 14);
      blocker.gapAimX = snap + (left ? 3.6 : -2.8);
      blocker.gapAimY = los + (left ? 2.4 : 1.1);
      blocker.levelY = left ? 2.2 : 1.4;
    }
    return;
  }

  if (style === "zigzag") {
    const used = new Set<DefDraft>();
    const take = (preferX: number, maxDist: number) => takeDefender(ordered, used, preferX, maxDist, los, 0.55);
    const zigs = [
      { x: snap + side * -2.4, y: los + 3.2, bend: signOr(-side, -1) },
      { x: snap + side * 2.6, y: los + 6.4, bend: side },
      { x: snap + side * -2.7, y: los + 9.5, bend: signOr(-side, -1) },
      { x: snap + side * 2.4, y: los + 12.4, bend: side },
      { x: snap + side * -1.4, y: los + 15, bend: signOr(-side, -1) },
    ];
    for (const blocker of blocks) {
      clearBlock(blocker, -1, 3);
      blocker.driveBlock = true;
      blocker.sturdyBlock = true;
    }
    const line = [...ols, ...tes].sort((a, b) => a.x - b.x);
    line.forEach((blocker, index) => {
      const zig = zigs[Math.min(index, zigs.length - 1)];
      if (!zig) return;
      const sealX = zig.x + zig.bend * 1.35;
      blocker.mode = "reach";
      blocker.driveSide = zig.bend;
      blocker.sturdyBlock = true;
      blocker.driveBlock = true;
      blocker.levelY = (zig.y - los) * 0.55;
      blocker.target = take(sealX, 18);
      blocker.gapAimX = sealX;
      blocker.gapAimY = zig.y;
    });
    fbs.forEach((blocker, index) => {
      const zig = zigs[Math.min(1 + index, zigs.length - 1)];
      if (!zig) return;
      blocker.mode = "climb";
      blocker.driveSide = zig.bend;
      blocker.sturdyBlock = true;
      blocker.levelY = zig.y - los;
      blocker.target = take(zig.x + zig.bend * 1.8, 20);
      blocker.gapAimX = zig.x + zig.bend * 1.5;
      blocker.gapAimY = zig.y + 0.5;
    });
    for (const blocker of qbs) {
      blocker.mode = "man";
      blocker.target = take(snap + 1.5, 12);
      blocker.levelY = 1.2;
    }
    return;
  }

  let pulls = 0;
  if (style === "pullL" || style === "pullR") pulls = 1 + (rnd() < 0.42 ? 1 : 0);
  else pulls = rnd() < 0.38 ? 1 : rnd() < 0.12 ? 2 : 0;
  pulls = Math.min(pulls, Math.max(0, ols.length - 1));
  const pullers: BlockDraft[] = [];
  if (pulls >= 1 && ols.length) pullers.push(side < 0 ? ols[ols.length - 1]! : ols[0]!);
  if (pulls >= 2 && ols.length >= 3) {
    const second = side < 0 ? ols[ols.length - 2]! : ols[1]!;
    if (!pullers.includes(second)) pullers.push(second);
  }
  const used = new Set<DefDraft>();
  const take = (preferX: number, maxDist: number) => takeDefender(ordered, used, preferX, maxDist, los, 0.65);
  blocks.forEach((blocker, index) => {
    clearBlock(blocker, signOr(blocker.x - snap, index < blocks.length / 2 ? -1 : 1), 2.4 + (index % 5) * 0.85 + rnd() * 0.45);
  });
  ols.forEach((blocker, index) => {
    if (pullers.includes(blocker)) {
      blocker.mode = "pull";
      blocker.pullPhase = 0;
      const behind = los - 1.6 - rnd() * 0.7;
      blocker.pullVia = {
        x: snap + side * 0.4,
        y: behind,
        x2: snap + side * (5.5 + rnd()),
        y2: los + 1.2,
      };
      blocker.target = take(snap + side * 7, 22);
      blocker.levelY = 4.2 + rnd();
    } else {
      blocker.mode = index % 2 === 0 ? "man" : "reach";
      blocker.target = take(blocker.x + blocker.driveSide * 0.8, 22);
      blocker.levelY = 2.1 + index * 0.75 + rnd() * 0.4;
    }
  });
  fbs.forEach((blocker, index) => {
    blocker.mode = "climb";
    const free = ordered.filter((defender) => defender.role === "LB" && !used.has(defender));
    blocker.target = free[index] ?? take(blocker.x + side * 2.2, 18);
    blocker.levelY = 5.2 + index * 1.5;
  });
  tes.forEach((blocker, index) => {
    blocker.mode = "reach";
    blocker.driveSide = signOr(blocker.x - snap, index % 2 === 0 ? -1 : 1);
    blocker.target = take(blocker.x + blocker.driveSide * 1.4, 18);
    blocker.levelY = 3.4 + index * 0.8;
  });
  for (const blocker of qbs) {
    blocker.mode = "man";
    blocker.target = take(blocker.x, 10);
    blocker.levelY = 1.2;
  }
}

function applyCellBlockTweaks(ctx: FieldCtx, key: string, schemeId: string, offenseFlipped: boolean, facingStock: boolean) {
  const defs = [...ctx.defs].sort((a, b) => a.x - b.x);
  const fbs = ctx.blocks.filter((player) => player.role === "FB");
  const lead = (playSide: -1 | 1) => {
    const pack = playSide < 0 ? defs.slice(0, 3) : defs.slice(-3);
    fbs.forEach((blocker, index) => {
      blocker.mode = "climb";
      blocker.driveSide = playSide;
      blocker.driveBlock = true;
      blocker.target = pack[Math.min(index, Math.max(0, pack.length - 1))] ?? pack[0] ?? null;
      blocker.gapAimX = ctx.snap + playSide * (8.2 + index * 1.1);
      blocker.gapAimY = ctx.los + 5.4 + index * 0.5;
      blocker.levelY = 5.5 + index * 0.4;
    });
  };
  const retargetLeft = (count: number) => {
    const left = defs.slice(0, count);
    const pullers = ctx.blocks.filter((player) => player.mode === "pull" || player.mode === "climb");
    pullers.forEach((blocker, index) => {
      const defender = left[index];
      if (defender) blocker.target = defender;
      blocker.driveSide = -1;
      blocker.gapAimX = (defender ? defender.x : ctx.snap - 8) - 0.4;
      blocker.gapAimY = ctx.los + 4.8 + index * 0.4;
    });
    if (!pullers.length) lead(-1);
  };
  if (key === "pitch" && schemeId === "overloadBlitz" && facingStock) lead(-1);
  if (key === "blast" && schemeId === "wide" && offenseFlipped) lead(-1);
  if (key === "sweep" && schemeId === "tight" && offenseFlipped) retargetLeft(3);
}

function laneOffsets(defs: DefDraft[], gap: number) {
  defs.forEach((defender, index) => {
    defender.laneOffset = (index - (defs.length - 1) / 2) * gap;
  });
}

function assignOverload(ctx: FieldCtx) {
  const { defs, fl, fr, mid, los, rnd } = ctx;
  const width = fr - fl;
  const used = new Set<DefDraft>();
  const dts = roleSorted(defs, "DT");
  const lbs = roleSorted(defs, "LB");
  const dbs = roleSorted(defs, "DB");
  const blitz = (defender: DefDraft, jobX: number, jobY: number, curve: boolean, stutter: boolean, stutterX?: number, stutterY?: number) => {
    defender.job = "blitz";
    defender.jobX = clamp(jobX, fl + 2.5, fr - 2.5);
    defender.jobY = jobY;
    defender.zoneRx = 1.2;
    defender.zoneRy = 1.2;
    defender.zoneFollow = false;
    defender.artCurve = curve;
    defender.stutter = stutter;
    if (stutter) {
      defender.stutterX = clamp(stutterX ?? (defender.x + jobX) / 2, fl + 3, fr - 3);
      defender.stutterY = stutterY ?? los + 1.1;
      defender.artCurve = true;
    }
    defender.readT = 0.1 + rnd() * 0.18;
    defender.isSafety = false;
    defender.isCorner = false;
    defender.aggressor = true;
    used.add(defender);
  };
  const zone = (defender: DefDraft, job: DefenseJob, x: number, y: number, rx: number, ry: number, follow: boolean) => {
    defender.job = job;
    defender.jobX = clamp(x, fl + 2.5, fr - 2.5);
    defender.jobY = y;
    defender.zoneRx = rx;
    defender.zoneRy = ry;
    defender.zoneFollow = follow || job === "drop" || job === "spy";
    defender.artCurve = false;
    defender.stutter = false;
    defender.readT = job === "deep" ? 0.4 + rnd() * 0.3 : 0.22 + rnd() * 0.25;
    defender.isSafety = job === "deep";
    defender.isCorner = job === "curl" || job === "flat";
    defender.aggressor = false;
    used.add(defender);
  };
  const db0 = dbs[0];
  const lb0 = lbs[0];
  const dt0 = dts[0];
  if (db0) blitz(db0, mid - width * 0.08, los - 0.35, true, true, db0.x + width * 0.06, los + 1.4);
  if (lb0) blitz(lb0, mid - width * 0.04, los - 0.15, true, true, lb0.x + width * 0.1, los + 0.9);
  if (dt0) blitz(dt0, mid - width * 0.02, los - 0.45, true, false);
  for (const defender of dts.slice(1)) blitz(defender, defender.x, los - 0.25 - rnd() * 0.35, false, false);
  const lb1 = lbs[1];
  if (lb1) blitz(lb1, mid - width * 0.06, los - 0.2, true, false);
  lbs.slice(2).forEach((defender, index) => {
    blitz(defender, defender.x - width * 0.03, los - 0.15, index === 0, false);
  });
  const freeDbs = dbs.filter((defender) => !used.has(defender));
  const free0 = freeDbs[0];
  const free1 = freeDbs[1];
  const free2 = freeDbs[2];
  if (free0) zone(free0, "curl", fl + width * 0.16, los + 4.4, width * 0.13, 1.9, false);
  if (free1) zone(free1, "deep", fl + width * 0.32, capY(ctx, los + 15), width * 0.2, 5, false);
  if (free2) zone(free2, "deep", fr - width * 0.32, capY(ctx, los + 15), width * 0.2, 5, false);
  const rest = defs.filter((defender) => !used.has(defender)).sort((a, b) => a.x - b.x);
  const tail: { job: DefenseJob; x: number; y: number; rx: number; ry: number; follow: boolean }[] = [
    { job: "drop", x: mid + width * 0.04, y: los + 8, rx: width * 0.11, ry: 2.5, follow: true },
    { job: "curl", x: fr - width * 0.16, y: los + 4.4, rx: width * 0.13, ry: 1.9, follow: false },
    { job: "deep", x: mid, y: capY(ctx, los + 14.5), rx: width * 0.18, ry: 4.5, follow: false },
    { job: "flat", x: fr - width * 0.22, y: los + 3.6, rx: width * 0.12, ry: 1.5, follow: false },
  ];
  rest.forEach((defender, index) => {
    const slot = tail[Math.min(index, tail.length - 1)];
    if (!slot) return;
    zone(defender, slot.job, slot.x, slot.y, slot.rx, slot.ry, slot.follow);
  });
  laneOffsets(defs, 1.7);
}

function assignPrevent(ctx: FieldCtx) {
  const { defs, fl, fr, mid, los, rnd } = ctx;
  const width = fr - fl;
  const used = new Set<DefDraft>();
  const dbs = roleSorted(defs, "DB");
  const nonDb = defs.filter((defender) => defender.role !== "DB").sort((a, b) => a.x - b.x);
  const deepY = capY(ctx, los + 16.5);
  const quarters = [
    { job: "deep" as const, x: fl + width * 0.125, y: deepY, rx: width * 0.15, ry: 5.4 },
    { job: "deep" as const, x: fl + width * 0.375, y: deepY + 0.4, rx: width * 0.15, ry: 5.6 },
    { job: "deep" as const, x: fl + width * 0.625, y: deepY + 0.4, rx: width * 0.15, ry: 5.6 },
    { job: "deep" as const, x: fl + width * 0.875, y: deepY, rx: width * 0.15, ry: 5.4 },
  ];
  const claim = (
    defender: DefDraft,
    slot: { job: DefenseJob; x: number; y: number; rx: number; ry: number; follow?: boolean },
  ) => {
    defender.job = slot.job;
    defender.jobX = clamp(slot.x, fl + 2.5, fr - 2.5);
    defender.jobY = slot.y;
    defender.zoneRx = slot.rx;
    defender.zoneRy = slot.ry;
    defender.zoneFollow = !!slot.follow || slot.job === "drop" || slot.job === "spy";
    defender.artCurve = false;
    defender.stutter = false;
    defender.isSafety = slot.job === "deep";
    defender.isCorner = slot.job === "curl" || slot.job === "flat";
    defender.readT = slot.job === "deep" ? 0.5 + rnd() * 0.35 : 0.25 + rnd() * 0.3;
    defender.aggressor = slot.job === "blitz";
    used.add(defender);
  };
  const freePool = (dbFirst: boolean) =>
    dbFirst
      ? [...dbs.filter((defender) => !used.has(defender)), ...nonDb.filter((defender) => !used.has(defender))]
      : [...nonDb.filter((defender) => !used.has(defender)), ...dbs.filter((defender) => !used.has(defender))];
  const deepSlots: { job: DefenseJob; x: number; y: number; rx: number; ry: number }[] = [];
  const count = defs.length;
  if (count >= 4) deepSlots.push(quarters[1]!, quarters[2]!, quarters[0]!, quarters[3]!);
  else if (count === 3) deepSlots.push(quarters[1]!, quarters[2]!, quarters[0]!);
  else if (count === 2) deepSlots.push(quarters[1]!, quarters[2]!);
  else if (count === 1) deepSlots.push({ job: "deep", x: mid, y: deepY, rx: width * 0.22, ry: 5.6 });
  const deepPool = freePool(true);
  deepSlots.forEach((slot, index) => {
    const defender = deepPool[index];
    if (defender) claim(defender, slot);
  });
  if (deepSlots.length >= 4) {
    const deep = defs.filter((defender) => used.has(defender) && defender.job === "deep").sort((a, b) => a.x - b.x);
    deep.forEach((defender, index) => {
      const quarter = quarters[index];
      if (!quarter) return;
      defender.jobX = quarter.x;
      defender.jobY = quarter.y;
      defender.zoneRx = quarter.rx;
      defender.zoneRy = quarter.ry;
    });
  }
  const curls = [
    { job: "curl" as const, x: fl + width * 0.17, y: los + 4.5, rx: width * 0.13, ry: 1.9, side: -1 },
    { job: "curl" as const, x: fr - width * 0.17, y: los + 4.5, rx: width * 0.13, ry: 1.9, side: 1 },
  ];
  const curlPool = freePool(true);
  for (const slot of curls) {
    let best = -1;
    let bestDist = 1e9;
    curlPool.forEach((defender, index) => {
      if (used.has(defender)) return;
      const penalty = (slot.side < 0 && defender.x > mid) || (slot.side > 0 && defender.x < mid) ? 30 : 0;
      const dist = Math.abs(defender.x - slot.x) + penalty;
      if (dist < bestDist) {
        bestDist = dist;
        best = index;
      }
    });
    if (best < 0) continue;
    const picked = curlPool.splice(best, 1)[0];
    if (picked && !used.has(picked)) claim(picked, slot);
  }
  const drops = [
    { job: "drop" as const, x: mid - width * 0.08, y: los + 8.5, rx: width * 0.1, ry: 2.6, follow: true },
    { job: "drop" as const, x: mid + width * 0.08, y: los + 8.5, rx: width * 0.1, ry: 2.6, follow: true },
  ];
  const dropPool = freePool(false);
  for (const slot of drops) {
    const candidate = dropPool.find((defender) => !used.has(defender));
    if (candidate) claim(candidate, slot);
  }
  const blitzPool = freePool(false).filter((defender) => !used.has(defender));
  for (let i = blitzPool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const swap = blitzPool[i]!;
    blitzPool[i] = blitzPool[j]!;
    blitzPool[j] = swap;
  }
  const gaps = [mid - width * 0.18, mid - width * 0.06, mid + width * 0.06, mid + width * 0.18, fl + width * 0.22, fr - width * 0.22];
  for (let i = gaps.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const swap = gaps[i]!;
    gaps[i] = gaps[j]!;
    gaps[j] = swap;
  }
  blitzPool.slice(0, 3).forEach((defender, index) => {
    let gap = gaps[index % gaps.length] ?? mid;
    if (defender.role === "DB") {
      const near = gaps.filter((x) => Math.sign(x - mid) === Math.sign(defender.x - mid) || Math.abs(x - mid) < width * 0.08);
      gap = near.length
        ? near.reduce((best, x) => (Math.abs(x - defender.x) < Math.abs(best - defender.x) ? x : best), near[0]!)
        : defender.x < mid
          ? mid - width * 0.14
          : mid + width * 0.14;
    }
    claim(defender, { job: "blitz", x: gap, y: los - 0.2 - rnd() * 0.4, rx: 1.2, ry: 1.2 });
    defender.artCurve = defender.role === "DB" || rnd() < 0.45;
    defender.stutter = rnd() < 0.35;
  });
  defs
    .filter((defender) => !used.has(defender))
    .forEach((defender, index) => {
      const dropSide = index % 2 === 0 ? -1 : 1;
      claim(defender, {
        job: "drop",
        x: mid + dropSide * width * (0.12 + index * 0.04),
        y: los + 7.5 + (index % 3) * 0.6,
        rx: width * 0.1,
        ry: 2.4,
        follow: true,
      });
    });
  laneOffsets(defs, 1.7);
}

function assignQuarters(ctx: FieldCtx) {
  const { defs, fl, fr, mid, los, snap, rnd } = ctx;
  const width = fr - fl;
  const deepY = capY(ctx, los + 15.5);
  const quarters = [
    { x: fl + width * 0.125, y: deepY, rx: width * 0.16, ry: 5.2 },
    { x: fl + width * 0.375, y: deepY, rx: width * 0.16, ry: 5.2 },
    { x: fl + width * 0.625, y: deepY, rx: width * 0.16, ry: 5.2 },
    { x: fl + width * 0.875, y: deepY, rx: width * 0.16, ry: 5.2 },
  ];
  const under = [
    { job: "curl" as DefenseJob, x: fl + width * 0.18, y: los + 4.6, rx: width * 0.14, ry: 2, side: -1, follow: false },
    { job: "drop" as DefenseJob, x: mid, y: los + 6.8, rx: width * 0.105, ry: 2.4, side: 0, follow: true },
    { job: "curl" as DefenseJob, x: fr - width * 0.18, y: los + 4.6, rx: width * 0.14, ry: 2, side: 1, follow: false },
  ];
  const used = new Set<DefDraft>();
  const claim = (defender: DefDraft, slot: { job: DefenseJob; x: number; y: number; rx: number; ry: number; follow?: boolean }) => {
    defender.job = slot.job;
    defender.jobX = clamp(slot.x, fl + 2.5, fr - 2.5);
    defender.jobY = slot.y;
    defender.zoneRx = slot.rx;
    defender.zoneRy = slot.ry;
    defender.zoneFollow = !!slot.follow || slot.job === "drop" || slot.job === "spy";
    defender.artCurve = false;
    defender.stutter = false;
    defender.isSafety = slot.job === "deep";
    defender.isCorner = slot.job === "curl" || slot.job === "flat";
    defender.readT = slot.job === "deep" ? 0.45 + rnd() * 0.35 : 0.25 + rnd() * 0.3;
    if (slot.job === "drop") {
      defender.x = defender.x * 0.55 + mid * 0.45;
      defender.y = Math.min(defender.y, los + 7.2);
      defender.y = Math.max(defender.y, los + 5.6);
    }
    used.add(defender);
  };
  const remaining = (role?: string) =>
    defs.filter((defender) => !used.has(defender) && (!role || defender.role === role)).sort((a, b) => a.x - b.x);
  const dbs = remaining("DB");
  const nonDb = defs.filter((defender) => defender.role !== "DB").sort((a, b) => a.x - b.x);
  const budget = Math.min(4, dbs.length);
  if (budget === 1 && dbs[0]) claim(dbs[0], { job: "deep", x: mid, y: deepY, rx: width * 0.22, ry: 5.2 });
  else if (budget > 1) {
    let slots = quarters.slice(0, budget);
    if (budget === 3) {
      const sample = (dbs.length ? dbs : nonDb).slice(0, 3);
      const mean = sample.reduce((sum, defender) => sum + defender.x, 0) / Math.max(1, sample.length);
      slots = mean < mid ? quarters.slice(0, 3) : quarters.slice(1, 4);
    } else if (budget === 2) slots = quarters.slice(1, 3);
    for (let i = 0; i < budget; i++) {
      const defender = dbs[i];
      const slot = slots[i];
      if (defender && slot) claim(defender, { job: "deep", ...slot });
    }
  }
  let deepFilled = 0;
  for (const defender of used) if (defender.job === "deep") deepFilled += 1;
  if (deepFilled < 4) {
    const open = quarters.filter(
      (quarter) => ![...used].some((defender) => defender.job === "deep" && Math.abs((defender.jobX ?? 0) - quarter.x) < 0.01),
    );
    const pool = remaining().filter((defender) => defender.role !== "DB");
    const nAssign = Math.min(4 - deepFilled, open.length, pool.length);
    for (let i = 0; i < nAssign; i++) {
      const defender = pool[i];
      const slot = open[i];
      if (defender && slot) claim(defender, { job: "deep", ...slot });
    }
  }
  const freeUnder = under.slice();
  const assignUnder = (pool: DefDraft[]) => {
    const free = pool.filter((defender) => !used.has(defender));
    while (freeUnder.length && free.length) {
      let best: { defender: DefDraft; slot: (typeof freeUnder)[number] } | null = null;
      let bestScore = 1e9;
      for (const defender of free) {
        if (used.has(defender)) continue;
        for (const slot of freeUnder) {
          const sidePenalty =
            slot.side < 0 && defender.x > mid + width * 0.08
              ? 40
              : slot.side > 0 && defender.x < mid - width * 0.08
                ? 40
                : slot.side === 0
                  ? Math.abs(defender.x - mid) * 0.15
                  : 0;
          const dist = Math.hypot(defender.x - slot.x, (defender.y - slot.y) * 0.55) + sidePenalty;
          if (dist < bestScore) {
            bestScore = dist;
            best = { defender, slot };
          }
        }
      }
      if (!best) break;
      claim(best.defender, best.slot);
      freeUnder.splice(freeUnder.indexOf(best.slot), 1);
      const index = free.indexOf(best.defender);
      if (index >= 0) free.splice(index, 1);
    }
  };
  assignUnder(remaining("DB"));
  assignUnder(remaining().filter((defender) => defender.role !== "DB"));
  for (const defender of remaining("DB")) {
    let nearest: (typeof quarters)[number] | null = null;
    let nearestDist = 1e9;
    for (const slot of quarters) {
      const dist = Math.abs(defender.x - slot.x);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = slot;
      }
    }
    if (nearest) claim(defender, { job: "deep", ...nearest, rx: nearest.rx * 0.85 });
  }
  for (const defender of remaining().filter((player) => player.role !== "DB")) {
    defender.job = "blitz";
    const gap = signOr(defender.x - snap, 1);
    defender.jobX = clamp(snap + gap * (defender.role === "LB" ? 1.25 : 1.8), fl + 2.7, fr - 2.7);
    defender.jobY = los - 0.2 - rnd() * 0.5;
    defender.zoneRx = 1.2;
    defender.zoneRy = 1.2;
    defender.zoneFollow = false;
    defender.artCurve = defender.role !== "LB";
    defender.stutter = false;
    defender.readT = 0.12 + rnd() * 0.2;
    defender.isSafety = false;
    defender.isCorner = false;
    used.add(defender);
  }
  for (const defender of defs) {
    if (defender.role === "DB" && defender.isCorner && defender.job === "deep") {
      const inward = signOr(mid - defender.x, 1);
      defender.jobX = clamp((defender.jobX ?? defender.x) + inward * Math.min(2.8, width * 0.06), fl + 3, fr - 3);
      defender.artCurve = true;
    }
  }
  defs.forEach((defender, index) => {
    defender.laneOffset = (index - (defs.length - 1) / 2) * 1.7;
    defender.aggressor = defender.job === "blitz";
  });
  const ranked = defs.filter((defender) => defender.job === "blitz").sort((a, b) => a.y - b.y);
  for (const defender of ranked.slice(0, Math.min(3, ranked.length))) defender.aggressor = true;
}

function assignFire(ctx: FieldCtx) {
  const { defs, fl, fr, mid, los, rnd } = ctx;
  const width = fr - fl;
  const used = new Set<DefDraft>();
  const dbs = roleSorted(defs, "DB");
  if (dbs.length >= 2) {
    const left = dbs[0];
    const right = dbs[dbs.length - 1];
    if (left) {
      left.x = clamp(left.x + 5, fl + 2, mid - 2);
      left.y = Math.max(los + 2.5, left.y - 5);
    }
    if (right && right !== left) {
      right.x = clamp(right.x - 5, mid + 2, fr - 2);
      right.y = Math.max(los + 2.5, right.y - 5);
    }
  }
  const delays = [0, 0.35, 0.6, 0.95, 1.25, 0.75, 1.05];
  const blitz = (defender: DefDraft, jobX: number, jobY: number, delay: number, curve: boolean) => {
    defender.job = "blitz";
    defender.jobX = clamp(jobX, fl + 2.5, fr - 2.5);
    defender.jobY = jobY;
    defender.zoneRx = 1.2;
    defender.zoneRy = 1.2;
    defender.zoneFollow = false;
    defender.artCurve = curve;
    defender.stutter = curve;
    if (curve) {
      defender.stutterX = (defender.x + jobX) / 2 + (rnd() - 0.5) * 2;
      defender.stutterY = los + 1.2 + rnd();
    }
    defender.blitzDelay = delay;
    defender.readT = delay + 0.05;
    defender.aggressor = true;
    used.add(defender);
  };
  const zone = (defender: DefDraft, job: DefenseJob, x: number, y: number, rx: number, ry: number, follow: boolean) => {
    defender.job = job;
    defender.jobX = clamp(x, fl + 2.5, fr - 2.5);
    defender.jobY = y;
    defender.zoneRx = rx;
    defender.zoneRy = ry;
    defender.zoneFollow = follow || job === "drop";
    defender.artCurve = false;
    defender.stutter = false;
    defender.blitzDelay = 0;
    defender.readT = 0.3 + rnd() * 0.25;
    defender.isSafety = job === "deep";
    defender.aggressor = false;
    used.add(defender);
  };
  const pool = [...defs].sort((a, b) => a.x - b.x);
  const coverCount = Math.min(2, Math.max(1, Math.floor(pool.length * 0.2)));
  const cover = pool.filter((defender) => defender.role === "DB").slice(-coverCount);
  if (!cover.length && pool.length) {
    const last = pool[pool.length - 1];
    if (last) cover.push(last);
  }
  cover.forEach((defender, index) => {
    if (index === 0) zone(defender, "deep", mid, los + 14, width * 0.2, 5, false);
    else zone(defender, "flat", defender.x < mid ? fl + width * 0.2 : fr - width * 0.2, los + 4, width * 0.12, 1.6, false);
  });
  let delayIndex = 0;
  const rushers = defs.filter((defender) => !used.has(defender)).sort((a, b) => a.x - b.x);
  rushers.forEach((defender, index) => {
    const t = rushers.length <= 1 ? 0.5 : index / (rushers.length - 1);
    const gap = mid - width * 0.15 + t * width * 0.3;
    const delay = delays[delayIndex % delays.length] ?? 0;
    delayIndex += 1;
    blitz(defender, gap + (rnd() - 0.5) * 0.6, los - 0.3, delay, true);
  });
  const spy = dbs.length === 1 ? null : dbs[0];
  if (spy) {
    spy.job = "spy";
    spy.fakeBlitz = true;
    spy.artCurve = true;
    spy.stutter = true;
    spy.aggressor = false;
    spy.blitzDelay = 0;
    spy.readT = 0.42;
    spy.reactT = 0.48;
    spy.zoneFollow = false;
    spy.isSafety = false;
    spy.stutterX = spy.x + Math.min(2.2, Math.max(1.4, (mid - spy.x) * 0.22));
    spy.stutterY = spy.y - 1.1;
    spy.jobX = spy.x + Math.min(3.2, Math.max(2, (mid - spy.x) * 0.28));
    spy.jobY = spy.y + 2.1;
    spy.zoneRx = 1.55;
    spy.zoneRy = 1.45;
    used.add(spy);
  }
  laneOffsets(defs, 1.7);
}

function assignBear(ctx: FieldCtx) {
  const { defs, fl, fr, mid, los, rnd } = ctx;
  const width = fr - fl;
  const used = new Set<DefDraft>();
  const dts = roleSorted(defs, "DT");
  const lbs = roleSorted(defs, "LB");
  const dbs = roleSorted(defs, "DB");
  const zone = (defender: DefDraft, job: DefenseJob, x: number, y: number, rx: number, ry: number, follow: boolean) => {
    defender.job = job;
    defender.jobX = clamp(x, fl + 2.5, fr - 2.5);
    defender.jobY = y;
    defender.zoneRx = rx;
    defender.zoneRy = ry;
    defender.zoneFollow = follow || job === "drop";
    defender.artCurve = false;
    defender.stutter = false;
    defender.blitzDelay = 0;
    defender.readT = job === "deep" ? 0.4 + rnd() * 0.3 : 0.25 + rnd() * 0.2;
    defender.isSafety = job === "deep";
    defender.aggressor = false;
    used.add(defender);
  };
  const blitz = (defender: DefDraft, jobX: number) => {
    defender.job = "blitz";
    defender.jobX = clamp(jobX, fl + 2.5, fr - 2.5);
    defender.jobY = los - 0.25;
    defender.zoneRx = 1.2;
    defender.zoneRy = 1.2;
    defender.zoneFollow = false;
    defender.artCurve = false;
    defender.stutter = false;
    defender.blitzDelay = 0;
    defender.readT = 0.1 + rnd() * 0.12;
    defender.aggressor = true;
    used.add(defender);
  };
  const dt0 = dts[0];
  const dtLast = dts[dts.length - 1];
  if (dt0) zone(dt0, "flat", fl + width * 0.2, los + 4, width * 0.12, 1.7, false);
  if (dtLast && dtLast !== dt0) zone(dtLast, "curl", fr - width * 0.2, los + 4.5, width * 0.13, 1.9, false);
  for (const defender of dts) {
    if (!used.has(defender)) zone(defender, "drop", defender.x, los + 7.5, width * 0.1, 2.3, true);
  }
  const db0 = dbs[0];
  if (db0) zone(db0, "deep", dbs.length === 1 ? mid : fl + width * 0.32, los + 15, dbs.length === 1 ? width * 0.22 : width * 0.18, 5, false);
  const lb0 = lbs[0];
  const db1 = dbs[1];
  if (lb0) zone(lb0, "deep", fr - width * 0.32, los + 15, width * 0.18, 5, false);
  else if (db1) zone(db1, "deep", fr - width * 0.32, los + 15, width * 0.18, 5, false);
  const freeDb = dbs.find((defender) => !used.has(defender));
  if (freeDb) zone(freeDb, "drop", mid, los + 8.5, width * 0.11, 2.5, true);
  const extra = [...lbs, ...dbs].find((defender) => !used.has(defender));
  if (extra && rnd() < 0.85) zone(extra, "drop", mid + (rnd() - 0.5) * width * 0.1, los + 7.8, width * 0.1, 2.3, true);
  const gaps: number[] = [];
  const gapL = mid - width * 0.16;
  const gapR = mid + width * 0.16;
  for (let i = 0; i < 6; i++) gaps.push(gapL + (i / 5) * (gapR - gapL));
  let gapIndex = 0;
  for (const defender of defs.filter((player) => !used.has(player)).sort((a, b) => a.x - b.x)) {
    blitz(defender, gaps[gapIndex % gaps.length] ?? mid);
    gapIndex += 1;
  }
  laneOffsets(defs, 1.7);
}

function assignWalkUp(ctx: FieldCtx) {
  const { defs, fl, fr, mid, los, rnd, wide } = ctx;
  const width = fr - fl;
  const used = new Set<DefDraft>();
  const dbs = roleSorted(defs, "DB");
  const others = defs.filter((defender) => defender.role !== "DB").sort((a, b) => a.x - b.x);
  dbs.forEach((defender, index) => {
    const t = dbs.length <= 1 ? 0.5 : index / (dbs.length - 1);
    defender.x = clamp(mid + (t - 0.5) * width * (0.72 * (1 - wide * 0.42)), fl + 3, fr - 3);
    defender.y = los + 9.5 + Math.abs(t - 0.5) * 3.5 + rnd() * 0.6;
  });
  others.forEach((defender, index) => {
    const t = others.length <= 1 ? 0.5 : index / (others.length - 1);
    defender.x = clamp(mid + (t - 0.5) * width * 0.45, fl + 4, fr - 4);
    defender.y = defender.role === "DT" ? los + 3.2 + rnd() * 0.5 : los + 5.5 + Math.abs(t - 0.5) * 1.5 + rnd() * 0.4;
  });
  const zone = (defender: DefDraft, job: DefenseJob, x: number, y: number, rx: number, ry: number, follow: boolean) => {
    defender.job = job;
    defender.jobX = clamp(x, fl + 2.5, fr - 2.5);
    defender.jobY = y;
    defender.zoneRx = rx;
    defender.zoneRy = ry;
    defender.zoneFollow = follow || job === "drop";
    defender.artCurve = false;
    defender.stutter = false;
    defender.blitzDelay = 0;
    defender.readT = 0.25 + rnd() * 0.25;
    defender.isSafety = false;
    defender.aggressor = false;
    defender.fakeBlitz = true;
    defender.reactT = 0.55 + rnd() * 0.45;
    used.add(defender);
  };
  const blitz = (defender: DefDraft, jobX: number, delay: number, cross: boolean) => {
    defender.job = "blitz";
    defender.jobX = clamp(jobX, mid - width * 0.2, mid + width * 0.2);
    defender.jobY = los - 0.2 - rnd() * 0.3;
    defender.zoneRx = 1.2;
    defender.zoneRy = 1.2;
    defender.zoneFollow = false;
    defender.artCurve = true;
    defender.stutter = cross;
    if (cross) {
      defender.stutterX = mid + (defender.x < mid ? width * 0.08 : -width * 0.08);
      defender.stutterY = los + 1;
    }
    defender.blitzDelay = delay;
    defender.readT = delay + 0.06;
    defender.aggressor = true;
    defender.fakeBlitz = true;
    defender.reactT = 0.5 + rnd() * 0.55 + delay * 0.3;
    used.add(defender);
  };
  dbs.slice(0, 2).forEach((defender, index) => {
    zone(defender, "drop", mid + (index === 0 ? -width * 0.1 : width * 0.1), los + 10.5, width * 0.11, 2.4, true);
  });
  const free = [...dbs.filter((defender) => !used.has(defender)), ...others.filter((defender) => !used.has(defender))];
  const leftFlat = free.find((defender) => defender.x <= mid) ?? free[0];
  if (leftFlat) zone(leftFlat, "flat", mid - width * 0.28, los + 5.2, width * 0.12, 1.6, false);
  const rightFlat = free.find((defender) => !used.has(defender) && defender.x >= mid) ?? free.find((defender) => !used.has(defender));
  if (rightFlat) zone(rightFlat, "flat", mid + width * 0.28, los + 5.2, width * 0.12, 1.6, false);
  const delays = [0, 0.45, 0.75, 1.05, 0.6, 1.2, 0.3];
  const rush = defs.filter((defender) => !used.has(defender)).sort((a, b) => a.x - b.x);
  rush.forEach((defender, index) => {
    const t = rush.length <= 1 ? 0.5 : index / (rush.length - 1);
    blitz(defender, mid - width * 0.14 + t * width * 0.28, delays[index % delays.length] ?? 0, index % 3 === 1);
  });
  laneOffsets(defs, 1.5);
}

function assignDefenseJobs(ctx: FieldCtx, schemeId: string) {
  if (schemeId === "cover4Quarters") assignQuarters(ctx);
  else if (schemeId === "overloadBlitz") assignOverload(ctx);
  else if (schemeId === "prevent") assignPrevent(ctx);
  else if (schemeId === "wide") assignFire(ctx);
  else if (schemeId === "tight") assignBear(ctx);
  else if (schemeId === "goalLine") assignWalkUp(ctx);
}

function applyCellDefenseTweaks(
  ctx: FieldCtx,
  key: string,
  schemeId: string,
  offenseFlipped: boolean,
  defenseFlipped: boolean,
  facingFlipped: boolean,
) {
  const { defs, los, snap, fl, fr, mid, wide } = ctx;
  const width = fr - fl;
  const stiffen = () => {
    for (const defender of defs) {
      defender.readT = Math.min(defender.readT, 0.12);
      defender.reactT = Math.min(defender.reactT, 0.08);
      defender.fakeBlitz = false;
      defender.blitzDelay = Math.min(defender.blitzDelay, 0.08);
      if (defender.job !== "deep") {
        const capDepth = defender.role === "DT" ? 3.4 : defender.role === "LB" ? 5.2 : 8.5;
        defender.y = Math.max(los + 2.2, Math.min(defender.y, los + capDepth));
        if (defender.jobY != null) defender.jobY = Math.min(defender.jobY, los + (defender.job === "blitz" ? -0.15 : 7.2));
      }
      if (defender.job === "blitz" || defender.job === "man") defender.aggressor = true;
    }
  };
  if (schemeId === "tight" && key === "wedge" && !facingFlipped) stiffen();
  if (schemeId === "goalLine" && key === "wedge" && !facingFlipped) stiffen();
  if (schemeId === "tight" && key === "river" && defenseFlipped) stiffen();
  if (schemeId === "overloadBlitz" && key === "wedge" && defenseFlipped) {
    for (const defender of defs) {
      defender.x -= (defender.x - mid) * 0.28;
      if (defender.jobX != null) defender.jobX -= (defender.jobX - mid) * 0.22;
    }
  }
  if (schemeId === "wide" && key === "zigzag" && offenseFlipped) {
    for (const defender of defs) {
      if (defender.role !== "DB" || (defender.job !== "deep" && !defender.isSafety)) continue;
      defender.artCurve = false;
      defender.stutter = false;
      defender.fakeBlitz = false;
      defender.zoneFollow = false;
      defender.readT = Math.max(defender.readT, 0.35);
      defender.job = "deep";
      defender.jobX = defender.x;
      defender.jobY = Math.max(defender.y, los + 12);
      defender.isSafety = true;
    }
  }
  if (schemeId === "cover4Quarters" && key === "zigzag" && facingFlipped) {
    const stations = [0.14, 0.38, 0.62, 0.86];
    roleSorted(defs, "DB").forEach((defender, index) => {
      defender.x = fl + width * coverFrac(stations[Math.min(index, stations.length - 1)] ?? 0.5, wide);
      defender.artCurve = false;
      defender.stutter = false;
      if (defender.job === "deep") {
        defender.y = los + 11.5;
        defender.jobX = defender.x;
        defender.jobY = los + 14.2;
      } else {
        defender.y = clamp(defender.y, los + 3.6, los + 7.4);
        if (defender.jobX != null) defender.jobX = defender.x;
      }
    });
    const lbs = roleSorted(defs, "LB");
    lbs.forEach((defender, index) => {
      const t = lbs.length <= 1 ? 0 : index / (lbs.length - 1) - 0.5;
      defender.x = mid + t * width * 0.28;
      defender.y = los + 5.1;
      defender.artCurve = false;
    });
    const dts = roleSorted(defs, "DT");
    dts.forEach((defender, index) => {
      defender.x = snap + (index - (dts.length - 1) / 2) * 2.35;
      defender.y = los + 2.55;
    });
  }
  if (schemeId === "overloadBlitz" && key === "zigzag" && facingFlipped) {
    const capYard = los + 11;
    for (const defender of defs) {
      defender.x = mid + (defender.x - mid) * 0.52;
      defender.x = clamp(defender.x, snap - 13, snap + 11);
      defender.y = Math.min(defender.y, capYard);
      if (defender.jobY != null) defender.jobY = Math.min(defender.jobY, capYard);
      if (defender.stutter) defender.stutterY = Math.min(defender.stutterY, los + 2.6);
      defender.artCurve = false;
    }
    for (const defender of defs) {
      if (defender.job !== "blitz") continue;
      defender.y = clamp(defender.y, los + 2.2, los + 5.2);
      defender.jobY = los - 0.2;
      defender.stutter = false;
    }
    for (const defender of defs) {
      if (defender.job !== "deep") continue;
      defender.y = los + 9.6;
      defender.jobY = los + 10.5;
    }
  }
}

function limitDtPenetration(ctx: FieldCtx, schemeId: string) {
  const dts = ctx.defs.filter((defender) => defender.role === "DT");
  if (!dts.length) return;
  const allow = schemeId === "overloadBlitz" || schemeId === "wide" || schemeId === "tight" || schemeId === "goalLine" || schemeId === "stormBlitz";
  const already = dts.filter((defender) => defender.job === "blitz" && defender.jobY != null && defender.jobY < ctx.los + 0.45);
  let chosen: DefDraft | null = null;
  if (allow) {
    const pool = (already.length ? already : dts.slice()).slice();
    pool.sort((a, b) => ctx.side * (b.x - a.x));
    chosen = pool[0] ?? null;
  }
  for (const defender of dts) {
    defender.dtPenetrate = defender === chosen;
    if (defender.dtPenetrate) {
      defender.job = "blitz";
      defender.aggressor = true;
      defender.jobX = defender.jobX ?? defender.x;
      defender.jobY = clamp(defender.jobY ?? ctx.los - 0.35, ctx.los - 0.85, ctx.los - 0.12);
      defender.zoneRx = 1.2;
      defender.zoneRy = 1.2;
      defender.zoneFollow = false;
      if (defender.stutter) defender.stutterY = Math.max(defender.stutterY, ctx.los + 0.6);
    } else {
      defender.job = "shade";
      defender.aggressor = false;
      defender.artCurve = false;
      defender.stutter = false;
      defender.fakeBlitz = false;
      defender.jobX = defender.x;
      defender.jobY = ctx.los + 1.65 + (Math.abs(defender.x - ctx.snap) < 1.2 ? 0.25 : 0);
      defender.zoneRx = 1.6;
      defender.zoneRy = 1.15;
      defender.zoneFollow = false;
    }
  }
}

function sealBlocks(blocks: BlockDraft[], side: -1 | 1) {
  for (const blocker of blocks) {
    blocker.sealSide = blocker.driveSide === 0 ? side : blocker.driveSide;
  }
}

/**
 * Attach a snap assignment to every player from `placeEntitiesForNewPlay`.
 * When `defenseFlipped` is set, defender X on that roster is already mirrored.
 * Defense jobs are solved on the pre-mirror spots, then the landmarks are mirrored back.
 */
export function attachAssignments(
  setup: Pick<PlaySetup, "players" | "los" | "snapX" | "dbRoles">,
  call: {
    play: PlayCallInput;
    scheme: DefenseScheme;
    offenseFlipped?: boolean;
    defenseFlipped?: boolean;
    width?: number;
  },
): AssignedPlay {
  const width = call.width && call.width > 0 ? call.width : FIELD.width;
  const offenseFlipped = !!call.offenseFlipped;
  const defenseFlipped = !!call.defenseFlipped;
  const play = resolveCalledPlay(call.play, call.scheme.id, offenseFlipped, defenseFlipped);
  const facing = cellFacing(play, offenseFlipped, defenseFlipped);
  const key = playBookKey(play);
  const side = playSideSign(play, false);
  const counts = {
    dt: setup.players.filter((player) => player.role === "DT").length,
    lb: setup.players.filter((player) => player.role === "LB").length,
    db: setup.players.filter((player) => player.role === "DB").length,
    ol: setup.players.filter((player) => player.role === "OL").length,
    te: setup.players.filter((player) => player.role === "TE").length,
    fb: setup.players.filter((player) => player.role === "FB").length,
  };
  const rnd = mulberry32(
    hashSeed(
      [call.scheme.id, counts.dt, counts.lb, counts.db, counts.ol, counts.te, counts.fb, Math.round(setup.los), Math.round(width)].join("|"),
    ),
  );
  const defs: DefDraft[] = [];
  const blocks: BlockDraft[] = [];
  for (const player of setup.players) {
    if (player.team === "def") {
      const dbRole = player.role === "DB" ? (setup.dbRoles[player.id] ?? null) : null;
      defs.push({
        id: player.id,
        role: player.role,
        x: player.x,
        y: player.yard,
        job: "pursue",
        jobX: player.x,
        jobY: player.yard,
        zoneRx: 3.5,
        zoneRy: 2.2,
        zoneFollow: false,
        readT: 0,
        blitzDelay: 0,
        stutter: false,
        stutterX: player.x,
        stutterY: player.yard,
        artCurve: false,
        fakeBlitz: false,
        reactT: 0,
        isCorner: dbRole === "CB" || dbRole === "NCB",
        isSafety: dbRole === "FS" || dbRole === "SS" || dbRole === "DIME",
        aggressor: false,
        misfireT: 0,
        misfireId: null,
        laneOffset: 0,
        dtPenetrate: false,
        manId: null,
        dbRole,
      });
    } else if (player.role === "OL" || player.role === "TE" || player.role === "QB" || player.role === "FB") {
      blocks.push({
        id: player.id,
        role: player.role,
        x: player.x,
        y: player.yard,
        target: null,
        mode: "man",
        pullPhase: 0,
        pullVia: null,
        driveSide: 1,
        sealSide: side,
        levelY: 3,
        driveBlock: false,
        sturdyBlock: false,
        backsideSeal: false,
        pullBoost: 1,
        gapAimX: null,
        gapAimY: null,
      });
    }
  }
  const mid = width * 0.5;
  if (defenseFlipped) {
    for (const defender of defs) {
      defender.x = mirrorAround(defender.x, mid);
      defender.stutterX = mirrorAround(defender.stutterX, mid);
      defender.jobX = mirrorAround(defender.jobX ?? defender.x, mid);
    }
  }
  const field: FieldCtx = {
    los: setup.los,
    snap: setup.snapX,
    fl: 0,
    fr: width,
    mid,
    width,
    wide: fieldWideT(width),
    cap: FIELD.length + FIELD.endZone - BODY_INSET,
    rnd,
    defs,
    blocks,
    side,
  };
  assignDefenseJobs(field, call.scheme.id);
  if (defenseFlipped) {
    for (const defender of defs) {
      defender.x = mirrorAround(defender.x, mid);
      if (defender.jobX != null) defender.jobX = mirrorAround(defender.jobX, mid);
      defender.stutterX = mirrorAround(defender.stutterX, mid);
      defender.laneOffset = -defender.laneOffset;
    }
  }
  applyCellDefenseTweaks(field, key, call.scheme.id, offenseFlipped, defenseFlipped, facing === "flipped");
  limitDtPenetration(field, call.scheme.id);
  assignBlockJobs(field, play.blockStyle);
  applyCellBlockTweaks(field, key, call.scheme.id, offenseFlipped, facing === "stock");
  sealBlocks(blocks, side);

  const assignments = new Map<string, PlayAssignment>();
  for (const defender of defs) assignments.set(defender.id, toDefense(defender, setup.snapX));
  for (const blocker of blocks) assignments.set(blocker.id, toBlock(blocker, setup.snapX));
  const carrier =
    setup.players.find((player) => player.role === "HB" && player.controlled) ??
    setup.players.find((player) => player.role === "HB") ??
    null;
  if (carrier) assignments.set(carrier.id, routeOf(play));

  return {
    players: setup.players.map((player) => ({
      ...player,
      assignment: assignments.get(player.id) ?? pursue(),
    })),
    play,
    scheme: call.scheme,
    scriptIndex: 0,
    scriptTimer: 0,
    scriptLocked: !!play.lockFirst,
    snapX: setup.snapX,
    age: 0,
    snapped: false,
    replay: { frames: [], since: 0 },
  };
}
