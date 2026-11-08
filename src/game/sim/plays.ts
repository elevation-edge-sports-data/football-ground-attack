/**
 * Authored playbook from game.js: six offense plays, six schemes,
 * route templates, and the keeper sheet.
 * Resolving a call mirrors the play and may replace its steps.
 * Nothing here advances a cursor or moves a player.
 */
import type {
  BlockStyle,
  CellFacing,
  DefenseScheme,
  DefenseSchemeId,
  KeeperRoutes,
  OffensePlay,
  OffensePlayId,
  PlayBookKey,
  RouteBook,
  RouteStep,
  RouteTemplateId,
} from "./types";

export const OFF_PLAYS: readonly OffensePlay[] = [
  {
    id: "blastR",
    name: "Blast",
    arrow: [0.45, 0.55],
    blockStyle: "zoneR",
    lockFirst: false,
    steps: [
      { dx: 0.35, dy: 0.55, t: 0.16 },
      { dx: 0.4, dy: 0.9, t: 0.22 },
    ],
  },
  {
    id: "sweepL",
    name: "Pitch",
    arrow: [-1.15],
    blockStyle: "wallL",
    lockFirst: false,
    steps: [{ dx: -0.9, dy: 0.5, t: 0.22 }],
  },
  {
    id: "sweepR",
    name: "Sweep",
    arrow: [1.15],
    blockStyle: "wallR",
    lockFirst: false,
    steps: [{ dx: 0.9, dy: 0.5, t: 0.22 }],
  },
  {
    id: "river",
    name: "River",
    arrow: [-0.4, 0.55, -0.25, 0.7],
    blockStyle: "river",
    lockFirst: true,
    steps: [
      { dx: -0.45, dy: 0.25, t: 0.14 },
      { dx: 0.5, dy: 0.45, t: 0.16 },
      { dx: -0.3, dy: 0.4, t: 0.14 },
      { dx: 0.55, dy: 0.7, t: 0.2 },
    ],
  },
  {
    id: "diveL",
    name: "Zig Zag",
    arrow: [-0.45, 0.55, -0.5, 0.5, -0.35],
    blockStyle: "zigzag",
    lockFirst: false,
    steps: [
      { dx: -0.42, dy: 0.72, t: 0.18 },
      { dx: 0.58, dy: 0.75, t: 0.18 },
      { dx: -0.52, dy: 0.78, t: 0.18 },
      { dx: 0.5, dy: 0.78, t: 0.18 },
      { dx: -0.38, dy: 0.85, t: 0.22 },
    ],
  },
  {
    id: "wedgeL",
    name: "Wedge",
    arrow: [0.4, -1.35],
    blockStyle: "wedgeL",
    lockFirst: false,
    steps: [
      { dx: 0.45, dy: 0.12, t: 0.13 },
      { dx: -1.15, dy: 0.5, t: 0.2 },
      { dx: -0.85, dy: 0.75, t: 0.2 },
      { dx: -0.55, dy: 0.9, t: 0.18 },
    ],
  },
];

/**
 * Depths and cluster match `DEF_SCHEMES` in game.js.
 * Storm and Base are appended from the last canvas rows that listed them
 * (depth 4.2/9.5 and 5/9). Live game.js still dispatches those ids, but they
 * are not in its scheme list. Placement reads these rows too.
 */
export const DEF_SCHEMES: readonly DefenseScheme[] = [
  { id: "cover4Quarters", name: "Quarters", depthLB: 5.5, depthDB: 12, cluster: "spread" },
  { id: "overloadBlitz", name: "Overload", depthLB: 4.4, depthDB: 9.2, cluster: "left" },
  { id: "prevent", name: "Prevent / Cloud", depthLB: 6.8, depthDB: 13.5, cluster: "spread" },
  { id: "tight", name: "Bear", depthLB: 4.2, depthDB: 8, cluster: "middle" },
  { id: "wide", name: "Fire Zone", depthLB: 5.2, depthDB: 9.5, cluster: "wide" },
  { id: "goalLine", name: "Walk-Up", depthLB: 3.6, depthDB: 6.2, cluster: "middle" },
  { id: "stormBlitz", name: "Storm", depthLB: 4.2, depthDB: 9.5, cluster: "middle" },
  { id: "base", name: "Base", depthLB: 5, depthDB: 9, cluster: "spread" },
];

