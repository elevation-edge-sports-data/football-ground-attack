import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type MutableRefObject } from "react";
import { DoubleSide, NeutralToneMapping, type Group, type PerspectiveCamera } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FootballField } from "../field/FootballField";
import { FIELD, PLAY_MAX_X, PLAY_MAX_YARD, PLAY_MIN_X, PLAY_MIN_YARD, clamp } from "../field/spec";
import {
  CAM_MODES,
  CAM_PHI_MAX,
  CAM_PHI_MIN,
  CAM_RADIUS_MAX,
  CAM_RADIUS_MIN,
  chaseForward,
  eyeFromOrbit,
  orbitFromOffset,
  placeScripted,
  type CamMode,
  type CamOrbit,
  type CamPoint,
} from "./cameraMode";
import { poseBallSide } from "./carrierPose";
import { downloadFormationFrame } from "./formationDownload";
import {
  applyFormEdit,
  deleteRepoJson,
  formUndoDepth,
  freshFormHist,
  libraryRemoveFile,
  libraryStateAfterDelete,
  recordFormEdit,
  redoFormEdit,
  repoJsonName,
  retiredRepoFiles,
  undoFormEdit,
  type FormEdit,
  type FormHist,
  type FormationFrame,
  type FormationPlayer,
} from "./formationLibrary";
import { worldFromField } from "./frame";
import { radialDeadzone, readPadButton, readRightStick, readTriggerZoom } from "./input";
import { PlayerFigure } from "./PlayerFigure";
import { POSES } from "./PoseEditor";
import {
  bundledReplayEntries,
  lockedReplayIndex,
  partitionReplayLibrary,
  readReplayLibrary,
  readRetiredReplays,
  replayClipFromFile,
  sampleReplay,
  writeReplayLibrary,
  writeRetiredReplays,
  type ReplayClip,
  type ReplaySample,
} from "./replayLibrary";
import {
  UNIFORMS,
  getUniformSelection,
  kitById,
  kitName,
  selectDefenseKit,
  selectOffenseKit,
  subscribeUniforms,
} from "./uniforms";

const FAST = 3.4;
const SLOW = 0.28;
const PLAY_FPS = 60;
const PAN_SPEED = 14;
const SLIDE_SPEED = 4;
const BALL_AHEAD = 0.22;
const BALL_RIGHT = 0.4;
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

type LookLock = { kind: "ball" } | { kind: "player"; id: string } | { kind: "free" };
type LookMark = { x: number; yard: number; lock: LookLock };

function editingText(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

function jerseyNumber(player: FormationPlayer): number {
  if (player.number !== undefined) return player.number;
  const pool = player.role ? JERSEY[player.role] : undefined;
  if (!pool) return 0;
  const index = Number(player.id.split("-")[1] ?? 0);
  return pool[index % pool.length] ?? pool[0] ?? 0;
}

function seatBall(player: FormationPlayer): { x: number; yard: number } {
  const facingX = -Math.sin(player.yaw);
  const facingYard = Math.cos(player.yaw);
  return {
    x: clamp(player.x + facingX * BALL_AHEAD + facingYard * BALL_RIGHT, PLAY_MIN_X, PLAY_MAX_X),
    yard: clamp(player.yard + facingYard * BALL_AHEAD + facingX * BALL_RIGHT, PLAY_MIN_YARD, PLAY_MAX_YARD),
  };
}

function paintBar(
  fill: HTMLElement | null,
  label: HTMLElement | null,
  slider: HTMLElement | null,
  cursor: number,
  frames: readonly FormationFrame[],
): void {
  const last = Math.max(0, frames.length - 1);
  const clamped = Math.max(0, Math.min(last, cursor));
  const pct = last === 0 ? 100 : (clamped / last) * 100;
  if (fill) fill.style.width = `${pct}%`;
  const shown = frames[Math.min(last, Math.max(0, Math.floor(clamped)))];
  if (label) label.textContent = shown ? String(shown.frame) : "0";
  if (slider) {
    slider.setAttribute("aria-valuenow", String(Math.round(pct)));
    slider.setAttribute("aria-valuetext", shown ? `frame ${shown.frame}` : "frame 0");
  }
}

function seekClient(clientX: number, el: HTMLDivElement, last: number): number {
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  const padL = Number.parseFloat(style.paddingLeft) || 0;
  const padR = Number.parseFloat(style.paddingRight) || 0;
  const borderL = Number.parseFloat(style.borderLeftWidth) || 0;
  const width = Math.max(1, el.clientWidth - padL - padR);
  const x = clientX - (rect.left + borderL + padL);
  return Math.max(0, Math.min(1, x / width)) * last;
}

function subjectOf(mark: LookMark, sample: ReplaySample): { x: number; yard: number; yaw: number } {
  if (mark.lock.kind === "player") {
    const id = mark.lock.id;
    const player = sample.players.find((row) => row.id === id);
    if (player) return { x: player.x, yard: player.yard, yaw: player.yaw };
  }
  if (mark.lock.kind === "ball") return { x: sample.ball.x, yard: sample.ball.yard, yaw: yawOf(sample) };
  return { x: mark.x, yard: mark.yard, yaw: yawOf(sample) };
}

function yawOf(sample: ReplaySample): number {
  const owner = sample.ball.owner ? sample.players.find((row) => row.id === sample.ball.owner) : undefined;
  if (owner) return owner.yaw;
  const controlled = sample.controlledId ? sample.players.find((row) => row.id === sample.controlledId) : undefined;
  return controlled?.yaw ?? 0;
}

function nextLock(lock: LookLock, players: readonly FormationPlayer[]): LookLock {
  const ids = players.map((row) => row.id);
  const first = ids[0];
  if (lock.kind !== "player") return first ? { kind: "player", id: first } : { kind: "ball" };
  const next = ids[ids.indexOf(lock.id) + 1];
  return next ? { kind: "player", id: next } : { kind: "ball" };
}

function TransportIcon({
  name,
}: {
  name: "fast-rewind" | "slow-rewind" | "play" | "pause" | "slow-forward" | "fast-forward";
}) {
  return (
    <svg className="replay-transport-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      {name === "fast-rewind" ? (
        <>
          <polygon points="11 4 3 12 11 20" />
          <polygon points="21 4 13 12 21 20" />
        </>
      ) : null}
      {name === "fast-forward" ? (
        <>
          <polygon points="3 4 11 12 3 20" />
          <polygon points="13 4 21 12 13 20" />
        </>
      ) : null}
      {name === "slow-rewind" ? (
        <>
          <rect x="3" y="4" width="2.4" height="16" />
          <polygon points="20 4 9 12 20 20" />
        </>
      ) : null}
      {name === "slow-forward" ? (
        <>
          <polygon points="4 4 15 12 4 20" />
          <rect x="18.6" y="4" width="2.4" height="16" />
        </>
      ) : null}
      {name === "play" ? <polygon points="7 4 19 12 7 20" /> : null}
      {name === "pause" ? (
        <>
          <rect x="6" y="4" width="3.4" height="16" />
          <rect x="14.6" y="4" width="3.4" height="16" />
        </>
      ) : null}
    </svg>
  );
}

