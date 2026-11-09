import { useSyncExternalStore, type CSSProperties } from "react";
import { POSES, poseCarriesBall } from "./PoseEditor";
import {
  cycleTapeSelect,
  endTapeNudge,
  readTapeLocked,
  readTapeSelected,
  redoTapeEdit,
  selectTapeBody,
  setTapeBodyPose,
  subscribeTapeEdit,
  tapeBodyPose,
  tapeEditRev,
  tapeFrameIndex,
  tapeRedoDepth,
  tapeUndoDepth,
  turnTapeSelection,
  undoTapeEdit,
} from "./tapeReplay";

const panel: CSSProperties = {
  position: "fixed",
  top: 168,
  left: 12,
  bottom: 72,
  zIndex: 28,
  width: 220,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 10,
  boxSizing: "border-box",
  background: "rgba(12, 18, 28, 0.94)",
  border: "1px solid #fb4f14",
  borderRadius: 8,
  color: "#f4f7fb",
  fontFamily: '"Barlow Condensed", sans-serif',
  pointerEvents: "auto",
};

const row: CSSProperties = {
  display: "flex",
  gap: 6,
};

function buttonStyle(on: boolean, disabled = false): CSSProperties {
  return {
    flex: 1,
    minHeight: 28,
    padding: "0 8px",
    borderRadius: 6,
    border: on ? "1px solid #fb4f14" : "1px solid transparent",
    background: on ? "rgba(251, 79, 20, 0.22)" : "rgba(255, 255, 255, 0.04)",
    color: disabled ? "#6b7280" : on ? "#fb4f14" : "#f4f7fb",
    fontFamily: "inherit",
    fontSize: 15,
    fontWeight: 600,
    letterSpacing: "0.03em",
    cursor: disabled ? "default" : "pointer",
  };
}

/**
 * Locked-frame formation editor. Unlock reverts the frame, the same as hockey's Revert.
 * Scrubbing stays off while this panel is up.
 */
export function FormationEdit() {
  const rev = useSyncExternalStore(subscribeTapeEdit, tapeEditRev);
  const locked = useSyncExternalStore(subscribeTapeEdit, readTapeLocked);
  if (!locked) return null;
  void rev;
  const selected = readTapeSelected();
  const pose = selected ? tapeBodyPose(selected) : null;
  const undo = tapeUndoDepth();
  const redo = tapeRedoDepth();
  return (
    <aside style={panel} aria-label="Formation editor">
      <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "0.04em" }}>Editing frame {tapeFrameIndex()}</div>
      <div style={{ fontSize: 14, opacity: 0.8 }}>
        {selected ? `Selected ${selected}` : "Click a player"}
        {pose ? ` · ${poseCarriesBall(pose) ? "ball" : "no ball"}` : ""}
      </div>
      <div style={row}>
        <button type="button" onClick={() => cycleTapeSelect(-1)} style={buttonStyle(false)}>
          Prev
        </button>
        <button type="button" onClick={() => cycleTapeSelect(1)} style={buttonStyle(false)}>
          Next
        </button>
      </div>
      <div style={row}>
        <button
          type="button"
          onClick={() => {
            turnTapeSelection(-Math.PI / 8);
            endTapeNudge();
          }}
          style={buttonStyle(false)}
        >
          Turn left
        </button>
        <button
          type="button"
          onClick={() => {
            turnTapeSelection(Math.PI / 8);
            endTapeNudge();
          }}
          style={buttonStyle(false)}
        >
          Turn right
        </button>
      </div>
      <div style={row}>
        <button type="button" disabled={undo === 0} onClick={undoTapeEdit} style={buttonStyle(false, undo === 0)}>
          Undo
        </button>
        <button type="button" disabled={redo === 0} onClick={redoTapeEdit} style={buttonStyle(false, redo === 0)}>
          Redo
        </button>
      </div>
      <div style={{ fontSize: 13, opacity: 0.75 }}>Arrows or stick move · , and . turn · Ctrl+Z undoes · Unlock reverts</div>
      <div style={{ overflow: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
        {POSES.map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={pose === name}
            onClick={() => {
              if (selected) selectTapeBody(selected);
              setTapeBodyPose(name);
            }}
            style={{ ...buttonStyle(pose === name), flex: "none", textAlign: "left" }}
          >
            {name}
          </button>
        ))}
      </div>
    </aside>
  );
}
