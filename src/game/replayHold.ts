/** On-screen replay transport. The sim still owns playback. */

export type ReplayTransportState = {
  kind: "off" | "tape" | "play";
  /** True while the picture is advancing at 1x. A held shuttle shows the play icon. */
  playing: boolean;
  /** 0 when no shuttle is held. Otherwise the active rate. */
  shuttle: number;
  locked: boolean;
};

const off: ReplayTransportState = { kind: "off", playing: false, shuttle: 0, locked: false };
let state: ReplayTransportState = off;
const listeners = new Set<() => void>();
let heldRate = 0;
let toggler: (() => void) | null = null;

export function subscribeReplayTransport(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readReplayTransport() {
  return state;
}

export function publishReplayTransport(next: ReplayTransportState) {
  if (
    next.kind === state.kind &&
    next.playing === state.playing &&
    next.shuttle === state.shuttle &&
    next.locked === state.locked
  ) {
    return;
  }
  state = { kind: next.kind, playing: next.playing, shuttle: next.shuttle, locked: next.locked };
  for (const listener of listeners) listener();
}

export function readReplayHeldRate() {
  return heldRate;
}

export function pressReplayRate(rate: number) {
  heldRate = rate;
  if (state.kind === "play") publishReplayTransport({ ...state, playing: false, shuttle: rate });
}

export function releaseReplayRate(rate: number) {
  if (heldRate !== rate) return;
  heldRate = 0;
  if (state.kind === "play" && state.shuttle === rate) publishReplayTransport({ ...state, shuttle: 0 });
}

export function clearReplayHeldRate() {
  heldRate = 0;
}

export function bindReplayToggle(fn: () => void) {
  toggler = fn;
  return () => {
    if (toggler === fn) toggler = null;
  };
}

export function toggleReplayButton() {
  clearReplayHeldRate();
  toggler?.();
}
