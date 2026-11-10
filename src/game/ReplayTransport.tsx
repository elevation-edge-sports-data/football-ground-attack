import { useSyncExternalStore, type CSSProperties } from "react";
import {
  pressReplayRate,
  readReplayTransport,
  releaseReplayRate,
  subscribeReplayTransport,
  toggleReplayButton,
} from "./replayHold";
import { pressTapeShuttle, releaseTapeShuttle, toggleTapePlay } from "./tapeReplay";

type IconName = "fast-rewind" | "slow-rewind" | "play" | "pause" | "slow-forward" | "fast-forward";

const row: CSSProperties = {
  position: "fixed",
  left: 12,
  bottom: 54,
  zIndex: 31,
  display: "flex",
  gap: 6,
  pointerEvents: "auto",
};

function buttonStyle(on: boolean, disabled: boolean): CSSProperties {
  return {
    width: 44,
    height: 44,
    minHeight: 44,
    padding: 0,
    display: "grid",
    placeItems: "center",
    borderRadius: 6,
    border: "1px solid",
    borderColor: on ? "#fb4f14" : "#243040",
    background: "#171e28",
    color: on ? "#fb4f14" : "#e8ece6",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.4 : 1,
  };
}

function TransportIcon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" style={{ display: "block", fill: "currentColor" }}>
      {name === "fast-rewind" ? (
        <>
          <polygon points="11 4 3 12 11 20" />
          <polygon points="21 4 13 12 21 20" />
        </>
      ) : null}
      {name === "fast-forward" ? (
        <>
          <polygon points="3 4 11 12 3 20" />
          <polygon points="13 4 21 12 13 20" />
        </>
      ) : null}
      {name === "slow-rewind" ? (
        <>
          <rect x="3" y="4" width="2.4" height="16" />
          <polygon points="20 4 9 12 20 20" />
        </>
      ) : null}
      {name === "slow-forward" ? (
        <>
          <polygon points="4 4 15 12 4 20" />
          <rect x="18.6" y="4" width="2.4" height="16" />
        </>
      ) : null}
      {name === "play" ? <polygon points="7 4 19 12 7 20" /> : null}
      {name === "pause" ? (
        <>
          <rect x="6" y="4" width="3.4" height="16" />
          <rect x="14.6" y="4" width="3.4" height="16" />
        </>
      ) : null}
    </svg>
  );
}

function ShuttleButton({
  label,
  icon,
  rate,
  on,
  disabled,
  onPress,
  onRelease,
}: {
  label: string;
  icon: IconName;
  rate: number;
  on: boolean;
  disabled: boolean;
  onPress: (rate: number) => void;
  onRelease: (rate: number) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      disabled={disabled}
      tabIndex={-1}
      style={buttonStyle(on, disabled)}
      onMouseDown={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (event.button !== 0 || disabled) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        onPress(rate);
      }}
      onPointerUp={() => onRelease(rate)}
      onPointerCancel={() => onRelease(rate)}
      onLostPointerCapture={() => onRelease(rate)}
    >
      <TransportIcon name={icon} />
    </button>
  );
}

/** Five icon buttons just above the replay scrubber. Hidden once replay closes. */
export function ReplayTransport() {
  const transport = useSyncExternalStore(subscribeReplayTransport, readReplayTransport);
  if (transport.kind === "off") return null;
  const tape = transport.kind === "tape";
  const press = tape ? pressTapeShuttle : pressReplayRate;
  const release = tape ? releaseTapeShuttle : releaseReplayRate;
  const toggle = tape ? toggleTapePlay : toggleReplayButton;
  const locked = transport.locked;
  const shuttleOn = (rate: number) => Math.abs(transport.shuttle - rate) < 0.01;
  return (
    <div style={row} role="group" aria-label="Replay transport">
      <ShuttleButton label="Fast rewind" icon="fast-rewind" rate={-3.4} on={shuttleOn(-3.4)} disabled={locked} onPress={press} onRelease={release} />
      <ShuttleButton label="Slow rewind" icon="slow-rewind" rate={-0.28} on={shuttleOn(-0.28)} disabled={locked} onPress={press} onRelease={release} />
      <button
        type="button"
        aria-label="Play/pause"
        aria-pressed={transport.playing}
        disabled={locked}
        tabIndex={-1}
        style={buttonStyle(false, locked)}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (!locked) toggle();
        }}
      >
        <TransportIcon name={transport.playing ? "pause" : "play"} />
      </button>
      <ShuttleButton label="Slow forward" icon="slow-forward" rate={0.28} on={shuttleOn(0.28)} disabled={locked} onPress={press} onRelease={release} />
      <ShuttleButton label="Fast forward" icon="fast-forward" rate={3.4} on={shuttleOn(3.4)} disabled={locked} onPress={press} onRelease={release} />
    </div>
  );
}