function ShuttleButton({
  label,
  icon,
  rate,
  on,
  disabled,
  onPress,
  onRelease,
}: {
  label: string;
  icon: "fast-rewind" | "slow-rewind" | "slow-forward" | "fast-forward";
  rate: number;
  on: boolean;
  disabled: boolean;
  onPress: (rate: number) => void;
  onRelease: (rate: number) => void;
}) {
  return (
    <button
      type="button"
      className={`btn-ghost${on ? " is-on" : ""}`}
      disabled={disabled}
      aria-label={label}
      aria-pressed={on}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        onPress(rate);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={() => onRelease(rate)}
      onPointerCancel={() => onRelease(rate)}
      onLostPointerCapture={() => onRelease(rate)}
      onKeyDown={(event) => {
        if (event.repeat || (event.key !== " " && event.key !== "Enter")) return;
        event.preventDefault();
        onPress(rate);
      }}
      onKeyUp={(event) => {
        if (event.key !== " " && event.key !== "Enter") return;
        onRelease(rate);
      }}
    >
      <TransportIcon name={icon} />
    </button>
  );
}

function ReplayKits() {
  const kits = useSyncExternalStore(subscribeUniforms, getUniformSelection);
  const [side, setSide] = useState<"off" | "def">("off");
  const pick = (id: number) => {
    if (side === "off") selectOffenseKit(id);
    else selectDefenseKit(id);
  };
  return (
    <div className="formation-kits">
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
  );
}

