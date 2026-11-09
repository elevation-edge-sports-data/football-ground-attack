/**
 * Formation library. Same frame envelope as hockey-fast-break: a named entry
 * holds original and adjusted sides, and the browser list is separate from
 * files under formations/.
 *
 * Football spots are field x and yard (north), not rink x/z. yaw 0 faces north.
 * side is off or def. role is a personnel group. The ball replaces the puck.
 */
import type { PersonnelGroup } from "./sim/types";

export type FormationRole = PersonnelGroup;

export type FormationPlayer = {
  index: number;
  /** Roster id. Football ids are strings such as "hb-0". A numeric id is kept as text. */
  id: string;
  x: number;
  yard: number;
  /** Radians. 0 looks north, the same yaw PlayerFigure's group uses. */
  yaw: number;
  side?: "off" | "def";
  role?: FormationRole;
  number?: number;
  /** Named pose. Null is a recorded frame with no pose. Absent still uses the bind pose. */
  pose?: string | null;
};

export type FormationBall = {
  x: number;
  yard: number;
  y: number;
  owner: string | null;
};

export type FormationSide = {
  ball: FormationBall;
  players: FormationPlayer[];
};

/** One saved frame. userId is a roster index. controlledId is a player id. */
export type FormationFrame = {
  frame: number;
  time: number;
  userId?: number;
  controlledId?: string;
  original: FormationSide;
  adjusted: FormationSide;
};

export type FormationView = "original" | "adjusted";

export type FormationEntry = {
  id: string;
  name: string;
  frame: FormationFrame;
};

const STORAGE_KEY = "fga-formation-library";
const RETIRED_KEY = "fga-formation-retired";

const ROLES: readonly FormationRole[] = ["QB", "HB", "FB", "TE", "OL", "DT", "LB", "DB"];

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function optionalNum(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = num(v);
  return n === null ? undefined : n;
}

function asId(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function optionalPose(v: unknown): string | null | undefined | false {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === "string") return v;
  return false;
}

function optionalSide(v: unknown): "off" | "def" | undefined | null {
  if (v == null) return undefined;
  if (v === "off" || v === "def") return v;
  return null;
}

function optionalRole(v: unknown): FormationRole | undefined | null {
  if (v == null) return undefined;
  if (typeof v === "string" && (ROLES as readonly string[]).includes(v)) return v as FormationRole;
  return null;
}

function asPlayer(v: unknown): FormationPlayer | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Record<string, unknown>;
  const index = num(p.index);
  const id = asId(p.id);
  const x = num(p.x);
  const yard = num(p.yard);
  const yaw = p.yaw == null ? 0 : num(p.yaw);
  const side = optionalSide(p.side);
  const role = optionalRole(p.role);
  const jersey = p.number == null ? undefined : num(p.number);
  const pose = optionalPose(p.pose);
  if (index === null || id === null || x === null || yard === null || yaw === null) return null;
  if (side === null || role === null || jersey === null || pose === false) return null;
  return {
    index,
    id,
    x,
    yard,
    yaw,
    ...(side !== undefined ? { side } : {}),
    ...(role !== undefined ? { role } : {}),
    ...(jersey !== undefined ? { number: jersey } : {}),
    ...(pose !== undefined ? { pose } : {}),
  };
}

function asOwner(v: unknown): string | null | false {
  if (v === null) return null;
  return asId(v) ?? false;
}

function asSide(v: unknown): FormationSide | null {
  if (!v || typeof v !== "object") return null;
  const s = v as Record<string, unknown>;
  const ball = s.ball;
  if (!ball || typeof ball !== "object" || !Array.isArray(s.players)) return null;
  const b = ball as Record<string, unknown>;
  const x = num(b.x);
  const yard = num(b.yard);
  const y = num(b.y);
  if (x === null || yard === null || y === null) return null;
  const owner = asOwner(b.owner);
  if (owner === false) return null;
  const players: FormationPlayer[] = [];
  for (const row of s.players) {
    const player = asPlayer(row);
    if (!player) return null;
    players.push(player);
  }
  return { ball: { x, yard, y, owner }, players };
}

function asFrame(v: unknown): FormationFrame | null {
  if (!v || typeof v !== "object") return null;
  const f = v as Record<string, unknown>;
  const frame = num(f.frame);
  const time = num(f.time);
  const original = asSide(f.original);
  const adjusted = asSide(f.adjusted);
  if (frame === null || time === null || !original || !adjusted) return null;
  const userId = optionalNum(f.userId);
  const controlledId = f.controlledId == null ? undefined : asId(f.controlledId);
  if (controlledId === null) return null;
  return {
    frame,
    time,
    ...(userId !== undefined ? { userId } : {}),
    ...(controlledId !== undefined ? { controlledId } : {}),
    original,
    adjusted,
  };
}

