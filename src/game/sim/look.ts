/**
 * Presnap picture, after the roster is placed and the jobs are attached.
 * Call once. It is not part of `step` or `stepAssignments`.
 *
 * `applyPresnapLook` is the canvas alignment: scheme-specific depth and
 * width, then a nudge so bodies are not stacked on the line. Offense faces
 * north. Defense faces the offense.
 * `spreadInteriorDefense` then spaces the interior (everyone who is not a
 * wide DB) across a span that grows with field width.
 */
import { FIELD, clamp } from "../../field/spec";
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

/**
 * Space interior defenders across a span that grows with the field.
 * The outer DBs stay wings. Everyone else, including tackles and linebackers,
 * is the box. Landmark X follows the body. Yards do not change.
 */
export function spreadInteriorDefense(assigned: AssignedPlay, width = FIELD.width) {
  const dbs = assigned.players.filter((player) => player.role === "DB").sort((a, b) => a.x - b.x);
  const wings = new Set<AssignedPlayer>();
  const wingCount = dbs.length >= 6 ? 4 : dbs.length >= 4 ? 2 : 0;
  for (let i = 0; i < Math.floor(wingCount / 2); i++) {
    const left = dbs[i];
    const right = dbs[dbs.length - 1 - i];
    if (left) wings.add(left);
    if (right) wings.add(right);
  }
  const box = assigned.players.filter((player) => player.team === "def" && !wings.has(player)).sort((a, b) => a.x - b.x);
  if (box.length < 3) return;
  const span = Math.min(width * 0.52, 11.5 + box.length * 3.7);
  const left = width * 0.5 - span / 2;
  box.forEach((player, index) => {
    const t = box.length <= 1 ? 0.5 : index / (box.length - 1);
    player.x = clamp(left + t * span, 9.2, width - 9.2);
    const job = defenseOf(player);
    if (job) {
      job.x = player.x;
      job.stationX = player.x;
    }
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
        player.x = clamp(player.x, snap - 5.4, snap + 5.4);
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
      player.x = snap + t * Math.min(width * 0.48, 14.5);
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
  } else if (scheme === "wide" && dbs.length >= 3) {
    const left = dbs[0];
    const right = dbs[dbs.length - 1];
    if (left && right) {
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
      player.yard += 2.5;
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

  const defenders = assigned.players.filter((player) => player.team === "def");
  const blockers = assigned.players.filter((player) => player.role === "OL" || player.role === "TE" || player.role === "FB" || player.role === "QB");
  unstack(defenders, 2.05);
  unstack(blockers, 1.55);
  for (const defender of defenders) {
    for (const blocker of blockers) {
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
    defender.yard = clamp(defender.yard, los + 1.15, cap);
    const job = defenseOf(defender);
    if (job && Math.abs(job.x - defender.x) < 1.4) {
      job.x = defender.x;
      job.stationX = defender.x;
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

  for (const player of assigned.players) {
    player.facingX = 0;
    player.facingYard = player.team === "def" ? -1 : 1;
  }
}
