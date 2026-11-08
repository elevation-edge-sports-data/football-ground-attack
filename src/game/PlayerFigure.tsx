import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import {
  Box3,
  CanvasTexture,
  DoubleSide,
  Matrix4,
  MeshStandardMaterial,
  NearestFilter,
  SRGBColorSpace,
  Vector3,
  type Group,
  type Mesh,
  type Object3D,
  type Texture,
} from "three";
import { applyPoseJoints, resetPoseJoints } from "./poseOverrides";
import { POSE_JOINTS, REST_POSITION, type PoseJointId } from "./pose";
import {
  forearmColor,
  gloveColor,
  pantStripeColor,
  sleeveStripeColor,
  type Uniform,
} from "./uniforms";

function Joint({
  id,
  register,
  children,
}: {
  id: PoseJointId;
  register: (id: PoseJointId, node: Object3D | null) => void;
  children?: ReactNode;
}) {
  const registerRef = useRef(register);
  const idRef = useRef(id);
  registerRef.current = register;
  idRef.current = id;
  const setRef = useCallback((node: Object3D | null) => {
    registerRef.current(idRef.current, node);
  }, []);
  return (
    <group name={id} position={REST_POSITION[id]} ref={setRef}>
      {children}
    </group>
  );
}

/** Hierarchical football body. Local −Z is the front. */
export function PlayerFigure({
  kit,
  number,
  controlled,
  carry = controlled,
  ballSide = "r",
  pose,
  ring = false,
  onJointRefs,
  onJointClick,
}: {
  kit: Uniform;
  number: number;
  controlled: boolean;
  /** Show the ball. Defaults to the controlled player, on the right hand. */
  carry?: boolean;
  ballSide?: "l" | "r";
  /** Saved pose applied on the field. The pose editor leaves this unset and drives the joints itself. */
  pose?: string;
  /** Ground ring in the pose editor. The controlled player already has one. */
  ring?: boolean;
  onJointRefs?: (refs: Partial<Record<PoseJointId, Object3D | null>>) => void;
  onJointClick?: (id: PoseJointId) => void;
}) {
  const jointRefs = useRef<Partial<Record<PoseJointId, Object3D | null>>>({});
  const alignRef = useRef<Group>(null);
  const posed = useRef(false);
  const appliedPose = useRef<string | undefined>(undefined);
  const poseName = useRef(pose);
  poseName.current = pose;
  const clickRef = useRef(onJointClick);
  clickRef.current = onJointClick;
  const register = useCallback((id: PoseJointId, node: Object3D | null) => {
    if (node) {
      jointRefs.current[id] = node;
      if (clickRef.current) node.userData.poseJoint = id;
      else delete node.userData.poseJoint;
    } else {
      const prev = jointRefs.current[id];
      if (prev) delete prev.userData.poseJoint;
      delete jointRefs.current[id];
    }
  }, []);

  useLayoutEffect(() => {
    if (!onJointRefs) return;
    onJointRefs({ ...jointRefs.current });
  }, [onJointRefs, kit, number, controlled, carry, ballSide]);

  const paintPose = useCallback(() => {
    const name = poseName.current;
    if (!name) {
      if (posed.current) {
        resetPoseJoints(jointRefs.current);
        posed.current = false;
        appliedPose.current = undefined;
      }
      if (alignRef.current) alignRef.current.userData.figurePose = "";
      return;
    }
    // Joint refs attach during commit. A layout pass can run before they exist
    // and leave the bind pose up. Retry once the body group is actually there.
    if (!jointRefs.current.body) return;
    if (alignRef.current) alignRef.current.userData.figurePose = name;
    if (appliedPose.current === name) return;
    appliedPose.current = name;
    posed.current = true;
    applyPoseJoints(name, jointRefs.current);
    if (controlled) centerFigureOnRing(alignRef.current);
  }, [controlled]);

  useLayoutEffect(() => {
    appliedPose.current = undefined;
    paintPose();
  }, [paintPose, pose, carry, ballSide, controlled]);

  useFrame(paintPose);

  const selectPart = useCallback((event: ThreeEvent<MouseEvent>) => {
    const pick = clickRef.current;
    if (!pick || event.delta > 2) return;
    event.stopPropagation();
    let node: Object3D | null = event.object;
    while (node) {
      const id = node.userData.poseJoint;
      if (typeof id === "string" && (POSE_JOINTS as readonly string[]).includes(id)) {
        pick(id as PoseJointId);
        return;
      }
      node = node.parent;
    }
  }, []);

  return (
    <group onClick={onJointClick ? selectPart : undefined}>
      {controlled || ring ? (
        <mesh name="player-ring" rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
          <ringGeometry args={[0.52, 0.68, 24]} />
          <meshBasicMaterial color="#f4efe4" side={DoubleSide} />
        </mesh>
      ) : null}
      <group ref={alignRef} name={FIGURE_ALIGN}>
      <Joint id="body" register={register}>
        <Joint id="hips" register={register}>
          {/* Inside the jersey on every side, so the hem is one jersey edge. */}
          <mesh position={[0, -0.04, 0]}>
            <boxGeometry args={[0.4, 0.28, 0.22]} />
            <meshStandardMaterial color={kit.pants} roughness={0.7} />
          </mesh>
          <Leg side="l" kit={kit} register={register} />
          <Leg side="r" kit={kit} register={register} />
        </Joint>
        <Joint id="torso" register={register}>
          <mesh position={[0, 0.24, 0]}>
            <boxGeometry args={[0.48, 0.58, 0.3]} />
            <meshStandardMaterial color={kit.jersey} roughness={0.62} />
          </mesh>
          <JerseyNumber number={number} fill={kit.number} outline={kit.numOutline} position={[0, 0.25, -0.16]} rotation={[0, Math.PI, 0]} />
          <JerseyNumber number={number} fill={kit.number} outline={kit.numOutline} position={[0, 0.25, 0.16]} rotation={[0, 0, 0]} />
          <Joint id="shoulders" register={register}>
            <mesh>
              <boxGeometry args={[0.725, 0.12, 0.286]} />
              <meshStandardMaterial color={kit.jersey} roughness={0.62} />
            </mesh>
            <Joint id="head" register={register}>
              <HelmetShell count={kit.helmStripes} helmet={kit.helmet} stripe={kit.helmStripeCol} edge={kit.helmStripeEdge} />
              <mesh position={[0, 0.11375, -0.15]} rotation={[-Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.11, 0.009, 6, 12, Math.PI]} />
                <meshStandardMaterial color={kit.facemask} roughness={0.35} />
              </mesh>
              <mesh position={[0, 0.0825, -0.15]} rotation={[-Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.11, 0.009, 6, 12, Math.PI]} />
                <meshStandardMaterial color={kit.facemask} roughness={0.35} />
              </mesh>
              <mesh position={[0, 0.02, -0.15]} rotation={[-Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.11, 0.009, 6, 12, Math.PI]} />
                <meshStandardMaterial color={kit.facemask} roughness={0.35} />
              </mesh>
              <mesh position={[0, 0.066875, -0.26]}>
                <cylinderGeometry args={[0.0075, 0.0075, 0.09375, 8]} />
                <meshStandardMaterial color={kit.facemask} roughness={0.35} />
              </mesh>
              <mesh position={[-0.045, 0.066875, -0.2504]}>
                <cylinderGeometry args={[0.0075, 0.0075, 0.09375, 8]} />
                <meshStandardMaterial color={kit.facemask} roughness={0.35} />
              </mesh>
              <mesh position={[0.045, 0.066875, -0.2504]}>
                <cylinderGeometry args={[0.0075, 0.0075, 0.09375, 8]} />
                <meshStandardMaterial color={kit.facemask} roughness={0.35} />
              </mesh>
            </Joint>
            <Arm side="l" kit={kit} carry={carry && ballSide === "l"} register={register} />
            <Arm side="r" kit={kit} carry={carry && ballSide === "r"} register={register} />
          </Joint>
        </Joint>
      </Joint>
      </group>
    </group>
  );
}

