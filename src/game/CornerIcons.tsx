import { useSyncExternalStore, type CSSProperties } from "react";
import { readCameraCenter, subscribeCameraCenter, toggleCameraCenter } from "./cameraCenter";
import { askReset, readBoard, readPaused, setPaused, subscribeBoard } from "./sim/boot";
import { readTapeOn, subscribeTape } from "./tapeReplay";
import { getUniformSelection, kitById, subscribeUniforms } from "./uniforms";

const row: CSSProperties = {
  position: "fixed",
  right: 12,
  zIndex: 31,
  display: "flex",
  gap: 6,
  pointerEvents: "auto",
  userSelect: "none",
};

function buttonStyle(on: boolean, disabled: boolean, accent: string): CSSProperties {
  return {
    width: 44,
    height: 44,
    minHeight: 44,
    padding: 0,
    display: "grid",
    placeItems: "center",
    flex: "0 0 auto",
    borderRadius: 6,
    border: "1px solid",
    borderColor: on ? accent : "#243040",
    background: "#171e28",
    color: on ? accent : "#e8ece6",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.4 : 1,
  };
}

function holdFocus(event: { preventDefault: () => void }) {
  event.preventDefault();
}

function CrosshairIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" style={{ display: "block" }}>
      <circle cx="12" cy="12" r="5.4" fill="none" stroke="currentColor" strokeWidth="2.1" />
      <circle cx="12" cy="12" r="1.25" fill="currentColor" />
      <path
        d="M12 1.4v6.1M12 16.5v6.1M1.4 12h6.1M16.5 12h6.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlayPauseIcon({ paused }: { paused: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" style={{ display: "block", fill: "currentColor" }}>
      {paused ? (
        <polygon points="7 4 19 12 7 20" />
      ) : (
        <>
          <rect x="6" y="4" width="3.4" height="16" />
          <rect x="14.6" y="4" width="3.4" height="16" />
        </>
      )}
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" style={{ display: "block", fill: "currentColor" }}>
      <path d="M12 5V2L7 7l5 5V8.5A5.5 5.5 0 1 1 6.5 14H4.4A7.6 7.6 0 1 0 12 5z" />
    </svg>
  );
}

/**
 * Lower-right icon row. Right to left: Reset, Play/Pause, then the defense
 * camera crosshair. The crosshair is hidden while the user is on offense.
 * Replay transport already owns the corner, so this row sits just above it.
 */
export function CornerIcons() {
  const board = useSyncExternalStore(subscribeBoard, readBoard);
  const tape = useSyncExternalStore(subscribeTape, readTapeOn);
  const center = useSyncExternalStore(subscribeCameraCenter, readCameraCenter);
  const accent = kitById(useSyncExternalStore(subscribeUniforms, getUniformSelection).offId).endPrimary;
  const lifted = tape || board.replay;
  const onDefense = board.side === "def";
  const onUser = center === "user";
  const pauseBlocked = board.replay || tape;
  const togglePause = () => {
    if (pauseBlocked) return;
    setPaused(!readPaused());
  };
  return (
    <div role="group" aria-label="Playback" style={{ ...row, bottom: lifted ? 106 : 16 }}>
      {onDefense ? (
        <button
          type="button"
          aria-label="Center camera"
          aria-pressed={onUser}
          title={onUser ? "Centered on you" : "Centered on the ball carrier"}
          tabIndex={-1}
          style={buttonStyle(onUser, false, accent)}
          onMouseDown={holdFocus}
          onClick={toggleCameraCenter}
        >
          <CrosshairIcon />
        </button>
      ) : null}
      <button
        type="button"
        aria-label={board.paused ? "Play" : "Pause"}
        aria-pressed={board.paused}
        disabled={pauseBlocked}
        tabIndex={-1}
        style={buttonStyle(false, pauseBlocked, accent)}
        onMouseDown={holdFocus}
        onClick={togglePause}
      >
        <PlayPauseIcon paused={board.paused} />
      </button>
      <button
        type="button"
        aria-label="Reset"
        title="Reset"
        tabIndex={-1}
        style={buttonStyle(false, false, accent)}
        onMouseDown={holdFocus}
        onClick={askReset}
      >
        <ResetIcon />
      </button>
    </div>
  );
}
