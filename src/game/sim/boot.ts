/**
 * What the 3D view boots, and the short series that follows a tackle or a score.
 * The default is a full play. `?preview=1` keeps the six-player pose preview.
 */
import { FIELD, SPOT_YARD_MAX, SPOT_YARD_MIN, clamp, hashLeft, hashNearSide, hashRight } from "../../field/spec";
import { createSim, type Player, type Sim } from "../sim";
import { attachAssignments, type AssignedPlay } from "./assign";
import { applyPresnapLook, spreadInteriorDefense } from "./look";
import { applyPresnapStances } from "./stance";
import { readPersonnel } from "./personnel";
import { createPlaySim, hashSnapX, placeEntitiesForNewPlay, sideYardToAbsolute, type PlacementCall } from "./place";
import { DEF_SCHEMES, OFF_PLAYS } from "./plays";
import { readPrefs, writePrefs } from "../prefs";
import { setReplayCamera } from "../replayCamera";
import { playDiagram, type PlayDiagram } from "../snapArt";
import { consumeFirstContact, resetFirstContact } from "./contact";
import { consumeDefenseFinish, resetDefense, seatDefender } from "./defense";
import {
  downfieldDelta,
  flipAttackDirection,
  homeTwentyFive,
  orientLineup,
  readAttackNorth,
  safetySpotYard,
  setAttackNorth,
  setCameraNorth,
  yardsToGoal,
} from "./attack";

/** Four quarters. The banner quarter stays on the 4th; the clock still rolls all four. */
export const QUARTER_COUNT = 4;
/** Each quarter is 30 seconds and only runs while a play is live. */
export const QUARTER_SECONDS = 30;

/** Canvas game opening LOS. Blast and Quarters are the first authored calls. */
export const BOOT_PLAY = {
  los: 50,
  play: OFF_PLAYS[0]!,
  scheme: DEF_SCHEMES[0]!,
};

export type Scoreboard = {
  /** Offense. An offensive touchdown is 7. */
  youScore: number;
  /** Defense. A defensive touchdown is 8. */
  cpuScore: number;
  /** Sum of snap yardage. A loss reduces it. */
  totalYards: number;
  /** First downs only. A touchdown is not one. */
  firstDowns: number;
  /** Offensive touchdowns. */
  touchdowns: number;
  /** Sum of yards after the runner first touched a defender. */
  yac: number;
  over: boolean;
  /** Touchdown, Gain, Loss, or No gain. Empty during a live play. */
  title: string;
  detail: string;
  playName: string;
  schemeName: string;
  /** True while the post-play scrub is showing recorded frames. */
  replay: boolean;
  /** Seconds left in the current quarter. */
  clock: number;
  /** 1 through 4. The HUD reads this. Scores are not cleared when it changes. */
  quarter: number;
  /** Situation for the snap in progress, or the next snap after a whistle. */
  downText: string;
  /** Absolute yard of that snap. The banner shows it as a field yard line. */
  ballOn: number;
  /** True while the offense attacks north. The banner triangle points that way. */
  homePossession: boolean;
  /** Fourth down failed. Further snaps are refused, same as a clock at 0:00. */
  seriesOver: boolean;
  /** Wings shares the carrier stick. Independent and Classic use the blocker stick. */
  profile: "wings" | "independent" | "classic";
  /** Live play is frozen. The camera can still orbit. Cleared on the next snap. */
  paused: boolean;
  /** Formation is armed and the lineup poses are up. Movement waits for the snap. */
  awaitSnap: boolean;
  /** Drill, practice, or game. Drill uses the game rules. A fresh load rolls one, then a saved choice replaces it. */
  mode: "drill" | "practice" | "game";
  /** Controlled side. A fresh load rolls one, then a saved choice replaces it. */
  side: "off" | "def";
};

export type SessionMode = "drill" | "practice" | "game";

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
const SESSION_MODES: SessionMode[] = ["drill", "practice", "game"];

function rollSessionMode(): SessionMode {
  return SESSION_MODES[Math.floor(Math.random() * SESSION_MODES.length)] ?? "game";
}

/** Old saves used game or practice. Anything else keeps the fresh roll. */
function savedSessionMode(value: unknown): SessionMode | null {
  if (value === "drill" || value === "practice" || value === "game") return value;
  return null;
}

function rollPlaySide(): "off" | "def" {
  return Math.random() < 0.5 ? "def" : "off";
}