function hasNamedAncestor(obj: Object3D, name: string) {
  let node: Object3D | null = obj;
  while (node) {
    if (node.name === name) return true;
    node = node.parent;
  }
  return false;
}

const _alignInverse = new Matrix4();
const _alignPoint = new Vector3();
const _alignBox = new Box3();

/** Keep the posed body over the ground ring. Dive pitches swing the mesh forward otherwise. */
function centerFigureOnRing(align: Group | null) {
  if (!align) return;
  align.position.set(0, 0, 0);
  align.updateWorldMatrix(true, true);
  _alignInverse.copy(align.matrixWorld).invert();
  _alignBox.makeEmpty();
  let any = false;
  align.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh || !mesh.geometry || hasNamedAncestor(mesh, "football")) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bounds = mesh.geometry.boundingBox;
    if (!bounds) return;
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          _alignPoint.set(x, y, z).applyMatrix4(mesh.matrixWorld).applyMatrix4(_alignInverse);
          _alignBox.expandByPoint(_alignPoint);
          any = true;
        }
      }
    }
  });
  if (!any) return;
  _alignBox.getCenter(_alignPoint);
  align.position.set(-_alignPoint.x, 0, -_alignPoint.z);
}

function Leg({
  side,
  kit,
  register,
}: {
  side: "l" | "r";
  kit: Uniform;
  register: (id: PoseJointId, node: Object3D | null) => void;
}) {
  const leg = side === "l" ? "lLeg" : "rLeg";
  const shin = side === "l" ? "lShin" : "rShin";
  const foot = side === "l" ? "lFoot" : "rFoot";
  const outer = side === "l" ? -1 : 1;
  return (
    <Joint id={leg} register={register}>
      <PantsThigh count={kit.pantStripes} pants={kit.pants} stripe={pantStripeColor(kit)} edge={kit.pantStripeEdge} outer={outer} />
      <Joint id={shin} register={register}>
        <mesh position={[0, -0.165, 0]}>
          <boxGeometry args={[0.13, 0.37, 0.16]} />
          <meshStandardMaterial color={kit.socks} roughness={0.65} />
        </mesh>
        <Joint id={foot} register={register}>
          <mesh position={[0, 0, -0.005]}>
            <boxGeometry args={[0.15, 0.1, 0.19]} />
            <meshStandardMaterial color={kit.shoes} roughness={0.55} />
          </mesh>
          <mesh position={[0, -0.041, -0.059]}>
            <boxGeometry args={[0.15, 0.088, 0.298]} />
            <meshStandardMaterial color={kit.shoes} roughness={0.55} />
          </mesh>
        </Joint>
      </Joint>
    </Joint>
  );
}

