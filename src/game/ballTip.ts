import type { Object3D } from "three";
import { FOOTBALL_RADIUS } from "./PlayerFigure";

/**
 * Furthest-downfield point on the carried football.
 * Downfield is +yard, which is world −Z. The leather is an ellipsoid:
 * the named `football-body` group scales a sphere of `FOOTBALL_RADIUS`.
 */
export function footballLeadingTip(root: Object3D): { x: number; yard: number } | null {
  const ball = root.getObjectByName("football-body");
  if (!ball) return null;
  ball.updateWorldMatrix(true, false);
  const e = ball.matrixWorld.elements;
  // Support direction (0, 0, −1). A^T * d uses the world-matrix columns.
  const lx = -e[2]!;
  const ly = -e[6]!;
  const lz = -e[10]!;
  const len = Math.hypot(lx, ly, lz);
  if (len < 1e-8) return null;
  const px = (FOOTBALL_RADIUS * lx) / len;
  const py = (FOOTBALL_RADIUS * ly) / len;
  const pz = (FOOTBALL_RADIUS * lz) / len;
  const wx = e[12]! + e[0]! * px + e[4]! * py + e[8]! * pz;
  const wz = e[14]! + e[2]! * px + e[6]! * py + e[10]! * pz;
  return { x: wx, yard: -wz };
}
