import { FIELD, SOUTH_BACK, NORTH_BACK, clamp } from "../field/spec";

/** Yards per second. A sprint, so a few seconds of input crosses the formation. */
const SPEED = 8.5;
const BALL_AHEAD = 0.22;
const BALL_RIGHT = 0.4;
/** Carry height in world units, at the right hand. */
export const BALL_CARRY_Y = 0.95;

export const INITIAL_LOS = 25;

export type Team = "off" | "def";

export type Player = {
  id: string;
  team: Team;
  role: string;
  x: number;
  yard: number;
  /** Unit direction on the field. +facingX is the right sideline, +facingYard is north. */
  facingX: number;
  facingYard: number;
  controlled: boolean;
};

export type Sim = {
  players: Player[];
  ballX: number;
  ballYard: number;
  /** Yard line of the line of scrimmage. Offense is south of it. */
  los: number;
};

export type Input = {
  /** -1 toward the left sideline, +1 toward the right. Stick values stay inside that range. */
  x: number;
  /** -1 south, +1 north. */
  yard: number;
};

function player(
  id: string,
  team: Team,
  role: string,
  x: number,
  yard: number,
  controlled = false,
): Player {
  const facingYard = team === "def" ? -1 : 1;
  return { id, team, role, x, yard, facingX: 0, facingYard, controlled };
}

export function createSim(): Sim {
  const mid = FIELD.width * 0.5;
  const los = INITIAL_LOS;
  const qb = player("qb", "off", "QB", mid, los - 1.8, true);
  const sim: Sim = {
    los,
    ballX: qb.x,
    ballYard: qb.yard,
    players: [
      player("ol-l", "off", "OL", mid - 2.3, los - 0.5),
      player("ol-r", "off", "OL", mid + 2.3, los - 0.5),
      qb,
      player("dl-l", "def", "DL", mid - 1.6, los + 1.2),
      player("dl-r", "def", "DL", mid + 1.6, los + 1.2),
      player("lb", "def", "LB", mid, los + 4.2),
    ],
  };
  placeBall(sim, qb);
  return sim;
}

export function controlledPlayer(sim: Sim) {
  return sim.players.find((p) => p.controlled) ?? null;
}

function placeBall(sim: Sim, carrier: Player) {
  // Field right of forward (facingX, facingYard). North → +X. Matches forward × up in world.
  const rightX = carrier.facingYard;
  const rightYard = -carrier.facingX;
  sim.ballX = clamp(carrier.x + carrier.facingX * BALL_AHEAD + rightX * BALL_RIGHT, 0, FIELD.width);
  sim.ballYard = clamp(
    carrier.yard + carrier.facingYard * BALL_AHEAD + rightYard * BALL_RIGHT,
    SOUTH_BACK,
    NORTH_BACK,
  );
}

/** About a shoulder width. Two players closer than twice this get pushed apart. */
const BODY_RADIUS = 0.36;

function separate(sim: Sim) {
  const minDist = BODY_RADIUS * 2;
  const players = sim.players;
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const a = players[i];
        const b = players[j];
        let dx = b.x - a.x;
        let dy = b.yard - a.yard;
        let dist = Math.hypot(dx, dy);
        if (dist >= minDist) continue;
        if (dist < 1e-6) {
          dx = 1;
          dy = 0;
          dist = 1;
        }
        const push = (minDist - dist) * 0.5;
        const nx = dx / dist;
        const ny = dy / dist;
        a.x = clamp(a.x - nx * push, 0, FIELD.width);
        a.yard = clamp(a.yard - ny * push, SOUTH_BACK, NORTH_BACK);
        b.x = clamp(b.x + nx * push, 0, FIELD.width);
        b.yard = clamp(b.yard + ny * push, SOUTH_BACK, NORTH_BACK);
      }
    }
  }
}

/** Advance the controlled player, then keep bodies from overlapping. */
export function step(sim: Sim, input: Input, dt: number) {
  const carrier = controlledPlayer(sim);
  if (!carrier || dt <= 0) return;
  const bounded = Math.min(dt, 0.05);
  let mx = input.x;
  let my = input.yard;
  let mag = Math.hypot(mx, my);
  if (mag > 1) {
    mx /= mag;
    my /= mag;
    mag = 1;
  }
  if (mag > 0.001) {
    const ux = mx / mag;
    const uy = my / mag;
    carrier.x = clamp(carrier.x + ux * mag * SPEED * bounded, 0, FIELD.width);
    carrier.yard = clamp(carrier.yard + uy * mag * SPEED * bounded, SOUTH_BACK, NORTH_BACK);
    carrier.facingX = ux;
    carrier.facingYard = uy;
  }
  separate(sim);
  placeBall(sim, carrier);
}
