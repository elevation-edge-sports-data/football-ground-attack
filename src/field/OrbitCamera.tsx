import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { followTarget } from "../game/cameraFollow";

/** Orbit and zoom around the followed player. The player stays at the center. */
export function OrbitCamera() {
  const { camera, gl } = useThree();
  const controls = useRef<OrbitControls | null>(null);

  useEffect(() => {
    const orbit = new OrbitControls(camera, gl.domElement);
    orbit.target.set(followTarget.x, followTarget.y, followTarget.z);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    orbit.enablePan = false;
    orbit.minDistance = 2;
    orbit.maxDistance = 260;
    orbit.minPolarAngle = 0.12;
    orbit.maxPolarAngle = Math.PI / 2 - 0.04;
    orbit.update();
    controls.current = orbit;
    return () => {
      orbit.dispose();
      controls.current = null;
    };
  }, [camera, gl]);

  useFrame(() => {
    const orbit = controls.current;
    if (!orbit) return;
    const dx = followTarget.x - orbit.target.x;
    const dy = followTarget.y - orbit.target.y;
    const dz = followTarget.z - orbit.target.z;
    if (dx !== 0 || dy !== 0 || dz !== 0) {
      orbit.target.set(followTarget.x, followTarget.y, followTarget.z);
      camera.position.x += dx;
      camera.position.y += dy;
      camera.position.z += dz;
    }
    orbit.update();
  });

  return null;
}
