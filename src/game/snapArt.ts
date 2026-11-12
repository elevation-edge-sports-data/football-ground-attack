import { FIELD, clamp } from "../field/spec";
import { readAttackNorth } from "./sim/attack";
import type { AssignedPlay } from "./sim/assign";
import type { BlockAssignment, DefenseAssignment, DefenseJob, RouteStep } from "./sim/types";

/**
 * On-field play art from v10 `drawPlayArt` / `drawRouteArrow`.
 *
 * Game holds: defense arrows 0.32–0.38s then fade 0.16s,
 * offense blocks 0.58–0.64s then fade 0.16s,
 * zone ovals 0.48s then fade 0.52s.
 * Practice uses the longer holds in the same functions.
 * After that every alpha is 0 and the marks are hidden.
 *
 * Route samples are the canvas diagram scale (8.4 lateral, 6.6 north),
 * not the carrier's live path.
 */
const STEP_X = 8.4;
const STEP_Y = 6.6;
const ZONE_JOBS = new Set<DefenseJob>(["deep", "drop", "flat", "curl", "hook", "robber", "contain", "shade"]);

export const ART_Y = 0.12;

export type ArtFade = "off" | "def" | "zone";

export type FieldPoint = { x: number; yard: number };

export type ArtStroke = {
  fade: ArtFade;
  color: string;
  width: number;
  gain: number;
  points: FieldPoint[];
  dashed?: boolean;
};

export type ArtHead = {
  fade: ArtFade;
  color: string;
  gain: number;
  tip: FieldPoint;
  left: FieldPoint;
  right: FieldPoint;
};

export type ArtZone = {
  x: number;
  yard: number;
  rx: number;
  ry: number;
  color: string;
  /** Fill opacity is `zoneArtAlpha * gain`. The outline is stronger. */
  gain: number;
};

export type SnapArt = {
  strokes: ArtStroke[];
  heads: ArtHead[];
  zones: ArtZone[];
};

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

/** Canvas `artAlpha`. `along` is 0 at the tail and 1 at the head. */
export function defenseArtAlpha(age: number, along: number, practice = false) {
  const hold = (practice ? 0.42 : 0.32) + clamp01(along) * 0.06;
  const fadeDur = practice ? 0.28 : 0.16;
  const t = age - hold;
  if (t <= 0) return 0.82;
  return Math.max(0, 0.82 * (1 - t / fadeDur));
}

/** Canvas `artAlphaOff`. Offense block marks linger a little longer than the defense. */
export function offenseArtAlpha(age: number, along: number, practice = false) {
  const hold = (practice ? 0.68 : 0.58) + clamp01(along) * 0.06;
  const fadeDur = practice ? 0.28 : 0.16;
  const t = age - hold;
  if (t <= 0) return 0.82;
  return Math.max(0, 0.82 * (1 - t / fadeDur));
}

/** Canvas `zoneAlpha`. */
export function zoneArtAlpha(age: number, practice = false) {
  const hold = practice ? 0.7 : 0.48;
  const fadeDur = 0.52;
  const t = age - hold;
  if (t <= 0) return 0.62;
  return Math.max(0, 0.62 * (1 - t / fadeDur));
}

/** True once every game-mode mark has finished fading. */
export function playArtGone(age: number, practice = false) {
  return (
    offenseArtAlpha(age, 1, practice) <= 0.02 &&
    defenseArtAlpha(age, 1, practice) <= 0.02 &&
    zoneArtAlpha(age, practice) <= 0.02
  );
}

export function defenseArtColor(job: DefenseJob) {
  switch (job) {
    case "blitz":
      return "#ef4444";
    case "spy":
      return "#f97316";
    case "contain":
    case "shade":
      return "#38bdf8";
    case "curl":
      return "#67e8f9";
    case "hook":
    case "robber":
      return "#c4b5fd";
    case "deep":
      return "#a78bfa";
    case "drop":
      return "#facc15";
    case "flat":
      return "#7dd3fc";
    default:
      return "#f8fafc";
  }
}

function shortAim(fromX: number, fromY: number, tx: number, ty: number, maxDist: number): FieldPoint {
  const dx = tx - fromX;
  const dy = ty - fromY;
  const len = Math.hypot(dx, dy) || 1;
  const scale = Math.min(1, maxDist / len);
  return { x: fromX + dx * scale, yard: fromY + dy * scale };
}

function quad(a: FieldPoint, c: FieldPoint, b: FieldPoint, steps = 8): FieldPoint[] {
  const points: FieldPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    points.push({
      x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
      yard: u * u * a.yard + 2 * u * t * c.yard + t * t * b.yard,
    });
  }
  return points;
}