/** v10 practice opens at OPP 30, between the hashes. A fresh load rolls the mode, then saved prefs apply. */
let sessionMode: SessionMode = rollSessionMode();
/** Rolled before the saved side, so a cleared store still varies. */
let openingSide: "off" | "def" = rollPlaySide();
let openingProfile: Scoreboard["profile"] = "wings";
{
  const saved = readPrefs();
  const savedMode = savedSessionMode(saved.mode);
  if (savedMode) sessionMode = savedMode;
  if (saved.side === "off" || saved.side === "def") openingSide = saved.side;
  if (saved.profile === "wings" || saved.profile === "independent" || saved.profile === "classic") {
    openingProfile = saved.profile;
  }
  // A fresh GAME ignores the saved side. Drill and practice keep it.
  if (sessionMode === "game") openingSide = rollPlaySide();
}
let practicePlay = 0;
let practiceScheme = 0;
let practiceSpotX = FIELD.width * 0.5;
let practiceSpotYard = sideYardToAbsolute("opp", 30);
let practiceAiming = false;
let practiceAimX = practiceSpotX;
let practiceAimYard = practiceSpotYard;
let practiceSeeded = false;
/** Snap the live roster was built from. Practice does not overwrite the saved game spot. */
let lastSnap = { los: BOOT_PLAY.los, snapX: FIELD.width / 2, exact: false };
let stageSpot = { los: BOOT_PLAY.los, snapX: FIELD.width / 2, exact: true };
let stageDead = false;
let stageTitle = "";
let stageDetail = "";
let stageDownText = "1st & 10";

type GameHold = {
  clockLeft: number;
  /** 1-based quarter that was running when the hold was taken. */
  quarter: number;
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
  mode: sessionMode,
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
  youScore: 0,
  cpuScore: 0,
  totalYards: 0,
  firstDowns: 0,
  touchdowns: 0,
  yac: 0,
  over: false,
  title: "",
  detail: "",
  playName: BOOT_PLAY.play.name,
  schemeName: BOOT_PLAY.scheme.name,
  replay: false,
  clock: QUARTER_SECONDS,
  quarter: 1,
  downText: "1st & 10",
  ballOn: BOOT_PLAY.los,
  homePossession: true,
  seriesOver: false,
  profile: openingProfile,
  paused: false,
  awaitSnap: false,
  mode: sessionMode,
  side: openingSide,
};
/** Seconds left in the current quarter. The board copy updates when the displayed second changes. */
let clockLeft = QUARTER_SECONDS;
/** 1-based live quarter. The HUD shows this. A new game is the only reset. */
let quarter = 1;
/** Set when a whistle rolls the clock into a new quarter. Cleared once that spot is applied. */
let enteredQuarter: number | null = null;
let down = 1;
let toGo = 10;
let seriesOver = false;
/** Side the user had at the kickoff of this GAME. Q3 takes the other role. */
let gameQ1Side: "off" | "def" | null = null;
let gameQ3SideApplied = false;
/** Side for the snap after a GAME touchdown. Applied after the Q3 flip so the kickoff wins. */
let gameKickSide: "off" | "def" | null = null;
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

/** Offense unless Defense was selected. Game and Practice share this. */
export function readPlaySide(): "off" | "def" {
  return board.side === "def" ? "def" : "off";
}

/**
 * One sitting of the box score.
 * `scores` also clears YOU and CPU. A new game and a mode change do.
 * An offense/defense change clears the four stat lines and the score too.
 */
function clearSittingStats(scores: boolean) {
  board = {
    ...board,
    totalYards: 0,
    firstDowns: 0,
    touchdowns: 0,
    yac: 0,
    ...(scores ? { youScore: 0, cpuScore: 0 } : {}),
  };
}

/**
 * The game restage has to use the snap that is actually on the field.
 * `stageSpot` is only the hold from leaving Practice, so a side change
 * mid-drive would otherwise jump back to the opening line.
 * A whistle that still has a next snap arms that snap. A finished game does not.
 */
function prepareGameSideStage() {
  // A live play, even at 0:00, re-huddles that snap. The game is dead only after the whistle.
  const dead = board.over && (clockExpired() || seriesOver || pendingSpot == null);
  if (dead) {
    stageDead = true;
    stageTitle = board.title;
    stageDetail = board.detail;
    stageDownText = board.downText;
    stageSpot = { los: lastSnap.los, snapX: lastSnap.snapX, exact: lastSnap.exact };
    return;
  }
  stageDead = false;
  if (board.over && pendingSpot) {
    stageSpot = { los: pendingSpot.los, snapX: pendingSpot.ballX, exact: !!pendingSpot.exact };
    pendingSpot = null;
    playIndex = (playIndex + 1) % OFF_PLAYS.length;
    schemeIndex = (schemeIndex + 1) % DEF_SCHEMES.length;
    return;
  }
  stageSpot = { los: lastSnap.los, snapX: lastSnap.snapX, exact: lastSnap.exact };
}

