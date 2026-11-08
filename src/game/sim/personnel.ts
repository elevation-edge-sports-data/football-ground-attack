/**
 * Personnel counts for the next snap.
 *
 * Ranges match the v10 canvas steppers. HB stays at 1; the canvas has no
 * HB control. Changing a count does not restage the live roster.
 */
import { DEFAULT_PERSONNEL, type PersonnelCounts } from "./types";

export type PersonnelKey = "ol" | "te" | "fb" | "qb" | "dt" | "lb" | "db";

/** Inclusive canvas limits from bindCount in game.js. */
export const PERSONNEL_LIMITS: Record<PersonnelKey, { min: number; max: number }> = {
  ol: { min: 0, max: 5 },
  te: { min: 0, max: 3 },
  fb: { min: 0, max: 2 },
  qb: { min: 0, max: 1 },
  dt: { min: 0, max: 4 },
  lb: { min: 0, max: 4 },
  db: { min: 0, max: 6 },
};

export const PERSONNEL_LABEL: Record<PersonnelKey, string> = {
  ol: "OL",
  te: "TE",
  fb: "FB",
  qb: "QB",
  dt: "DT",
  lb: "LB",
  db: "DB",
};

/** v10 offense panel order. */
export const OFFENSE_PERSONNEL = ["ol", "te", "fb", "qb"] as const satisfies readonly PersonnelKey[];
/** v10 defense panel order. */
export const DEFENSE_PERSONNEL = ["dt", "lb", "db"] as const satisfies readonly PersonnelKey[];

let counts: PersonnelCounts = { ...DEFAULT_PERSONNEL };
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribePersonnel(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readPersonnel(): PersonnelCounts {
  return counts;
}

/** Clamp one group by one step. HB is left at 1. */
export function stepPersonnel(key: PersonnelKey, delta: -1 | 1) {
  const limit = PERSONNEL_LIMITS[key];
  const next = Math.min(limit.max, Math.max(limit.min, counts[key] + delta));
  if (next === counts[key]) return;
  counts = { ...counts, [key]: next };
  emit();
}