function Arm({
  side,
  kit,
  register,
  carry = false,
}: {
  side: "l" | "r";
  kit: Uniform;
  register: (id: PoseJointId, node: Object3D | null) => void;
  carry?: boolean;
}) {
  const arm = side === "l" ? "lArm" : "rArm";
  const fore = side === "l" ? "lFore" : "rFore";
  const hand = side === "l" ? "lHand" : "rHand";
  return (
    <Joint id={arm} register={register}>
      <Sleeve count={kit.sleeveStripes} jersey={kit.jersey} stripe={sleeveStripeColor(kit)} gap={kit.sleeveGapCol} />
      <Joint id={fore} register={register}>
        <mesh position={[0, -0.14, -0.005]}>
          <boxGeometry args={[0.13, 0.32, 0.16]} />
          <meshStandardMaterial color={forearmColor(kit)} roughness={0.62} />
        </mesh>
        <Joint id={hand} register={register}>
          <mesh position={[0, -0.06, -0.02]}>
            <boxGeometry args={[0.1, 0.1, 0.12]} />
            <meshStandardMaterial color={gloveColor(kit)} roughness={0.5} />
          </mesh>
          {carry ? (
            <Joint id="football" register={register}>
              <Football />
            </Joint>
          ) : null}
        </Joint>
      </Joint>
    </Joint>
  );
}

/** Leather sphere before the carry scale. The long axis is local X. */
export const FOOTBALL_RADIUS = 0.206;
/** Align group on a field figure. The sim reads `userData.figurePose` from it. */
export const FIGURE_ALIGN = "figure-align";
/** Volume is 0.6 * 0.7 of the base ball: a 40% cut, then another 30%. */
const BALL_SCALE = Math.cbrt(0.6 * 0.7);
const LACE = "#f4f1ea";
const LACE_HALF = 0.145;

