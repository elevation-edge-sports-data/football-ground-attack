/**
 * Presnap picture, after the roster is placed and the jobs are attached.
 * Call once. It is not part of `step` or `stepAssignments`.
 *
 * `applyPresnapLook` is the canvas alignment: scheme-specific depth and
 * width, then a nudge so bodies are not stacked on the line. Offense faces
 * north. Defense faces the offense.
 * `spreadInteriorDefense` then spaces non-wing defensive backs across a span
 * that grows with how many of them there are. Tackles and linebackers stay put.
 */
import { FIELD, clamp, hashHalf } from "../../field/spec";
import type { AssignedPlay, AssignedPlayer } from "./assign";
import { playSideSign } from "./plays";
import type { DefenseAssignment } from "./types";

const BODY_INSET = 1.5;
const WIDE_REF = 50;

function wideT(width: number): number {
  return clamp((width - WIDE_REF) / WIDE_REF, 0, 1);
}

function coverFrac(frac: number, width: number): number {
  const pull = wideT(width) * 0.44;
  return 0.5 + (frac - 0.5) * (1 - pull);
}

function bodyCap(): number {
  return FIELD.length + FIELD.endZone - BODY_INSET;
}

function radius(role: string): number {
  if (role === "OL" || role === "DT") return 0.95;
  if (role === "FB" || role === "TE") return 0.9;
  return 0.85;
}

function defenseOf(player: AssignedPlayer): DefenseAssignment | null {
  return player.assignment.kind === "defense" ? player.assignment : null;
}

function setLandmark(player: AssignedPlayer, x: number, yard: number) {
  const job = defenseOf(player);
  if (!job) return;
  job.x = x;
  job.yard = yard;
  job.stationX = x;
  job.stationYard = yard;
}

function plantDeep(player: AssignedPlayer, xFrac: number, yOff: number, rx: number, los: number, width: number) {
  const job = defenseOf(player);
  if (!job) return;
  player.x = clamp(width * coverFrac(xFrac, width), 3.2, width - 3.2);
  player.yard = los + yOff;
  job.job = "deep";
  job.zoneRx = rx;
  job.zoneRy = 5;
  job.zoneFollow = false;
  job.isSafety = true;
  job.isCorner = false;
  job.artCurve = false;
  setLandmark(player, player.x, player.yard + 1.6);
}

/** Inset that matches the old 2.2 yards on a wide field and shrinks on a narrow one. */
function tackleEdge(width: number) {
  return Math.min(2.2, Math.max(0.35, width * 0.08));
}

/**
 * Odd counts: the middle tackle is on the snap. Even counts: the two middle
 * tackles sit opposite each other. Gaps stay equal. A wide field already
 * does this. Unstack and the fixed sideline clamp do not.
 */
function tackleRowBroken(dts: readonly AssignedPlayer[], snap: number, width: number) {
  if (dts.length === 0) return false;
  const xs = dts.map((player) => player.x).sort((a, b) => a - b);
  const n = xs.length;
  const edge = tackleEdge(width);
  if (xs.some((x) => x < edge || x > width - edge)) return true;
  const mid = n % 2 === 1 ? xs[(n - 1) / 2]! : (xs[n / 2 - 1]! + xs[n / 2]!) / 2;
  if (Math.abs(mid - snap) > 0.75) return true;
  if (n === 1) return false;
  let minGap = Infinity;
  let maxGap = 0;
  for (let i = 1; i < n; i++) {
    const gap = xs[i]! - xs[i - 1]!;
    if (gap < minGap) minGap = gap;
    if (gap > maxGap) maxGap = gap;
  }
  return maxGap - minGap > 0.85;
}

