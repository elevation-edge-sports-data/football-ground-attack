/**
 * Field paint chosen from the bottom FIELD menu.
 * A new game rolls the surface and the end-zone art the way v10 `randomizeSurface` does.
 * The logo toggle and the solid-color tone stay where the user left them.
 */

export type SurfaceId = "grass" | "fieldturf" | "astroturf";
export type EzArtId = "mountains" | "diamonds" | "solid" | "off";
export type EzTone = "primary" | "secondary";

export const SURFACES: SurfaceId[] = ["grass", "fieldturf", "astroturf"];

export type FieldLook = {
  surface: SurfaceId;
  ezArt: EzArtId;
  /** Which home-team color fills a solid end zone. */
  ezTone: EzTone;
  logo: boolean;
  /** v10 `logoFlip`. True turns the mark so its top points north. */
  logoNorth: boolean;
};

function rollSurface(): SurfaceId {
  return SURFACES[Math.floor(Math.random() * SURFACES.length)] ?? "grass";
}

/** Diamonds 75%, mountains 25%. Solid and off are user picks only. */
function rollEzArt(): EzArtId {
  return Math.random() < 0.75 ? "diamonds" : "mountains";
}

let look: FieldLook = {
  surface: rollSurface(),
  ezArt: rollEzArt(),
  ezTone: "primary",
  logo: true,
  logoNorth: Math.random() < 0.5,
};

const listeners = new Set<() => void>();

function publish(next: FieldLook) {
  look = next;
  for (const listener of listeners) listener();
}

export function readFieldLook() {
  return look;
}

export function subscribeFieldLook(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setSurface(surface: SurfaceId) {
  if (look.surface === surface) return;
  publish({ ...look, surface });
}

export function setEzArt(ezArt: EzArtId) {
  if (look.ezArt === ezArt) return;
  publish({ ...look, ezArt });
}

export function setEzTone(ezTone: EzTone) {
  if (look.ezTone === ezTone) return;
  publish({ ...look, ezTone });
}

export function toggleLogo() {
  publish({ ...look, logo: !look.logo });
}

/** Page load already rolled once. Call this when a new game starts. */
export function randomizeFieldForNewGame() {
  publish({ ...look, surface: rollSurface(), ezArt: rollEzArt() });
}
