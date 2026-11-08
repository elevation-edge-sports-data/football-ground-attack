import { StrictMode, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { Canvas } from "@react-three/fiber";
import { NeutralToneMapping } from "three";
import { FootballField } from "./field/FootballField";
import { CameraRig } from "./field/OrbitCamera";
import { FIELD } from "./field/spec";
import { setFollowTarget } from "./game/cameraFollow";
import { worldFromField } from "./game/frame";
import { PoseEditor } from "./game/PoseEditor";
import { ModeToggle } from "./game/ModeToggle";
import { PersonnelHud } from "./game/PersonnelHud";
import { PracticeBooks } from "./game/PracticeBooks";
import { UniformBanner } from "./game/UniformBanner";
import { CameraMenu } from "./game/CameraMenu";
import { SimView } from "./game/SimView";
import { askNextPlay, askReplay, askRestart, bootCamera, formatClock, previewRequested, readBoard, subscribeBoard } from "./game/sim/boot";
import { replaySnapFollow } from "./game/replayCamera";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root");
}

const opening = bootCamera();
const leadX = opening.x;
const leadYard = opening.yard;
/** Controlled player. North is −Z. */
const lookTarget = worldFromField(leadX, leadYard, 0.9);
setFollowTarget(lookTarget[0], lookTarget[1], lookTarget[2]);
/** South of that player, elevated, so the default view looks north. */
const eye = worldFromField(leadX, leadYard - 16, 18);

function poseEditorRequested(): boolean {
  // docs/pose-editor.html sets this so the static page opens the editor with no query string.
  if (document.documentElement.hasAttribute("data-pose-editor")) return true;
  return new URLSearchParams(window.location.search).has("pose-editor");
}

function App() {
  const board = useSyncExternalStore(subscribeBoard, readBoard);
  if (poseEditorRequested()) return <PoseEditor />;
  const practice = board.mode === "practice";
  const canContinue = practice || (board.clock > 0 && !board.seriesOver);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Canvas
        style={{ width: "100%", height: "100%" }}
        camera={{ position: [...eye], fov: 42, near: 0.15, far: 900 }}
        gl={{ toneMapping: NeutralToneMapping, toneMappingExposure: 1 }}
        onCreated={({ camera }) => {
          camera.lookAt(lookTarget[0], lookTarget[1], lookTarget[2]);
        }}
      >
        <color attach="background" args={[FIELD.sky]} />
        {/* Diffuse is divided by PI, so this fill keeps kit hexes near their stored brightness. */}
        <ambientLight intensity={2.6} />
        <hemisphereLight args={["#c5d4e0", "#2f4a28", 0.72]} />
        <directionalLight position={[28, 90, 36]} intensity={1.25} />
        <FootballField />
        <SimView />
        <CameraRig />
      </Canvas>
      <UniformBanner />
      {!previewRequested() ? <PersonnelHud /> : null}
      {!previewRequested() ? <PracticeBooks /> : null}
      {!previewRequested() ? <ModeToggle mode={board.mode} /> : null}
      {!previewRequested() ? (
        <div
          style={{
            position: "absolute",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "8px 18px",
            background: "rgba(12, 18, 28, 0.88)",
            color: "#f4f7fb",
            fontFamily: '"Barlow Condensed", sans-serif',
            fontSize: 22,
            letterSpacing: "0.04em",
            textAlign: "center",
            pointerEvents: board.over ? "auto" : "none",
          }}
        >
          <div>
            {practice
              ? `OFF · Score ${board.score}`
              : `${board.downText} · ${formatClock(board.clock)} · Score ${board.score}`}
          </div>
          {!practice && board.over && board.clock <= 0 ? <div style={{ fontSize: 28, marginTop: 4 }}>Time expired</div> : null}
          {board.paused && !board.over ? (
            <>
              <div style={{ fontSize: 28, marginTop: 4 }}>Paused</div>
              <div style={{ fontSize: 14, opacity: 0.75 }}>Esc or right-stick click resumes</div>
              <CameraMenu />
              <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4, pointerEvents: "none" }}>
                Freestyle: drag · scroll zoom · right-drag pan · [ ] yaw · PgUp/PgDn zoom. Wings right stick looks. Paused sticks orbit.
              </div>
            </>
          ) : null}
          <div style={{ fontSize: 16, opacity: 0.8 }}>
            {board.playName} vs {board.schemeName} · {board.profile === "classic" ? "Classic" : board.profile === "independent" ? "Independent" : "Wings"}
          </div>
          {!board.over && board.awaitSnap ? (
            <div style={{ fontSize: 16, opacity: 0.85 }}>Enter or A to snap</div>
          ) : null}
          {!board.over && board.profile !== "wings" ? (
            <div style={{ fontSize: 14, opacity: 0.75 }}>
              {board.profile === "classic" ? "Blocker: U B K O · Stiff: Tab \\" : "Blocker: U B K O"}
            </div>
          ) : null}
          {board.over ? (
            <>
              <div style={{ fontSize: 28, marginTop: 4 }}>{board.title}</div>
              <div style={{ fontSize: 16 }}>{board.detail}</div>
              {board.replay ? (
                <button
                  type="button"
                  onClick={replaySnapFollow}
                  style={{
                    marginTop: 8,
                    marginRight: 8,
                    fontFamily: "inherit",
                    fontSize: 18,
                    letterSpacing: "0.06em",
                    background: "#e5e7eb",
                    color: "#111827",
                    border: 0,
                    padding: "6px 14px",
                    cursor: "pointer",
                  }}
                >
                  Follow
                </button>
              ) : null}
              <button
                type="button"
                onClick={askReplay}
                style={{
                  marginTop: 8,
                  marginRight: 8,
                  fontFamily: "inherit",
                  fontSize: 18,
                  letterSpacing: "0.06em",
                  background: board.replay ? "#1f2937" : "#e5e7eb",
                  color: board.replay ? "#f4f7fb" : "#111827",
                  border: 0,
                  padding: "6px 14px",
                  cursor: "pointer",
                }}
              >
                {board.replay ? "Exit replay" : "Replay"}
              </button>
              {canContinue ? (
              <button
                type="button"
                onClick={askNextPlay}
                style={{
                  marginTop: 8,
                  fontFamily: "inherit",
                  fontSize: 18,
                  letterSpacing: "0.06em",
                  background: "#3b82f6",
                  color: "#fff",
                  border: 0,
                  padding: "6px 14px",
                  cursor: "pointer",
                }}
              >
                Next play
              </button>
              ) : (
              <button
                type="button"
                onClick={askRestart}
                style={{
                  marginTop: 8,
                  fontFamily: "inherit",
                  fontSize: 18,
                  letterSpacing: "0.06em",
                  background: "#3b82f6",
                  color: "#fff",
                  border: 0,
                  padding: "6px 14px",
                  cursor: "pointer",
                }}
              >
                New game
              </button>
              )}
              <div style={{ fontSize: 14, opacity: 0.75, marginTop: 4 }}>
                {!canContinue
                  ? board.replay
                    ? "A new game · Left/Right scrub · 1 2 3 speed · Q/E orbit · PgUp/PgDn zoom · 0 toggles follow · R exits"
                    : "A new game · R replay"
                  : board.replay
                    ? "Left/Right scrub · 1 2 3 speed · Q/E orbit · PgUp/PgDn zoom · 0 toggles follow · R exits"
                    : "A, Enter, or N · R replay"}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
