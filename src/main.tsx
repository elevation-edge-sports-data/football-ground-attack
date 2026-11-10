import { StrictMode, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { Canvas } from "@react-three/fiber";
import { NeutralToneMapping } from "three";
import { FootballField } from "./field/FootballField";
import { CameraRig } from "./field/OrbitCamera";
import { FIELD } from "./field/spec";
import { setFollowTarget } from "./game/cameraFollow";
import { worldFromField } from "./game/frame";
import { FormationLibraryView } from "./game/FormationLibraryView";
import { ReplayViewerView } from "./game/ReplayViewerView";
import { PoseEditor } from "./game/PoseEditor";
import { PersonnelHud } from "./game/PersonnelHud";
import { PracticeBooks } from "./game/PracticeBooks";
import { TeamScore, UniformBanner } from "./game/UniformBanner";
import { BottomMenus } from "./game/BottomMenus";
import { FormationEdit } from "./game/FormationEdit";
import { ReplayScrubBar } from "./game/ReplayScrubBar";
import { ReplayTransport } from "./game/ReplayTransport";
import { PauseTapeControls, TapeBar } from "./game/TapeBar";
import { SimView } from "./game/SimView";
import { askRestart, bootCamera, formatBallOn, formatClock, formatTenths, previewRequested, readBoard, subscribeBoard } from "./game/sim/boot";
import { replaySnapFollow } from "./game/replayCamera";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root");
}

function BallOnReadout({ yard, home, tail }: { yard: number; home: boolean; tail: string }) {
  const arm = "5px solid transparent";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span>BALL ON</span>
      <span
        role="img"
        aria-label={home ? "Home possession" : "Away possession"}
        style={{
          width: 0,
          height: 0,
          borderLeft: arm,
          borderRight: arm,
          ...(home
            ? { borderBottom: "8px solid currentColor" }
            : { borderTop: "8px solid currentColor" }),
        }}
      />
      <span>{tail ? `${formatBallOn(yard)}· ${tail}` : formatBallOn(yard)}</span>
    </span>
  );
}

const opening = bootCamera();
const leadX = opening.x;
const leadYard = opening.yard;
/** Controlled player. North is −Z. */
const lookTarget = worldFromField(leadX, leadYard, 0.9);
setFollowTarget(lookTarget[0], lookTarget[1], lookTarget[2]);
/** South of that player, elevated, so the default view looks north. */
const eye = worldFromField(leadX, leadYard - 16, 18);

function replayViewerRequested(): boolean {
  // docs/replay-viewer.html sets this so the static page opens the viewer with no query string.
  if (document.documentElement.hasAttribute("data-replay-viewer")) return true;
  return new URLSearchParams(window.location.search).has("replay-viewer");
}

function formationLibraryRequested(): boolean {
  // docs/formation-library.html sets this so the static page opens the library with no query string.
  if (document.documentElement.hasAttribute("data-formation-library")) return true;
  return new URLSearchParams(window.location.search).has("formation-library");
}

function poseEditorRequested(): boolean {
  // docs/pose-editor.html sets this so the static page opens the editor with no query string.
  if (document.documentElement.hasAttribute("data-pose-editor")) return true;
  return new URLSearchParams(window.location.search).has("pose-editor");
}

function App() {
  const board = useSyncExternalStore(subscribeBoard, readBoard);
  if (replayViewerRequested()) return <ReplayViewerView />;
  if (formationLibraryRequested()) return <FormationLibraryView />;
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
            // The whole panel takes the pointer, same as the uniform banner and
            // the personnel buttons. Wheel here is page zoom, not the scene.
            pointerEvents: "auto",
          }}
        >
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
            {practice ? null : <span>{board.downText}</span>}
            <BallOnReadout
              yard={board.ballOn}
              home={board.homePossession}
              tail={practice ? "" : formatClock(board.clock)}
            />
          </div>
          <TeamScore />
          <div style={{ display: "flex", alignItems: "flex-start", gap: 22, marginTop: 8 }}>
            <div aria-label="Game stats" style={{ textAlign: "left", fontSize: 15, letterSpacing: "0.06em", lineHeight: 1.35, flex: "0 0 auto", whiteSpace: "nowrap" }}>
              <div>{`TOTAL YARDS ${formatTenths(board.totalYards)}`}</div>
              <div>{`FIRST DOWNS ${board.firstDowns}`}</div>
              <div>{`TOUCHDOWNS ${board.touchdowns}`}</div>
              <div>{`YAC ${formatTenths(board.yac)}`}</div>
            </div>
            <div style={{ textAlign: "center", flex: "1 1 auto" }}>
          {!practice && board.over && !board.paused && board.clock <= 0 ? <div style={{ fontSize: 28, marginTop: 4 }}>Time expired</div> : null}
          {board.paused ? (
            <>
              <div style={{ fontSize: 28, marginTop: 4 }}>Paused</div>
              <PauseTapeControls />
            </>
          ) : null}
          <div style={{ fontSize: 16, opacity: 0.8 }}>
            {board.playName} vs {board.schemeName}
          </div>
          {!board.over && board.side !== "def" && board.profile !== "wings" ? (
            <div style={{ fontSize: 14, opacity: 0.75 }}>
              {board.profile === "classic" ? "Blocker: U B K O · Stiff: Tab \\" : "Blocker: U B K O"}
            </div>
          ) : null}
          {board.over && !board.paused ? (
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
              {!canContinue ? (
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
              ) : null}
              {board.replay ? (
              <div style={{ fontSize: 14, opacity: 0.75, marginTop: 4 }}>
                {!canContinue ? "A new game · " : ""}
                A play · LB/LT rewind · RB/RT forward · X/B zoom · Y next · RS orbit · arrows or left stick move the X · R or right-stick click exits
              </div>
              ) : null}
            </>
          ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {!previewRequested() ? <FormationEdit /> : null}
      {!previewRequested() ? <TapeBar /> : null}
      {!previewRequested() ? <ReplayScrubBar /> : null}
      {!previewRequested() ? <ReplayTransport /> : null}
      {!previewRequested() ? <BottomMenus /> : null}
    </div>
  );
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
