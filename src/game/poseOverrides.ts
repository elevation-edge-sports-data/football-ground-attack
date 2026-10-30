import type { Object3D } from "three";
import bundledOverrides from "./poseOverrides.json" with { type: "json" };
import { POSE_JOINTS, REST_POSITION, type PoseJointId } from "./pose";

/** Three Euler radians, or six numbers when the part also stores local position. */
export type PoseJointValue = number[];
export type PoseJoints = Partial<Record<PoseJointId, PoseJointValue>>;
export type PoseFile = Record<string, PoseJoints>;

const LOCAL_KEY = "fga-pose-overrides";

function asFile(value: unknown): PoseFile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const file: PoseFile = {};
  for (const [name, joints] of Object.entries(value as Record<string, unknown>)) {
    if (!joints || typeof joints !== "object" || Array.isArray(joints)) continue;
    const row: PoseJoints = {};
    for (const id of POSE_JOINTS) {
      const raw = (joints as Record<string, unknown>)[id];
      if (!Array.isArray(raw) || raw.length < 3) continue;
      const nums = raw.slice(0, raw.length >= 6 ? 6 : 3).map(Number);
      if (nums.some((n) => !Number.isFinite(n))) continue;
      row[id] = nums;
    }
    if (Object.keys(row).length > 0) file[name] = row;
  }
  return file;
}

let live: PoseFile = asFile(bundledOverrides);
let revision = 0;

function rememberLocal(): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(live));
  } catch {
    /* private mode */
  }
}

/** Editor save, or a fetch of the file, so this session matches disk. */
export function noteSavedPose(name: string, joints: PoseJoints): void {
  revision += 1;
  live = { ...live, [name]: joints };
  rememberLocal();
}

export function notePoseFile(file: PoseFile): void {
  revision += 1;
  live = file;
}

export function readStoredPoseFile(): PoseFile | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const file = asFile(JSON.parse(raw) as unknown);
    return Object.keys(file).length > 0 ? file : null;
  } catch {
    return null;
  }
}

/** Bind pose. Local rotation is identity. Positions are the rig rest positions. */
export function resetPoseJoints(groups: Partial<Record<PoseJointId, Object3D | null>>): void {
  for (const id of POSE_JOINTS) {
    const group = groups[id];
    if (!group) continue;
    const rest = REST_POSITION[id];
    group.position.set(rest[0], rest[1], rest[2]);
    group.rotation.set(0, 0, 0);
    group.quaternion.identity();
  }
  groups.body?.updateMatrixWorld(true);
}

/**
 * Copy saved local transforms onto the groups.
 * Parts store parent-local Euler radians. The pose editor shows the world
 * XYZ decomposition and converts back to this local quaternion before saving.
 * A 6-number entry also stores local position.
 * Missing poses fall back to the bind pose.
 */
export function applyPoseJoints(name: string, groups: Partial<Record<PoseJointId, Object3D | null>>): boolean {
  resetPoseJoints(groups);
  const row = live[name];
  if (!row) return false;
  let hit = false;
  for (const id of POSE_JOINTS) {
    const value = row[id];
    const group = groups[id];
    if (!value || value.length < 3 || !group) continue;
    group.rotation.set(value[0]!, value[1]!, value[2]!);
    group.quaternion.setFromEuler(group.rotation);
    if (value.length >= 6) group.position.set(value[3]!, value[4]!, value[5]!);
    hit = true;
  }
  groups.body?.updateMatrixWorld(true);
  return hit;
}

const SAVE_URL = "/api/pose-overrides";

async function readJson(url: string, init?: RequestInit): Promise<unknown | null> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Latest file from the dev server, when it is running.
 * "file" means the server already has a pose, or a newer save landed while this fetch was in flight.
 * "empty" means the server answered with no poses. "offline" means the fetch failed.
 */
export async function pullPoseOverrides(): Promise<"file" | "empty" | "offline"> {
  const seen = revision;
  const data = await readJson(SAVE_URL);
  if (revision !== seen) return "file";
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const file = asFile(data);
    notePoseFile(file);
    return Object.keys(file).length > 0 ? "file" : "empty";
  }
  return "offline";
}

function networkFailure(err: unknown): boolean {
  return err instanceof Error && /failed to fetch|networkerror|load failed/i.test(err.message);
}

/** Write the pose into memory, then onto disk when the dev server is up. */
export async function savePoseOverride(name: string, joints: PoseJoints): Promise<"file" | "browser"> {
  noteSavedPose(name, joints);
  const body = JSON.stringify({ pose: name, poseName: name, joints });
  try {
    const res = await fetch(SAVE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const text = await res.text();
    let payload: { ok?: boolean; error?: string } | null = null;
    try {
      payload = JSON.parse(text) as { ok?: boolean; error?: string };
    } catch {
      payload = null;
    }
    if (res.ok && payload?.ok) {
      noteSavedPose(name, joints);
      return "file";
    }
    throw new Error(payload?.error || text || `Save failed (${res.status})`);
  } catch (err) {
    if (networkFailure(err) || err instanceof TypeError) return "browser";
    throw err;
  }
}
