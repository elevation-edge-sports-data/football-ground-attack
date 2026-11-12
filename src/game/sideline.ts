import { Vector3, type Mesh, type Object3D } from "three";
import { FIELD, NORTH_BACK, SOUTH_BACK } from "../field/spec";
import { readAttackNorth } from "./sim/attack";

/**
 * A body corner at or below this height is on the ground.
 * Carry soles sit on the turf. A hurdle lifts the same soles well above it.
 */
export const GROUND_CONTACT_Y = 0.08;

const _point = new Vector3();

function namedAncestor(obj: Object3D, name: string) {
  let node: Object3D | null = obj;
  while (node) {
    if (node.name === name) return true;
    node = node.parent;
  }
  return false;
}

export type RunnerBounds = {
  /** Grounded body on or outside a white sideline. */
  sideline: boolean;
  /** Grounded body on or past the back of the offense's end zone. */
  ownBack: boolean;
  /** Sideline contact beside the offense's end zone, not past the end line. */
  ownEndSideline: boolean;
};

/**
 * Sideline and own-end-line touches for the controlled runner.
 * A corner at or below ground height counts. The line itself is out.
 * The ball and the ground ring are not the body. World Z is −yard, so the
 * south end line (the back of the offense's end zone) is yard `SOUTH_BACK`.
 */
export function runnerBounds(root: Object3D, width = FIELD.width): RunnerBounds {
  root.updateWorldMatrix(true, true);
  const bounds: RunnerBounds = { sideline: false, ownBack: false, ownEndSideline: false };
  root.traverse((obj) => {
    if (bounds.sideline && bounds.ownBack && bounds.ownEndSideline) return;
    const mesh = obj as Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (mesh.name === "player-ring" || namedAncestor(mesh, "football")) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    if (!box) return;
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          _point.set(x, y, z).applyMatrix4(mesh.matrixWorld);
          if (_point.y > GROUND_CONTACT_Y) continue;
          const yard = -_point.z;
          const ownBack = readAttackNorth() ? yard <= SOUTH_BACK : yard >= NORTH_BACK;
          const inOwnEnd = readAttackNorth()
            ? yard < 0 && yard > SOUTH_BACK
            : yard > FIELD.length && yard < NORTH_BACK;
          if (_point.x <= 0 || _point.x >= width) {
            bounds.sideline = true;
            if (inOwnEnd) bounds.ownEndSideline = true;
          }
          if (ownBack) bounds.ownBack = true;
          if (bounds.sideline && bounds.ownBack && bounds.ownEndSideline) return;
        }
      }
    }
  });
  return bounds;
}

/** True when a grounded body corner is on or outside a white sideline. */
export function runnerTouchesSideline(root: Object3D, width = FIELD.width): boolean {
  return runnerBounds(root, width).sideline;
}
