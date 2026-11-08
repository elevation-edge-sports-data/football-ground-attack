import { Vector3, type Mesh, type Object3D } from "three";
import { FIELD } from "../field/spec";

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

/**
 * True when a corner of the runner's body is touching the ground on or
 * outside a white sideline. The apron past x = 0 and x = width is out.
 * The line itself is out. The ball and the ground ring are not the body.
 */
export function runnerTouchesSideline(root: Object3D, width = FIELD.width): boolean {
  root.updateWorldMatrix(true, true);
  let out = false;
  root.traverse((obj) => {
    if (out) return;
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
          if (_point.x <= 0 || _point.x >= width) {
            out = true;
            return;
          }
        }
      }
    }
  });
  return out;
}
