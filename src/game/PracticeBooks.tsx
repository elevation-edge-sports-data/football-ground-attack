import { useEffect, useRef, useSyncExternalStore, type CSSProperties } from "react";
import { drawPracticeCard } from "./practicePreview";
import type { PlayDiagram } from "./snapArt";
import { DEF_SCHEMES, OFF_PLAYS } from "./sim/plays";
import { beginPracticeRespot, confirmPracticeRespot, readPractice, setPracticePlay, setPracticeScheme, subscribePractice } from "./sim/boot";
import { kitById, getUniformSelection, subscribeUniforms } from "./uniforms";

const wrap: CSSProperties = {
  position: "absolute",
  top: 168,
  right: 12,
  zIndex: 4,
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: 8,
  maxHeight: "calc(100% - 180px)",
  overflow: "auto",
  pointerEvents: "auto",
  userSelect: "none",
};

const row: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "flex-end",
  gap: 8,
};

const losPanel: CSSProperties = {
  width: "100%",
  maxWidth: 448,
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid #2a352c",
  background: "rgba(22, 28, 24, 0.94)",
  color: "#e8ece6",
  fontFamily: '"Barlow Condensed", sans-serif',
  fontSize: 15,
  letterSpacing: "0.03em",
};

const spotButton: CSSProperties = {
  font: "inherit",
  fontWeight: 700,
  letterSpacing: "0.06em",
  color: "#fff",
  background: "#0c1410",
  border: "1px solid #fb4f14",
  borderRadius: 4,
  padding: "4px 10px",
  cursor: "pointer",
};

function inkOn(hex: string) {
  const h = hex.replace("#", "");
  if (h.length < 6) return "#fff";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? "#111" : "#fff";
}

function Book({
  side,
  jersey,
  index,
  names,
  diagram,
  onPick,
}: {
  side: "off" | "def";
  jersey: string;
  index: number;
  names: readonly string[];
  diagram: PlayDiagram | null;
  onPick: (index: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    drawPracticeCard(canvasRef.current, side, diagram);
  }, [side, diagram]);
  const ink = inkOn(jersey);
  const name = names[index] ?? (side === "off" ? "Offense" : "Defense");
  return (
    <div
      style={{
        width: 220,
        borderRadius: 6,
        overflow: "hidden",
        border: `2px solid ${jersey}`,
        background: "#0a1210",
        color: "#e8ece6",
        fontFamily: '"Barlow Condensed", sans-serif',
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2.2rem 1fr",
          alignItems: "center",
          gap: 6,
          minHeight: 28,
          padding: "5px 8px",
          background: jersey,
          color: ink,
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: "0.04em",
        }}
      >
        <span style={{ textAlign: "center" }}>{index + 1}</span>
        <span style={{ textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </span>
      </div>
      <canvas ref={canvasRef} width={220} height={160} style={{ display: "block", width: "100%", height: "auto" }} />
      <div role="listbox" aria-label={side === "off" ? "Offense plays" : "Defense schemes"} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        {names.map((label, item) => {
          const selected = item === index;
          return (
            <button
              key={`${side}-${item}`}
              type="button"
              role="option"
              aria-selected={selected}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onPick(item)}
              style={{
                display: "grid",
                gridTemplateColumns: "2.2rem 1fr",
                alignItems: "center",
                gap: 4,
                width: "100%",
                padding: "3px 4px",
                border: 0,
                borderRadius: 3,
                background: selected ? "rgba(251, 79, 20, 0.22)" : "transparent",
                color: selected ? "#fff" : "#a3a3a3",
                font: "inherit",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              <span style={{ fontWeight: 700, textAlign: "center", color: selected ? "#fb4f14" : "#8a9a8a" }}>{item + 1}</span>
              <span style={{ textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Practice column: both playbooks, and a free re-spot of the ball. */
export function PracticeBooks() {
  const ui = useSyncExternalStore(subscribePractice, readPractice);
  const kits = useSyncExternalStore(subscribeUniforms, getUniformSelection);
  if (ui.mode !== "practice") return null;
  const offJersey = kitById(kits.offId).jersey;
  const defJersey = kitById(kits.defId).jersey;
  return (
    <div aria-label="Practice play previews" style={wrap}>
      <div style={losPanel}>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={beginPracticeRespot}
            style={spotButton}
          >
            RE-SPOT BALL
          </button>
          {ui.aiming ? (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={confirmPracticeRespot}
              style={{ ...spotButton, background: "#fb4f14" }}
            >
              CONFIRM
            </button>
          ) : null}
        </div>
      </div>
      <div style={row}>
        <Book
          side="off"
          jersey={offJersey}
          index={ui.playIndex}
          names={OFF_PLAYS.map((play) => play.name)}
          diagram={ui.diagram}
          onPick={setPracticePlay}
        />
        <Book
          side="def"
          jersey={defJersey}
          index={ui.schemeIndex}
          names={DEF_SCHEMES.map((scheme) => scheme.name)}
          diagram={ui.diagram}
          onPick={setPracticeScheme}
        />
      </div>
    </div>
  );
}
