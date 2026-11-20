/**
 * Personnel counts for the next snap.
 *
 * OL 0–10, TE 0–4, WR 0–5, FB 0–3, QB 0–1. Their total stays at or under 10.
 * DT 0–7, LB 0–6, DB 0–5. Their total stays at or under 11.
 * HB stays at 1; the canvas has no HB control.
 * A change during the pre-snap lineup rebuilds that snap.
 * A change after the snap waits for the following one.
 */
import { readPrefs, writePrefs } from "../prefs";
import { restageArmedSnap } from "./boot";
import { DEFAULT_PERSONNEL, type PersonnelCounts } from "./types";

export type PersonnelKey = "ol" | "te" | "wr" | "fb" | "qb" | "dt" | "lb" | "db";

/**
 * Inclusive limits. QB stays 0–1. HB stays 1 and is not on a stepper.
 * Offense OL+TE+WR+FB+QB cannot pass 10. Defense DT+LB+DB cannot pass 11.
 */
export const PERSONNEL_LIMITS: Record<PersonnelKey, { min: number; max: number }> = {
  ol: { min: 0, max: 10 },
  te: { min: 0, max: 4 },
  wr: { min: 0, max: 5 },
  fb: { min: 0, max: 3 },
  qb: { min: 0, max: 1 },
  dt: { min: 0, max: 7 },
  lb: { min: 0, max: 6 },
  db: { min: 0, max: 5 },
};

const OFFENSE_CAP = 10;
const DEFENSE_CAP = 11;

export const PERSONNEL_LABEL: Record<PersonnelKey, string> = {
  ol: "OL",
  te: "TE",
  wr: "WR",
  fb: "FB",
  qb: "QB",
  dt: "DT",
  lb: "LB",
  db: "DB",
};

/** Offense panel order. WR shares the 10-player cap with OL, TE, FB, and QB. */
export const OFFENSE_PERSONNEL = ["ol", "te", "wr", "fb", "qb"] as const satisfies readonly PersonnelKey[];
/** v10 defense panel order. */
export const DEFENSE_PERSONNEL = ["dt", "lb", "db"] as const satisfies readonly PersonnelKey[];

function sideKeys(key: PersonnelKey): readonly PersonnelKey[] {
  return key === "dt" || key === "lb" || key === "db" ? DEFENSE_PERSONNEL : OFFENSE_PERSONNEL;
}

function sideCap(key: PersonnelKey): number {
  return key === "dt" || key === "lb" || key === "db" ? DEFENSE_CAP : OFFENSE_CAP;
}

function groupTotal(source: PersonnelCounts, keys: readonly PersonnelKey[]): number {
  let total = 0;
  for (const key of keys) total += source[key];
  return total;
}

/** True when that + or − press stays inside the group max and the side total. */
export function canStepPersonnel(key: PersonnelKey, delta: -1 | 1, source: PersonnelCounts): boolean {
  const limit = PERSONNEL_LIMITS[key];
  const value = source[key];
  if (delta < 0) return value > limit.min;
  if (value >= limit.max) return false;
  return groupTotal(source, sideKeys(key)) < sideCap(key);
}

function trimSide(source: PersonnelCounts, keys: readonly PersonnelKey[], cap: number) {
  let guard = 40;
  while (groupTotal(source, keys) > cap && guard > 0) {
    guard -= 1;
    const key = [...keys].reverse().find((item) => source[item] > PERSONNEL_LIMITS[item].min);
    if (!key) break;
    source[key] -= 1;
  }
}

function openingCounts(): PersonnelCounts {
  const counts: PersonnelCounts = { ...DEFAULT_PERSONNEL };
  const saved = readPrefs().personnel;
  if (saved) {
    for (const key of Object.keys(PERSONNEL_LIMITS) as PersonnelKey[]) {
      const value = saved[key];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      const limit = PERSONNEL_LIMITS[key];
      counts[key] = Math.min(limit.max, Math.max(limit.min, Math.round(value)));
    }
  }
  trimSide(counts, OFFENSE_PERSONNEL, OFFENSE_CAP);
  trimSide(counts, DEFENSE_PERSONNEL, DEFENSE_CAP);
  return counts;
}

let counts: PersonnelCounts = openingCounts();
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

/** Clamp one group by one step. HB is left at 1. A full side total blocks another +. */
export function stepPersonnel(key: PersonnelKey, delta: -1 | 1) {
  if (!canStepPersonnel(key, delta, counts)) return;
  const limit = PERSONNEL_LIMITS[key];
  const next = Math.min(limit.max, Math.max(limit.min, counts[key] + delta));
  if (next === counts[key]) return;
  counts = { ...counts, [key]: next };
  writePrefs({
    personnel: {
      ol: counts.ol,
      te: counts.te,
      wr: counts.wr,
      fb: counts.fb,
      qb: counts.qb,
      dt: counts.dt,
      lb: counts.lb,
      db: counts.db,
    },
  });
  emit();
  restageArmedSnap();
}