export const ROUTE_TEMPLATES: Record<RouteTemplateId, readonly RouteStep[]> = {
  ozR: [
    { dx: 0.55, dy: 0.65, t: 0.18 },
    { dx: 0.7, dy: 0.85, t: 0.26 },
  ],
  ozL: [
    { dx: -0.55, dy: 0.65, t: 0.18 },
    { dx: -0.7, dy: 0.85, t: 0.26 },
  ],
  blastR: [
    { dx: 0.35, dy: 0.55, t: 0.16 },
    { dx: 0.4, dy: 0.9, t: 0.22 },
  ],
  blastL: [
    { dx: -0.35, dy: 0.55, t: 0.16 },
    { dx: -0.4, dy: 0.9, t: 0.22 },
  ],
  arrowR: [
    { dx: 0.85, dy: 0.45, t: 0.16 },
    { dx: 0.5, dy: 0.8, t: 0.2 },
  ],
  arrowL: [
    { dx: -0.85, dy: 0.45, t: 0.16 },
    { dx: -0.5, dy: 0.8, t: 0.2 },
  ],
  needleL: [{ dx: -0.55, dy: 0.85, t: 0.2 }],
  needleR: [{ dx: 0.55, dy: 0.85, t: 0.2 }],
  sweepL: [
    { dx: -0.9, dy: 0.5, t: 0.22 },
    { dx: -0.7, dy: 0.75, t: 0.2 },
  ],
  sweepR: [
    { dx: 0.9, dy: 0.5, t: 0.22 },
    { dx: 0.7, dy: 0.75, t: 0.2 },
  ],
  stretchR: [
    { dx: 0.75, dy: 0.35, t: 0.16 },
    { dx: 0.85, dy: 0.7, t: 0.24 },
  ],
  stretchL: [
    { dx: -0.75, dy: 0.35, t: 0.16 },
    { dx: -0.85, dy: 0.7, t: 0.24 },
  ],
  counterR: [
    { dx: -0.4, dy: 0.2, t: 0.14 },
    { dx: 0.85, dy: 0.7, t: 0.22 },
  ],
  counterL: [
    { dx: 0.4, dy: 0.2, t: 0.14 },
    { dx: -0.85, dy: 0.7, t: 0.22 },
  ],
  floodR: [
    { dx: 0.5, dy: 0.6, t: 0.16 },
    { dx: 0.35, dy: 0.9, t: 0.22 },
  ],
  floodL: [
    { dx: -0.5, dy: 0.6, t: 0.16 },
    { dx: -0.35, dy: 0.9, t: 0.22 },
  ],
  diveL: [{ dx: -0.22, dy: 0.95, t: 0.28 }],
  leadL: [
    { dx: -0.55, dy: 0.7, t: 0.2 },
    { dx: -0.4, dy: 0.85, t: 0.22 },
  ],
  plungeL: [
    { dx: -0.12, dy: 0.3, t: 0.12 },
    { dx: -0.5, dy: 0.95, t: 0.3 },
  ],
  delayMid: [
    { dx: 0.04, dy: 0.12, t: 0.22 },
    { dx: 0.08, dy: 0.75, t: 0.24 },
  ],
  pressL: [
    { dx: -0.9, dy: 0.32, t: 0.16 },
    { dx: -0.15, dy: 0.8, t: 0.22 },
  ],
  shortL: [{ dx: -0.4, dy: 0.72, t: 0.16 }],
  shortCounterR: [
    { dx: -0.3, dy: 0.18, t: 0.12 },
    { dx: 0.7, dy: 0.65, t: 0.18 },
  ],
  flatArrowL: [
    { dx: -0.7, dy: 0.25, t: 0.16 },
    { dx: -0.55, dy: 0.5, t: 0.16 },
  ],
  /** Quarters clips, trimmed 10 yards past the LOS. */
  bounceR: [
    { dx: 0.84, dy: 0.91, t: 0.18 },
    { dx: 0.92, dy: 1.36, t: 0.22 },
  ],
  cutbackR: [
    { dx: -0.83, dy: 0.94, t: 0.16 },
    { dx: 0.55, dy: 1.34, t: 0.22 },
  ],
};

