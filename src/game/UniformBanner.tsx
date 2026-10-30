import { useSyncExternalStore, type CSSProperties } from "react";
import {
  UNIFORMS,
  getUniformSelection,
  kitName,
  selectDefenseKit,
  selectOffenseKit,
  subscribeUniforms,
  type Uniform,
} from "./uniforms";

function Swatch({ kit, selected, onSelect }: { kit: Uniform; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      aria-label={kitName(kit)}
      onClick={onSelect}
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

export function UniformBanner({ inline = false }: { inline?: boolean }) {
  const selection = useSyncExternalStore(subscribeUniforms, getUniformSelection);
  return (
    <div aria-label="Uniform selection" style={inline ? inlineBanner : overlayBanner}>
      <Row selectedId={selection.offId} onSelect={selectOffenseKit} />
      <Row selectedId={selection.defId} onSelect={selectDefenseKit} />
    </div>
  );
}
