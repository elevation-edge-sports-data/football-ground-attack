import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
} from "three";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import logoUrl from "../../ee-logo.png";
import {
  readFieldLook,
  subscribeFieldLook,
  type EzArtId,
  type EzTone,
  type SurfaceId,
} from "../game/fieldLook";
import { kitById, subscribeUniforms, getUniformSelection, type Uniform } from "../game/uniforms";
import {
  PATTERN_TILE_YARDS,
  buildDiamondEdges,
  buildDiamondGeometry,
  buildMarkings,
  buildMountainGeometry,
  buildSurfacePattern,
  buildTurfGeometry,
  surfacePatternOpacity,
} from "./ground";
import { FIELD, NORTH_BACK, SOUTH_BACK, hashHalf, layFlat, yardLabel } from "./spec";

const NUMBER_Y = 0.04;

/** 18″ × 4″ × 4″. The whole post is the base color #f97316. */
const PYLON_H = 18 / 36;
const PYLON_W = 4 / 36;
/** Clears the end-zone stripe at y = 0.006 so the base sits on the turf. */
const PYLON_BASE = 0.02;

/** field.js crossbarH, uprightH, and postSetback. drawGoalPostAt uses the same numbers. */
const CROSS_H = 3.4;
const UPRIGHT_H = 10.2;
const POST_SETBACK = 1.15;
/**
 * Canvas tubes are screen-pixel strokes in #f5d445.
 * This radius stays a pipe at the follow camera and stays off the pylons.
 */
const POST_R = 0.15;

function makeLines(positions: Float32Array, color: string, linewidth: number) {
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(positions);
  geometry.computeBoundingSphere();
  const material = new LineMaterial({
    color,
    linewidth,
    worldUnits: false,
    toneMapped: false,
  });
  const lines = new LineSegments2(geometry, material);
  lines.frustumCulled = false;
  return lines;
}

function FieldLines() {
  const minor = useMemo(() => {
    const marks = buildMarkings();
    return {
      minor: makeLines(marks.minor, "#d7dfd2", 2),
      major: makeLines(marks.major, "#f3f6f0", 3),
      boundary: makeLines(marks.boundary, "#ffffff", 6),
    };
  }, []);

  useFrame(({ gl }) => {
    const w = gl.domElement.width;
    const h = gl.domElement.height;
    for (const lines of [minor.minor, minor.major, minor.boundary]) {
      (lines.material as LineMaterial).resolution.set(w, h);
    }
  });

  return (
    <group>
      <primitive object={minor.minor} />
      <primitive object={minor.major} />
      <primitive object={minor.boundary} />
    </group>
  );
}

function YardNumber({
  side,
  yard,
  label,
  big,
}: {
  side: -1 | 1;
  yard: number;
  label: string;
  big: boolean;
}) {
  const ref = useRef<Mesh>(null);
  const tall = big ? 1.7 : 1.2;
  const wide = big ? 1.9 : 1.3;
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = big ? 320 : 220;
    canvas.height = big ? 260 : 180;
    const g = canvas.getContext("2d");
    if (!g) throw new Error("Missing 2D context");
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.textAlign = "center";
    g.textBaseline = "middle";
    const fs = big ? 190 : 140;
    g.font = `bold ${fs}px "Barlow Condensed", "Arial Narrow", Impact, sans-serif`;
    g.lineJoin = "round";
    g.miterLimit = 2;
    g.lineWidth = fs * 0.1;
    g.strokeStyle = "rgba(12,20,16,0.84)";
    g.strokeText(label, canvas.width / 2, canvas.height / 2);
    g.fillStyle = big ? "rgba(236,240,230,0.92)" : "rgba(236,240,230,0.62)";
    g.fillText(label, canvas.width / 2, canvas.height / 2);
    const map = new CanvasTexture(canvas);
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = 8;
    map.needsUpdate = true;
    return map;
  }, [label, big]);

  useLayoutEffect(() => {
    if (ref.current) layFlat(ref.current, side < 0 ? Math.PI / 2 : -Math.PI / 2);
  }, [side]);

  const x = side < 0 ? 0.5 + tall / 2 : FIELD.width - 0.5 - tall / 2;
  return (
    <mesh ref={ref} position={[x, NUMBER_Y, -yard]}>
      <planeGeometry args={[wide * 2, tall]} />
      <meshStandardMaterial map={texture} transparent alphaTest={0.4} roughness={0.85} />
    </mesh>
  );
}

