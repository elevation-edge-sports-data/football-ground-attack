import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import * as THREE from "three";
import { PlayerFigure } from "./PlayerFigure";
import { POSE_JOINTS, type PoseJointId } from "./pose";
import { applyPoseJoints, pullPoseOverrides, readStoredPoseFile, notePoseFile, savePoseOverride, type PoseJoints } from "./poseOverrides";
import {
  addWorldEuler,
  addWorldPosition,
  applyWorldQuaternion,
  readWorldEuler,
  readWorldPosition,
  rotateAboutWorldAxis,
  rotationWorldQuaternion,
  setWorldEulerAxis,
  setWorldPositionAxis,
} from "./poseWorldEuler";
import { UniformBanner } from "./UniformBanner";
import { kitById, PLAYER_NUMBERS, getUniformSelection, subscribeUniforms } from "./uniforms";

const POSE_ID = "pose 1";
const POSES = [POSE_ID] as const;

const BG_KEY = "fga-pose-editor-bg";
const SCENE_BG = { dark: "#0a0a0c", gray: "#79797b", light: "#e8e8ea" } as const;
const GRID_BG = {
  dark: ["#2a2a2a", "#1a1a1a"],
  gray: ["#3a3a40", "#a4a4aa"],
  light: ["#b9b9c2", "#d0d0d6"],
} as const;
type SceneBg = keyof typeof SCENE_BG;

function loadSceneBg(): SceneBg {
  try {
    const saved = localStorage.getItem(BG_KEY);
    if (saved === "dark" || saved === "gray" || saved === "light") return saved;
  } catch {
    return "gray";
  }
  return "gray";
}

const BODY_PARTS: { id: PoseJointId; label: string }[] = [
  { id: "body", label: "Body" },
  { id: "torso", label: "Torso" },
  { id: "hips", label: "Hips" },
  { id: "shoulders", label: "Shoulders" },
  { id: "head", label: "Head" },
  { id: "lArm", label: "Left Upper Arm" },
  { id: "lFore", label: "Left Forearm" },
  { id: "lHand", label: "Left Hand" },
  { id: "rArm", label: "Right Upper Arm" },
  { id: "rFore", label: "Right Forearm" },
  { id: "rHand", label: "Right Hand" },
  { id: "football", label: "Football" },
  { id: "lLeg", label: "Left Thigh" },
  { id: "lShin", label: "Left Shin" },
  { id: "lFoot", label: "Left Foot" },
  { id: "rLeg", label: "Right Thigh" },
  { id: "rShin", label: "Right Shin" },
  { id: "rFoot", label: "Right Foot" },
];

type EditApi = {
  undo: () => void;
  redo: () => void;
  /** Record the part, run `mutate`, then keep the previous pose if it changed. */
  commit: (object: THREE.Object3D, mutate: () => void) => void;
};

/** World pose of one body part. Restores a drag, a typed value, or a nudge. */
type PartSnap = {
  object: THREE.Object3D;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
};

type GizmoControls = TransformControls & { rotationAngle: number };

const POS_STEP = 0.01;
const ROT_STEP = 0.05;
/** Keep a nudged part origin inside the frame, not on the exact pixel edge. */
const VIEW_MARGIN = 0.96;

const UNDO_MAX = 20;
const _partPos = new THREE.Vector3();
const _partQuat = new THREE.Quaternion();
const _viewWorld = new THREE.Vector3();
const _viewCam = new THREE.Vector3();
const _viewFwd = new THREE.Vector3();
const _viewNdc = new THREE.Vector3();
const _quatStart = new THREE.Quaternion();
let _spinTarget: THREE.Object3D | null = null;

/** Remember the world orientation before a drag. The part turns about its own origin. */
function beginRotationDrag(part: THREE.Object3D) {
  _spinTarget = part;
  rotationWorldQuaternion(part, _quatStart);
}

/** Turn the drag target about one fixed world axis, from the pointer-down pose. */
function applyRotationDrag(axis: "X" | "Y" | "Z", angle: number) {
  const target = _spinTarget;
  if (!target) return;
  rotateAboutWorldAxis(target, axis, angle, _quatStart);
  target.updateMatrixWorld(true);
}

