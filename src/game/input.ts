import { carrierAction, type CarrierAction } from "./carrierPose";
import type { Input } from "./sim";

/**
 * Basic profile. Raw axes are screen directions: W / Up and stick-up are
 * toward the top of the view, D / Right and stick-right are screen-right.
 * SimView turns that vector with the camera before the sim treats it as field axes.
 * A live left stick replaces the keys. The d-pad adds movement on top.
 * Held specials: Q juke left, E juke right, Z stiff left, X stiff right,
 * V or Y truck, I hurdle, I+J hurdle left, I+L hurdle right,
 * N shake left, M shake right, G hesitate left, H hesitate right, F spin,
 * Space sprint, C dive.
 * D-pad Up hurdles, Up-left hurdles left, Up-right hurdles right,
 * Left shakes left, Right shakes right, Down-left and Down-right hesitate.
 * Down alone still moves south. Pad Y trucks, B spins, LB/RB juke, LT/RT stiff, A sprint, X dive.
 */
const T9_ID_RE = /1949.*0402|Vendor:\s*1949\s*Product:\s*0402|\bT-?9\b|Terios/i;
/** Standard layout index 11 is the right-stick click. Raw T-9 maps that slot to physical 14. */
const T9_BTN_MAP = [0, 1, 3, 4, 6, 7, 8, 9, 10, 11, 13, 14];
const R3_BUTTON = 11;
/**
 * Keyboard pause. P cycles Wings / Independent / Classic, and Escape already
 * leaves instant replay, so a live play uses Escape. Replay still owns Escape.
 */
export const PAUSE_KEY = "Escape";
const MOVE_CODES = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
]);

const ACTION_CODES = new Set([
  "KeyQ",
  "KeyE",
  "KeyZ",
  "KeyX",
  "KeyV",
  "KeyY",
  "KeyI",
  "KeyJ",
  "KeyL",
  "KeyN",
  "KeyM",
  "KeyG",
  "KeyH",
  "KeyF",
  "Space",
  "KeyC",
]);

const STICK_DEAD = 0.18;

export type PadAxes = {
  /** Raw left stick. +x is right. Browser +y is down. */
  x: number;
  y: number;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  jukeL: boolean;
  jukeR: boolean;
  stiffL: boolean;
  stiffR: boolean;
  truck: boolean;
  shakeL: boolean;
  shakeR: boolean;
  deadL: boolean;
  deadR: boolean;
  spin: boolean;
  sprint: boolean;
  dive: boolean;
};

export function radialDeadzone(x: number, y: number, dead = STICK_DEAD) {
  const mag = Math.hypot(x, y);
  if (mag < dead) return { x: 0, y: 0 };
  const scale = (mag - dead) / (1 - dead) / mag;
  return { x: x * scale, y: y * scale };
}

function keyAxis(keys: ReadonlySet<string>) {
  return {
    x: (keys.has("ArrowRight") || keys.has("KeyD") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("KeyA") ? 1 : 0),
    yard: (keys.has("ArrowUp") || keys.has("KeyW") ? 1 : 0) - (keys.has("ArrowDown") || keys.has("KeyS") ? 1 : 0),
  };
}

function hurdleKeys(keys: ReadonlySet<string>, pad: PadAxes | null) {
  const up = keys.has("KeyI") || !!pad?.up;
  const left = (keys.has("KeyI") && keys.has("KeyJ")) || (!!pad?.up && !!pad?.left);
  const right = (keys.has("KeyI") && keys.has("KeyL")) || (!!pad?.up && !!pad?.right);
  return {
    hurdleL: left && !right,
    hurdleR: right && !left,
    hurdle: up && !left && !right,
  };
}

function heldAction(keys: ReadonlySet<string>, pad: PadAxes | null): CarrierAction {
  const hurdle = hurdleKeys(keys, pad);
  return carrierAction({
    jukeL: keys.has("KeyQ") || !!pad?.jukeL,
    jukeR: keys.has("KeyE") || !!pad?.jukeR,
    stiffL: keys.has("KeyZ") || !!pad?.stiffL,
    stiffR: keys.has("KeyX") || !!pad?.stiffR,
    hurdleL: hurdle.hurdleL,
    hurdleR: hurdle.hurdleR,
    hurdle: hurdle.hurdle,
    truck: keys.has("KeyV") || keys.has("KeyY") || !!pad?.truck,
    shakeL: keys.has("KeyN") || !!pad?.shakeL,
    shakeR: keys.has("KeyM") || !!pad?.shakeR,
    deadL: keys.has("KeyG") || !!pad?.deadL,
    deadR: keys.has("KeyH") || !!pad?.deadR,
    spin: keys.has("KeyF") || !!pad?.spin,
    sprint: keys.has("Space") || !!pad?.sprint,
    dive: keys.has("KeyC") || !!pad?.dive,
  });
}

