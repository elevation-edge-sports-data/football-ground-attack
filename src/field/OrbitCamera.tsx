import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { MOUSE, TOUCH, Vector3, type PerspectiveCamera } from "three";
import { followTarget } from "../game/cameraFollow";
import {
  chaseForward,
  eyeFromOrbit,
  FREESTYLE_FOV,
  freeCam,
  orbitPitchCommand,
  orbitYawCommand,
  placeScripted,
  readCamMode,
  setCamMode,
  writeFreeCam,
  type CamMode,
} from "../game/cameraMode";
import { practiceSpotAiming, previewRequested, readAwaitSnap, readPaused, readProfile } from "../game/sim/boot";
import { radialDeadzone, readBasicPad, readPadButton, readReplayPad, readRightStick, readTriggerZoom } from "../game/input";
import { readTapeOn, tapeEditOwnsMove } from "../game/tapeReplay";
import {
  defaultReplaySphere,
  markReplayFocus,
  offsetFromSphere,
  replayCam,
  replayHeld,
  replayKeyDown,
  replayKeyUp,
  sphereFromOffset,
} from "../game/replayCamera";

const MIN_PITCH = 0.12;
const MAX_PITCH = Math.PI / 2 - 0.04;

const _desired = new Vector3();
const _look = new Vector3();
const _smoothPos = new Vector3();
const _smoothLook = new Vector3();

type Gesture = { stickYaw: number; stickPitch: number; keyYaw: number; keyPitch: number; zoom: number };

function placeOffset(camera: PerspectiveCamera, orbit: OrbitControls, x: number, y: number, z: number) {
  camera.position.set(followTarget.x + x, followTarget.y + y, followTarget.z + z);
  orbit.target.set(followTarget.x, followTarget.y, followTarget.z);
}

/** Zoom, yaw, and pitch around the scrubbed carrier. Live play does not call this. */
function driveReplay(camera: PerspectiveCamera, orbit: OrbitControls, dt: number) {
  const held = replayHeld();
  const step = Math.min(Math.max(dt, 0), 0.05);
  if (replayCam.snap) {
    const home = defaultReplaySphere();
    const placed = offsetFromSphere(home);
    placeOffset(camera, orbit, placed.x, placed.y, placed.z);
    replayCam.snap = false;
    orbit.update();
    markReplayFocus(orbit.target.x, orbit.target.z, true);
    return;
  }
  if (replayCam.snapOffset) {
    const jump = replayCam.snapOffset;
    replayCam.snapOffset = null;
    placeOffset(camera, orbit, jump.x, jump.y, jump.z);
    orbit.update();
    markReplayFocus(orbit.target.x, orbit.target.z, true);
    return;
  }
  const anchorX = replayCam.follow ? followTarget.x : orbit.target.x;
  const anchorY = replayCam.follow ? followTarget.y : orbit.target.y;
  const anchorZ = replayCam.follow ? followTarget.z : orbit.target.z;
  let { dist, yaw, pitch } = sphereFromOffset(
    camera.position.x - anchorX,
    camera.position.y - anchorY,
    camera.position.z - anchorZ,
  );
  if (held.has("KeyQ")) yaw -= 1.1 * step;
  if (held.has("KeyE")) yaw += 1.1 * step;
  if (held.has("KeyF")) pitch += 0.7 * step;
  if (held.has("KeyV")) pitch -= 0.7 * step;
  if (held.has("PageUp") || held.has("Equal") || held.has("NumpadAdd") || readReplayPad(2)) dist *= Math.exp(-1.5 * step);
  if (held.has("PageDown") || held.has("Minus") || held.has("NumpadSubtract") || readReplayPad(1)) dist *= Math.exp(1.5 * step);
  const right = readRightStick();
  if (right.x !== 0 || right.y !== 0) {
    yaw += right.x * 1.1 * step;
    pitch += right.y * 0.7 * step;
  }
  dist = Math.max(2, Math.min(260, dist));
  pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch));
  const next = offsetFromSphere({ dist, yaw, pitch });
  if (replayCam.follow) placeOffset(camera, orbit, next.x, next.y, next.z);
  else camera.position.set(anchorX + next.x, anchorY + next.y, anchorZ + next.z);
  orbit.update();
  markReplayFocus(orbit.target.x, orbit.target.z, true);
}

