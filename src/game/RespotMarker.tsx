import { useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useSyncExternalStore } from "react";
import { Plane, Raycaster, Vector2, Vector3 } from "three";
import { worldFromField } from "./frame";
import { movePracticeAim, practiceSpotAiming, readPractice, subscribePractice } from "./sim/boot";

const _ray = new Raycaster();
const _ndc = new Vector2();
const _plane = new Plane(new Vector3(0, 1, 0), 0);
const _hit = new Vector3();

/**
 * Practice re-spot X. Drag anywhere on the ground to move it.
 * The spot is clamped between the hashes and just outside each goal line.
 */
export function RespotMarker() {
  const { camera, gl } = useThree();
  const ui = useSyncExternalStore(subscribePractice, readPractice);

  useEffect(() => {
    const el = gl.domElement;
    let dragging = false;
    const place = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      _ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      _ray.setFromCamera(_ndc, camera);
      if (!_ray.ray.intersectPlane(_plane, _hit)) return;
      // World X is field X. World Z is −yard.
      movePracticeAim(_hit.x, -_hit.z);
    };
    const down = (event: PointerEvent) => {
      if (!practiceSpotAiming() || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      dragging = true;
      place(event);
    };
    const move = (event: PointerEvent) => {
      if (!dragging) return;
      place(event);
    };
    const up = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      place(event);
    };
    el.addEventListener("pointerdown", down, true);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [camera, gl]);

  useFrame(() => {
    gl.domElement.style.cursor = ui.mode === "practice" && ui.aiming ? "crosshair" : "";
  });

  if (ui.mode !== "practice" || !ui.aiming) return null;
  const [x, y, z] = worldFromField(ui.aimX, ui.aimYard, 0.08);
  return (
    <group position={[x, y, z]}>
      <mesh rotation={[0, Math.PI / 4, 0]} position={[0, -0.01, 0]} raycast={() => null}>
        <boxGeometry args={[1.9, 0.02, 0.28]} />
        <meshBasicMaterial color="#4a1608" toneMapped={false} />
      </mesh>
      <mesh rotation={[0, -Math.PI / 4, 0]} position={[0, -0.01, 0]} raycast={() => null}>
        <boxGeometry args={[1.9, 0.02, 0.28]} />
        <meshBasicMaterial color="#4a1608" toneMapped={false} />
      </mesh>
      <mesh rotation={[0, Math.PI / 4, 0]} raycast={() => null}>
        <boxGeometry args={[1.75, 0.035, 0.16]} />
        <meshBasicMaterial color="#fb4f14" toneMapped={false} />
      </mesh>
      <mesh rotation={[0, -Math.PI / 4, 0]} raycast={() => null}>
        <boxGeometry args={[1.75, 0.035, 0.16]} />
        <meshBasicMaterial color="#fb4f14" toneMapped={false} />
      </mesh>
    </group>
  );
}
