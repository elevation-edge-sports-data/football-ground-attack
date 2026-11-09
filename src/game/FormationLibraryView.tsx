import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { DoubleSide, NeutralToneMapping } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FootballField } from "../field/FootballField";
import { FIELD, PLAY_MAX_X, PLAY_MAX_YARD, PLAY_MIN_X, PLAY_MIN_YARD, clamp } from "../field/spec";
import { poseBallSide } from "./carrierPose";
import { downloadFormationFrame } from "./formationDownload";
import {
  applyFormEdit,
  bundledFormationEntries,
  copiesForRightRemove,
  deleteRepoJson,
  entriesFromFile,
  formationSaveName,
  formationSideOf,
  formUndoDepth,
  freshFormHist,
  libraryRemoveFile,
  libraryStateAfterDelete,
  nextAfterLeftRemove,
  partitionFormationLibrary,
  readFormationLibrary,
  readRetiredFormations,
  recordFormEdit,
  redoFormEdit,
  retiredRepoFiles,
  undoFormEdit,
  writeFormationLibrary,
  writeRetiredFormations,
  type FormationEntry,
  type FormationFrame,
  type FormationPlayer,
  type FormationSide,
  type FormationView,
  type FormEdit,
  type FormHist,
} from "./formationLibrary";
import { worldFromField } from "./frame";
import { PlayerFigure } from "./PlayerFigure";
import {
  UNIFORMS,
  getUniformSelection,
  kitById,
  kitName,
  selectDefenseKit,
  selectOffenseKit,
  subscribeUniforms,
} from "./uniforms";

const BALL_AHEAD = 0.22;
const BALL_RIGHT = 0.4;
const NUDGE = 0.5;
const TURN = Math.PI / 8;

const JERSEY: Record<string, readonly number[]> = {
  QB: [12],
  HB: [28],
  FB: [44],
  TE: [80, 81, 84, 85, 86, 87, 88],
  OL: [60, 61, 63, 65, 70, 72, 74, 76],
  DT: [90, 92, 95, 97, 98],
  LB: [54, 55, 56, 58],
  DB: [20, 21, 24, 26, 31, 32],
};

function jerseyNumber(player: FormationPlayer): number {
  if (player.number !== undefined) return player.number;
  const pool = player.role ? JERSEY[player.role] : undefined;
  if (!pool) return 0;
  const index = Number(player.id.split("-")[1] ?? 0);
  return pool[index % pool.length] ?? pool[0] ?? 0;
}

/** Right-hand spot used by placeBall. North is yaw 0, so the ball sits +X and ahead. */
function seatBall(player: FormationPlayer): { x: number; yard: number } {
  const facingX = -Math.sin(player.yaw);
  const facingYard = Math.cos(player.yaw);
  const rightX = facingYard;
  const rightYard = -facingX;
  return {
    x: clamp(player.x + facingX * BALL_AHEAD + rightX * BALL_RIGHT, PLAY_MIN_X, PLAY_MAX_X),
    yard: clamp(player.yard + facingYard * BALL_AHEAD + rightYard * BALL_RIGHT, PLAY_MIN_YARD, PLAY_MAX_YARD),
  };
}

function centroid(side: FormationSide): [number, number, number] {
  if (!side.players.length) return worldFromField(FIELD.width / 2, 50, 0.9);
  let x = 0;
  let yard = 0;
  for (const player of side.players) {
    x += player.x;
    yard += player.yard;
  }
  const n = side.players.length;
  return worldFromField(x / n, yard / n, 0.9);
}

function scrimmageYard(side: FormationSide): number | null {
  let yard = -Infinity;
  let found = false;
  for (const player of side.players) {
    if (player.role !== "OL" && player.role !== "TE") continue;
    if (player.yard > yard) yard = player.yard;
    found = true;
  }
  return found ? yard + 0.48 : null;
}

function FormationOrbit({ seed, look }: { seed: string; look: [number, number, number] }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const lookRef = useRef(look);
  lookRef.current = look;
  useEffect(() => {
    const orbit = new OrbitControls(camera, gl.domElement);
    orbit.enablePan = true;
    orbit.minDistance = 2;
    orbit.maxDistance = 260;
    orbit.minPolarAngle = 0.12;
    orbit.maxPolarAngle = Math.PI / 2 - 0.04;
    const [x, y, z] = lookRef.current;
    camera.position.set(x, 18, z + 16);
    orbit.target.set(x, y, z);
    orbit.update();
    return () => orbit.dispose();
  }, [camera, gl, seed]);
  return null;
}