function headOf(points: readonly FieldPoint[], size: number): Pick<ArtHead, "tip" | "left" | "right"> | null {
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  if (!last || !prev) return null;
  const ang = Math.atan2(last.yard - prev.yard, last.x - prev.x);
  if (!Number.isFinite(ang)) return null;
  return {
    tip: last,
    left: { x: last.x - Math.cos(ang - 0.4) * size, yard: last.yard - Math.sin(ang - 0.4) * size },
    right: { x: last.x - Math.cos(ang + 0.4) * size, yard: last.yard - Math.sin(ang + 0.4) * size },
  };
}

function pushHead(art: SnapArt, points: readonly FieldPoint[], fade: ArtFade, color: string, gain: number, size: number) {
  const head = headOf(points, size);
  if (!head) return;
  art.heads.push({ fade, color, gain, ...head });
}

function routePoints(origin: FieldPoint, steps: readonly RouteStep[]): FieldPoint[] {
  const points = [{ ...origin }];
  let x = origin.x;
  let yard = origin.yard;
  for (const step of steps) {
    x += (step.dx || 0) * STEP_X;
    yard += (step.dy || 0) * STEP_Y * (readAttackNorth() ? 1 : -1);
    points.push({ x, yard });
  }
  return points;
}

function diagramPoints(origin: FieldPoint, steps: readonly RouteStep[], arrow: readonly number[]): FieldPoint[] {
  if (steps.length) return routePoints(origin, steps);
  if (arrow.length) {
    const points = [{ ...origin }];
    let x = origin.x;
    let yard = origin.yard;
    for (const dx of arrow) {
      x += dx * 6;
      yard += readAttackNorth() ? 5 : -5;
      points.push({ x, yard });
    }
    return points;
  }
  return [origin, { x: origin.x, yard: origin.yard + (readAttackNorth() ? 7 : -7) }];
}

function blockPoints(playerX: number, playerY: number, block: BlockAssignment, target: { x: number; yard: number } | null, los: number): FieldPoint[] {
  const segs: FieldPoint[] = [];
  if (block.mode === "pull" && block.pullVia) {
    segs.push(shortAim(playerX, playerY, block.pullVia.x, block.pullVia.y, 2.4));
    segs.push(shortAim(playerX, playerY, block.pullVia.x2, block.pullVia.y2, 3.6));
  } else if (target) {
    const maxDist = block.mode === "climb" ? 3.4 : 2.8;
    segs.push(shortAim(playerX, playerY, target.x + block.driveSide * 0.35, target.yard, maxDist));
  } else if (block.gapAimX != null && block.gapAimY != null) {
    segs.push(shortAim(playerX, playerY, block.gapAimX, block.gapAimY, 3.2));
  }
  if (!segs.length) {
    const depth = Math.min(3.2, block.levelY || 2.5);
    segs.push(shortAim(playerX, playerY, playerX + block.driveSide * 1.2, los + depth * (readAttackNorth() ? 1 : -1), 2.6));
  }
  return [{ x: playerX, yard: playerY }, ...segs];
}

function blockCap(points: readonly FieldPoint[]): FieldPoint[] | null {
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  if (!last || !prev) return null;
  const ang = Math.atan2(last.yard - prev.yard, last.x - prev.x);
  const cap = 0.85;
  return [
    { x: last.x + Math.cos(ang + Math.PI / 2) * cap, yard: last.yard + Math.sin(ang + Math.PI / 2) * cap },
    { x: last.x + Math.cos(ang - Math.PI / 2) * cap, yard: last.yard + Math.sin(ang - Math.PI / 2) * cap },
  ];
}

