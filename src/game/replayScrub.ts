/** Post-whistle replay playhead for the bottom scrubber. The sim keeps the age. */

export type ReplayScrub = {
  on: boolean;
  /** 0 is the first stored sample. 1 is the last. */
  fraction: number;
  /** Sample index currently on screen. */
  frame: number;
};

const hidden: ReplayScrub = { on: false, fraction: 0, frame: 0 };
let scrub: ReplayScrub = hidden;
const listeners = new Set<() => void>();
let seeker: ((fraction: number) => void) | null = null;

export function subscribeReplayScrub(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readReplayScrub() {
  return scrub;
}

export function publishReplayScrub(next: ReplayScrub) {
  if (
    next.on === scrub.on &&
    next.frame === scrub.frame &&
    Math.abs(next.fraction - scrub.fraction) < 0.0004
  ) {
    return;
  }
  scrub = { on: next.on, fraction: next.fraction, frame: next.frame };
  for (const listener of listeners) listener();
}

export function clearReplayScrub() {
  publishReplayScrub(hidden);
}

/** Sample at or before `age`. The last sample wins once the playhead reaches it. */
export function shownReplaySample(frames: readonly { age: number }[], age: number) {
  if (frames.length <= 1) return 0;
  let index = 0;
  const last = frames.length - 1;
  while (index < last && frames[index + 1]!.age <= age + 1e-4) index += 1;
  return index;
}

export function bindReplaySeek(fn: (fraction: number) => void) {
  seeker = fn;
  return () => {
    if (seeker === fn) seeker = null;
  };
}

export function seekReplayScrub(fraction: number) {
  seeker?.(fraction);
}