function FormationStage({
  frame,
  view,
  picked,
  onPick,
  seed,
}: {
  frame: FormationFrame;
  view: FormationView;
  picked: string | null;
  onPick: (id: string | null) => void;
  seed: string;
}) {
  const kits = useSyncExternalStore(subscribeUniforms, getUniformSelection);
  const side = formationSideOf(frame, view);
  const los = scrimmageYard(side);
  const look = centroid(side);
  return (
    <>
      <color attach="background" args={[FIELD.sky]} />
      <ambientLight intensity={2.6} />
      <hemisphereLight args={["#c5d4e0", "#2f4a28", 0.72]} />
      <directionalLight position={[28, 90, 36]} intensity={1.25} />
      <FootballField />
      {los != null ? (
        <mesh position={worldFromField(FIELD.width / 2, los, 0.06)}>
          <boxGeometry args={[FIELD.width, 0.035, 0.16]} />
          <meshStandardMaterial color="#3b82f6" />
        </mesh>
      ) : null}
      {side.players.map((player) => {
        const pose = typeof player.pose === "string" && player.pose ? player.pose : undefined;
        const owns = side.ball.owner === player.id;
        return (
          <group
            key={player.id}
            position={worldFromField(player.x, player.yard, 0)}
            rotation={[0, player.yaw, 0]}
            onClick={(event) => {
              event.stopPropagation();
              onPick(player.id);
            }}
          >
            <PlayerFigure
              kit={kitById(player.side === "def" ? kits.defId : kits.offId)}
              number={jerseyNumber(player)}
              controlled={false}
              ring={picked === player.id}
              carry={owns}
              ballSide={pose ? poseBallSide(pose) : "r"}
              pose={pose}
            />
          </group>
        );
      })}
      {side.ball.owner == null ? (
        <group position={worldFromField(side.ball.x, side.ball.yard, 0)}>
          <mesh
            position={[0, side.ball.y, 0]}
            onClick={(event) => {
              event.stopPropagation();
              onPick("ball");
            }}
          >
            <sphereGeometry args={[0.18, 24, 16]} />
            <meshStandardMaterial color="#6b3a2a" />
          </mesh>
          {picked === "ball" ? (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
              <ringGeometry args={[0.28, 0.4, 20]} />
              <meshBasicMaterial color="#f4efe4" side={DoubleSide} />
            </mesh>
          ) : null}
        </group>
      ) : null}
      <FormationOrbit seed={seed} look={look} />
    </>
  );
}

function VersionSwitch({
  frame,
  view,
  onView,
  disabled = false,
}: {
  frame: FormationFrame | undefined;
  view: FormationView;
  onView: (next: FormationView) => void;
  disabled?: boolean;
}) {
  if (!frame?.original || !frame.adjusted) return null;
  return (
    <div className="formation-version" role="group" aria-label="Version">
      <button
        type="button"
        className={`btn-ghost${!disabled && view === "original" ? " is-on" : ""}`}
        aria-pressed={!disabled && view === "original"}
        disabled={disabled}
        onClick={() => {
          if (!disabled) onView("original");
        }}
      >
        Original
      </button>
      <button
        type="button"
        className={`btn-ghost${!disabled && view === "adjusted" ? " is-on" : ""}`}
        aria-pressed={!disabled && view === "adjusted"}
        disabled={disabled}
        onClick={() => {
          if (!disabled) onView("adjusted");
        }}
      >
        Adjusted
      </button>
    </div>
  );
}

function FormationList({
  rows,
  selected,
  onChoose,
}: {
  rows: FormationEntry[];
  selected: string | null;
  onChoose: (id: string) => void;
}) {
  if (!rows.length) return null;
  return (
    <ul className="formation-list">
      {rows.map((entry) => (
        <li key={entry.id}>
          <button type="button" className={entry.id === selected ? "is-on" : ""} onClick={() => onChoose(entry.id)}>
            <b>{entry.name}</b>
          </button>
        </li>
      ))}
    </ul>
  );
}

