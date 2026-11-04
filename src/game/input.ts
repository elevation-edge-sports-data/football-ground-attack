import { carrierAction, type CarrierAction } from "./carrierPose";
import type { Input } from "./sim";

/**
 * Basic profile. Raw axes are screen directions: W / Up and stick-up are
 * toward the top of the view, D / Right and stick-right are screen-right.
 * SimView turns that vector with the camera before the sim treats it as field axes.
 * A live left stick replaces the keys. The d-pad adds movement on top.
 * Held specials: Q juke left, E juke right, Z stiff left, X stiff right,
 * V or Y truck, I hurdle, I+J hurdle left, I+L hurdle right, Space sprint, C dive.
 * D-pad Up hurdles, Up-left hurdles left, Up-right hurdles right.
 * Pad Y trucks, LB/RB juke, LT/RT stiff, A sprint, X dive.
 */
const T9_ID_RE = /1949.*0402|Vendor:\s*1949\s*Product:\s*0402|\bT-?9\b|Terios/i;
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

const ACTION_CODES = new Set(["KeyQ", "KeyE", "KeyZ", "KeyX", "KeyV", "KeyY", "KeyI", "KeyJ", "KeyL", "Space", "KeyC"]);

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
    // Up, Up-left, and Up-right are hurdle buttons. They do not steer.
    let dx = pad.up ? 0 : (pad.right ? 1 : 0) - (pad.left ? 1 : 0);
    let dy = pad.up ? 0 : (pad.up ? 1 : 0) - (pad.down ? 1 : 0);
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
      padPressed(pad, 2);
    if (moving) {
      live = pad;
      break;
    }
  }
  const pad = live ?? fallback;
  if (!pad) return null;
  const stiff = padStiff(pad);
  return {
    x: pad.axes[0] || 0,
    y: pad.axes[1] || 0,
    up: padPressed(pad, 12),
    down: padPressed(pad, 13),
    left: padPressed(pad, 14),
    right: padPressed(pad, 15),
    jukeL: padPressed(pad, 4),
    jukeR: padPressed(pad, 5),
    stiffL: stiff.stiffL,
    stiffR: stiff.stiffR,
    truck: padPressed(pad, 3),
    sprint: padPressed(pad, 0),
    dive: padPressed(pad, 2),
  };
}

export function isMoveCode(code: string) {
  return MOVE_CODES.has(code) || ACTION_CODES.has(code);
}