function ReplayStage({
  frames,
  cursorRef,
  playingRef,
  setPlaying,
  shuttleRef,
  togglePlayRef,
  camModeRef,
  setCamMode,
  lockedRef,
  frameRef,
  histRef,
  onDepth,
  lookRef,
  pickedRef,
  onPick,
  fillRef,
  labelRef,
  sliderRef,
  keysRef,
  pictureRef,
  onSnap,
  poseRev,
}: {
  frames: readonly FormationFrame[];
  cursorRef: MutableRefObject<number>;
  playingRef: MutableRefObject<boolean>;
  setPlaying: (on: boolean) => void;
  shuttleRef: MutableRefObject<number>;
  togglePlayRef: MutableRefObject<() => void>;
  camModeRef: MutableRefObject<CamMode>;
  setCamMode: (mode: CamMode) => void;
  lockedRef: MutableRefObject<boolean>;
  frameRef: MutableRefObject<FormationFrame | null>;
  histRef: MutableRefObject<FormHist>;
  onDepth: () => void;
  lookRef: MutableRefObject<LookMark>;
  pickedRef: MutableRefObject<string | null>;
  onPick: (id: string | null) => void;
  fillRef: MutableRefObject<HTMLDivElement | null>;
  labelRef: MutableRefObject<HTMLSpanElement | null>;
  sliderRef: MutableRefObject<HTMLDivElement | null>;
  keysRef: MutableRefObject<Set<string>>;
  pictureRef: MutableRefObject<ReplaySample | null>;
  onSnap: (index: number) => void;
  poseRev: number;
}) {
  const kits = useSyncExternalStore(subscribeUniforms, getUniformSelection);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const groups = useRef(new Map<string, Group>());
  const ballRef = useRef<Group>(null);
  const losRef = useRef<Group>(null);
  const orbitCtl = useRef<OrbitControls | null>(null);
  const free = useRef<CamOrbit>({ theta: 0, phi: 0.75, radius: Math.hypot(16, 17.1) });
  const seeded = useRef(false);
  const aWas = useRef(false);
  const yWas = useRef(false);
  const yMoved = useRef(false);
  const stickEdit = useRef(false);
  const seen = useRef(-1);
  const framesRef = useRef(frames);
  framesRef.current = frames;
  const roster = frames[0]?.adjusted.players ?? [];

  const claimFree = () => {
    if (camModeRef.current === "freestyle") return;
    const look = lookPoint(lookRef.current);
    free.current = orbitFromOffset(camera.position.x - look.x, camera.position.y - look.y, camera.position.z - look.z);
    camModeRef.current = "freestyle";
    seeded.current = true;
    setCamMode("freestyle");
  };

  useEffect(() => {
    const orbit = new OrbitControls(camera, gl.domElement);
    orbit.enablePan = true;
    orbit.minDistance = CAM_RADIUS_MIN;
    orbit.maxDistance = CAM_RADIUS_MAX;
    orbit.minPolarAngle = CAM_PHI_MIN;
    orbit.maxPolarAngle = CAM_PHI_MAX;
    orbitCtl.current = orbit;
    const dom = gl.domElement;
    const arm = () => claimFree();
    dom.addEventListener("pointerdown", arm);
    dom.addEventListener("wheel", arm, { passive: true });
    return () => {
      dom.removeEventListener("pointerdown", arm);
      dom.removeEventListener("wheel", arm);
      orbit.dispose();
      orbitCtl.current = null;
    };
  }, [camera, gl]);

  useFrame((_, rawDt) => {
    const clip = framesRef.current;
    if (!clip.length) return;
    const dt = Math.min(Math.max(rawDt, 0), 0.1);
    const last = Math.max(0, clip.length - 1);
    const typing = editingText();
    const keys = keysRef.current;
    const padA = readPadButton(0);
    if (padA && !aWas.current && !typing) togglePlayRef.current();
    aWas.current = padA;

    if (!lockedRef.current) {
      let rate = 0;
      const zoom = readTriggerZoom();
      if (zoom < 0) rate = -FAST;
      else if (zoom > 0) rate = FAST;
      else if (readPadButton(4)) rate = -SLOW;
      else if (readPadButton(5)) rate = SLOW;
      if (rate === 0) rate = shuttleRef.current;
      if (!typing && rate === 0) {
        if (keys.has("KeyG") || keys.has("ShiftLeft") || keys.has("ShiftRight")) {
          if (keys.has("ArrowLeft")) rate = -FAST;
          else if (keys.has("ArrowRight")) rate = FAST;
        }
      }
      if (rate !== 0) {
        cursorRef.current += rate * PLAY_FPS * dt;
        if (playingRef.current) {
          playingRef.current = false;
          setPlaying(false);
        }
      } else if (playingRef.current) {
        cursorRef.current += PLAY_FPS * dt;
      }
      if (cursorRef.current < 0) cursorRef.current = 0;
      if (cursorRef.current > last) cursorRef.current = last;
      if (playingRef.current && cursorRef.current >= last) {
        playingRef.current = false;
        setPlaying(false);
      }
    }

    const cursor = cursorRef.current;
    const index = lockedRef.current ? lockedReplayIndex(cursor, clip.length) : cursor;
    const frame = lockedRef.current ? frameRef.current ?? clip[lockedReplayIndex(cursor, clip.length)] : null;
    const sample = frame
      ? {
          players: frame.adjusted.players,
          ball: frame.adjusted.ball,
          ...(frame.userId !== undefined ? { userId: frame.userId } : {}),
          ...(frame.controlledId !== undefined ? { controlledId: frame.controlledId } : {}),
        }
      : sampleReplay(clip, index);
    pictureRef.current = sample;
    const shown = Math.floor(Math.max(0, Math.min(last, cursor)));
    if (shown !== seen.current) {
      seen.current = shown;
      onSnap(shown);
    }

    const stick = readLeftStick();
    const right = readRightStick();
    const yDown = !typing && (keys.has("KeyY") || readPadButton(3));
    const scrubKeys = keys.has("KeyG") || keys.has("ShiftLeft") || keys.has("ShiftRight");
    let panX = stick.x;
    let panYard = -stick.y;
    if (!typing && !yDown && !scrubKeys) {
      if (keys.has("ArrowLeft") || keys.has("KeyA")) panX -= 1;
      if (keys.has("ArrowRight") || keys.has("KeyD")) panX += 1;
      if (keys.has("ArrowUp") || keys.has("KeyW")) panYard += 1;
      if (keys.has("ArrowDown") || keys.has("KeyS")) panYard -= 1;
    }
    const rightMag = Math.hypot(right.x, right.y);
    const orbiting =
      (yDown && rightMag > 0.2) ||
      (!typing && (keys.has("KeyQ") || keys.has("KeyE") || keys.has("KeyF") || keys.has("KeyV")));
    if (yDown && !yWas.current) yMoved.current = false;
    if (orbiting) yMoved.current = true;
    if (!yDown && yWas.current && !yMoved.current) {
      const players = sample.players;
      lookRef.current.lock = nextLock(lookRef.current.lock, players);
      const spot = subjectOf(lookRef.current, sample);
      lookRef.current.x = spot.x;
      lookRef.current.yard = spot.yard;
    }
    yWas.current = yDown;

    const picked = pickedRef.current;
    if (lockedRef.current && picked && Math.hypot(panX, panYard) > 0.2 && !orbiting) {
      slideBody(frameRef.current, picked, panX * SLIDE_SPEED * dt, panYard * SLIDE_SPEED * dt, 0, histRef.current, stickEdit.current);
      stickEdit.current = true;
      onDepth();
    } else if (!stickEdit.current) {
      /* A fresh press starts its own undo step. */
    } else if (Math.hypot(panX, panYard) <= 0.2) {
      stickEdit.current = false;
    }
    if (!lockedRef.current && !orbiting && Math.hypot(panX, panYard) > 0.2) {
      lookRef.current.lock = { kind: "free" };
      lookRef.current.x = clamp(lookRef.current.x + panX * PAN_SPEED * dt, PLAY_MIN_X, PLAY_MAX_X);
      lookRef.current.yard = clamp(lookRef.current.yard + panYard * PAN_SPEED * dt, PLAY_MIN_YARD, PLAY_MAX_YARD);
    } else if (lookRef.current.lock.kind !== "free") {
      const spot = subjectOf(lookRef.current, sample);
      lookRef.current.x = spot.x;
      lookRef.current.yard = spot.yard;
    }

    placeGroups(groups.current, ballRef.current, losRef.current, sample);
    placeCamera(camera, orbitCtl.current, camModeRef.current, lookRef.current, sample, free.current, seeded, () => {
      seeded.current = false;
    });
    if (orbiting || readPadButton(1) || readPadButton(2) || keys.has("PageUp") || keys.has("PageDown")) {
      claimFree();
      const ox = (right.x + (keys.has("KeyE") ? 1 : 0) - (keys.has("KeyQ") ? 1 : 0)) * dt;
      const oy = (right.y + (keys.has("KeyF") ? 1 : 0) - (keys.has("KeyV") ? 1 : 0)) * dt;
      free.current.theta += ox * 1.6;
      free.current.phi = clamp(free.current.phi - oy * 1.1, CAM_PHI_MIN, CAM_PHI_MAX);
      let radius = free.current.radius;
      if (readPadButton(2) || keys.has("PageUp") || keys.has("Equal")) radius *= Math.exp(-1.4 * dt);
      if (readPadButton(1) || keys.has("PageDown") || keys.has("Minus")) radius *= Math.exp(1.4 * dt);
      free.current.radius = clamp(radius, CAM_RADIUS_MIN, CAM_RADIUS_MAX);
      const look = lookPoint(lookRef.current);
      const eye = eyeFromOrbit(look, free.current);
      camera.position.set(eye.x, eye.y, eye.z);
      camera.up.set(0, 1, 0);
      camera.lookAt(look.x, look.y, look.z);
      orbitCtl.current?.target.set(look.x, look.y, look.z);
      orbitCtl.current?.update();
    }
    paintBar(fillRef.current, labelRef.current, sliderRef.current, cursorRef.current, clip);
  });

  const picture = pictureRef.current;
  const lockedFrame = lockedRef.current ? frameRef.current : null;
  void poseRev;
  return (
    <>
      <color attach="background" args={[FIELD.sky]} />
      <ambientLight intensity={2.6} />
      <hemisphereLight args={["#c5d4e0", "#2f4a28", 0.72]} />
      <directionalLight position={[28, 90, 36]} intensity={1.25} />
      <FootballField />
      <group ref={losRef}>
        <mesh>
          <boxGeometry args={[FIELD.width, 0.035, 0.16]} />
          <meshStandardMaterial color="#3b82f6" />
        </mesh>
      </group>
      {roster.map((player) => {
        const live = lockedFrame?.adjusted.players.find((row) => row.id === player.id) ?? picture?.players.find((row) => row.id === player.id) ?? player;
        const owner = (lockedFrame?.adjusted.ball ?? picture?.ball)?.owner ?? null;
        const pose = typeof live.pose === "string" && live.pose ? live.pose : undefined;
        return (
          <group
            key={player.id}
            ref={(node) => {
              if (node) groups.current.set(player.id, node);
              else groups.current.delete(player.id);
            }}
            onClick={(event) => {
              event.stopPropagation();
              onPick(player.id);
            }}
          >
            <PlayerFigure
              kit={kitById(live.side === "def" ? kits.defId : kits.offId)}
              number={jerseyNumber(live)}
              controlled={false}
              ring={pickedRef.current === player.id}
              carry={owner === player.id}
              ballSide={pose ? poseBallSide(pose) : "r"}
              pose={pose}
            />
          </group>
        );
      })}
      <group ref={ballRef}>
        <mesh
          onClick={(event) => {
            event.stopPropagation();
            onPick("ball");
          }}
        >
          <sphereGeometry args={[0.18, 24, 16]} />
          <meshStandardMaterial color="#6b3a2a" />
        </mesh>
        {pickedRef.current === "ball" ? (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
            <ringGeometry args={[0.28, 0.4, 20]} />
            <meshBasicMaterial color="#f4efe4" side={DoubleSide} />
          </mesh>
        ) : null}
      </group>
    </>
  );
}

