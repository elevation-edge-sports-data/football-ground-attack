import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CanvasTexture,
  DoubleSide,
  MeshStandardMaterial,
  NearestFilter,
  SRGBColorSpace,
  type Texture,
} from "three";
import { REST_POSITION, type PoseJointId } from "./pose";
import {
  forearmColor,
  pantStripeColor,
  sleeveStripeColor,
  type Uniform,
} from "./uniforms";

function Joint({ id, children }: { id: PoseJointId; children?: ReactNode }) {
  return (
    <group name={id} position={REST_POSITION[id]}>
      {children}
    </group>
  );
}

/** Hierarchical football body. Local −Z is the front. */
export function PlayerFigure({
  kit,
  number,
  controlled,
}: {
  kit: Uniform;
  number: number;
  controlled: boolean;
}) {
  return (
    <group>
      {controlled ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
          <ringGeometry args={[0.52, 0.68, 24]} />
          <meshBasicMaterial color="#f4efe4" side={DoubleSide} />
        </mesh>
      ) : null}
      <Joint id="body">
        <Joint id="hips">
          {/* Inside the jersey on every side, so the hem is one jersey edge. */}
          <mesh position={[0, -0.04, 0]}>
            <boxGeometry args={[0.4, 0.28, 0.22]} />
            <meshStandardMaterial color={kit.pants} roughness={0.7} />
          </mesh>
          <Leg side="l" kit={kit} />
          <Leg side="r" kit={kit} />
        </Joint>
        <Joint id="torso">
          <mesh position={[0, 0.24, 0]}>
            <boxGeometry args={[0.48, 0.58, 0.3]} />
            <meshStandardMaterial color={kit.jersey} roughness={0.62} />
          </mesh>
          <JerseyNumber number={number} fill={kit.number} outline={kit.numOutline} position={[0, 0.25, -0.16]} rotation={[0, Math.PI, 0]} />
          <JerseyNumber number={number} fill={kit.number} outline={kit.numOutline} position={[0, 0.25, 0.16]} rotation={[0, 0, 0]} />
          <Joint id="shoulders">
            <mesh>
              <boxGeometry args={[0.725, 0.12, 0.286]} />
              <meshStandardMaterial color={kit.jersey} roughness={0.62} />
            </mesh>
            <Joint id="head">
              <HelmetShell count={kit.helmStripes} helmet={kit.helmet} stripe={kit.helmStripeCol} />
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
            <Arm side="l" kit={kit} />
            <Arm side="r" kit={kit} carry={controlled} />
          </Joint>
        </Joint>
      </Joint>
    </group>
  );
}

function Leg({ side, kit }: { side: "l" | "r"; kit: Uniform }) {
  const leg = side === "l" ? "lLeg" : "rLeg";
  const shin = side === "l" ? "lShin" : "rShin";
  const foot = side === "l" ? "lFoot" : "rFoot";
  const outer = side === "l" ? -1 : 1;
  return (
    <Joint id={leg}>
      <PantsThigh count={kit.pantStripes} pants={kit.pants} stripe={pantStripeColor(kit)} outer={outer} />
      <Joint id={shin}>
        <mesh position={[0, -0.165, 0]}>
          <boxGeometry args={[0.13, 0.37, 0.16]} />
          <meshStandardMaterial color={kit.socks} roughness={0.65} />
        </mesh>
        <Joint id={foot}>
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
  carry = false,
}: {
  side: "l" | "r";
  kit: Uniform;
  carry?: boolean;
}) {
  const arm = side === "l" ? "lArm" : "rArm";
  const fore = side === "l" ? "lFore" : "rFore";
  const hand = side === "l" ? "lHand" : "rHand";
  return (
    <Joint id={arm}>
      <Sleeve count={kit.sleeveStripes} jersey={kit.jersey} stripe={sleeveStripeColor(kit)} />
      <Joint id={fore}>
        <mesh position={[0, -0.14, -0.005]}>
          <boxGeometry args={[0.13, 0.32, 0.16]} />
          <meshStandardMaterial color={forearmColor(kit)} roughness={0.62} />
        </mesh>
        <Joint id={hand}>
          <mesh position={[0, -0.06, -0.02]}>
            <boxGeometry args={[0.1, 0.1, 0.12]} />
            <meshStandardMaterial color={kit.jersey} roughness={0.5} />
          </mesh>
          {carry ? (
            <Joint id="football">
              <Football />
            </Joint>
          ) : null}
        </Joint>
      </Joint>
    </Joint>
  );
}

