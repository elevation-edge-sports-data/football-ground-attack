import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { worldFromField } from "./frame";
import { collectTrail, type RunnerTrail } from "./runnerTrail";

/**
 * WebGLRenderer draws `min(instanceCount, _maxInstanceCount)` and writes
 * `_maxInstanceCount` once, on the first bind, from that frame's buffer.
 * A trail that first appears as one short segment would keep drawing only
 * that stub. Raise the cap whenever the polyline grows.
 */
type TrailGeometry = LineGeometry & { _maxInstanceCount?: number };

function unlockSegments(geometry: TrailGeometry) {
  const segments = geometry.instanceCount;
  if (!Number.isFinite(segments)) return;
  const cap = geometry._maxInstanceCount;
  geometry._maxInstanceCount = cap !== undefined && Number.isFinite(cap) ? Math.max(cap, segments) : segments;
}

/** Just above the LOS bar (center 0.072, height 0.035) so the path stays continuous. */
const TRAIL_Y = 0.09;
/** `scratch` holds 610 points: 600 samples plus the live tip. */
const MAX_SEGMENTS = 609;
const drawPoints: { x: number; yard: number }[] = [];
const scratch = new Float32Array(610 * 3);
let painted = "";

/**
 * Screen-pixel width matches `strokeTrailWorld` (lineWidth 2.6, round caps).
 * A world-unit Line thins out under the overview camera.
 */
export function createTrailLine(): Line2 {
  const material = new LineMaterial({
    color: "#780C12",
    linewidth: 2.6,
    worldUnits: false,
    transparent: true,
    opacity: 0.88,
    toneMapped: false,
    depthWrite: false,
    premultipliedAlpha: false,
  });
  const geometry = new LineGeometry() as TrailGeometry;
  // Set before the first bind so a one-segment opening frame cannot freeze the draw.
  geometry._maxInstanceCount = MAX_SEGMENTS;
  const line = new Line2(geometry, material);
  line.visible = false;
  line.frustumCulled = false;
  line.renderOrder = 2;
  return line;
}

/** Rewrite the polyline. `clipAge` null is the live play; a number is the replay scrub. */
export function syncTrailLine(
  line: Line2,
  trail: RunnerTrail,
  clipAge: number | null,
  tip: { x: number; yard: number } | null,
) {
  const count = collectTrail(trail, clipAge, tip, drawPoints);
  if (count < 2) {
    line.visible = false;
    painted = "";
    return;
  }
  const first = drawPoints[0]!;
  const last = drawPoints[count - 1]!;
  const sig = `${count}|${first.x}|${first.yard}|${last.x}|${last.yard}|${clipAge ?? ""}`;
  if (line.visible && sig === painted) return;
  let n = 0;
  for (let i = 0; i < count; i++) {
    const point = drawPoints[i]!;
    const [x, y, z] = worldFromField(point.x, point.yard, TRAIL_Y);
    scratch[n++] = x;
    scratch[n++] = y;
    scratch[n++] = z;
  }
  const geometry = line.geometry as TrailGeometry;
  geometry.setPositions(scratch.subarray(0, n));
  unlockSegments(geometry);
  line.visible = true;
  painted = sig;
}