function lookPoint(mark: LookMark): CamPoint {
  const [x, y, z] = worldFromField(mark.x, mark.yard, 0.9);
  return { x, y, z };
}

function placeGroups(
  groups: Map<string, Group>,
  ball: Group | null,
  los: Group | null,
  sample: ReplaySample,
): void {
  for (const player of sample.players) {
    const node = groups.get(player.id);
    if (!node) continue;
    const [x, , z] = worldFromField(player.x, player.yard, 0);
    node.position.set(x, 0, z);
    node.rotation.y = player.yaw;
  }
  if (ball) {
    if (sample.ball.owner) ball.visible = false;
    else {
      ball.visible = true;
      const [x, , z] = worldFromField(sample.ball.x, sample.ball.yard, 0);
      ball.position.set(x, sample.ball.y, z);
    }
  }
  if (los) {
    let yard = -Infinity;
    let found = false;
    for (const player of sample.players) {
      if (player.role !== "OL" && player.role !== "TE") continue;
      if (player.yard > yard) yard = player.yard;
      found = true;
    }
    los.visible = found;
    if (found) {
      const at = worldFromField(FIELD.width / 2, yard + 0.48, 0.06);
      los.position.set(at[0], at[1], at[2]);
    }
  }
}

function placeCamera(
  camera: PerspectiveCamera,
  orbit: OrbitControls | null,
  mode: CamMode,
  mark: LookMark,
  sample: ReplaySample,
  free: CamOrbit,
  seeded: MutableRefObject<boolean>,
  clearSeed: () => void,
): void {
  const look = lookPoint(mark);
  if (mode === "freestyle") {
    if (orbit) orbit.enabled = true;
    if (!seeded.current) {
      const eye = eyeFromOrbit(look, free);
      camera.position.set(eye.x, eye.y, eye.z);
      camera.up.set(0, 1, 0);
      seeded.current = true;
    }
    orbit?.target.set(look.x, look.y, look.z);
    orbit?.update();
    const dx = camera.position.x - look.x;
    const dy = camera.position.y - look.y;
    const dz = camera.position.z - look.z;
    const next = orbitFromOffset(dx, dy, dz);
    free.theta = next.theta;
    free.phi = next.phi;
    free.radius = next.radius;
    return;
  }
  clearSeed();
  if (orbit) orbit.enabled = false;
  const spot = subjectOf(mark, sample);
  const forward = chaseForward(-Math.sin(spot.yaw), Math.cos(spot.yaw));
  const place = placeScripted(mode, look, forward);
  camera.position.set(place.eye.x, place.eye.y, place.eye.z);
  camera.up.set(place.up.x, place.up.y, place.up.z);
  camera.lookAt(place.look.x, place.look.y, place.look.z);
  camera.fov = place.fov;
  camera.updateProjectionMatrix();
  orbit?.target.set(place.look.x, place.look.y, place.look.z);
}

function readLeftStick(): { x: number; y: number } {
  const pads = typeof navigator !== "undefined" ? navigator.getGamepads?.() : null;
  if (!pads) return { x: 0, y: 0 };
  for (const pad of pads) {
    if (!pad || pad.connected === false) continue;
    return radialDeadzone(pad.axes[0] || 0, pad.axes[1] || 0);
  }
  return { x: 0, y: 0 };
}

function slideBody(
  frame: FormationFrame | null,
  picked: string,
  dx: number,
  dyard: number,
  dyaw: number,
  hist: FormHist,
  coalesce: boolean,
): void {
  if (!frame || (dx === 0 && dyard === 0 && dyaw === 0)) return;
  const side = frame.adjusted;
  if (picked === "ball") {
    if (side.ball.owner) return;
    const x1 = clamp(side.ball.x + dx, PLAY_MIN_X, PLAY_MAX_X);
    const yard1 = clamp(side.ball.yard + dyard, PLAY_MIN_YARD, PLAY_MAX_YARD);
    if (x1 === side.ball.x && yard1 === side.ball.yard) return;
    const edit: FormEdit = { kind: "ball", x0: side.ball.x, yard0: side.ball.yard, x1, yard1 };
    side.ball.x = x1;
    side.ball.yard = yard1;
    recordFormEdit(hist, edit, coalesce);
    return;
  }
  const player = side.players.find((row) => row.id === picked);
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
  recordFormEdit(hist, { kind: "player", id: player.id, x0, yard0, yaw0, x1, yard1, yaw1, ball0, ball1 }, coalesce);
}

function libraryEntries(saved: ReplayClip[] = [], retired: string[] = [], memory: ReplayClip[] = []): ReplayClip[] {
  const { imported, repo } = partitionReplayLibrary(memory, bundledReplayEntries(), saved, retired);
  return [...repo, ...imported];
}

