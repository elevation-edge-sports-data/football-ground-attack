import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Canvas } from "@react-three/fiber";
import { FootballField } from "./field/FootballField";
import { OrbitCamera } from "./field/OrbitCamera";
import { FIELD } from "./field/spec";
import { setFollowTarget } from "./game/cameraFollow";
import { worldFromField } from "./game/frame";
import { UniformBanner } from "./game/UniformBanner";
import { SimView } from "./game/SimView";
import { controlledPlayer, createSim } from "./game/sim";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root");
}

const lead = controlledPlayer(createSim());
const leadX = lead?.x ?? FIELD.width / 2;
const leadYard = lead?.yard ?? 25;
/** Controlled player. North is −Z. */
const lookTarget = worldFromField(leadX, leadYard, 0.9);
setFollowTarget(lookTarget[0], lookTarget[1], lookTarget[2]);
/** South of that player, elevated, so the default view looks north. */
const eye = worldFromField(leadX, leadYard - 16, 18);

createRoot(rootElement).render(
  <StrictMode>
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Canvas
        style={{ width: "100%", height: "100%" }}
        camera={{ position: [...eye], fov: 42, near: 0.15, far: 900 }}
        onCreated={({ camera }) => {
          camera.lookAt(lookTarget[0], lookTarget[1], lookTarget[2]);
        }}
      >
        <color attach="background" args={[FIELD.sky]} />
        <hemisphereLight args={["#c5d4e0", "#2f4a28", 0.72]} />
        <directionalLight position={[28, 90, 36]} intensity={1.25} />
        <FootballField />
        <SimView />
        <OrbitCamera />
      </Canvas>
      <UniformBanner />
    </div>
  </StrictMode>,
);
