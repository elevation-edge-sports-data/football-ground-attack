import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useSyncExternalStore } from "react";
import { DoubleSide, Raycaster, Vector2, Vector3, type Camera, type Group, type Mesh, type Object3D } from "three";
import { FIELD, PLAY_MAX_X, PLAY_MAX_YARD, PLAY_MIN_X, PLAY_MIN_YARD, SOUTH_BACK } from "../field/spec";
import { followTarget, setFollowTarget } from "./cameraFollow";
import { footballLeadingTip } from "./ballTip";
import { worldFromField, yawFromFacing } from "./frame";
import { FIGURE_ALIGN } from "./PlayerFigure";
import { poseBallSide } from "./carrierPose";
import { RespotMarker } from "./RespotMarker";
import { basicMove, isMoveCode, PAUSE_KEY, radialDeadzone, readBasicPad, readBlockerStick, readClassicStiff, readPadButton, readRawDefense, readReplayPad, readRightStick, readRightStickClick } from "./input";
import { poseCarriesBall } from "./PoseEditor";
import {
  cycleTapeSelect,
  endTapeNudge,
  noteTape,
  pickTapeBody,
  readTapeLocked,
  readTapeOn,
  readTapePlaying,
  readTapeSelected,
  redoTapeEdit,
  slideTapeSelection,
  readTapeHeldScrub,
  stepTape,
  stopTape,
  subscribeTapeEdit,
  tapeBodyPose,
  tapeEditRev,
  tapeFrame,
  toggleTapeLock,
  toggleTapePlay,
  turnTapeSelection,
  undoTapeEdit,
  type TapeScrub,
} from "./tapeReplay";
import { PlayArt } from "./PlayArt";
import { PlayerFigure } from "./PlayerFigure";
import { buildSnapArt } from "./snapArt";
import { createTrailLine, syncTrailLine } from "./runnerTrailLine";
import { createRunnerTrail, pinRunnerTrail, resetRunnerTrail, sampleRunnerTrail, sealRunnerTrail } from "./runnerTrail";
import { bindReplaySeek, clearReplayScrub, publishReplayScrub, shownReplaySample } from "./replayScrub";
import { bindReplayToggle, clearReplayHeldRate, publishReplayTransport, readReplayHeldRate } from "./replayHold";
import { replayFocus, replayFocusJump } from "./replayCamera";
import { sampleReplay, stepAssignments } from "./sim/advance";
import { stanceOf, stanceRevision, subscribeStances } from "./sim/stance";
import { randomizeFieldForNewGame } from "./fieldLook";
import { bootFullPlay, clockExpired, confirmPracticeRespot, gameEnded, markPlayOver, markSnap, movePracticeAim, onModeStage, onNextPlay, onReplayToggle, onRestart, practiceSpotAiming, previewRequested, readFirstDownYard, readMode, readPaused, readPlaySide, readPractice, readProfile, seriesEnded, setPaused, setReplayFootage, setReplayMode, startNextPlay, takeStage, tickClock, toggleProfile } from "./sim/boot";
import { beginDefenseHuddle, beginDefenseLive, readUserDefenderId, readUserDefPose, tickDefenseHuddle, type DefenseStick } from "./sim/defense";
import { runnerBounds } from "./sideline";
import { controlledPlayer, createSim, step, type Player, type Sim } from "./sim";
import type { AssignedPlay } from "./sim/assign";
import { PLAYER_NUMBERS, getUniformSelection, kitById, subscribeUniforms } from "./uniforms";

const JERSEY: Record<string, number[]> = {
  QB: [12],
  HB: [28],
  FB: [44],
  TE: [80, 81, 84, 85, 86, 87, 88],
  OL: [60, 61, 63, 65, 70, 72, 74, 76],
  DT: [90, 92, 95, 97, 98],
  LB: [54, 55, 56, 58],
  DB: [20, 21, 24, 26, 31, 32],
};

function jerseyNumber(player: Player) {
  const listed = PLAYER_NUMBERS[player.id];
  if (listed !== undefined) return listed;
  const pool = JERSEY[player.role];
  if (!pool) return 0;
  const index = Number(player.id.split("-")[1] ?? 0);
  return pool[index % pool.length] ?? pool[0] ?? 0;
}

const _camForward = new Vector3();
const _camRight = new Vector3();
const _worldUp = new Vector3(0, 1, 0);
const _ndc = new Vector2();
const _ray = new Raycaster();
const EDIT_SPEED = 4;
/** Dead-ball wait before the next formation lines up. Snap still takes its own press. */
const LINEUP_DELAY = 1.25;
/** A short click. A longer drag stays an orbit. */
const REPLAY_CLICK = 6;

type FieldSpot = { x: number; yard: number };

function clampFocus(x: number, yard: number): FieldSpot {
  return {
    x: Math.min(PLAY_MAX_X, Math.max(PLAY_MIN_X, x)),
    yard: Math.min(PLAY_MAX_YARD, Math.max(PLAY_MIN_YARD, yard)),
  };
}

function ownerId(object: Object3D, bodies: Map<string, Group>): string | null {
  let node: Object3D | null = object;
  while (node) {
    for (const [id, group] of bodies) {
      if (group === node) return id;
    }
    node = node.parent;
  }
  return null;
}

function isFocusMark(object: Object3D): boolean {
  let node: Object3D | null = object;
  while (node) {
    if (node.name === "replay-focus") return true;
    node = node.parent;
  }
  return false;
}