/** Pull a part origin back into the camera's current view. */
function clampPartToView(object: THREE.Object3D, camera: THREE.Camera) {
  const parent = object.parent;
  if (!parent) return;
  object.updateWorldMatrix(true, false);
  camera.updateMatrixWorld();
  object.getWorldPosition(_viewWorld);
  camera.getWorldPosition(_viewCam);
  camera.getWorldDirection(_viewFwd);
  const ahead = _viewWorld.x * _viewFwd.x + _viewWorld.y * _viewFwd.y + _viewWorld.z * _viewFwd.z
    - (_viewCam.x * _viewFwd.x + _viewCam.y * _viewFwd.y + _viewCam.z * _viewFwd.z);
  const near = camera instanceof THREE.PerspectiveCamera ? camera.near : 0.1;
  if (ahead < near * 4) _viewWorld.addScaledVector(_viewFwd, near * 4 - ahead);
  _viewNdc.copy(_viewWorld).project(camera);
  const nx = _viewNdc.x;
  const ny = _viewNdc.y;
  const nz = _viewNdc.z;
  const x = THREE.MathUtils.clamp(nx, -VIEW_MARGIN, VIEW_MARGIN);
  const y = THREE.MathUtils.clamp(ny, -VIEW_MARGIN, VIEW_MARGIN);
  const zOk = Number.isFinite(nz) && nz >= -1 && nz <= 1;
  const z = zOk ? nz : THREE.MathUtils.clamp(Number.isFinite(nz) ? nz : 0, -0.98, 0.98);
  const onScreen = ahead >= near * 4 && Math.abs(nx) <= VIEW_MARGIN + 1e-4 && Math.abs(ny) <= VIEW_MARGIN + 1e-4 && zOk;
  if (onScreen) return;
  _viewNdc.set(x, y, z).unproject(camera);
  parent.worldToLocal(_viewNdc);
  object.position.copy(_viewNdc);
}

function capturePart(object: THREE.Object3D): PartSnap {
  object.updateWorldMatrix(true, false);
  return {
    object,
    position: object.getWorldPosition(new THREE.Vector3()),
    quaternion: rotationWorldQuaternion(object, new THREE.Quaternion()),
  };
}

function partMoved(snap: PartSnap): boolean {
  snap.object.updateWorldMatrix(true, false);
  snap.object.getWorldPosition(_partPos);
  rotationWorldQuaternion(snap.object, _partQuat);
  if (_partPos.distanceToSquared(snap.position) > 1e-10) return true;
  return Math.abs(1 - Math.abs(_partQuat.dot(snap.quaternion))) > 1e-8;
}