export function basicMove(keys: ReadonlySet<string>, pad: PadAxes | null): Input {
  const keysMove = keyAxis(keys);
  let x = keysMove.x;
  let yard = keysMove.yard;
  if (pad) {
    const stick = radialDeadzone(pad.x, -pad.y);
    if (stick.x !== 0 || stick.y !== 0) {
      x = stick.x;
      yard = stick.y;
    }
    // Up is a hurdle. Left and right are shakes. Down-left and down-right are hesitates.
    // Those buttons do not steer. Down alone still moves south.
    const dpadSpecial = pad.up || pad.left || pad.right;
    let dx = 0;
    let dy = dpadSpecial ? 0 : pad.down ? -1 : 0;
    const dmag = Math.hypot(dx, dy);
    if (dmag > 1) {
      dx /= dmag;
      dy /= dmag;
    }
    if (dmag > 0) {
      x += dx;
      yard += dy;
    }
  }
  return {
    x,
    yard,
    action: heldAction(keys, pad),
    sprint: keys.has("Space") || !!pad?.sprint,
  };
}

function padPressed(pad: Gamepad, index: number) {
  const button = pad.buttons[index];
  return !!(button && (button.pressed || button.value > 0.4));
}

function isT9Family(pad: Gamepad) {
  return T9_ID_RE.test(pad.id || "");
}

/** Button index of the right-stick click. Standard pads use 11. Raw T-9 uses the mapped slot. */
function r3Index(pad: Gamepad) {
  if (isT9Family(pad) && pad.mapping !== "standard") return T9_BTN_MAP[R3_BUTTON] ?? R3_BUTTON;
  return R3_BUTTON;
}

/** Raw T-9 right-stick Y is axis 5 or 3. The louder axis wins until the other one does. */
let t9RyAxis: 3 | 5 = 5;

function t9RightStickY(pad: Gamepad) {
  const mag = (value: number) => (Math.abs(value) <= 1.05 ? Math.abs(value) : 0);
  const a3 = pad.axes[3] ?? 0;
  const a5 = pad.axes[5] ?? 0;
  const m3 = mag(a3);
  const m5 = mag(a5);
  if (m5 > 0.28 && m5 > m3 + 0.08) t9RyAxis = 5;
  else if (m3 > 0.28 && m3 > m5 + 0.08) t9RyAxis = 3;
  const y = t9RyAxis === 3 ? a3 : a5;
  return Math.abs(y) <= 1.05 ? y : 0;
}

/**
 * Right stick in screen axes. +x is stick-right, +y is stick-up.
 * Standard pads use axes 2 and 3. Raw T-9 uses axis 2 and the latched Y axis.
 */
export function readRightStick(): { x: number; y: number } {
  const pads = typeof navigator !== "undefined" ? navigator.getGamepads?.() : null;
  if (!pads) return { x: 0, y: 0 };
  let best = { x: 0, y: 0 };
  let bestMag = 0;
  for (const pad of pads) {
    if (!pad || pad.connected === false) continue;
    const rawT9 = isT9Family(pad) && pad.mapping !== "standard";
    if (!rawT9 && pad.mapping !== "standard") continue;
    const stick = rawT9
      ? radialDeadzone(pad.axes[2] || 0, -t9RightStickY(pad), 0.22)
      : radialDeadzone(pad.axes[2] || 0, -(pad.axes[3] || 0), 0.22);
    const mag = Math.hypot(stick.x, stick.y);
    if (mag > bestMag) {
      best = stick;
      bestMag = mag;
    }
  }
  return best;
}

/**
 * Pause-only camera zoom. +1 is zoom in (RT), -1 is zoom out (LT).
 * Standard triggers are buttons 6 and 7. Raw T-9 triggers are buttons 8 and 9.
 */
export function readTriggerZoom(): number {
  const pads = typeof navigator !== "undefined" ? navigator.getGamepads?.() : null;
  if (!pads) return 0;
  let zoom = 0;
  for (const pad of pads) {
    if (!pad || pad.connected === false) continue;
    const raw = isT9Family(pad) && pad.mapping !== "standard";
    const lt = raw ? 8 : 6;
    const rt = raw ? 9 : 7;
    if (padPressed(pad, rt)) zoom += 1;
    if (padPressed(pad, lt)) zoom -= 1;
  }
  if (zoom > 1) return 1;
  if (zoom < -1) return -1;
  return zoom;
}

/** True while R3 (right-stick click) is held on any connected pad. */
export function readRightStickClick(): boolean {
  const pads = typeof navigator !== "undefined" ? navigator.getGamepads?.() : null;
  if (!pads) return false;
  for (const pad of pads) {
    if (!pad || pad.connected === false) continue;
    const button = pad.buttons[r3Index(pad)];
    if (button && (button.pressed || button.value > 0.4)) return true;
  }
  return false;
}

/**
 * Held state of a raw gamepad button. Index 0 is A / Cross.
 * Live sprint still reads this through `readBasicPad`. After the whistle,
 * SimView uses a rising edge so a held sprint does not skip the result:
 * the next snap while the series is alive, and a new game once it is over.
 */