/** Eight corners: Field.pylonYards() on both sidelines. World Z is −yard. */
function pylonSpots() {
  const yards = [SOUTH_BACK, 0, FIELD.length, NORTH_BACK];
  const spots: { key: string; position: [number, number, number] }[] = [];
  for (const yard of yards) {
    for (const x of [0, FIELD.width]) {
      spots.push({ key: `${x}:${yard}`, position: [x, 0, -yard] });
    }
  }
  return spots;
}

function EndZonePylons() {
  const geo = useMemo(() => new BoxGeometry(PYLON_W, PYLON_H, PYLON_W), []);
  const mat = useMemo(
    () => new MeshStandardMaterial({ color: "#f97316", roughness: 0.55, metalness: 0 }),
    [],
  );
  const spots = useMemo(() => pylonSpots(), []);

  return (
    <group>
      {spots.map((spot) => (
        <mesh
          key={spot.key}
          geometry={geo}
          material={mat}
          position={[spot.position[0], PYLON_BASE + PYLON_H / 2, spot.position[2]]}
        />
      ))}
    </group>
  );
}

/**
 * One gooseneck behind each back line.
 * Crossbar and uprights are on that line. The base is postSetback further out.
 */
function GoalPosts() {
  const half = hashHalf();
  const mid = FIELD.width * 0.5;
  const mat = useMemo(
    () => new MeshStandardMaterial({ color: "#f5d445", roughness: 0.4, metalness: 0 }),
    [],
  );
  const uprightGeo = useMemo(() => new CylinderGeometry(POST_R, POST_R, UPRIGHT_H, 12), []);
  const crossGeo = useMemo(() => new CylinderGeometry(POST_R, POST_R, half * 2, 12), []);
  const neckGeo = useMemo(() => new CylinderGeometry(POST_R, POST_R, CROSS_H, 12), []);
  const armGeo = useMemo(() => new CylinderGeometry(POST_R, POST_R, POST_SETBACK, 12), []);
  const ends = [SOUTH_BACK, NORTH_BACK];

  return (
    <group>
      {ends.map((endYard) => {
        const behind = endYard > FIELD.length * 0.5 ? POST_SETBACK : -POST_SETBACK;
        const endZ = -endYard;
        const baseZ = -(endYard + behind);
        return (
          <group key={endYard}>
            <mesh geometry={neckGeo} material={mat} position={[mid, CROSS_H / 2, baseZ]} />
            <mesh
              geometry={armGeo}
              material={mat}
              position={[mid, CROSS_H, (endZ + baseZ) / 2]}
              rotation={[Math.PI / 2, 0, 0]}
            />
            <mesh
              geometry={crossGeo}
              material={mat}
              position={[mid, CROSS_H, endZ]}
              rotation={[0, 0, Math.PI / 2]}
            />
            <mesh geometry={uprightGeo} material={mat} position={[mid - half, CROSS_H + UPRIGHT_H / 2, endZ]} />
            <mesh geometry={uprightGeo} material={mat} position={[mid + half, CROSS_H + UPRIGHT_H / 2, endZ]} />
          </group>
        );
      })}
    </group>
  );
}

/** v10 midfield mark is 10 yards along the image's long axis (`midLogoHalf` is 5). */
const LOGO_ALONG = 10;

function hexRgb(hex: string) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/**
 * v10 `homeLogoReady`. Kit 1 keeps the painted file.
 * Every other home kit recolors the navy body to the primary and the red mark to the secondary.
 * Kits 3 and 4 swap those two colors on the logo only.
 */
function paintLogo(img: HTMLImageElement, kit: Uniform) {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const g = canvas.getContext("2d");
  if (!g) return canvas;
  g.drawImage(img, 0, 0);
  if (kit.id === 0) return canvas;
  const image = g.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const swapLogo = kit.id === 2 || kit.id === 3;
  const fill = hexRgb(swapLogo ? kit.endSecondary : kit.endPrimary);
  const mark = hexRgb(swapLogo ? kit.endPrimary : kit.endSecondary);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! < 18) continue;
    const r = data[i]!;
    const gv = data[i + 1]!;
    const b = data[i + 2]!;
    if (r > 200 && gv > 200 && b > 200) continue;
    if (r > gv + 18 && r > b + 18 && r > 70) {
      data[i] = mark.r;
      data[i + 1] = mark.g;
      data[i + 2] = mark.b;
    } else {
      data[i] = fill.r;
      data[i + 1] = fill.g;
      data[i + 2] = fill.b;
    }
  }
  g.putImageData(image, 0, 0);
  return canvas;
}