function applyPart(snap: PartSnap) {
  const parent = snap.object.parent;
  if (!parent) return;
  parent.updateWorldMatrix(true, false);
  parent.worldToLocal(snap.object.position.copy(snap.position));
  applyWorldQuaternion(snap.object, snap.quaternion);
  snap.object.updateMatrixWorld();
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function Scene({
  selected,
  mode,
  object,
  setParts,
  setSelected,
  token,
  sceneBg,
  kitId,
  editApi,
  onHistory,
  editable,
}: {
  selected: string | null;
  mode: "translate" | "rotate";
  object: THREE.Object3D | null;
  setParts: (refs: Partial<Record<PoseJointId, THREE.Object3D | null>>) => void;
  setSelected: (id: PoseJointId) => void;
  token: number;
  sceneBg: SceneBg;
  kitId: number;
  editApi: { current: EditApi };
  onHistory: (undo: number, redo: number) => void;
  editable: boolean;
}) {
  const orbitRef = useRef<OrbitControls | null>(null);
  const objectRef = useRef(object);
  objectRef.current = object;
  const invalidate = useThree((s) => s.invalidate);
  const camera = useThree((s) => s.camera);
  const pastRef = useRef<PartSnap[]>([]);
  const futureRef = useRef<PartSnap[]>([]);
  const pendingRef = useRef<PartSnap | null>(null);
  const partsRef = useRef<Partial<Record<PoseJointId, THREE.Object3D | null>>>({});

  const publishHistory = () => onHistory(pastRef.current.length, futureRef.current.length);

  const pushPast = (before: PartSnap) => {
    futureRef.current = [];
    pastRef.current.push(before);
    if (pastRef.current.length > UNDO_MAX) pastRef.current.shift();
    publishHistory();
  };

  const rememberDrag = () => {
    const current = objectRef.current;
    if (!current) return;
    pendingRef.current = capturePart(current);
    beginRotationDrag(current);
  };

  const commitDrag = () => {
    const current = objectRef.current;
    const before = pendingRef.current;
    pendingRef.current = null;
    if (!current || !before || before.object !== current) return;
    clampPartToView(current, camera);
    if (!partMoved(before)) return;
    pushPast(before);
    invalidate();
  };

  editApi.current.commit = (target, mutate) => {
    if (!target.parent) return;
    const before = capturePart(target);
    mutate();
    target.updateWorldMatrix(true, false);
    if (target.getWorldPosition(_viewWorld).distanceToSquared(before.position) > 1e-10) clampPartToView(target, camera);
    target.updateMatrixWorld();
    if (!partMoved(before)) return;
    pushPast(before);
    invalidate();
  };

  editApi.current.undo = () => {
    const before = pastRef.current[pastRef.current.length - 1];
    if (!before?.object.parent) return;
    const current = capturePart(before.object);
    pastRef.current.pop();
    futureRef.current.push(current);
    applyPart(before);
    publishHistory();
    invalidate();
  };

  editApi.current.redo = () => {
    const next = futureRef.current[futureRef.current.length - 1];
    if (!next?.object.parent) return;
    const current = capturePart(next.object);
    futureRef.current.pop();
    pastRef.current.push(current);
    if (pastRef.current.length > UNDO_MAX) pastRef.current.shift();
    applyPart(next);
    publishHistory();
    invalidate();
  };

  useLayoutEffect(() => {
    pastRef.current = [];
    futureRef.current = [];
    pendingRef.current = null;
    onHistory(0, 0);
  }, [onHistory, token]);

  useLayoutEffect(() => {
    if (!partsRef.current.body) return;
    applyPoseJoints(POSE_ID, partsRef.current);
    invalidate();
  }, [invalidate, token]);

  const reportParts = useCallback((refs: Partial<Record<PoseJointId, THREE.Object3D | null>>) => {
    const first = !partsRef.current.body && !!refs.body;
    partsRef.current = refs;
    setParts(refs);
    if (first) {
      applyPoseJoints(POSE_ID, refs);
      invalidate();
    }
  }, [invalidate, setParts]);

  useEffect(() => {
    invalidate();
  }, [invalidate, mode, object, sceneBg, selected]);

  return (
    <>
      <color attach="background" args={[SCENE_BG[sceneBg]]} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[4, 7, 4]} intensity={1.1} />
      <gridHelper args={[8, 16, GRID_BG[sceneBg][0], GRID_BG[sceneBg][1]]} />
      <PlayerFigure
        kit={kitById(kitId)}
        number={PLAYER_NUMBERS.qb ?? 10}
        controlled={false}
        carry
        onJointRefs={reportParts}
        onJointClick={editable ? setSelected : undefined}
      />
      {editable && object ? (
        <WorldGizmo
          object={object}
          mode={mode}
          orbitRef={orbitRef}
          onDragStart={rememberDrag}
          onDragEnd={commitDrag}
          onDrag={(controls) => {
            const part = objectRef.current;
            if (!part || !controls.dragging) return;
            const axis = controls.axis;
            // X/Y/Z drags turn about fixed world axes. Translate is already world-space on the gizmo.
            if (controls.mode === "rotate" && (axis === "X" || axis === "Y" || axis === "Z")) {
              applyRotationDrag(axis, controls.rotationAngle);
            }
          }}
        />
      ) : null}
      <EditorOrbit orbitRef={orbitRef} />
    </>
  );
}

const EditorScene = memo(Scene);

function EditorOrbit({ orbitRef }: { orbitRef: { current: OrbitControls | null } }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    const orbit = new OrbitControls(camera, gl.domElement);
    orbit.enableDamping = false;
    orbit.target.set(0, 0.95, 0);
    orbit.update();
    const onChange = () => invalidate();
    orbit.addEventListener("change", onChange);
    orbitRef.current = orbit;
    invalidate();
    return () => {
      orbit.removeEventListener("change", onChange);
      orbit.dispose();
      if (orbitRef.current === orbit) orbitRef.current = null;
    };
  }, [camera, gl, invalidate, orbitRef]);

  return null;
}

