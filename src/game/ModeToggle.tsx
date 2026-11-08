import type { CSSProperties } from "react";
import { setSessionMode, type SessionMode } from "./sim/boot";

const dock: CSSProperties = {
  position: "absolute",
  left: 16,
  bottom: 16,
  zIndex: 6,
  display: "flex",
  gap: 2,
  padding: 2,
  borderRadius: 8,
  border: "1px solid #2a352c",
  background: "rgba(22, 28, 24, 0.94)",
  pointerEvents: "auto",
  userSelect: "none",
};

function optionStyle(on: boolean): CSSProperties {
  return {
    minHeight: 32,
    padding: "0 12px",
    borderRadius: 6,
    border: on ? "1px solid #fb4f14" : "1px solid transparent",
    boxShadow: on ? "0 0 0 1px #fb4f14" : undefined,
    background: on ? "rgba(251, 79, 20, 0.22)" : "transparent",
    color: on ? "#fb4f14" : "#8b9688",
    fontFamily: '"Barlow Condensed", sans-serif',
    fontSize: 16,
    fontWeight: 600,
    letterSpacing: "0.04em",
    cursor: "pointer",
  };
}

/** Bottom-left Game | Practice switch. The selected side is orange and outlined. */
export function ModeToggle({ mode }: { mode: SessionMode }) {
  return (
    <div role="group" aria-label="Mode" style={dock}>
      <ModeButton mode="game" current={mode} label="Game" />
      <ModeButton mode="practice" current={mode} label="Practice" />
    </div>
  );
}

function ModeButton({ mode, current, label }: { mode: SessionMode; current: SessionMode; label: string }) {
  const on = current === mode;
  return (
    <button
      type="button"
      aria-pressed={on}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => setSessionMode(mode)}
      style={optionStyle(on)}
    >
      {label}
    </button>
  );
}
