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
  ezPaintLabel,
  readFieldLook,
  subscribeFieldLook,
  type EzArtId,
  type EzTextMode,
  type EzTone,
  type SurfaceId,
} from "../game/fieldLook";
import { subscribeYouHome, youKitIsHome } from "../game/sim/attack";
import { kitById, subscribeUniforms, getUniformSelection, type Uniform } from "../game/uniforms";
import {
  PATTERN_TILE_YARDS,
  buildDiamondEdges,
  buildDiamondGeometry,
  buildMarkings,
  buildMountainBackdrop,
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

function disposeLines(lines: { minor: LineSegments2; major: LineSegments2; boundary: LineSegments2 }) {
  for (const item of [lines.minor, lines.major, lines.boundary]) {
    item.geometry.dispose();
    (item.material as LineMaterial).dispose();
  }
}

function FieldLines({ width }: { width: number }) {
  const minor = useMemo(() => {
    const marks = buildMarkings(width);
    return {
      minor: makeLines(marks.minor, "#d7dfd2", 2),
      major: makeLines(marks.major, "#f3f6f0", 3),
      boundary: makeLines(marks.boundary, "#ffffff", 6),
    };
  }, [width]);
  const shown = useRef(minor);
  if (shown.current !== minor) {
    disposeLines(shown.current);
    shown.current = minor;
  }

  useFrame(({ gl }) => {
    const w = gl.domElement.width;
    const h = gl.domElement.height;
    for (const lines of [minor.minor, minor.major, minor.boundary]) {
      (lines.material as LineMaterial).resolution.set(w, h);
    }
  });

  return (
    <group>
      <primitive object={minor.minor} dispose={null} />
      <primitive object={minor.major} dispose={null} />
      <primitive object={minor.boundary} dispose={null} />
    </group>
  );
}

function YardNumber({
  side,
  yard,
  label,
  big,
  width,
}: {
  side: -1 | 1;
  yard: number;
  label: string;
  big: boolean;
  width: number;
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

  const x = side < 0 ? 0.5 + tall / 2 : width - 0.5 - tall / 2;
  return (
    <mesh ref={ref} position={[x, NUMBER_Y, -yard]}>
      <planeGeometry args={[wide * 2, tall]} />
      <meshStandardMaterial map={texture} transparent alphaTest={0.4} roughness={0.85} />
    </mesh>
  );
}

/** Eight corners: Field.pylonYards() on both sidelines. World Z is −yard. */
function pylonSpots(width: number) {
  const yards = [SOUTH_BACK, 0, FIELD.length, NORTH_BACK];
  const spots: { key: string; position: [number, number, number] }[] = [];
  for (const yard of yards) {
    for (const x of [0, width]) {
      spots.push({ key: `${x}:${yard}`, position: [x, 0, -yard] });
    }
  }
  return spots;
}

function EndZonePylons({ width }: { width: number }) {
  const geo = useMemo(() => new BoxGeometry(PYLON_W, PYLON_H, PYLON_W), []);
  const mat = useMemo(
    () => new MeshStandardMaterial({ color: "#f97316", roughness: 0.55, metalness: 0 }),
    [],
  );
  const spots = useMemo(() => pylonSpots(width), [width]);

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
function GoalPosts({ width }: { width: number }) {
  const half = hashHalf(width);
  const mid = width * 0.5;
  const mat = useMemo(
    () => new MeshStandardMaterial({ color: "#f5d445", roughness: 0.4, metalness: 0 }),
    [],
  );
  const uprightGeo = useMemo(() => new CylinderGeometry(POST_R, POST_R, UPRIGHT_H, 12), []);
  const crossGeo = useMemo(() => new CylinderGeometry(POST_R, POST_R, half * 2, 12), [half]);
  const crossShown = useRef(crossGeo);
  if (crossShown.current !== crossGeo) {
    crossShown.current.dispose();
    crossShown.current = crossGeo;
  }
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
 * Body and mark use the end-zone primary and secondary.
 * Kit 1's solid end zone swaps that pair, and the logo follows the swap.
 */
function paintLogo(img: HTMLImageElement, primary: string, secondary: string) {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const g = canvas.getContext("2d");
  if (!g) return canvas;
  g.drawImage(img, 0, 0);
  const image = g.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const fill = hexRgb(primary);
  const mark = hexRgb(secondary);
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

function SurfaceGrain({ surface, ezArt, width }: { surface: SurfaceId; ezArt: EzArtId; width: number }) {
  const map = useMemo(() => buildSurfacePattern(surface), [surface]);
  const span = ezArt === "solid" ? FIELD.length : NORTH_BACK - SOUTH_BACK;
  useLayoutEffect(() => {
    map.repeat.set(width / PATTERN_TILE_YARDS, span / PATTERN_TILE_YARDS);
    map.needsUpdate = true;
  }, [map, span, width]);
  useEffect(() => () => map.dispose(), [map]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[width / 2, 0.008, -FIELD.length / 2]} renderOrder={1}>
      <planeGeometry args={[width, span]} />
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

/**
 * Kit color with no turf blend and no extra ground light.
 * Flat end zones were blowing the hex out and looking pale next to the jerseys.
 */
function EzArtFill({
  color,
  vertexColors,
  factor,
  units,
}: {
  color?: string;
  vertexColors?: boolean;
  factor: number;
  units: number;
}) {
  return (
    <meshBasicMaterial
      color={vertexColors ? "#ffffff" : color}
      vertexColors={!!vertexColors}
      polygonOffset
      polygonOffsetFactor={factor}
      polygonOffsetUnits={units}
    />
  );
}

/** One flat color across each end zone. */
function EndZoneWash({ color, width }: { color: string; width: number }) {
  return (
    <group>
      {[5, -105].map((z) => (
        <mesh key={z} position={[width / 2, 0.012, z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
          <planeGeometry args={[width, FIELD.endZone]} />
          <EzArtFill color={color} factor={-2} units={-2} />
        </mesh>
      ))}
    </group>
  );
}

function DiamondEndZones({ primary, secondary, width }: { primary: string; secondary: string; width: number }) {
  const geometry = useMemo(() => buildDiamondGeometry(primary, secondary, width), [primary, secondary, width]);
  const edges = useMemo(() => {
    const lines = new LineSegmentsGeometry();
    lines.setPositions(buildDiamondEdges(width));
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
  }, [width]);
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
        <EzArtFill vertexColors factor={-2} units={-2} />
      </mesh>
      <primitive object={edges} dispose={null} />
    </group>
  );
}

function MountainEndZones({ primary, secondary, width }: { primary: string; secondary: string; width: number }) {
  const south = useMemo(() => buildMountainGeometry("south", width), [width]);
  const north = useMemo(() => buildMountainGeometry("north", width), [width]);
  const southField = useMemo(() => buildMountainBackdrop("south", width), [width]);
  const northField = useMemo(() => buildMountainBackdrop("north", width), [width]);
  useEffect(() => {
    return () => {
      south.dispose();
      north.dispose();
      southField.dispose();
      northField.dispose();
    };
  }, [south, north, southField, northField]);
  return (
    <group renderOrder={3}>
      {[southField, northField].map((geometry, index) => (
        <mesh key={`field-${index}`} geometry={geometry}>
          <EzArtFill color={primary} factor={-2} units={-2} />
        </mesh>
      ))}
      {[south, north].map((geometry, index) => (
        <mesh key={`peak-${index}`} geometry={geometry}>
          <EzArtFill color={secondary} factor={-3} units={-4} />
        </mesh>
      ))}
    </group>
  );
}

/** Colors painted on the end zones. Kit 1's solid art swaps the pair. */
function endZonePalette(kit: Uniform, art: EzArtId): { primary: string; secondary: string } {
  if (art === "solid" && kit.id === 0) {
    return { primary: kit.endSecondary, secondary: kit.endPrimary };
  }
  return { primary: kit.endPrimary, secondary: kit.endSecondary };
}

function EndZones({ art, tone, kit, width }: { art: EzArtId; tone: EzTone; kit: Uniform; width: number }) {
  const { primary, secondary } = endZonePalette(kit, art);
  if (art === "off") return null;
  if (art === "solid") return <EndZoneWash color={tone === "secondary" ? secondary : primary} width={width} />;
  if (art === "diamonds") return <DiamondEndZones primary={primary} secondary={secondary} width={width} />;
  return <MountainEndZones primary={primary} secondary={secondary} width={width} />;
}

function plainLogo(img: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || 1;
  canvas.height = img.naturalHeight || 1;
  const g = canvas.getContext("2d");
  g?.drawImage(img, 0, 0);
  return canvas;
}

function MidfieldLogo({
  primary,
  secondary,
  north,
  width,
  zoom,
  src,
  recolor,
}: {
  primary: string;
  secondary: string;
  north: boolean;
  width: number;
  zoom: number;
  src: string;
  recolor: boolean;
}) {
  const [paint, setPaint] = useState<{ map: CanvasTexture; aspect: number } | null>(null);
  useEffect(() => {
    let live = true;
    const img = new Image();
    img.onload = () => {
      if (!live) return;
      const canvas = recolor ? paintLogo(img, primary, secondary) : plainLogo(img);
      const map = new CanvasTexture(canvas);
      map.colorSpace = SRGBColorSpace;
      map.anisotropy = 8;
      map.premultiplyAlpha = false;
      map.needsUpdate = true;
      const aspect = img.naturalWidth / Math.max(1, img.naturalHeight);
      setPaint({ map, aspect });
    };
    img.src = src;
    return () => {
      live = false;
    };
  }, [primary, secondary, src, recolor]);
  useEffect(() => () => paint?.map.dispose(), [paint]);
  if (!paint) return null;
  // v4.38 zoom scales the mark. 1 keeps the 10-yard long axis.
  // North: image width runs east-west. Otherwise image width runs north-south.
  // After zoom, the longer side stays within the field width so a narrow field cannot push the mark past the sidelines.
  const along = LOGO_ALONG * zoom;
  let planeW = north ? along * paint.aspect : along;
  let planeH = north ? along : along / paint.aspect;
  const diameter = Math.max(planeW, planeH);
  if (diameter > width && diameter > 0) {
    const fit = width / diameter;
    planeW *= fit;
    planeH *= fit;
  }
  // Flat on the turf, same unlit hexes as the end-zone art. A vertical plane
  // from a missed ref rotation disappears under the high camera.
  return (
    <mesh
      position={[width / 2, 0.05, -FIELD.length / 2]}
      rotation={[-Math.PI / 2, 0, north ? 0 : Math.PI / 2]}
      renderOrder={4}
      frustumCulled={false}
    >
      <planeGeometry args={[planeW, planeH]} />
      <meshBasicMaterial
        map={paint.map}
        transparent
        opacity={0.96}
        alphaTest={0.15}
        toneMapped={false}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-4}
        polygonOffsetUnits={-4}
      />
    </mesh>
  );
}

/** Sits above the end-zone art (mountains top out at 0.02) and under the chains. */
const EZ_TEXT_Y = 0.04;

/** v10 `ezTextCanvas`: white Barlow letters with a dark stroke, shrunk to the tile. */
function paintEzText(label: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1400;
  canvas.height = 280;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("Missing 2D context");
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.textAlign = "center";
  g.textBaseline = "middle";
  let fs = 168;
  g.font = `bold ${fs}px "Barlow Condensed", "Arial Narrow", Impact, sans-serif`;
  const maxW = canvas.width * 0.9;
  while (fs > 28 && g.measureText(label).width > maxW) {
    fs *= 0.9;
    g.font = `bold ${fs}px "Barlow Condensed", "Arial Narrow", Impact, sans-serif`;
  }
  g.lineJoin = "round";
  g.lineWidth = Math.max(10, fs * 0.11);
  g.strokeStyle = "rgba(10,16,12,0.78)";
  g.strokeText(label, canvas.width / 2, canvas.height / 2);
  g.fillStyle = "#ffffff";
  g.fillText(label, canvas.width / 2, canvas.height / 2);
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 8;
  map.needsUpdate = true;
  return map;
}

/**
 * v10 `drawEzText`. The quad is 80% of the field (at least 16 yards) and 40% of the end zone deep.
 * Its center is 52% of the way from the goal line to the back line.
 * layFlat points texture-up at −Z (north) and texture-right at +X, so the north letters read from the field.
 * South spins 180° about up: the top points south and the left points east.
 */
function EndZoneLettering({
  width,
  mode,
  custom,
  fontTick,
}: {
  width: number;
  mode: EzTextMode;
  custom: string;
  fontTick: number;
}) {
  const label = ezPaintLabel(mode, custom);
  const map = useMemo(() => (label ? paintEzText(label) : null), [label, fontTick]);
  useEffect(() => () => map?.dispose(), [map]);
  if (!map) return null;
  const span = Math.max(8, width) * 0.8;
  const depth = FIELD.endZone * 0.4;
  const southYard = SOUTH_BACK * 0.52;
  const northYard = FIELD.length + (NORTH_BACK - FIELD.length) * 0.52;
  return (
    <group>
      <EzTextPlane map={map} x={width / 2} yard={northYard} span={span} depth={depth} spin={0} />
      <EzTextPlane map={map} x={width / 2} yard={southYard} span={span} depth={depth} spin={Math.PI} />
    </group>
  );
}

function EzTextPlane({
  map,
  x,
  yard,
  span,
  depth,
  spin,
}: {
  map: CanvasTexture;
  x: number;
  yard: number;
  span: number;
  depth: number;
  spin: number;
}) {
  const ref = useRef<Mesh>(null);
  useLayoutEffect(() => {
    if (ref.current) layFlat(ref.current, spin);
  }, [spin]);
  return (
    <mesh ref={ref} position={[x, EZ_TEXT_Y, -yard]} renderOrder={4} frustumCulled={false}>
      <planeGeometry args={[span, depth]} />
      <meshBasicMaterial
        map={map}
        transparent
        opacity={0.94}
        toneMapped={false}
        depthWrite={false}
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
  useSyncExternalStore(subscribeYouHome, youKitIsHome);
  const home = kitById(youKitIsHome() ? kits.offId : kits.defId);
  const { primary, secondary } = endZonePalette(home, look.ezArt);
  const turf = useMemo(() => buildTurfGeometry(look.surface, look.width), [look.surface, look.width]);
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
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[look.width / 2, -0.04, -FIELD.length / 2]} material={apron}>
        <planeGeometry args={[look.width + 24, apronDepth]} />
      </mesh>
      <mesh geometry={turf} material={turfMaterial} />
      <SurfaceGrain surface={look.surface} ezArt={look.ezArt} width={look.width} />
      <EndZones art={look.ezArt} tone={look.ezTone} kit={home} width={look.width} />
      <EndZoneLettering width={look.width} mode={look.ezText} custom={look.ezCustom} fontTick={fontTick} />
      {look.logoMode !== "off" ? (
        <MidfieldLogo
          primary={primary}
          secondary={secondary}
          north={look.logoNorth}
          width={look.width}
          zoom={look.logoZoom}
          src={look.logoMode === "custom" && look.logoCustom ? look.logoCustom : logoUrl}
          recolor={!(look.logoMode === "custom" && look.logoCustom)}
        />
      ) : null}
      <EndZonePylons width={look.width} />
      <GoalPosts width={look.width} />
      <FieldLines width={look.width} />
      <group key={fontTick}>
        {numbers.flatMap((mark) =>
          ([-1, 1] as const).map((side) => (
            <YardNumber
              key={`${side}:${mark.yard}`}
              side={side}
              yard={mark.numY}
              label={mark.label}
              big={mark.big}
              width={look.width}
            />
          )),
        )}
      </group>
    </group>
  );
}