function WorldGizmo({
  object,
  mode,
  orbitRef,
  onDragStart,
  onDrag,
  onDragEnd,
}: {
  object: THREE.Object3D;
  mode: "translate" | "rotate";
  orbitRef: { current: OrbitControls | null };
  onDragStart: () => void;
  onDrag: (controls: GizmoControls) => void;
  onDragEnd: () => void;
}) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const [controls, setControls] = useState<GizmoControls | null>(null);
  const startRef = useRef(onDragStart);
  const dragRef = useRef(onDrag);
  const endRef = useRef(onDragEnd);
  startRef.current = onDragStart;
  dragRef.current = onDrag;
  endRef.current = onDragEnd;

  useEffect(() => {
    const next = new TransformControls(camera, gl.domElement) as GizmoControls;
    next.setSpace("world");
    next.setSize(0.55);
    setControls(next);
    return () => {
      next.detach();
      next.dispose();
    };
  }, [camera, gl]);

  useLayoutEffect(() => {
    if (!controls) return;
    controls.setMode(mode);
    controls.setSpace("world");
  }, [controls, mode]);

  useLayoutEffect(() => {
    if (!controls) return;
    controls.attach(object);
    return () => {
      controls.detach();
    };
  }, [controls, object]);

  useEffect(() => {
    if (!controls) return;
    const down = () => {
      if (orbitRef.current) orbitRef.current.enabled = false;
      startRef.current();
    };
    const up = () => {
      if (orbitRef.current) orbitRef.current.enabled = true;
      endRef.current();
      invalidate();
    };
    const changed = () => {
      dragRef.current(controls);
      invalidate();
    };
    controls.addEventListener("mouseDown", down);
    controls.addEventListener("mouseUp", up);
    controls.addEventListener("objectChange", changed);
    return () => {
      controls.removeEventListener("mouseDown", down);
      controls.removeEventListener("mouseUp", up);
      controls.removeEventListener("objectChange", changed);
    };
  }, [controls, invalidate, orbitRef]);

  if (!controls) return null;
  return <primitive object={controls.getHelper()} />;
}

function typingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function PoseEditor() {
  const [token, setToken] = useState(0);
  const [fileReady, setFileReady] = useState(false);
  const [selected, setSelected] = useState<PoseJointId | null>("lShin");
  const [mode, setMode] = useState<"translate" | "rotate">("rotate");
  const [sceneBg, setSceneBg] = useState<SceneBg>(loadSceneBg);
  const [parts, setPartsState] = useState<Partial<Record<PoseJointId, THREE.Object3D | null>>>({});
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState("");
  const [hist, setHist] = useState({ undo: 0, redo: 0 });
  const [partRev, setPartRev] = useState(0);
  const selection = useSyncExternalStore(subscribeUniforms, getUniformSelection);
  const savingRef = useRef(false);
  const editApi = useRef<EditApi>({
    undo: () => {},
    redo: () => {},
    commit: () => {},
  });
  savingRef.current = saving;
  const partsRef = useRef(parts);
  partsRef.current = parts;

  const onHistory = useCallback((undo: number, redo: number) => {
    setHist({ undo, redo });
    setPartRev((n) => n + 1);
  }, []);

  const commitParts = useCallback((next: Partial<Record<PoseJointId, THREE.Object3D | null>>) => {
    setPartsState((prev) => {
      const keys = Object.keys(next) as PoseJointId[];
      const prevKeys = Object.keys(prev) as PoseJointId[];
      if (keys.length === prevKeys.length && keys.every((key) => prev[key] === next[key])) return prev;
      return next;
    });
  }, []);

  useEffect(() => {
    let current = true;
    void (async () => {
      const status = await pullPoseOverrides();
      if (current && status !== "file") {
        const stored = readStoredPoseFile();
        if (stored) notePoseFile(stored);
      }
      if (current) setFileReady(true);
    })();
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(BG_KEY, sceneBg);
    } catch {
      /* ignore */
    }
  }, [sceneBg]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !typingTarget(event.target) && !savingRef.current) {
        const key = event.key.toLowerCase();
        if (key === "z" && !event.shiftKey) {
          event.preventDefault();
          editApi.current.undo();
          return;
        }
        if ((key === "z" && event.shiftKey) || key === "y") {
          event.preventDefault();
          editApi.current.redo();
          return;
        }
      }
      if (savingRef.current || event.metaKey || event.ctrlKey || event.altKey || typingTarget(event.target)) return;
      if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        setMode("rotate");
      } else if (event.key === "t" || event.key === "T") {
        event.preventDefault();
        setMode("translate");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const info = BODY_PARTS.find((part) => part.id === selected);
  const controlObject = selected ? parts[selected] ?? null : null;
  const canSave = !saving && fileReady && !!parts.body;

  const savePose = () => {
    if (saving || !parts.body) return;
    const saved: PoseJoints = {};
    for (const id of POSE_JOINTS) {
      const group = partsRef.current[id];
      if (!group) continue;
      const rotation = group.rotation;
      const position = group.position;
      saved[id] = [
        round4(rotation.x),
        round4(rotation.y),
        round4(rotation.z),
        round4(position.x),
        round4(position.y),
        round4(position.z),
      ];
    }
    if (!saved.body) {
      setSaveNote("The pose is still settling.");
      return;
    }
    setSaving(true);
    setSaveNote("Saving…");
    savePoseOverride(POSE_ID, saved).then(
      (where) => {
        applyPoseJoints(POSE_ID, partsRef.current);
        setSaveNote(where === "file" ? "Saved." : "Saved in this browser.");
      },
      (err: unknown) => {
        setSaveNote(err instanceof Error ? err.message : "Save failed.");
      },
    ).finally(() => {
      setSaving(false);
    });
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(220px, 360px) minmax(0, 1fr) auto 220px",
        gridTemplateRows: "auto minmax(0, 1fr)",
        width: "100%",
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
        background: "#070b12",
        color: "#e8ece6",
      }}
    >
      <div style={{ ...barCell, gridColumn: 1, gridRow: 1 }}>
        <div style={{ ...selectedLine, flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          Selected: {POSE_ID}
        </div>
        <button
          type="button"
          onClick={savePose}
          disabled={!canSave}
          style={{
            ...btn(canSave, "green"),
            flex: "0 0 auto",
            fontWeight: 700,
            opacity: canSave ? 1 : 0.45,
            cursor: canSave ? "pointer" : "default",
          }}
        >
          {saving ? "Saving…" : "Save pose"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (saving) return;
            setToken((n) => n + 1);
          }}
          style={{ ...btn(false), flex: "0 0 auto" }}
        >
          Reset
        </button>
      </div>
      <div style={{ ...barCell, flexDirection: "column", alignItems: "stretch", gap: 6, gridColumn: "2 / 4", gridRow: 1 }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 16, flexWrap: "wrap", minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => editApi.current.undo()}
              disabled={hist.undo === 0 || saving}
              style={histBtn(hist.undo > 0 && !saving)}
            >
              Undo
            </button>
            <button
              type="button"
              onClick={() => editApi.current.redo()}
              disabled={hist.redo === 0 || saving}
              style={histBtn(hist.redo > 0 && !saving)}
            >
              Redo
            </button>
            <button type="button" onClick={() => setMode("rotate")} style={btn(mode === "rotate", "charcoal")}>
              Rotate
            </button>
            <button type="button" onClick={() => setMode("translate")} style={btn(mode === "translate", "charcoal")}>
              Translate
            </button>
          </div>
          <UniformBanner inline />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" aria-pressed={sceneBg === "dark"} onClick={() => setSceneBg("dark")} style={btn(sceneBg === "dark", "charcoal")}>
              Dark
            </button>
            <button type="button" aria-pressed={sceneBg === "gray"} onClick={() => setSceneBg("gray")} style={btn(sceneBg === "gray", "charcoal")}>
              Gray
            </button>
            <button type="button" aria-pressed={sceneBg === "light"} onClick={() => setSceneBg("light")} style={btn(sceneBg === "light", "charcoal")}>
              Light
            </button>
          </div>
        </div>
        {saveNote ? (
          <div
            style={{
              fontFamily: '"Barlow Condensed", sans-serif',
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              fontSize: 14,
              lineHeight: 1.3,
              color: saveNote.startsWith("Saved") ? "#9c9" : saveNote.startsWith("Saving") ? "#9ab" : "#f0a0a0",
            }}
          >
            {saveNote}
          </div>
        ) : null}
      </div>
      <div style={{ ...barCell, ...selectedLine, gridColumn: 4, gridRow: 1 }}>
        Selected: {info?.label ?? "none"}
      </div>
      <aside
        style={{
          gridColumn: 1,
          gridRow: 2,
          width: 220,
          flex: "0 0 220px",
          height: "100%",
          minHeight: 0,
          overflowY: "auto",
          borderRight: "1px solid #243040",
          background: "#10161f",
          padding: "16px 12px",
        }}
      >
        <div style={menuHead}>Poses</div>
        {POSES.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed
            onClick={() => {
              if (saving) return;
              setToken((n) => n + 1);
            }}
            style={menuRow(true)}
          >
            {id}
          </button>
        ))}
      </aside>

      <div style={{ gridColumn: 2, gridRow: 2, flex: 1, minWidth: 0, minHeight: 0, height: "100%", background: SCENE_BG[sceneBg] }}>
        {fileReady ? (
          <Canvas
            frameloop="demand"
            camera={{ position: [2.8, 1.6, -3.6], fov: 38, near: 0.05, far: 80 }}
            onCreated={({ camera }) => {
              camera.lookAt(0, 0.95, 0);
            }}
          >
            <EditorScene
              selected={selected}
              mode={mode}
              object={controlObject}
              setParts={commitParts}
              setSelected={setSelected}
              token={token}
              sceneBg={sceneBg}
              kitId={selection.offId}
              editApi={editApi}
              onHistory={onHistory}
              editable={!saving}
            />
          </Canvas>
        ) : null}
      </div>

      {controlObject ? (
        <aside
          style={{
            gridColumn: 3,
            gridRow: 2,
            alignSelf: "start",
            justifySelf: "stretch",
            height: "auto",
            background: "#10161f",
            color: "#e8ece6",
            padding: "16px 12px",
            borderLeft: "1px solid #243040",
          }}
        >
          <PartNumbers
            object={controlObject}
            revision={partRev}
            disabled={saving}
            onCommit={(apply) => {
              if (!controlObject || saving) return;
              editApi.current.commit(controlObject, () => apply(controlObject));
            }}
          />
        </aside>
      ) : null}

      <aside
        style={{
          gridColumn: 4,
          gridRow: 2,
          width: 220,
          flex: "0 0 220px",
          height: "100%",
          minHeight: 0,
          overflowY: "auto",
          background: "#10161f",
          color: "#e8ece6",
          padding: "16px 12px",
          borderLeft: "1px solid #243040",
        }}
      >
        {BODY_PARTS.map((part) => {
          const on = selected === part.id;
          const ready = !!parts[part.id];
          return (
            <button
              key={part.id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                if (saving) return;
                setSelected(part.id);
              }}
              disabled={saving || !ready}
              style={{ ...menuRow(on), opacity: saving || !ready ? 0.4 : 1 }}
            >
              {part.label}
            </button>
          );
        })}
      </aside>
    </div>
  );
}