/** Burgundy X at the replay camera's look point. Hidden once replay closes. */
function ReplayFocusMark() {
  const ref = useRef<Group>(null);
  useFrame(() => {
    const mark = ref.current;
    if (!mark) return;
    mark.visible = replayFocus.on;
    if (!replayFocus.on) return;
    mark.position.set(replayFocus.x, replayFocus.y, replayFocus.z);
  });
  return (
    <group ref={ref} name="replay-focus" visible={false} frustumCulled={false}>
      <mesh rotation={[0, Math.PI / 4, 0]} position={[0, -0.01, 0]} raycast={() => null}>
        <boxGeometry args={[1.9, 0.02, 0.28]} />
        <meshBasicMaterial color="#000a40" toneMapped={false} />
      </mesh>
      <mesh rotation={[0, -Math.PI / 4, 0]} position={[0, -0.01, 0]} raycast={() => null}>
        <boxGeometry args={[1.9, 0.02, 0.28]} />
        <meshBasicMaterial color="#000a40" toneMapped={false} />
      </mesh>
      <mesh rotation={[0, Math.PI / 4, 0]} raycast={() => null}>
        <boxGeometry args={[1.75, 0.035, 0.16]} />
        <meshBasicMaterial color="#001489" toneMapped={false} />
      </mesh>
      <mesh rotation={[0, -Math.PI / 4, 0]} raycast={() => null}>
        <boxGeometry args={[1.75, 0.035, 0.16]} />
        <meshBasicMaterial color="#001489" toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Triggers scrub fast. Bumpers scrub slow. Shift is fast forward. Arrows move the X. */
function tapeScrub(keys: ReadonlySet<string>): TapeScrub {
  const shift = keys.has("ShiftLeft") || keys.has("ShiftRight");
  const backFast = readReplayPad(6) || keys.has("KeyG");
  if (backFast) return -2;
  if (readReplayPad(7) || shift) return 2;
  if (readReplayPad(4) || keys.has("KeyN") || keys.has("Comma")) return -1;
  if (readReplayPad(5) || keys.has("KeyM") || keys.has("Period")) return 1;
  return 0;
}

/**
 * Camera-relative step for the replay X. Arrows are full deflection.
 * The left stick adds in, unless a locked tape frame is already using it to slide a player.
 */
function markPan(keys: ReadonlySet<string>, camera: Camera, dt: number, allowStick: boolean): { x: number; yard: number } | null {
  let sx = (keys.has("ArrowRight") ? 1 : 0) - (keys.has("ArrowLeft") ? 1 : 0);
  let sy = (keys.has("ArrowUp") ? 1 : 0) - (keys.has("ArrowDown") ? 1 : 0);
  if (allowStick) {
    const pad = readBasicPad();
    if (pad) {
      const stick = radialDeadzone(pad.x, -pad.y);
      sx += stick.x;
      sy += stick.y;
    }
  }
  const mag = Math.hypot(sx, sy);
  if (mag < 0.02) return null;
  if (mag > 1) {
    sx /= mag;
    sy /= mag;
  }
  const field = steerFromCamera(sx, sy, camera);
  const dist = Math.hypot(camera.position.x - followTarget.x, camera.position.y - followTarget.y, camera.position.z - followTarget.z);
  const speed = Math.max(6, dist) * 0.9 * dt;
  return { x: field.x * speed, yard: field.yard * speed };
}

/** -1 is the football. Zero and up are players, in roster order. The ball follows the last player. */
function nextLook(lock: number, count: number) {
  if (count <= 0) return -1;
  if (lock < 0) return 0;
  return lock + 1 < count ? lock + 1 : -1;
}

/** A Y press that never moved the right stick. Holding Y and steering does not count. */
function takeLookPress(held: { yWas: boolean; yMoved: boolean }, yDown: boolean, stickMag: number) {
  if (yDown && !held.yWas) held.yMoved = false;
  if (yDown && stickMag > 0) held.yMoved = true;
  const press = !yDown && held.yWas && !held.yMoved;
  held.yWas = yDown;
  return press;
}

function carrierLookIndex(players: readonly { id: string }[], carrierId: string | undefined) {
  if (!carrierId) return -1;
  const index = players.findIndex((player) => player.id === carrierId);
  return index >= 0 ? index : -1;
}

/**
 * Screen up/right into field axes. World X is the right sideline and world Z is −yard.
 * Camera forward flattened to the ground is screen-up. Its right is screen-right.
 */
/** Defense stick in field axes. The camera frame is the same one the runner uses. */
function defenseStick(keys: ReadonlySet<string>, camera: Camera): DefenseStick {
  const raw = readRawDefense(keys);
  const move = steerFromCamera(raw.moveX, raw.moveY, camera);
  const hit = steerFromCamera(raw.hitX, raw.hitY, camera);
  const dpad = steerFromCamera(raw.dpadX, raw.dpadY, camera);
  return {
    x: move.x,
    yard: move.yard,
    sprint: raw.sprint,
    switchOn: raw.switchOn,
    dive: raw.dive,
    shed: raw.shed,
    wrap: raw.wrap,
    punch: raw.punch,
    strafe: raw.strafe,
    hitX: hit.x,
    hitY: hit.yard,
    dpadX: dpad.x,
    dpadY: dpad.yard,
    cyclePrev: raw.cyclePrev,
    cycleNext: raw.cycleNext,
    snapY: raw.snapY,
    snapEnter: raw.snapEnter,
    padA: raw.padA,
    aimCarrier: raw.aimCarrier,
  };
}

function steerFromCamera(screenRight: number, screenUp: number, camera: Camera) {
  camera.getWorldDirection(_camForward);
  _camForward.y = 0;
  if (_camForward.lengthSq() < 1e-8) {
    // Straight down (high camera). That rig's up is north, so screen-right is +X and screen-up is +yard.
    return { x: screenRight, yard: screenUp };
  }
  _camForward.normalize();
  _camRight.crossVectors(_camForward, _worldUp).normalize();
  return {
    x: screenRight * _camRight.x + screenUp * _camForward.x,
    yard: screenRight * -_camRight.z + screenUp * -_camForward.z,
  };
}

function PlayerMesh({
  player,
  bodies,
  kits,
  pose,
  carry,
  mark,
}: {
  player: Player;
  bodies: Map<string, Group>;
  kits: { offId: number; defId: number };
  pose?: string;
  carry?: boolean;
  mark?: boolean;
}) {
  return (
    <group
      ref={(node) => {
        if (node) bodies.set(player.id, node);
        return () => {
          if (bodies.get(player.id) === node) bodies.delete(player.id);
        };
      }}
      position={worldFromField(player.x, player.yard, player.hop)}
      rotation={[0, yawFromFacing(player.facingX, player.facingYard), 0]}
    >
      <PlayerFigure
        kit={kitById(player.team === "off" ? kits.offId : kits.defId)}
        number={jerseyNumber(player)}
        controlled={player.controlled}
        pose={pose}
        carry={carry}
        mark={mark}
        ballSide={pose ? poseBallSide(pose) : "r"}
      />
    </group>
  );
}

/**
 * Boot once. `bootFullPlay` resets the clock and the next-snap spot.
 * Calling it from a render (the old `useRef(bootFullPlay())` argument runs
 * every render) wiped that spot while `playOver` stayed true, so the roster
 * froze and the next snap never came back.
 */
function openSession(): { preview: boolean; sim: Sim; assigned: AssignedPlay | null } {
  if (previewRequested()) return { preview: true, sim: createSim(), assigned: null };
  const next = bootFullPlay();
  return { preview: false, sim: next.sim, assigned: next.assigned };
}

export function SimView() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const [session] = useState(openSession);
  const preview = useRef(session.preview);
  const sim = useRef<Sim>(session.sim);
  const assigned = useRef<AssignedPlay | null>(session.assigned);
  const keys = useRef(new Set<string>());
  const r3Was = useRef(false);
  const selectWas = useRef(false);
  const editRing = useRef<Mesh>(null);
  const editRev = useSyncExternalStore(subscribeTapeEdit, tapeEditRev);
  void editRev;
  /** Previous frame of gamepad button 0. Live A is sprint. After the whistle, a rising edge snaps or restarts. */
  const padAWas = useRef(false);
  const bodies = useRef(new Map<string, Group>());
  const poseShown = useRef(sim.current.pose);
  const [carrierPose, setCarrierPose] = useState(sim.current.pose);
  const losLine = useRef<Mesh>(null);
  const firstDownLine = useRef<Mesh>(null);
  const replay = useRef({ on: false, age: 0, rate: 1, playing: false, lock: -1, yWas: false, yMoved: false, spot: null as FieldSpot | null });
  const scrubLive = useRef(false);
  const tapeLook = useRef({ open: false, lock: -1, yWas: false, yMoved: false, spot: null as FieldSpot | null });
  const footageOn = useRef(false);
  /**
   * The press that arms a play is still down. Ignore it until it releases,
   * so that press does not also snap the ball.
   */
  const snapLatch = useRef(true);
  /** Seconds the whistle has been sitting with pause, replay, and tape held out. */
  const lineupWait = useRef(0);
  const huddlePlay = useRef<AssignedPlay | null>(null);
  const userRing = useRef<Mesh>(null);
  const defStamp = useRef("");
  const [defRev, setDefRev] = useState(0);
  const trail = useRef(createRunnerTrail());
  const trailLine = useMemo(() => createTrailLine(), []);
  const artState = useRef({
    model: session.assigned ? buildSnapArt(session.assigned, session.sim.los) : null,
    token: 1,
  });
  const artAge = useRef(0);
  /**
   * Game whistle waiting until the carried football's pose is on the mesh.
   * x/yard/ball are the whistle spot. Later movement does not move the chains.
   */
  const pendingSpotMeasure = useRef<{
    ballSpot: boolean;
    safety: boolean;
    wait: number;
    x: number;
    yard: number;
    ballX: number;
    ballYard: number;
  } | null>(null);
  const kits = useSyncExternalStore(subscribeUniforms, getUniformSelection);
  const stanceRev = useSyncExternalStore(subscribeStances, stanceRevision);
  const [rosterTick, setRosterTick] = useState(0);
  const mountPlay = (next: { sim: Sim; assigned: AssignedPlay }) => {
    pendingSpotMeasure.current = null;
    resetRunnerTrail(trail.current);
    trailLine.visible = false;
    const state = sim.current;
    // Keep this sim object. The frame loop and the meshes already point at it.
    Object.assign(state, next.sim);
    state.players = next.assigned.players;
    state.playOver = false;
    assigned.current = next.assigned;
    artState.current = { model: buildSnapArt(next.assigned, state.los), token: artState.current.token + 1 };
    artAge.current = 0;
    poseShown.current = state.pose;
    setCarrierPose(state.pose);
    snapLatch.current = true;
    setRosterTick((tick) => tick + 1);
  };
  const goNext = useRef(() => {
    const state = sim.current;
    console.log("Next play handler", {
      playOver: state.playOver,
      clockExpired: clockExpired(),
      seriesEnded: seriesEnded(),
    });
    // Game mode refuses a snap at 0:00 or after a turnover. Practice always snaps again.
    if (preview.current || !state.playOver) return;
    if (readMode() !== "practice" && (clockExpired() || seriesEnded())) return;
    replay.current.on = false;
    setReplayMode(false);
    const next = startNextPlay();
    if (!next) return;
    mountPlay(next);
    console.log("playOver cleared", {
      play: next.assigned.play.name,
      scheme: next.assigned.scheme.name,
      players: state.players.length,
      playOver: state.playOver,
    });
  });
  const restartGame = useRef(() => {
    const state = sim.current;
    if (preview.current || !state.playOver || !gameEnded()) return;
    replay.current.on = false;
    setReplayMode(false);
    randomizeFieldForNewGame();
    const next = bootFullPlay();
    mountPlay(next);
    console.log("New game", {
      play: next.assigned.play.name,
      scheme: next.assigned.scheme.name,
      players: sim.current.players.length,
      playOver: sim.current.playOver,
    });
  });
  const toggleReplay = useRef(() => {
    if (preview.current || !sim.current.playOver) return;
    const frames = assigned.current?.replay.frames ?? [];
    if (!replay.current.on) {
      const last = frames[frames.length - 1];
      if (!last) return;
      const carrierId = sim.current.players.find((player) => player.controlled)?.id;
      replay.current.on = true;
      replay.current.age = last.age;
      replay.current.playing = false;
      replay.current.lock = carrierLookIndex(last.players, carrierId);
      replay.current.spot = null;
      replay.current.yWas = false;
      replay.current.yMoved = false;
      setReplayMode(true);
      return;
    }
    replay.current.on = false;
    setReplayMode(false);
  });

  const applyStage = useRef(() => {
    if (preview.current) return;
    replay.current.on = false;
    const next = takeStage();
    if (!next) return;
    mountPlay(next);
    if (next.dead) sim.current.playOver = true;
  });
  useLayoutEffect(() => onModeStage(() => applyStage.current()), []);
  useLayoutEffect(() => onNextPlay(() => goNext.current()), []);
  useLayoutEffect(() => onRestart(() => restartGame.current()), []);
  useLayoutEffect(() => onReplayToggle(() => toggleReplay.current()), []);
  useEffect(() => {
    return bindReplaySeek((fraction) => {
      const frames = assigned.current?.replay.frames;
      if (!replay.current.on || !frames?.length) return;
      const start = frames[0]!.age;
      const end = frames[frames.length - 1]!.age;
      const u = Math.max(0, Math.min(1, fraction));
      replay.current.age = start + (end - start) * u;
      replay.current.playing = false;
      scrubLive.current = true;
      publishReplayScrub({ on: true, fraction: u, frame: shownReplaySample(frames, replay.current.age) });
    });
  }, []);
  useEffect(() => {
    return bindReplayToggle(() => {
      const frames = assigned.current?.replay.frames;
      if (!replay.current.on || !frames?.length) return;
      const start = frames[0]!.age;
      const end = frames[frames.length - 1]!.age;
      if (!replay.current.playing && replay.current.age >= end - 1e-3) replay.current.age = start;
      replay.current.playing = !replay.current.playing;
      publishReplayTransport({
        kind: "play",
        playing: replay.current.playing,
        shuttle: 0,
        locked: false,
      });
    });
  }, []);

  useLayoutEffect(() => {
    const down = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return;
      if (readTapeLocked() && (event.ctrlKey || event.metaKey) && event.code === "KeyZ" && !event.repeat) {
        event.preventDefault();
        if (event.shiftKey) redoTapeEdit();
        else undoTapeEdit();
        return;
      }
      if (readTapeLocked() && (event.ctrlKey || event.metaKey) && event.code === "KeyY" && !event.repeat) {
        event.preventDefault();
        redoTapeEdit();
        return;
      }
      if (readTapeLocked() && event.code === "Tab") {
        event.preventDefault();
        cycleTapeSelect(event.shiftKey ? -1 : 1);
        return;
      }
      if (readTapeOn() && !event.repeat) {
        if (event.code === "KeyR" || event.code === "Escape") {
          event.preventDefault();
          stopTape();
          return;
        }
        if (event.code === "Space") {
          event.preventDefault();
          toggleTapePlay();
          return;
        }
        if (event.code === "KeyL") {
          event.preventDefault();
          toggleTapeLock();
          return;
        }
      }
      if (!preview.current && event.code === "KeyP" && !event.repeat) {
        event.preventDefault();
        toggleProfile();
        return;
      }
      if (!preview.current && sim.current.playOver && event.code === "KeyR") {
        event.preventDefault();
        toggleReplay.current();
        return;
      }
      if (replay.current.on && event.code === "Escape") {
        event.preventDefault();
        replay.current.on = false;
        setReplayMode(false);
        return;
      }
      // P cycles profiles. Escape pauses, including the whistle screen, and still leaves replay above.
      if (
        !preview.current &&
        !replay.current.on &&
        event.code === PAUSE_KEY &&
        !event.repeat
      ) {
        event.preventDefault();
        setPaused(!readPaused());
        return;
      }
      if (
        (event.code === "Enter" || event.code === "NumpadEnter" || event.code === "KeyN") &&
        sim.current.playOver &&
        !preview.current
      ) {
        event.preventDefault();
        // Enter is also the snap. Hold it in the set so that press cannot snap
        // the formation it just armed. N is shake once the play is live, so drop it.
        if (event.code === "KeyN") keys.current.delete(event.code);
        else keys.current.add(event.code);
        goNext.current();
        return;
      }
      keys.current.add(event.code);
      if (isMoveCode(event.code)) event.preventDefault();
    };
    const up = (event: KeyboardEvent) => {
      keys.current.delete(event.code);
    };
    const clear = () => {
      if (document.hidden) keys.current.clear();
    };
    const blur = () => keys.current.clear();
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", clear);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", clear);
    };
  }, []);

  useEffect(() => {
    const down = (event: PointerEvent) => {
      if (!readTapeLocked() || event.button !== 0 || event.target !== gl.domElement) return;
      const rect = gl.domElement.getBoundingClientRect();
      _ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      _ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      _ray.setFromCamera(_ndc, camera);
      if (Math.abs(_ray.ray.direction.y) < 1e-5) return;
      const t = -_ray.ray.origin.y / _ray.ray.direction.y;
      if (!(t >= 0)) return;
      pickTapeBody(_ray.ray.origin.x + _ray.ray.direction.x * t, -(_ray.ray.origin.z + _ray.ray.direction.z * t));
    };
    gl.domElement.addEventListener("pointerdown", down);
    return () => gl.domElement.removeEventListener("pointerdown", down);
  }, [camera, gl]);

  useEffect(() => {
    let tracking = false;
    let downX = 0;
    let downY = 0;
    const aim = (id: string | null, raw: FieldSpot) => {
      const spot = clampFocus(raw.x, raw.yard);
      const [wx, wy, wz] = worldFromField(spot.x, spot.yard, 0.08);
      if (replay.current.on) {
        replayFocusJump(
          camera.position.x - followTarget.x,
          camera.position.y - followTarget.y,
          camera.position.z - followTarget.z,
        );
        if (id) {
          const frames = assigned.current?.replay.frames ?? [];
          const frame = sampleReplay(frames, replay.current.age);
          const index = frame ? frame.players.findIndex((player) => player.id === id) : -1;
          const player = index >= 0 ? frame?.players[index] : undefined;
          if (player) {
            replay.current.spot = null;
            replay.current.lock = index;
            const [px, py, pz] = worldFromField(player.x, player.yard, 0.9);
            setFollowTarget(px, py, pz, player.facingX, player.facingYard);
            return;
          }
        }
        replay.current.spot = spot;
        replay.current.lock = -1;
        setFollowTarget(wx, wy, wz);
        return;
      }
      const frame = tapeFrame();
      if (!frame) return;
      if (id) {
        const index = frame.bodies.findIndex((body) => body.id === id);
        const body = index >= 0 ? frame.bodies[index] : undefined;
        if (body) {
          tapeLook.current.spot = null;
          tapeLook.current.lock = index;
          const [px, py, pz] = worldFromField(body.x, body.yard, 0.9);
          setFollowTarget(px, py, pz, body.facingX, body.facingYard);
          return;
        }
      }
      tapeLook.current.spot = spot;
      tapeLook.current.lock = -1;
      setFollowTarget(wx, wy, wz);
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || event.target !== gl.domElement) return;
      if (practiceSpotAiming() || (!replay.current.on && !readTapeOn())) return;
      tracking = true;
      downX = event.clientX;
      downY = event.clientY;
    };
    const up = (event: PointerEvent) => {
      if (!tracking) return;
      tracking = false;
      if (event.button !== 0) return;
      if (Math.hypot(event.clientX - downX, event.clientY - downY) > REPLAY_CLICK) return;
      if (practiceSpotAiming() || (!replay.current.on && !readTapeOn())) return;
      const rect = gl.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      camera.updateMatrixWorld();
      _ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      _ray.setFromCamera(_ndc, camera);
      const hits = _ray.intersectObjects(scene.children, true);
      for (const hit of hits) {
        if (isFocusMark(hit.object)) continue;
        if (hit.object.type === "Line2" || hit.object.parent?.type === "Line2") continue;
        const picked = ownerId(hit.object, bodies.current);
        if (picked) {
          const group = bodies.current.get(picked);
          aim(picked, { x: group?.position.x ?? hit.point.x, yard: group ? -group.position.z : -hit.point.z });
          return;
        }
        aim(null, { x: hit.point.x, yard: -hit.point.z });
        return;
      }
      const dir = _ray.ray.direction;
      const origin = _ray.ray.origin;
      if (Math.abs(dir.y) < 1e-5) return;
      const t = -origin.y / dir.y;
      if (!(t >= 0)) return;
      aim(null, { x: origin.x + dir.x * t, yard: -(origin.z + dir.z * t) });
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
    };
  }, [camera, gl, scene]);

  useFrame((_, dt) => {
    // Button 0 is sprint while the play is live. After a whistle with time left,
    // a new press starts the next snap. After the game is over, the same edge
    // starts a fresh game. A hold across the whistle does not.
    const padA = readPadButton(0);
    const padAEdge = padA && !padAWas.current;
    padAWas.current = padA;
    // Gamepad A resumes a pause. It does not also snap or start the tape.
    // Live A stays sprint. A hold across the whistle still does not snap.
    const resumeOnA =
      padAEdge && readPaused() && !readTapeOn() && !replay.current.on && !sim.current.playOver;
    if (resumeOnA) setPaused(false);
    // Practice re-spot: A confirms the X. That press does not also snap or start the next play.
    if (padAEdge && !resumeOnA && practiceSpotAiming()) {
      confirmPracticeRespot();
    } else if (padAEdge && !resumeOnA && sim.current.playOver && !replay.current.on) {
      if (gameEnded()) restartGame.current();
      else goNext.current();
    }

    const state = sim.current;
    const play = assigned.current;
    const hasFootage = !preview.current && (play?.replay.frames.length ?? 0) > 0;
    if (hasFootage !== footageOn.current) {
      footageOn.current = hasFootage;
      setReplayFootage(hasFootage);
    }
    const overAtStart = state.playOver;
    const queueWhistle = (ballSpot: boolean, safety = false) => {
      if (preview.current || readMode() !== "game") {
        markPlayOver(state, ballSpot, undefined, safety);
        return;
      }
      const carrier = controlledPlayer(state);
      if ((carrier?.yard ?? 0) >= FIELD.length) {
        markPlayOver(state, ballSpot);
        return;
      }
      if (!pendingSpotMeasure.current) {
        pendingSpotMeasure.current = {
          ballSpot,
          safety,
          wait: 0,
          x: carrier?.x ?? state.ballX,
          yard: carrier?.yard ?? state.ballYard,
          ballX: state.ballX,
          ballYard: state.ballYard,
        };
      }
    };
    const tryMeasureSpot = () => {
      const pending = pendingSpotMeasure.current;
      if (!pending || preview.current || readMode() !== "game") return;
      pending.wait += 1;
      const carrier = controlledPlayer(state);
      const body = carrier ? bodies.current.get(carrier.id) : undefined;
      const align = body?.getObjectByName(FIGURE_ALIGN);
      const posed = align?.userData.figurePose === state.pose;
      if ((!body || !posed) && pending.wait < 8) return;
      pendingSpotMeasure.current = null;
      const liveX = carrier?.x;
      const liveYard = carrier?.yard;
      const liveBallX = state.ballX;
      const liveBallYard = state.ballYard;
      if (carrier) {
        carrier.x = pending.x;
        carrier.yard = pending.yard;
      }
      state.ballX = pending.ballX;
      state.ballYard = pending.ballYard;
      let tip = body ? footballLeadingTip(body) : null;
      // The body may already have run past the whistle. Keep the leather tip on that spot.
      if (tip && liveX != null && liveYard != null) {
        tip = { x: tip.x - (liveX - pending.x), yard: tip.yard - (liveYard - pending.yard) };
      }
      markPlayOver(state, pending.ballSpot, tip ?? { x: pending.ballX, yard: pending.ballYard }, pending.safety);
      if (carrier && liveX != null && liveYard != null) {
        carrier.x = liveX;
        carrier.yard = liveYard;
      }
      state.ballX = liveBallX;
      state.ballYard = liveBallYard;
    };
    // Formation is armed. Offense snaps on Enter or A. Defense cycles on an A tap,
    // snaps on Y, Enter, or a held A, and shades with the stick.
    const playingDef = !preview.current && readPlaySide() === "def";
    if (play && playingDef && !play.snapped && !state.playOver && !replay.current.on && !readTapeOn()) {
      if (huddlePlay.current !== play) {
        huddlePlay.current = play;
        beginDefenseHuddle(padA);
      }
      if (!readPaused()) {
        const enterDown = keys.current.has("Enter") || keys.current.has("NumpadEnter");
        if (snapLatch.current) {
          if (!enterDown && !padA) snapLatch.current = false;
        }
        const hold = defenseStick(keys.current, camera);
        if (practiceSpotAiming()) {
          hold.x = 0;
          hold.yard = 0;
        }
        if (snapLatch.current || resumeOnA) hold.snapEnter = false;
        if (tickDefenseHuddle(play.players, hold, Math.min(Math.max(dt, 0), 0.05), state.los) === "snap") {
          play.snapped = true;
          beginDefenseLive(play.players);
          poseShown.current = state.pose;
          setCarrierPose(state.pose);
          markSnap();
        }
      }
    } else if (play && !preview.current && !play.snapped && !state.playOver && !replay.current.on && !readTapeOn()) {
      const confirmDown = keys.current.has("Enter") || keys.current.has("NumpadEnter") || padA;
      if (snapLatch.current) {
        if (!confirmDown) snapLatch.current = false;
      } else if (!resumeOnA && (keys.current.has("Enter") || keys.current.has("NumpadEnter") || padAEdge)) {
        play.snapped = true;
        poseShown.current = state.pose;
        setCarrierPose(state.pose);
        markSnap();
      }
    }
    const r3 = readRightStickClick();
    const r3Edge = r3 && !r3Was.current;
    r3Was.current = r3;
    const select = readPadButton(8);
    const selectEdge = select && !selectWas.current;
    selectWas.current = select;
    const tapeWas = readTapeOn();
    if (tapeWas && (r3Edge || selectEdge)) stopTape();
    if (tapeWas && padAEdge && readTapeOn()) toggleTapePlay();
    if (readTapeOn()) {
      const stepDt = Math.min(Math.max(dt, 0), 0.05);
      const padScrub = tapeScrub(keys.current);
      const scrub = padScrub !== 0 ? padScrub : readTapeHeldScrub();
      stepTape(stepDt, scrub);
      const shuttle = scrub === -2 ? -3.4 : scrub === -1 ? -0.28 : scrub === 1 ? 0.28 : scrub === 2 ? 3.4 : 0;
      publishReplayTransport({
        kind: "tape",
        playing: readTapePlaying() && shuttle === 0,
        shuttle,
        locked: readTapeLocked(),
      });
      let nudged = false;
      if (readTapeLocked() && readTapeSelected()) {
        const yHeld = readReplayPad(3) || keys.current.has("KeyY");
        const faceHeld = readPadButton(0);
        const pad = readBasicPad();
        const stick = pad ? radialDeadzone(pad.x, -pad.y) : { x: 0, y: 0 };
        let turn = (keys.current.has("Period") ? 1 : 0) - (keys.current.has("Comma") ? 1 : 0);
        if (faceHeld && stick.x) turn += Math.sign(stick.x);
        if (!yHeld && !faceHeld) {
          let sx = stick.x;
          let sy = stick.y;
          if (keys.current.has("KeyD")) sx += 1;
          if (keys.current.has("KeyA")) sx -= 1;
          if (keys.current.has("KeyW")) sy += 1;
          if (keys.current.has("KeyS")) sy -= 1;
          const mag = Math.hypot(sx, sy);
          if (mag > 1) {
            sx /= mag;
            sy /= mag;
          }
          if (sx !== 0 || sy !== 0) {
            const move = steerFromCamera(sx, sy, camera);
            slideTapeSelection(move.x * EDIT_SPEED * stepDt, move.yard * EDIT_SPEED * stepDt);
            nudged = true;
          }
        }
        if (turn !== 0) {
          turnTapeSelection(2.4 * stepDt * Math.sign(turn));
          nudged = true;
        }
      }
      if (readTapeLocked() && !nudged) endTapeNudge();
      const frame = tapeFrame();
      if (frame) {
        for (const sample of frame.bodies) {
          const group = bodies.current.get(sample.id);
          if (!group) continue;
          const [x, y, z] = worldFromField(sample.x, sample.yard, sample.hop);
          group.position.set(x, y, z);
          group.rotation.y = yawFromFacing(sample.facingX, sample.facingYard);
          const ring = group.getObjectByName("player-ring");
          if (ring) ring.position.y = 0.04 - sample.hop;
        }
        if (frame.pose !== poseShown.current) {
          poseShown.current = frame.pose;
          setCarrierPose(frame.pose);
        }
        const carrierId = state.players.find((player) => player.controlled)?.id;
        if (!tapeLook.current.open) {
          tapeLook.current.open = true;
          tapeLook.current.yWas = readReplayPad(3) || keys.current.has("KeyY");
          tapeLook.current.yMoved = false;
          tapeLook.current.lock = carrierLookIndex(frame.bodies, carrierId);
          tapeLook.current.spot = null;
        }
        const yDown = readReplayPad(3) || keys.current.has("KeyY");
        const rs = readRightStick();
        if (takeLookPress(tapeLook.current, yDown, Math.hypot(rs.x, rs.y))) {
          if (tapeLook.current.spot) tapeLook.current.lock = -1;
          tapeLook.current.spot = null;
          tapeLook.current.lock = nextLook(tapeLook.current.lock, frame.bodies.length);
        }
        const spot = tapeLook.current.spot;
        const locked = !spot && tapeLook.current.lock >= 0 ? frame.bodies[tapeLook.current.lock] : undefined;
        const carrier = frame.bodies.find((body) => body.id === carrierId) ?? frame.bodies[0];
        let lookX = spot ? spot.x : locked ? locked.x : frame.ballX;
        let lookYard = spot ? spot.yard : locked ? locked.yard : frame.ballYard;
        const editingMove = readTapeLocked() && !!readTapeSelected() && !(readReplayPad(3) || keys.current.has("KeyY"));
        const delta = markPan(keys.current, camera, stepDt, !editingMove);
        if (delta) {
          const moved = clampFocus(lookX + delta.x, lookYard + delta.yard);
          tapeLook.current.spot = moved;
          tapeLook.current.lock = -1;
          lookX = moved.x;
          lookYard = moved.yard;
        }
        const facingX = locked?.facingX ?? carrier?.facingX ?? 0;
        const facingYard = locked?.facingYard ?? carrier?.facingYard ?? 1;
        const [lx, ly, lz] = worldFromField(lookX, lookYard, tapeLook.current.spot ? 0.08 : 0.9);
        setFollowTarget(lx, ly, lz, facingX, facingYard);
        if (userRing.current) {
          if (tapeLook.current.spot) userRing.current.visible = false;
          else {
            const [rx, , rz] = worldFromField(lookX, lookYard, 0.04);
            userRing.current.visible = true;
            userRing.current.position.set(rx, 0.04, rz);
          }
        }
        const selected = frame.bodies.find((body) => body.id === readTapeSelected());
        if (editRing.current && selected) {
          const [x, , z] = worldFromField(selected.x, selected.yard, 0.05);
          editRing.current.visible = true;
          editRing.current.position.set(x, 0.05, z);
        } else if (editRing.current) editRing.current.visible = false;
      }
      trailLine.visible = false;
      if (scrubLive.current) {
        scrubLive.current = false;
        clearReplayScrub();
      }
      return;
    }
    tapeLook.current.open = false;
    if (editRing.current) editRing.current.visible = false;
    const replayWas = replay.current.on;
    if (r3Edge && replayWas) {
      replay.current.on = false;
      setReplayMode(false);
    }
    const canPause = !preview.current && !!play && !replayWas;
    if (r3Edge && canPause && !tapeWas) setPaused(!readPaused());
    if (!preview.current && replay.current.on && play && play.replay.frames.length > 0) {
      let rate = replay.current.rate;
      if (keys.current.has("Digit1")) rate = 0.5;
      if (keys.current.has("Digit2")) rate = 1;
      if (keys.current.has("Digit3")) rate = 2;
      replay.current.rate = rate;
      const bounded = Math.min(dt, 0.05);
      let shuttle = 0;
      if (readReplayPad(6)) shuttle = -3.4;
      else if (readReplayPad(7)) shuttle = 3.4;
      else if (readReplayPad(4)) shuttle = -0.28;
      else if (readReplayPad(5)) shuttle = 0.28;
      else shuttle = readReplayHeldRate();
      const frames = play.replay.frames;
      const start = frames[0]!.age;
      const end = frames[frames.length - 1]!.age;
      if (padAEdge) {
        if (!replay.current.playing && replay.current.age >= end - 1e-3) replay.current.age = start;
        replay.current.playing = !replay.current.playing;
      }
      if (shuttle !== 0) replay.current.playing = false;
      const stepAge = shuttle !== 0 ? shuttle * bounded : replay.current.playing ? rate * bounded : 0;
      replay.current.age = Math.min(end, Math.max(start, replay.current.age + stepAge));
      const frame = sampleReplay(frames, replay.current.age);
      let trailTip: { x: number; yard: number } | null = null;
      if (frame) {
        for (const sample of frame.players) {
          const group = bodies.current.get(sample.id);
          if (!group) continue;
          const [x, y, z] = worldFromField(sample.x, sample.yard, sample.hop);
          group.position.set(x, y, z);
          group.rotation.y = yawFromFacing(sample.facingX, sample.facingYard);
          const ring = group.getObjectByName("player-ring");
          if (ring) ring.position.y = 0.04 - sample.hop;
        }
        if (frame.pose !== poseShown.current) {
          poseShown.current = frame.pose;
          setCarrierPose(frame.pose);
        }
        const yDown = readReplayPad(3) || keys.current.has("KeyY");
        const rs = readRightStick();
        if (takeLookPress(replay.current, yDown, Math.hypot(rs.x, rs.y))) {
          if (replay.current.spot) replay.current.lock = -1;
          replay.current.spot = null;
          replay.current.lock = nextLook(replay.current.lock, frame.players.length);
        }
        const carrierId = state.players.find((player) => player.controlled)?.id;
        const spot = replay.current.spot;
        const locked = !spot && replay.current.lock >= 0 ? frame.players[replay.current.lock] : undefined;
        const carrier = frame.players.find((player) => player.id === carrierId) ?? frame.players[0];
        let lookX = spot ? spot.x : locked ? locked.x : frame.ballX;
        let lookYard = spot ? spot.yard : locked ? locked.yard : frame.ballYard;
        const delta = markPan(keys.current, camera, bounded, true);
        if (delta) {
          const moved = clampFocus(lookX + delta.x, lookYard + delta.yard);
          const [nx, , nz] = worldFromField(moved.x, moved.yard, 0);
          const [ox, , oz] = worldFromField(lookX, lookYard, 0);
          camera.position.x += nx - ox;
          camera.position.z += nz - oz;
          replay.current.spot = moved;
          replay.current.lock = -1;
          lookX = moved.x;
          lookYard = moved.yard;
        }
        const facingX = locked?.facingX ?? carrier?.facingX ?? 0;
        const facingYard = locked?.facingYard ?? carrier?.facingYard ?? 1;
        const [x, y, z] = worldFromField(lookX, lookYard, replay.current.spot ? 0.08 : 0.9);
        setFollowTarget(x, y, z, facingX, facingYard);
        // The live tip meets the runner between samples. The lock must not pull that stroke.
        trailTip = carrier ? { x: carrier.x, yard: carrier.yard } : null;
        if (userRing.current) {
          if (replay.current.spot) userRing.current.visible = false;
          else {
            const [rx, , rz] = worldFromField(lookX, lookYard, 0.04);
            userRing.current.visible = true;
            userRing.current.position.set(rx, 0.04, rz);
          }
        }
      }
      syncTrailLine(trailLine, trail.current, replay.current.age, trailTip);
      artAge.current = replay.current.age;
      const span = end - start;
      scrubLive.current = true;
      publishReplayScrub({
        on: true,
        fraction: span <= 1e-8 ? 1 : (replay.current.age - start) / span,
        frame: shownReplaySample(frames, replay.current.age),
      });
      publishReplayTransport({
        kind: "play",
        playing: replay.current.playing && shuttle === 0,
        shuttle,
        locked: false,
      });
      return;
    }
    if (scrubLive.current) {
      scrubLive.current = false;
      clearReplayScrub();
    }
    clearReplayHeldRate();
    publishReplayTransport({ kind: "off", playing: false, shuttle: 0, locked: false });
    const raw = basicMove(keys.current, readBasicPad());
    const steered = steerFromCamera(raw.x, raw.yard, camera);
    const input = { ...raw, x: steered.x, yard: steered.yard };
    if (practiceSpotAiming()) {
      input.x = 0;
      input.yard = 0;
    }
    try {
      if (preview.current || !play) step(state, input, dt);
      else if (!readPaused() && play.snapped) {
        // The whistle settles the play. Bodies keep moving until the next lineup.
        if (!state.playOver) tickClock(Math.min(dt, 0.05));
        if (playingDef) {
          // LT/RT stay wrap and punch. The right stick stays the hit stick. No teammate steer.
          const defense = defenseStick(keys.current, camera);
          if (practiceSpotAiming()) {
            defense.x = 0;
            defense.yard = 0;
          }
          stepAssignments(state, play, {
            x: 0,
            yard: 0,
            action: "carry",
            sprint: false,
            defense,
          }, dt);
        } else {
          // Z and X select the blocker. Wings shares this stick. Independent and Classic use U/B/K/O.
          // Classic stiff-arm is Tab and \ (Select and Start on a pad). Triggers do not stiff-arm.
          const steerLeft = keys.current.has("KeyZ");
          const steerRight = keys.current.has("KeyX");
          const steerMode = readProfile();
          let action = input.action;
          if (steerLeft && action === "stiffL") action = "carry";
          if (steerRight && action === "stiffR") action = "carry";
          if (steerMode === "classic") {
            if (action === "stiffL" || action === "stiffR") action = "carry";
            const stiff = readClassicStiff();
            if (action === "carry") {
              if (keys.current.has("Tab") || stiff.left) action = "stiffL";
              else if (keys.current.has("Backslash") || stiff.right) action = "stiffR";
            }
          }
          const blockerScreen = steerMode === "wings" ? null : readBlockerStick(keys.current);
          const blocker = blockerScreen === null ? null : steerFromCamera(blockerScreen.x, blockerScreen.y, camera);
          stepAssignments(state, play, {
            ...input,
            action,
            steerLeft,
            steerRight,
            steerMode,
            blockerX: blocker?.x ?? 0,
            blockerYard: blocker?.yard ?? 0,
          }, dt);
        }
        noteTape(Math.min(Math.max(dt, 0), 0.05), state);
        const carrier = controlledPlayer(state);
        if (!state.playOver && carrier && carrier.yard >= FIELD.length) {
          state.playOver = true;
          console.log("[playOver] set", {
            reason: "touchdown",
            yard: Number(carrier.yard.toFixed(3)),
            carrier: carrier.id,
          });
        }
        if (!state.playOver && carrier && carrier.team === "off" && carrier.yard <= SOUTH_BACK) {
          state.playOver = true;
          console.log("[playOver] set", {
            reason: "own end line",
            yard: Number(carrier.yard.toFixed(3)),
            carrier: carrier.id,
          });
        }
      }
    } catch (err) {
      console.error("[sim] frame error", err);
    }
    for (const p of state.players) {
      const group = bodies.current.get(p.id);
      if (!group) continue;
      const [x, y, z] = worldFromField(p.x, p.yard, p.hop);
      group.position.set(x, y, z);
      group.rotation.y = yawFromFacing(p.facingX, p.facingYard);
      const ring = group.getObjectByName("player-ring");
      if (ring) ring.position.y = 0.04 - p.hop;
    }
    if (!preview.current && play?.snapped && !state.playOver && !readPaused()) {
      const carrier = controlledPlayer(state);
      const body = carrier ? bodies.current.get(carrier.id) : undefined;
      if (body) {
        const bounds = runnerBounds(body);
        if (bounds.ownBack || bounds.sideline) {
          state.playOver = true;
          console.log("[playOver] set", {
            reason: bounds.ownBack ? "own end line" : "out of bounds",
            ballX: Number(state.ballX.toFixed(3)),
            ballYard: Number(state.ballYard.toFixed(3)),
            carrier: carrier?.id,
          });
          // The back of the end zone wins over a sideline corner. Side-only stays an out-of-bounds spot.
          queueWhistle(bounds.sideline && !bounds.ownBack, bounds.ownBack || bounds.ownEndSideline);
        }
      }
    }
    // Tackle, score, and end-line whistles are flagged during the step. Settle once, on that frame.
    // Out of bounds already queued above. Bodies keep moving until the lineup cut.
    if (!overAtStart && state.playOver && !pendingSpotMeasure.current) {
      const carrier = controlledPlayer(state);
      const safety = carrier?.team === "off" && (carrier.yard ?? 0) <= SOUTH_BACK && (carrier.yard ?? 0) < FIELD.length;
      queueWhistle(false, safety);
    }
    tryMeasureSpot();
    // Line up the next play 1.25s after the whistle. Enter, N, or A still does it sooner.
    // Pause, replay, tape, and a practice re-spot hold the wait. Snap stays a separate press.
    const lineupReady =
      state.playOver &&
      !preview.current &&
      !readPaused() &&
      !replay.current.on &&
      !readTapeOn() &&
      !practiceSpotAiming() &&
      (readMode() === "practice" || (!clockExpired() && !seriesEnded()));
    if (!lineupReady) {
      if (!state.playOver || preview.current) lineupWait.current = 0;
    } else {
      lineupWait.current += Math.min(Math.max(dt, 0), 0.05);
      // The ball spot is still being measured for the first few frames after the whistle.
      if (lineupWait.current >= LINEUP_DELAY && !pendingSpotMeasure.current) {
        goNext.current();
        if (!sim.current.playOver) lineupWait.current = 0;
      }
    }
    const userId = playingDef ? readUserDefenderId() : null;
    const user = userId ? state.players.find((player) => player.id === userId) ?? null : null;
    const ball = controlledPlayer(state);
    if (userRing.current) {
      const marked = userId ? bodies.current.get(userId) : undefined;
      if (marked) {
        userRing.current.visible = true;
        userRing.current.position.copy(marked.position);
        userRing.current.position.y = 0.04;
      } else userRing.current.visible = false;
    }
    // Huddle watches the defender. Live play sits between the ball and that defender.
    const lead = playingDef && user && ball && play?.snapped
      ? { x: ball.x * 0.58 + user.x * 0.42, yard: ball.yard * 0.52 + user.yard * 0.48, facingX: user.facingX, facingYard: user.facingYard }
      : user ?? ball;
    if (lead && !practiceSpotAiming()) {
      const [x, y, z] = worldFromField(lead.x, lead.yard, 0.9);
      setFollowTarget(x, y, z, lead.facingX, lead.facingYard);
    }
    if (practiceSpotAiming()) {
      const pad = readBasicPad();
      let sx = (keys.current.has("ArrowRight") ? 1 : 0) - (keys.current.has("ArrowLeft") ? 1 : 0);
      let sy = (keys.current.has("ArrowUp") ? 1 : 0) - (keys.current.has("ArrowDown") ? 1 : 0);
      if (pad) {
        const stick = radialDeadzone(pad.x, -pad.y);
        if (stick.x !== 0 || stick.y !== 0) {
          sx = stick.x;
          sy = stick.y;
        }
      }
      const mag = Math.hypot(sx, sy);
      if (mag > 1) {
        sx /= mag;
        sy /= mag;
      }
      const aim = readPractice();
      if (mag > 0) {
        const field = steerFromCamera(sx, sy, camera);
        const step = Math.min(Math.max(dt, 0), 0.05);
        movePracticeAim(aim.aimX + field.x * 16 * step, aim.aimYard + field.yard * 16 * step);
      }
      const placed = readPractice();
      const [mx, my, mz] = worldFromField(placed.aimX, placed.aimYard, 0.9);
      setFollowTarget(mx, my, mz, 0, 1);
    }
    if (state.pose !== poseShown.current) {
      poseShown.current = state.pose;
      setCarrierPose(state.pose);
    }
    if (losLine.current) {
      const [x, y, z] = worldFromField(FIELD.width / 2, state.los, 0.06);
      losLine.current.position.set(x, y, z);
    }
    if (firstDownLine.current) {
      const yard = readFirstDownYard(state.los);
      firstDownLine.current.visible = yard != null;
      if (yard != null) {
        const [x, y, z] = worldFromField(FIELD.width / 2, yard, 0.06);
        firstDownLine.current.position.set(x, y, z);
      }
    }
    const carrierNow = controlledPlayer(state);
    if (carrierNow && !readPaused() && (preview.current || play?.snapped)) {
      const bounded = Math.min(Math.max(dt, 0), 0.05);
      const age = play ? play.age : (trail.current.clock += bounded);
      if (!overAtStart && state.playOver && carrierNow.yard >= FIELD.length) {
        sealRunnerTrail(trail.current, carrierNow.x, carrierNow.yard, age);
      } else if (!overAtStart && state.playOver) {
        pinRunnerTrail(trail.current, carrierNow.x, carrierNow.yard, age);
      } else {
        sampleRunnerTrail(trail.current, carrierNow.x, carrierNow.yard, age, bounded, state.burst === "dive");
      }
    }
    syncTrailLine(
      trailLine,
      trail.current,
      null,
      carrierNow ? { x: carrierNow.x, yard: carrierNow.yard } : null,
    );
    if (!replay.current.on) artAge.current = play ? play.age : 99;
    const stamp = `${readPlaySide()}|${readUserDefenderId() ?? ""}|${readUserDefPose() ?? ""}`;
    if (stamp !== defStamp.current) {
      defStamp.current = stamp;
      setDefRev((n) => n + 1);
    }
  });

  const [losX, losY, losZ] = worldFromField(FIELD.width / 2, sim.current.los, 0.06);
  const firstYard = readFirstDownYard(sim.current.los);
  const [fdX, fdY, fdZ] = worldFromField(FIELD.width / 2, firstYard ?? sim.current.los, 0.06);
  const roster = sim.current.players;
  const armed = !preview.current && assigned.current != null && !assigned.current.snapped;
  // Subscribing is what repaints a stance when it is applied or released.
  void stanceRev;
  void defRev;
  const defenseOn = !preview.current && readPlaySide() === "def";
  const userId = defenseOn ? readUserDefenderId() : null;
  const userPose = defenseOn ? readUserDefPose() : null;

  return (
    <>
      <primitive object={trailLine} dispose={null} />
      <mesh ref={editRing} visible={false} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.78, 0.96, 28]} />
        <meshBasicMaterial color="#fb4f14" side={DoubleSide} />
      </mesh>
      <mesh ref={userRing} visible={false} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.52, 0.68, 24]} />
        <meshBasicMaterial color="#f4efe4" side={DoubleSide} />
      </mesh>
      <RespotMarker />
      <ReplayFocusMark />
      <PlayArt modelRef={artState} age={artAge} rosterTick={rosterTick} />
      <group key={rosterTick}>
        <mesh ref={losLine} position={[losX, losY, losZ]}>
          <boxGeometry args={[FIELD.width, 0.035, 0.16]} />
          <meshStandardMaterial color="#3b82f6" />
        </mesh>
        <mesh ref={firstDownLine} visible={firstYard != null} position={[fdX, fdY, fdZ]}>
          <boxGeometry args={[FIELD.width, 0.035, 0.16]} />
          <meshStandardMaterial color="#fbbf24" />
        </mesh>
        {roster.map((player) => {
          const edited = tapeBodyPose(player.id);
          const pose = edited
            ?? (userId && player.id === userId ? (userPose ?? stanceOf(player)) : player.controlled ? (armed ? sim.current.pose : carrierPose) : stanceOf(player));
          return (
            <PlayerMesh
              key={player.id}
              player={player}
              bodies={bodies.current}
              kits={kits}
              pose={pose}
              carry={edited ? poseCarriesBall(edited) : undefined}
              mark={defenseOn ? false : undefined}
            />
          );
        })}
      </group>
    </>
  );
}