function defenseMark(art: SnapArt, playerX: number, playerY: number, job: DefenseAssignment) {
  const color = defenseArtColor(job.job);
  const tx = clamp(job.x, 2.6, FIELD.width - 2.6);
  const ty = job.yard;
  const from = { x: playerX, yard: playerY };
  const to = { x: tx, yard: ty };
  if (job.job === "spy") {
    art.zones.push({ x: tx, yard: ty, rx: job.zoneRx || 1.55, ry: job.zoneRy || 1.45, color, gain: 0.42 });
    const mid = {
      x: job.stutter ? job.stutterX : (playerX + tx) / 2,
      yard: job.stutter ? job.stutterYard : (playerY + ty) / 2,
    };
    const curve = quad(from, mid, to);
    art.strokes.push({ fade: "def", color, width: 2.3, gain: 0.92, points: curve });
    pushHead(art, curve, "def", color, 0.92, 0.42);
    return;
  }
  if (ZONE_JOBS.has(job.job)) {
    art.zones.push({ x: tx, yard: ty, rx: job.zoneRx || 4, ry: job.zoneRy || 2.4, color, gain: 0.3 });
    art.strokes.push({ fade: "def", color, width: 2.2, gain: 0.7, points: [from, to] });
    return;
  }
  if (job.job === "blitz" && (job.artCurve || job.stutter)) {
    const midField = FIELD.width / 2;
    const inward = tx > midField ? -1.35 : 1.35;
    const mid = {
      x: clamp(job.stutter ? job.stutterX : (playerX + tx) / 2 + inward, 3.2, FIELD.width - 3.2),
      yard: job.stutter ? job.stutterYard : (playerY + ty) / 2,
    };
    const curve = quad(from, mid, to);
    art.strokes.push({ fade: "def", color, width: 2.3, gain: 0.92, points: curve });
    pushHead(art, curve, "def", color, 0.92, 0.42);
    return;
  }
  const line = [from, to];
  art.strokes.push({ fade: "def", color, width: 2.2, gain: 0.92, points: line });
  pushHead(art, line, "def", color, 0.92, 0.42);
}

/** Snap diagram for both teams. Reads the playbook assignments. Does not move anyone. */
export function buildSnapArt(play: AssignedPlay, los: number): SnapArt {
  const art: SnapArt = { strokes: [], heads: [], zones: [] };
  const byId = new Map(play.players.map((player) => [player.id, player]));
  for (const player of play.players) {
    const assignment = player.assignment;
    if (assignment.kind === "block") {
      const target = assignment.targetId ? byId.get(assignment.targetId) : undefined;
      const points = blockPoints(player.x, player.yard, assignment, target ? { x: target.x, yard: target.yard } : null, los);
      art.strokes.push({ fade: "off", color: "#d2d6d0", width: 2.1, gain: 0.9, points });
      const cap = blockCap(points);
      if (cap) art.strokes.push({ fade: "off", color: "#d2d6d0", width: 2.1, gain: 0.9, points: cap });
    } else if (assignment.kind === "defense") {
      defenseMark(art, player.x, player.yard, assignment);
    }
  }
  const carrier = play.players.find((player) => player.controlled) ?? play.players.find((player) => player.assignment.kind === "route");
  if (carrier) {
    const origin = { x: carrier.x, yard: carrier.yard };
    const main = diagramPoints(origin, play.play.steps, play.play.arrow);
    if (main.length >= 2) {
      art.strokes.push({ fade: "def", color: "#FBBF24", width: 3.2, gain: 0.9, points: main });
      pushHead(art, main, "def", "#FBBF24", 0.9, 0.5);
    }
    if (play.play.altSteps && play.play.altSteps.length) {
      const alt = routePoints(origin, play.play.altSteps);
      art.strokes.push({ fade: "def", color: "#FBBF24", width: 2.4, gain: 0.7, points: alt, dashed: true });
      pushHead(art, alt, "def", "#FBBF24", 0.7, 0.5);
    }
  }
  return art;
}

export type PracticeDot = {
  team: "off" | "def";
  x: number;
  yard: number;
  color: string;
  r: number;
};

/** Frozen copy of one snap's diagram. Later movement does not change it. */
export type PlayDiagram = {
  los: number;
  snapX: number;
  art: SnapArt;
  dots: PracticeDot[];
};

/** Playbook card art. Copies coordinates so the live roster can move afterward. */
export function playDiagram(play: AssignedPlay, los: number, snapX: number): PlayDiagram {
  return {
    los,
    snapX,
    art: buildSnapArt(play, los),
    dots: play.players.map((player) => {
      if (player.team === "def") {
        const job = player.assignment.kind === "defense" ? player.assignment.job : null;
        return {
          team: "def" as const,
          x: player.x,
          yard: player.yard,
          color: job ? defenseArtColor(job) : "#e2e8f0",
          r: player.role === "DT" ? 4.2 : 3.3,
        };
      }
      const color = player.controlled
        ? "#fb4f14"
        : player.role === "OL"
          ? "#94a3b8"
          : player.role === "FB"
            ? "#fbbf24"
            : player.role === "TE"
              ? "#34d399"
              : "#cbd5e1";
      return {
        team: "off" as const,
        x: player.x,
        yard: player.yard,
        color,
        r: player.controlled ? 4.5 : 3.3,
      };
    }),
  };
}
