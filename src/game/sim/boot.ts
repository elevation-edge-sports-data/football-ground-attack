/**
 * What the 3D view boots, and the short series that follows a tackle or a score.
 * The default is a full play. `?preview=1` keeps the six-player pose preview.
 */
import { FIELD, SPOT_YARD_MAX, SPOT_YARD_MIN, clamp, hashLeft, hashRight } from "../../field/spec";
import { createSim, type Player, type Sim } from "../sim";
import { attachAssignments, type AssignedPlay } from "./assign";
import { applyPresnapLook, spreadInteriorDefense } from "./look";
import { applyPresnapStances } from "./stance";
import { readPersonnel } from "./personnel";
import { createPlaySim, hashSnapX, placeEntitiesForNewPlay, sideYardToAbsolute, type PlacementCall } from "./place";
import { DEF_SCHEMES, OFF_PLAYS } from "./plays";
import { setReplayCamera } from "../replayCamera";
import { playDiagram, type PlayDiagram } from "../snapArt";

/** Canvas game mode starts at 2:00 and only runs while a play is live. */
export const GAME_CLOCK_SECONDS = 120;

/** Canvas game opening LOS. Blast and Quarters are the first authored calls. */
export const BOOT_PLAY = {
  los: 50,
  play: OFF_PLAYS[0]!,
  scheme: DEF_SCHEMES[0]!,
};

export type Scoreboard = {
  score: number;
  over: boolean;
  /** Touchdown, Gain, Loss, or No gain. Empty during a live play. */
  title: string;
  detail: string;
  playName: string;
  schemeName: string;
  /** True while the post-play scrub is showing recorded frames. */
  replay: boolean;
  /** Seconds left on the game clock. */
  clock: number;
  /** Situation for the snap in progress, or the next snap after a whistle. */
  downText: string;
  /** Fourth down failed. Further snaps are refused, same as a clock at 0:00. */
  seriesOver: boolean;
  /** Wings shares the carrier stick. Independent and Classic use the blocker stick. */
  profile: "wings" | "independent" | "classic";
  /** Live play is frozen. The camera can still orbit. Cleared on the next snap. */
  paused: boolean;
  /** Formation is armed and the lineup poses are up. Movement waits for the snap. */
  awaitSnap: boolean;
  /** Game is the opening mode. Practice hides the clock and calls the picked plays. */
  mode: "game" | "practice";
};

export type SessionMode = "game" | "practice";

export type PracticeUi = {
  mode: SessionMode;
  playIndex: number;
  schemeIndex: number;
  /** True while the field X is up and the spot has not been confirmed. */
  aiming: boolean;
  aimX: number;
  aimYard: number;
  diagram: PlayDiagram | null;
};

export type BallPoint = { x: number; yard: number };

let playIndex = 0;
let schemeIndex = 0;
let pendingSpot: { los: number; ballX: number; exact?: boolean } | null = null;
/** v10 practice opens at OPP 30, between the hashes. Game stays the default until the toggle. */
let sessionMode: SessionMode = "game";
let practicePlay = 0;
let practiceScheme = 0;
let practiceSpotX = FIELD.width * 0.5;
let practiceSpotYard = sideYardToAbsolute("opp", 30);
let practiceAiming = false;
let practiceAimX = practiceSpotX;
let practiceAimYard = practiceSpotYard;
let practiceSeeded = false;
/** Snap the live roster was built from. Practice does not overwrite the saved game spot. */
let lastSnap = { los: BOOT_PLAY.los, snapX: FIELD.width / 2 };
let stageSpot = { los: BOOT_PLAY.los, snapX: FIELD.width / 2, exact: true };
let stageDead = false;
let stageTitle = "";
let stageDetail = "";
let stageDownText = "1st & 10";

