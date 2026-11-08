import { useSyncExternalStore, type CSSProperties } from "react";
import { CAM_MODES, readCamMode, setCamMode, subscribeCamMode, type CamMode } from "./cameraMode";

const row: CSSProperties = {
  display: "flex",
  justifyContent: "center",
  flexWrap: "wrap",
  gap: 6,
  marginTop: 8,
  pointerEvents: "auto",
};

function buttonStyle(on: boolean): CSSProperties {
  return {
    minHeight: 32,
    padding: "0 12px",
    borderRadius: 6,
    border: on ? "1px solid #fb4f14" : "1px solid transparent",
    boxShadow: on ? "0 0 0 1px #fb4f14" : undefined,
    background: on ? "rgba(251, 79, 20, 0.22)" : "rgba(12, 18, 28, 0.55)",
    color: on ? "#fb4f14" : "#c5cec4",
    fontFamily: '"Barlow Condensed", sans-serif',
    fontSize: 16,
    fontWeight: 600,
    letterSpacing: "0.04em",
    cursor: "pointer",
  };
}

function ModeButton({ id, label, blurb, current }: { id: CamMode; label: string; blurb: string; current: CamMode }) {
  const on = current === id;
  return (
    <button
      type="button"
      title={blurb}
      aria-pressed={on}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => setCamMode(id)}
      style={buttonStyle(on)}
    >
      {label}
    </button>
  );
}

/** Pause-menu camera picker. The five names match the hockey camera menu. */
export function CameraMenu() {
  const mode = useSyncExternalStore(subscribeCamMode, readCamMode);
  return (
    <div role="group" aria-label="Camera" style={row}>
      {CAM_MODES.map((cam) => (
        <ModeButton key={cam.id} id={cam.id} label={cam.label} blurb={cam.blurb} current={mode} />
      ))}
    </div>
  );
}
