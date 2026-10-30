/**
 * Dev-server writer for src/game/poseOverrides.json.
 * The pose editor POSTs one named pose. The same file is bundled into the app.
 *
 * Joint ids match src/game/pose.ts. Pose names may contain spaces ("pose 1").
 */
import { copyFileSync, existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const POSE_JOINTS = [
  "body",
  "torso",
  "hips",
  "shoulders",
  "head",
  "lArm",
  "lFore",
  "lHand",
  "rArm",
  "rFore",
  "rHand",
  "football",
  "lLeg",
  "lShin",
  "lFoot",
  "rLeg",
  "rShin",
  "rFoot",
];

const POSE_NAME = /^[a-zA-Z][a-zA-Z0-9 -]{0,48}$/;

function posePath(root) {
  return join(root, "src", "game", "poseOverrides.json");
}

function readPoseOverrides(root) {
  const path = posePath(root);
  if (!existsSync(path)) return {};
  const data = JSON.parse(readFileSync(path, "utf8"));
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("poseOverrides.json must be an object");
  }
  return data;
}

function formatPoseFile(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

function parsePoseSave(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("pose save must be an object");
  }
  const pose = typeof body.pose === "string" ? body.pose : body.poseName;
  if (typeof pose !== "string" || !POSE_NAME.test(pose)) {
    throw new Error("pick a named pose");
  }
  const raw = body.joints;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("pose joints must be an object");
  }
  const joints = {};
  for (const id of POSE_JOINTS) {
    if (!(id in raw)) continue;
    const triple = raw[id];
    if (!Array.isArray(triple) || triple.length < 3) throw new Error(`bad joint ${id}`);
    const count = triple.length >= 6 ? 6 : 3;
    const nums = [];
    for (let i = 0; i < count; i++) {
      const n = Number(triple[i]);
      if (!Number.isFinite(n)) throw new Error(`bad joint ${id}`);
      nums.push(n);
    }
    joints[id] = nums;
  }
  if (Object.keys(joints).length === 0) throw new Error("pose has no joints");
  return { pose, joints };
}

function writePoseOverride(root, pose, joints) {
  const path = posePath(root);
  const next = { ...readPoseOverrides(root), [pose]: joints };
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, formatPoseFile(next));
  copyFileSync(tmp, path);
  unlinkSync(tmp);
  return next;
}

function isPoseFile(file) {
  const norm = String(file).replaceAll("\\", "/");
  return norm.endsWith("/src/game/poseOverrides.json") || norm.endsWith("/src/game/poseOverrides.json.tmp");
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.statusCode = status;
  res.setHeader("Content-Type", type);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(body);
}

function attach(middlewares, root) {
  middlewares.use((req, res, next) => {
    const pathOnly = (req.url ?? "").split("?", 1)[0];
    if (pathOnly !== "/api/pose-overrides") {
      next();
      return;
    }
    if (req.method === "OPTIONS") {
      send(res, 204, "");
      return;
    }
    if (req.method === "GET") {
      try {
        send(res, 200, formatPoseFile(readPoseOverrides(root)));
      } catch (err) {
        send(res, 500, JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "pose overrides unreadable" }));
      }
      return;
    }
    if (req.method !== "POST") {
      next();
      return;
    }
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        send(res, 413, JSON.stringify({ ok: false, error: "pose save is too large" }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (res.writableEnded) return;
      try {
        const parsed = parsePoseSave(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        writePoseOverride(root, parsed.pose, parsed.joints);
        send(res, 200, JSON.stringify({ ok: true, pose: parsed.pose }));
      } catch (err) {
        send(res, 400, JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "bad pose" }));
      }
    });
  });
}

export function poseOverridesPlugin() {
  return {
    name: "fga-pose-overrides",
    configureServer(server) {
      attach(server.middlewares, server.config.root);
    },
    configurePreviewServer(server) {
      attach(server.middlewares, server.config.root);
    },
    handleHotUpdate(ctx) {
      if (isPoseFile(ctx.file)) return [];
    },
  };
}