function emptyGesture(): Gesture {
  return { stickYaw: 0, stickPitch: 0, keyYaw: 0, keyPitch: 0, zoom: 0 };
}

/**
 * Freestyle always reads the right stick and the bracket / page keys.
 * Pause also reads the left stick, Q/E, F/V, and the triggers, then commits to freestyle.
 */
function readGesture(keys: ReadonlySet<string>, paused: boolean, freestyle: boolean, rightStick: boolean): Gesture | null {
  const opening = readAwaitSnap();
  if (!freestyle && !paused && !opening) return null;
  const gesture = emptyGesture();
  if (keys.has("BracketLeft")) gesture.keyYaw -= 1;
  if (keys.has("BracketRight")) gesture.keyYaw += 1;
  if (keys.has("PageUp") || keys.has("Equal") || keys.has("NumpadAdd")) gesture.zoom += 1;
  if (keys.has("PageDown") || keys.has("Minus") || keys.has("NumpadSubtract")) gesture.zoom -= 1;
  if (paused) {
    if (keys.has("KeyQ")) gesture.keyYaw -= 1;
    if (keys.has("KeyE")) gesture.keyYaw += 1;
    if (keys.has("KeyF")) gesture.keyPitch += 1;
    if (keys.has("KeyV")) gesture.keyPitch -= 1;
    gesture.zoom += readTriggerZoom();
    const pad = readBasicPad();
    if (pad) {
      const left = radialDeadzone(pad.x, -pad.y);
      gesture.stickYaw += left.x;
      gesture.stickPitch += left.y;
    }
  }
  // X zooms in, B zooms out. Live play keeps those buttons for dive and spin.
  if (paused || opening) {
    if (readPadButton(2)) gesture.zoom += 1;
    if (readPadButton(1)) gesture.zoom -= 1;
  }
  if (rightStick) {
    const right = readRightStick();
    gesture.stickYaw += right.x;
    gesture.stickPitch += right.y;
  }
  if (
    gesture.stickYaw === 0 &&
    gesture.stickPitch === 0 &&
    gesture.keyYaw === 0 &&
    gesture.keyPitch === 0 &&
    gesture.zoom === 0
  ) {
    return null;
  }
  return gesture;
}

/** Stick-right matches mouse-drag right. E and ] swing the eye east, same as replay. */
function applyGesture(orbit: OrbitControls, gesture: Gesture, step: number) {
  const yaw = orbitYawCommand(gesture.stickYaw, gesture.keyYaw);
  const pitch = orbitPitchCommand(gesture.stickPitch, gesture.keyPitch);
  if (yaw !== 0) orbit.rotateLeft(yaw * step);
  if (pitch !== 0) orbit.rotateUp(pitch * step);
  if (gesture.zoom > 0) orbit.dollyIn(Math.exp(-1.6 * step * gesture.zoom));
  else if (gesture.zoom < 0) orbit.dollyOut(Math.exp(-1.6 * step * -gesture.zoom));
}

function setFov(camera: PerspectiveCamera, fov: number) {
  if (Math.abs(camera.fov - fov) <= 0.2) return;
  camera.fov = fov;
  camera.updateProjectionMatrix();
}

/**
 * `useSaved` keeps the last freestyle orbit. Otherwise the current eye is stored
 * so a pause orbit starts from the picture already on screen.
 */
function seatFreestyle(camera: PerspectiveCamera, orbit: OrbitControls, useSaved: boolean) {
  camera.up.set(0, 1, 0);
  orbit.target.set(followTarget.x, followTarget.y, followTarget.z);
  if (!(useSaved && freeCam.captured)) {
    writeFreeCam(
      camera.position.x - followTarget.x,
      camera.position.y - followTarget.y,
      camera.position.z - followTarget.z,
    );
  }
  const eye = eyeFromOrbit(followTarget, freeCam);
  camera.position.set(eye.x, eye.y, eye.z);
  camera.lookAt(followTarget.x, followTarget.y, followTarget.z);
  orbit.enabled = true;
  orbit.enablePan = true;
  orbit.enableRotate = !practiceSpotAiming();
  orbit.enableZoom = true;
  setFov(camera, FREESTYLE_FOV);
  orbit.update();
}

function rightStickOrbits(paused: boolean) {
  return paused || readProfile() === "wings" || previewRequested();
}