type GameHold = {
  clockLeft: number;
  down: number;
  toGo: number;
  seriesOver: boolean;
  pendingSpot: { los: number; ballX: number; exact?: boolean } | null;
  playIndex: number;
  schemeIndex: number;
  downText: string;
  over: boolean;
  title: string;
  detail: string;
  los: number;
  snapX: number;
  exact: boolean;
  /** The whistle already advanced the series. Returning arms that next snap. */
  armNext: boolean;
};

let gameHold: GameHold | null = null;
let practiceUi: PracticeUi = {
  mode: "game",
  playIndex: 0,
  schemeIndex: 0,
  aiming: false,
  aimX: practiceSpotX,
  aimYard: practiceSpotYard,
  diagram: null,
};
const practiceListeners = new Set<() => void>();
const stageListeners = new Set<() => void>();
let pendingStage: { sim: Sim; assigned: AssignedPlay; dead: boolean } | null = null;
let board: Scoreboard = {
  score: 0,
  over: false,
  title: "",
  detail: "",
  playName: BOOT_PLAY.play.name,
  schemeName: BOOT_PLAY.scheme.name,
  replay: false,
  clock: GAME_CLOCK_SECONDS,
  downText: "1st & 10",
  seriesOver: false,
  profile: "wings",
  paused: false,
  awaitSnap: false,
  mode: "game",
};
/** Remaining game time. The board copy updates when the displayed second changes. */
let clockLeft = GAME_CLOCK_SECONDS;
let down = 1;
let toGo = 10;
let seriesOver = false;
/** Yards to gain for the snap on the field. The banner can move ahead between snaps. */
let snappedToGo = 10;
const boardListeners = new Set<() => void>();
const nextListeners = new Set<() => void>();
const restartListeners = new Set<() => void>();
const replayListeners = new Set<() => void>();

function publish() {
  board = { ...board };
  for (const listener of boardListeners) listener();
}

export function previewRequested(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("preview") === "1";
}

export function subscribeBoard(listener: () => void) {
  boardListeners.add(listener);
  return () => boardListeners.delete(listener);
}

export function readBoard() {
  return board;
}

export function readMode(): SessionMode {
  return sessionMode;
}

export function subscribePractice(listener: () => void) {
  practiceListeners.add(listener);
  return () => practiceListeners.delete(listener);
}

export function readPractice() {
  return practiceUi;
}

function syncPractice(diagram = practiceUi.diagram) {
  practiceUi = {
    mode: sessionMode,
    playIndex: practicePlay,
    schemeIndex: practiceScheme,
    aiming: practiceAiming,
    aimX: practiceAimX,
    aimYard: practiceAimYard,
    diagram,
  };
  for (const listener of practiceListeners) listener();
}

function practicePlacement(): PlacementCall {
  return {
    los: practiceSpotYard,
    ballX: practiceSpotX,
    exactSnap: true,
    play: OFF_PLAYS[practicePlay]!,
    scheme: DEF_SCHEMES[practiceScheme]!,
  };
}

/** The view mounts this roster. One listener consumes it. */
export function onModeStage(listener: () => void) {
  stageListeners.add(listener);
  return () => {
    stageListeners.delete(listener);
  };
}

export function takeStage() {
  const next = pendingStage;
  pendingStage = null;
  return next;
}

function queueStage() {
  if (board.replay) setReplayCamera(false);
  pendingStage = stageForMode();
  for (const listener of [...stageListeners]) listener();
}

function stageForMode(): { sim: Sim; assigned: AssignedPlay; dead: boolean } | null {
  if (previewRequested()) return null;
  if (sessionMode === "practice") {
    return {
      ...buildPlay(practicePlacement()),
      dead: false,
    };
  }
  const built = buildPlay({
    los: stageSpot.los,
    ballX: stageSpot.snapX,
    exactSnap: stageSpot.exact,
    play: OFF_PLAYS[playIndex]!,
    scheme: DEF_SCHEMES[schemeIndex]!,
  });
  if (stageDead) {
    built.sim.playOver = true;
    board = {
      ...board,
      over: true,
      title: stageTitle,
      detail: stageDetail,
      downText: stageDownText,
      seriesOver,
      clock: clockLeft,
      awaitSnap: false,
    };
    publish();
  }
  return { ...built, dead: stageDead };
}

