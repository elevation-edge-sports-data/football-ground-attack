/**
 * Presnap stances for one snap.
 * Set once after the roster is placed, assigned, looked, and spread.
 * Cleared the first time that player actually steps toward an aim.
 * The controlled runner is not stored here. The play sim rolls carry 1 or
 * carry 2 onto that player when the formation is armed.
 */
import type { Player } from "../sim";

/** Names already saved in the pose editor. */
const STANCE_3 = "3 point stance";
const STANCE_2 = "2 point stance";

const THREE_POINT = new Set(["OL", "DT"]);

const stances = new WeakMap<Player, string>();
let revision = 0;
let dirty = false;
const listeners = new Set<() => void>();

/** OL and DT crouch. Every other player stands in a 2-point. The runner is separate. */
export function presnapStance(player: { role: string; controlled: boolean }): string | null {
  if (player.controlled) return null;
  if (THREE_POINT.has(player.role)) return STANCE_3;
  return STANCE_2;
}

function publish() {
  dirty = false;
  revision += 1;
  for (const listener of listeners) listener();
}

/** Write the lineup poses onto this roster. Does not touch the carrier pose clock. */
export function applyPresnapStances(players: readonly Player[]) {
  for (const player of players) {
    const name = presnapStance(player);
    if (name) stances.set(player, name);
    else stances.delete(player);
  }
  // The view reads these on the next render. A roster that is already mounted
  // still needs the notice, or it keeps the bind pose until somebody steps.
  publish();
}

export function stanceOf(player: Player): string | undefined {
  return stances.get(player);
}

/** Drop the lineup pose once this body takes a step. One notice per frame, from `flushStanceReleases`. */
export function releaseStance(player: Player) {
  if (!stances.has(player)) return;
  stances.delete(player);
  dirty = true;
}

export function flushStanceReleases() {
  if (!dirty) return;
  publish();
}

export function subscribeStances(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function stanceRevision() {
  return revision;
}
