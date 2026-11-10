/**
 * In-game replay tape. Hockey stores 1800 sim frames (30 seconds at 60 Hz).
 * Playback is a copy of that ring. The live roster is not rewritten, so exit
 * puts the pause menu back on the real players.
 */
import { clamp, PLAY_MAX_X, PLAY_MAX_YARD, PLAY_MIN_X, PLAY_MIN_YARD } from "../field/spec";
import type { Sim } from "./sim";

export const TAPE_HZ = 60;
export const TAPE_SECONDS = 30;
export const TAPE_CAP = TAPE_HZ * TAPE_SECONDS;
/** Hockey will not open a replay shorter than this. */
export const TAPE_MIN = 12;
export const TAPE_FAST = 3.4;
export const TAPE_SLOW = 0.28;

export type TapeBody = {
  id: string;
  x: number;
  yard: number;
  hop: number;
  facingX: number;
  facingYard: number;
  /** Set on the carrier, and on anyone posed while the frame is locked. */
  pose: string | null;
};

export type TapeFrame = {
  pose: string;
  los: number;
  ballX: number;
  ballYard: number;
  bodies: TapeBody[];
};

/** -2 and 2 are the triggers. -1 and 1 are the bumpers. */
export type TapeScrub = -2 | -1 | 0 | 1 | 2;

const buf: TapeFrame[] = new Array(TAPE_CAP);
let write = 0;
let count = 0;
let acc = 0;

let play: TapeFrame[] = [];
let on = false;
let playing = false;
let locked = false;
let time = 0;
/** On-screen shuttle. 0 when the buttons are up. Pad and keys still win. */
let heldScrub: TapeScrub = 0;

/** Working copy while locked. Unlock puts the recorded frame back. */
let edit: TapeFrame | null = null;
let editBase: TapeFrame | null = null;
let editIndex = -1;
let selectedId: string | null = null;
let editRev = 0;

type TapeAdj = {
  id: string;
  x0: number;
  yard0: number;
  fx0: number;
  fy0: number;
  pose0: string | null;
  x1: number;
  yard1: number;
  fx1: number;
  fy1: number;
  pose1: string | null;
};

let undoStack: TapeAdj[] = [];
let redoStack: TapeAdj[] = [];
let gesture: TapeAdj | null = null;
const editListeners = new Set<() => void>();

const listeners = new Set<() => void>();
const readyListeners = new Set<() => void>();
let ready = false;

function publish() {
  for (const listener of listeners) listener();
}

function publishReady() {
  const next = count >= TAPE_MIN;
  if (next === ready) return;
  ready = next;
  for (const listener of readyListeners) listener();
}

