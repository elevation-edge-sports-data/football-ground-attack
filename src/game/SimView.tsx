import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useSyncExternalStore } from "react";
import { Vector3, type Camera, type Group, type Mesh } from "three";
import { FIELD } from "../field/spec";
import { setFollowTarget } from "./cameraFollow";
import { footballLeadingTip } from "./ballTip";
import { worldFromField, yawFromFacing } from "./frame";
import { FIGURE_ALIGN } from "./PlayerFigure";
import { poseBallSide } from "./carrierPose";
import { RespotMarker } from "./RespotMarker";
import { basicMove, isMoveCode, PAUSE_KEY, readBasicPad, readBlockerStick, readClassicStiff, readPadButton, readRightStickClick } from "./input";
import { PlayArt } from "./PlayArt";
import { PlayerFigure } from "./PlayerFigure";
import { buildSnapArt } from "./snapArt";
import { createTrailLine, syncTrailLine } from "./runnerTrailLine";
import { createRunnerTrail, pinRunnerTrail, resetRunnerTrail, sampleRunnerTrail, sealRunnerTrail } from "./runnerTrail";
import { sampleReplay, stepAssignments } from "./sim/advance";
import { stanceOf, stanceRevision, subscribeStances } from "./sim/stance";
import { bootFullPlay, clockExpired, gameEnded, markPlayOver, markSnap, onModeStage, onNextPlay, onReplayToggle, onRestart, previewRequested, readFirstDownYard, readMode, readPaused, readProfile, seriesEnded, setPaused, setReplayMode, startNextPlay, takeStage, tickClock, toggleProfile } from "./sim/boot";
import { runnerTouchesSideline } from "./sideline";
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