/** Dropped cells keep the stock steps. `altSteps` are the dashed preview only. */
export const ROUTE_BOOK: RouteBook = {
  blast: {
    overloadBlitz: { stock: { primary: "ozR" }, flipped: { primary: "diveL" } },
    prevent: {
      stock: { primary: "arrowR", secondary: "needleL" },
      flipped: { primary: "blastL", secondary: "blastR" },
    },
    wide: { stock: { primary: "ozR", secondary: "blastL" }, flipped: { primary: "leadL" } },
    goalLine: { stock: { primary: "ozR", secondary: "sweepL" }, flipped: { primary: "plungeL" } },
    cover4Quarters: { stock: { primary: "bounceR", secondary: "cutbackR" }, flipped: { primary: "blastL" } },
  },
  pitch: {
    cover4Quarters: { stock: { primary: "arrowL" } },
    overloadBlitz: { stock: { primary: "leadL" } },
    prevent: { stock: { primary: "arrowL", secondary: "stretchR" } },
  },
  sweep: {
    prevent: { flipped: { primary: "ozL", secondary: "ozR" } },
    wide: { flipped: { primary: "stretchR" } },
  },
  river: {
    cover4Quarters: { stock: { primary: "counterR" } },
    overloadBlitz: { stock: { primary: "stretchR", secondary: "flatArrowL" } },
    prevent: {
      stock: { primary: "blastR", secondary: "arrowL" },
      flipped: { primary: "arrowL", secondary: "arrowR" },
    },
    wide: { stock: { primary: "arrowR", secondary: "ozR" }, flipped: { primary: "counterR" } },
    tight: { flipped: { primary: "stretchR" } },
  },
  zigzag: {
    cover4Quarters: { stock: { primary: "pressL" }, flipped: { primary: "pressL" } },
    overloadBlitz: { stock: { primary: "sweepR" } },
    prevent: {
      stock: { primary: "floodR", secondary: "arrowR" },
      flipped: { primary: "delayMid" },
    },
    wide: { stock: { primary: "counterR" }, flipped: { primary: "arrowL", secondary: "blastR" } },
    tight: { flipped: { primary: "sweepR" } },
  },
  wedge: {
    cover4Quarters: { stock: { primary: "counterL" } },
    prevent: {
      stock: { primary: "floodL", secondary: "blastL" },
      flipped: { primary: "blastL" },
    },
    tight: { stock: { primary: "sweepL" } },
    goalLine: { stock: { primary: "sweepL", secondary: "counterL" } },
  },
};

const STYLE_FLIP: Partial<Record<BlockStyle, BlockStyle>> = {
  wallL: "wallR",
  wallR: "wallL",
  pullL: "pullR",
  pullR: "pullL",
  zoneL: "zoneR",
  zoneR: "zoneL",
  swingL: "swingR",
  swingR: "swingL",
  wedgeL: "wedgeR",
  wedgeR: "wedgeL",
  river: "river",
  zigzag: "zigzag",
};

export function flipPlayId(id: string): string {
  if (id.endsWith("L")) return `${id.slice(0, -1)}R`;
  if (id.endsWith("R")) return `${id.slice(0, -1)}L`;
  return id;
}

export function flipBlockStyle(style: BlockStyle): BlockStyle {
  return STYLE_FLIP[style] ?? style;
}

function flipPlayName(name: string): string {
  return name.replace(/Left/g, "§R§").replace(/Right/g, "Left").replace(/§R§/g, "Right");
}

function cloneSteps(steps: readonly RouteStep[]): RouteStep[] {
  return steps.map((step) => ({ ...step }));
}

/** Canvas `playBookKey`. `baseId` wins, so a mirror still finds the stock row. */
export function playBookKey(play: {
  id?: string;
  baseId?: string;
  name?: string;
  blockStyle?: string;
} | null): PlayBookKey | "" {
  if (!play) return "";
  const id = String(play.baseId || play.id || "");
  if (id === "blastR" || (play.name === "Blast" && !String(play.blockStyle || "").startsWith("wedge"))) return "blast";
  if (id === "sweepL" || play.name === "Pitch") return "pitch";
  if (id === "sweepR" || play.name === "Sweep") return "sweep";
  if (id.startsWith("river") || play.name === "River") return "river";
  if (id.startsWith("dive") || play.name === "Zig Zag") return "zigzag";
  if (id.startsWith("wedge") || play.name === "Wedge" || String(play.blockStyle || "").startsWith("wedge")) return "wedge";
  return "";
}

/**
 * River and Wedge follow the defense flip.
 * Every other book row follows the offense flip.
 */
export function cellFacing(play: OffensePlay, offenseFlipped: boolean, defenseFlipped: boolean): CellFacing {
  const key = playBookKey(play);
  if (key === "river" || key === "wedge") return defenseFlipped ? "flipped" : "stock";
  return offenseFlipped ? "flipped" : "stock";
}