function laceHeight(x: number) {
  return Math.sqrt(Math.max(0, FOOTBALL_RADIUS * FOOTBALL_RADIUS - x * x));
}

const CROSS_LACES = Array.from({ length: 8 }, (_, i) => {
  const x = -LACE_HALF * 0.84 + (i * (LACE_HALF * 1.68)) / 7;
  return { x, y: laceHeight(x) + 0.002 };
});

const LACE_START = CROSS_LACES[0]?.x ?? -LACE_HALF;
const LACE_END = CROSS_LACES[7]?.x ?? LACE_HALF;

const LONG_LACE = Array.from({ length: 10 }, (_, i) => {
  const x0 = LACE_START + (i * (LACE_END - LACE_START)) / 10;
  const x1 = LACE_START + ((i + 1) * (LACE_END - LACE_START)) / 10;
  const x = (x0 + x1) / 2;
  const y0 = laceHeight(x0);
  const y1 = laceHeight(x1);
  const rot = Math.atan2(y1 - y0, x1 - x0);
  const lift = 0.003;
  return {
    x: x - Math.sin(rot) * lift,
    y: laceHeight(x) + Math.cos(rot) * lift,
    len: Math.hypot(x1 - x0, y1 - y0),
    rot,
  };
});

function Football() {
  return (
    <group name="football-body" scale={[1.25 * BALL_SCALE, 0.78 * BALL_SCALE, 0.78 * BALL_SCALE]}>
      <mesh>
        <sphereGeometry args={[FOOTBALL_RADIUS, 48, 32]} />
        <meshStandardMaterial color="#6b3a2a" roughness={0.55} />
      </mesh>
      {LONG_LACE.map((lace) => (
        <mesh key={lace.x} position={[lace.x, lace.y, 0]} rotation={[0, 0, lace.rot]}>
          <boxGeometry args={[lace.len, 0.012, 0.022]} />
          <meshStandardMaterial color={LACE} roughness={0.45} />
        </mesh>
      ))}
      {CROSS_LACES.map((lace) => (
        <mesh key={lace.x} position={[lace.x, lace.y, 0]}>
          <boxGeometry args={[0.014, 0.01, 0.056]} />
          <meshStandardMaterial color={LACE} roughness={0.45} />
        </mesh>
      ))}
    </group>
  );
}

