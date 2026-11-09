import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  RepeatWrapping,
  SRGBColorSpace,
  Shape,
  ShapeGeometry,
} from "three";
import type { SurfaceId } from "../game/fieldLook";
import {
  FIELD,
  NORTH_BACK,
  SOUTH_BACK,
  hashLeft,
  hashReach,
  hashRight,
} from "./spec";

const MARK_Y = 0.03;

function pushQuad(
  positions: number[],
  colors: number[],
  indices: number[],
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y: number,
  color: Color,
) {
  const xa = Math.min(x0, x1);
  const xb = Math.max(x0, x1);
  const za = Math.min(z0, z1);
  const zb = Math.max(z0, z1);
  const i = positions.length / 3;
  // CCW from above: +Z then +X, so the geometric normal is +Y.
  positions.push(xa, y, za, xa, y, zb, xb, y, zb, xb, y, za);
  indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
  for (let n = 0; n < 4; n++) colors.push(color.r, color.g, color.b);
}

/** v10 `stripeFill`. Even 5-yard bands are the lighter stripe, including both end zones. */
const STRIPES: Record<SurfaceId, { light: string; dark: string }> = {
  grass: { light: "#5d8f4a", dark: "#4e7d3e" },
  astroturf: { light: "#32b056", dark: "#228a42" },
  fieldturf: { light: "#1f5230", dark: "#143820" },
};

function stripeColor(surface: SurfaceId, yard: number) {
  const light = Math.floor((yard + 1000) / 5) % 2 === 0;
  const pair = STRIPES[surface];
  return new Color(light ? pair.light : pair.dark);
}

/**
 * Playing surface plus both end zones, in 5-yard stripes.
 * End-zone art is a separate mesh. Off leaves these stripes as the end zone.
 */
