import type { CSSProperties } from "react";
import { setSessionMode, togglePlaySide, type SessionMode } from "./sim/boot";

const group: CSSProperties = {
  display: "flex",
  gap: 2,
  padding: 2,
  borderRadius: 8,
  border: "1px solid #2a352c",
  background: "rgba(22, 28, 24, 0.94)",
  pointerEvents: "auto",
  userSelect: "none",
};

const dock: CSSProperties = {
  ...group,
  position: "absolute",
  left: 16,
  bottom: 16,
  zIndex: 6,
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

/** Game | Practice. `embedded` sits in the bottom button row. */
export function ModeToggle({ mode, embedded = false }: { mode: SessionMode; embedded?: boolean }) {
  return (
    <div role="group" aria-label="Mode" style={embedded ? group : dock}>
      <ModeButton mode="game" current={mode} label="GAME" />
      <ModeButton mode="practice" current={mode} label="PRACTICE" />
    </div>
  );
}

/** Offense | Defense. Same chrome as Game | Practice. Offense is the default. */
export function PlaySideButton({ side }: { side: "off" | "def" }) {
  return (
    <div role="group" aria-label="Play as" style={group}>
      <SideButton side="off" current={side} label="OFFENSE" />
      <SideButton side="def" current={side} label="DEFENSE" />
    </div>
  );
}

function SideButton({ side, current, label }: { side: "off" | "def"; current: "off" | "def"; label: string }) {
  const on = current === side;
  return (
    <button
      type="button"
      aria-pressed={on}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        if (!on) togglePlaySide();
      }}
      style={optionStyle(on)}
    >
      {label}
    </button>
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