function makeTexture(width: number, height: number, paint: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("Missing 2D context");
  paint(g, width, height);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function faceMaterials(color: string, roughness: number, maps: Array<CanvasTexture | null>) {
  return maps.map(
    (map) =>
      new MeshStandardMaterial({
        color: map ? "#ffffff" : color,
        map,
        roughness,
      }),
  );
}

function disposeMaterials(materials: MeshStandardMaterial[]) {
  const maps = new Set<Texture>();
  for (const material of materials) {
    if (material.map) maps.add(material.map);
    material.dispose();
  }
  for (const map of maps) map.dispose();
}

function useFaceMaterials(color: string, roughness: number, maps: Array<CanvasTexture | null>) {
  const materials = useMemo(() => faceMaterials(color, roughness, maps), [color, roughness, maps]);
  useEffect(() => () => disposeMaterials(materials), [materials]);
  return materials;
}

/** Box faces: +X, −X, +Y, −Y, +Z, −Z. A map recolors that face of the same box. */
function StripedBox({
  args,
  position,
  color,
  roughness,
  maps,
}: {
  args: [number, number, number];
  position: [number, number, number];
  color: string;
  roughness: number;
  maps: Array<CanvasTexture | null>;
}) {
  const materials = useFaceMaterials(color, roughness, maps);
  return (
    <mesh position={position} material={materials}>
      <boxGeometry args={args} />
    </mesh>
  );
}

function sleeveStripeMap(count: number, jersey: string, stripe: string, gap?: string) {
  if (count <= 0) return null;
  // Two-stripe kits, including kit 3, put the lower ring at -0.145. Triples use that same lower ring.
  const ys = count >= 3 ? [-0.065, -0.105, -0.145] : [-0.085, -0.145];
  const height = 0.34;
  const half = height / 2;
  const bandWorld = 0.028;
  return makeTexture(32, 128, (g, w, h) => {
    g.fillStyle = jersey;
    g.fillRect(0, 0, w, h);
    const band = (bandWorld / height) * h;
    if (gap && ys.length >= 2) {
      const ordered = [...ys].sort((a, b) => a - b);
      const low = ordered[0]!;
      const high = ordered[ordered.length - 1]!;
      const top = (1 - (high - bandWorld / 2 + half) / height) * h;
      const bottom = (1 - (low + bandWorld / 2 + half) / height) * h;
      g.fillStyle = gap;
      g.fillRect(0, Math.min(top, bottom), w, Math.abs(bottom - top));
    }
    g.fillStyle = stripe;
    for (const y of ys) {
      const v = (y + half) / height;
      g.fillRect(0, (1 - v) * h - band / 2, w, band);
    }
  });
}

function Sleeve({ count, jersey, stripe, gap }: { count: number; jersey: string; stripe: string; gap?: string }) {
  const maps = useMemo(() => {
    const tex = sleeveStripeMap(count, jersey, stripe, gap);
    return [tex, tex, null, null, tex, tex];
  }, [count, jersey, stripe, gap]);
  return <StripedBox args={[0.2, 0.34, 0.2]} position={[0, -0.155, 0]} color={jersey} roughness={0.62} maps={maps} />;
}

function pantStripeMap(count: number, outer: -1 | 1, pants: string, stripe: string, edge?: string) {
  if (count <= 0) return null;
  // Kit 3 is the two-stripe pair. Keep those bands nearer each other than the old ±0.04 split.
  const zs = count >= 3 ? [-0.06, 0, 0.06] : count === 2 ? [-0.022, 0.022] : [0];
  const depth = 0.22;
  const half = depth / 2;
  const bandWorld = 0.028;
  return makeTexture(128, 32, (g, w, h) => {
    g.fillStyle = pants;
    g.fillRect(0, 0, w, h);
    const band = (bandWorld / depth) * w;
    const paint = (z: number) => {
      const u = outer > 0 ? (half - z) / depth : (z + half) / depth;
      g.fillRect(u * w - band / 2, 0, band, h);
    };
    // Edge bands match the center stripe's width and run the full side of the thigh.
    if (edge) {
      g.fillStyle = edge;
      for (const z of zs) {
        paint(z - bandWorld);
        paint(z + bandWorld);
      }
    }
    g.fillStyle = stripe;
    for (const z of zs) paint(z);
  });
}

function PantsThigh({
  count,
  pants,
  stripe,
  edge,
  outer,
}: {
  count: number;
  pants: string;
  stripe: string;
  edge?: string;
  outer: -1 | 1;
}) {
  const maps = useMemo(() => {
    const tex = pantStripeMap(count, outer, pants, stripe, edge);
    const slots: Array<CanvasTexture | null> = [null, null, null, null, null, null];
    slots[outer > 0 ? 0 : 1] = tex;
    return slots;
  }, [count, outer, pants, stripe, edge]);
  return <StripedBox args={[0.2, 0.44, 0.22]} position={[0, -0.2, 0]} color={pants} roughness={0.7} maps={maps} />;
}

function helmetMaps(count: number, helmet: string, stripe: string, edge?: string) {
  const blank: Array<CanvasTexture | null> = [null, null, null, null, null, null];
  if (count <= 0) return blank;
  const xs = count >= 3 ? [-0.07, 0, 0.07] : count === 2 ? [-0.05, 0.05] : [0];
  const width = 0.244;
  const half = width / 2;
  const bandWorld = 0.028;
  const paint = (g: CanvasRenderingContext2D, w: number, h: number, down: number) => {
    g.fillStyle = helmet;
    g.fillRect(0, 0, w, h);
    const band = (bandWorld / width) * w;
    const paintBand = (x: number) => {
      const u = (x + half) / width;
      g.fillRect(u * w - band / 2, 0, band, h * down);
    };
    // Edge bands match the center stripe's width and stop at the same point down the shell.
    if (edge) {
      g.fillStyle = edge;
      for (const x of xs) {
        paintBand(x - bandWorld);
        paintBand(x + bandWorld);
      }
    }
    g.fillStyle = stripe;
    for (const x of xs) paintBand(x);
  };
  const full = makeTexture(128, 128, (g, w, h) => paint(g, w, h, 1));
  const front = makeTexture(128, 128, (g, w, h) => paint(g, w, h, 0.25));
  blank[2] = full;
  blank[4] = full;
  blank[5] = front;
  return blank;
}

function HelmetShell({
  count,
  helmet,
  stripe,
  edge,
}: {
  count: number;
  helmet: string;
  stripe: string;
  edge?: string;
}) {
  const maps = useMemo(() => helmetMaps(count, helmet, stripe, edge), [count, helmet, stripe, edge]);
  return <StripedBox args={[0.244, 0.27, 0.3]} position={[0, 0.143, 0]} color={helmet} roughness={0.4} maps={maps} />;
}

const DIGIT_URLS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"].map(
  (digit) => new URL(`./digits/${digit}.png`, import.meta.url).href,
);

