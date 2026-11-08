import { useLayoutEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferGeometry,
  CircleGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Material,
} from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { worldFromField } from "./frame";
import { readMode } from "./sim/boot";
import {
  ART_Y,
  defenseArtAlpha,
  offenseArtAlpha,
  playArtGone,
  zoneArtAlpha,
  type ArtFade,
  type ArtHead,
  type ArtStroke,
  type ArtZone,
  type FieldPoint,
  type SnapArt,
} from "./snapArt";

type ArtLive = {
  object: { visible: boolean };
  material: Material;
  fade: ArtFade;
  gain: number;
  /** Zone outline uses the canvas stroke boost. */
  stroke?: boolean;
};

function fadeAlpha(fade: ArtFade, age: number, practice: boolean) {
  if (fade === "off") return offenseArtAlpha(age, 0.5, practice);
  if (fade === "zone") return zoneArtAlpha(age, practice);
  return defenseArtAlpha(age, 0.5, practice);
}

function positionsOf(points: readonly FieldPoint[]) {
  const data = new Float32Array(points.length * 3);
  for (let i = 0; i < points.length; i++) {
    const point = points[i]!;
    const [x, y, z] = worldFromField(point.x, point.yard, ART_Y);
    data[i * 3] = x;
    data[i * 3 + 1] = y;
    data[i * 3 + 2] = z;
  }
  return data;
}

function addStroke(group: Group, items: ArtLive[], stroke: ArtStroke) {
  if (stroke.points.length < 2) return;
  const geometry = new LineGeometry();
  geometry.setPositions(positionsOf(stroke.points));
  const material = new LineMaterial({
    color: stroke.color,
    linewidth: stroke.width,
    worldUnits: false,
    transparent: true,
    opacity: 0.82 * stroke.gain,
    toneMapped: false,
    depthWrite: false,
    premultipliedAlpha: false,
    dashed: !!stroke.dashed,
    dashSize: 0.7,
    gapSize: 0.45,
  });
  const line = new Line2(geometry, material);
  line.frustumCulled = false;
  line.renderOrder = 3;
  if (stroke.dashed) line.computeLineDistances();
  group.add(line);
  items.push({ object: line, material, fade: stroke.fade, gain: stroke.gain });
}

