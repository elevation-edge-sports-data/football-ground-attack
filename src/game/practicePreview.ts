/**
 * Practice playbook cards. Same map as v10 `drawMiniPreview`:
 * a 30-yard window, the LOS at 58% of the card, 3.4px per yard north.
 * Offense shows block marks and the carrier path. Defense shows zones and fits.
 */
import type { ArtHead, ArtStroke, ArtZone, PlayDiagram } from "./snapArt";

const PAD = 12;
const SPAN = 30;
const YARD_PX = 3.4;

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

function project(diagram: PlayDiagram, width: number, height: number) {
  const x0 = diagram.snapX - SPAN / 2;
  const losY = height * 0.58;
  const xScale = (width - PAD * 2) / SPAN;
  return {
    x: (fieldX: number) => PAD + (fieldX - x0) * xScale,
    y: (yard: number) => losY - (yard - diagram.los) * YARD_PX,
    xScale,
    losY,
  };
}

function drawZone(c: CanvasRenderingContext2D, zone: ArtZone, map: ReturnType<typeof project>) {
  const x = map.x(zone.x);
  const y = map.y(zone.yard);
  const rx = Math.max(6, zone.rx * map.xScale);
  const ry = Math.max(5, zone.ry * YARD_PX);
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
  c.lineWidth = stroke.width >= 3 ? 2.2 : 1.5;
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
  const map = project(diagram, width, height);
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
    if (y < 2 || y > height - 2) continue;
    c.beginPath();
    c.arc(x, y, dot.r, 0, Math.PI * 2);
    c.fillStyle = dot.color;
    c.fill();
    c.lineWidth = 1;
    c.strokeStyle = "rgba(0,0,0,0.35)";
    c.stroke();
  }
}
