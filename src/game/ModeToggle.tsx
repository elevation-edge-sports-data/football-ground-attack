import { useSyncExternalStore, type CSSProperties } from "react";
import { setSessionMode, togglePlaySide, toggleYouHome, type SessionMode } from "./sim/boot";
import { getUniformSelection, kitById, subscribeUniforms } from "./uniforms";

function homePrimary() {
  return kitById(getUniformSelection().offId).endPrimary;
}

function tint(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

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

function optionStyle(on: boolean, accent: string): CSSProperties {
  return {
    minHeight: 32,
    padding: "0 12px",
    borderRadius: 6,
    border: on ? `1px solid ${accent}` : "1px solid transparent",
    boxShadow: on ? `0 0 0 1px ${accent}` : undefined,
    background: on ? tint(accent, 0.22) : "transparent",
    color: on ? accent : "#8b9688",
    fontFamily: '"Barlow Condensed", sans-serif',
    fontSize: 16,
    fontWeight: 600,
    letterSpacing: "0.04em",
    cursor: "pointer",
  };
}

/** Drill | Practice | Game. Drill follows the game rules. `embedded` sits in the bottom button row. */
export function ModeToggle({ mode, embedded = false }: { mode: SessionMode; embedded?: boolean }) {
  const accent = useSyncExternalStore(subscribeUniforms, homePrimary);
  return (
    <div role="group" aria-label="Mode" style={embedded ? group : dock}>
      <ModeButton mode="drill" current={mode} label="DRILL" accent={accent} />
      <ModeButton mode="practice" current={mode} label="PRACTICE" accent={accent} />
      <ModeButton mode="game" current={mode} label="GAME" accent={accent} />
    </div>
  );
}

/** Home | Away. Drill and Practice only. Home is the default. */
export function HomeAwayButton({ home }: { home: boolean }) {
  const accent = useSyncExternalStore(subscribeUniforms, homePrimary);
  return (
    <div role="group" aria-label="Home or away" style={group}>
      <BenchButton home current={home} label="HOME" accent={accent} />
      <BenchButton home={false} current={home} label="AWAY" accent={accent} />
    </div>
  );
}

function BenchButton({ home, current, label, accent }: { home: boolean; current: boolean; label: string; accent: string }) {
  const on = current === home;
  return (
    <button
      type="button"
      aria-pressed={on}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        if (!on) toggleYouHome();
      }}
      style={optionStyle(on, accent)}
    >
      {label}
    </button>
  );
}

/** Offense | Defense. Same chrome as the mode control. Offense is the default. */
export function PlaySideButton({ side }: { side: "off" | "def" }) {
  const accent = useSyncExternalStore(subscribeUniforms, homePrimary);
  return (
    <div role="group" aria-label="Play as" style={group}>
      <SideButton side="off" current={side} label="OFFENSE" accent={accent} />
      <SideButton side="def" current={side} label="DEFENSE" accent={accent} />
    </div>
  );
}

function SideButton({ side, current, label, accent }: { side: "off" | "def"; current: "off" | "def"; label: string; accent: string }) {
  const on = current === side;
  return (
    <button
      type="button"
      aria-pressed={on}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        if (!on) togglePlaySide();
      }}
      style={optionStyle(on, accent)}
    >
      {label}
    </button>
  );
}

function ModeButton({ mode, current, label, accent }: { mode: SessionMode; current: SessionMode; label: string; accent: string }) {
  const on = current === mode;
  return (
    <button
      type="button"
      aria-pressed={on}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => setSessionMode(mode)}
      style={optionStyle(on, accent)}
    >
      {label}
    </button>
  );
}