function addHead(group: Group, items: ArtLive[], head: ArtHead) {
  const geometry = new BufferGeometry();
  const [ax, ay, az] = worldFromField(head.tip.x, head.tip.yard, ART_Y + 0.01);
  const [bx, by, bz] = worldFromField(head.left.x, head.left.yard, ART_Y + 0.01);
  const [cx, cy, cz] = worldFromField(head.right.x, head.right.yard, ART_Y + 0.01);
  geometry.setAttribute("position", new Float32BufferAttribute([ax, ay, az, bx, by, bz, cx, cy, cz], 3));
  const material = new MeshBasicMaterial({
    color: head.color,
    transparent: true,
    opacity: 0.82 * head.gain,
    depthWrite: false,
    toneMapped: false,
    side: DoubleSide,
    premultipliedAlpha: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  group.add(mesh);
  items.push({ object: mesh, material, fade: head.fade, gain: head.gain });
}

function ellipsePoints(zone: ArtZone) {
  const steps = 28;
  const points: FieldPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    points.push({
      x: zone.x + Math.cos(angle) * zone.rx,
      yard: zone.yard + Math.sin(angle) * zone.ry,
    });
  }
  return points;
}

function addZone(group: Group, items: ArtLive[], zone: ArtZone) {
  if (zone.rx <= 0.05 || zone.ry <= 0.05) return;
  const fillMat = new MeshBasicMaterial({
    color: zone.color,
    transparent: true,
    opacity: 0.62 * zone.gain,
    depthWrite: false,
    toneMapped: false,
    side: DoubleSide,
    premultipliedAlpha: false,
  });
  const fill = new Mesh(new CircleGeometry(1, 28), fillMat);
  const [x, y, z] = worldFromField(zone.x, zone.yard, ART_Y);
  fill.position.set(x, y, z);
  // Local +Y becomes world −Z, which is north. Local +X stays the right sideline.
  fill.rotation.x = -Math.PI / 2;
  fill.scale.set(zone.rx, zone.ry, 1);
  fill.frustumCulled = false;
  fill.renderOrder = 3;
  group.add(fill);
  items.push({ object: fill, material: fillMat, fade: "zone", gain: zone.gain });

  const ringGeo = new LineGeometry();
  ringGeo.setPositions(positionsOf(ellipsePoints(zone)));
  const ringMat = new LineMaterial({
    color: zone.color,
    linewidth: 1.5,
    worldUnits: false,
    transparent: true,
    opacity: Math.min(1, 0.62 * zone.gain * 2.4),
    toneMapped: false,
    depthWrite: false,
    premultipliedAlpha: false,
  });
  const ring = new Line2(ringGeo, ringMat);
  ring.frustumCulled = false;
  ring.renderOrder = 3;
  group.add(ring);
  items.push({ object: ring, material: ringMat, fade: "zone", gain: zone.gain, stroke: true });
}

function disposeGroup(group: Group) {
  group.traverse((object) => {
    const mesh = object as Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material as Material | Material[] | undefined;
    if (Array.isArray(material)) {
      for (const entry of material) entry.dispose();
    } else if (material) {
      material.dispose();
    }
  });
}

function mountArt(model: SnapArt | null) {
  const group = new Group();
  const items: ArtLive[] = [];
  if (model) {
    for (const zone of model.zones) addZone(group, items, zone);
    for (const stroke of model.strokes) addStroke(group, items, stroke);
    for (const head of model.heads) addHead(group, items, head);
  }
  return { group, items };
}

/**
 * Snap arrows for both teams. `modelRef` is replaced at each snap.
 * `age` is seconds since that snap, or the replay scrub.
 */
export function PlayArt({
  modelRef,
  age,
  rosterTick,
}: {
  modelRef: { current: { model: SnapArt | null; token: number } };
  age: { current: number };
  rosterTick: number;
}) {
  const holder = useRef<Group>(null);
  const live = useRef<{ group: Group; items: ArtLive[]; token: number } | null>(null);

  const install = () => {
    const holderGroup = holder.current;
    if (!holderGroup) return;
    const next = modelRef.current;
    if (live.current?.token === next.token) return;
    if (live.current) {
      holderGroup.remove(live.current.group);
      disposeGroup(live.current.group);
    }
    const mounted = mountArt(next.model);
    holderGroup.add(mounted.group);
    live.current = { ...mounted, token: next.token };
    applyAge(mounted.items, age.current, readMode() === "practice");
  };

  useLayoutEffect(() => {
    install();
    // rosterTick is the snap. The model ref is updated before this render.
  }, [rosterTick]);
  useLayoutEffect(() => {
    return () => {
      const holderGroup = holder.current;
      const current = live.current;
      if (holderGroup && current) holderGroup.remove(current.group);
      if (current) disposeGroup(current.group);
      live.current = null;
    };
  }, []);

  useFrame(() => {
    const next = modelRef.current;
    if (live.current?.token !== next.token) install();
    const current = live.current;
    if (!current) return;
    const practice = readMode() === "practice";
    const show = !playArtGone(age.current, practice);
    current.group.visible = show;
    if (show) applyAge(current.items, age.current, practice);
  });

  return <group ref={holder} />;
}

function applyAge(items: readonly ArtLive[], playAge: number, practice: boolean) {
  for (const item of items) {
    const base = fadeAlpha(item.fade, playAge, practice);
    const opacity = item.stroke ? Math.min(1, base * item.gain * 2.4) : base * item.gain;
    item.material.opacity = opacity;
    item.object.visible = opacity > 0.02;
  }
}