let loadedDigits: HTMLImageElement[] | null = null;
let digitLoad: Promise<HTMLImageElement[]> | null = null;

function loadDigits() {
  if (loadedDigits) return Promise.resolve(loadedDigits);
  if (!digitLoad) {
    digitLoad = Promise.all(
      DIGIT_URLS.map(
        (src) =>
          new Promise<HTMLImageElement>((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error(src));
            image.src = src;
          }),
      ),
    ).then((images) => {
      loadedDigits = images;
      return images;
    });
  }
  return digitLoad;
}

function colorChannels(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Keep the main glyph and drop the extra outline rings baked into the mask. */
function mainGlyph(mask: Uint8Array, w: number, h: number) {
  const seen = new Uint8Array(w * h);
  let bestStart = -1;
  let bestCount = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] !== 1 || seen[i] === 1) continue;
    const stack = [i];
    seen[i] = 1;
    let count = 0;
    let start = i;
    while (stack.length > 0) {
      const cur = stack.pop() ?? 0;
      count++;
      const cx = cur % w;
      const cy = (cur - cx) / w;
      const neighbors = [cur - 1, cur + 1, cur - w, cur + w];
      for (const next of neighbors) {
        if (next < 0 || next >= mask.length || seen[next] === 1 || mask[next] !== 1) continue;
        const nx = next % w;
        if (Math.abs(nx - cx) > 1) continue;
        if (cy < 0 || cy >= h) continue;
        seen[next] = 1;
        stack.push(next);
      }
    }
    if (count > bestCount) {
      bestCount = count;
      bestStart = start;
    }
  }
  const glyph = new Uint8Array(w * h);
  if (bestStart < 0) return glyph;
  const stack = [bestStart];
  glyph[bestStart] = 1;
  while (stack.length > 0) {
    const cur = stack.pop() ?? 0;
    const cx = cur % w;
    const neighbors = [cur - 1, cur + 1, cur - w, cur + w];
    for (const next of neighbors) {
      if (next < 0 || next >= mask.length || glyph[next] === 1 || mask[next] !== 1) continue;
      const nx = next % w;
      if (Math.abs(nx - cx) > 1) continue;
      glyph[next] = 1;
      stack.push(next);
    }
  }
  return glyph;
}

const NUMBER_H = 480;

type DigitStamp = {
  w: number;
  h: number;
  /** 0 empty, 1 fill, 2 the single outline ring. */
  kind: Uint8Array;
};

const stamps = new Map<number, DigitStamp>();
const tintedDigits = new Map<string, HTMLCanvasElement>();
const diskByTrim = new Map<number, Int16Array>();

function diskOffsets(trim: number) {
  const cached = diskByTrim.get(trim);
  if (cached) return cached;
  const t2 = trim * trim;
  const list: number[] = [];
  for (let oy = -trim; oy <= trim; oy++) {
    for (let ox = -trim; ox <= trim; ox++) {
      if (ox * ox + oy * oy <= t2) list.push(ox, oy);
    }
  }
  const offsets = Int16Array.from(list);
  diskByTrim.set(trim, offsets);
  return offsets;
}

