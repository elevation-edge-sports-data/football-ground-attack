import { useRef, useSyncExternalStore, type CSSProperties } from "react";
import {
  beginTape,
  readTapeLocked,
  readTapeOn,
  readTapePlaying,
  readTapeReady,
  seekTape,
  stopTape,
  subscribeTape,
  subscribeTapeReady,
  tapeFraction,
  tapeFrameIndex,
  toggleTapeLock,
} from "./tapeReplay";

const bar: CSSProperties = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 30,
  display: "flex",
  alignItems: "center",
  gap: 8,
  boxSizing: "border-box",
  width: "100%",
  padding: "10px 12px 12px",
  background: "rgba(7, 7, 7, 0.92)",
  pointerEvents: "auto",
};

const trackStyle: CSSProperties = {
  flex: 1,
  height: 18,
  padding: 2,
  background: "#070707",
  border: "2px solid #f4f4f4",
  boxShadow: "inset 0 0 0 2px #000, 0 1px 0 #000",
  cursor: "pointer",
  touchAction: "none",
};

const frameStyle: CSSProperties = {
  minWidth: "4.5em",
  fontFamily: '"Barlow Condensed", sans-serif',
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textAlign: "right",
  color: "#f4f7fb",
};

function buttonStyle(on: boolean): CSSProperties {
  return {
    minHeight: 32,
    padding: "0 12px",
    borderRadius: 6,
    border: on ? "1px solid #fb4f14" : "1px solid transparent",
    background: on ? "rgba(251, 79, 20, 0.22)" : "rgba(12, 18, 28, 0.55)",
    color: on ? "#fb4f14" : "#f4f7fb",
    fontFamily: '"Barlow Condensed", sans-serif',
    fontSize: 16,
    fontWeight: 600,
    letterSpacing: "0.04em",
    cursor: "pointer",
  };
}

/** Full-width scrubber. The frame number sits to the right of the track. */
export function TapeBar() {
  const open = useSyncExternalStore(subscribeTape, readTapeOn);
  const locked = useSyncExternalStore(subscribeTape, readTapeLocked);
  const fraction = useSyncExternalStore(subscribeTape, tapeFraction);
  const frame = useSyncExternalStore(subscribeTape, tapeFrameIndex);
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef(false);
  if (!open) return null;
  const shown = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  const seekAt = (clientX: number) => {
    const el = track.current;
    if (!el || locked) return;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const padL = Number.parseFloat(style.paddingLeft) || 0;
    const padR = Number.parseFloat(style.paddingRight) || 0;
    const borderL = Number.parseFloat(style.borderLeftWidth) || 0;
    const width = Math.max(1, el.clientWidth - padL - padR);
    const x = clientX - (rect.left + borderL + padL);
    seekTape(x / width);
  };
  return (
    <div
      style={bar}
      role="slider"
      aria-label="Replay position"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={shown}
      aria-valuetext={`frame ${frame}`}
      aria-disabled={locked}
    >
      <button type="button" aria-pressed={locked} onClick={toggleTapeLock} style={buttonStyle(locked)}>
        {locked ? "Revert" : "Lock"}
      </button>
      <div
        ref={track}
        style={{ ...trackStyle, pointerEvents: locked ? "none" : "auto", cursor: locked ? "default" : "pointer" }}
        onPointerDown={(event) => {
          if (locked || event.button !== 0) return;
          drag.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          seekAt(event.clientX);
        }}
        onPointerMove={(event) => {
          if (!drag.current || locked) return;
          seekAt(event.clientX);
        }}
        onPointerUp={() => {
          drag.current = false;
        }}
        onPointerCancel={() => {
          drag.current = false;
        }}
      >
        <div style={{ position: "relative", height: "100%", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${shown}%`, background: "#5a1021" }} />
        </div>
      </div>
      <span style={frameStyle}>{frame}</span>
    </div>
  );
}

/** Pause-menu replay entry, and the exit control once the tape is open. */
export function PauseTapeControls() {
  const open = useSyncExternalStore(subscribeTape, readTapeOn);
  const ready = useSyncExternalStore(subscribeTapeReady, readTapeReady);
  const playing = useSyncExternalStore(subscribeTape, readTapePlaying);
  if (open) {
    return (
      <>
        <div style={{ fontSize: 14, opacity: 0.75 }}>
          {playing ? "Playing" : "Paused"} · R, Select, Esc, or right-stick click returns here
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 8, pointerEvents: "auto" }}>
          <button type="button" onClick={stopTape} style={buttonStyle(false)}>
            Exit
          </button>
        </div>
        <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4, pointerEvents: "none" }}>
          A/Space play · X/B zoom · WASD pan · right stick orbits · arrows or left stick move the X · Y next player or the ball · LB/RB slow · G/Shift or LT/RT fast · Lock freezes the frame
        </div>
      </>
    );
  }
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 8, pointerEvents: "auto" }}>
      <button
        type="button"
        disabled={!ready}
        title={ready ? "Last 30 seconds" : "Play for a moment first"}
        onClick={() => beginTape()}
        style={{ ...buttonStyle(false), opacity: ready ? 1 : 0.45, cursor: ready ? "pointer" : "default" }}
      >
        Replay
      </button>
    </div>
  );
}
