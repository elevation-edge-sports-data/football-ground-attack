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
import { practiceSpotAiming, previewRequested, readPaused, readProfile } from "../game/sim/boot";
import { radialDeadzone, readBasicPad, readRightStick, readTriggerZoom } from "../game/input";
import {
  defaultReplaySphere,
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
  if (held.has("PageUp") || held.has("Equal") || held.has("NumpadAdd")) dist *= Math.exp(-1.5 * step);
  if (held.has("PageDown") || held.has("Minus") || held.has("NumpadSubtract")) dist *= Math.exp(1.5 * step);
  dist = Math.max(2, Math.min(260, dist));
  pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch));
  const next = offsetFromSphere({ dist, yaw, pitch });
  if (replayCam.follow) placeOffset(camera, orbit, next.x, next.y, next.z);
  else camera.position.set(anchorX + next.x, anchorY + next.y, anchorZ + next.z);
  orbit.update();
}

function emptyGesture(): Gesture {
  return { stickYaw: 0, stickPitch: 0, keyYaw: 0, keyPitch: 0, zoom: 0 };
}

/**
 * Freestyle always reads the right stick and the bracket / page keys.
 * Pause also reads the left stick, Q/E, F/V, and the triggers, then commits to freestyle.
 */
function readGesture(keys: ReadonlySet<string>, paused: boolean, freestyle: boolean, rightStick: boolean): Gesture | null {
  if (!freestyle && !paused) return null;
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
  const gesture = readGesture(keys, paused, true, rightStickOrbits(paused));
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
  const chase = useRef({ x: 0, z: -1 });
  const followed = useRef({ x: followTarget.x, y: followTarget.y, z: followTarget.z });

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
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
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
    let mode = readCamMode();
    const paused = readPaused();
    if (mode !== "freestyle" && paused) {
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
        return;
      }
    }
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
    const snap = applied.current !== mode;
    applied.current = mode;
    driveScripted(cam, orbit, mode, step, snap, chase.current);
  });

  return null;
}

export const OrbitCamera = CameraRig;
