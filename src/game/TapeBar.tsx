import { useRef, useSyncExternalStore, type CSSProperties } from "react";
import { downloadFormationFrame, downloadReplayFrames } from "./formationDownload";
import {
  beginTape,
  exportTapeFrame,
  exportTapeRange,
  markTapeRange,
  readTapeLocked,
  readTapeOn,
  readTapeReady,
  redoTapeEdit,
  seekTape,
  stopTape,
  subscribeTape,
  subscribeTapeEdit,
  subscribeTapeReady,
  tapeFraction,
  tapeFrameIndex,
  tapeRangeMarkPcts,
  tapeRedoDepth,
  tapeUndoDepth,
  toggleTapeLock,
  undoTapeEdit,
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

const replayPanel: CSSProperties = {
  position: "fixed",
  left: "50%",
  bottom: 54,
  transform: "translateX(-50%)",
  zIndex: 32,
  width: "min(760px, calc(100vw - 520px))",
  padding: "8px 10px",
  borderRadius: 8,
  background: "rgba(12, 18, 28, 0.92)",
  border: "1px solid #fb4f14",
  display: "grid",
  gap: 6,
  boxSizing: "border-box",
  textAlign: "left",
  pointerEvents: "auto",
};

const replayTitle: CSSProperties = {
  margin: 0,
  fontFamily: '"Barlow Condensed", sans-serif',
  fontSize: 15,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "#fb4f14",
};

const replayRow: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
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

function replayButtonStyle(primary: boolean, disabled: boolean): CSSProperties {
  return {
    flex: "1 1 auto",
    minHeight: 36,
    padding: "0 12px",
    borderRadius: 6,
    border: primary ? "1px solid #ffffff" : "1px solid #243040",
    background: primary ? "#ffffff" : "#171e28",
    color: primary ? "#070b12" : "#e8ece6",
    fontFamily: '"Barlow Condensed", sans-serif',
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.4 : 1,
    whiteSpace: "nowrap",
  };
}

function blockSpace(event: { code: string; preventDefault: () => void }) {
  if (event.code === "Space") event.preventDefault();
}

function ReplayButton({
  label,
  primary = false,
  disabled = false,
  pressed = false,
  onClick,
}: {
  label: string;
  primary?: boolean;
  disabled?: boolean;
  pressed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed ? true : undefined}
      disabled={disabled}
      tabIndex={-1}
      onKeyDown={blockSpace}
      onClick={onClick}
      style={replayButtonStyle(primary, disabled)}
    >
      {label}
    </button>
  );
}

/** Full-width scrubber. The frame number sits to the right of the track. */
export function TapeBar() {
  const open = useSyncExternalStore(subscribeTape, readTapeOn);
  const locked = useSyncExternalStore(subscribeTape, readTapeLocked);
  const fraction = useSyncExternalStore(subscribeTape, tapeFraction);
  const frame = useSyncExternalStore(subscribeTape, tapeFrameIndex);
  const marks = useSyncExternalStore(subscribeTape, tapeRangeMarkPcts);
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
          <div style={{ height: "100%", width: `${shown}%`, background: "#FA4616" }} />
          {marks.map((markPct, index) => (
            <span
              key={index}
              aria-hidden="true"
              style={{
                position: "absolute",
                top: 0,
                left: `${markPct * 100}%`,
                width: 2,
                height: "100%",
                background: "#f4f4f4",
                transform: "translateX(-50%)",
                pointerEvents: "none",
              }}
            />
          ))}
        </div>
      </div>
      <span style={frameStyle}>{frame}</span>
    </div>
  );
}

function downloadLockedFrame() {
  const frame = exportTapeFrame();
  if (frame) downloadFormationFrame(frame);
}

function downloadMarkedRange() {
  const frames = exportTapeRange();
  if (frames?.length) downloadReplayFrames(frames);
}

/** Lower-middle replay actions. Mounted outside the scoreboard so it sits above the scrubber. */
export function ReplayActionPanel() {
  const open = useSyncExternalStore(subscribeTape, readTapeOn);
  const locked = useSyncExternalStore(subscribeTapeEdit, readTapeLocked);
  const undo = useSyncExternalStore(subscribeTapeEdit, tapeUndoDepth);
  const redo = useSyncExternalStore(subscribeTapeEdit, tapeRedoDepth);
  const marks = useSyncExternalStore(subscribeTape, tapeRangeMarkPcts);
  if (!open) return null;
  return (
    <div style={replayPanel} role="region" aria-label="Replay">
      <p style={replayTitle}>Replay</p>
      <div style={replayRow}>
        <ReplayButton
          label={locked ? "Revert" : "Edit formation"}
          primary={locked}
          pressed={locked}
          onClick={toggleTapeLock}
        />
        <ReplayButton label="Mark" onClick={markTapeRange} />
        <ReplayButton label="Download replay" disabled={marks.length < 2} onClick={downloadMarkedRange} />
        <ReplayButton label="Download formation" disabled={!locked} onClick={downloadLockedFrame} />
        {locked ? (
          <>
            <ReplayButton label="Undo" disabled={undo === 0} onClick={undoTapeEdit} />
            <ReplayButton label="Redo" disabled={redo === 0} onClick={redoTapeEdit} />
          </>
        ) : null}
        <ReplayButton label="Exit" primary onClick={stopTape} />
      </div>
    </div>
  );
}

/** Pause-card replay entry. The action panel is separate, above the scrubber. */
export function PauseTapeControls() {
  const open = useSyncExternalStore(subscribeTape, readTapeOn);
  const ready = useSyncExternalStore(subscribeTapeReady, readTapeReady);
  if (open) return null;
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
