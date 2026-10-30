import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import {
  CanvasTexture,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
} from "three";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { buildMarkings, buildTurfGeometry } from "./ground";
import { FIELD, NORTH_BACK, SOUTH_BACK, layFlat, yardLabel } from "./spec";

const NUMBER_Y = 0.04;

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
  const turf = useMemo(() => buildTurfGeometry(), []);
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
