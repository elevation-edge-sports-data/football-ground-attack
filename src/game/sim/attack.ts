/**
 * Which goal the offense is attacking.
 * Q1 starts north. Q1→Q2 and Q3→Q4 reverse it. Q2→Q3 does not.
 * The midfield logo stays painted on the turf; the reversed camera is what turns it over.
 */
import { FIELD } from "../../field/spec";
import type { PlayAssignment } from "./types";
import type { Player } from "../sim";

let north = true;
/** Classic and high cameras. Quarter changes move this. A score does not. */
let cameraNorth = true;

export function readAttackNorth() {
  return north;
}

/** Which way the broadcast cameras face. Independent of who has the ball. */
export function readCameraNorth() {
  return cameraNorth;
}

export function attackSign(): 1 | -1 {
  return north ? 1 : -1;
}

export function setAttackNorth(on: boolean) {
  north = on;
}

export function setCameraNorth(on: boolean) {
  cameraNorth = on;
}

export function flipAttackDirection() {
  north = !north;
  cameraNorth = !cameraNorth;
}

/** Positive when `yard` is farther toward the attack goal than `from`. */
export function downfieldDelta(yard: number, from: number) {
  return (yard - from) * attackSign();
}

/** The one of a or b that is farther toward the attack goal. */
export function furtherDownfield(a: number, b: number) {
  return north ? Math.max(a, b) : Math.min(a, b);
}

/** Move `depth` yards toward the attack goal. Negative depth is the backfield. */
export function shiftDownfield(yard: number, depth: number) {
  return yard + depth * attackSign();
}

/** Yards from this line to the goal the offense is attacking. */
export function yardsToGoal(los: number) {
  return Math.max(0, north ? FIELD.length - los : los);
}

/** Home 25 in the direction the offense is attacking. */
export function homeTwentyFive() {
  return north ? 25 : FIELD.length - 25;
}

/** Just outside the offense's own goal line. */
export function safetySpotYard() {
  return north ? 0.5 : FIELD.length - 0.5;
}

type Oriented = Player & { assignment?: PlayAssignment };

/** Turn a north-built lineup around the LOS so the offense attacks south. */
export function orientLineup(players: readonly Oriented[], los: number) {
  if (north) return;
  const flip = (yard: number) => los * 2 - yard;
  for (const player of players) {
    player.yard = flip(player.yard);
    player.facingYard = -player.facingYard;
    const job = player.assignment;
    if (!job) continue;
    if (job.kind === "defense") {
      job.yard = flip(job.yard);
      job.stationYard = flip(job.stationYard);
      job.stutterYard = flip(job.stutterYard);
    } else if (job.kind === "block") {
      if (job.gapAimY != null) job.gapAimY = flip(job.gapAimY);
      if (job.pullVia) {
        job.pullVia = { ...job.pullVia, y: flip(job.pullVia.y), y2: flip(job.pullVia.y2) };
      }
    }
  }
}