/** One saved frame, or every frame in a range download. */
export function framesFromUnknown(data: unknown): FormationFrame[] | string {
  const list = Array.isArray(data) ? data : [data];
  if (!list.length) return "That file has no frames.";
  const frames: FormationFrame[] = [];
  for (const item of list) {
    const frame = asFrame(item);
    if (!frame) return "That file is not a formation frame.";
    frames.push(frame);
  }
  return frames;
}

export function parseFormationJson(text: string): FormationFrame[] | string {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return "That file is not JSON.";
  }
  return framesFromUnknown(data);
}

function entryName(fileName: string, frames: FormationFrame[], frame: FormationFrame): string {
  if (frames.length === 1) return fileName;
  return `${fileName} · ${frame.frame}`;
}

/** Appended to a library name when an edit is copied to the left panel. */
export const FORMATION_EDITED_SUFFIX = " (edited)";

export function editedFormationName(name: string): string {
  return name.endsWith(FORMATION_EDITED_SUFFIX) ? name : `${name}${FORMATION_EDITED_SUFFIX}`;
}

export function isEditedFormationName(name: string): boolean {
  return name.endsWith(FORMATION_EDITED_SUFFIX);
}

/** Display name before " (edited)", or null when this row is not an edit copy. */
export function editedSourceName(name: string): string | null {
  if (!isEditedFormationName(name)) return null;
  const source = name.slice(0, -FORMATION_EDITED_SUFFIX.length).trim();
  return source || null;
}

export function entriesFromFile(fileName: string, text: string, idAt: () => string): FormationEntry[] | string {
  const frames = parseFormationJson(text);
  if (typeof frames === "string") return frames;
  return frames.map((frame) => ({
    id: idAt(),
    name: entryName(fileName, frames, frame),
    frame,
  }));
}

function asEntry(v: unknown): FormationEntry | null {
  if (!v || typeof v !== "object") return null;
  const row = v as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.name !== "string") return null;
  const frame = asFrame(row.frame);
  if (!frame) return null;
  return { id: row.id, name: row.name, frame };
}

export function readFormationLibrary(): FormationEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.flatMap((item) => {
      const entry = asEntry(item);
      return entry ? [entry] : [];
    });
  } catch {
    return [];
  }
}

export function writeFormationLibrary(entries: FormationEntry[]): string | null {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    return null;
  } catch {
    return "The browser could not store that frame.";
  }
}

/**
 * Names whose files were unlinked. import.meta.glob is eager, so a Vite
 * restart is required for the glob to drop the file completely. Until then
 * this list hides the stale module.
 */
export function readRetiredFormations(): string[] {
  try {
    const raw = localStorage.getItem(RETIRED_KEY);
    if (!raw) return [];
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter((item) => typeof item === "string");
  } catch {
    return [];
  }
}

export function writeRetiredFormations(names: readonly string[]): void {
  try {
    localStorage.setItem(RETIRED_KEY, JSON.stringify(names));
  } catch {
    /* The list still updates for this session. */
  }
}

const bundledModules = import.meta.glob("../../formations/*.json", { eager: true });

function moduleJson(mod: unknown): unknown {
  if (mod && typeof mod === "object" && "default" in mod) return (mod as { default: unknown }).default;
  return mod;
}

/**
 * Left list is unsaved imports. Right list is formations/ files, plus a file
 * saved earlier in this session. A shared name does not hide the import.
 * Retired names drop the repo copy after the file is unlinked. A Vite
 * restart is required for the glob to drop the file completely.
 */
export function partitionFormationLibrary(
  local: readonly FormationEntry[],
  bundled: readonly FormationEntry[],
  saved: readonly FormationEntry[] = [],
  retired: readonly string[] = [],
): { imported: FormationEntry[]; repo: FormationEntry[] } {
  const repoSaved = saved.filter((entry) => !retired.includes(entry.name));
  const taken = new Set(repoSaved.map((entry) => entry.name));
  const repo = [
    ...repoSaved,
    ...bundled.filter((entry) => !retired.includes(entry.name) && !taken.has(entry.name)),
  ];
  const imported = local.filter((entry) => !entry.id.startsWith("bundled:"));
  return { imported, repo };
}

function asJsonBasename(raw: string): string | null {
  const base = raw.trim();
  if (!base || base === "." || base === "..") return null;
  return base.toLowerCase().endsWith(".json") ? base : `${base}.json`;
}