export function subscribeTape(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function subscribeTapeReady(listener: () => void) {
  readyListeners.add(listener);
  return () => readyListeners.delete(listener);
}

export function subscribeTapeEdit(listener: () => void) {
  editListeners.add(listener);
  return () => editListeners.delete(listener);
}

export function tapeEditRev() {
  return editRev;
}

function publishEdit() {
  editRev += 1;
  for (const listener of editListeners) listener();
}

export function readTapeOn() {
  return on;
}

export function readTapeReady() {
  return count >= TAPE_MIN;
}

export function readTapeLocked() {
  return locked;
}

export function readTapePlaying() {
  return playing && !locked;
}

function scrubForRate(rate: number): TapeScrub {
  if (rate <= -1) return -2;
  if (rate < 0) return -1;
  if (rate >= 1) return 2;
  if (rate > 0) return 1;
  return 0;
}

export function readTapeHeldScrub(): TapeScrub {
  return heldScrub;
}

export function pressTapeShuttle(rate: number) {
  if (!on || locked) return;
  heldScrub = scrubForRate(rate);
  if (heldScrub !== 0) playing = false;
  publish();
}

export function releaseTapeShuttle(rate: number) {
  const scrub = scrubForRate(rate);
  if (heldScrub !== scrub) return;
  heldScrub = 0;
  publish();
}

export function tapeSpan() {
  return play.length > 1 ? (play.length - 1) / TAPE_HZ : 0;
}

export function tapeFraction() {
  const span = tapeSpan();
  if (span <= 1e-8) return 1;
  return Math.max(0, Math.min(1, time / span));
}

export function tapeFrameIndex() {
  if (!play.length) return 0;
  return Math.min(play.length - 1, Math.max(0, Math.floor(time * TAPE_HZ)));
}

export function tapeFrame(): TapeFrame | null {
  return play[tapeFrameIndex()] ?? null;
}

function capture(sim: Sim): TapeFrame {
  return {
    pose: sim.pose,
    los: sim.los,
    ballX: sim.ballX,
    ballYard: sim.ballYard,
    bodies: sim.players.map((player) => ({
      id: player.id,
      x: player.x,
      yard: player.yard,
      hop: player.hop,
      facingX: player.facingX,
      facingYard: player.facingYard,
      pose: player.controlled ? sim.pose : null,
    })),
  };
}

function push(frame: TapeFrame) {
  buf[write] = frame;
  write = (write + 1) % TAPE_CAP;
  if (count < TAPE_CAP) count += 1;
  publishReady();
}

/** One sample per 60 Hz tick while the play is live. A hitch does not flood the ring. */
export function noteTape(dt: number, sim: Sim) {
  if (on) return;
  acc += Math.max(0, dt);
  if (acc < 1 / TAPE_HZ) return;
  acc = Math.min(acc - 1 / TAPE_HZ, 1 / TAPE_HZ);
  push(capture(sim));
}

function dump(): TapeFrame[] {
  const out: TapeFrame[] = [];
  const start = count < TAPE_CAP ? 0 : write;
  for (let i = 0; i < count; i += 1) {
    const frame = buf[(start + i) % TAPE_CAP];
    if (frame) out.push(frame);
  }
  return out;
}

export function beginTape(): boolean {
  if (on || count < TAPE_MIN) return false;
  play = dump();
  if (!play.length) return false;
  on = true;
  playing = false;
  locked = false;
  time = tapeSpan();
  publish();
  return true;
}

function cloneFrame(frame: TapeFrame): TapeFrame {
  return {
    pose: frame.pose,
    los: frame.los,
    ballX: frame.ballX,
    ballYard: frame.ballYard,
    bodies: frame.bodies.map((body) => ({ ...body })),
  };
}

function clearEdit() {
  edit = null;
  editBase = null;
  editIndex = -1;
  selectedId = null;
  undoStack = [];
  redoStack = [];
  gesture = null;
}

/** Leave the replay on the pause menu. The ring buffer stays. */
export function stopTape() {
  if (!on) return;
  on = false;
  playing = false;
  locked = false;
  heldScrub = 0;
  play = [];
  time = 0;
  clearEdit();
  publish();
  publishEdit();
}

function editedBody(id: string) {
  return edit?.bodies.find((body) => body.id === id) ?? null;
}

function sameAdj(adj: TapeAdj) {
  return (
    adj.x0 === adj.x1 &&
    adj.yard0 === adj.yard1 &&
    adj.fx0 === adj.fx1 &&
    adj.fy0 === adj.fy1 &&
    adj.pose0 === adj.pose1
  );
}

function closeGesture() {
  const current = gesture;
  if (!current) return;
  gesture = null;
  if (sameAdj(current)) return;
  const prev = undoStack[undoStack.length - 1];
  if (prev && prev.id === current.id && prev.pose0 === prev.pose1 && current.pose0 === current.pose1) {
    prev.x1 = current.x1;
    prev.yard1 = current.yard1;
    prev.fx1 = current.fx1;
    prev.fy1 = current.fy1;
  } else {
    undoStack.push(current);
  }
  redoStack = [];
  publishEdit();
}

function openGesture(body: TapeBody) {
  if (gesture?.id === body.id) return;
  closeGesture();
  gesture = {
    id: body.id,
    x0: body.x,
    yard0: body.yard,
    fx0: body.facingX,
    fy0: body.facingYard,
    pose0: body.pose,
    x1: body.x,
    yard1: body.yard,
    fx1: body.facingX,
    fy1: body.facingYard,
    pose1: body.pose,
  };
}

function syncGesture(body: TapeBody) {
  if (!gesture || gesture.id !== body.id) return;
  gesture.x1 = body.x;
  gesture.yard1 = body.yard;
  gesture.fx1 = body.facingX;
  gesture.fy1 = body.facingYard;
  gesture.pose1 = body.pose;
}

function applyAdj(adj: TapeAdj, forward: boolean) {
  const body = editedBody(adj.id);
  if (!body || !edit) return;
  body.x = forward ? adj.x1 : adj.x0;
  body.yard = forward ? adj.yard1 : adj.yard0;
  body.facingX = forward ? adj.fx1 : adj.fx0;
  body.facingYard = forward ? adj.fy1 : adj.fy0;
  body.pose = forward ? adj.pose1 : adj.pose0;
  if (body.pose) edit.pose = body.pose;
}

/** Freeze the current frame and open the formation editor. Unlock reverts that frame. */
export function toggleTapeLock() {
  if (!on || !play.length) return;
  if (locked) {
    closeGesture();
    if (editIndex >= 0 && editBase) play[editIndex] = editBase;
    clearEdit();
    locked = false;
    publish();
    publishEdit();
    return;
  }
  const index = tapeFrameIndex();
  const snap = play[index];
  if (!snap) return;
  editBase = cloneFrame(snap);
  edit = cloneFrame(snap);
  editIndex = index;
  play[index] = edit;
  locked = true;
  playing = false;
  selectedId = edit.bodies.find((body) => body.pose)?.id ?? edit.bodies[0]?.id ?? null;
  undoStack = [];
  redoStack = [];
  gesture = null;
  publish();
  publishEdit();
}

export function readTapeSelected() {
  return selectedId;
}

export function tapeEditOwnsMove() {
  return locked && selectedId !== null && edit !== null;
}

export function tapeUndoDepth() {
  return undoStack.length + (gesture && !sameAdj(gesture) ? 1 : 0);
}

export function tapeRedoDepth() {
  return redoStack.length;
}

export function tapeBodyPose(id: string) {
  if (!locked || !edit) return null;
  return editedBody(id)?.pose ?? null;
}

export function selectTapeBody(id: string | null) {
  if (!locked || !edit) return;
  closeGesture();
  if (id && !editedBody(id)) return;
  if (selectedId === id) return;
  selectedId = id;
  publishEdit();
}

/** Nearest player within 1.6 yards. An empty click clears the selection. */
export function pickTapeBody(x: number, yard: number) {
  if (!locked || !edit) return;
  let best: string | null = null;
  let bestD = 1.6;
  for (const body of edit.bodies) {
    const dist = Math.hypot(body.x - x, body.yard - yard);
    if (dist <= bestD) {
      bestD = dist;
      best = body.id;
    }
  }
  selectTapeBody(best);
}

export function cycleTapeSelect(dir: 1 | -1) {
  if (!locked || !edit || !edit.bodies.length) return;
  const ids = edit.bodies.map((body) => body.id);
  const at = selectedId ? ids.indexOf(selectedId) : -1;
  const next = at < 0 ? 0 : (at + dir + ids.length) % ids.length;
  selectTapeBody(ids[next] ?? null);
}

/** Slide the selected player. Consecutive slides fold into one undo step. */
export function slideTapeSelection(dx: number, dyard: number) {
  if (!locked || !edit || !selectedId || (dx === 0 && dyard === 0)) return;
  const body = editedBody(selectedId);
  if (!body) return;
  openGesture(body);
  body.x = clamp(body.x + dx, PLAY_MIN_X, PLAY_MAX_X);
  body.yard = clamp(body.yard + dyard, PLAY_MIN_YARD, PLAY_MAX_YARD);
  syncGesture(body);
}

/** Turn the selected player in the field plane. Positive is toward the left sideline from north. */
export function turnTapeSelection(radians: number) {
  if (!locked || !edit || !selectedId || radians === 0) return;
  const body = editedBody(selectedId);
  if (!body) return;
  openGesture(body);
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const fx = body.facingX;
  const fy = body.facingYard;
  body.facingX = fx * c - fy * s;
  body.facingYard = fx * s + fy * c;
  const mag = Math.hypot(body.facingX, body.facingYard) || 1;
  body.facingX /= mag;
  body.facingYard /= mag;
  syncGesture(body);
}

export function endTapeNudge() {
  closeGesture();
}

export function setTapeBodyPose(pose: string) {
  if (!locked || !edit || !selectedId) return;
  const body = editedBody(selectedId);
  if (!body || body.pose === pose) return;
  closeGesture();
  const adj: TapeAdj = {
    id: body.id,
    x0: body.x,
    yard0: body.yard,
    fx0: body.facingX,
    fy0: body.facingYard,
    pose0: body.pose,
    x1: body.x,
    yard1: body.yard,
    fx1: body.facingX,
    fy1: body.facingYard,
    pose1: pose,
  };
  body.pose = pose;
  edit.pose = pose;
  undoStack.push(adj);
  redoStack = [];
  publishEdit();
}

export function undoTapeEdit() {
  if (!locked || !edit) return;
  closeGesture();
  const adj = undoStack.pop();
  if (!adj) return;
  applyAdj(adj, false);
  redoStack.push(adj);
  publishEdit();
}

export function redoTapeEdit() {
  if (!locked || !edit) return;
  closeGesture();
  const adj = redoStack.pop();
  if (!adj) return;
  applyAdj(adj, true);
  undoStack.push(adj);
  publishEdit();
}

export function toggleTapePlay() {
  if (!on || locked || !play.length) return;
  heldScrub = 0;
  const atEnd = play.length > 1 && time >= tapeSpan() - 1e-4;
  if (playing && !atEnd) {
    playing = false;
    publish();
    return;
  }
  if (atEnd) time = 0;
  playing = true;
  publish();
}

export function seekTape(fraction: number) {
  if (!on || locked || !play.length) return;
  const span = tapeSpan();
  time = span * Math.max(0, Math.min(1, fraction));
  playing = false;
  publish();
}

export function stepTape(dt: number, scrub: TapeScrub) {
  if (!on || !play.length || locked) return;
  let rate = 0;
  if (scrub === -2) rate = -TAPE_FAST;
  else if (scrub === 2) rate = TAPE_FAST;
  else if (scrub === -1) rate = -TAPE_SLOW;
  else if (scrub === 1) rate = TAPE_SLOW;
  else if (playing) rate = 1;
  if (rate === 0) return;
  const span = tapeSpan();
  const next = Math.max(0, Math.min(span, time + Math.max(0, dt) * rate));
  if (next === time) return;
  time = next;
  publish();
}

export function selfTestTape() {
  write = 0;
  count = 0;
  acc = 0;
  play = [];
  on = false;
  playing = false;
  locked = false;
  time = 0;
  heldScrub = 0;
  ready = false;
  clearEdit();
  const sim = {
    pose: "carry 1",
    los: 50,
    ballX: 37,
    ballYard: 25,
    players: [{ id: "hb-0", x: 0, yard: 0, hop: 0, facingX: 0, facingYard: 1 }],
  } as Sim;
  if (beginTape()) throw new Error("tape opened before it had footage");
  for (let i = 0; i < TAPE_CAP + 1; i += 1) {
    sim.players[0]!.x = i;
    noteTape(1 / TAPE_HZ, sim);
  }
  if (count !== TAPE_CAP) throw new Error(`tape count ${count}`);
  if (!beginTape()) throw new Error("tape did not open");
  seekTape(0);
  const oldest = tapeFrame();
  if (!oldest || oldest.bodies[0]?.x !== 1) throw new Error("oldest frame was not dropped");
  if (tapeFrameIndex() !== 0 || readTapePlaying()) throw new Error("seek to the start");
  toggleTapeLock();
  seekTape(1);
  stepTape(1, 2);
  if (tapeFrameIndex() !== 0 || !readTapeLocked()) throw new Error("lock did not hold the frame");
  slideTapeSelection(2, 0);
  endTapeNudge();
  if (tapeFrame()?.bodies[0]?.x !== 3) throw new Error("slide");
  undoTapeEdit();
  if (tapeFrame()?.bodies[0]?.x !== 1) throw new Error("undo");
  redoTapeEdit();
  if (tapeFrame()?.bodies[0]?.x !== 3) throw new Error("redo");
  undoTapeEdit();
  toggleTapeLock();
  if (tapeFrame()?.bodies[0]?.x !== 1) throw new Error("unlock should revert the frame");
  stepTape(1, 2);
  const moved = time;
  if (moved < TAPE_FAST - 0.01 || moved > TAPE_FAST + 0.01) throw new Error(`fast scrub ${moved}`);
  toggleTapePlay();
  if (!readTapePlaying()) throw new Error("play");
  const at = time;
  stepTape(0.5, 0);
  if (Math.abs(time - (at + 0.5)) > 1e-6) throw new Error("playback rate");
  stopTape();
  if (readTapeOn() || readTapeLocked()) throw new Error("stop");
  if (!readTapeReady()) throw new Error("buffer was cleared");
}