/**
 * Canvas `playSideSign`, including a flip that has not been written onto the play yet.
 * +1 is toward the right sideline. A resolved mirror can pass `offenseFlipped` false.
 */
export function playSideSign(play: { id: string; blockStyle: string }, offenseFlipped = false): -1 | 1 {
  const id = offenseFlipped ? flipPlayId(play.id) : play.id;
  const style = offenseFlipped ? flipBlockStyle(play.blockStyle as BlockStyle) : play.blockStyle;
  if (id.endsWith("L") || style === "wallL" || style === "pullL" || style === "zoneL" || style === "wedgeL" || style === "swingL") {
    return -1;
  }
  if (id.endsWith("R") || style === "wallR" || style === "pullR" || style === "zoneR" || style === "wedgeR" || style === "swingR") {
    return 1;
  }
  return 1;
}

export function mirrorPlay(play: OffensePlay): OffensePlay {
  const baseId = play.baseId || play.id;
  return {
    ...play,
    id: flipPlayId(play.id),
    name: flipPlayName(play.name),
    arrow: play.arrow.map((sample) => -sample),
    blockStyle: flipBlockStyle(play.blockStyle),
    steps: play.steps.map((step) => ({ ...step, dx: -step.dx })),
    altSteps: play.altSteps?.map((step) => ({ ...step, dx: -step.dx })) ?? null,
    baseId,
  };
}

function keeperCell(play: OffensePlay, schemeId: string, facing: CellFacing): KeeperRoutes | null {
  const key = playBookKey(play);
  if (!key) return null;
  const sheet = ROUTE_BOOK[key];
  if (!sheet) return null;
  const row = sheet[schemeId as DefenseSchemeId];
  return row?.[facing] ?? null;
}

/** Primary replaces the carrier path. Secondary becomes preview-only `altSteps`. */
export function applyKeeperRoutes(
  play: OffensePlay,
  schemeId: string,
  offenseFlipped: boolean,
  defenseFlipped: boolean,
): OffensePlay {
  const next: OffensePlay = {
    ...play,
    baseId: play.baseId || play.id,
    steps: cloneSteps(play.steps),
    arrow: [...play.arrow],
    altSteps: null,
  };
  const cell = keeperCell(next, schemeId, cellFacing(next, offenseFlipped, defenseFlipped));
  if (!cell) return next;
  const primary = ROUTE_TEMPLATES[cell.primary];
  if (!primary) return next;
  next.steps = cloneSteps(primary);
  next.arrow = primary.map((step) => step.dx || 0);
  if (cell.secondary) {
    const secondary = ROUTE_TEMPLATES[cell.secondary];
    if (secondary) next.altSteps = cloneSteps(secondary);
  }
  return next;
}

export type PlayCallInput = {
  id: OffensePlayId | string;
  blockStyle?: BlockStyle;
  name?: string;
  arrow?: readonly number[];
  lockFirst?: boolean;
  steps?: readonly RouteStep[];
  baseId?: string;
};

/**
 * Stock row, then an optional mirror, then the keeper sheet.
 * The returned steps are a copy. `OFF_PLAYS` stays unchanged.
 */
export function resolveCalledPlay(
  play: PlayCallInput,
  schemeId: string,
  offenseFlipped: boolean,
  defenseFlipped: boolean,
): OffensePlay {
  const stock = OFF_PLAYS.find((row) => row.id === play.id);
  const base: OffensePlay = stock
    ? {
        ...stock,
        steps: cloneSteps(stock.steps),
        arrow: [...stock.arrow],
        altSteps: null,
        baseId: stock.id,
      }
    : {
        id: play.id,
        name: play.name ?? play.id,
        arrow: play.arrow ? [...play.arrow] : [],
        blockStyle: play.blockStyle ?? "tight",
        lockFirst: play.lockFirst ?? false,
        steps: cloneSteps(play.steps ?? []),
        altSteps: null,
        baseId: play.baseId ?? play.id,
      };
  const sided = offenseFlipped ? mirrorPlay(base) : base;
  return applyKeeperRoutes(sided, schemeId, offenseFlipped, defenseFlipped);
}

export function schemeById(id: string): DefenseScheme | null {
  return DEF_SCHEMES.find((scheme) => scheme.id === id) ?? null;
}
