import { useSyncExternalStore, type CSSProperties } from "react";
import { formatQuarter, readBoard, subscribeBoard } from "./sim/boot";
import {
  UNIFORMS,
  getUniformSelection,
  kitById,
  kitName,
  selectDefenseKit,
  selectOffenseKit,
  subscribeUniforms,
  type Uniform,
} from "./uniforms";

function Swatch({
  kit,
  selected,
  onSelect,
  locked = false,
}: {
  kit: Uniform;
  selected: boolean;
  onSelect?: () => void;
  locked?: boolean;
}) {
  return (
    <button
      type="button"
      role={locked ? undefined : "option"}
      aria-selected={locked ? undefined : selected}
      aria-hidden={locked ? true : undefined}
      tabIndex={locked ? -1 : undefined}
      aria-label={locked ? undefined : kitName(kit)}
      onMouseDown={locked ? (event) => event.preventDefault() : undefined}
      onClick={locked ? undefined : onSelect}
      style={{
        width: 28,
        height: 32,
        borderRadius: 4,
        border: selected ? "2px solid #fb4f14" : "2px solid transparent",
        boxShadow: selected ? "0 0 0 1px #fb4f14" : undefined,
        padding: 0,
        cursor: "pointer",
        overflow: "hidden",
        background: "#222",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}
    >
      <span style={{ height: "28%", background: kit.helmet }} />
      <span style={{ height: "44%", background: kit.jersey }} />
      <span style={{ height: "28%", background: kit.pants }} />
    </button>
  );
}

function Row({ selectedId, onSelect }: { selectedId: number; onSelect: (id: number) => void }) {
  return (
    <div role="listbox" style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
      {UNIFORMS.map((kit) => (
        <Swatch key={kit.id} kit={kit} selected={kit.id === selectedId} onSelect={() => onSelect(kit.id)} />
      ))}
    </div>
  );
}

const overlayBanner: CSSProperties = {
  position: "absolute",
  top: 12,
  left: 12,
  zIndex: 3,
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #2a352c",
  background: "rgba(22, 28, 24, 0.94)",
};

const inlineBanner: CSSProperties = {
  position: "relative",
  zIndex: 1,
  display: "flex",
  flexDirection: "column",
  gap: 4,
  width: "max-content",
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #2a352c",
  background: "rgba(22, 28, 24, 0.94)",
  flex: "0 0 auto",
};

/** Selected kits with the score between them, plus the live quarter. */
export function TeamScore() {
  const selection = useSyncExternalStore(subscribeUniforms, getUniformSelection);
  const board = useSyncExternalStore(subscribeBoard, readBoard);
  const you = kitById(selection.offId);
  const cpu = kitById(selection.defId);
  return (
    <div
      aria-label="Team score"
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 8,
        marginTop: 6,
      }}
    >
      <Swatch kit={you} selected locked />
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 26, fontWeight: 700 }}>{board.youScore}</span>
        <span style={{ fontSize: 16, letterSpacing: "0.08em" }}>YOU - CPU</span>
        <span style={{ fontSize: 26, fontWeight: 700 }}>{board.cpuScore}</span>
      </span>
      <Swatch kit={cpu} selected locked />
      <span aria-label="Quarter" style={{ fontSize: 22, marginLeft: 4, whiteSpace: "nowrap" }}>
        {`QTR ${formatQuarter(board.quarter)}`}
      </span>
    </div>
  );
}

export function UniformBanner({ inline = false, single = false }: { inline?: boolean; single?: boolean }) {
  const selection = useSyncExternalStore(subscribeUniforms, getUniformSelection);
  return (
    <div aria-label="Uniform selection" style={inline ? inlineBanner : overlayBanner}>
      <Row selectedId={selection.offId} onSelect={selectOffenseKit} />
      {single ? null : <Row selectedId={selection.defId} onSelect={selectDefenseKit} />}
    </div>
  );
}
