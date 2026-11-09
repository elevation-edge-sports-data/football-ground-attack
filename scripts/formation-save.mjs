/**
 * Write one formation JSON into the repo formations/ folder.
 * Dev-server only. The browser posts the current frame and a file name.
 */
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function formationFileName(raw) {
  if (typeof raw !== "string") return null;
  const base = raw.trim().replace(/\\/g, "/").split("/").pop() ?? "";
  const stripped = base.replace(/\.json$/i, "").trim();
  if (!stripped || stripped === "." || stripped === "..") return null;
  if (stripped.length > 80) return null;
  if (/[<>:"|?*\u0000-\u001f]/.test(stripped)) return null;
  return `${stripped}.json`;
}

export function saveFormationFile(root, rawName, frame, rawFrom) {
  const name = formationFileName(rawName);
  if (!name) throw new Error("bad name");
  if (!frame || typeof frame !== "object" || Array.isArray(frame)) throw new Error("bad frame");
  const dir = join(root, "formations");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), `${JSON.stringify(frame, null, 2)}\n`);
  const from = typeof rawFrom === "string" ? formationFileName(rawFrom) : null;
  if (from && from !== name) {
    const prev = join(dir, from);
    if (existsSync(prev)) unlinkSync(prev);
  }
  return name;
}

/** Unlink one formation file. A missing file is already removed. */
export function deleteFormationFile(root, rawName) {
  return deleteNamedFile(root, "formations", rawName);
}

/** One clip is a JSON array of formation frames. */
export function saveReplayFile(root, rawName, frames, rawFrom) {
  const name = formationFileName(rawName);
  if (!name) throw new Error("bad name");
  if (!Array.isArray(frames) || frames.length === 0) throw new Error("bad frames");
  const dir = join(root, "replays");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), `${JSON.stringify(frames, null, 2)}\n`);
  const from = typeof rawFrom === "string" ? formationFileName(rawFrom) : null;
  if (from && from !== name) {
    const prev = join(dir, from);
    if (existsSync(prev)) unlinkSync(prev);
  }
  return name;
}

export function deleteReplayFile(root, rawName) {
  return deleteNamedFile(root, "replays", rawName);
}

function deleteNamedFile(root, folder, rawName) {
  const name = formationFileName(rawName);
  if (!name) throw new Error("bad name");
  const file = join(root, folder, name);
  if (existsSync(file)) unlinkSync(file);
  if (existsSync(file)) throw new Error("file still on disk");
  return name;
}

const ROUTES = {
  "/api/formations": 1_000_000,
  "/api/replays": 32_000_000,
};

function isLibraryFile(file) {
  const norm = String(file).replaceAll("\\", "/");
  return /\/formations\/[^/]+\.json$/.test(norm) || /\/replays\/[^/]+\.json$/.test(norm);
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(body);
}

function attach(middlewares, root) {
  middlewares.use((req, res, next) => {
    const pathOnly = (req.url ?? "").split("?", 1)[0];
    const saveLimit = ROUTES[pathOnly];
    if (!saveLimit) {
      next();
      return;
    }
    if (req.method === "OPTIONS") {
      send(res, 204, "");
      return;
    }
    if (req.method !== "POST" && req.method !== "DELETE") {
      next();
      return;
    }
    const chunks = [];
    let size = 0;
    const limit = req.method === "DELETE" ? 64_000 : saveLimit;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        send(res, 413, JSON.stringify({ ok: false, error: "formation save is too large" }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (res.writableEnded) return;
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        const replay = pathOnly === "/api/replays";
        const name =
          req.method === "DELETE"
            ? replay
              ? deleteReplayFile(root, body.name)
              : deleteFormationFile(root, body.name)
            : replay
              ? saveReplayFile(root, body.name, body.frames, body.from)
              : saveFormationFile(root, body.name, body.frame, body.from);
        send(res, 200, JSON.stringify({ name }));
      } catch (err) {
        send(res, 400, JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "bad formation" }));
      }
    });
  });
}

export function formationsSavePlugin() {
  return {
    name: "fga-formations-save",
    configureServer(server) {
      attach(server.middlewares, server.config.root);
    },
    configurePreviewServer(server) {
      attach(server.middlewares, server.config.root);
    },
    handleHotUpdate(ctx) {
      if (isLibraryFile(ctx.file)) return [];
    },
  };
}