/**
 * Same fill-plus-one-ring as the old per-pixel search. The ring is stamped
 * from the glyph edge, once per digit, and reused for every jersey color.
 */
function stampFor(digit: number, image: HTMLImageElement): DigitStamp | null {
  const cached = stamps.get(digit);
  if (cached) return cached;
  const h = NUMBER_H;
  const w = Math.max(1, Math.round(h * (image.width / image.height)));
  const scratch = document.createElement("canvas");
  scratch.width = w;
  scratch.height = h;
  const g = scratch.getContext("2d", { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(image, 0, 0, w, h);
  const src = g.getImageData(0, 0, w, h).data;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = (src[i * 4 + 3] ?? 0) > 160 ? 1 : 0;
  const glyph = mainGlyph(mask, w, h);
  const trim = Math.max(2, Math.round(h * 0.018));
  const offsets = diskOffsets(trim);
  const kind = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const i = row + x;
      if (glyph[i] !== 1) continue;
      kind[i] = 1;
      let boundary = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      if (!boundary) {
        for (let oy = -1; oy <= 1 && !boundary; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            if (glyph[(y + oy) * w + (x + ox)] !== 1) boundary = true;
          }
        }
      }
      if (!boundary) continue;
      for (let k = 0; k < offsets.length; k += 2) {
        const xx = x + (offsets[k] ?? 0);
        const yy = y + (offsets[k + 1] ?? 0);
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (kind[j] === 0) kind[j] = 2;
      }
    }
  }
  const stamp = { w, h, kind };
  stamps.set(digit, stamp);
  return stamp;
}