function menuRow(on: boolean): CSSProperties {
  return {
    display: "block",
    width: "100%",
    textAlign: "left",
    marginBottom: 4,
    padding: "8px 10px",
    border: "none",
    borderLeft: on ? "3px solid #7eb8d4" : "3px solid transparent",
    borderRadius: 6,
    background: on ? "#1c2836" : "transparent",
    color: on ? "#e8ece6" : "#8b97a4",
    fontFamily: '"Barlow Condensed", sans-serif',
    fontSize: 16,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    cursor: "pointer",
  };
}

const barCell: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minHeight: 48,
  padding: "8px 12px",
  background: "#10161f",
  borderBottom: "1px solid #243040",
};

const menuHead: CSSProperties = {
  fontFamily: '"Barlow Condensed", sans-serif',
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  fontSize: 18,
  margin: "0 8px 12px",
};

const selectedLine: CSSProperties = {
  fontFamily: '"Barlow Condensed", sans-serif',
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  fontSize: 16,
};

function PartNumbers({
  object,
  revision,
  disabled,
  onCommit,
}: {
  object: THREE.Object3D | null;
  revision: number;
  disabled: boolean;
  onCommit: (apply: (object: THREE.Object3D) => void) => void;
}) {
  if (!object) return null;
  const axes = ["x", "y", "z"] as const;
  const worldPos = readWorldPosition(object);
  const worldRot = readWorldEuler(object);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 16 }}>
      <div>
        <div style={menuHead}>World position</div>
        {axes.map((axis) => (
          <AxisRow
            key={`p-${axis}-${revision}`}
            label={axis.toUpperCase()}
            value={worldPos[axis]}
            disabled={disabled}
            onCommit={(next) => onCommit((obj) => setWorldPositionAxis(obj, axis, next))}
            onNudge={(dir) => onCommit((obj) => addWorldPosition(obj, axis, dir * POS_STEP))}
          />
        ))}
      </div>
      <div>
        <div style={menuHead}>World rotation</div>
        {axes.map((axis) => (
          <AxisRow
            key={`r-${axis}-${revision}`}
            label={axis.toUpperCase()}
            value={worldRot[axis]}
            disabled={disabled}
            onCommit={(next) => onCommit((obj) => setWorldEulerAxis(obj, axis, next))}
            onNudge={(dir) => onCommit((obj) => addWorldEuler(obj, axis, dir * ROT_STEP))}
          />
        ))}
      </div>
    </div>
  );
}