/** Page chrome is whatever is under the cursor and is not the scene canvas. Focus is ignored. */
function cursorOverScene(x: number, y: number, canvas: HTMLElement): boolean {
  const hit = document.elementFromPoint(x, y);
  if (!hit) return false;
  if (hit === canvas || canvas.contains(hit)) return true;
  return hit === canvas.parentElement;
}

function dollyWheel(orbit: OrbitControls, deltaY: number) {
  if (deltaY === 0) return;
  const scale = Math.pow(0.95, orbit.zoomSpeed * Math.abs(deltaY) * 0.01);
  if (deltaY < 0) orbit.dollyIn(scale);
  else orbit.dollyOut(scale);
}

function driveFreestyle(
  camera: PerspectiveCamera,
  orbit: OrbitControls,
  step: number,
  paused: boolean,
  keys: ReadonlySet<string>,
  followed: { x: number; y: number; z: number },
) {
  camera.up.set(0, 1, 0);
  orbit.enabled = true;
  orbit.enablePan = true;
  orbit.enableRotate = !practiceSpotAiming();
  orbit.enableZoom = true;
  setFov(camera, FREESTYLE_FOV);
  // Move the orbit with the carrier. A right-drag pan stays as a fixed offset.
  const dx = followTarget.x - followed.x;
  const dy = followTarget.y - followed.y;
  const dz = followTarget.z - followed.z;
  followed.x = followTarget.x;
  followed.y = followTarget.y;
  followed.z = followTarget.z;
  orbit.target.x += dx;
  orbit.target.y += dy;
  orbit.target.z += dz;
  camera.position.x += dx;
  camera.position.y += dy;
  camera.position.z += dz;
  const gesture = readGesture(keys, paused, true, rightStickOrbits(paused) || readAwaitSnap());
  if (gesture) applyGesture(orbit, gesture, step);
  else orbit.update();
  writeFreeCam(
    camera.position.x - orbit.target.x,
    camera.position.y - orbit.target.y,
    camera.position.z - orbit.target.z,
  );
}

function driveScripted(
  camera: PerspectiveCamera,
  orbit: OrbitControls,
  mode: Exclude<CamMode, "freestyle">,
  step: number,
  snap: boolean,
  chase: { x: number; z: number },
) {
  orbit.enabled = false;
  const subject = { x: followTarget.x, y: followTarget.y, z: followTarget.z };
  const want = chaseForward(followTarget.facingX, followTarget.facingYard);
  const headingK = snap ? 1 : 1 - Math.exp(-2.4 * step);
  chase.x += (want.x - chase.x) * headingK;
  chase.z += (want.z - chase.z) * headingK;
  const heading = Math.hypot(chase.x, chase.z) || 1;
  chase.x /= heading;
  chase.z /= heading;
  const place = placeScripted(mode, subject, chase);
  camera.up.set(place.up.x, place.up.y, place.up.z);
  setFov(camera, place.fov);
  _desired.set(place.eye.x, place.eye.y, place.eye.z);
  _look.set(place.look.x, place.look.y, place.look.z);
  if (mode === "classic" || snap) {
    _smoothPos.copy(_desired);
    _smoothLook.copy(_look);
  } else {
    const dist = _smoothPos.distanceTo(_desired);
    const k = dist > 18 ? 1 : 1 - Math.exp(-2.4 * step);
    _smoothPos.lerp(_desired, k);
    const lookK = dist > 18 ? 1 : 1 - Math.exp(-3.2 * step);
    _smoothLook.lerp(_look, lookK);
  }
  camera.position.copy(_smoothPos);
  camera.lookAt(_smoothLook);
  orbit.target.copy(_smoothLook);
}

function markFollow(slot: { x: number; y: number; z: number }) {
  slot.x = followTarget.x;
  slot.y = followTarget.y;
  slot.z = followTarget.z;
}

function shiftFollow(camera: PerspectiveCamera, orbit: OrbitControls, followed: { x: number; y: number; z: number }) {
  const dx = followTarget.x - followed.x;
  const dy = followTarget.y - followed.y;
  const dz = followTarget.z - followed.z;
  followed.x = followTarget.x;
  followed.y = followTarget.y;
  followed.z = followTarget.z;
  orbit.target.x += dx;
  orbit.target.y += dy;
  orbit.target.z += dz;
  camera.position.x += dx;
  camera.position.y += dy;
  camera.position.z += dz;
}

