/** Kits copied from the v10 canvas UNIFORMS list. Named kit 1 through kit 8. */
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
  pantStripes: number;
  sleeveStripes: number;
};

export const UNIFORMS: Uniform[] = [
  { id: 0, helmet: "#002244", jersey: "#FB4F14", pants: "#002244", number: "#002244", numOutline: "#FFFFFF", facemask: "#FFFFFF", endPrimary: "#002244", endSecondary: "#FB4F14", socks: "#FB4F14", shoes: "#0d0f12", helmStripes: 1, helmStripeCol: "#FB4F14", pantStripes: 1, sleeveStripes: 3 },
  { id: 1, helmet: "#E31837", jersey: "#FFFFFF", pants: "#E31837", number: "#E31837", numOutline: "#FFB81C", facemask: "#FFFFFF", endPrimary: "#E31837", endSecondary: "#FFB81C", socks: "#FFFFFF", shoes: "#E31837", helmStripes: 0, helmStripeCol: "#E31837", pantStripes: 1, sleeveStripes: 3 },
  { id: 2, helmet: "#FFFFFF", jersey: "#00338D", pants: "#FFFFFF", number: "#FFFFFF", numOutline: "#C60C30", facemask: "#00338D", endPrimary: "#00338D", endSecondary: "#FFFFFF", socks: "#00338D", shoes: "#00338D", helmStripes: 1, helmStripeCol: "#00338D", pantStripes: 2, sleeveStripes: 2 },
  { id: 3, helmet: "#101820", jersey: "#006778", pants: "#101820", number: "#FFFFFF", numOutline: "#101820", facemask: "#D7A22A", endPrimary: "#006778", endSecondary: "#D7A22A", socks: "#D7A22A", shoes: "#101820", helmStripes: 0, helmStripeCol: "#D7A22A", pantStripes: 1, sleeveStripes: 3 },
  { id: 4, helmet: "#A5ACAF", jersey: "#000000", pants: "#A5ACAF", number: "#A5ACAF", numOutline: "#FFFFFF", facemask: "#000000", endPrimary: "#000000", endSecondary: "#A5ACAF", socks: "#000000", shoes: "#111111", helmStripes: 1, helmStripeCol: "#111111", pantStripes: 1, sleeveStripes: 3 },
  { id: 5, helmet: "#B3995D", jersey: "#AA0000", pants: "#B3995D", number: "#FFFFFF", numOutline: "#B3995D", facemask: "#FFFFFF", endPrimary: "#AA0000", endSecondary: "#B3995D", socks: "#AA0000", shoes: "#1a1208", helmStripes: 1, helmStripeCol: "#AA0000", pantStripes: 1, sleeveStripes: 3 },
  { id: 6, helmet: "#4F2683", jersey: "#FFC62F", pants: "#4F2683", number: "#4F2683", numOutline: "#FFFFFF", facemask: "#FFC62F", endPrimary: "#4F2683", endSecondary: "#FFC62F", socks: "#FFC62F", shoes: "#2a1548", helmStripes: 0, helmStripeCol: "#FFC62F", pantStripes: 1, sleeveStripes: 3 },
  { id: 7, helmet: "#FFB612", jersey: "#203731", pants: "#FFB612", number: "#FFFFFF", numOutline: "#FFB612", facemask: "#203731", endPrimary: "#203731", endSecondary: "#FFB612", socks: "#203731", shoes: "#203731", helmStripes: 1, helmStripeCol: "#203731", pantStripes: 1, sleeveStripes: 2 },
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
  return contrastOn(kit.jersey, [kit.helmet, kit.endPrimary, kit.pants, kit.number, kit.endSecondary]);
}

export function pantStripeColor(kit: Uniform) {
  return contrastOn(kit.pants, [kit.jersey, kit.endSecondary, kit.number, kit.helmet]);
}

/** Forearm takes the team color the jersey is not. */
export function forearmColor(kit: Uniform) {
  return kit.jersey.toLowerCase() === kit.endPrimary.toLowerCase() ? kit.endSecondary : kit.endPrimary;
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
