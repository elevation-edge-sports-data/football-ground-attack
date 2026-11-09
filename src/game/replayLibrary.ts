/**
 * Replay clips. One file is one clip, an array of formation frames.
 * The browser list is separate from files under replays/.
 */
import {
  framesFromUnknown,
  parseFormationJson,
  type FormationBall,
  type FormationFrame,
  type FormationPlayer,
} from "./formationLibrary";

export type ReplayClip = {
  id: string;
  name: string;
  frames: FormationFrame[];
};

const STORAGE_KEY = "fga-replay-library";
const RETIRED_KEY = "fga-replay-retired";

const bundledModules = import.meta.glob("../../replays/*.json", { eager: true });

function moduleJson(mod: unknown): unknown {
  if (mod && typeof mod === "object" && "default" in mod) return (mod as { default: unknown }).default;
  return mod;
}

function asClip(v: unknown): ReplayClip | null {
  if (!v || typeof v !== "object") return null;
  const row = v as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.name !== "string") return null;
  const frames = framesFromUnknown(row.frames);
  if (typeof frames === "string") return null;
  return { id: row.id, name: row.name, frames };
}

/** One loaded file is one clip, including a range download. */
export function replayClipFromFile(fileName: string, text: string, id: string): ReplayClip | string {
  const frames = parseFormationJson(text);
  if (typeof frames === "string") return frames;
  return { id, name: fileName, frames };
}

export function readReplayLibrary(): ReplayClip[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.flatMap((item) => {
      const clip = asClip(item);
      return clip ? [clip] : [];
    });
  } catch {
    return [];
  }
}

export function writeReplayLibrary(clips: ReplayClip[]): string | null {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clips));
    return null;
  } catch {
    return "The browser could not store that replay.";
  }
}

/**
 * Names whose files were unlinked. import.meta.glob is eager, so a Vite
 * restart is required for the glob to drop the file completely. Until then
 * this list hides the stale module.
 */
export function readRetiredReplays(): string[] {
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

export function writeRetiredReplays(names: readonly string[]): void {
  try {
    localStorage.setItem(RETIRED_KEY, JSON.stringify(names));
  } catch {
    /* The list still updates for this session. */
  }
}

/**
 * Left list is unsaved loads. Right list is replays/ files, plus a file
 * saved earlier in this session. A shared name does not hide the load.
 * Retired names drop the repo copy after the file is unlinked.
 */
export function partitionReplayLibrary(
  local: readonly ReplayClip[],
  bundled: readonly ReplayClip[],
  saved: readonly ReplayClip[] = [],
  retired: readonly string[] = [],
): { imported: ReplayClip[]; repo: ReplayClip[] } {
  const repoSaved = saved.filter((clip) => !retired.includes(clip.name));
  const taken = new Set(repoSaved.map((clip) => clip.name));
  const repo = [
    ...repoSaved,
    ...bundled.filter((clip) => !retired.includes(clip.name) && !taken.has(clip.name)),
  ];
  const imported = local.filter((clip) => !clip.id.startsWith("bundled:"));
  return { imported, repo };
}

/** JSON files checked in under replays/. One file is one clip. */
export function bundledReplayEntries(): ReplayClip[] {
  const out: ReplayClip[] = [];
  for (const [path, mod] of Object.entries(bundledModules)) {
    const name = path.split("/").pop() ?? path;
    const frames = framesFromUnknown(moduleJson(mod));
    if (typeof frames === "string") continue;
    out.push({ id: `bundled:${path}:0`, name, frames });
  }
  return out;
}

export type ReplaySample = {
  players: FormationPlayer[];
  ball: FormationBall;
  userId?: number;
  controlledId?: string;
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpYaw(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Linear positions between two adjusted frames. `cursor` may sit between frames. Pose snaps at halfway. */
export function sampleReplay(frames: readonly FormationFrame[], cursor: number): ReplaySample {
  const last = Math.max(0, frames.length - 1);
  const u = Math.max(0, Math.min(last, Number.isFinite(cursor) ? cursor : 0));
  const i0 = Math.floor(u);
  const i1 = Math.min(last, i0 + 1);
  const t = i1 === i0 ? 0 : u - i0;
  const a = frames[i0]!;
  const b = frames[i1]!;
  const players = a.adjusted.players.map((p) => {
    const q = b.adjusted.players.find((row) => row.index === p.index) ?? p;
    const pose = t < 0.5 ? p.pose : q.pose !== undefined ? q.pose : p.pose;
    return {
      index: p.index,
      id: p.id,
      x: lerp(p.x, q.x, t),
      yard: lerp(p.yard, q.yard, t),
      yaw: lerpYaw(p.yaw, q.yaw, t),
      ...(p.side || q.side ? { side: p.side ?? q.side } : {}),
      ...(p.role || q.role ? { role: p.role ?? q.role } : {}),
      ...(p.number !== undefined || q.number !== undefined ? { number: p.number ?? q.number } : {}),
      ...(pose !== undefined ? { pose } : {}),
    };
  });
  const ap = a.adjusted.ball;
  const bp = b.adjusted.ball;
  return {
    players,
    ball: {
      x: lerp(ap.x, bp.x, t),
      yard: lerp(ap.yard, bp.yard, t),
      y: lerp(ap.y, bp.y, t),
      owner: ap.owner,
    },
    ...(a.userId !== undefined ? { userId: a.userId } : {}),
    ...(a.controlledId !== undefined ? { controlledId: a.controlledId } : {}),
  };
}

/** Whole frame the scrubber is on. A fractional cursor locks the earlier frame. */
export function lockedReplayIndex(cursor: number, frameCount: number): number {
  const last = Math.max(0, frameCount - 1);
  if (!Number.isFinite(cursor)) return 0;
  return Math.min(last, Math.max(0, Math.floor(cursor)));
}