function wrapIndex(index: number, length: number) {
  if (length <= 0) return 0;
  return ((Math.round(index) % length) + length) % length;
}

/** Re-clicking the current mode does not restage. */
export function setSessionMode(next: SessionMode) {
  const mode: SessionMode = next === "practice" ? "practice" : "game";
  if (mode === sessionMode) return;
  if (mode !== "practice") practiceAiming = false;
  if (mode === "practice") {
    if (!practiceSeeded) {
      practicePlay = playIndex;
      practiceScheme = schemeIndex;
      practiceSeeded = true;
    }
    const continuing = board.over && pendingSpot != null && clockLeft > 0 && !seriesOver;
    gameHold = {
      clockLeft,
      down,
      toGo,
      seriesOver,
      pendingSpot,
      playIndex: continuing ? (playIndex + 1) % OFF_PLAYS.length : playIndex,
      schemeIndex: continuing ? (schemeIndex + 1) % DEF_SCHEMES.length : schemeIndex,
      downText: board.downText,
      over: board.over,
      title: board.title,
      detail: board.detail,
      los: continuing && pendingSpot ? pendingSpot.los : lastSnap.los,
      snapX: continuing && pendingSpot ? pendingSpot.ballX : lastSnap.snapX,
      exact: continuing && pendingSpot ? !!pendingSpot.exact : true,
      armNext: continuing,
    };
    stageDead = false;
  } else if (gameHold) {
    clockLeft = gameHold.clockLeft;
    down = gameHold.down;
    toGo = gameHold.toGo;
    seriesOver = gameHold.seriesOver;
    playIndex = gameHold.playIndex;
    schemeIndex = gameHold.schemeIndex;
    pendingSpot = gameHold.armNext ? null : gameHold.pendingSpot;
    stageSpot = { los: gameHold.los, snapX: gameHold.snapX, exact: gameHold.exact };
    stageDead = gameHold.over && !gameHold.armNext;
    stageTitle = gameHold.title;
    stageDetail = gameHold.detail;
    stageDownText = gameHold.downText;
    gameHold = null;
  }
  sessionMode = mode;
  queueStage();
}

/** Practice book pick. The same row restages, so a live rep can be reset. */
export function setPracticePlay(index: number) {
  if (!Number.isFinite(index)) return;
  practicePlay = wrapIndex(index, OFF_PLAYS.length);
  practiceSeeded = true;
  if (sessionMode === "practice") queueStage();
  else syncPractice();
}

export function setPracticeScheme(index: number) {
  if (!Number.isFinite(index)) return;
  practiceScheme = wrapIndex(index, DEF_SCHEMES.length);
  practiceSeeded = true;
  if (sessionMode === "practice") queueStage();
  else syncPractice();
}

/** True while a practice re-spot is waiting for a confirm. Orbit rotation stays off. */
export function practiceSpotAiming() {
  return practiceAiming;
}

/** Show the X at the current practice spot. Confirm applies it. */
export function beginPracticeRespot() {
  if (sessionMode !== "practice" || practiceAiming) return;
  practiceAiming = true;
  practiceAimX = practiceSpotX;
  practiceAimYard = practiceSpotYard;
  syncPractice();
}

/** Drag target. X stays between the hashes. Yard may sit just outside either goal line. */
export function movePracticeAim(x: number, yard: number) {
  if (!practiceAiming || !Number.isFinite(x) || !Number.isFinite(yard)) return;
  const nextX = clamp(x, hashLeft(), hashRight());
  const nextYard = clamp(yard, SPOT_YARD_MIN, SPOT_YARD_MAX);
  if (nextX === practiceAimX && nextYard === practiceAimYard) return;
  practiceAimX = nextX;
  practiceAimYard = nextYard;
  syncPractice();
}