/** Screen pan. Stick-right and D move along camera right. Stick-up and W move along the ground forward. */
function truckPan(camera: PerspectiveCamera, orbit: OrbitControls, panX: number, panY: number, step: number) {
  camera.updateMatrixWorld();
  const e = camera.matrixWorld.elements;
  let fx = -e[8]!;
  let fz = -e[10]!;
  let rx = e[0]!;
  let rz = e[2]!;
  const fm = Math.hypot(fx, fz);
  if (fm < 0.12) {
    fx = e[4]!;
    fz = e[6]!;
    const upM = Math.hypot(fx, fz) || 1;
    fx /= upM;
    fz /= upM;
  } else {
    fx /= fm;
    fz /= fm;
  }
  const rm = Math.hypot(rx, rz) || 1;
  rx /= rm;
  rz /= rm;
  const speed = Math.max(6, camera.position.distanceTo(orbit.target)) * 0.9 * step;
  const dx = (rx * panX + fx * panY) * speed;
  const dz = (rz * panX + fz * panY) * speed;
  orbit.target.x += dx;
  orbit.target.z += dz;
  camera.position.x += dx;
  camera.position.z += dz;
}

type TapeCamInput = {
  panX: number;
  panY: number;
  orbit: boolean;
  spinX: number;
  spinY: number;
  zoom: number;
  keyYaw: number;
  keyPitch: number;
};

function readTapeCam(keys: ReadonlySet<string>): TapeCamInput {
  const yHeld = readReplayPad(3) || keys.has("KeyY");
  const steerPlayer = tapeEditOwnsMove() && !yHeld;
  const right = readRightStick();
  const orbitStick = yHeld && (right.x !== 0 || right.y !== 0);
  let panX = orbitStick ? right.x : 0;
  let panY = orbitStick ? right.y : 0;
  if (!steerPlayer && !orbitStick) {
    panX += (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
    panY += (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0);
  }
  const mag = Math.hypot(panX, panY);
  if (mag > 1) {
    panX /= mag;
    panY /= mag;
  }
  let zoom = 0;
  if (readReplayPad(2) || keys.has("KeyX") || keys.has("PageUp") || keys.has("Equal") || keys.has("NumpadAdd")) zoom += 1;
  if (readReplayPad(1) || keys.has("KeyB") || keys.has("PageDown") || keys.has("Minus") || keys.has("NumpadSubtract")) zoom -= 1;
  let keyYaw = 0;
  let keyPitch = 0;
  if (keys.has("KeyQ") || keys.has("BracketLeft")) keyYaw -= 1;
  if (keys.has("KeyE") || keys.has("BracketRight")) keyYaw += 1;
  if (keys.has("KeyF")) keyPitch += 1;
  if (keys.has("KeyV")) keyPitch -= 1;
  return {
    panX,
    panY,
    orbit: orbitStick,
    spinX: orbitStick ? 0 : right.x,
    spinY: orbitStick ? 0 : right.y,
    zoom,
    keyYaw,
    keyPitch,
  };
}

/**
 * Replay keeps the five modes. Freestyle still takes the mouse.
 * A stick pan, Y orbit, or X/B zoom seats freestyle from the current picture.
 */
function driveTapeCamera(
  camera: PerspectiveCamera,
  orbit: OrbitControls,
  step: number,
  keys: ReadonlySet<string>,
  followed: { x: number; y: number; z: number },
  chase: { x: number; z: number },
  applied: { current: CamMode | "" },
) {
  const input = readTapeCam(keys);
  const turning = input.keyYaw !== 0 || input.keyPitch !== 0;
  const spinning = input.spinX !== 0 || input.spinY !== 0;
  const moving = input.panX !== 0 || input.panY !== 0 || input.zoom !== 0 || turning || spinning;
  let mode = readCamMode();
  if (moving && mode !== "freestyle") {
    seatFreestyle(camera, orbit, false);
    markFollow(followed);
    setCamMode("freestyle");
    applied.current = "freestyle";
    mode = "freestyle";
  }
  if (mode !== "freestyle") {
    const snap = applied.current !== mode;
    applied.current = mode;
    driveScripted(camera, orbit, mode, step, snap, chase);
    markReplayFocus(orbit.target.x, orbit.target.z, true);
    return;
  }
  if (applied.current !== "freestyle") {
    seatFreestyle(camera, orbit, true);
    markFollow(followed);
    applied.current = "freestyle";
  }
  camera.up.set(0, 1, 0);
  orbit.enabled = true;
  orbit.enablePan = true;
  orbit.enableRotate = !practiceSpotAiming();
  orbit.enableZoom = true;
  setFov(camera, FREESTYLE_FOV);
  shiftFollow(camera, orbit, followed);
  const stickOrbit = input.orbit && (input.panX !== 0 || input.panY !== 0);
  if (stickOrbit || turning || spinning) {
    applyGesture(
      orbit,
      {
        stickYaw: (input.orbit ? input.panX : 0) + input.spinX,
        stickPitch: (input.orbit ? input.panY : 0) + input.spinY,
        keyYaw: input.keyYaw,
        keyPitch: input.keyPitch,
        zoom: 0,
      },
      step,
    );
  }
  if (!stickOrbit && (input.panX !== 0 || input.panY !== 0)) {
    truckPan(camera, orbit, input.panX, input.panY, step);
  }
  if (input.zoom !== 0) {
    applyGesture(orbit, { stickYaw: 0, stickPitch: 0, keyYaw: 0, keyPitch: 0, zoom: input.zoom }, step);
  }
  orbit.update();
  writeFreeCam(camera.position.x - orbit.target.x, camera.position.y - orbit.target.y, camera.position.z - orbit.target.z);
  markReplayFocus(orbit.target.x, orbit.target.z, true);
}

const TAPE_CAM_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyX",
  "KeyB",
  "KeyY",
  "KeyQ",
  "KeyE",
  "KeyF",
  "KeyV",
]);

