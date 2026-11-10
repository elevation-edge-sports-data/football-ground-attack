import { useRef, useSyncExternalStore, type CSSProperties } from "react";
import { readReplayScrub, seekReplayScrub, subscribeReplayScrub } from "./replayScrub";

const bar: CSSProperties = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 30,
  display: "flex",
  alignItems: "center",
  gap: 8,
  boxSizing: "border-box",
  width: "100%",
  padding: "10px 12px 12px",
  background: "#070707",
  borderTop: "1px solid #243040",
  pointerEvents: "auto",
};

const trackStyle: CSSProperties = {
  flex: 1,
  height: 18,
  padding: 2,
  background: "#070707",
  border: "2px solid #f4f4f4",
  boxShadow: "inset 0 0 0 2px #000, 0 1px 0 #000",
  cursor: "pointer",
  touchAction: "none",
};

const frameStyle: CSSProperties = {
  minWidth: "4.5em",
  fontFamily: '"Barlow Condensed", sans-serif',
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textAlign: "right",
  color: "#f4f4f4",
};

/** Full-width playhead for the post-whistle replay. Hidden when that replay is closed. */
export function ReplayScrubBar() {
  const scrub = useSyncExternalStore(subscribeReplayScrub, readReplayScrub);
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef(false);
  if (!scrub.on) return null;
  const shown = Math.round(Math.max(0, Math.min(1, scrub.fraction)) * 100);
  const seekAt = (clientX: number) => {
    const el = track.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const padL = Number.parseFloat(style.paddingLeft) || 0;
    const padR = Number.parseFloat(style.paddingRight) || 0;
    const borderL = Number.parseFloat(style.borderLeftWidth) || 0;
    const width = Math.max(1, el.clientWidth - padL - padR);
    const x = clientX - (rect.left + borderL + padL);
    seekReplayScrub(Math.max(0, Math.min(1, x / width)));
  };
  return (
    <div
      style={bar}
      role="slider"
      aria-label="Replay position"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={shown}
      aria-valuetext={`frame ${scrub.frame}`}
    >
      <div
        ref={track}
        style={trackStyle}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          drag.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          seekAt(event.clientX);
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          seekAt(event.clientX);
        }}
        onPointerUp={() => {
          drag.current = false;
        }}
        onPointerCancel={() => {
          drag.current = false;
        }}
      >
        <div style={{ position: "relative", height: "100%", overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${shown}%`,
              background: "#5a1021",
              boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.75)",
            }}
          />
        </div>
      </div>
      <span style={frameStyle}>{scrub.frame}</span>
    </div>
  );
}
