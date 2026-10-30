import { StrictMode, useEffect, useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { Canvas } from "@react-three/fiber";
import { FootballField } from "./field/FootballField";
import { OrbitCamera } from "./field/OrbitCamera";
import { FIELD } from "./field/spec";
import { setFollowTarget } from "./game/cameraFollow";
import { worldFromField } from "./game/frame";
import { PoseEditor } from "./game/PoseEditor";
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

function poseEditorRequested(): boolean {
  return new URLSearchParams(window.location.search).has("pose-editor");
}

function openPoseEditor() {
  const url = new URL(window.location.href);
  url.searchParams.set("pose-editor", "1");
  history.pushState(null, "", url);
}

const poseEditorButton: CSSProperties = {
  position: "absolute",
  left: 12,
  bottom: 12,
  zIndex: 3,
  background: "rgba(22, 28, 24, 0.94)",
  color: "#e8ece6",
  border: "1px solid #2a352c",
  borderRadius: 8,
  padding: "8px 12px",
  cursor: "pointer",
  fontFamily: '"Barlow Condensed", sans-serif',
  fontSize: 16,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

function App() {
  const [editor, setEditor] = useState(poseEditorRequested);
  useEffect(() => {
    const onPop = () => setEditor(poseEditorRequested());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  if (editor) return <PoseEditor />;

  return (
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
      <button
        type="button"
        style={poseEditorButton}
        onClick={() => {
          openPoseEditor();
          setEditor(true);
        }}
      >
        Pose editor
      </button>
    </div>
  );
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
