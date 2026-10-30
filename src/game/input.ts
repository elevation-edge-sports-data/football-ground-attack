import type { Input } from "./sim";

/**
 * Basic profile, movement only. Same field axes as the canvas game:
 * W / Up and stick-up are north, D / Right and stick-right are the right sideline.
 * A live left stick replaces the keys. The d-pad adds on top, then the sim clamps.
 */
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

const STICK_DEAD = 0.18;

export type PadAxes = {
  /** Raw left stick. +x is right. Browser +y is down. */
  x: number;
  y: number;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
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
    let dx = (pad.right ? 1 : 0) - (pad.left ? 1 : 0);
    let dy = (pad.up ? 1 : 0) - (pad.down ? 1 : 0);
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
  return { x, yard };
}

function padPressed(pad: Gamepad, index: number) {
  const button = pad.buttons[index];
  return !!(button && (button.pressed || button.value > 0.4));
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
      padPressed(pad, 12) ||
      padPressed(pad, 13) ||
      padPressed(pad, 14) ||
      padPressed(pad, 15);
    if (moving) {
      live = pad;
      break;
    }
  }
  const pad = live ?? fallback;
  if (!pad) return null;
  return {
    x: pad.axes[0] || 0,
    y: pad.axes[1] || 0,
    up: padPressed(pad, 12),
    down: padPressed(pad, 13),
    left: padPressed(pad, 14),
    right: padPressed(pad, 15),
  };
}

export function isMoveCode(code: string) {
  return MOVE_CODES.has(code);
}