/** Shrink offsets from the snap so a snap-centered row stays on the field. */
function fitTacklesToField(dts: readonly AssignedPlayer[], snap: number, width: number) {
  const edge = tackleEdge(width);
  const lo = edge;
  const hi = width - edge;
  if (!(hi > lo)) return;
  let scale = 1;
  for (const player of dts) {
    const off = player.x - snap;
    if (off < -1e-6 && snap + off < lo) {
      const next = (lo - snap) / off;
      if (next < scale) scale = next;
    } else if (off > 1e-6 && snap + off > hi) {
      const next = (hi - snap) / off;
      if (next < scale) scale = next;
    }
  }
  if (!(scale > 0) || !(scale < 1)) return;
  for (const player of dts) player.x = snap + (player.x - snap) * scale;
}

/**
 * 1–2 DBs stand 8 yards off the ball. With 3–5, the outer pair is at 3 yards
 * (inside the 2–4 band) and every DB between them is at 8. Six or more stay put.
 */
function applyDbCountDepths(players: readonly AssignedPlayer[], los: number) {
  const dbs = players.filter((player) => player.role === "DB").sort((a, b) => a.x - b.x);
  const count = dbs.length;
  if (count < 1 || count > 5) return;
  if (count <= 2) {
    for (const player of dbs) player.yard = los + 8;
    return;
  }
  dbs.forEach((player, index) => {
    const outer = index === 0 || index === count - 1;
    player.yard = los + (outer ? 3 : 8);
  });
}

function unstack(list: AssignedPlayer[], minDist: number) {
  for (let pass = 0; pass < 10; pass++) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.yard - a.yard;
        const dist = Math.hypot(dx, dy);
        if (dist >= minDist || dist < 0.001) {
          if (dist < 0.001) b.x += 0.8;
          continue;
        }
        const push = (minDist - dist) * 0.52;
        const nx = dx / dist;
        const ny = dy / dist;
        a.x -= nx * push * 0.85;
        b.x += nx * push * 0.85;
        a.yard -= ny * push * 0.28;
        b.yard += ny * push * 0.28;
      }
    }
  }
}

function seatDb(player: AssignedPlayer, x: number) {
  player.x = x;
  const job = defenseOf(player);
  if (!job) return;
  job.x = x;
  job.stationX = x;
}

/**
 * Space non-wing defensive backs across a span that grows with their count.
 * Four backs keep the outside spots of a three-back row and stand evenly between them.
 * Wings, tackles, and linebackers keep the X they already have, so DT and LB
 * counts cannot slide the backs, and DB or DT counts cannot slide the backers.
 * Landmark X follows the body. Yards do not change.
 */
export function spreadInteriorDefense(assigned: AssignedPlay, width = FIELD.width) {
  const dbs = assigned.players.filter((player) => player.role === "DB").sort((a, b) => a.x - b.x);
  // Four backs keep the outside spots a three-back row already uses, and fill the span evenly.
  if (dbs.length === 4) {
    const span = Math.min(width * 0.52, 11.5 + 3 * 3.7);
    const edge = width * 0.5 - span / 2;
    const left = clamp(edge, 9.2, width - 9.2);
    const right = clamp(edge + span, 9.2, width - 9.2);
    dbs.forEach((player, index) => {
      seatDb(player, left + (index / 3) * (right - left));
    });
    return;
  }
  const wings = new Set<AssignedPlayer>();
  const wingCount = dbs.length >= 6 ? 4 : dbs.length >= 4 ? 2 : 0;
  for (let i = 0; i < Math.floor(wingCount / 2); i++) {
    const left = dbs[i];
    const right = dbs[dbs.length - 1 - i];
    if (left) wings.add(left);
    if (right) wings.add(right);
  }
  const box = dbs.filter((player) => !wings.has(player));
  if (box.length < 3) return;
  const span = Math.min(width * 0.52, 11.5 + box.length * 3.7);
  const left = width * 0.5 - span / 2;
  box.forEach((player, index) => {
    const t = box.length <= 1 ? 0.5 : index / (box.length - 1);
    seatDb(player, clamp(left + t * span, 9.2, width - 9.2));
  });
}

/**
 * Canvas presnap alignment for the called scheme, then the interior spread.
 * Offense faces north. Defense faces south, toward the offense.
 */