function AxisRow({
  label,
  value,
  disabled,
  onCommit,
  onNudge,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onCommit: (next: number) => void;
  onNudge: (dir: -1 | 1) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
      <span style={{ width: 14, color: "#8b97a4", fontFamily: '"Barlow Condensed", sans-serif' }}>{label}</span>
      <button type="button" aria-label={`Decrease ${label}`} disabled={disabled} onClick={() => onNudge(-1)} style={nudgeBtn}>
        −
      </button>
      <input
        defaultValue={value.toFixed(4)}
        disabled={disabled}
        aria-label={label}
        inputMode="decimal"
        onBlur={(event) => {
          const next = Number(event.target.value);
          if (!Number.isFinite(next) || Math.abs(next) > 1e6) {
            event.target.value = value.toFixed(4);
            return;
          }
          if (Math.abs(next - value) < 1e-6) return;
          onCommit(next);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        style={numInput}
      />
      <button type="button" aria-label={`Increase ${label}`} disabled={disabled} onClick={() => onNudge(1)} style={nudgeBtn}>
        +
      </button>
    </div>
  );
}

const nudgeBtn: CSSProperties = {
  width: 26,
  height: 26,
  padding: 0,
  border: "none",
  borderRadius: 4,
  background: "#1c2836",
  color: "#e8ece6",
  cursor: "pointer",
  fontSize: 16,
  lineHeight: 1,
};

const numInput: CSSProperties = {
  width: 72,
  flex: "1 1 auto",
  minWidth: 0,
  background: "#0c1218",
  color: "#e8ece6",
  border: "1px solid #243040",
  borderRadius: 4,
  padding: "4px 6px",
  fontFamily: "ui-monospace, monospace",
  fontSize: 12,
};

function histBtn(enabled: boolean): CSSProperties {
  return {
    ...btn(enabled, "charcoal"),
    opacity: enabled ? 1 : 0.45,
    cursor: enabled ? "pointer" : "default",
  };
}

function btn(active: boolean, tone: "green" | "charcoal" = "charcoal"): CSSProperties {
  return {
    background: active ? (tone === "green" ? "#2d8a5a" : "#5c6370") : "#1c2836",
    color: active ? "#e8ece6" : "#8b97a4",
    border: "none",
    borderRadius: 6,
    padding: "8px 10px",
    cursor: "pointer",
    fontFamily: '"Barlow Condensed", sans-serif',
    fontSize: 16,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  };
}

export default PoseEditor;
