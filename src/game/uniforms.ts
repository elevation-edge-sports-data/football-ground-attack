/** Named kit 1 through kit 9. User kit numbers are 1-based over these ids. */
export type Uniform = {
  id: number;
  helmet: string;
  jersey: string;
  pants: string;
  number: string;
  numOutline: string;
  facemask: string;
  endPrimary: string;
  endSecondary: string;
  socks: string;
  shoes: string;
  helmStripes: number;
  helmStripeCol: string;
  /** Same-width bands touching both sides of each helmet stripe. */
  helmStripeEdge?: string;
  pantStripes: number;
  /** Chosen pants-stripe color. Other kits use the strongest contrast. */
  pantStripeCol?: string;
  /** Same-width bands touching both sides of each pants stripe. */
  pantStripeEdge?: string;
  sleeveStripes: number;
  /** Chosen sleeve-stripe color. Other kits use the strongest contrast. */
  sleeveStripeCol?: string;
  /** Cloth between the sleeve stripes. The stripes keep their width and place. */
  sleeveGapCol?: string;
  /** Chosen forearm color. Other kits use the team color the jersey is not. */
  forearm?: string;
  /** Chosen glove color. Other kits use the jersey. */
  gloves?: string;
};

export const UNIFORMS: Uniform[] = [
  { id: 0, helmet: "#001489", jersey: "#FA4616", pants: "#FFFFFF", number: "#FFFFFF", numOutline: "#001489", facemask: "#FFFFFF", endPrimary: "#001489", endSecondary: "#FA4616", socks: "#001489", shoes: "#FA4616", helmStripes: 1, helmStripeCol: "#FA4616", helmStripeEdge: "#FFFFFF", pantStripes: 1, pantStripeCol: "#001489", pantStripeEdge: "#FA4616", sleeveStripes: 2, sleeveStripeCol: "#001489", sleeveGapCol: "#FFFFFF", forearm: "#FFFFFF", gloves: "#FA4616" },
  { id: 1, helmet: "#E31837", jersey: "#FFFFFF", pants: "#E31837", number: "#E31837", numOutline: "#FFB81C", facemask: "#FFFFFF", endPrimary: "#E31837", endSecondary: "#FFB81C", socks: "#FFFFFF", shoes: "#E31837", helmStripes: 0, helmStripeCol: "#E31837", pantStripes: 1, pantStripeCol: "#FFB81C", pantStripeEdge: "#FFFFFF", sleeveStripes: 2, sleeveStripeCol: "#E31837", sleeveGapCol: "#FFB81C" },
  { id: 2, helmet: "#FFFFFF", jersey: "#002C5F", pants: "#FFFFFF", number: "#FFFFFF", numOutline: "#002C5F", facemask: "#002C5F", endPrimary: "#002C5F", endSecondary: "#FFFFFF", socks: "#002C5F", shoes: "#FFFFFF", helmStripes: 1, helmStripeCol: "#002C5F", pantStripes: 2, sleeveStripes: 2 },
  { id: 3, helmet: "#FF3C00", jersey: "#311D00", pants: "#FF3C00", number: "#FFFFFF", numOutline: "#311D00", facemask: "#FFFFFF", endPrimary: "#311D00", endSecondary: "#FF3C00", socks: "#FFFFFF", shoes: "#311D00", helmStripes: 1, helmStripeCol: "#FFFFFF", helmStripeEdge: "#311D00", pantStripes: 1, pantStripeCol: "#FFFFFF", pantStripeEdge: "#311D00", sleeveStripes: 2, sleeveStripeCol: "#FF3C00", sleeveGapCol: "#FFFFFF", forearm: "#FFFFFF" },
  { id: 4, helmet: "#A5ACAF", jersey: "#000000", pants: "#A5ACAF", number: "#A5ACAF", numOutline: "#000000", facemask: "#000000", endPrimary: "#000000", endSecondary: "#A5ACAF", socks: "#000000", shoes: "#A5ACAF", helmStripes: 1, helmStripeCol: "#111111", pantStripes: 1, sleeveStripes: 0, forearm: "#000000", gloves: "#A5ACAF" },
  { id: 5, helmet: "#B3995D", jersey: "#AA0000", pants: "#B3995D", number: "#FFFFFF", numOutline: "#B3995D", facemask: "#FFFFFF", endPrimary: "#AA0000", endSecondary: "#B3995D", socks: "#AA0000", shoes: "#000000", helmStripes: 1, helmStripeCol: "#FFFFFF", helmStripeEdge: "#AA0000", pantStripes: 1, pantStripeCol: "#FFFFFF", pantStripeEdge: "#AA0000", sleeveStripes: 3, forearm: "#FFFFFF" },
  { id: 6, helmet: "#4F2683", jersey: "#4F2683", pants: "#FFFFFF", number: "#FFFFFF", numOutline: "#FFC62F", facemask: "#FFFFFF", endPrimary: "#4F2683", endSecondary: "#FFC62F", socks: "#4F2683", shoes: "#FFFFFF", helmStripes: 0, helmStripeCol: "#FFC62F", pantStripes: 1, pantStripeCol: "#FFC62F", pantStripeEdge: "#4F2683", sleeveStripes: 2, sleeveStripeCol: "#FFC62F", sleeveGapCol: "#FFFFFF", forearm: "#FFFFFF" },
  { id: 7, helmet: "#FFB612", jersey: "#203731", pants: "#FFB612", number: "#FFFFFF", numOutline: "#FFB612", facemask: "#203731", endPrimary: "#203731", endSecondary: "#FFB612", socks: "#203731", shoes: "#FFB612", helmStripes: 1, helmStripeCol: "#FFFFFF", helmStripeEdge: "#203731", pantStripes: 1, pantStripeCol: "#FFFFFF", pantStripeEdge: "#203731", sleeveStripes: 2, sleeveStripeCol: "#FFB612", sleeveGapCol: "#FFFFFF", forearm: "#FFFFFF" },
  { id: 8, helmet: "#FFFFFF", jersey: "#FFFFFF", pants: "#005F61", number: "#005F61", numOutline: "#FA4616", facemask: "#005F61", endPrimary: "#005F61", endSecondary: "#FA4616", socks: "#005F61", shoes: "#FFFFFF", helmStripes: 1, helmStripeCol: "#FA4616", helmStripeEdge: "#005F61", pantStripes: 1, pantStripeCol: "#FA4616", pantStripeEdge: "#FFFFFF", sleeveStripes: 2, sleeveStripeCol: "#FA4616", sleeveGapCol: "#005F61" },
];