function FormationKits() {
  const kits = useSyncExternalStore(subscribeUniforms, getUniformSelection);
  const [side, setSide] = useState<"off" | "def">("off");
  const pick = (id: number) => {
    if (side === "off") selectOffenseKit(id);
    else selectDefenseKit(id);
  };
  return (
    <div className="formation-kits">
      <div className="uni-side">
        <div className="uni-row">
          {UNIFORMS.map((kit) => {
            const off = kits.offId === kit.id;
            const def = kits.defId === kit.id;
            const tag = off ? "OFF" : def ? "DEF" : undefined;
            const targeted = tag === "OFF" ? side === "off" : tag === "DEF" ? side === "def" : false;
            return (
              <div className="formation-kit" key={kit.id}>
                {tag ? (
                  <button
                    type="button"
                    className={`formation-kit-tag${targeted ? " is-target" : ""}`}
                    aria-pressed={targeted}
                    onClick={() => setSide(tag === "DEF" ? "def" : "off")}
                  >
                    {tag}
                  </button>
                ) : (
                  <span className="formation-kit-tag" />
                )}
                <button
                  type="button"
                  aria-label={kitName(kit)}
                  aria-pressed={off || def}
                  onClick={() => pick(kit.id)}
                  className={`uni-swatch${off || def ? " is-on" : ""}`}
                >
                  <span style={{ background: kit.helmet }} />
                  <span style={{ background: kit.jersey }} />
                  <span style={{ background: kit.pants }} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function libraryEntries(saved: FormationEntry[] = [], retired: string[] = []): FormationEntry[] {
  const { imported, repo } = partitionFormationLibrary(readFormationLibrary(), bundledFormationEntries(), saved, retired);
  return [...repo, ...imported];
}

export function FormationLibraryView() {
  const [saved, setSaved] = useState<FormationEntry[]>([]);
  const [retired, setRetired] = useState<string[]>(() => readRetiredFormations());
  const [entries, setEntries] = useState<FormationEntry[]>(() => libraryEntries([], readRetiredFormations()));
  const [selected, setSelected] = useState<string | null>(() => libraryEntries([], readRetiredFormations())[0]?.id ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importName, setImportName] = useState("");
  const [repoName, setRepoName] = useState("");
  const [depth, setDepth] = useState({ undo: 0, redo: 0 });
  const [view, setView] = useState<FormationView>("adjusted");
  const [picked, setPicked] = useState<string | null>(null);
  const [rev, setRev] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const hist = useRef<FormHist>(freshFormHist());
  const entriesRef = useRef(entries);
  const retiredRef = useRef(retired);
  const savedRef = useRef(saved);
  const selectedRef = useRef(selected);
  const viewRef = useRef(view);
  const pickedRef = useRef(picked);
  entriesRef.current = entries;
  retiredRef.current = retired;
  savedRef.current = saved;
  selectedRef.current = selected;
  viewRef.current = view;
  pickedRef.current = picked;

  const chosen = entries.find((entry) => entry.id === selected) ?? null;
  const imported = entries.filter((entry) => !entry.id.startsWith("bundled:"));
  const repo = entries.filter((entry) => entry.id.startsWith("bundled:"));
  void rev;

  const publishDepth = () => {
    const undo = formUndoDepth(hist.current);
    const redo = hist.current.redo.length;
    setDepth((prev) => (prev.undo === undo && prev.redo === redo ? prev : { undo, redo }));
    setRev((n) => n + 1);
  };

  const applyHist = (edit: FormEdit | null, forward: boolean) => {
    const entry = entriesRef.current.find((item) => item.id === selectedRef.current);
    if (edit && entry) applyFormEdit(entry.frame, viewRef.current, edit, forward);
    publishDepth();
  };

  useEffect(() => {
    const prev = document.title;
    document.title = "Formation Library";
    return () => {
      document.title = prev;
    };
  }, []);

  useEffect(() => {
    hist.current = freshFormHist();
    setDepth({ undo: 0, redo: 0 });
    setPicked(null);
  }, [selected, view]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((event.ctrlKey || event.metaKey) && event.code === "KeyZ" && !event.shiftKey) {
        event.preventDefault();
        applyHist(undoFormEdit(hist.current), false);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (event.code === "KeyY" || (event.shiftKey && event.code === "KeyZ"))) {
        event.preventDefault();
        applyHist(redoFormEdit(hist.current), true);
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const id = pickedRef.current;
      const entry = entriesRef.current.find((item) => item.id === selectedRef.current);
      if (!id || !entry) return;
      let dx = 0;
      let dyard = 0;
      let dyaw = 0;
      if (event.code === "ArrowUp" || event.code === "KeyW") dyard = NUDGE;
      else if (event.code === "ArrowDown" || event.code === "KeyS") dyard = -NUDGE;
      else if (event.code === "ArrowLeft" || event.code === "KeyA") dx = -NUDGE;
      else if (event.code === "ArrowRight" || event.code === "KeyD") dx = NUDGE;
      else if (event.code === "Comma") dyaw = -TURN;
      else if (event.code === "Period") dyaw = TURN;
      else return;
      event.preventDefault();
      const side = formationSideOf(entry.frame, viewRef.current);
      if (id === "ball") {
        if (side.ball.owner || dyaw !== 0) return;
        const x1 = clamp(side.ball.x + dx, PLAY_MIN_X, PLAY_MAX_X);
        const yard1 = clamp(side.ball.yard + dyard, PLAY_MIN_YARD, PLAY_MAX_YARD);
        if (x1 === side.ball.x && yard1 === side.ball.yard) return;
        const edit: FormEdit = { kind: "ball", x0: side.ball.x, yard0: side.ball.yard, x1, yard1 };
        side.ball.x = x1;
        side.ball.yard = yard1;
        recordFormEdit(hist.current, edit, event.repeat);
        publishDepth();
        return;
      }
      const player = side.players.find((row) => row.id === id);
      if (!player) return;
      const x0 = player.x;
      const yard0 = player.yard;
      const yaw0 = player.yaw;
      const x1 = clamp(player.x + dx, PLAY_MIN_X, PLAY_MAX_X);
      const yard1 = clamp(player.yard + dyard, PLAY_MIN_YARD, PLAY_MAX_YARD);
      const yaw1 = player.yaw + dyaw;
      if (x1 === x0 && yard1 === yard0 && yaw1 === yaw0) return;
      const owned = side.ball.owner === player.id;
      const ball0 = owned ? { x: side.ball.x, yard: side.ball.yard } : null;
      player.x = x1;
      player.yard = yard1;
      player.yaw = yaw1;
      let ball1: { x: number; yard: number } | null = null;
      if (owned) {
        ball1 = seatBall(player);
        side.ball.x = ball1.x;
        side.ball.yard = ball1.yard;
      }
      recordFormEdit(
        hist.current,
        { kind: "player", id: player.id, x0, yard0, yaw0, x1, yard1, yaw1, ball0, ball1 },
        event.repeat,
      );
      publishDepth();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const entry = entriesRef.current.find((item) => item.id === selected);
    const name = entry ? entry.name.replace(/\.json$/i, "") : "";
    if (entry?.id.startsWith("bundled:")) {
      setRepoName(name);
      setImportName("");
      return;
    }
    setImportName(entry ? name : "");
    setRepoName("");
  }, [selected]);

  const choose = (id: string) => {
    setSelected(id);
    setView("adjusted");
    setNotice(null);
  };

  const importFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const added: FormationEntry[] = [];
    let n = 0;
    let problem: string | null = null;
    for (const file of list) {
      const text = await file.text();
      const parsed = entriesFromFile(file.name, text, () => `${file.name}-${n++}-${crypto.randomUUID()}`);
      if (typeof parsed === "string") {
        problem = parsed;
        continue;
      }
      added.push(...parsed);
    }
    if (!added.length) {
      setNotice(problem);
      return;
    }
    const stored = [...readFormationLibrary(), ...added];
    setNotice(writeFormationLibrary(stored) ?? problem);
    const next = libraryEntries(saved, retired);
    setEntries(next);
    const first = next.find((entry) => entry.id === added[0]?.id);
    if (first) choose(first.id);
  };

  const keepRetired = (names: string[]) => {
    setRetired(names);
    writeRetiredFormations(names);
  };

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const files = retiredRepoFiles(readRetiredFormations(), bundledFormationEntries());
    if (!files.length) return;
    let cancel = false;
    void (async () => {
      for (const file of files) {
        const deleted = await deleteRepoJson("formations", file);
        if (cancel) return;
        if (!deleted) {
          setNotice("Could not remove that formation.");
          return;
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const remove = async (id: string) => {
    const rows = entriesRef.current;
    const entry = rows.find((item) => item.id === id);
    if (!entry) return;
    const fromRight = entry.id.startsWith("bundled:");
    const priorLocal = readFormationLibrary();
    const copied = copiesForRightRemove(entry, rows, () => `import-${crypto.randomUUID()}`);
    if (copied.length) {
      const copyErr = writeFormationLibrary([...priorLocal, ...copied]);
      if (copyErr) {
        setNotice(copyErr);
        return;
      }
    }
    const file = libraryRemoveFile(entry, rows, retiredRef.current);
    let deleted: string | null = null;
    if (file) {
      deleted = await deleteRepoJson("formations", file);
      if (!deleted) {
        if (copied.length) writeFormationLibrary(priorLocal);
        setNotice("Could not remove that formation.");
        return;
      }
    }
    const next = deleted
      ? libraryStateAfterDelete(readFormationLibrary(), savedRef.current, retiredRef.current, rows, id, deleted)
      : { local: readFormationLibrary().filter((item) => item.id !== id), saved: savedRef.current, retired: retiredRef.current };
    const err = fromRight ? null : writeFormationLibrary(next.local);
    if (deleted) {
      setSaved(next.saved);
      if (next.retired.join("\0") !== retiredRef.current.join("\0")) keepRetired(next.retired);
    }
    const listed = libraryEntries(next.saved, next.retired);
    setEntries(listed);
    setNotice(err);
    if (fromRight) {
      const kept = copied.find((item) => item.name === entry.name) ?? copied[0];
      setSelected(kept?.id ?? null);
      setView("adjusted");
      return;
    }
    if (listed.some((item) => item.id === selectedRef.current)) return;
    const left = listed.filter((item) => !item.id.startsWith("bundled:"));
    const right = listed.filter((item) => item.id.startsWith("bundled:"));
    const pick = nextAfterLeftRemove(left, right);
    setSelected(pick?.id ?? null);
    setView("adjusted");
  };

  const saveCurrent = async (name: string) => {
    const saveName = chosen ? formationSaveName(chosen.name, name) : "";
    if (!chosen || !saveName.trim()) return;
    let res: Response;
    try {
      res = await fetch("/api/formations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: saveName,
          frame: chosen.frame,
          from: chosen.id.startsWith("bundled:") ? chosen.name : undefined,
        }),
      });
    } catch {
      setNotice("Could not save that formation.");
      return;
    }
    if (!res.ok) {
      setNotice("Could not save that formation.");
      return;
    }
    const body = (await res.json()) as { name?: string };
    if (!body.name) {
      setNotice("Could not save that formation.");
      return;
    }
    const entry: FormationEntry = {
      id: `bundled:formations/${body.name}:0`,
      name: body.name,
      frame: chosen.frame,
    };
    if (!chosen.id.startsWith("bundled:")) {
      writeFormationLibrary(readFormationLibrary().filter((item) => item.id !== chosen.id));
    }
    const previous = chosen.id.startsWith("bundled:") && chosen.name !== entry.name ? chosen.name : null;
    let nextRetired = retired.filter((item) => item !== entry.name);
    if (previous && previous !== entry.name && !nextRetired.includes(previous)) nextRetired = [...nextRetired, previous];
    if (nextRetired.join("\0") !== retired.join("\0")) keepRetired(nextRetired);
    const nextSaved = [entry, ...saved.filter((item) => item.name !== entry.name && item.name !== previous)];
    setSaved(nextSaved);
    setEntries(libraryEntries(nextSaved, nextRetired));
    setSelected(entry.id);
    setRepoName(body.name.replace(/\.json$/i, ""));
    setImportName("");
    setNotice(`Saved ${body.name}`);
  };

  const blockSpace = (event: ReactKeyboardEvent) => {
    if (event.code === "Space") event.preventDefault();
  };

  return (
    <div className="formation-lib">
      <style>{FORMATION_CSS}</style>
      <header className="formation-top">
        <div className="formation-top-start">
          <div className="formation-banner-title">
            <p className="eyebrow">Library</p>
            <h1>Formations</h1>
          </div>
          <FormationKits />
        </div>
        <div className="formation-top-center">
          <button type="button" className="btn-primary" onClick={() => fileRef.current?.click()}>
            Import frame
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            multiple
            hidden
            onChange={(event) => {
              void importFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </div>
        <div className="formation-history">
          <button
            type="button"
            className="btn-ghost"
            disabled={!chosen || depth.undo === 0}
            onKeyDown={blockSpace}
            onClick={() => applyHist(undoFormEdit(hist.current), false)}
          >
            Undo
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={!chosen || depth.redo === 0}
            onKeyDown={blockSpace}
            onClick={() => applyHist(redoFormEdit(hist.current), true)}
          >
            Redo
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={!chosen}
            onKeyDown={blockSpace}
            onClick={() => {
              if (chosen) downloadFormationFrame(chosen.frame);
            }}
          >
            Download formation
          </button>
        </div>
      </header>
      <aside className="formation-side">
        <VersionSwitch frame={chosen?.frame} view={view} onView={setView} />
        {imported.length > 0 ? (
          <div className="formation-save">
            <input
              aria-label="Imported formation name"
              value={importName}
              placeholder="Name"
              disabled={!chosen || chosen.id.startsWith("bundled:")}
              onChange={(event) => setImportName(event.target.value)}
            />
            <button
              type="button"
              className="btn-ghost"
              disabled={!chosen || chosen.id.startsWith("bundled:") || !importName.trim()}
              onClick={() => void saveCurrent(importName)}
            >
              Save
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={!chosen || chosen.id.startsWith("bundled:")}
              onClick={() => chosen && void remove(chosen.id)}
            >
              Remove
            </button>
          </div>
        ) : null}
        {notice ? <p className="formation-note">{notice}</p> : null}
        {picked ? <p className="formation-note">Arrows move · , and . turn</p> : null}
        <FormationList rows={imported} selected={selected} onChoose={choose} />
      </aside>
      <aside className="formation-side formation-repo">
        <VersionSwitch frame={chosen?.frame} view={view} onView={setView} disabled={!chosen?.id.startsWith("bundled:")} />
        {repo.length > 0 ? (
          <div className="formation-save">
            <input
              aria-label="Formation file name"
              value={repoName}
              placeholder="Name"
              disabled={!chosen || !chosen.id.startsWith("bundled:")}
              onChange={(event) => setRepoName(event.target.value)}
            />
            <button
              type="button"
              className="btn-ghost"
              disabled={!chosen || !chosen.id.startsWith("bundled:") || !repoName.trim()}
              onClick={() => void saveCurrent(repoName)}
            >
              Rename
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={!chosen || !repo.some((entry) => entry.id === chosen.id)}
              onClick={() => chosen && void remove(chosen.id)}
            >
              Remove
            </button>
          </div>
        ) : null}
        <FormationList rows={repo} selected={selected} onChoose={choose} />
      </aside>
      <div className="formation-stage">
        {chosen ? (
          <Canvas
            className="formation-canvas"
            shadows={false}
            dpr={[1, 1.25]}
            gl={{ antialias: true, toneMapping: NeutralToneMapping, toneMappingExposure: 1 }}
            camera={{ position: [FIELD.width / 2, 18, -34], fov: 42, near: 0.15, far: 900 }}
            onPointerMissed={() => setPicked(null)}
          >
            <FormationStage frame={chosen.frame} view={view} picked={picked} onPick={setPicked} seed={`${chosen.id}:${view}`} />
          </Canvas>
        ) : (
          <div className="formation-empty">Import a frame to view it.</div>
        )}
      </div>
    </div>
  );
}

const FORMATION_CSS = `
.formation-lib {
  --color-bg: #070b12;
  --color-surface: #10161f;
  --color-surface-2: #171e28;
  --color-fg: #e8ece6;
  --color-muted: #8b97a4;
  --color-accent: #fb4f14;
  --color-line: #243040;
  --font-display: "Barlow Condensed", sans-serif;
  --radius-sm: 6px;
  display: grid;
  grid-template-columns: min(280px, 25%) minmax(50%, 1fr) min(280px, 25%);
  grid-template-rows: auto minmax(0, 1fr);
  grid-template-areas:
    "top top top"
    "side stage repo";
  width: 100%;
  height: 100%;
  color: var(--color-fg);
  font-family: "Segoe UI", sans-serif;
  background: var(--color-bg);
}
.formation-lib .formation-top {
  grid-area: top;
  z-index: 3;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 12px 16px;
  padding: 10px 12px;
  background: color-mix(in oklab, var(--color-surface) 94%, transparent);
  border-bottom: 1px solid var(--color-line);
}
.formation-lib .formation-top-start {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
  min-width: 0;
  justify-self: start;
}
.formation-lib .formation-top-center { justify-self: center; }
.formation-lib .formation-top-center .btn-primary { width: auto; }
.formation-lib .formation-banner-title h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.6rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.formation-lib .eyebrow {
  margin: 0;
  font-family: var(--font-display);
  font-size: 0.8rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--color-accent);
}
.formation-lib .formation-history {
  display: flex;
  gap: 8px;
  justify-self: end;
}
.formation-lib .btn-primary,
.formation-lib .btn-ghost {
  min-height: 44px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-line);
  background: var(--color-surface-2);
  color: var(--color-fg);
  font-family: var(--font-display);
  font-size: 1rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 0 16px;
  cursor: pointer;
}
.formation-lib .btn-primary {
  background: var(--color-fg);
  color: var(--color-bg);
  border-color: var(--color-fg);
  font-size: 1.05rem;
}
.formation-lib .btn-ghost:disabled,
.formation-lib .btn-primary:disabled { opacity: 0.4; cursor: default; }
.formation-lib .formation-history .btn-ghost { width: auto; margin: 0; }
.formation-lib .formation-stage {
  grid-area: stage;
  position: relative;
  min-width: 0;
  min-height: 0;
}
.formation-lib .formation-canvas { width: 100%; height: 100%; }
.formation-lib .formation-side {
  grid-area: side;
  position: relative;
  z-index: 2;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 16px;
  background: color-mix(in oklab, var(--color-surface) 94%, transparent);
  border-right: 1px solid var(--color-line);
  container-type: inline-size;
}
.formation-lib .formation-side.formation-repo {
  grid-area: repo;
  border-right: 0;
  border-left: 1px solid var(--color-line);
}
.formation-lib .formation-note {
  margin: 8px 0 12px;
  color: var(--color-muted);
  font-size: 0.85rem;
  line-height: 1.4;
}
.formation-lib .formation-kits { display: grid; gap: 8px; margin: 0; }
.formation-lib .uni-row { display: flex; gap: 4px; flex-wrap: wrap; }
.formation-lib .formation-kit { display: flex; flex-direction: column; align-items: center; }
.formation-lib .formation-kit-tag {
  display: block;
  height: 0.95rem;
  margin-bottom: 4px;
  padding: 0;
  border: 0;
  background: none;
  font-family: var(--font-display);
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  line-height: 0.95rem;
  text-transform: uppercase;
  color: var(--color-muted);
  white-space: nowrap;
}
.formation-lib button.formation-kit-tag { cursor: pointer; }
.formation-lib .formation-kit-tag.is-target { color: var(--color-accent); }
.formation-lib .uni-swatch {
  width: 22px;
  height: 28px;
  display: flex;
  flex-direction: column;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 4px;
  overflow: hidden;
  background: #222;
  cursor: pointer;
}
.formation-lib .uni-swatch.is-on { border-color: var(--color-accent); }
.formation-lib .uni-swatch span { flex: 1 1 0; display: block; }
.formation-lib .formation-version { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; }
.formation-lib .formation-version .btn-ghost { width: auto; margin-top: 0; }
.formation-lib .formation-version .btn-ghost.is-on { border-color: var(--color-accent); }
.formation-lib .formation-save { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 4px; }
.formation-lib .formation-save input {
  flex: 1 0 100%;
  min-width: 0;
  min-height: 44px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  color: var(--color-fg);
  padding: 0 8px;
  font: inherit;
}
.formation-lib .formation-save .btn-ghost { width: auto; flex: 0 0 auto; padding: 0 12px; }
@container (max-width: 220px) {
  .formation-lib .formation-save,
  .formation-lib .formation-version { flex-direction: column; }
  .formation-lib .formation-save .btn-ghost,
  .formation-lib .formation-version .btn-ghost { width: 100%; }
}
.formation-lib .formation-list {
  list-style: none;
  margin: 14px 0 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.formation-lib .formation-list button {
  width: 100%;
  text-align: left;
  border: 1px solid var(--color-line);
  background: var(--color-surface-2);
  color: var(--color-fg);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  cursor: pointer;
}
.formation-lib .formation-list button.is-on { border-color: var(--color-accent); }
.formation-lib .formation-list b {
  display: block;
  font-family: var(--font-display);
  letter-spacing: 0.04em;
  font-weight: 600;
}
.formation-lib .formation-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-muted);
}
`;