function SurfaceGrain({ surface, ezArt }: { surface: SurfaceId; ezArt: EzArtId }) {
  const map = useMemo(() => buildSurfacePattern(surface), [surface]);
  const span = ezArt === "solid" ? FIELD.length : NORTH_BACK - SOUTH_BACK;
  useLayoutEffect(() => {
    map.repeat.set(FIELD.width / PATTERN_TILE_YARDS, span / PATTERN_TILE_YARDS);
    map.needsUpdate = true;
  }, [map, span]);
  useEffect(() => () => map.dispose(), [map]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[FIELD.width / 2, 0.008, -FIELD.length / 2]} renderOrder={1}>
      <planeGeometry args={[FIELD.width, span]} />
      <meshStandardMaterial
        map={map}
        transparent
        opacity={surfacePatternOpacity(surface)}
        roughness={1}
        metalness={0}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </mesh>
  );
}

/** One flat color across each end zone. Solid is opaque. Mountains wash the primary at v10's 0.86. */
function EndZoneWash({ color, opacity }: { color: string; opacity: number }) {
  const solid = opacity >= 1;
  return (
    <group>
      {[5, -105].map((z) => (
        <mesh key={z} position={[FIELD.width / 2, 0.012, z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
          <planeGeometry args={[FIELD.width, FIELD.endZone]} />
          <meshStandardMaterial
            color={color}
            transparent={!solid}
            opacity={opacity}
            roughness={0.95}
            metalness={0}
            depthWrite={solid}
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
          />
        </mesh>
      ))}
    </group>
  );
}

function DiamondEndZones({ primary, secondary }: { primary: string; secondary: string }) {
  const geometry = useMemo(() => buildDiamondGeometry(primary, secondary), [primary, secondary]);
  const edges = useMemo(() => {
    const lines = new LineSegmentsGeometry();
    lines.setPositions(buildDiamondEdges());
    const material = new LineMaterial({
      color: "#ffffff",
      linewidth: 1.15,
      worldUnits: false,
      toneMapped: false,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    const mesh = new LineSegments2(lines, material);
    mesh.frustumCulled = false;
    return mesh;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => {
    return () => {
      edges.geometry.dispose();
      (edges.material as LineMaterial).dispose();
    };
  }, [edges]);
  useFrame(({ gl }) => {
    (edges.material as LineMaterial).resolution.set(gl.domElement.width, gl.domElement.height);
  });
  return (
    <group renderOrder={2}>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          vertexColors
          transparent
          opacity={0.86}
          roughness={0.95}
          metalness={0}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
      <primitive object={edges} />
    </group>
  );
}

function MountainEndZones({ color }: { color: string }) {
  const south = useMemo(() => buildMountainGeometry("south"), []);
  const north = useMemo(() => buildMountainGeometry("north"), []);
  useEffect(() => {
    return () => {
      south.dispose();
      north.dispose();
    };
  }, [south, north]);
  return (
    <group renderOrder={3}>
      {[south, north].map((geometry, index) => (
        <mesh key={index} geometry={geometry}>
          <meshStandardMaterial
            color={color}
            transparent
            opacity={0.8}
            roughness={0.95}
            metalness={0}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-3}
            polygonOffsetUnits={-4}
          />
        </mesh>
      ))}
    </group>
  );
}

function EndZones({ art, tone, kit }: { art: EzArtId; tone: EzTone; kit: Uniform }) {
  const primary = kit.endPrimary;
  const secondary = kit.endSecondary;
  if (art === "off") return null;
  if (art === "solid") {
    // Kit 1's solid end zone uses orange as primary and blue as secondary.
    const solidPrimary = kit.id === 0 ? secondary : primary;
    const solidSecondary = kit.id === 0 ? primary : secondary;
    return <EndZoneWash color={tone === "secondary" ? solidSecondary : solidPrimary} opacity={1} />;
  }
  if (art === "diamonds") return <DiamondEndZones primary={primary} secondary={secondary} />;
  return (
    <group>
      <EndZoneWash color={primary} opacity={0.86} />
      <MountainEndZones color={secondary} />
    </group>
  );
}

function MidfieldLogo({ kit, north }: { kit: Uniform; north: boolean }) {
  const mesh = useRef<Mesh>(null);
  const [paint, setPaint] = useState<{ map: CanvasTexture; width: number; height: number } | null>(null);
  useEffect(() => {
    let live = true;
    const img = new Image();
    img.onload = () => {
      if (!live) return;
      const canvas = paintLogo(img, kit);
      const map = new CanvasTexture(canvas);
      map.colorSpace = SRGBColorSpace;
      map.anisotropy = 8;
      map.needsUpdate = true;
      const aspect = img.naturalWidth / Math.max(1, img.naturalHeight);
      // North: image width runs east-west. Otherwise image width runs north-south.
      const width = north ? LOGO_ALONG * aspect : LOGO_ALONG;
      const height = north ? LOGO_ALONG : LOGO_ALONG / aspect;
      setPaint({ map, width, height });
    };
    img.src = logoUrl;
    return () => {
      live = false;
    };
  }, [kit, north]);
  useEffect(() => () => paint?.map.dispose(), [paint]);
  useLayoutEffect(() => {
    if (mesh.current) layFlat(mesh.current, north ? 0 : Math.PI / 2);
  }, [north, paint]);
  if (!paint) return null;
  return (
    <mesh
      ref={mesh}
      position={[FIELD.width / 2, 0.05, -FIELD.length / 2]}
      renderOrder={4}
    >
      <planeGeometry args={[paint.width, paint.height]} />
      <meshStandardMaterial
        map={paint.map}
        transparent
        opacity={0.96}
        alphaTest={0.15}
        roughness={0.9}
        metalness={0}
        polygonOffset
        polygonOffsetFactor={-4}
        polygonOffsetUnits={-4}
      />
    </mesh>
  );
}

function yardNumbers() {
  const marks: { yard: number; label: string; big: boolean; numY: number }[] = [];
  const mid = FIELD.length * 0.5;
  for (let yard = 0; yard <= FIELD.length; yard += 5) {
    const shifted = yard === 0 || yard === 5 || yard === FIELD.length - 5 || yard === FIELD.length;
    const numY = shifted ? yard + (yard < mid ? 0.55 : yard > mid ? -0.55 : 0) : yard;
    marks.push({ yard, label: yardLabel(yard), big: yard % 10 === 0, numY });
  }
  return marks;
}

export function FootballField() {
  const look = useSyncExternalStore(subscribeFieldLook, readFieldLook);
  const kits = useSyncExternalStore(subscribeUniforms, getUniformSelection);
  const home = kitById(kits.offId);
  const turf = useMemo(() => buildTurfGeometry(look.surface), [look.surface]);
  useEffect(() => () => turf.dispose(), [turf]);
  const turfMaterial = useMemo(
    () => new MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
    [],
  );
  const apron = useMemo(
    () => new MeshStandardMaterial({ color: FIELD.apron, roughness: 1 }),
    [],
  );
  const numbers = useMemo(() => yardNumbers(), []);
  const [fontTick, setFontTick] = useState(0);
  const apronDepth = NORTH_BACK - SOUTH_BACK + 24;

  useEffect(() => {
    let live = true;
    const refresh = () => {
      if (live) setFontTick((n) => n + 1);
    };
    void document.fonts.load('700 64px "Barlow Condensed"').then(refresh);
    document.fonts.addEventListener("loadingdone", refresh);
    return () => {
      live = false;
      document.fonts.removeEventListener("loadingdone", refresh);
    };
  }, []);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[FIELD.width / 2, -0.04, -FIELD.length / 2]} material={apron}>
        <planeGeometry args={[FIELD.width + 24, apronDepth]} />
      </mesh>
      <mesh geometry={turf} material={turfMaterial} />
      <SurfaceGrain surface={look.surface} ezArt={look.ezArt} />
      <EndZones art={look.ezArt} tone={look.ezTone} kit={home} />
      {look.logo ? <MidfieldLogo kit={home} north={look.logoNorth} /> : null}
      <EndZonePylons />
      <GoalPosts />
      <FieldLines />
      <group key={fontTick}>
        {numbers.flatMap((mark) =>
          ([-1, 1] as const).map((side) => (
            <YardNumber
              key={`${side}:${mark.yard}`}
              side={side}
              yard={mark.numY}
              label={mark.label}
              big={mark.big}
            />
          )),
        )}
      </group>
    </group>
  );
}