function ReplayList({
  rows,
  selected,
  onChoose,
}: {
  rows: ReplayClip[];
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

export function ReplayViewerView() {
  const [memory, setMemory] = useState<ReplayClip[]>(() => readReplayLibrary());
  const [saved, setSaved] = useState<ReplayClip[]>([]);
  const [retired, setRetired] = useState<string[]>(() => readRetiredReplays());
  const [notice, setNotice] = useState<string | null>(null);
  const [importName, setImportName] = useState("");
  const [repoName, setRepoName] = useState("");
  const [playing, setPlaying] = useState(false);
  const [locked, setLocked] = useState(false);
  const [depth, setDepth] = useState({ undo: 0, redo: 0 });
  const [selected, setSelected] = useState<string | null>(
    () => libraryEntries([], readRetiredReplays(), readReplayLibrary())[0]?.id ?? null,
  );
  const [camMode, setCamMode] = useState<CamMode>("classic");
  const [shuttle, setShuttle] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [snap, setSnap] = useState(0);
  const [poseRev, setPoseRev] = useState(0);
  const playingRef = useRef(false);
  const lockedRef = useRef(false);
  const frameRef = useRef<FormationFrame | null>(null);
  const lockBase = useRef<FormationFrame | null>(null);
  const hist = useRef<FormHist>(freshFormHist());
  const cursorRef = useRef(0);
  const lookRef = useRef<LookMark>({ x: FIELD.width / 2, yard: 50, lock: { kind: "ball" } });
  const fileRef = useRef<HTMLInputElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const shuttleRef = useRef(0);
  const camModeRef = useRef<CamMode>("classic");
  const togglePlayRef = useRef<() => void>(() => {});
  const keysRef = useRef(new Set<string>());
  const pictureRef = useRef<ReplaySample | null>(null);
  const pickedRef = useRef<string | null>(null);
  pickedRef.current = picked;
  playingRef.current = playing;
  lockedRef.current = locked;
  camModeRef.current = camMode;
  const entries = useMemo(() => libraryEntries(saved, retired, memory), [saved, retired, memory]);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const chosen = entries.find((entry) => entry.id === selected) ?? null;
  const imported = entries.filter((entry) => !entry.id.startsWith("bundled:"));
  const repo = entries.filter((entry) => entry.id.startsWith("bundled:"));

  const publishDepth = () => {
    const undo = formUndoDepth(hist.current);
    const redo = hist.current.redo.length;
    setDepth((prev) => (prev.undo === undo && prev.redo === redo ? prev : { undo, redo }));
    setPoseRev((n) => n + 1);
  };

  const onDepth = () => publishDepth();

  const releaseLock = (revert: boolean) => {
    const frame = frameRef.current;
    const base = lockBase.current;
    const was = lockedRef.current;
    lockedRef.current = false;
    if (was && revert && frame && base) {
      frame.original = structuredClone(base.original);
      frame.adjusted = structuredClone(base.adjusted);
    }
    frameRef.current = null;
    lockBase.current = null;
    hist.current = freshFormHist();
    if (was) {
      setDepth({ undo: 0, redo: 0 });
      setLocked(false);
      setPicked(null);
    }
  };

  const beginLock = () => {
    const clip = entriesRef.current.find((item) => item.id === selected);
    if (!clip?.frames.length) return;
    const index = lockedReplayIndex(cursorRef.current, clip.frames.length);
    const frame = clip.frames[index];
    if (!frame) return;
    cursorRef.current = index;
    playingRef.current = false;
    setPlaying(false);
    shuttleRef.current = 0;
    setShuttle(0);
    lockBase.current = structuredClone(frame);
    frameRef.current = frame;
    hist.current = freshFormHist();
    lockedRef.current = true;
    setDepth({ undo: 0, redo: 0 });
    setLocked(true);
    setSnap(index);
    paintBar(fillRef.current, labelRef.current, sliderRef.current, index, clip.frames);
  };

  const toggleLock = () => {
    if (lockedRef.current) releaseLock(true);
    else beginLock();
  };

  useEffect(() => {
    const prev = document.title;
    document.title = "Replay Viewer";
    return () => {
      document.title = prev;
    };
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

  const armClip = (frames: readonly FormationFrame[]) => {
    cursorRef.current = 0;
    playingRef.current = false;
    setPlaying(false);
    shuttleRef.current = 0;
    setShuttle(0);
    setSnap(0);
    setPicked(null);
    const ball = frames[0]?.adjusted.ball;
    if (ball) lookRef.current = { x: ball.x, yard: ball.yard, lock: { kind: "ball" } };
  };

  const choose = (id: string) => {
    if (id === selected) return;
    const entry = entriesRef.current.find((item) => item.id === id);
    if (!entry) return;
    if (lockedRef.current) releaseLock(true);
    armClip(entry.frames);
    setSelected(id);
    setNotice(null);
  };

  const togglePlay = () => {
    if (lockedRef.current) return;
    shuttleRef.current = 0;
    setShuttle(0);
    if (!chosen) return;
    const next = !playingRef.current;
    if (next && cursorRef.current >= chosen.frames.length - 1) cursorRef.current = 0;
    playingRef.current = next;
    setPlaying(next);
  };
  togglePlayRef.current = togglePlay;

  const pressShuttle = (rate: number) => {
    if (!chosen || lockedRef.current) return;
    shuttleRef.current = rate;
    setShuttle(rate);
    if (playingRef.current) {
      playingRef.current = false;
      setPlaying(false);
    }
  };
  const releaseShuttle = (rate: number) => {
    if (shuttleRef.current !== rate) return;
    shuttleRef.current = 0;
    setShuttle(0);
  };

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const parsed = replayClipFromFile(file.name, text, `${file.name}-${crypto.randomUUID()}`);
    if (typeof parsed === "string") {
      setNotice(parsed);
      return;
    }
    const nextMemory = [...memory, parsed];
    setMemory(nextMemory);
    setNotice(writeReplayLibrary(nextMemory));
    if (lockedRef.current) releaseLock(true);
    armClip(parsed.frames);
    setSelected(parsed.id);
  };

  const keepRetired = (names: string[]) => {
    setRetired(names);
    writeRetiredReplays(names);
  };

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const files = retiredRepoFiles(readRetiredReplays(), bundledReplayEntries());
    if (!files.length) return;
    let cancel = false;
    void (async () => {
      for (const file of files) {
        const deleted = await deleteRepoJson("replays", file);
        if (cancel) return;
        if (!deleted) {
          setNotice("Could not remove that replay.");
          return;
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.type === "keyup") {
        keysRef.current.delete(event.code);
        return;
      }
      keysRef.current.add(event.code);
      if (editingText()) return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if ((event.ctrlKey || event.metaKey) && event.code === "KeyZ" && !event.shiftKey && lockedRef.current) {
        event.preventDefault();
        const edit = undoFormEdit(hist.current);
        const frame = frameRef.current;
        if (edit && frame) applyFormEdit(frame, "adjusted", edit, false);
        publishDepth();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (event.code === "KeyY" || (event.shiftKey && event.code === "KeyZ")) && lockedRef.current) {
        event.preventDefault();
        const edit = redoFormEdit(hist.current);
        const frame = frameRef.current;
        if (edit && frame) applyFormEdit(frame, "adjusted", edit, true);
        publishDepth();
        return;
      }
      if (event.code === "Space" && tag !== "BUTTON") {
        event.preventDefault();
        if (!event.repeat) togglePlayRef.current();
        return;
      }
      if (!lockedRef.current || !pickedRef.current) return;
      if (event.code !== "Comma" && event.code !== "Period") return;
      event.preventDefault();
      const turn = event.code === "Comma" ? -TURN : TURN;
      slideBody(frameRef.current, pickedRef.current, 0, 0, turn, hist.current, event.repeat);
      publishDepth();
    };
    const up = (event: KeyboardEvent) => {
      keysRef.current.delete(event.code);
    };
    const blur = () => keysRef.current.clear();
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  const remove = async (id: string) => {
    const rows = entriesRef.current;
    const entry = rows.find((item) => item.id === id);
    if (!entry) return;
    const file = libraryRemoveFile(entry, rows, retired);
    let deleted: string | null = null;
    if (file) {
      deleted = await deleteRepoJson("replays", file);
      if (!deleted) {
        setNotice("Could not remove that replay.");
        return;
      }
    }
    const next = deleted
      ? libraryStateAfterDelete(memory, saved, retired, rows, id, deleted)
      : { local: memory.filter((clip) => clip.id !== id), saved, retired };
    if (entry.id.startsWith("bundled:")) setNotice(null);
    else {
      setMemory(next.local);
      setNotice(writeReplayLibrary(next.local));
    }
    if (deleted) {
      setSaved(next.saved);
      if (next.retired.join("\0") !== retired.join("\0")) keepRetired(next.retired);
    }
    const selectedEntry = rows.find((item) => item.id === selected) ?? null;
    const selectedFile = selectedEntry ? repoJsonName(selectedEntry.id, selectedEntry.name) : null;
    const dropsSelected = selected === id || (deleted !== null && !!selectedEntry?.id.startsWith("bundled:") && selectedFile === deleted);
    if (!dropsSelected) return;
    if (lockedRef.current) releaseLock(true);
    const listed = libraryEntries(next.saved, next.retired, next.local);
    const fallback = listed[0];
    if (!fallback) {
      playingRef.current = false;
      setPlaying(false);
      shuttleRef.current = 0;
      setShuttle(0);
      setSelected(null);
      return;
    }
    armClip(fallback.frames);
    setSelected(fallback.id);
  };

  const saveCurrent = async (name: string) => {
    if (!chosen || !name.trim()) return;
    let res: Response;
    try {
      res = await fetch("/api/replays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          frames: chosen.frames,
          from: chosen.id.startsWith("bundled:") ? chosen.name : undefined,
        }),
      });
    } catch {
      setNotice("Could not save that replay.");
      return;
    }
    if (!res.ok) {
      setNotice("Could not save that replay.");
      return;
    }
    const body = (await res.json()) as { name?: string };
    if (!body.name) {
      setNotice("Could not save that replay.");
      return;
    }
    const entry: ReplayClip = {
      id: `bundled:replays/${body.name}:0`,
      name: body.name,
      frames: chosen.frames,
    };
    if (!chosen.id.startsWith("bundled:")) {
      const nextMemory = memory.filter((item) => item.id !== chosen.id);
      setMemory(nextMemory);
      writeReplayLibrary(nextMemory);
    }
    const previous = chosen.id.startsWith("bundled:") && chosen.name !== entry.name ? chosen.name : null;
    let nextRetired = retired.filter((item) => item !== entry.name);
    if (previous && previous !== entry.name && !nextRetired.includes(previous)) nextRetired = [...nextRetired, previous];
    if (nextRetired.join("\0") !== retired.join("\0")) keepRetired(nextRetired);
    const nextSaved = [entry, ...saved.filter((item) => item.name !== entry.name && item.name !== previous)];
    setSaved(nextSaved);
    setSelected(entry.id);
    setRepoName(body.name.replace(/\.json$/i, ""));
    setImportName("");
    setNotice(null);
    if (lockedRef.current && frameRef.current) {
      lockBase.current = structuredClone(frameRef.current);
      hist.current = freshFormHist();
      setDepth({ undo: 0, redo: 0 });
    }
  };

  const stopForSeek = () => {
    if (!playingRef.current) return;
    playingRef.current = false;
    setPlaying(false);
  };

  const setPose = (name: string) => {
    const frame = frameRef.current;
    const id = pickedRef.current;
    if (!frame || !lockedRef.current || !id || id === "ball") return;
    const player = frame.adjusted.players.find((row) => row.id === id);
    if (!player || player.pose === name) return;
    const edit: FormEdit = {
      kind: "player",
      id,
      x0: player.x,
      yard0: player.yard,
      yaw0: player.yaw,
      x1: player.x,
      yard1: player.yard,
      yaw1: player.yaw,
      ball0: null,
      ball1: null,
      pose0: player.pose ?? null,
      pose1: name,
    };
    player.pose = name;
    recordFormEdit(hist.current, edit, false);
    publishDepth();
  };

  const last = chosen ? Math.max(0, chosen.frames.length - 1) : 0;
  const blockSpace = (event: { code: string; preventDefault: () => void }) => {
    if (event.code === "Space") event.preventDefault();
  };
  const livePose = (() => {
    if (!picked || picked === "ball") return null;
    if (locked && frameRef.current) return frameRef.current.adjusted.players.find((row) => row.id === picked)?.pose ?? null;
    return pictureRef.current?.players.find((row) => row.id === picked)?.pose ?? null;
  })();
  void snap;

  return (
    <div
      className="formation-lib replay-view"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        void loadFile(event.dataTransfer.files[0]);
      }}
    >
      <style>{REPLAY_CSS}</style>
      <header className="formation-top">
        <div className="formation-top-start">
          <ReplayKits />
          <div className="cam-row replay-cams" role="group" aria-label="Camera">
            {CAM_MODES.map((cam) => (
              <button
                key={cam.id}
                type="button"
                className={`btn-ghost${camMode === cam.id ? " is-on" : ""}`}
                title={cam.blurb}
                aria-pressed={camMode === cam.id}
                disabled={!chosen}
                onClick={() => {
                  camModeRef.current = cam.id;
                  setCamMode(cam.id);
                }}
              >
                {cam.label}
              </button>
            ))}
          </div>
        </div>
        <div className="formation-top-center">
          <button type="button" className="btn-primary" onClick={() => fileRef.current?.click()}>
            Load replay
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              void loadFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          {chosen ? (
            <>
              <button type="button" className={locked ? "btn-primary" : "btn-ghost"} aria-pressed={locked} onKeyDown={blockSpace} onClick={toggleLock}>
                {locked ? "Revert" : "Edit formation"}
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={!locked || !frameRef.current}
                onKeyDown={blockSpace}
                onClick={() => {
                  const frame = frameRef.current;
                  if (frame && lockedRef.current) downloadFormationFrame(frame);
                }}
              >
                Download formation
              </button>
            </>
          ) : null}
        </div>
        <div className="replay-transport" role="group" aria-label="Playback">
          <ShuttleButton label="Fast rewind" icon="fast-rewind" rate={-FAST} on={shuttle === -FAST} disabled={!chosen || locked} onPress={pressShuttle} onRelease={releaseShuttle} />
          <ShuttleButton label="Slow rewind" icon="slow-rewind" rate={-SLOW} on={shuttle === -SLOW} disabled={!chosen || locked} onPress={pressShuttle} onRelease={releaseShuttle} />
          <button type="button" className="btn-ghost" disabled={!chosen || locked} aria-pressed={playing} aria-label="Play/pause" onClick={togglePlay}>
            <TransportIcon name={playing && shuttle === 0 ? "pause" : "play"} />
          </button>
          <ShuttleButton label="Slow forward" icon="slow-forward" rate={SLOW} on={shuttle === SLOW} disabled={!chosen || locked} onPress={pressShuttle} onRelease={releaseShuttle} />
          <ShuttleButton label="Fast forward" icon="fast-forward" rate={FAST} on={shuttle === FAST} disabled={!chosen || locked} onPress={pressShuttle} onRelease={releaseShuttle} />
        </div>
      </header>
      <aside className="formation-side">
        <p className="eyebrow">Replay</p>
        <h1>Replay</h1>
        {locked ? (
          <div className="replay-edit">
            <button
              type="button"
              className="btn-ghost"
              disabled={depth.undo === 0}
              onKeyDown={blockSpace}
              onClick={() => {
                const edit = undoFormEdit(hist.current);
                if (edit && frameRef.current) applyFormEdit(frameRef.current, "adjusted", edit, false);
                publishDepth();
              }}
            >
              Undo
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={depth.redo === 0}
              onKeyDown={blockSpace}
              onClick={() => {
                const edit = redoFormEdit(hist.current);
                if (edit && frameRef.current) applyFormEdit(frameRef.current, "adjusted", edit, true);
                publishDepth();
              }}
            >
              Redo
            </button>
          </div>
        ) : null}
        {locked && picked ? <p className="formation-note">{picked === "ball" ? "Ball" : picked}{livePose ? ` · ${livePose}` : ""}</p> : null}
        {imported.length > 0 ? (
          <div className="formation-save">
            <input
              aria-label="Loaded replay name"
              value={importName}
              placeholder="Name"
              disabled={!chosen || chosen.id.startsWith("bundled:")}
              onChange={(event) => setImportName(event.target.value)}
            />
            <button type="button" className="btn-ghost" disabled={!chosen || chosen.id.startsWith("bundled:") || !importName.trim()} onClick={() => void saveCurrent(importName)}>
              Save
            </button>
            <button type="button" className="btn-ghost" disabled={!chosen || chosen.id.startsWith("bundled:")} onClick={() => chosen && void remove(chosen.id)}>
              Remove
            </button>
          </div>
        ) : null}
        {notice ? <p className="formation-note">{notice}</p> : null}
        <ReplayList rows={imported} selected={selected} onChoose={choose} />
        {locked ? (
          <div className="replay-poses">
            {POSES.map((name) => (
              <button key={name} type="button" className={livePose === name ? "is-on" : ""} aria-pressed={livePose === name} onClick={() => setPose(name)}>
                {name}
              </button>
            ))}
          </div>
        ) : null}
      </aside>
      <aside className="formation-side formation-repo">
        {repo.length > 0 ? (
          <div className="formation-save">
            <input
              aria-label="Replay file name"
              value={repoName}
              placeholder="Name"
              disabled={!chosen || !chosen.id.startsWith("bundled:")}
              onChange={(event) => setRepoName(event.target.value)}
            />
            <button type="button" className="btn-ghost" disabled={!chosen || !chosen.id.startsWith("bundled:") || !repoName.trim()} onClick={() => void saveCurrent(repoName)}>
              Rename
            </button>
            <button type="button" className="btn-ghost" disabled={!chosen || !repo.some((entry) => entry.id === chosen.id)} onClick={() => chosen && void remove(chosen.id)}>
              Remove
            </button>
          </div>
        ) : null}
        <ReplayList rows={repo} selected={selected} onChoose={choose} />
      </aside>
      <div className="formation-stage">
        {chosen ? (
          <Canvas
            key={chosen.id}
            className="formation-canvas"
            shadows={false}
            dpr={[1, 1.25]}
            gl={{ antialias: true, toneMapping: NeutralToneMapping, toneMappingExposure: 1 }}
            camera={{ position: [FIELD.width / 2, 18, -34], fov: 42, near: 0.15, far: 900 }}
            onPointerMissed={() => setPicked(null)}
          >
            <ReplayStage
              frames={chosen.frames}
              cursorRef={cursorRef}
              playingRef={playingRef}
              setPlaying={setPlaying}
              shuttleRef={shuttleRef}
              togglePlayRef={togglePlayRef}
              camModeRef={camModeRef}
              setCamMode={setCamMode}
              lockedRef={lockedRef}
              frameRef={frameRef}
              histRef={hist}
              onDepth={onDepth}
              lookRef={lookRef}
              pickedRef={pickedRef}
              onPick={setPicked}
              fillRef={fillRef}
              labelRef={labelRef}
              sliderRef={sliderRef}
              keysRef={keysRef}
              pictureRef={pictureRef}
              onSnap={setSnap}
              poseRev={poseRev}
            />
          </Canvas>
        ) : (
          <div className="formation-empty">Drop a replay JSON file.</div>
        )}
      </div>
      {chosen ? (
        <div ref={sliderRef} className={`replay-bar madden-replay${locked ? " is-locked" : ""}`} role="slider" aria-label="Replay position" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0} aria-disabled={locked}>
          <div
            className="madden-replay-track"
            onPointerDown={(event) => {
              if (lockedRef.current || event.button !== 0) return;
              stopForSeek();
              event.currentTarget.setPointerCapture(event.pointerId);
              cursorRef.current = seekClient(event.clientX, event.currentTarget, last);
              paintBar(fillRef.current, labelRef.current, sliderRef.current, cursorRef.current, chosen.frames);
            }}
            onPointerMove={(event) => {
              if (lockedRef.current) return;
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
              cursorRef.current = seekClient(event.clientX, event.currentTarget, last);
              paintBar(fillRef.current, labelRef.current, sliderRef.current, cursorRef.current, chosen.frames);
            }}
          >
            <div className="madden-replay-lane">
              <div ref={fillRef} className="madden-replay-fill" />
            </div>
          </div>
          <span ref={labelRef} className="madden-replay-pct">
            0
          </span>
        </div>
      ) : null}
    </div>
  );
}