export function readPadButton(index: number): boolean {
  const pads = typeof navigator !== "undefined" ? navigator.getGamepads?.() : null;
  if (!pads) return false;
  for (const pad of pads) {
    if (!pad || pad.connected === false) continue;
    if (padPressed(pad, index)) return true;
  }
  return false;
}

/**
 * Basic stiff-arm. Buttons 6 and 7 are LT/RT on a standard pad.
 * Axes 2 and 5 are triggers only when the pad is not T-9 and not standard-mapped.
 * On those pads the same axes are the right stick.
 */
function padStiff(pad: Gamepad) {
  const analog = !isT9Family(pad) && pad.mapping !== "standard";
  return {
    stiffL: padPressed(pad, 6) || (analog && (pad.axes[2] || 0) > 0.4),
    stiffR: padPressed(pad, 7) || (analog && (pad.axes[5] || 0) > 0.4),
  };
}

/** Standard-layout left stick and d-pad. Prefers a pad that is already moving. */
export function readBasicPad(): PadAxes | null {
  const pads = typeof navigator !== "undefined" ? navigator.getGamepads?.() : null;
  if (!pads) return null;
  let fallback: Gamepad | null = null;
  let live: Gamepad | null = null;
  for (const pad of pads) {
    if (!pad || pad.connected === false) continue;
    if (!fallback) fallback = pad;
    const moving =
      Math.abs(pad.axes[0] || 0) > STICK_DEAD ||
      Math.abs(pad.axes[1] || 0) > STICK_DEAD ||
      padPressed(pad, 3) ||
      padPressed(pad, 4) ||
      padPressed(pad, 5) ||
      padPressed(pad, 6) ||
      padPressed(pad, 7) ||
      padPressed(pad, 12) ||
      padPressed(pad, 13) ||
      padPressed(pad, 14) ||
      padPressed(pad, 15) ||
      padPressed(pad, 0) ||
      padPressed(pad, 1) ||
      padPressed(pad, 2);
    if (moving) {
      live = pad;
      break;
    }
  }
  const pad = live ?? fallback;
  if (!pad) return null;
  const stiff = padStiff(pad);
  const up = padPressed(pad, 12);
  const down = padPressed(pad, 13);
  const left = padPressed(pad, 14);
  const right = padPressed(pad, 15);
  return {
    x: pad.axes[0] || 0,
    y: pad.axes[1] || 0,
    up,
    down,
    left,
    right,
    jukeL: padPressed(pad, 4),
    jukeR: padPressed(pad, 5),
    stiffL: stiff.stiffL,
    stiffR: stiff.stiffR,
    truck: padPressed(pad, 3),
    shakeL: left && !right && !up && !down,
    shakeR: right && !left && !up && !down,
    deadL: down && left && !right,
    deadR: down && right && !left,
    spin: padPressed(pad, 1),
    sprint: padPressed(pad, 0),
    dive: padPressed(pad, 2),
  };
}

/**
 * Independent-mode blocker stick, in screen axes. +y is screen up.
 * U/B/K/O are up/left/down/right. A standard pad's right stick replaces the keys.
 * Wings mode does not read this. The carrier stick is unchanged.
 */
/**
 * Classic stiff-arm. Button 8 is Select/View. Button 9 is Start/Menu.
 * Triggers stay free so the right stick can steer a blocker.
 */
export function readClassicStiff(): { left: boolean; right: boolean } {
  const pads = typeof navigator !== "undefined" ? navigator.getGamepads?.() : null;
  if (!pads) return { left: false, right: false };
  for (const pad of pads) {
    if (!pad || pad.connected === false) continue;
    const left = pad.buttons[8];
    const right = pad.buttons[9];
    const held = (button: GamepadButton | undefined) => !!(button && (button.pressed || button.value > 0.4));
    if (held(left) || held(right)) return { left: held(left), right: held(right) };
  }
  return { left: false, right: false };
}

export function readBlockerStick(keys: ReadonlySet<string>): { x: number; y: number } {
  let x = (keys.has("KeyO") ? 1 : 0) - (keys.has("KeyB") ? 1 : 0);
  let y = (keys.has("KeyU") ? 1 : 0) - (keys.has("KeyK") ? 1 : 0);
  const pads = typeof navigator !== "undefined" ? navigator.getGamepads?.() : null;
  if (pads) {
    for (const pad of pads) {
      if (!pad || pad.connected === false || pad.mapping !== "standard") continue;
      const stick = radialDeadzone(pad.axes[2] || 0, -(pad.axes[3] || 0));
      if (stick.x !== 0 || stick.y !== 0) return stick;
    }
  }
  const mag = Math.hypot(x, y);
  if (mag > 1) return { x: x / mag, y: y / mag };
  return { x, y };
}

export function isMoveCode(code: string) {
  return MOVE_CODES.has(code) || ACTION_CODES.has(code);
}
