/**
 * Playbook cards. The window fits every player and assignment for that side,
 * with north toward the top of the card.
 * Offense shows block marks and the carrier path. Defense shows zones and fits.
 */
import type { ArtHead, ArtStroke, ArtZone, PlayDiagram } from "./snapArt";

const PAD = 18;

function isCarrier(color: string) {
  return color.toLowerCase() === "#fbbf24";
}

function drawLos(c: CanvasRenderingContext2D, width: number, y: number) {
  c.strokeStyle = "rgba(255,255,255,0.4)";
  c.lineWidth = 1.2;
  c.setLineDash([4, 3]);
  c.beginPath();
  c.moveTo(PAD, y);
  c.lineTo(width - PAD, y);
  c.stroke();
  c.setLineDash([]);
}

type Box = { minX: number; maxX: number; minY: number; maxY: number };

function grow(box: Box, x: number, yard: number) {
  box.minX = Math.min(box.minX, x);
  box.maxX = Math.max(box.maxX, x);
  box.minY = Math.min(box.minY, yard);
  box.maxY = Math.max(box.maxY, yard);
}

/** Yard bounds of one side's players and the art drawn for them. */
function contentBox(diagram: PlayDiagram, side: "off" | "def"): Box {
  const box: Box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  let any = false;
  const mark = (x: number, yard: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(yard)) return;
    any = true;
    grow(box, x, yard);
  };
  for (const dot of diagram.dots) {
    if (dot.team === side) mark(dot.x, dot.yard);
  }
  const strokes = diagram.art.strokes.filter(side === "off" ? offenseStroke : defenseStroke);
  for (const stroke of strokes) {
    for (const point of stroke.points) mark(point.x, point.yard);
  }
  const heads = diagram.art.heads.filter((head) => (side === "off" ? isCarrier(head.color) : !isCarrier(head.color)));
  for (const head of heads) {
    mark(head.tip.x, head.tip.yard);
    mark(head.left.x, head.left.yard);
    mark(head.right.x, head.right.yard);
  }
  if (side === "def") {
    for (const zone of diagram.art.zones) {
      mark(zone.x - zone.rx, zone.yard - zone.ry);
      mark(zone.x + zone.rx, zone.yard + zone.ry);
    }
  }
  if (!any) {
    return { minX: diagram.snapX - 12, maxX: diagram.snapX + 12, minY: diagram.los - 8, maxY: diagram.los + 14 };
  }
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const width = Math.max(box.maxX - box.minX + 2.4, 22);
  const height = Math.max(box.maxY - box.minY + 2.4, 16);
  return { minX: cx - width / 2, maxX: cx + width / 2, minY: cy - height / 2, maxY: cy + height / 2 };
}

function project(diagram: PlayDiagram, side: "off" | "def", width: number, height: number) {
  const box = contentBox(diagram, side);
  const yardW = Math.max(1, box.maxX - box.minX);
  const yardH = Math.max(1, box.maxY - box.minY);
  const scale = Math.min((width - PAD * 2) / yardW, (height - PAD * 2) / yardH);
  const originX = (width - yardW * scale) / 2;
  const originY = (height - yardH * scale) / 2;
  return {
    x: (fieldX: number) => originX + (fieldX - box.minX) * scale,
    y: (yard: number) => originY + (box.maxY - yard) * scale,
    scale,
    losY: originY + (box.maxY - diagram.los) * scale,
  };
}

function drawZone(c: CanvasRenderingContext2D, zone: ArtZone, map: ReturnType<typeof project>) {
  const x = map.x(zone.x);
  const y = map.y(zone.yard);
  const rx = Math.max(8, zone.rx * map.scale);
  const ry = Math.max(7, zone.ry * map.scale);
  c.save();
  c.globalAlpha = 0.2;
  c.fillStyle = zone.color;
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fill();
  c.globalAlpha = 0.7;
  c.strokeStyle = zone.color;
  c.lineWidth = 1.2;
  c.stroke();
  c.restore();
}

function drawStroke(c: CanvasRenderingContext2D, stroke: ArtStroke, map: ReturnType<typeof project>) {
  if (stroke.points.length < 2) return;
  c.beginPath();
  const first = stroke.points[0]!;
  c.moveTo(map.x(first.x), map.y(first.yard));
  for (let i = 1; i < stroke.points.length; i++) {
    const point = stroke.points[i]!;
    c.lineTo(map.x(point.x), map.y(point.yard));
  }
  c.strokeStyle = stroke.color;
  const weight = Math.max(1, map.scale / 5.2);
  c.lineWidth = (stroke.width >= 3 ? 2.2 : 1.5) * weight;
  c.lineCap = "round";
  c.setLineDash(stroke.dashed ? [5, 4] : []);
  c.stroke();
  c.setLineDash([]);
}

function drawHead(c: CanvasRenderingContext2D, head: ArtHead, map: ReturnType<typeof project>) {
  c.beginPath();
  c.moveTo(map.x(head.tip.x), map.y(head.tip.yard));
  c.lineTo(map.x(head.left.x), map.y(head.left.yard));
  c.lineTo(map.x(head.right.x), map.y(head.right.yard));
  c.closePath();
  c.fillStyle = head.color;
  c.fill();
}

function offenseStroke(stroke: ArtStroke) {
  return stroke.fade === "off" || isCarrier(stroke.color);
}

function defenseStroke(stroke: ArtStroke) {
  return stroke.fade !== "off" && !isCarrier(stroke.color);
}

/** Paint one playbook card. `diagram` null clears the card. */
export function drawPracticeCard(
  canvas: HTMLCanvasElement | null,
  side: "off" | "def",
  diagram: PlayDiagram | null,
) {
  if (!canvas) return;
  const c = canvas.getContext("2d");
  if (!c) return;
  const width = canvas.width;
  const height = canvas.height;
  c.clearRect(0, 0, width, height);
  c.fillStyle = "#0a1210";
  c.fillRect(0, 0, width, height);
  if (!diagram) return;
  const map = project(diagram, side, width, height);
  drawLos(c, width, map.losY);
  const strokes = diagram.art.strokes.filter(side === "off" ? offenseStroke : defenseStroke);
  const heads = diagram.art.heads.filter((head) => (side === "off" ? isCarrier(head.color) : !isCarrier(head.color)));
  if (side === "def") {
    for (const zone of diagram.art.zones) drawZone(c, zone, map);
  }
  for (const stroke of strokes) drawStroke(c, stroke, map);
  for (const head of heads) drawHead(c, head, map);
  for (const dot of diagram.dots) {
    if (dot.team !== side) continue;
    const x = map.x(dot.x);
    const y = map.y(dot.yard);
    c.beginPath();
    c.arc(x, y, dot.r * Math.max(1, map.scale / 5.2), 0, Math.PI * 2);
    c.fillStyle = dot.color;
    c.fill();
    c.lineWidth = 1;
    c.strokeStyle = "rgba(0,0,0,0.35)";
    c.stroke();
  }
}