/**
 * Screen up/right into field axes. World X is the right sideline and world Z is −yard.
 * Camera forward flattened to the ground is screen-up. Its right is screen-right.
 */
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
}: {
  player: Player;
  bodies: Map<string, Group>;
  kits: { offId: number; defId: number };
  pose?: string;
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
  const [session] = useState(openSession);
  const preview = useRef(session.preview);
  const sim = useRef<Sim>(session.sim);
  const assigned = useRef<AssignedPlay | null>(session.assigned);
  const keys = useRef(new Set<string>());
  const r3Was = useRef(false);
  /** Previous frame of gamepad button 0. Live A is sprint. After the whistle, a rising edge snaps or restarts. */
  const padAWas = useRef(false);
  const bodies = useRef(new Map<string, Group>());
  const poseShown = useRef(sim.current.pose);
  const [carrierPose, setCarrierPose] = useState(sim.current.pose);
  const losLine = useRef<Mesh>(null);
  const firstDownLine = useRef<Mesh>(null);
  const replay = useRef({ on: false, age: 0, rate: 1 });
  /**
   * The press that arms a play is still down. Ignore it until it releases,
   * so that press does not also snap the ball.
   */
  const snapLatch = useRef(true);
  const trail = useRef(createRunnerTrail());
  const trailLine = useMemo(() => createTrailLine(), []);
  const artState = useRef({
    model: session.assigned ? buildSnapArt(session.assigned, session.sim.los) : null,
    token: 1,
  });
  const artAge = useRef(0);
  /** Game whistle waiting until the carried football's pose is on the mesh. */
  const pendingSpotMeasure = useRef<{ ballSpot: boolean; wait: number } | null>(null);
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
      replay.current.on = true;
      replay.current.age = last.age;
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

  useLayoutEffect(() => {
    const down = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return;
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
      // P cycles profiles. Escape pauses a live play and still leaves replay above.
      if (
        !preview.current &&
        !replay.current.on &&
        !sim.current.playOver &&
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

  useFrame((_, dt) => {
    // Button 0 is sprint while the play is live. After a whistle with time left,
    // a new press starts the next snap. After the game is over, the same edge
    // starts a fresh game. A hold across the whistle does not.
    const padA = readPadButton(0);
    const padAEdge = padA && !padAWas.current;
    padAWas.current = padA;
    if (padAEdge && sim.current.playOver) {
      if (gameEnded()) restartGame.current();
      else goNext.current();
    }

    const state = sim.current;
    const play = assigned.current;
    const overAtStart = state.playOver;
    const queueWhistle = (ballSpot: boolean) => {
      if (preview.current || readMode() !== "game") {
        markPlayOver(state, ballSpot);
        return;
      }
      const carrier = controlledPlayer(state);
      if ((carrier?.yard ?? 0) >= FIELD.length) {
        markPlayOver(state, ballSpot);
        return;
      }
      if (!pendingSpotMeasure.current) pendingSpotMeasure.current = { ballSpot, wait: 0 };
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
      const tip = body ? footballLeadingTip(body) : null;
      markPlayOver(state, pending.ballSpot, tip ?? { x: state.ballX, yard: state.ballYard });
    };
    // Formation is armed. Enter or A snaps. The arming press is latched until it lifts.
    if (play && !preview.current && !play.snapped && !state.playOver && !replay.current.on) {
      const confirmDown = keys.current.has("Enter") || keys.current.has("NumpadEnter") || padA;
      if (snapLatch.current) {
        if (!confirmDown) snapLatch.current = false;
      } else if (keys.current.has("Enter") || keys.current.has("NumpadEnter") || padAEdge) {
        play.snapped = true;
        poseShown.current = state.pose;
        setCarrierPose(state.pose);
        markSnap();
      }
    }
    const r3 = readRightStickClick();
    const r3Edge = r3 && !r3Was.current;
    r3Was.current = r3;
    const live = !preview.current && !!play && !state.playOver && !replay.current.on;
    if (r3Edge && live) setPaused(!readPaused());
    if (!preview.current && replay.current.on && play && play.replay.frames.length > 0) {
      let rate = replay.current.rate;
      if (keys.current.has("Digit1")) rate = 0.5;
      if (keys.current.has("Digit2")) rate = 1;
      if (keys.current.has("Digit3")) rate = 2;
      replay.current.rate = rate;
      let direction = 0;
      if (keys.current.has("ArrowLeft")) direction -= 1;
      if (keys.current.has("ArrowRight")) direction += 1;
      const frames = play.replay.frames;
      const start = frames[0]!.age;
      const end = frames[frames.length - 1]!.age;
      replay.current.age = Math.min(end, Math.max(start, replay.current.age + direction * rate * Math.min(dt, 0.05)));
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
        const leadId = state.players.find((player) => player.controlled)?.id;
        const lead = frame.players.find((player) => player.id === leadId);
        if (lead) {
          const [x, y, z] = worldFromField(lead.x, lead.yard, 0.9);
          setFollowTarget(x, y, z, lead.facingX, lead.facingYard);
          trailTip = { x: lead.x, yard: lead.yard };
        }
      }
      syncTrailLine(trailLine, trail.current, replay.current.age, trailTip);
      artAge.current = replay.current.age;
      return;
    }
    const raw = basicMove(keys.current, readBasicPad());
    const steered = steerFromCamera(raw.x, raw.yard, camera);
    const input = { ...raw, x: steered.x, yard: steered.yard };
    try {
      if (preview.current || !play) step(state, input, dt);
      else if (!state.playOver && !readPaused() && play.snapped) {
        // Z and X select the blocker. Wings shares this stick. Independent and Classic use U/B/K/O.
        // Classic stiff-arm is Tab and \ (Select and Start on a pad). Triggers do not stiff-arm.
        tickClock(Math.min(dt, 0.05));
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
        const carrier = controlledPlayer(state);
        if (carrier && carrier.yard >= FIELD.length && !state.playOver) {
          state.playOver = true;
          console.log("[playOver] set", {
            reason: "touchdown",
            yard: Number(carrier.yard.toFixed(3)),
            carrier: carrier.id,
          });
        }
        if (state.playOver) queueWhistle(false);
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
      if (body && runnerTouchesSideline(body)) {
        state.playOver = true;
        console.log("[playOver] set", {
          reason: "out of bounds",
          ballX: Number(state.ballX.toFixed(3)),
          ballYard: Number(state.ballYard.toFixed(3)),
          carrier: carrier?.id,
        });
        queueWhistle(true);
      }
    }
    tryMeasureSpot();
    const lead = controlledPlayer(state);
    if (lead) {
      const [x, y, z] = worldFromField(lead.x, lead.yard, 0.9);
      setFollowTarget(x, y, z, lead.facingX, lead.facingYard);
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
    if (carrierNow && !overAtStart && !readPaused() && (preview.current || play?.snapped)) {
      const bounded = Math.min(Math.max(dt, 0), 0.05);
      const age = play ? play.age : (trail.current.clock += bounded);
      if (state.playOver && carrierNow.yard >= FIELD.length) {
        sealRunnerTrail(trail.current, carrierNow.x, carrierNow.yard, age);
      } else if (state.playOver) {
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
  });

  const [losX, losY, losZ] = worldFromField(FIELD.width / 2, sim.current.los, 0.06);
  const firstYard = readFirstDownYard(sim.current.los);
  const [fdX, fdY, fdZ] = worldFromField(FIELD.width / 2, firstYard ?? sim.current.los, 0.06);
  const roster = sim.current.players;
  const armed = !preview.current && assigned.current != null && !assigned.current.snapped;
  // Subscribing is what repaints a stance when it is applied or released.
  void stanceRev;

  return (
    <>
      <primitive object={trailLine} dispose={null} />
      <RespotMarker />
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
        {roster.map((player) => (
          <PlayerMesh
            key={player.id}
            player={player}
            bodies={bodies.current}
            kits={kits}
            pose={player.controlled ? (armed ? sim.current.pose : carrierPose) : stanceOf(player)}
          />
        ))}
      </group>
    </>
  );
}