const REPLAY_CSS = `
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
.formation-lib.replay-view {
  grid-template-rows: auto minmax(0, 1fr) auto;
  grid-template-areas:
    "top top top"
    "side stage repo"
    "bar bar bar";
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
.formation-lib .formation-top-center {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
  justify-self: center;
}
.formation-lib .formation-top-center .btn-primary,
.formation-lib .formation-top-center .btn-ghost { width: auto; margin: 0; }
.formation-lib .eyebrow {
  margin: 0;
  font-family: var(--font-display);
  font-size: 0.8rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--color-accent);
}
.formation-lib h1 {
  margin: 0 0 8px;
  font-family: var(--font-display);
  font-size: 1.6rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.formation-lib .btn-primary,
.formation-lib .btn-ghost,
.formation-lib .cam-row button {
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
}
.formation-lib .btn-ghost:disabled,
.formation-lib .btn-primary:disabled,
.formation-lib .cam-row button:disabled { opacity: 0.4; cursor: default; }
.formation-lib .cam-row { display: flex; flex-wrap: wrap; gap: 6px; }
.formation-lib .cam-row button.is-on,
.formation-lib .replay-transport .btn-ghost.is-on {
  background: var(--color-fg);
  color: var(--color-bg);
  border-color: var(--color-fg);
}
.formation-lib .replay-cams { flex: 1 1 auto; min-width: 0; }
.formation-lib .replay-transport {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  justify-self: end;
  gap: 8px;
}
.formation-lib .replay-transport .btn-ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: auto;
  min-width: 44px;
  margin: 0;
}
.formation-lib .replay-transport-icon { display: block; fill: currentColor; }
.formation-lib .formation-stage { grid-area: stage; position: relative; min-width: 0; min-height: 0; }
.formation-lib .formation-canvas { width: 100%; height: 100%; }
.formation-lib .formation-side {
  grid-area: side;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 16px;
  background: color-mix(in oklab, var(--color-surface) 94%, transparent);
  border-right: 1px solid var(--color-line);
}
.formation-lib .formation-side.formation-repo {
  grid-area: repo;
  border-right: 0;
  border-left: 1px solid var(--color-line);
}
.formation-lib .formation-note { margin: 8px 0 12px; color: var(--color-muted); font-size: 0.85rem; }
.formation-lib .formation-kits { margin: 0; }
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
}
.formation-lib button.formation-kit-tag { cursor: pointer; }
.formation-lib .formation-kit-tag.is-target { color: var(--color-accent); }
.formation-lib .uni-swatch {
  width: 22px; height: 28px; display: flex; flex-direction: column; padding: 0;
  border: 2px solid transparent; border-radius: 4px; overflow: hidden; background: #222; cursor: pointer;
}
.formation-lib .uni-swatch.is-on { border-color: var(--color-accent); }
.formation-lib .uni-swatch span { flex: 1 1 0; display: block; }
.formation-lib .formation-save { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 4px; }
.formation-lib .formation-save input {
  flex: 1 0 100%; min-width: 0; min-height: 44px; border: 1px solid var(--color-line);
  border-radius: var(--radius-sm); background: var(--color-surface-2); color: var(--color-fg); padding: 0 8px; font: inherit;
}
.formation-lib .formation-save .btn-ghost { width: auto; }
.formation-lib .formation-list { list-style: none; margin: 14px 0 0; padding: 0; display: grid; gap: 8px; }
.formation-lib .formation-list button {
  width: 100%; text-align: left; border: 1px solid var(--color-line); background: var(--color-surface-2);
  color: var(--color-fg); border-radius: var(--radius-sm); padding: 8px 10px; cursor: pointer;
}
.formation-lib .formation-list button.is-on { border-color: var(--color-accent); }
.formation-lib .formation-list b { display: block; font-family: var(--font-display); letter-spacing: 0.04em; font-weight: 600; }
.formation-lib .formation-empty {
  position: absolute; inset: 0; display: grid; place-items: center;
  font-family: var(--font-display); letter-spacing: 0.06em; text-transform: uppercase; color: var(--color-muted);
}
.formation-lib .replay-edit { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; }
.formation-lib .replay-edit .btn-ghost { width: auto; margin: 0; }
.formation-lib .replay-poses { display: flex; flex-direction: column; gap: 4px; margin-top: 12px; max-height: 280px; overflow: auto; }
.formation-lib .replay-poses button {
  text-align: left; border: 1px solid transparent; background: transparent; color: var(--color-fg);
  font-family: var(--font-display); letter-spacing: 0.04em; padding: 4px 8px; cursor: pointer;
}
.formation-lib .replay-poses button.is-on { border-color: var(--color-accent); color: var(--color-accent); }
.formation-lib .replay-bar {
  grid-area: bar;
  position: relative;
  z-index: 4;
  width: 100%;
  box-sizing: border-box;
  padding: 8px 12px 10px;
  background: #070707;
  border-top: 1px solid var(--color-line);
}
.formation-lib .madden-replay { display: flex; align-items: center; gap: 8px; width: 100%; }
.formation-lib .madden-replay-track {
  flex: 1; height: 18px; padding: 2px; background: #070707; border: 2px solid #f4f4f4;
  box-shadow: inset 0 0 0 2px #000, 0 1px 0 #000; touch-action: none; cursor: pointer;
}
.formation-lib .madden-replay.is-locked .madden-replay-track { pointer-events: none; cursor: default; }
.formation-lib .madden-replay-lane { position: relative; height: 100%; overflow: hidden; }
.formation-lib .madden-replay-fill { height: 100%; width: 0; background: #5a1021; box-shadow: inset 0 1px 0 rgba(255,255,255,0.75); }
.formation-lib .madden-replay-pct {
  min-width: 3.2em; font-family: var(--font-display); font-size: 1.15rem; font-weight: 700;
  letter-spacing: 0.04em; text-align: right; color: #f4f4f4;
}
`;