export function kitName(kit: Uniform) {
  return `kit ${kit.id + 1}`;
}

/** Stable jersey numbers from the canvas position pools. */
export const PLAYER_NUMBERS: Record<string, number> = {
  qb: 10,
  "ol-l": 65,
  "ol-r": 72,
  "dl-l": 93,
  "dl-r": 94,
  lb: 58,
};

export function kitById(id: number) {
  return UNIFORMS.find((kit) => kit.id === id) ?? UNIFORMS[0];
}

function channel(hex: string, index: number) {
  return parseInt(hex.replace("#", "").slice(index, index + 2), 16);
}

function colorDistance(a: string, b: string) {
  return Math.hypot(channel(a, 0) - channel(b, 0), channel(a, 2) - channel(b, 2), channel(a, 4) - channel(b, 4));
}

/** Same idea as the canvas contrastOn: the candidate that stands off the cloth. */
export function contrastOn(base: string, candidates: string[]) {
  let best = candidates[0] ?? "#ffffff";
  let score = -1;
  for (const candidate of candidates) {
    const distance = colorDistance(base, candidate);
    if (distance > score) {
      score = distance;
      best = candidate;
    }
  }
  return best;
}

export function sleeveStripeColor(kit: Uniform) {
  return kit.sleeveStripeCol ?? contrastOn(kit.jersey, [kit.helmet, kit.endPrimary, kit.pants, kit.number, kit.endSecondary]);
}

export function pantStripeColor(kit: Uniform) {
  return kit.pantStripeCol ?? contrastOn(kit.pants, [kit.jersey, kit.endSecondary, kit.number, kit.helmet]);
}

/** Forearm takes the team color the jersey is not, unless the kit names one. */
export function forearmColor(kit: Uniform) {
  if (kit.forearm) return kit.forearm;
  return kit.jersey.toLowerCase() === kit.endPrimary.toLowerCase() ? kit.endSecondary : kit.endPrimary;
}

/** Gloves match the jersey unless the kit names a color. */
export function gloveColor(kit: Uniform) {
  return kit.gloves ?? kit.jersey;
}

type Selection = { offId: number; defId: number };

let selection: Selection = { offId: 0, defId: 1 };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

export function subscribeUniforms(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getUniformSelection() {
  return selection;
}

function otherKit(id: number) {
  return UNIFORMS.find((kit) => kit.id !== id)?.id ?? 0;
}

export function selectOffenseKit(id: number) {
  const defId = selection.defId === id ? otherKit(id) : selection.defId;
  selection = { offId: id, defId };
  emit();
}

export function selectDefenseKit(id: number) {
  const offId = selection.offId === id ? otherKit(id) : selection.offId;
  selection = { offId, defId: id };
  emit();
}