/** The confirmed point is the ball spot for this snap and every practice snap after it. */
export function confirmPracticeRespot() {
  if (!practiceAiming) return;
  practiceAiming = false;
  practiceSpotX = practiceAimX;
  practiceSpotYard = practiceAimYard;
  if (sessionMode === "practice") queueStage();
  else syncPractice();
}

/** `119.2` is still `2:00`. The displayed second drops after a full second. */
export function formatClock(seconds: number): string {
  const shown = Math.ceil(Math.max(0, seconds) - 1e-6);
  const minutes = Math.floor(shown / 60);
  const secs = shown % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export function clockExpired() {
  return clockLeft <= 0;
}

export function seriesEnded() {
  return seriesOver;
}

/**
 * The whistle is in and another snap is not allowed.
 * That is a clock already at 0:00, or a turnover on downs.
 * A play still on the field is not over, even when the clock shows 0:00.
 */
export function gameEnded() {
  if (sessionMode === "practice") return false;
  return board.over && (clockLeft <= 0 || seriesOver);
}

function downName(value: number) {
  if (value === 1) return "1st";
  if (value === 2) return "2nd";
  if (value === 3) return "3rd";
  if (value === 4) return "4th";
  return `${value}th`;
}

/** Whole numbers stay whole. A fractional chain shows one decimal. */
function formatDistance(distance: number): string {
  const tenths = Math.round(distance * 10) / 10;
  if (Math.abs(tenths - Math.round(tenths)) < 1e-6) return String(Math.round(tenths));
  return tenths.toFixed(1);
}

/** "& Goal" only when the line to gain is on or past the goal line. */
function formatDown(value: number, distance: number, los: number) {
  const toGoal = 100 - los;
  if (toGoal <= distance) return `${downName(value)} & Goal`;
  return `${downName(value)} & ${formatDistance(distance)}`;
}

function freshToGo(los: number) {
  return Math.min(10, Math.max(1, 100 - los));
}

/** Keep the chain distance with the LOS that is actually on the field. */
function spotChains(los: number) {
  snappedToGo = toGo;
  if (los < FIELD.length && los + snappedToGo > FIELD.length) snappedToGo = FIELD.length - los;
}

/**
 * First-down yard for this line of scrimmage.
 * A fresh series is 10 yards ahead. Inside the 10 that yard is the goal line.
 * Returns null past the goal line or inside an end zone.
 */
export function readFirstDownYard(los: number): number | null {
  if (sessionMode === "practice") return null;
  if (los >= FIELD.length) return null;
  const yard = los + snappedToGo;
  if (yard <= los || yard > FIELD.length || yard <= 0) return null;
  return yard;
}

/**
 * Count down during a live play. No-ops once the clock is at 0:00.
 * Hitting 0:00 does not end the play or the game. The snap already in
 * progress runs until its own whistle. A new snap is refused after that.
 * Publishes when the banner second changes.
 */
export function tickClock(dt: number) {
  if (sessionMode === "practice" || clockLeft <= 0 || dt <= 0) return;
  const before = formatClock(clockLeft);
  clockLeft = Math.max(0, clockLeft - dt);
  if (formatClock(clockLeft) === before) return;
  board = { ...board, clock: clockLeft };
  publish();
}

export function onNextPlay(listener: () => void) {
  nextListeners.add(listener);
  return () => {
    nextListeners.delete(listener);
  };
}

export function askNextPlay() {
  for (const listener of nextListeners) listener();
}

export function onRestart(listener: () => void) {
  restartListeners.add(listener);
  return () => {
    restartListeners.delete(listener);
  };
}

/** Fresh game after the last play has ended and another snap is not allowed. */
export function askRestart() {
  for (const listener of restartListeners) listener();
}

export function onReplayToggle(listener: () => void) {
  replayListeners.add(listener);
  return () => {
    replayListeners.delete(listener);
  };
}

export function askReplay() {
  for (const listener of replayListeners) listener();
}

export function readProfile() {
  return board.profile;
}

export function toggleProfile() {
  const profile = board.profile === "wings" ? "independent" : board.profile === "independent" ? "classic" : "wings";
  board = { ...board, profile };
  publish();
}

export function readPaused() {
  return board.paused;
}

/** Freeze or resume the live play. Does not touch the clock rules, the score, or the down. */
export function setPaused(on: boolean) {
  if (board.paused === on) return;
  board = { ...board, paused: on };
  publish();
}

export function setReplayMode(on: boolean) {
  if (board.replay === on) return;
  board = { ...board, replay: on };
  setReplayCamera(on);
  publish();
}

/** Own 20 through opponent 20, every 5 yards. Canvas post-score random spot. */
function touchdownSpot(): number {
  const spots: number[] = [];
  for (let yard = 20; yard <= 80; yard += 5) spots.push(yard);
  return spots[Math.floor(Math.random() * spots.length)] ?? 50;
}

/** Practice keeps the score and the result line. It does not move the series or the next spot. */
function settlePracticePlay(yard: number, los: number, measure: number, ballSpot: boolean) {
  if (yard >= FIELD.length) {
    const gained = Math.max(0, Math.round(yard - los));
    board = {
      ...board,
      score: board.score + 100,
      over: true,
      title: "Touchdown",
      detail: `${gained} yards · +100`,
    };
    console.log(`Touchdown. ${gained} yards. Score ${board.score}.`);
    publish();
    return null;
  }
  const yards = clamp(Math.round(measure - los), -20, 100);
  let points = 0;
  if (yards > 0) points += yards;
  if (yards >= 10) points += 10;
  if (yards < 0) points -= 2;
  const score = Math.max(0, board.score + points);
  const title = ballSpot ? "Out of bounds" : yards > 0 ? "Gain" : yards < 0 ? "Loss" : "No gain";
  const yardsLabel = yards > 0 ? `Gain of ${yards}` : yards < 0 ? `Loss of ${Math.abs(yards)}` : "No gain";
  const pointsLabel = points > 0 ? `+${points}` : points < 0 ? `${points}` : "0";
  board = { ...board, score, over: true, title, detail: `${yardsLabel} · ${pointsLabel}` };
  console.log(`${board.detail}. Score ${board.score}.`);
  publish();
  return null;
}

/**
 * Yards from the LOS, points, and the next line of scrimmage.
 * A carrier at yard 100 scores. Otherwise the next spot is the downed ball.
 * `tip` is the furthest-downfield point of the football at the whistle.
 * That yard is not rounded. Points still use the rounded gain.
 * An out-of-bounds whistle keeps the tip's X. An in-bounds tip is hash-clamped.
 * A touchdown is 100 and does not also add the yards.
 */
export function settlePlay(sim: Sim, ballSpot = false, tip?: BallPoint): { los: number; ballX: number } | null {
  const carrier = sim.players.find((player) => player.controlled);
  const los = sim.los;
  const yard = carrier?.yard ?? los;
  const spotX = ballSpot ? sim.ballX : (carrier?.x ?? FIELD.width * 0.5);
  const measure = ballSpot ? sim.ballYard : yard;
  if (sessionMode === "practice") return settlePracticePlay(yard, los, measure, ballSpot);
  if (yard >= FIELD.length) {
    const gained = Math.max(0, Math.round(yard - los));
    board = {
      ...board,
      score: board.score + 100,
      over: true,
      title: "Touchdown",
      detail: `${gained} yards · +100`,
    };
    const nextLos = touchdownSpot();
    down = 1;
    toGo = freshToGo(nextLos);
    seriesOver = false;
    pendingSpot = { los: nextLos, ballX: FIELD.width * 0.5 };
    board = { ...board, downText: formatDown(down, toGo, nextLos), seriesOver: false };
    console.log(`Touchdown. ${gained} yards. Score ${board.score}.`);
    publish();
    return pendingSpot;
  }
  const tipX = tip?.x ?? spotX;
  const tipYard = tip?.yard ?? measure;
  const nextLos = clamp(tipYard, SPOT_YARD_MIN, SPOT_YARD_MAX);
  const exactGain = nextLos - los;
  const yards = clamp(Math.round(exactGain), -20, 100);
  let points = 0;
  if (yards > 0) points += yards;
  if (yards >= 10) points += 10;
  if (yards < 0) points -= 2;
  const score = Math.max(0, board.score + points);
  const title = ballSpot ? "Out of bounds" : yards > 0 ? "Gain" : yards < 0 ? "Loss" : "No gain";
  const yardsLabel = yards > 0 ? `Gain of ${yards}` : yards < 0 ? `Loss of ${Math.abs(yards)}` : "No gain";
  const pointsLabel = points > 0 ? `+${points}` : points < 0 ? `${points}` : "0";
  board = {
    ...board,
    score,
    over: true,
    title,
    detail: `${yardsLabel} · ${pointsLabel}`,
  };
  const madeFirst = exactGain >= toGo - 1e-3;
  const spotBallX = ballSpot ? tipX : hashSnapX(tipX, tipX <= 0.2 || tipX >= FIELD.width - 0.2);
  if (madeFirst) {
    down = 1;
    toGo = freshToGo(nextLos);
    seriesOver = false;
    pendingSpot = { los: nextLos, ballX: spotBallX, exact: ballSpot };
  } else {
    down += 1;
    if (down > 4) {
      seriesOver = true;
      pendingSpot = null;
      board = { ...board, title: "Turnover on downs", seriesOver: true, downText: formatDown(4, toGo, los) };
    } else {
      const remain = toGo - exactGain;
      const room = Math.max(0, FIELD.length - nextLos);
      toGo = Math.min(room, Math.max(0, remain));
      seriesOver = false;
      pendingSpot = { los: nextLos, ballX: spotBallX, exact: ballSpot };
      board = { ...board, seriesOver: false, downText: formatDown(down, toGo, nextLos) };
    }
  }
  if (!seriesOver) {
    board = { ...board, seriesOver: false, downText: formatDown(down, toGo, nextLos) };
  }
  console.log(`${board.detail}. ${board.downText}. Score ${board.score}.`);
  publish();
  return pendingSpot;
}

/** `ballSpot` is an out-of-bounds whistle. `tip` is the ball's downfield point. */
export function markPlayOver(sim: Sim, ballSpot = false, tip?: BallPoint) {
  if (board.over) return;
  settlePlay(sim, ballSpot, tip);
}

/**
 * Place, assign, look, and spread, then seat that roster on a play sim.
 * The carrier clocks come from `createPlaySim`. The looked bodies replace its roster.
 */
export function buildPlay(call: PlacementCall): { sim: Sim; assigned: AssignedPlay } {
  // Steppers apply here, so the live roster waits until the next snap.
  // A caller can still override one group.
  const lined: PlacementCall = { ...call, personnel: { ...readPersonnel(), ...(call.personnel ?? {}) } };
  const setup = placeEntitiesForNewPlay(lined);
  const assigned = attachAssignments(setup, lined);
  applyPresnapLook(assigned, setup.los);
  spreadInteriorDefense(assigned);
  applyPresnapStances(assigned.players);
  const sim = createPlaySim(lined);
  sim.players = assigned.players;
  sim.los = setup.los;
  sim.playOver = false;
  // The runner starts on one of the two carry poses. The roll is per snap.
  const stride = Math.random() < 0.5 ? 1 : 2;
  sim.strideType = stride;
  sim.pose = stride === 1 ? "carry 1" : "carry 2";
  spotChains(sim.los);
  const carrier = assigned.players.find((player) => player.controlled);
  if (carrier) seatBall(sim, carrier);
  lastSnap = { los: sim.los, snapX: assigned.snapX };
  syncPractice(playDiagram(assigned, sim.los, assigned.snapX));
  board = {
    ...board,
    over: false,
    title: "",
    detail: "",
    playName: assigned.play.name,
    schemeName: assigned.scheme.name,
    replay: false,
    clock: clockLeft,
    downText: board.downText,
    seriesOver,
    paused: false,
    awaitSnap: true,
    mode: sessionMode,
  };
  publish();
  return { sim, assigned };
}

/** The armed formation is now live. The banner drops the snap hint. */
export function markSnap() {
  if (!board.awaitSnap) return;
  board = { ...board, awaitSnap: false };
  for (const listener of boardListeners) listener();
}

export function bootFullPlay(): { sim: Sim; assigned: AssignedPlay } {
  playIndex = 0;
  schemeIndex = 0;
  pendingSpot = null;
  board = {
    score: 0,
    over: false,
    title: "",
    detail: "",
    playName: BOOT_PLAY.play.name,
    schemeName: BOOT_PLAY.scheme.name,
    replay: false,
    clock: GAME_CLOCK_SECONDS,
    downText: "1st & 10",
    seriesOver: false,
    profile: "wings",
    paused: false,
    awaitSnap: true,
    mode: sessionMode,
  };
  clockLeft = GAME_CLOCK_SECONDS;
  down = 1;
  toGo = 10;
  seriesOver = false;
  return buildPlay(BOOT_PLAY);
}

/**
 * Step to the next authored play and scheme, spotted from the last result.
 * Refused when the clock is already at 0:00, including a play that began
 * with time left and ran the clock out. That play is scored first.
 */
export function startNextPlay(): { sim: Sim; assigned: AssignedPlay } | null {
  if (sessionMode === "practice") {
    const built = buildPlay(practicePlacement());
    built.sim.playOver = false;
    console.log("Next snap ready.", {
      play: built.assigned.play.name,
      scheme: built.assigned.scheme.name,
      playOver: built.sim.playOver,
      players: built.sim.players.length,
      practice: true,
    });
    return built;
  }
  if (clockLeft <= 0 || seriesOver || !pendingSpot) {
    console.log("Next snap blocked.", { clockExpired: clockLeft <= 0, seriesOver, spot: pendingSpot });
    return null;
  }
  const spot = pendingSpot;
  const nextPlay = (playIndex + 1) % OFF_PLAYS.length;
  const nextScheme = (schemeIndex + 1) % DEF_SCHEMES.length;
  const built = buildPlay({
    los: spot.los,
    ballX: spot.ballX,
    exactSnap: spot.exact,
    play: OFF_PLAYS[nextPlay]!,
    scheme: DEF_SCHEMES[nextScheme]!,
  });
  pendingSpot = null;
  playIndex = nextPlay;
  schemeIndex = nextScheme;
  built.sim.playOver = false;
  console.log("Next snap ready.", {
    play: built.assigned.play.name,
    scheme: built.assigned.scheme.name,
    playOver: built.sim.playOver,
    players: built.sim.players.length,
  });
  return built;
}

/** Same right-hand offset `step` uses once the carrier is moving. */
function seatBall(sim: Sim, carrier: Player) {
  const rightX = carrier.facingYard;
  const rightYard = -carrier.facingX;
  sim.ballX = carrier.x + carrier.facingX * 0.22 + rightX * 0.4;
  sim.ballYard = carrier.yard + carrier.facingYard * 0.22 + rightYard * 0.4;
}

/** Where the opening camera should look. Preview stays on the quarterback at the 25. */
export function bootCamera(): { x: number; yard: number } {
  if (previewRequested()) {
    const preview = createSim();
    const lead = preview.players.find((player) => player.controlled);
    return { x: lead?.x ?? 37.5, yard: lead?.yard ?? 25 };
  }
  const { sim } = bootFullPlay();
  const lead = sim.players.find((player) => player.controlled);
  return { x: lead?.x ?? 37.5, yard: lead?.yard ?? 50 };
}