function bundledBasename(id: string): string | null {
  const rest = id.slice("bundled:".length);
  const cut = rest.lastIndexOf(":");
  const path = (cut >= 0 ? rest.slice(0, cut) : rest).replace(/\\/g, "/");
  return asJsonBasename(path.split("/").pop() ?? "");
}

function displayBasename(name: string): string | null {
  const trimmed = name.trim().replace(/\\/g, "/").split("/").pop()?.trim() ?? "";
  const marked = trimmed.match(/^(.*\.json) · \d+$/i);
  return asJsonBasename(marked?.[1] ?? trimmed);
}

/**
 * Name Save posts. An "(edited)" row updates the original file when the field
 * still shows that copy. A renamed field is saved under the typed name.
 */
export function formationSaveName(entryName: string, typed: string): string {
  const typedTrim = typed.trim();
  const source = editedSourceName(entryName);
  if (!source) return typedTrim;
  const auto = entryName.replace(/\.json$/i, "");
  if (typedTrim !== auto && typedTrim !== entryName && typedTrim !== `${auto}.json`) return typedTrim;
  const file = displayBasename(source) ?? source;
  return file.replace(/\.json$/i, "");
}

/**
 * Left-panel copies of a right-panel remove. Every frame of that file is copied
 * so unlinking the json does not drop the other frames. Left rows are not copied.
 */
export function copiesForRightRemove<T extends { id: string; name: string; frame: FormationFrame }>(
  entry: T,
  rows: readonly T[],
  idAt: () => string,
): T[] {
  if (!entry.id.startsWith("bundled:")) return [];
  const file = repoJsonName(entry.id, entry.name);
  const group = file
    ? rows.filter((row) => row.id.startsWith("bundled:") && repoJsonName(row.id, row.name) === file)
    : [entry];
  const list = group.length ? group : [entry];
  return list.map((row) => ({
    ...row,
    id: idAt(),
    frame: structuredClone(row.frame),
  }));
}

/** Json basename for a library row. A multi-frame label keeps the file before " · ". */
export function repoJsonName(id: string, name: string): string | null {
  if (id.startsWith("bundled:")) return bundledBasename(id);
  return displayBasename(name);
}

/**
 * Repo files the eager glob still lists after a remove. The retired list hides
 * them, and each one still has to be unlinked. A Vite restart is required for
 * the glob to drop the file completely.
 */
export function retiredRepoFiles(
  retired: readonly string[],
  bundled: readonly { id: string; name: string }[],
): string[] {
  const files = new Set<string>();
  for (const row of bundled) {
    if (!row.id.startsWith("bundled:")) continue;
    const file = repoJsonName(row.id, row.name);
    if (file && (retired.includes(file) || retired.includes(row.name))) files.add(file);
  }
  return [...files];
}

/**
 * Repo json this Remove should unlink.
 * A right-panel row owns its file. A left-panel row owns it only after that
 * name has left the right list, so a same-named import does not delete a file
 * the right panel still shows. Null means the row was never written.
 */
export function libraryRemoveFile(
  entry: { id: string; name: string },
  rows: readonly { id: string; name: string }[],
  retired: readonly string[],
): string | null {
  const file = repoJsonName(entry.id, entry.name);
  if (!file) return null;
  if (entry.id.startsWith("bundled:")) return file;
  const listed = rows.some(
    (row) =>
      row.id !== entry.id &&
      row.id.startsWith("bundled:") &&
      repoJsonName(row.id, row.name) === file,
  );
  if (listed) return null;
  if (retired.includes(file) || retired.includes(entry.name)) return file;
  return null;
}

/** Hide every right-panel row of a file after it has been unlinked. */
export function retiredNamesForFile(
  rows: readonly { id: string; name: string }[],
  retired: readonly string[],
  file: string,
): string[] {
  const names = new Set(retired);
  names.add(file);
  for (const row of rows) {
    if (!row.id.startsWith("bundled:")) continue;
    if (repoJsonName(row.id, row.name) === file) names.add(row.name);
  }
  return [...names];
}

/**
 * Drop the removed row after the file is unlinked and keep its retired-list entry.
 * A Vite restart is required for the glob to drop the file completely.
 */
export function libraryStateAfterDelete<T extends { id: string; name: string }>(
  local: readonly T[],
  saved: readonly T[],
  retired: readonly string[],
  rows: readonly { id: string; name: string }[],
  removedId: string,
  file: string,
): { local: T[]; saved: T[]; retired: string[] } {
  return {
    local: local.filter((item) => item.id !== removedId),
    saved: saved.filter((item) => repoJsonName(item.id, item.name) !== file),
    retired: retiredNamesForFile(rows, retired, file),
  };
}