/** Restage the huddle. The free safety, or the defender from the last snap, is seated on defense. */
export function togglePlaySide() {
  if (sessionMode === "game") return;
  clearSittingStats(true);
  board = { ...board, side: board.side === "def" ? "off" : "def" };
  writePrefs({ side: board.side });
  if (sessionMode !== "practice") prepareGameSideStage();
  publish();
  queueStage();
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
  practicePlay = wrapIndex(practicePlay, OFF_PLAYS.length);
  practiceScheme = wrapIndex(practiceScheme, DEF_SCHEMES.length);
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
  schemeIndex = wrapIndex(schemeIndex, DEF_SCHEMES.length);
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

/** Fresh clock, quarter, chains, spot, and box score for a DRILL ↔ GAME switch. */
function resetMatchHud() {
  playIndex = 0;
  schemeIndex = 0;
  pendingSpot = null;
  setAttackNorth(true);
  setCameraNorth(true);
  resetFirstContact();
  resetDefense();
  clockLeft = QUARTER_SECONDS;
  quarter = 1;
  enteredQuarter = null;
  down = 1;
  toGo = 10;
  seriesOver = false;
  gameQ3SideApplied = false;
  gameKickSide = null;
  stageSpot = { los: BOOT_PLAY.los, snapX: FIELD.width / 2, exact: true };
  stageDead = false;
  stageTitle = "";
  stageDetail = "";
  stageDownText = "1st & 10";
  board = {
    ...board,
    youScore: 0,
    cpuScore: 0,
    totalYards: 0,
    firstDowns: 0,
    touchdowns: 0,
    yac: 0,
    over: false,
    title: "",
    detail: "",
    clock: QUARTER_SECONDS,
    quarter: 1,
    downText: "1st & 10",
    ballOn: BOOT_PLAY.los,
    homePossession: true,
    seriesOver: false,
    paused: false,
    awaitSnap: true,
  };
}

/** Re-clicking the current mode does not restage. */
export function setSessionMode(next: SessionMode) {
  const mode: SessionMode = next === "drill" || next === "practice" ? next : "game";
  if (mode === sessionMode) return;
  if (mode !== "practice") practiceAiming = false;
  if (mode === "practice") {
    if (!practiceSeeded) {
      practicePlay = playIndex;
      practiceScheme = schemeIndex;
      practiceSeeded = true;
    }
    const continuing = board.over && pendingSpot != null && !clockExpired() && !seriesOver;
    gameHold = {
      clockLeft,
      quarter,
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
      exact: continuing && pendingSpot ? !!pendingSpot.exact : lastSnap.exact,
      armNext: continuing,
    };
    stageDead = false;
  } else if (gameHold) {
    clockLeft = gameHold.clockLeft;
    quarter = gameHold.quarter;
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
  } else if (sessionMode !== "practice") {
    resetMatchHud();
    sessionMode = mode;
    if (mode === "game") gameQ1Side = board.side === "def" ? "def" : "off";
    writePrefs({ mode: sessionMode });
    queueStage();
    return;
  }
  clearSittingStats(true);
  sessionMode = mode;
  writePrefs({ mode: sessionMode });
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

/**
 * `119.2` is still `2:00`. The displayed second drops after a full second.
 * Under one minute the clock shows tenths, `0:29.4`. Zero is `0:00`.
 */
export function formatClock(seconds: number): string {
  if (!(seconds > 0)) return "0:00";
  if (seconds >= 60) {
    const shown = Math.ceil(seconds - 1e-6);
    const minutes = Math.floor(shown / 60);
    const secs = shown % 60;
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  }
  const text = Math.min(seconds, 59.949).toFixed(1);
  const dot = text.indexOf(".");
  return `0:${text.slice(0, dot).padStart(2, "0")}.${text.slice(dot + 1)}`;
}

/** The 4th quarter has hit 0:00. Earlier quarters roll forward at the whistle. */
export function clockExpired() {
  return quarter >= QUARTER_COUNT && clockLeft <= 0;
}

export function readAwaitSnap() {
  return board.awaitSnap;
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
  return board.over && (clockExpired() || seriesOver);
}

function downName(value: number) {
  if (value === 1) return "1st";
  if (value === 2) return "2nd";
  if (value === 3) return "3rd";
  if (value === 4) return "4th";
  return `${value}th`;
}

/** Banner quarter. `1` is `1st`. */
export function formatQuarter(value: number): string {
  return downName(value);
}

/** Whole numbers stay whole. A fractional value shows one decimal. */
export function formatTenths(value: number): string {
  const tenths = Math.round(value * 10) / 10;
  if (Math.abs(tenths - Math.round(tenths)) < 1e-6) return String(Math.round(tenths));
  return tenths.toFixed(1);
}

/** Whole numbers stay whole. A fractional chain shows one decimal. */
function formatDistance(distance: number): string {
  return formatTenths(distance);
}

/**
 * Field yard line for the banner. Midfield is 50. Either goal line is 0.
 * 44.8, 45, and 12.3 are the one-decimal form. Whole numbers drop the decimal.
 */
export function formatBallOn(absYard: number): string {
  const yard = Number.isFinite(absYard) ? absYard : 0;
  const line = yard > FIELD.length * 0.5 ? FIELD.length - yard : yard;
  return formatTenths(line);
}

/** "& Goal" only when the line to gain is on or past the goal line. */
function formatDown(value: number, distance: number, los: number) {
  const toGoal = yardsToGoal(los);
  if (toGoal <= distance) return `${downName(value)} & Goal`;
  return `${downName(value)} & ${formatDistance(distance)}`;
}

function freshToGo(los: number) {
  return Math.min(10, Math.max(1, yardsToGoal(los)));
}

/** Home's goal is yard 0. Away's goal is yard 100. `fromGoal` is that team's own yard line. */
function teamOwnLine(team: "home" | "away", fromGoal: number): number {
  return team === "home" ? fromGoal : FIELD.length - fromGoal;
}

/**
 * Game mode only. Home attacks north. Away attacks south.
 * Starts a new 1st & 10 (or 1st & Goal inside the 10).
 */
function setNextPossession(team: "home" | "away", los: number, ballX: number, exact = false) {
  setAttackNorth(team === "home");
  setCameraNorth(team === "home");
  down = 1;
  toGo = freshToGo(los);
  seriesOver = false;
  pendingSpot = { los, ballX, exact };
  board = {
    ...board,
    homePossession: team === "home",
    ballOn: los,
    seriesOver: false,
    downText: formatDown(down, toGo, los),
    clock: clockLeft,
  };
}

/** Keep the chain distance with the LOS that is actually on the field. */
function spotChains(los: number) {
  snappedToGo = Math.min(toGo, yardsToGoal(los));
}

/**
 * First-down yard for this line of scrimmage.
 * A fresh series is 10 yards ahead. Inside the 10 that yard is the goal line.
 * Returns null past the goal line or inside an end zone.
 */
function chainMark(los: number, distance: number): number | null {
  if (sessionMode === "practice") return null;
  const span = Math.min(Math.max(0, distance), yardsToGoal(los));
  if (span <= 0) return null;
  const yard = readAttackNorth() ? los + span : los - span;
  if (readAttackNorth() && (yard <= los || yard > FIELD.length)) return null;
  if (!readAttackNorth() && (yard >= los || yard < 0)) return null;
  return yard;
}

export function readFirstDownYard(los: number): number | null {
  return chainMark(los, snappedToGo);
}

/**
 * First-down yard for the settled next spot.
 * Uses the new distance, the same one the next lineup will paint.
 * Null until the whistle is spotted, and after a turnover.
 */
export function readPendingFirstDownYard(): number | null {
  if (!pendingSpot) return null;
  return chainMark(pendingSpot.los, toGo);
}

/**
 * Count down the current quarter during a live play.
 * Hitting 0:00 does not end the play. That snap runs until its whistle.
 * A quarter other than the 4th rolls to the next 30 seconds at the whistle.
 * The 4th quarter refuses another snap after that whistle.
 * Publishes when the displayed clock changes. Under one minute that is each tenth.
 */
export function tickClock(dt: number) {
  if (sessionMode === "practice" || clockLeft <= 0 || dt <= 0) return;
  const before = formatClock(clockLeft);
  clockLeft = Math.max(0, clockLeft - dt);
  if (formatClock(clockLeft) === before) return;
  board = { ...board, clock: clockLeft };
  publish();
}

/**
 * At a whistle, a finished quarter before the 4th starts the next 30 seconds.
 * Score, down, distance, and the spot are left for the play that just ended.
 */
function advanceQuarter() {
  if (sessionMode === "practice" || clockLeft > 0 || quarter >= QUARTER_COUNT) return;
  quarter += 1;
  clockLeft = QUARTER_SECONDS;
  enteredQuarter = quarter;
  board = { ...board, clock: clockLeft, quarter };
}

/**
 * The third quarter starts at the home 25.
 * The second keeps the first quarter's last spot, down, and distance.
 * The fourth keeps the third quarter's last spot, down, and distance.
 * Points already on the board stay.
 */
function placeEnteredQuarter() {
  const entered = enteredQuarter;
  enteredQuarter = null;
  if (entered !== 3 || !pendingSpot || seriesOver) return;
  const spot = homeTwentyFive();
  pendingSpot = { ...pendingSpot, los: spot };
  board = {
    ...board,
    ballOn: spot,
    downText: formatDown(down, toGo, spot),
    clock: clockLeft,
    quarter,
  };
}

/**
 * Q1→Q2 and Q3→Q4 turn the offense around. Q2→Q3 keeps the direction.
 * The play that just ended was scored before this runs.
 */
function finishQuarterEntry(entered: number | null) {
  if (entered !== 2 && entered !== 4) return;
  flipAttackDirection();
  board = { ...board, homePossession: readAttackNorth() };
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

/** The live play has at least one stored replay frame. A new snap clears it. */
let replayFootage = false;
const footageListeners = new Set<() => void>();

export function readReplayFootage() {
  return replayFootage;
}

export function subscribeReplayFootage(listener: () => void) {
  footageListeners.add(listener);
  return () => {
    footageListeners.delete(listener);
  };
}

export function setReplayFootage(on: boolean) {
  if (replayFootage === on) return;
  replayFootage = on;
  for (const listener of footageListeners) listener();
}

export type ControlProfile = Scoreboard["profile"];

export const CONTROL_PROFILES: { id: ControlProfile; label: string; blurb: string }[] = [
  { id: "wings", label: "Wings", blurb: "Z/X pick a blocker. The stick drives the carrier and that blocker." },
  { id: "independent", label: "Independent", blurb: "The stick drives the carrier. U/B/K/O or the right stick drives the blocker." },
  { id: "classic", label: "Classic", blurb: "The stick drives the carrier. U/B/K/O or the right stick drives the blocker. Stiff-arm is Tab and \\." },
];

export function readProfile() {
  return board.profile;
}

export function setProfile(profile: ControlProfile) {
  if (board.profile === profile) return;
  board = { ...board, profile };
  writePrefs({ profile });
  publish();
}

export function toggleProfile() {
  const profile: ControlProfile = board.profile === "wings" ? "independent" : board.profile === "independent" ? "classic" : "wings";
  setProfile(profile);
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

const OFFENSE_TOUCHDOWN_POINTS = 7;
const DEFENSE_TOUCHDOWN_POINTS = 8;
/** Defense scores 2 when the offense is downed in its own end zone. */
const SAFETY_POINTS = 2;
/**
 * Next snap after a safety. The goal line is yard 0. This is on the field,
 * just outside that line, not in the end zone.
 */


function tenth(value: number) {
  return Math.round(value * 10) / 10;
}

/** Same tenths as the down-and-distance line. Whole numbers stay whole. */
function gainLabel(gain: number): { title: "Gain" | "Loss" | "No gain"; label: string } {
  const shown = tenth(gain);
  if (shown > 0) return { title: "Gain", label: `Gain of ${formatTenths(shown)}` };
  if (shown < 0) return { title: "Loss", label: `Loss of ${formatTenths(Math.abs(shown))}` };
  return { title: "No gain", label: "No gain" };
}

/** Offense scores at the goal it is attacking. A defensive carrier scores at the other goal. */
function touchdownSide(carrier: Player | undefined, yard: number): "off" | "def" | null {
  const attackingNorth = readAttackNorth();
  if (carrier?.team === "def") return (attackingNorth ? yard <= 0 : yard >= FIELD.length) ? "def" : null;
  return (attackingNorth ? yard >= FIELD.length : yard <= 0) ? "off" : null;
}

/** Offense downed behind its own goal line, or flagged from a body touch in that end zone. */
function isSafety(carrier: Player | undefined, forced: boolean): boolean {
  if (carrier?.team !== "off") return false;
  if (forced) return true;
  return readAttackNorth() ? carrier.yard < 0 : carrier.yard > FIELD.length;
}

/**
 * Add this snap to the box score.
 * A touchdown is not a first down. A defensive score does not add offensive yards.
 */
function tallySnap(gain: number, runnerYard: number, score: "off" | "def" | null, firstDown: boolean) {
  const start = consumeFirstContact();
  const offensive = score !== "def";
  const yacDelta = offensive && start != null ? tenth(downfieldDelta(runnerYard, start)) : 0;
  return {
    youScore: board.youScore + (score === "off" ? OFFENSE_TOUCHDOWN_POINTS : 0),
    cpuScore: board.cpuScore + (score === "def" ? DEFENSE_TOUCHDOWN_POINTS : 0),
    totalYards: tenth(board.totalYards + (offensive ? gain : 0)),
    firstDowns: board.firstDowns + (firstDown && score == null ? 1 : 0),
    touchdowns: board.touchdowns + (score === "off" ? 1 : 0),
    yac: tenth(board.yac + yacDelta),
  };
}

/** Practice keeps the result line. It does not move the series or the next spot. */
function settlePracticePlay(
  carrier: Player | undefined,
  yard: number,
  los: number,
  measure: number,
  ballSpot: boolean,
  safety: boolean,
) {
  const kind = touchdownSide(carrier, yard);
  if (kind) {
    const gained = Math.max(0, downfieldDelta(yard, los));
    board = {
      ...board,
      ...tallySnap(gained, yard, kind, false),
      over: true,
      title: "Touchdown",
      detail: kind === "off" ? `${formatTenths(tenth(gained))} yards` : "Touchdown",
    };
    console.log(`Touchdown. ${board.detail}. YOU ${board.youScore} CPU ${board.cpuScore}.`);
    publish();
    return null;
  }
  if (isSafety(carrier, safety)) {
    const stats = tallySnap(downfieldDelta(yard, los), yard, null, false);
    board = {
      ...board,
      ...stats,
      cpuScore: stats.cpuScore + SAFETY_POINTS,
      over: true,
      title: "Safety",
      detail: "2 points",
    };
    console.log(`Safety. 2 points. YOU ${board.youScore} CPU ${board.cpuScore}.`);
    publish();
    return null;
  }
  const gain = downfieldDelta(measure, los);
  const said = gainLabel(gain);
  const title = ballSpot ? "Out of bounds" : said.title;
  board = { ...board, ...tallySnap(gain, yard, null, false), over: true, title, detail: said.label };
  console.log(`${board.detail}. YOU ${board.youScore} CPU ${board.cpuScore}.`);
  publish();
  return null;
}

/**
 * Yards from the LOS and the next line of scrimmage.
 * An offensive carrier at the attack goal scores 7. A defensive carrier at the other goal scores 8.
 * Otherwise the next spot is the downed ball.
 * `tip` is the furthest-downfield point of the football at the whistle.
 * That yard is not rounded. The result line uses the same tenths as the chains.
 * An out-of-bounds whistle spots X on the near side of the nearest hash mark.
 * An in-bounds tip is hash-clamped. A touchdown does not also count as a first down.
 */
export function settlePlay(sim: Sim, ballSpot = false, tip?: BallPoint, safety = false): { los: number; ballX: number } | null {
  const finish = consumeDefenseFinish();
  const carrier = sim.players.find((player) => player.controlled);
  const los = sim.los;
  const yard = carrier?.yard ?? los;
  const spotX = ballSpot ? sim.ballX : (carrier?.x ?? FIELD.width * 0.5);
  const measure = ballSpot ? sim.ballYard : yard;
  if (sessionMode === "practice") {
    const spot = settlePracticePlay(carrier, yard, los, measure, ballSpot, safety);
    if (finish === "fumble" && board.title !== "Touchdown" && board.title !== "Safety") {
      board = { ...board, title: "Fumble" };
      publish();
    }
    return spot;
  }
  advanceQuarter();
  const entered = enteredQuarter;
  const kind = touchdownSide(carrier, yard);
  if (kind) {
    const gained = Math.max(0, downfieldDelta(yard, los));
    board = {
      ...board,
      ...tallySnap(gained, yard, kind, false),
      over: true,
      title: "Touchdown",
      detail: kind === "off" ? `${formatTenths(tenth(gained))} yards` : "Touchdown",
    };
    const nextLos = touchdownSpot();
    down = 1;
    toGo = freshToGo(nextLos);
    seriesOver = false;
    pendingSpot = { los: nextLos, ballX: FIELD.width * 0.5 };
    board = { ...board, downText: formatDown(down, toGo, nextLos), ballOn: nextLos, seriesOver: false };
    placeEnteredQuarter();
    finishQuarterEntry(entered);
    // Possession is who has the ball. The user is always the home team in GAME.
    // board.side is only the user's role, derived from that possession.
    if (sessionMode === "game") {
      const offenseTeam: "home" | "away" = board.side === "def" ? "away" : "home";
      const scoringTeam: "home" | "away" = kind === "off" ? offenseTeam : offenseTeam === "home" ? "away" : "home";
      const possession: "home" | "away" = scoringTeam === "home" ? "away" : "home";
      const nextSide: "off" | "def" = possession === "home" ? "off" : "def";
      board = { ...board, side: nextSide };
      gameKickSide = nextSide;
      setAttackNorth(possession === "home");
      const los = teamOwnLine(possession, 25);
      down = 1;
      toGo = freshToGo(los);
      seriesOver = false;
      pendingSpot = { los, ballX: FIELD.width * 0.5 };
      board = {
        ...board,
        ballOn: los,
        seriesOver: false,
        downText: formatDown(down, toGo, los),
        clock: clockLeft,
        homePossession: possession === "home",
      };
      console.log(`[game score] scoring=${scoringTeam} possession=${possession} userTeam=home`);
    }
    console.log(`Touchdown. ${board.detail}. ${board.downText}. YOU ${board.youScore} CPU ${board.cpuScore}.`);
    publish();
    return pendingSpot;
  }
  if (isSafety(carrier, safety) && carrier) {
    const scoredOn: "home" | "away" = readAttackNorth() ? "home" : "away";
    const nextLos = safetySpotYard();
    const gain = downfieldDelta(nextLos, los);
    const stats = tallySnap(gain, yard, null, false);
    const spotBallX = ballSpot ? hashNearSide(tip?.x ?? spotX) : hashSnapX(tip?.x ?? spotX, false);
    down = 1;
    toGo = freshToGo(nextLos);
    seriesOver = false;
    pendingSpot = { los: nextLos, ballX: spotBallX, exact: true };
    board = {
      ...board,
      ...stats,
      cpuScore: stats.cpuScore + SAFETY_POINTS,
      over: true,
      title: "Safety",
      detail: "2 points",
      ballOn: nextLos,
      seriesOver: false,
      downText: formatDown(down, toGo, nextLos),
      clock: clockLeft,
    };
    placeEnteredQuarter();
    finishQuarterEntry(entered);
    if ((entered === 2 || entered === 4) && pendingSpot) {
      const los = safetySpotYard();
      pendingSpot = { ...pendingSpot, los };
      toGo = freshToGo(los);
      board = { ...board, ballOn: los, downText: formatDown(down, toGo, los) };
    }
    if (sessionMode === "game") {
      const nextTeam = scoredOn === "home" ? "away" : "home";
      setNextPossession(nextTeam, teamOwnLine(nextTeam, 35), FIELD.width * 0.5);
    }
    console.log(`Safety. 2 points. ${board.downText}. YOU ${board.youScore} CPU ${board.cpuScore}.`);
    publish();
    return pendingSpot;
  }
  const tipX = tip?.x ?? spotX;
  const tipYard = tip?.yard ?? measure;
  const nextLos = clamp(tipYard, SPOT_YARD_MIN, SPOT_YARD_MAX);
  const exactGain = downfieldDelta(nextLos, los);
  const said = gainLabel(exactGain);
  const title = ballSpot ? "Out of bounds" : said.title;
  board = {
    ...board,
    ...tallySnap(exactGain, yard, null, false),
    over: true,
    title,
    detail: said.label,
    ballOn: nextLos,
  };
  const madeFirst = exactGain >= toGo - 1e-3;
  // Out of bounds: the near end of the nearest hash tick, never the sideline.
  // In bounds: stay between the hashes, unless the tip is already on a sideline.
  const spotBallX = ballSpot ? hashNearSide(tipX) : hashSnapX(tipX, tipX <= 0.2 || tipX >= FIELD.width - 0.2);
  let gameTurnover: { team: "home" | "away"; los: number; ballX: number; exact: boolean } | null = null;
  if (madeFirst) {
    down = 1;
    toGo = freshToGo(nextLos);
    seriesOver = false;
    pendingSpot = { los: nextLos, ballX: spotBallX, exact: ballSpot };
    board = { ...board, firstDowns: board.firstDowns + 1 };
  } else {
    down += 1;
    if (down > 4) {
      if (sessionMode === "game") {
        // The other team takes over at this dead-ball spot. Applied after the quarter hooks.
        gameTurnover = {
          team: readAttackNorth() ? "away" : "home",
          los: nextLos,
          ballX: spotBallX,
          exact: ballSpot,
        };
        seriesOver = false;
        pendingSpot = { los: nextLos, ballX: spotBallX, exact: ballSpot };
        board = { ...board, title: "Turnover on downs", seriesOver: false, ballOn: nextLos };
      } else {
        seriesOver = true;
        pendingSpot = null;
        board = { ...board, title: "Turnover on downs", seriesOver: true, downText: formatDown(4, toGo, los) };
      }
    } else {
      const remain = toGo - exactGain;
      const room = yardsToGoal(nextLos);
      toGo = Math.min(room, Math.max(0, remain));
      seriesOver = false;
      pendingSpot = { los: nextLos, ballX: spotBallX, exact: ballSpot };
      board = { ...board, seriesOver: false, downText: formatDown(down, toGo, nextLos) };
    }
  }
  if (!seriesOver) {
    board = { ...board, seriesOver: false, downText: formatDown(down, toGo, nextLos) };
  }
  placeEnteredQuarter();
  finishQuarterEntry(entered);
  if (gameTurnover) {
    setNextPossession(gameTurnover.team, gameTurnover.los, gameTurnover.ballX, gameTurnover.exact);
    board = { ...board, title: "Turnover on downs" };
  }
  console.log(`${board.detail}. ${board.downText}. YOU ${board.youScore} CPU ${board.cpuScore}.`);
  publish();
  return pendingSpot;
}

/** Settled next line of scrimmage. Null until the whistle is spotted. Drill still clears it on a turnover. */
export function readPendingLos(): number | null {
  return pendingSpot ? pendingSpot.los : null;
}

/** `ballSpot` is an out-of-bounds whistle. `tip` is the ball's downfield point. `safety` is an own-end-zone touch. */
export function markPlayOver(sim: Sim, ballSpot = false, tip?: BallPoint, safety = false) {
  if (board.over) return;
  settlePlay(sim, ballSpot, tip, safety);
}

/**
 * Place, assign, look, and spread, then seat that roster on a play sim.
 * The carrier clocks come from `createPlaySim`. The looked bodies replace its roster.
 */
/** Q3 of a GAME puts the user on the other side from the Q1 kickoff. One snap applies it. */
function applyGameQ3Side() {
  if (sessionMode !== "game" || quarter !== 3 || gameQ3SideApplied || !gameQ1Side) return;
  gameQ3SideApplied = true;
  const next = gameQ1Side === "off" ? "def" : "off";
  if (board.side === next) return;
  board = { ...board, side: next };
}

function applyGameKickSide() {
  if (!gameKickSide) return;
  const next = gameKickSide;
  gameKickSide = null;
  if (sessionMode !== "game" || board.side === next) return;
  board = { ...board, side: next };
}

export function buildPlay(call: PlacementCall): { sim: Sim; assigned: AssignedPlay } {
  applyGameQ3Side();
  applyGameKickSide();
  resetFirstContact();
  // Steppers apply here, so the live roster waits until the next snap.
  // A caller can still override one group.
  const lined: PlacementCall = { ...call, personnel: { ...readPersonnel(), ...(call.personnel ?? {}) } };
  const setup = placeEntitiesForNewPlay(lined);
  const assigned = attachAssignments(setup, lined);
  applyPresnapLook(assigned, setup.los);
  spreadInteriorDefense(assigned);
  applyPresnapStances(assigned.players);
  orientLineup(assigned.players, setup.los);
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
  if (readPlaySide() === "def") seatDefender(assigned.players);
  lastSnap = { los: sim.los, snapX: assigned.snapX, exact: !!call.exactSnap };
  syncPractice(playDiagram(assigned, sim.los, assigned.snapX));
  setReplayFootage(false);
  board = {
    ...board,
    over: false,
    title: "",
    detail: "",
    playName: assigned.play.name,
    schemeName: assigned.scheme.name,
    replay: false,
    clock: clockLeft,
    quarter,
    downText: board.downText,
    ballOn: sim.los,
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

export function bootFullPlay(rollSide = false): { sim: Sim; assigned: AssignedPlay } {
  playIndex = 0;
  schemeIndex = 0;
  pendingSpot = null;
  setAttackNorth(true);
  setCameraNorth(true);
  resetFirstContact();
  resetDefense();
  gameQ3SideApplied = false;
  gameKickSide = null;
  const side: "off" | "def" = sessionMode === "game" && rollSide
    ? rollPlaySide()
    : board.side === "def" ? "def" : "off";
  gameQ1Side = sessionMode === "game" ? side : null;
  board = {
    youScore: 0,
    cpuScore: 0,
    totalYards: 0,
    firstDowns: 0,
    touchdowns: 0,
    yac: 0,
    over: false,
    title: "",
    detail: "",
    playName: BOOT_PLAY.play.name,
    schemeName: BOOT_PLAY.scheme.name,
    replay: false,
    clock: QUARTER_SECONDS,
    quarter: 1,
    downText: "1st & 10",
    ballOn: BOOT_PLAY.los,
    homePossession: true,
    seriesOver: false,
    profile: board.profile,
    paused: false,
    awaitSnap: true,
    mode: sessionMode,
    side,
  };
  clockLeft = QUARTER_SECONDS;
  quarter = 1;
  enteredQuarter = null;
  down = 1;
  toGo = 10;
  seriesOver = false;
  if (sessionMode === "practice") return buildPlay(practicePlacement());
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
