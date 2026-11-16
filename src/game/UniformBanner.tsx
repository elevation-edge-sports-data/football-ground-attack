import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { youKitIsHome } from "./sim/attack";
import { formatQuarter, readBoard, readPlaySide, subscribeBoard } from "./sim/boot";
import {
  UNIFORMS,
  getUniformSelection,
  kitById,
  kitIdForSquad,
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
  accent = "#fb4f14",
}: {
  kit: Uniform;
  selected: boolean;
  onSelect?: () => void;
  locked?: boolean;
  /** Outline of the selected icon. The score chips keep the default. */
  accent?: string;
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
        border: selected ? `2px solid ${accent}` : "2px solid transparent",
        boxShadow: selected ? `0 0 0 1px ${accent}` : undefined,
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
  const accent = kitById(selectedId).endPrimary;
  return (
    <div role="listbox" style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
      {UNIFORMS.map((kit) => (
        <Swatch key={kit.id} kit={kit} selected={kit.id === selectedId} accent={accent} onSelect={() => onSelect(kit.id)} />
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

/** One kit row. Same chip as hockey's play banner, kept in the top-left HUD slot. */
const gameBanner: CSSProperties = {
  position: "absolute",
  top: 12,
  left: 12,
  zIndex: 3,
  width: "max-content",
  padding: "6px 8px",
  borderRadius: 10,
  border: "1px solid #243040",
  background: "rgba(16, 22, 31, 0.86)",
};

const kitTag: CSSProperties = {
  display: "block",
  height: "0.95rem",
  marginBottom: 4,
  padding: 0,
  border: 0,
  background: "none",
  fontFamily: '"Barlow Condensed", sans-serif',
  fontSize: "0.72rem",
  letterSpacing: "0.06em",
  lineHeight: "0.95rem",
  textTransform: "uppercase",
  color: "#8b97a4",
  whiteSpace: "nowrap",
};

function BannerKit({
  kit,
  selected,
  tag,
  targeted,
  onPick,
  onSwap,
  onTarget,
}: {
  kit: Uniform;
  selected: boolean;
  tag?: "YOU" | "CPU";
  targeted?: boolean;
  onPick: (id: number) => void;
  onSwap: () => void;
  onTarget?: () => void;
}) {
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (clickTimer.current) clearTimeout(clickTimer.current);
    },
    [],
  );
  // A double-click also emits a click. Hold the pick so the swap runs once.
  const armPick = () => {
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      onPick(kit.id);
    }, 280);
  };
  const swapIfWorn = () => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    if (selected) onSwap();
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      {tag ? (
        <button type="button" aria-pressed={targeted} onClick={onTarget} style={{ ...kitTag, color: targeted ? "#fb4f14" : "#8b97a4", cursor: "pointer" }}>
          {tag}
        </button>
      ) : (
        <span style={kitTag} />
      )}
      <button
        type="button"
        aria-label={`Kit ${kit.id + 1}`}
        aria-pressed={selected}
        onClick={armPick}
        onDoubleClick={swapIfWorn}
        style={{
          width: 22,
          height: 28,
          padding: 0,
          border: "1px solid #243040",
          borderRadius: 5,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          background: "#171e28",
          cursor: "pointer",
          outline: selected ? `2px solid ${kit.jersey}` : "none",
          outlineOffset: selected ? 1 : undefined,
        }}
      >
        <span style={{ flex: 1, background: kit.helmet }} />
        <span style={{ flex: 1, background: kit.jersey }} />
        <span style={{ flex: 1, background: kit.pants }} />
      </button>
    </div>
  );
}

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
  const youAway = board.mode !== "game" && !youKitIsHome();
  const leftKit = youAway ? cpu : you;
  const rightKit = youAway ? you : cpu;
  const leftScore = youAway ? board.cpuScore : board.youScore;
  const rightScore = youAway ? board.youScore : board.cpuScore;
  const scoreLabel = youAway ? "CPU - YOU" : "YOU - CPU";
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
      <Swatch kit={leftKit} selected locked />
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 26, fontWeight: 700 }}>{leftScore}</span>
        <span style={{ fontSize: 16, letterSpacing: "0.08em" }}>{scoreLabel}</span>
        <span style={{ fontSize: 26, fontWeight: 700 }}>{rightScore}</span>
      </span>
      <Swatch kit={rightKit} selected locked />
      <span aria-label="Quarter" style={{ fontSize: 22, marginLeft: 4, whiteSpace: "nowrap" }}>
        {`QTR ${formatQuarter(board.quarter)}`}
      </span>
    </div>
  );
}

export function UniformBanner({ inline = false, single = false }: { inline?: boolean; single?: boolean }) {
  const selection = useSyncExternalStore(subscribeUniforms, getUniformSelection);
  const userSide = useSyncExternalStore(subscribeBoard, readPlaySide);
  const [side, setSide] = useState<"off" | "def">("off");
  if (single) {
    return (
      <div aria-label="Uniform selection" style={inline ? inlineBanner : overlayBanner}>
        <Row selectedId={selection.offId} onSelect={selectOffenseKit} />
      </div>
    );
  }
  const pick = (id: number) => {
    if (side === "off") {
      if (id === selection.offId) return;
      selectOffenseKit(id);
      return;
    }
    if (id === selection.defId) return;
    selectDefenseKit(id);
  };
  const swapKits = () => {
    selectOffenseKit(selection.defId);
  };
  return (
    <div aria-label="Uniform selection" style={gameBanner}>
      <div style={{ display: "flex", flexWrap: "nowrap", gap: 6 }}>
        {UNIFORMS.map((kit) => {
          const cpuSide = userSide === "def" ? "off" : "def";
          const you = kitIdForSquad(userSide, userSide, selection) === kit.id;
          const cpu = kitIdForSquad(cpuSide, userSide, selection) === kit.id;
          const tag = you ? "YOU" : cpu ? "CPU" : undefined;
          return (
            <BannerKit
              key={kit.id}
              kit={kit}
              selected={you || cpu}
              tag={tag}
              targeted={tag === "YOU" ? side === "off" : tag === "CPU" ? side === "def" : false}
              onTarget={() => setSide(tag === "CPU" ? "def" : "off")}
              onPick={pick}
              onSwap={swapKits}
            />
          );
        })}
      </div>
    </div>
  );
}
