import { useEffect, useRef, useSyncExternalStore, type CSSProperties } from "react";
import { drawPracticeCard } from "./practicePreview";
import type { PlayDiagram } from "./snapArt";
import { DEF_SCHEMES, OFF_PLAYS } from "./sim/plays";
import { beginPracticeRespot, confirmPracticeRespot, readArmedCallIndex, readBoard, readPractice, setGameUserCall, setPracticePlay, setPracticeScheme, subscribeBoard, subscribePractice } from "./sim/boot";
import { kitById, kitIdForSquad, getUniformSelection, subscribeUniforms } from "./uniforms";
import { VERSION_ARCHIVE_CLEARANCE } from "./VersionArchive";

const wrap: CSSProperties = {
  position: "absolute",
  top: 168 + VERSION_ARCHIVE_CLEARANCE,
  right: 12,
  zIndex: 4,
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: 8,
  maxHeight: `calc(100% - ${180 + VERSION_ARCHIVE_CLEARANCE}px)`,
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

const bookStack: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
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

function spotButtonStyle(accent: string, confirm = false): CSSProperties {
  return {
    font: "inherit",
    fontWeight: 700,
    letterSpacing: "0.06em",
    color: "#fff",
    background: confirm ? accent : "#0c1410",
    border: `1px solid ${accent}`,
    borderRadius: 4,
    padding: "4px 10px",
    cursor: "pointer",
  };
}

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
  showArt,
  onPick,
}: {
  side: "off" | "def";
  jersey: string;
  index: number;
  names: readonly string[];
  diagram: PlayDiagram | null;
  /** Route diagram. Hidden for the live play, shown again between plays. */
  showArt: boolean;
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
          minHeight: 36,
          padding: "6px 8px",
          background: jersey,
          color: ink,
          fontWeight: 700,
          fontSize: 18,
          letterSpacing: "0.04em",
        }}
      >
        <span style={{ textAlign: "center" }}>{index + 1}</span>
        <span style={{ textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textTransform: "uppercase" }}>
          {name}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "stretch" }}>
        <div
          role="listbox"
          aria-label={side === "off" ? "Offense plays" : "Defense schemes"}
          style={{ flex: "0 0 9.25rem", borderRight: "1px solid rgba(255,255,255,0.08)" }}
        >
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
                  display: "block",
                  width: "100%",
                  padding: "3px 6px",
                  border: 0,
                  borderRadius: 3,
                  background: selected ? "rgba(251, 79, 20, 0.22)" : "transparent",
                  color: selected ? "#fff" : "#a3a3a3",
                  font: "inherit",
                  fontSize: 16,
                  textAlign: "center",
                  textTransform: "uppercase",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        <canvas
          ref={canvasRef}
          width={328}
          height={244}
          aria-hidden={showArt ? undefined : true}
          style={{ display: showArt ? "block" : "none", width: 328, height: 244 }}
        />
      </div>
    </div>
  );
}

/** Practice column: both playbooks, and a free re-spot of the ball. GAME shows the controlled side only. */
export function PracticeBooks() {
  const ui = useSyncExternalStore(subscribePractice, readPractice);
  const board = useSyncExternalStore(subscribeBoard, readBoard);
  const kits = useSyncExternalStore(subscribeUniforms, getUniformSelection);
  const hidePreviews = board.replay && (ui.mode === "practice" || board.mode === "game");
  // The route diagram is the play-art preview. It stays up between plays and drops out while the snap is live.
  const showArt = board.awaitSnap || board.over;
  if (ui.mode === "practice") {
    const userSide = board.side === "def" ? "def" : "off";
    const offJersey = kitById(kitIdForSquad("off", userSide, kits)).jersey;
    const defJersey = kitById(kitIdForSquad("def", userSide, kits)).jersey;
    const homePrimary = kitById(kits.offId).endPrimary;
    return (
    <div aria-label="Practice play previews" style={wrap}>
      <div style={losPanel}>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={beginPracticeRespot}
            style={spotButtonStyle(homePrimary)}
          >
            RE-SPOT BALL
          </button>
          {ui.aiming ? (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={confirmPracticeRespot}
              style={spotButtonStyle(homePrimary, true)}
            >
              CONFIRM
            </button>
          ) : null}
        </div>
      </div>
      {hidePreviews ? null : (
      <div style={bookStack}>
        <Book
          side="def"
          jersey={defJersey}
          index={ui.schemeIndex}
          names={DEF_SCHEMES.map((scheme) => scheme.name)}
          diagram={ui.diagram}
          showArt={showArt}
          onPick={setPracticeScheme}
        />
        <Book
          side="off"
          jersey={offJersey}
          index={ui.playIndex}
          names={OFF_PLAYS.map((play) => play.name)}
          diagram={ui.diagram}
          showArt={showArt}
          onPick={setPracticePlay}
        />
      </div>
      )}
    </div>
  );
  }
  if (board.mode !== "game" || hidePreviews) return null;
  const side = board.side === "def" ? "def" : "off";
  const jersey = kitById(side === "off" ? kits.offId : kits.defId).jersey;
  const names = side === "off" ? OFF_PLAYS.map((play) => play.name) : DEF_SCHEMES.map((scheme) => scheme.name);
  return (
    <div aria-label={side === "off" ? "Offense play preview" : "Defense play preview"} style={wrap}>
      <div style={row}>
        <Book
          side={side}
          jersey={jersey}
          index={readArmedCallIndex(side)}
          names={names}
          diagram={ui.diagram}
          showArt={showArt}
          onPick={setGameUserCall}
        />
      </div>
    </div>
  );
}