export function buildTurfGeometry(surface: SurfaceId) {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const width = FIELD.width;

  for (let yard = SOUTH_BACK; yard < NORTH_BACK; yard += 5) {
    pushQuad(positions, colors, indices, 0, -yard, width, -(yard + 5), 0, stripeColor(surface, yard));
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** v10 `hash2`, used by the grass and field-turf grain. */
function hash2(ix: number, iy: number) {
  let n = Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** How many yards one pattern tile covers. The canvas tile is 64px. */
export const PATTERN_TILE_YARDS = 1;

/** v10 `getTurfPattern` alphas: grass 0.2, astroturf 0.28, field turf 0.32. */
export function surfacePatternOpacity(surface: SurfaceId) {
  if (surface === "astroturf") return 0.28;
  if (surface === "grass") return 0.2;
  return 0.32;
}

/** Repeating grain from v10 `getTurfPattern`. Drawn over the stripes, not instead of them. */
export function buildSurfacePattern(surface: SurfaceId) {
  const tile = document.createElement("canvas");
  tile.width = 64;
  tile.height = 64;
  const t = tile.getContext("2d");
  if (!t) throw new Error("Missing 2D context");
  if (surface === "grass") {
    t.fillStyle = "#466f38";
    t.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 220; i++) {
      const x = hash2(i, 3) * 64;
      const y = hash2(i, 9) * 64;
      t.fillStyle = hash2(i, 17) > 0.55 ? "#6a9a56" : "#35582c";
      t.globalAlpha = 0.45 + hash2(i, 21) * 0.5;
      t.fillRect(x, y, 1.2 + hash2(i, 5), 2.4 + hash2(i, 7) * 2.2);
    }
    t.globalAlpha = 1;
  } else if (surface === "astroturf") {
    t.fillStyle = "#2b9348";
    t.fillRect(0, 0, 64, 64);
    t.strokeStyle = "rgba(18, 70, 32, 0.55)";
    t.lineWidth = 1;
    for (let x = 0; x <= 64; x += 3) {
      t.beginPath();
      t.moveTo(x + 0.5, 0);
      t.lineTo(x + 0.5, 64);
      t.stroke();
    }
    t.strokeStyle = "rgba(12, 55, 26, 0.4)";
    for (let y = 0; y <= 64; y += 3) {
      t.beginPath();
      t.moveTo(0, y + 0.5);
      t.lineTo(64, y + 0.5);
      t.stroke();
    }
    t.fillStyle = "rgba(180, 230, 160, 0.18)";
    t.fillRect(0, 0, 64, 64);
  } else {
    t.fillStyle = "#163d24";
    t.fillRect(0, 0, 64, 64);
    t.fillStyle = "#0a0a0a";
    for (let i = 0; i < 160; i++) {
      const x = hash2(i + 40, 5) * 64;
      const y = hash2(i + 40, 11) * 64;
      const r = 0.5 + hash2(i, 19) * 1.2;
      t.globalAlpha = 0.5 + hash2(i, 23) * 0.45;
      t.beginPath();
      t.arc(x, y, r, 0, Math.PI * 2);
      t.fill();
    }
    t.globalAlpha = 1;
  }
  const map = new CanvasTexture(tile);
  map.colorSpace = SRGBColorSpace;
  map.wrapS = RepeatWrapping;
  map.wrapT = RepeatWrapping;
  map.anisotropy = 8;
  return map;
}

/** v10 mountain silhouette. X and height are fractions of the end zone. The base is the goal line. */
const MOUNTAIN_PEAKS: [number, number][] = [
  [0, 0],
  [0.06, 0.12],
  [0.14, 0.58],
  [0.22, 0.1],
  [0.36, 0.92],
  [0.48, 0.08],
  [0.6, 0.54],
  [0.72, 0.12],
  [0.84, 0.64],
  [0.94, 0.14],
  [1, 0],
];

/**
 * Secondary-color mountain fill for one end.
 * Shape Y grows toward the back of that end, then lies down so the normal is +Y.
 */
export function buildMountainGeometry(end: "south" | "north") {
  const sign = end === "south" ? -1 : 1;
  const pts = MOUNTAIN_PEAKS.map(([x, h]) => [x * FIELD.width, sign * h * FIELD.endZone] as const);
  const shape = new Shape();
  // North peaks sit at +Y, so the left-to-right peak order is clockwise and is reversed.
  // South negates Y, which flips that winding back to counter-clockwise. +Z then becomes +Y.
  if (sign > 0) {
    shape.moveTo(pts[0][0], pts[0][1]);
    shape.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    for (let i = pts.length - 2; i >= 1; i--) shape.lineTo(pts[i][0], pts[i][1]);
  } else {
    shape.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  }
  shape.closePath();
  const geometry = new ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0.02, end === "south" ? 0 : -FIELD.length);
  geometry.computeVertexNormals();
  return geometry;
}

const DIAMOND_Y = 0.014;

function pushDiamond(
  positions: number[],
  colors: number[],
  indices: number[],
  xLeft: number,
  xRight: number,
  zGoal: number,
  zBack: number,
  color: Color,
) {
  const cx = (xLeft + xRight) / 2;
  const zMid = (zGoal + zBack) / 2;
  const y = DIAMOND_Y;
  const i = positions.length / 3;
  // A goal, B right, C back, D left.
  // South (z grows toward the back) is counter-clockwise as A-D-C. North is A-B-C.
  positions.push(cx, y, zGoal, xRight, y, zMid, cx, y, zBack, xLeft, y, zMid);
  for (let n = 0; n < 4; n++) colors.push(color.r, color.g, color.b);
  if (zBack > zGoal) indices.push(i, i + 3, i + 2, i, i + 2, i + 1);
  else indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
}

/** Eight diamonds per end. Even cells are the home primary, odd cells the secondary. v10 `n = 8`. */
export function buildDiamondGeometry(primary: string, secondary: string) {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const pri = new Color(primary);
  const sec = new Color(secondary);
  const n = 8;
  const w = FIELD.width / n;
  const ends: [number, number][] = [
    [0, FIELD.endZone],
    [-FIELD.length, -NORTH_BACK],
  ];
  for (const [zGoal, zBack] of ends) {
    for (let i = 0; i < n; i++) {
      pushDiamond(positions, colors, indices, i * w, (i + 1) * w, zGoal, zBack, i % 2 === 0 ? pri : sec);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** White diamond outline. v10 strokes the same four edges. */
export function buildDiamondEdges() {
  const out: number[] = [];
  const n = 8;
  const w = FIELD.width / n;
  const y = 0.018;
  const ends: [number, number][] = [
    [0, FIELD.endZone],
    [-FIELD.length, -NORTH_BACK],
  ];
  for (const [zGoal, zBack] of ends) {
    const zMid = (zGoal + zBack) / 2;
    for (let i = 0; i < n; i++) {
      const xLeft = i * w;
      const xRight = (i + 1) * w;
      const cx = (xLeft + xRight) / 2;
      const pts: [number, number][] = [
        [cx, zGoal],
        [xRight, zMid],
        [cx, zBack],
        [xLeft, zMid],
      ];
      for (let e = 0; e < 4; e++) {
        const a = pts[e]!;
        const b = pts[(e + 1) % 4]!;
        out.push(a[0], y, a[1], b[0], y, b[1]);
      }
    }
  }
  return new Float32Array(out);
}

function pushSeg(out: number[], x0: number, yard0: number, x1: number, yard1: number) {
  out.push(x0, MARK_Y, -yard0, x1, MARK_Y, -yard1);
}

export type FieldMarkings = {
  minor: Float32Array;
  major: Float32Array;
  boundary: Float32Array;
};

/** Screen-space strokes: 5-yard lines and hashes, 10-yard lines and borders, the 20–80 sideline. */
export function buildMarkings(): FieldMarkings {
  const minor: number[] = [];
  const major: number[] = [];
  const boundary: number[] = [];
  const width = FIELD.width;
  const left = hashLeft();
  const right = hashRight();
  const inner = hashReach();

  for (let yard = 0; yard <= FIELD.length; yard += 5) {
    const bucket = yard % 10 === 0 ? major : minor;
    pushSeg(bucket, 0, yard, width, yard);
  }
  pushSeg(major, 0, SOUTH_BACK, width, SOUTH_BACK);
  pushSeg(major, 0, NORTH_BACK, width, NORTH_BACK);
  pushSeg(major, 0, SOUTH_BACK, 0, NORTH_BACK);
  pushSeg(major, width, SOUTH_BACK, width, NORTH_BACK);
  pushSeg(boundary, 0, 20, 0, 80);
  pushSeg(boundary, width, 20, width, 80);

  for (let decade = 0; decade < FIELD.length; decade += 10) {
    for (const off of [1, 2, 3, 4, 6, 7, 8, 9]) {
      const yard = decade + off;
      pushSeg(minor, 0, yard, 0.85, yard);
      pushSeg(minor, width, yard, width - 0.85, yard);
      pushSeg(minor, left, yard, left - inner, yard);
      pushSeg(minor, right, yard, right + inner, yard);
    }
  }

  return {
    minor: new Float32Array(minor),
    major: new Float32Array(major),
    boundary: new Float32Array(boundary),
  };
}
