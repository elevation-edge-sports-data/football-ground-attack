import { useSyncExternalStore, type CSSProperties } from "react";
import { readBoard, subscribeBoard } from "./sim/boot";
import {
  DEFENSE_PERSONNEL,
  OFFENSE_PERSONNEL,
  PERSONNEL_LABEL,
  PERSONNEL_LIMITS,
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

const titleStyle: CSSProperties = {
  marginBottom: 4,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#8b9688",
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
  const limit = PERSONNEL_LIMITS[group];
  const value = counts[group];
  return (
    <div style={rowStyle}>
      <span>{label}</span>
      <span style={pmStyle}>
        {steps ? (
          <button
            type="button"
            aria-label={`${label} decrease`}
            disabled={value <= limit.min}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => stepPersonnel(group, -1)}
            style={stepButtonStyle(value <= limit.min)}
          >
            −
          </button>
        ) : null}
        <span style={valueStyle}>{value}</span>
        {steps ? (
          <button
            type="button"
            aria-label={`${label} increase`}
            disabled={value >= limit.max}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => stepPersonnel(group, 1)}
            style={stepButtonStyle(value >= limit.max)}
          >
            +
          </button>
        ) : null}
      </span>
    </div>
  );
}

function Panel({
  title,
  groups,
  counts,
  steps,
}: {
  title: string;
  groups: readonly PersonnelKey[];
  counts: PersonnelCounts;
  steps: boolean;
}) {
  return (
    <div style={panelStyle}>
      <div style={titleStyle}>{title}</div>
      {groups.map((group) => (
        <Stepper key={group} group={group} counts={counts} steps={steps} />
      ))}
    </div>
  );
}

/** Offense and defense personnel steppers. Counts apply on the next snap. */
export function PersonnelHud() {
  const counts = useSyncExternalStore(subscribePersonnel, readPersonnel);
  const board = useSyncExternalStore(subscribeBoard, readBoard);
  const tape = useSyncExternalStore(subscribeTape, readTapeOn);
  const steps = !board.replay && !tape;
  return (
    <div aria-label="Personnel" style={stripStyle}>
      <Panel title="Offense" groups={OFFENSE_PERSONNEL} counts={counts} steps={steps} />
      <Panel title="Defense" groups={DEFENSE_PERSONNEL} counts={counts} steps={steps} />
    </div>
  );
}
