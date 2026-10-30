import { BufferGeometry, Color, Float32BufferAttribute } from "three";
import {
  FIELD,
  NORTH_BACK,
  SOUTH_BACK,
  hashHalf,
  hashLeft,
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

function stripeColor(yard: number) {
  const light = Math.floor((yard + 1000) / 5) % 2 === 0;
  return new Color(light ? FIELD.grassLight : FIELD.grassDark);
}

/** Playing surface: 5-yard grass stripes and solid end zones. */
export function buildTurfGeometry() {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const navy = new Color(FIELD.endPrimary);
  const orange = new Color(FIELD.endSecondary);
  const width = FIELD.width;

  pushQuad(positions, colors, indices, 0, -SOUTH_BACK, width, 0, 0, navy);
  pushQuad(positions, colors, indices, 0, -(SOUTH_BACK + 1.2), width, -SOUTH_BACK, 0.006, orange);

  for (let yard = 0; yard < FIELD.length; yard += 5) {
    pushQuad(positions, colors, indices, 0, -yard, width, -(yard + 5), 0, stripeColor(yard));
  }

  pushQuad(positions, colors, indices, 0, -FIELD.length, width, -NORTH_BACK, 0, navy);
  pushQuad(positions, colors, indices, 0, -(NORTH_BACK - 1.2), width, -NORTH_BACK, 0.006, orange);

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
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
  const inner = hashHalf() * 0.16;

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