function tintedDigit(digit: number, image: HTMLImageElement, fill: string, outline: string) {
  const key = `${digit}|${fill}|${outline}`;
  const cached = tintedDigits.get(key);
  if (cached) return cached;
  const stamp = stampFor(digit, image);
  if (!stamp) return null;
  const canvas = document.createElement("canvas");
  canvas.width = stamp.w;
  canvas.height = stamp.h;
  const g = canvas.getContext("2d");
  if (!g) return null;
  const out = g.createImageData(stamp.w, stamp.h);
  const [fr, fg, fb] = colorChannels(fill);
  const [or, og, ob] = colorChannels(outline);
  for (let i = 0; i < stamp.kind.length; i++) {
    const kind = stamp.kind[i];
    if (!kind) continue;
    const p = i * 4;
    const on = kind === 1;
    out.data[p] = on ? (fr ?? 0) : (or ?? 0);
    out.data[p + 1] = on ? (fg ?? 0) : (og ?? 0);
    out.data[p + 2] = on ? (fb ?? 0) : (ob ?? 0);
    out.data[p + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  tintedDigits.set(key, canvas);
  return canvas;
}

type DrawnNumber = {
  texture: CanvasTexture;
  width: number;
  height: number;
};

type NumberEntry = {
  refs: number;
  drop: number;
  drawn: DrawnNumber | null;
};

const numberCache = new Map<string, NumberEntry>();
const numberListeners = new Set<() => void>();
const numberQueue: Array<{ key: string; number: number; fill: string; outline: string }> = [];
const numberQueued = new Set<string>();
let numberPump = false;
let numberPumpAt = 0;

function numberKey(number: number, fill: string, outline: string) {
  return `${number}|${fill}|${outline}`;
}

function subscribeNumbers(listener: () => void) {
  numberListeners.add(listener);
  return () => numberListeners.delete(listener);
}

function peekNumber(number: number, fill: string, outline: string) {
  return numberCache.get(numberKey(number, fill, outline))?.drawn ?? null;
}

function emitNumbers() {
  for (const listener of numberListeners) listener();
}

function composeNumber(number: number, fill: string, outline: string, images: HTMLImageElement[]) {
  const text = String(number);
  const gap = Math.round(NUMBER_H * 0.08);
  const pad = Math.round(NUMBER_H * 0.06);
  const cells: HTMLCanvasElement[] = [];
  for (const ch of text) {
    const digit = Number(ch);
    const image = images[digit];
    if (!image) return null;
    const tinted = tintedDigit(digit, image, fill, outline);
    if (!tinted) return null;
    cells.push(tinted);
  }
  const totalW = cells.reduce((sum, cell) => sum + cell.width, 0) + gap * Math.max(0, cells.length - 1);
  const canvas = document.createElement("canvas");
  canvas.width = totalW + pad * 2;
  canvas.height = NUMBER_H + pad * 2;
  const g = canvas.getContext("2d");
  if (!g) return null;
  g.clearRect(0, 0, canvas.width, canvas.height);
  let x = pad;
  for (const cell of cells) {
    g.drawImage(cell, x, pad);
    x += cell.width + gap;
  }
  return {
    canvas,
    width: 0.44,
    height: 0.44 * (canvas.height / canvas.width),
  };
}

function startNumberPump() {
  if (numberPump) return;
  numberPump = true;
  numberPumpAt = performance.now();
  requestAnimationFrame(pumpNumbers);
}

function pumpNumbers() {
  const images = loadedDigits;
  if (!images) {
    numberPump = false;
    return;
  }
  const start = performance.now();
  let built = 0;
  while (numberQueue.length > 0 && performance.now() - start < 8) {
    const job = numberQueue.shift();
    if (!job) break;
    numberQueued.delete(job.key);
    const entry = numberCache.get(job.key);
    if (!entry || entry.refs <= 0 || entry.drawn) continue;
    const composed = composeNumber(job.number, job.fill, job.outline, images);
    if (!composed) continue;
    const texture = new CanvasTexture(composed.canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    entry.drawn = { texture, width: composed.width, height: composed.height };
    built += 1;
  }
  if (built > 0) emitNumbers();
  if (numberQueue.length > 0) {
    requestAnimationFrame(pumpNumbers);
    return;
  }
  numberPump = false;
  const textures = [...numberCache.values()].filter((entry) => entry.drawn).length;
  console.log("[numbers] cache filled", {
    textures,
    stamps: stamps.size,
    ms: Math.round(performance.now() - numberPumpAt),
  });
}

function enqueueNumber(key: string, number: number, fill: string, outline: string) {
  if (numberQueued.has(key) || numberCache.get(key)?.drawn) return;
  numberQueued.add(key);
  numberQueue.push({ key, number, fill, outline });
  void loadDigits()
    .then(() => startNumberPump())
    .catch(() => {});
}

/** Share one texture for a number and kit color. Front and back both retain it. */
function retainNumber(number: number, fill: string, outline: string) {
  const key = numberKey(number, fill, outline);
  let entry = numberCache.get(key);
  if (!entry) {
    entry = { refs: 0, drop: 0, drawn: null };
    numberCache.set(key, entry);
  }
  if (entry.drop) {
    cancelAnimationFrame(entry.drop);
    entry.drop = 0;
  }
  entry.refs += 1;
  if (!entry.drawn) enqueueNumber(key, number, fill, outline);
  return () => {
    entry.refs -= 1;
    if (entry.refs > 0) return;
    entry.drop = requestAnimationFrame(() => {
      entry.drop = 0;
      if (entry.refs > 0) return;
      entry.drawn?.texture.dispose();
      if (numberCache.get(key) === entry) numberCache.delete(key);
      const index = numberQueue.findIndex((job) => job.key === key);
      if (index >= 0) numberQueue.splice(index, 1);
      numberQueued.delete(key);
    });
  };
}

if (typeof window !== "undefined") {
  void loadDigits().catch((err) => console.error("[numbers] digit load failed", err));
}

function JerseyNumber({
  number,
  fill,
  outline,
  position,
  rotation,
}: {
  number: number;
  fill: string;
  outline: string;
  position: [number, number, number];
  rotation: [number, number, number];
}) {
  const drawn = useSyncExternalStore(
    subscribeNumbers,
    () => peekNumber(number, fill, outline),
    () => null,
  );
  useEffect(() => retainNumber(number, fill, outline), [number, fill, outline]);
  if (!drawn) return null;
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[drawn.width, drawn.height]} />
      {/* Same hex as the helmet or sleeve stripes. Lit, so it is not a brighter unlit decal. */}
      <meshStandardMaterial map={drawn.texture} transparent depthWrite={false} roughness={0.62} />
    </mesh>
  );
}