const CAM_KEYS = new Set([
  "BracketLeft",
  "BracketRight",
  "PageUp",
  "PageDown",
  "Equal",
  "Minus",
  "NumpadAdd",
  "NumpadSubtract",
  "KeyQ",
  "KeyE",
  "KeyF",
  "KeyV",
]);

/**
 * Classic, chase, broadcast, high, and freestyle.
 * Classic keeps the opening south follow. Freestyle is the orbit.
 */
export function CameraRig() {
  const { camera, gl } = useThree();
  const controls = useRef<OrbitControls | null>(null);
  const keys = useRef(new Set<string>());
  const applied = useRef<CamMode | "">("");
  const spotting = useRef(false);
  const chase = useRef({ x: 0, z: -1 });
  const followed = useRef({ x: followTarget.x, y: followTarget.y, z: followTarget.z });
  /** Pre-snap orbit stays put until the formation or the camera mode changes. */
  const armedEye = useRef({
    mode: "" as CamMode | "",
    x: Number.NaN,
    z: Number.NaN,
    ex: Number.NaN,
    ey: Number.NaN,
    ez: Number.NaN,
  });
  /** Picture when pause began. A move from it commits the orbit. */
  const pauseEye = useRef<{ x: number; y: number; z: number } | null>(null);

  useEffect(() => {
    const orbit = new OrbitControls(camera, gl.domElement);
    orbit.target.set(followTarget.x, followTarget.y, followTarget.z);
    orbit.enableDamping = false;
    orbit.enablePan = false;
    orbit.minDistance = 2;
    orbit.maxDistance = 260;
    orbit.minPolarAngle = MIN_PITCH;
    orbit.maxPolarAngle = MAX_PITCH;
    orbit.zoomSpeed = 1.05;
    orbit.rotateSpeed = 0.72;
    orbit.panSpeed = 0.7;
    orbit.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN };
    orbit.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };
    orbit.update();
    controls.current = orbit;
    const down = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return;
      if (event.ctrlKey || event.metaKey) return;
      if (readTapeOn() && (TAPE_CAM_KEYS.has(event.code) || CAM_KEYS.has(event.code))) {
        event.preventDefault();
        keys.current.add(event.code);
        return;
      }
      if (replayCam.on) {
        if (event.code === "Digit0" || event.code === "Numpad0") {
          event.preventDefault();
          if (!event.repeat) replayCam.follow = !replayCam.follow;
          return;
        }
        if (
          event.code === "KeyQ" ||
          event.code === "KeyE" ||
          event.code === "KeyF" ||
          event.code === "KeyV" ||
          event.code === "PageUp" ||
          event.code === "PageDown" ||
          event.code === "Equal" ||
          event.code === "Minus" ||
          event.code === "NumpadAdd" ||
          event.code === "NumpadSubtract"
        ) {
          event.preventDefault();
        }
        replayKeyDown(event.code);
        return;
      }
      if (!CAM_KEYS.has(event.code)) return;
      const paused = readPaused();
      const freestyle = readCamMode() === "freestyle";
      const pauseOnly = event.code === "KeyQ" || event.code === "KeyE" || event.code === "KeyF" || event.code === "KeyV";
      if (!freestyle && !paused) return;
      if (pauseOnly && !paused) return;
      event.preventDefault();
      keys.current.add(event.code);
    };
    const up = (event: KeyboardEvent) => {
      keys.current.delete(event.code);
      replayKeyUp(event.code);
    };
    const clear = () => {
      keys.current.clear();
      replayHeld().clear();
    };
    // Cursor position picks page zoom or scene zoom. A focused canvas must not keep
    // the wheel after the pointer has moved onto the HUD, the banner, or the personnel buttons.
    const armSceneLook = () => {
      if (replayCam.on || readTapeOn()) return;
      if (!readAwaitSnap() && !readPaused()) return;
      orbit.enabled = true;
      orbit.enableZoom = true;
      orbit.enableRotate = !practiceSpotAiming();
    };
    const onWheel = (event: WheelEvent) => {
      const overScene = cursorOverScene(event.clientX, event.clientY, gl.domElement);
      const target = event.target;
      const aimedAtCanvas = target === gl.domElement || (target instanceof Node && gl.domElement.contains(target));
      if (!overScene) {
        if (aimedAtCanvas) event.stopImmediatePropagation();
        return;
      }
      armSceneLook();
      if (aimedAtCanvas || replayCam.on || readTapeOn() || !orbit.enabled || !orbit.enableZoom) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      dollyWheel(orbit, event.deltaY);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.button !== 2) return;
      if (!cursorOverScene(event.clientX, event.clientY, gl.domElement)) return;
      armSceneLook();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
      window.removeEventListener("wheel", onWheel, { capture: true });
      window.removeEventListener("pointerdown", onPointerDown, { capture: true });
      orbit.dispose();
      controls.current = null;
    };
  }, [camera, gl]);

  useFrame((_, dt) => {
    const orbit = controls.current;
    if (!orbit) return;
    const cam = camera as PerspectiveCamera;
    const step = Math.min(Math.max(dt, 0), 0.05);
    if (replayCam.on) {
      cam.up.set(0, 1, 0);
      orbit.enabled = true;
      orbit.enablePan = false;
      orbit.enableRotate = true;
      driveReplay(cam, orbit, dt);
      return;
    }
    if (replayCam.exitSnap) {
      replayCam.exitSnap = false;
      applied.current = "";
    }
    if (!readTapeOn()) markReplayFocus(0, 0, false);
    if (readTapeOn()) {
      driveTapeCamera(cam, orbit, step, keys.current, followed.current, chase.current, applied);
      return;
    }
    if (practiceSpotAiming()) {
      const entered = !spotting.current;
      spotting.current = true;
      if (entered) {
        const ox = followTarget.x - orbit.target.x;
        const oy = followTarget.y - orbit.target.y;
        const oz = followTarget.z - orbit.target.z;
        cam.position.x += ox;
        cam.position.y += oy;
        cam.position.z += oz;
        orbit.target.set(followTarget.x, followTarget.y, followTarget.z);
      } else {
        const dx = followTarget.x - followed.current.x;
        const dy = followTarget.y - followed.current.y;
        const dz = followTarget.z - followed.current.z;
        cam.position.x += dx;
        cam.position.y += dy;
        cam.position.z += dz;
        orbit.target.x += dx;
        orbit.target.y += dy;
        orbit.target.z += dz;
      }
      followed.current.x = followTarget.x;
      followed.current.y = followTarget.y;
      followed.current.z = followTarget.z;
      orbit.enabled = true;
      orbit.enableRotate = false;
      orbit.enablePan = false;
      orbit.enableZoom = true;
      orbit.update();
      return;
    }
    spotting.current = false;
    let mode = readCamMode();
    const paused = readPaused();
    // The pause screen keeps the current picture. Mouse drag, the wheel, and X/B can move it.
    if (mode !== "freestyle" && paused) {
      if (!pauseEye.current) {
        orbit.target.set(followTarget.x, followTarget.y, followTarget.z);
        pauseEye.current = { x: cam.position.x, y: cam.position.y, z: cam.position.z };
      }
      orbit.enabled = true;
      orbit.enablePan = false;
      orbit.enableRotate = !practiceSpotAiming();
      orbit.enableZoom = true;
      const gesture = readGesture(keys.current, true, false, true);
      if (gesture) {
        seatFreestyle(cam, orbit, false);
        followed.current.x = followTarget.x;
        followed.current.y = followTarget.y;
        followed.current.z = followTarget.z;
        setCamMode("freestyle");
        applyGesture(orbit, gesture, step);
        writeFreeCam(cam.position.x - orbit.target.x, cam.position.y - orbit.target.y, cam.position.z - orbit.target.z);
        applied.current = "freestyle";
        pauseEye.current = null;
        return;
      }
      const eye = pauseEye.current;
      const moved = Math.hypot(cam.position.x - eye.x, cam.position.y - eye.y, cam.position.z - eye.z) > 0.35;
      if (moved) {
        writeFreeCam(cam.position.x - orbit.target.x, cam.position.y - orbit.target.y, cam.position.z - orbit.target.z);
        followed.current.x = followTarget.x;
        followed.current.y = followTarget.y;
        followed.current.z = followTarget.z;
        setCamMode("freestyle");
        applied.current = "freestyle";
        pauseEye.current = null;
      }
      return;
    }
    pauseEye.current = null;
    if (mode === "freestyle") {
      if (applied.current !== "freestyle") {
        seatFreestyle(cam, orbit, true);
        followed.current.x = followTarget.x;
        followed.current.y = followTarget.y;
        followed.current.z = followTarget.z;
      }
      applied.current = "freestyle";
      driveFreestyle(cam, orbit, step, paused, keys.current, followed.current);
      return;
    }
    // Before the snap the formation holds still. Mouse, X/B, and the right stick
    // orbit that picture. A change is kept as freestyle so the snap does not put it back.
    if (readAwaitSnap()) {
      const jumped = Math.hypot(followTarget.x - armedEye.current.x, followTarget.z - armedEye.current.z) > 0.75;
      const seat = armedEye.current.mode !== mode || jumped;
      if (seat) {
        driveScripted(cam, orbit, mode, step, true, chase.current);
      }
      orbit.enabled = true;
      orbit.enablePan = false;
      orbit.enableRotate = !practiceSpotAiming();
      orbit.enableZoom = true;
      if (seat) orbit.update();
      const ownCamera = () => {
        writeFreeCam(cam.position.x - orbit.target.x, cam.position.y - orbit.target.y, cam.position.z - orbit.target.z);
        followed.current.x = followTarget.x;
        followed.current.y = followTarget.y;
        followed.current.z = followTarget.z;
        setCamMode("freestyle");
        applied.current = "freestyle";
        armedEye.current.mode = "";
      };
      const gesture = readGesture(keys.current, false, false, true);
      if (gesture) {
        seatFreestyle(cam, orbit, false);
        setCamMode("freestyle");
        applyGesture(orbit, gesture, step);
        ownCamera();
        return;
      }
      if (seat) {
        armedEye.current = {
          mode,
          x: followTarget.x,
          z: followTarget.z,
          ex: cam.position.x,
          ey: cam.position.y,
          ez: cam.position.z,
        };
      } else {
        const moved = Math.hypot(cam.position.x - armedEye.current.ex, cam.position.y - armedEye.current.ey, cam.position.z - armedEye.current.ez);
        if (moved > 0.05) ownCamera();
      }
      return;
    }
    armedEye.current = { mode: "", x: Number.NaN, z: Number.NaN, ex: Number.NaN, ey: Number.NaN, ez: Number.NaN };
    const snap = applied.current !== mode;
    applied.current = mode;
    driveScripted(cam, orbit, mode, step, snap, chase.current);
  });

  return null;
}

export const OrbitCamera = CameraRig;