export function applyPresnapLook(assigned: AssignedPlay, los: number, width = FIELD.width) {
  const snap = assigned.snapX;
  const mid = width * 0.5;
  const side = playSideSign(assigned.play, false);
  const cap = bodyCap();
  const dbs = assigned.players.filter((player) => player.role === "DB").sort((a, b) => a.x - b.x);
  const lbs = assigned.players.filter((player) => player.role === "LB").sort((a, b) => a.x - b.x);
  const dts = assigned.players.filter((player) => player.role === "DT").sort((a, b) => a.x - b.x);
  const scheme = assigned.scheme.id;

  if (scheme === "cover4Quarters" || scheme === "goalLine") {
    const fracs = dbs.length === 2 ? [0.375, 0.625] : [0.125, 0.375, 0.625, 0.875];
    const deepY = scheme === "goalLine" ? 10.4 : 11.6;
    dbs.slice(0, fracs.length).forEach((player, index) => {
      const frac = fracs[index];
      if (frac === undefined) return;
      plantDeep(player, frac, deepY, width * 0.16, los, width);
    });
    dbs.slice(fracs.length).forEach((player, index) => {
      player.x = snap + (index % 2 === 0 ? -1 : 1) * (4.2 + index);
      player.yard = los + 4.6 + index * 0.6;
      const job = defenseOf(player);
      if (!job) return;
      if (job.job === "deep") job.job = "curl";
      job.isSafety = false;
      setLandmark(player, player.x, los + 5.2);
    });
    if (scheme === "cover4Quarters") {
      for (const player of lbs) {
        const job = defenseOf(player);
        if (!job || job.job !== "blitz") continue;
        const gap = Math.sign(player.x - snap) || side;
        job.x = clamp(snap + gap * 1.35, snap - 3, snap + 3);
        job.yard = los - 0.25;
        job.stationX = job.x;
        job.stationYard = job.yard;
        job.artCurve = false;
        job.stutter = false;
        // Two linebackers already sit a hash gap apart. This clamp would pull them inside the hashes.
        if (lbs.length !== 2) player.x = clamp(player.x, snap - 5.4, snap + 5.4);
        player.yard = los + 4.6;
      }
    }
  } else if (scheme === "prevent") {
    const fracs = dbs.length === 2 ? [0.375, 0.625] : [0.1, 0.3, 0.5, 0.7, 0.9];
    dbs.slice(0, fracs.length).forEach((player, index) => {
      const frac = fracs[index];
      if (frac === undefined) return;
      plantDeep(player, frac, 12.2, width * 0.14, los, width);
    });
    for (const player of dbs.slice(fracs.length)) {
      player.x = mid + 6.2;
      player.yard = los + 6.6;
      const job = defenseOf(player);
      if (!job) continue;
      job.job = "curl";
      job.isSafety = false;
      job.isCorner = false;
      job.zoneFollow = false;
      setLandmark(player, player.x, player.yard + 0.4);
    }
  } else if (scheme === "tight") {
    const keep = new Set<AssignedPlayer>();
    const outerL = dbs[0];
    const outerR = dbs[dbs.length - 1];
    if (outerL) keep.add(outerL);
    if (outerR) keep.add(outerR);
    dbs.forEach((player, index, all) => {
      if (keep.has(player)) return;
      const t = all.length <= 1 ? 0 : index / (all.length - 1) - 0.5;
      player.x = mid + t * Math.min(width * 0.52, 16);
    });
    lbs.forEach((player, index, all) => {
      const t = all.length <= 1 ? 0 : index / (all.length - 1) - 0.5;
      // Two linebackers use the hash gap, centered on the snap. Wider counts keep the Bear span.
      const span = all.length === 2 ? hashHalf(width) * 2 : Math.min(width * 0.48, 14.5);
      player.x = snap + t * span;
      player.yard = los + 4.6;
    });
    const ols = assigned.players.filter((player) => player.role === "OL").sort((a, b) => a.x - b.x);
    dts.forEach((player, index, all) => {
      if (ols.length >= 2) {
        const gap = Math.min(index + 1, ols.length - 1);
        const left = ols[gap - 1];
        const right = ols[gap];
        if (left && right) player.x = (left.x + right.x) / 2;
      } else {
        player.x = snap + (index - (all.length - 1) / 2) * 3.15;
      }
      player.yard = los + 2.85;
    });
  } else if (scheme === "wide") {
    const left = dbs[0];
    const right = dbs[dbs.length - 1];
    if (dbs.length >= 3 && left && right && left !== right) {
      left.x = clamp(left.x - 2.6, 2.4, snap - 7);
      right.x = clamp(right.x + 2.6, snap + 7, width - 2.4);
      left.yard += 2.5;
      right.yard += 2.5;
      const leftJob = defenseOf(left);
      const rightJob = defenseOf(right);
      if (leftJob?.job === "spy") {
        leftJob.stutterX = left.x + Math.min(2.2, Math.max(1.4, (mid - left.x) * 0.22));
        leftJob.stutterYard = left.yard - 1.1;
        leftJob.x = left.x + Math.min(3.2, Math.max(2, (mid - left.x) * 0.28));
        leftJob.yard = left.yard + 2.1;
        leftJob.stationX = leftJob.x;
        leftJob.stationYard = leftJob.yard;
        leftJob.zoneRx = 1.55;
        leftJob.zoneRy = 1.45;
        leftJob.artCurve = true;
        leftJob.fakeBlitz = true;
      } else if (leftJob) {
        leftJob.x = left.x;
        leftJob.yard = left.yard + 0.8;
        leftJob.stationX = leftJob.x;
        leftJob.stationYard = leftJob.yard;
      }
      if (rightJob) {
        rightJob.x = right.x;
        rightJob.yard = right.yard + 0.8;
        rightJob.stationX = rightJob.x;
        rightJob.stationYard = rightJob.yard;
      }
    }
    const inner = lbs.slice(1, Math.max(1, lbs.length - 1));
    const bump = inner.length >= 2 ? inner.slice(0, 2) : lbs.slice(0, 2);
    for (const player of bump) {
      player.yard = Math.min(los + 5, Math.max(los + 2, player.yard + 2.5));
      const job = defenseOf(player);
      if (job && job.job !== "blitz") {
        job.yard = Math.max(job.yard, player.yard);
        job.stationYard = job.yard;
      }
    }
  } else if (scheme === "overloadBlitz") {
    if (dbs.length <= 2) {
      dbs.forEach((player, index) => {
        player.x = mid + (dbs.length === 1 ? 0 : index === 0 ? -2.55 : 2.55);
        player.yard = los + 11.3;
        const job = defenseOf(player);
        if (!job) return;
        job.job = "deep";
        job.isSafety = true;
        job.isCorner = false;
        job.zoneFollow = false;
        setLandmark(player, player.x, player.yard + 1.4);
      });
    } else {
      const corners = dbs.length >= 2 ? [dbs[0], dbs[dbs.length - 1]] : [];
      const rest = dbs.filter((player) => !corners.includes(player)).sort((a, b) => a.x - b.x);
      const first = rest[0];
      const second = rest[1];
      if (first && second) {
        first.x = mid - 2.55;
        second.x = mid + 2.55;
        first.yard = los + 11.3;
        second.yard = los + 11.3;
        for (const player of [first, second]) {
          const job = defenseOf(player);
          if (!job) continue;
          job.job = "deep";
          job.isSafety = true;
          job.zoneFollow = false;
          setLandmark(player, player.x, player.yard + 1.4);
        }
      }
    }
  }

  // Two linebackers keep the hash split. Unstack and the blocker nudge do not walk them off it.
  const pairX = new Map<string, number>();
  if (lbs.length === 2) {
    for (const player of lbs) pairX.set(player.id, player.x);
  }

  const defenders = assigned.players.filter((player) => player.team === "def");
  // The quarterback stays on his snap spot. He is not in this nudge, so 0 QB and 1 QB
  // keep the same OL/TE row and the same tackle alignment.
  const blockers = assigned.players.filter((player) => player.role === "OL" || player.role === "TE" || player.role === "FB");
  const tackleX = new Map<string, number>();
  for (const player of defenders) {
    if (player.role === "DT") tackleX.set(player.id, player.x);
  }
  // Each front group separates only from itself, so one count cannot shove another.
  // On a narrow field the tackle separation is what pulls them off the snap, so it is undone below.
  unstack(defenders.filter((player) => player.role === "DT"), 2.05);
  unstack(defenders.filter((player) => player.role === "LB"), 2.05);
  unstack(defenders.filter((player) => player.role === "DB"), 2.05);
  // Slotted fullbacks keep the gap slots. The narrow line gap is 1.625, so this
  // stays under it and does not spread a legal row back out.
  unstack(
    blockers.filter((player) => player.role !== "FB"),
    1.2,
  );
  const stackedFullbacks = blockers.filter((player) => player.role === "FB");
  if (stackedFullbacks.length > 4) unstack(stackedFullbacks, 1.55);
  for (const defender of defenders) {
    for (const blocker of blockers) {
      // The fourth fullback stands 1.5 yards off the ball. He does not push the front off its spots.
      if (blocker.role === "FB" && blocker.yard > los - 2) continue;
      const gap = radius(defender.role) + radius(blocker.role) + 0.25;
      const dx = defender.x - blocker.x;
      const dy = defender.yard - blocker.yard;
      const dist = Math.hypot(dx, dy);
      if (dist < gap && dist > 0.01) {
        const push = gap - dist;
        defender.yard += push * 0.7 + 0.35;
        defender.x += Math.sign(dx || defender.x - snap) * push * 0.45;
      }
    }
  }
  for (const defender of defenders) {
    defender.x = clamp(defender.x, 2.2, width - 2.2);
    const paired = pairX.get(defender.id);
    if (paired != null) defender.x = paired;
    let yardFloor = los + 1.15;
    let yardCap = cap;
    if (defender.role === "DT") {
      yardFloor = los + 0.05;
      yardCap = Math.min(cap, los + 0.99);
    } else if (defender.role === "LB") {
      yardCap = Math.min(cap, los + 5);
      yardFloor = Math.min(los + 2, yardCap);
    }
    defender.yard = clamp(defender.yard, yardFloor, yardCap);
    const job = defenseOf(defender);
    if (job && Math.abs(job.x - defender.x) < 1.4) {
      job.x = defender.x;
      job.stationX = defender.x;
    }
  }
  const tackles = defenders.filter((player) => player.role === "DT");
  if (tackleRowBroken(tackles, snap, width)) {
    const clampedX = new Map(tackles.map((player) => [player.id, player.x]));
    for (const player of tackles) {
      const x = tackleX.get(player.id);
      if (x != null) player.x = x;
    }
    fitTacklesToField(tackles, snap, width);
    for (const player of tackles) {
      const job = defenseOf(player);
      const clamped = clampedX.get(player.id);
      if (job && clamped != null && Math.abs(job.x - clamped) < 1.4) {
        job.x = player.x;
        job.stationX = player.x;
      }
    }
  }
  const looked = assigned.players.filter((player) => player.role === "DB").sort((a, b) => a.x - b.x);
  const only = looked[0];
  const second = looked[1];
  if (looked.length === 1 && only) plantDeep(only, 0.5, 11.4, width * 0.22, los, width);
  else if (looked.length === 2 && only && second) {
    plantDeep(only, 0.375, 11.6, width * 0.18, los, width);
    plantDeep(second, 0.625, 11.6, width * 0.18, los, width);
  }

  spreadInteriorDefense(assigned, width);
  applyDbCountDepths(assigned.players, los);

  for (const player of assigned.players) {
    player.facingX = 0;
    player.facingYard = player.team === "def" ? -1 : 1;
  }
}