/** Dev server unlinks the json. A missing file still succeeds. */
export async function deleteRepoJson(folder: "formations" | "replays", name: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/${folder}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { name?: unknown };
    return typeof body.name === "string" && body.name ? body.name : null;
  } catch {
    return null;
  }
}

/** Next frame after a left-panel remove: a remaining left row, or a right row when the left side is empty. */
export function nextAfterLeftRemove<T>(
  left: readonly T[],
  right: readonly T[],
  random: () => number = Math.random,
): T | null {
  const pool = left.length ? left : right;
  if (!pool.length) return null;
  const i = Math.min(pool.length - 1, Math.floor(random() * pool.length));
  return pool[i] ?? null;
}

/** JSON files checked in under formations/. */
export function bundledFormationEntries(): FormationEntry[] {
  const out: FormationEntry[] = [];
  for (const [path, mod] of Object.entries(bundledModules)) {
    const name = path.split("/").pop() ?? path;
    const frames = framesFromUnknown(moduleJson(mod));
    if (typeof frames === "string") continue;
    frames.forEach((frame, i) => {
      out.push({
        id: `bundled:${path}:${i}`,
        name: entryName(name, frames, frame),
        frame,
      });
    });
  }
  return out;
}

/** The side on screen. Adjusted is the default. A missing side falls back to the other. */
export function formationSideOf(frame: FormationFrame, view: FormationView): FormationSide {
  if (view === "original") return frame.original ?? frame.adjusted;
  return frame.adjusted ?? frame.original;
}

export type FormSpot = { x: number; yard: number };

export type FormEdit =
  | { kind: "ball"; x0: number; yard0: number; x1: number; yard1: number }
  | {
      kind: "player";
      id: string;
      x0: number;
      yard0: number;
      yaw0: number;
      x1: number;
      yard1: number;
      yaw1: number;
      ball0: FormSpot | null;
      ball1: FormSpot | null;
      /** Absent when the step did not change the pose. */
      pose0?: string | null;
      pose1?: string | null;
    };

export type FormHist = {
  undo: FormEdit[];
  redo: FormEdit[];
};

export function freshFormHist(): FormHist {
  return { undo: [], redo: [] };
}

function sameFormTarget(a: FormEdit, b: FormEdit): boolean {
  if (a.kind === "ball" && b.kind === "ball") return true;
  return a.kind === "player" && b.kind === "player" && a.id === b.id;
}

export function formUndoDepth(h: FormHist): number {
  return h.undo.length;
}

/** A key repeat extends the last step. A new press starts one. */
export function recordFormEdit(h: FormHist, edit: FormEdit, coalesce: boolean): void {
  const prev = h.undo[h.undo.length - 1];
  if (coalesce && prev && sameFormTarget(prev, edit)) {
    prev.x1 = edit.x1;
    prev.yard1 = edit.yard1;
    if (prev.kind === "player" && edit.kind === "player") {
      prev.yaw1 = edit.yaw1;
      prev.ball1 = edit.ball1;
      if (edit.pose1 !== undefined) prev.pose1 = edit.pose1;
    }
    return;
  }
  h.redo.length = 0;
  h.undo.push(edit);
}

export function undoFormEdit(h: FormHist): FormEdit | null {
  const edit = h.undo.pop();
  if (!edit) return null;
  h.redo.push(edit);
  return edit;
}

export function redoFormEdit(h: FormHist): FormEdit | null {
  const edit = h.redo.pop();
  if (!edit) return null;
  h.undo.push(edit);
  return edit;
}

/** Put one undo step onto the side currently on screen. */
export function applyFormEdit(frame: FormationFrame, view: FormationView, edit: FormEdit, forward: boolean): void {
  const side = formationSideOf(frame, view);
  if (edit.kind === "ball") {
    side.ball.x = forward ? edit.x1 : edit.x0;
    side.ball.yard = forward ? edit.yard1 : edit.yard0;
    return;
  }
  const player = side.players.find((row) => row.id === edit.id);
  if (player) {
    player.x = forward ? edit.x1 : edit.x0;
    player.yard = forward ? edit.yard1 : edit.yard0;
    player.yaw = forward ? edit.yaw1 : edit.yaw0;
    const pose = forward ? edit.pose1 : edit.pose0;
    if (pose !== undefined) player.pose = pose;
  }
  const ball = forward ? edit.ball1 : edit.ball0;
  if (ball) {
    side.ball.x = ball.x;
    side.ball.yard = ball.yard;
  }
}
