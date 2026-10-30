import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useSyncExternalStore } from "react";
import type { Group } from "three";
import { FIELD } from "../field/spec";
import { setFollowTarget } from "./cameraFollow";
import { worldFromField, yawFromFacing } from "./frame";
import { basicMove, isMoveCode, readBasicPad } from "./input";
import { PlayerFigure } from "./PlayerFigure";
import { controlledPlayer, createSim, step, type Player, type Sim } from "./sim";
import { PLAYER_NUMBERS, getUniformSelection, kitById, subscribeUniforms } from "./uniforms";

function PlayerMesh({
  player,
  bodies,
  kits,
}: {
  player: Player;
  bodies: Map<string, Group>;
  kits: { offId: number; defId: number };
}) {
  return (
    <group
      ref={(node) => {
        if (node) bodies.set(player.id, node);
        else bodies.delete(player.id);
      }}
      position={worldFromField(player.x, player.yard)}
      rotation={[0, yawFromFacing(player.facingX, player.facingYard), 0]}
    >
      <PlayerFigure
        kit={kitById(player.team === "off" ? kits.offId : kits.defId)}
        number={PLAYER_NUMBERS[player.id] ?? 0}
        controlled={player.controlled}
      />
    </group>
  );
}

export function SimView() {
  const sim = useRef<Sim>(createSim());
  const keys = useRef(new Set<string>());
  const bodies = useRef(new Map<string, Group>());
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
    step(state, basicMove(keys.current, readBasicPad()), dt);
    for (const p of state.players) {
      const group = bodies.current.get(p.id);
      if (!group) continue;
      const [x, y, z] = worldFromField(p.x, p.yard);
      group.position.set(x, y, z);
      group.rotation.y = yawFromFacing(p.facingX, p.facingYard);
    }
    const lead = controlledPlayer(state);
    if (lead) {
      const [x, y, z] = worldFromField(lead.x, lead.yard, 0.9);
      setFollowTarget(x, y, z);
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
        <PlayerMesh key={player.id} player={player} bodies={bodies.current} kits={kits} />
      ))}
    </group>
  );
}
