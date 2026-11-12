/**
 * Field paint chosen from the bottom FIELD menu.
 * A new game rolls the surface and the end-zone art the way v10 `randomizeSurface` does.
 * That roll stays in the session. A saved look is applied after the load-time roll
 * and is written when the user changes a field control.
 * The logo toggle and the solid-color tone stay where the user left them.
 */
import { readPrefs, writePrefs } from "./prefs";

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

const EZ_ARTS: EzArtId[] = ["mountains", "diamonds", "solid", "off"];

function isSurface(value: unknown): value is SurfaceId {
  return typeof value === "string" && (SURFACES as readonly string[]).includes(value);
}

function isEzArt(value: unknown): value is EzArtId {
  return typeof value === "string" && (EZ_ARTS as readonly string[]).includes(value);
}

/** Load-time roll, then a saved look. A new game does not write over the save. */
function openingLook(): FieldLook {
  const rolled: FieldLook = {
    surface: rollSurface(),
    ezArt: rollEzArt(),
    ezTone: "primary",
    logo: true,
    logoNorth: Math.random() < 0.5,
  };
  const saved = readPrefs().field;
  if (!saved) return rolled;
  return {
    surface: isSurface(saved.surface) ? saved.surface : rolled.surface,
    ezArt: isEzArt(saved.ezArt) ? saved.ezArt : rolled.ezArt,
    ezTone: saved.ezTone === "secondary" ? "secondary" : saved.ezTone === "primary" ? "primary" : rolled.ezTone,
    logo: typeof saved.logo === "boolean" ? saved.logo : rolled.logo,
    logoNorth: typeof saved.logoNorth === "boolean" ? saved.logoNorth : rolled.logoNorth,
  };
}

let look: FieldLook = openingLook();

const listeners = new Set<() => void>();

function publish(next: FieldLook) {
  look = next;
  for (const listener of listeners) listener();
}

function remember() {
  writePrefs({
    field: {
      surface: look.surface,
      ezArt: look.ezArt,
      ezTone: look.ezTone,
      logo: look.logo,
      logoNorth: look.logoNorth,
    },
  });
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
  remember();
}

export function setEzArt(ezArt: EzArtId) {
  if (look.ezArt === ezArt) return;
  publish({ ...look, ezArt });
  remember();
}

export function setEzTone(ezTone: EzTone) {
  if (look.ezTone === ezTone) return;
  publish({ ...look, ezTone });
  remember();
}

export function toggleLogo() {
  publish({ ...look, logo: !look.logo });
  remember();
}

/** Page load already rolled once. Call this when a new game starts. */
export function randomizeFieldForNewGame() {
  publish({ ...look, surface: rollSurface(), ezArt: rollEzArt() });
}
