/**
 * Which goal the offense is attacking.
 * Q1 starts north. Q1→Q2 and Q3→Q4 reverse it. Q2→Q3 does not.
 * Those two reversals also reflect the spot across midfield. The paint stays.
 * The reversed camera keeps the offense in front of the lens.
 */
import { FIELD } from "../../field/spec";
import type { PlayAssignment } from "./types";
import type { Player } from "../sim";

let north = true;
/** Classic and high cameras. Quarter changes move this. A score does not. */
let cameraNorth = true;
/**
 * YOU starts as the home team. Away mirrors the attack, the camera, and the kit.
 * The stored `north` stays the game base so quarters and possession keep their sides.
 */
let youHome = true;
let youHomeApplies = true;
const youHomeListeners = new Set<() => void>();

function notifyYouHome() {
  for (const listener of youHomeListeners) listener();
}

/** Direction the offense is actually attacking. The stored `north` stays the game base. */
function playingNorth(): boolean {
  return youHomeApplies && !youHome ? !north : north;
}

function cameraFacingNorth(): boolean {
  return youHomeApplies && !youHome ? !cameraNorth : cameraNorth;
}

export function readAttackNorth() {
  return playingNorth();
}

/** Which way the broadcast cameras face. Independent of who has the ball. */
export function readCameraNorth() {
  return cameraFacingNorth();
}

export function attackSign(): 1 | -1 {
  return playingNorth() ? 1 : -1;
}

/** True when the YOU kit is the home team. */
export function youKitIsHome(): boolean {
  return !youHomeApplies || youHome;
}

export function readYouHome(): boolean {
  return youHome;
}

/** Fires when home/away changes the kit or the attack mirror. */
export function subscribeYouHome(listener: () => void) {
  youHomeListeners.add(listener);
  return () => {
    youHomeListeners.delete(listener);
  };
}

export function setYouHome(on: boolean) {
  if (youHome === on) return;
  youHome = on;
  notifyYouHome();
}

/** When off, the away choice does not mirror the field. Game and the other modes leave it on. */
export function setYouHomeApplies(on: boolean) {
  if (youHomeApplies === on) return;
  youHomeApplies = on;
  notifyYouHome();
}

/** Possession direction before the home/away mirror. Home attacks this way in the first quarter. */
export function readBaseAttackNorth() {
  return north;
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
  return playingNorth() ? Math.max(a, b) : Math.min(a, b);
}

/** Move `depth` yards toward the attack goal. Negative depth is the backfield. */
export function shiftDownfield(yard: number, depth: number) {
  return yard + depth * attackSign();
}

/** Yards from this line to the goal the offense is attacking. */
export function yardsToGoal(los: number) {
  return Math.max(0, playingNorth() ? FIELD.length - los : los);
}

/** Home 25 in the direction the offense is attacking. */
export function homeTwentyFive() {
  return playingNorth() ? 25 : FIELD.length - 25;
}

/** Just outside the offense's own goal line. */
export function safetySpotYard() {
  return playingNorth() ? 0.5 : FIELD.length - 0.5;
}

type Oriented = Player & { assignment?: PlayAssignment };

/** Turn a north-built lineup around the LOS so the offense attacks south. */
export function orientLineup(players: readonly Oriented[], los: number) {
  if (playingNorth()) return;
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