const BALL_R = 0.206;
/** Volume is 0.6 * 0.7 of the base ball: a 40% cut, then another 30%. */
const BALL_SCALE = Math.cbrt(0.6 * 0.7);
const LACE = "#f4f1ea";
const LACE_HALF = 0.145;

function laceHeight(x: number) {
  return Math.sqrt(Math.max(0, BALL_R * BALL_R - x * x));
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
    <group scale={[1.25 * BALL_SCALE, 0.78 * BALL_SCALE, 0.78 * BALL_SCALE]}>
      <mesh>
        <sphereGeometry args={[BALL_R, 48, 32]} />
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

function sleeveStripeMap(count: number, jersey: string, stripe: string) {
  if (count <= 0) return null;
  const ys = count >= 3 ? [-0.065, -0.105, -0.145] : [-0.085, -0.145];
  const height = 0.34;
  const half = height / 2;
  return makeTexture(32, 128, (g, w, h) => {
    g.fillStyle = jersey;
    g.fillRect(0, 0, w, h);
    g.fillStyle = stripe;
    const band = (0.028 / height) * h;
    for (const y of ys) {
      const v = (y + half) / height;
      g.fillRect(0, (1 - v) * h - band / 2, w, band);
    }
  });
}

function Sleeve({ count, jersey, stripe }: { count: number; jersey: string; stripe: string }) {
  const maps = useMemo(() => {
    const tex = sleeveStripeMap(count, jersey, stripe);
    return [tex, tex, null, null, tex, tex];
  }, [count, jersey, stripe]);
  return <StripedBox args={[0.2, 0.34, 0.2]} position={[0, -0.155, 0]} color={jersey} roughness={0.62} maps={maps} />;
}

function pantStripeMap(count: number, outer: -1 | 1, pants: string, stripe: string) {
  if (count <= 0) return null;
  const zs = count >= 3 ? [-0.06, 0, 0.06] : count === 2 ? [-0.04, 0.04] : [0];
  const depth = 0.22;
  const half = depth / 2;
  return makeTexture(128, 32, (g, w, h) => {
    g.fillStyle = pants;
    g.fillRect(0, 0, w, h);
    g.fillStyle = stripe;
    const band = (0.028 / depth) * w;
    for (const z of zs) {
      const u = outer > 0 ? (half - z) / depth : (z + half) / depth;
      g.fillRect(u * w - band / 2, 0, band, h);
    }
  });
}

function PantsThigh({
  count,
  pants,
  stripe,
  outer,
}: {
  count: number;
  pants: string;
  stripe: string;
  outer: -1 | 1;
}) {
  const maps = useMemo(() => {
    const tex = pantStripeMap(count, outer, pants, stripe);
    const slots: Array<CanvasTexture | null> = [null, null, null, null, null, null];
    slots[outer > 0 ? 0 : 1] = tex;
    return slots;
  }, [count, outer, pants, stripe]);
  return <StripedBox args={[0.2, 0.44, 0.22]} position={[0, -0.2, 0]} color={pants} roughness={0.7} maps={maps} />;
}

function helmetMaps(count: number, helmet: string, stripe: string) {
  const blank: Array<CanvasTexture | null> = [null, null, null, null, null, null];
  if (count <= 0) return blank;
  const xs = count >= 3 ? [-0.07, 0, 0.07] : count === 2 ? [-0.05, 0.05] : [0];
  const width = 0.244;
  const half = width / 2;
  const paint = (g: CanvasRenderingContext2D, w: number, h: number, down: number) => {
    g.fillStyle = helmet;
    g.fillRect(0, 0, w, h);
    g.fillStyle = stripe;
    const band = (0.028 / width) * w;
    for (const x of xs) {
      const u = (x + half) / width;
      g.fillRect(u * w - band / 2, 0, band, h * down);
    }
  };
  const full = makeTexture(128, 128, (g, w, h) => paint(g, w, h, 1));
  const front = makeTexture(128, 128, (g, w, h) => paint(g, w, h, 0.25));
  blank[2] = full;
  blank[4] = full;
  blank[5] = front;
  return blank;
}

function HelmetShell({ count, helmet, stripe }: { count: number; helmet: string; stripe: string }) {
  const maps = useMemo(() => helmetMaps(count, helmet, stripe), [count, helmet, stripe]);
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

/** The reference glyph in the kit color, plus one trim and nothing outside it. */
function paintDigit(
  target: CanvasRenderingContext2D,
  image: HTMLImageElement,
  fill: string,
  outline: string,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) {
  const w = Math.max(1, Math.ceil(dw));
  const h = Math.max(1, Math.ceil(dh));
  const scratch = document.createElement("canvas");
  scratch.width = w;
  scratch.height = h;
  const g = scratch.getContext("2d");
  if (!g) return;
  g.drawImage(image, 0, 0, w, h);
  const src = g.getImageData(0, 0, w, h).data;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = (src[i * 4 + 3] ?? 0) > 160 ? 1 : 0;
  const glyph = mainGlyph(mask, w, h);
  const trim = Math.max(2, Math.round(h * 0.018));
  const out = g.createImageData(w, h);
  const [fr, fg, fb] = colorChannels(fill);
  const [or, og, ob] = colorChannels(outline);
  const t2 = trim * trim;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const here = glyph[y * w + x] === 1;
      let edge = false;
      if (!here) {
        for (let oy = -trim; oy <= trim && !edge; oy++) {
          const yy = y + oy;
          if (yy < 0 || yy >= h) continue;
          const row = yy * w;
          for (let ox = -trim; ox <= trim; ox++) {
            if (ox * ox + oy * oy > t2) continue;
            const xx = x + ox;
            if (xx < 0 || xx >= w) continue;
            if (glyph[row + xx] === 1) {
              edge = true;
              break;
            }
          }
        }
      }
      if (!here && !edge) continue;
      const i = (y * w + x) * 4;
      out.data[i] = here ? (fr ?? 0) : (or ?? 0);
      out.data[i + 1] = here ? (fg ?? 0) : (og ?? 0);
      out.data[i + 2] = here ? (fb ?? 0) : (ob ?? 0);
      out.data[i + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  target.drawImage(scratch, dx, dy);
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
  const [digits, setDigits] = useState<HTMLImageElement[] | null>(loadedDigits);
  useEffect(() => {
    if (digits) return;
    let live = true;
    loadDigits().then((images) => {
      if (live) setDigits(images);
    });
    return () => {
      live = false;
    };
  }, [digits]);

  const drawn = useMemo(() => {
    if (!digits) return null;
    const text = String(number);
    const targetH = 480;
    const gap = Math.round(targetH * 0.08);
    const pad = Math.round(targetH * 0.06);
    const cells = [...text].map((ch) => {
      const image = digits[Number(ch)];
      if (!image) return null;
      const w = Math.round(targetH * (image.width / image.height));
      return { image, w };
    });
    if (cells.some((cell) => !cell)) return null;
    const known = cells.filter((cell): cell is { image: HTMLImageElement; w: number } => cell !== null);
    const totalW = known.reduce((sum, cell) => sum + cell.w, 0) + gap * Math.max(0, known.length - 1);
    const canvas = document.createElement("canvas");
    canvas.width = totalW + pad * 2;
    canvas.height = targetH + pad * 2;
    const g = canvas.getContext("2d");
    if (!g) throw new Error("Missing 2D context");
    g.clearRect(0, 0, canvas.width, canvas.height);
    let x = pad;
    for (const cell of known) {
      paintDigit(g, cell.image, fill, outline, x, pad, cell.w, targetH);
      x += cell.w + gap;
    }
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    return { texture, width: 0.44, height: 0.44 * (canvas.height / canvas.width) };
  }, [digits, number, fill, outline]);

  useEffect(() => () => drawn?.texture.dispose(), [drawn]);
  if (!drawn) return null;
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[drawn.width, drawn.height]} />
      <meshBasicMaterial map={drawn.texture} transparent depthWrite={false} />
    </mesh>
  );
}
