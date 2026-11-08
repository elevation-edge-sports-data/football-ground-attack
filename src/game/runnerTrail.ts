import { FIELD } from "../field/spec";

/**
 * Ball-carrier path from the v10 canvas (`runnerTrail` / `strokeTrailWorld`).
 *
 * Samples while the play is live: 0.04s apart, or 0.016s near the goal or in
 * a dive, and only after a 0.15 yard step (the goal drops the step gate).
 * The stroke is one solid rgba(120, 12, 18, 0.88) line, not a speed gradient.
 * The path is the whole play, capped at 600 points so the oldest fall off.
 * A new snap clears it. Replay keeps the prefix recorded by the scrubbed time.
 * Yard is clamped to the goal line, and a score seals the path on that plane.
 */
const MIN_STEP = 0.15;
const SAMPLE_S = 0.04;
const SAMPLE_FAST_S = 0.016;
const MAX_POINTS = 600;
const GOAL = FIELD.length;
const SEAL_GAP = 99.2;

export type TrailPoint = {
  x: number;
  yard: number;
  /** Seconds since the snap. Replay hides points newer than the scrub. */
  age: number;
};

export type RunnerTrail = {
  points: TrailPoint[];
  /** Seconds since the last stored sample. */
  acc: number;
  /** Elapsed live time for the six-player preview, which has no play age. */
  clock: number;
};

export function createRunnerTrail(): RunnerTrail {
  return { points: [], acc: 0, clock: 0 };
}

export function resetRunnerTrail(trail: RunnerTrail) {
  trail.points.length = 0;
  trail.acc = 0;
  trail.clock = 0;
}

function pushPoint(trail: RunnerTrail, x: number, yard: number, age: number) {
  const y = Math.min(GOAL, yard);
  const last = trail.points[trail.points.length - 1];
  if (last && Math.hypot(x - last.x, y - last.yard) < 1e-4) return;
  trail.points.push({ x, yard: y, age });
  if (trail.points.length > MAX_POINTS) trail.points.shift();
}

/** One live sample. `fast` is a dive, which matches the canvas 0.016s gate. */
export function sampleRunnerTrail(
  trail: RunnerTrail,
  x: number,
  yard: number,
  age: number,
  dt: number,
  fast: boolean,
) {
  trail.acc += dt;
  const y = Math.min(GOAL, yard);
  const last = trail.points[trail.points.length - 1];
  const moved = !last || Math.hypot(x - last.x, y - last.yard) > MIN_STEP;
  const nearGoal = yard >= 96;
  const minT = fast || nearGoal ? SAMPLE_FAST_S : SAMPLE_S;
  if ((moved || nearGoal) && trail.acc > minT) {
    pushPoint(trail, x, y, age);
    trail.acc = 0;
  }
}

/** Tackle or sideline: the path reaches the whistle spot. */
export function pinRunnerTrail(trail: RunnerTrail, x: number, yard: number, age: number) {
  pushPoint(trail, x, yard, age);
  trail.acc = 0;
}

/** Touchdown: fill the gap so the path meets the goal line. Canvas `scoreTouchdown`. */
export function sealRunnerTrail(trail: RunnerTrail, x: number, yard: number, age: number) {
  for (const point of trail.points) {
    if (point.yard > GOAL) point.yard = GOAL;
  }
  const last = trail.points[trail.points.length - 1];
  const x0 = last ? last.x : x;
  const y0 = last ? last.yard : Math.min(GOAL, yard);
  if (!last || y0 < SEAL_GAP) {
    const steps = 4;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      pushPoint(trail, x0 + (x - x0) * t, y0 + (GOAL - y0) * t, age);
    }
  } else {
    pushPoint(trail, x, GOAL, age);
  }
  trail.acc = 0;
}

/**
 * Points to stroke, oldest first.
 * `clipAge` is the replay scrub. Null shows the whole play.
 * `tip` is the carrier right now, so the line meets their feet between samples.
 */
export function collectTrail(
  trail: RunnerTrail,
  clipAge: number | null,
  tip: { x: number; yard: number } | null,
  out: { x: number; yard: number }[],
): number {
  out.length = 0;
  for (const point of trail.points) {
    if (clipAge != null && point.age > clipAge + 1e-3) break;
    pushDraw(out, point.x, point.yard);
  }
  if (tip) pushDraw(out, tip.x, tip.yard);
  return out.length;
}

function pushDraw(out: { x: number; yard: number }[], x: number, yard: number) {
  const y = Math.min(GOAL, yard);
  const last = out[out.length - 1];
  if (last && Math.hypot(x - last.x, y - last.yard) < 1e-4) return;
  out.push({ x, yard: y });
}
