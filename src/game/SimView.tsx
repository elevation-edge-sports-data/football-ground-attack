import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useSyncExternalStore } from "react";
import { Vector3, type Camera, type Group } from "three";
import { FIELD } from "../field/spec";
import { setFollowTarget } from "./cameraFollow";
import { worldFromField, yawFromFacing } from "./frame";
import { poseBallSide } from "./carrierPose";
import { basicMove, isMoveCode, readBasicPad } from "./input";
import { PlayerFigure } from "./PlayerFigure";
import { controlledPlayer, createSim, step, type Player, type Sim } from "./sim";
import { PLAYER_NUMBERS, getUniformSelection, kitById, subscribeUniforms } from "./uniforms";

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
  const carried = player.controlled ? pose : undefined;
  return (
    <group
      ref={(node) => {
        if (node) bodies.set(player.id, node);
        else bodies.delete(player.id);
      }}
      position={worldFromField(player.x, player.yard, player.hop)}
      rotation={[0, yawFromFacing(player.facingX, player.facingYard), 0]}
    >
      <PlayerFigure
        kit={kitById(player.team === "off" ? kits.offId : kits.defId)}
        number={PLAYER_NUMBERS[player.id] ?? 0}
        controlled={player.controlled}
        pose={carried}
        ballSide={carried ? poseBallSide(carried) : "r"}
      />
    </group>
  );
}

export function SimView() {
  const camera = useThree((s) => s.camera);
  const sim = useRef<Sim>(createSim());
  const keys = useRef(new Set<string>());
  const bodies = useRef(new Map<string, Group>());
  const poseShown = useRef(sim.current.pose);
  const [carrierPose, setCarrierPose] = useState(sim.current.pose);
  const initial = sim.current;
  const kits = useSyncExternalStore(subscribeUniforms, getUniformSelection);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return;
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
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", clear);
    };
  }, []);

  useFrame((_, dt) => {
    const state = sim.current;
    const raw = basicMove(keys.current, readBasicPad());
    const steered = steerFromCamera(raw.x, raw.yard, camera);
    step(state, { ...raw, x: steered.x, yard: steered.yard }, dt);
    for (const p of state.players) {
      const group = bodies.current.get(p.id);
      if (!group) continue;
      const [x, y, z] = worldFromField(p.x, p.yard, p.hop);
      group.position.set(x, y, z);
      group.rotation.y = yawFromFacing(p.facingX, p.facingYard);
      const ring = group.getObjectByName("player-ring");
      if (ring) ring.position.y = 0.04 - p.hop;
    }
    const lead = controlledPlayer(state);
    if (lead) {
      const [x, y, z] = worldFromField(lead.x, lead.yard, 0.9);
      setFollowTarget(x, y, z);
    }
    if (state.pose !== poseShown.current) {
      poseShown.current = state.pose;
      setCarrierPose(state.pose);
    }
  });

  const [losX, losY, losZ] = worldFromField(FIELD.width / 2, initial.los, 0.06);

  return (
    <group>
      <mesh position={[losX, losY, losZ]}>
        <boxGeometry args={[FIELD.width, 0.035, 0.16]} />
        <meshStandardMaterial color="#3b82f6" />
      </mesh>
      {initial.players.map((player) => (
        <PlayerMesh key={player.id} player={player} bodies={bodies.current} kits={kits} pose={carrierPose} />
      ))}
    </group>
  );
}
