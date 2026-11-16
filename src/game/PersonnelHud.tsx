import { useSyncExternalStore, type CSSProperties } from "react";
import { readArmedCallIndex, readBoard, setGameUserCall, subscribeBoard } from "./sim/boot";
import { DEF_SCHEMES, OFF_PLAYS } from "./sim/plays";
import {
  DEFENSE_PERSONNEL,
  OFFENSE_PERSONNEL,
  PERSONNEL_LABEL,
  canStepPersonnel,
  readPersonnel,
  stepPersonnel,
  subscribePersonnel,
  type PersonnelKey,
} from "./sim/personnel";
import { readTapeOn, subscribeTape } from "./tapeReplay";
import type { PersonnelCounts } from "./sim/types";

const stripStyle: CSSProperties = {
  position: "absolute",
  top: 12,
  right: 12,
  zIndex: 4,
  display: "flex",
  gap: 8,
  alignItems: "flex-start",
  pointerEvents: "auto",
  userSelect: "none",
};

const panelStyle: CSSProperties = {
  minWidth: 118,
  margin: 0,
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid #2a352c",
  background: "rgba(22, 28, 24, 0.94)",
  color: "#e8ece6",
  fontFamily: '"Barlow Condensed", sans-serif',
  fontSize: 15,
  letterSpacing: "0.04em",
};

const titleRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 8,
  marginBottom: 4,
};

const titleStyle: CSSProperties = {
  flex: "0 0 auto",
  fontSize: 15,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#8b9688",
};

const callStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#e8ece6",
  whiteSpace: "nowrap",
};

const callSelectStyle: CSSProperties = {
  ...callStyle,
  padding: "0 4px",
  borderRadius: 4,
  border: "1px solid #fb4f14",
  background: "#0c1410",
  fontFamily: "inherit",
  cursor: "pointer",
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 6,
  padding: "1px 0",
};

const pmStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
};

function stepButtonStyle(disabled: boolean): CSSProperties {
  return {
    width: 24,
    height: 24,
    padding: 0,
    borderRadius: 4,
    border: "1px solid #2a352c",
    background: "#0c1410",
    color: "#e8ece6",
    font: "inherit",
    lineHeight: 1,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.35 : 1,
  };
}

const valueStyle: CSSProperties = {
  minWidth: 12,
  textAlign: "center",
  fontVariantNumeric: "tabular-nums",
};

function Stepper({ group, counts, steps }: { group: PersonnelKey; counts: PersonnelCounts; steps: boolean }) {
  const label = PERSONNEL_LABEL[group];
  const value = counts[group];
  const minus = !canStepPersonnel(group, -1, counts);
  const plus = !canStepPersonnel(group, 1, counts);
  return (
    <div style={rowStyle}>
      <span>{label}</span>
      <span style={pmStyle}>
        {steps ? (
          <button
            type="button"
            aria-label={`${label} decrease`}
            disabled={minus}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => stepPersonnel(group, -1)}
            style={stepButtonStyle(minus)}
          >
            −
          </button>
        ) : null}
        <span style={valueStyle}>{value}</span>
        {steps ? (
          <button
            type="button"
            aria-label={`${label} increase`}
            disabled={plus}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => stepPersonnel(group, 1)}
            style={stepButtonStyle(plus)}
          >
            +
          </button>
        ) : null}
      </span>
    </div>
  );
}

function CallPick({ side, names }: { side: "off" | "def"; names: readonly string[] }) {
  return (
    <select
      aria-label={side === "off" ? "Offense play" : "Defense scheme"}
      value={String(readArmedCallIndex(side))}
      onChange={(event) => {
        setGameUserCall(Number(event.target.value));
        event.currentTarget.blur();
      }}
      style={callSelectStyle}
    >
      {names.map((name, index) => (
        <option key={name} value={String(index)}>
          {name}
        </option>
      ))}
    </select>
  );
}

function Panel({
  title,
  call,
  pick,
  groups,
  counts,
  steps,
}: {
  title: string;
  call: string;
  pick: { side: "off" | "def"; names: readonly string[] } | null;
  groups: readonly PersonnelKey[];
  counts: PersonnelCounts;
  steps: boolean;
}) {
  return (
    <div style={panelStyle}>
      <div style={titleRowStyle}>
        <span style={titleStyle}>{title}</span>
        {pick ? <CallPick side={pick.side} names={pick.names} /> : <span style={callStyle}>{call}</span>}
      </div>
      {groups.map((group) => (
        <Stepper key={group} group={group} counts={counts} steps={steps} />
      ))}
    </div>
  );
}

/** Offense and defense personnel steppers. Counts apply on the upcoming snap. */
export function PersonnelHud() {
  const counts = useSyncExternalStore(subscribePersonnel, readPersonnel);
  const board = useSyncExternalStore(subscribeBoard, readBoard);
  const tape = useSyncExternalStore(subscribeTape, readTapeOn);
  const steps = !board.replay && !tape;
  // GAME huddle: the controlled side picks its call. The other side stays a label.
  const picking = board.mode === "game" && board.awaitSnap && !board.over && !board.replay && !tape;
  const userDef = board.side === "def";
  const offNames = OFF_PLAYS.map((play) => play.name);
  const defNames = DEF_SCHEMES.map((scheme) => scheme.name);
  return (
    <div aria-label="Personnel" style={stripStyle}>
      <Panel
        title="Offense"
        call={board.playName}
        pick={picking && !userDef ? { side: "off", names: offNames } : null}
        groups={OFFENSE_PERSONNEL}
        counts={counts}
        steps={steps}
      />
      <Panel
        title="Defense"
        call={board.schemeName}
        pick={picking && userDef ? { side: "def", names: defNames } : null}
        groups={DEFENSE_PERSONNEL}
        counts={counts}
        steps={steps}
      />
    </div>
  );
}
