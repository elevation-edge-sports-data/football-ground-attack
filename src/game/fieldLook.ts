/**
 * Field paint chosen from the bottom FIELD menu.
 * A new game rolls the surface and the end-zone art the way v10 `randomizeSurface` does.
 * That roll stays in the session. A saved look is applied after the load-time roll
 * and is written when the user changes a field control.
 * The midfield logo, the solid-color tone, the field width, and the end-zone
 * text stay where the user left them. A new game does not roll those.
 */
import { readPrefs, writePrefs } from "./prefs";
import { readFieldWidth, writeFieldWidth } from "../field/spec";

export type SurfaceId = "grass" | "fieldturf" | "astroturf";
export type EzArtId = "mountains" | "diamonds" | "solid" | "off";
export type EzTone = "primary" | "secondary";
/** v10 `ezTextSelect`. `ee` paints ELEVATION EDGE. */
export type EzTextMode = "ee" | "off" | "custom";
/**
 * Midfield logo. `ee` is the DEFAULT button: the Elevation Edge mark.
 * `custom` is one picked image. `folder` uses the imported file for the current kit.
 */
export type LogoMode = "ee" | "off" | "custom" | "folder";
/** Helmet brow logo. Home and away each keep their own uploaded image. */
export type HelmetLogoMode = "home" | "away" | "folder" | "off";

/** v4.38 zoom range, with the top cut to 2. 1 is the unscaled mark. */
export const LOGO_ZOOM_MIN = 0.4;
export const LOGO_ZOOM_MAX = 2;
export const LOGO_ZOOM_STEP = 0.05;
export const LOGO_ZOOM_DEFAULT = 1;
/** Helmet decal only. Midfield stays on LOGO_ZOOM_MIN / LOGO_ZOOM_MAX. */
export const HELMET_LOGO_ZOOM_MIN = 1;
export const HELMET_LOGO_ZOOM_MAX = 2.5;
export const HELMET_LOGO_ZOOM_STEP = LOGO_ZOOM_STEP;
export const HELMET_LOGO_ZOOM_DEFAULT = 1;

export const SURFACES: SurfaceId[] = ["grass", "fieldturf", "astroturf"];

export type FieldLook = {
  surface: SurfaceId;
  ezArt: EzArtId;
  /** Which home-team color fills a solid end zone. */
  ezTone: EzTone;
  /** v4.38 `centerIceLogo`. */
  logoMode: LogoMode;
  /** v4.38 `centerIceLogoZoom`. Scales the mark. 1 keeps the 10-yard size. */
  logoZoom: number;
  /** v4.38 `customLogoDataUrl`. Null until a file is picked. */
  logoCustom: string | null;
  /** v10 `logoFlip`. True turns the mark so its top points north. */
  logoNorth: boolean;
  /** Helmet brow logo. Off draws nothing. */
  helmetLogoMode: HelmetLogoMode;
  /** Helmet side decal. 1.00–2.50. 1 is the unscaled mark. */
  helmetLogoZoom: number;
  /** Yards across. Hashes and uprights use the same gap as field.js. */
  width: number;
  ezText: EzTextMode;
  /** v10 custom field. Drawing trims this and keeps 48 characters. */
  ezCustom: string;
};

function rollSurface(): SurfaceId {
  return SURFACES[Math.floor(Math.random() * SURFACES.length)] ?? "grass";
}

/** Diamonds 75%, mountains 25%. Solid and off are user picks only. */
function rollEzArt(): EzArtId {
  return Math.random() < 0.75 ? "diamonds" : "mountains";
}

const EZ_ARTS: EzArtId[] = ["mountains", "diamonds", "solid", "off"];
const EZ_TEXT: EzTextMode[] = ["ee", "off", "custom"];
const DEFAULT_EZ_CUSTOM = "ELEVATION EDGE";

function isSurface(value: unknown): value is SurfaceId {
  return typeof value === "string" && (SURFACES as readonly string[]).includes(value);
}

function isEzArt(value: unknown): value is EzArtId {
  return typeof value === "string" && (EZ_ARTS as readonly string[]).includes(value);
}

function isEzText(value: unknown): value is EzTextMode {
  return typeof value === "string" && (EZ_TEXT as readonly string[]).includes(value);
}

function isLogoMode(value: unknown): value is LogoMode {
  return value === "ee" || value === "off" || value === "custom" || value === "folder";
}

function isHelmetLogoMode(value: unknown): value is HelmetLogoMode {
  return value === "home" || value === "away" || value === "folder" || value === "off";
}

/** v4.38 `clampCenterIceLogoZoom`. */
export function clampLogoZoom(n: number) {
  if (!Number.isFinite(n)) return LOGO_ZOOM_DEFAULT;
  const clamped = Math.min(LOGO_ZOOM_MAX, Math.max(LOGO_ZOOM_MIN, n));
  return Math.round(clamped * 100) / 100;
}

export function clampHelmetLogoZoom(n: number) {
  if (!Number.isFinite(n)) return HELMET_LOGO_ZOOM_DEFAULT;
  const clamped = Math.min(HELMET_LOGO_ZOOM_MAX, Math.max(HELMET_LOGO_ZOOM_MIN, n));
  return Math.round(clamped * 100) / 100;
}

function logoModeFrom(saved: { logoMode?: string; logo?: boolean } | undefined, fallback: LogoMode): LogoMode {
  if (!saved) return fallback;
  if (isLogoMode(saved.logoMode)) return saved.logoMode;
  if (saved.logo === false) return "off";
  if (saved.logo === true) return "ee";
  return fallback;
}

/**
 * What v10 paints in the end zone.
 * Custom text is trimmed, then cut to 48 code points. Blank custom paints nothing.
 */
export function ezPaintLabel(mode: EzTextMode, custom: string) {
  if (mode === "off") return null;
  const raw = mode === "custom" ? custom.trim() : DEFAULT_EZ_CUSTOM;
  const label = Array.from(raw).slice(0, 48).join("");
  return label ? label : null;
}

/** Load-time roll, then a saved look. A new game does not write over the save. */
function openingLook(): FieldLook {
  const rolled: FieldLook = {
    surface: rollSurface(),
    ezArt: rollEzArt(),
    ezTone: "primary",
    logoMode: "ee",
    logoZoom: LOGO_ZOOM_DEFAULT,
    logoCustom: null,
    logoNorth: Math.random() < 0.5,
    helmetLogoMode: "off",
    helmetLogoZoom: HELMET_LOGO_ZOOM_DEFAULT,
    width: readFieldWidth(),
    ezText: "ee" as const,
    ezCustom: DEFAULT_EZ_CUSTOM,
  };
  const saved = readPrefs().field;
  if (!saved) return rolled;
  return {
    surface: isSurface(saved.surface) ? saved.surface : rolled.surface,
    ezArt: isEzArt(saved.ezArt) ? saved.ezArt : rolled.ezArt,
    ezTone: saved.ezTone === "secondary" ? "secondary" : saved.ezTone === "primary" ? "primary" : rolled.ezTone,
    logoMode: logoModeFrom(saved, rolled.logoMode),
    logoZoom: typeof saved.logoZoom === "number" ? clampLogoZoom(saved.logoZoom) : rolled.logoZoom,
    logoCustom: typeof saved.logoCustom === "string" && saved.logoCustom.startsWith("data:image/") ? saved.logoCustom : rolled.logoCustom,
    logoNorth: typeof saved.logoNorth === "boolean" ? saved.logoNorth : rolled.logoNorth,
    helmetLogoMode: isHelmetLogoMode(saved.helmetLogoMode) ? saved.helmetLogoMode : rolled.helmetLogoMode,
    helmetLogoZoom: typeof saved.helmetLogoZoom === "number" ? clampHelmetLogoZoom(saved.helmetLogoZoom) : rolled.helmetLogoZoom,
    width: readFieldWidth(),
    ezText: isEzText(saved.ezText) ? saved.ezText : rolled.ezText,
    ezCustom: typeof saved.ezCustom === "string" ? saved.ezCustom.slice(0, 64) : rolled.ezCustom,
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
      logo: look.logoMode !== "off",
      logoMode: look.logoMode,
      logoZoom: look.logoZoom,
      logoCustom: look.logoCustom ?? undefined,
      logoNorth: look.logoNorth,
      helmetLogoMode: look.helmetLogoMode,
      helmetLogoZoom: look.helmetLogoZoom,
      width: look.width,
      ezText: look.ezText,
      ezCustom: look.ezCustom,
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

export function setLogoMode(logoMode: LogoMode) {
  if (look.logoMode === logoMode) return;
  publish({ ...look, logoMode });
  remember();
}

export function setLogoZoom(n: number) {
  const logoZoom = clampLogoZoom(n);
  if (look.logoZoom === logoZoom) return;
  publish({ ...look, logoZoom });
  remember();
}

export function setHelmetLogoMode(helmetLogoMode: HelmetLogoMode) {
  if (look.helmetLogoMode === helmetLogoMode) return;
  publish({ ...look, helmetLogoMode });
  remember();
}

export function setHelmetLogoZoom(n: number) {
  const helmetLogoZoom = clampHelmetLogoZoom(n);
  if (look.helmetLogoZoom === helmetLogoZoom) return;
  publish({ ...look, helmetLogoZoom });
  remember();
}

/** v4.38 file picker. A real image data URL also selects custom. */
export function setLogoCustom(dataUrl: string) {
  if (!dataUrl.startsWith("data:image/")) return;
  if (look.logoCustom === dataUrl && look.logoMode === "custom") return;
  publish({ ...look, logoMode: "custom", logoCustom: dataUrl });
  remember();
}

const widthListeners = new Set<(width: number) => void>();

/** Fires after a WIDTH change, once the live width is already stored. */
export function onFieldWidth(listener: (width: number) => void) {
  widthListeners.add(listener);
  return () => {
    widthListeners.delete(listener);
  };
}

/** v10 width select. Returns false when the clamped width is already showing. */
export function setFieldWidth(next: number) {
  const width = writeFieldWidth(next);
  if (look.width === width) return false;
  publish({ ...look, width });
  remember();
  for (const listener of widthListeners) listener(width);
  return true;
}

export function setEzText(ezText: EzTextMode) {
  if (look.ezText === ezText) return;
  publish({ ...look, ezText });
  remember();
}

export function setEzCustom(ezCustom: string) {
  const next = ezCustom.slice(0, 64);
  if (look.ezCustom === next) return;
  publish({ ...look, ezCustom: next });
  remember();
}

/** Page load already rolled once. Call this when a new game starts. */
export function randomizeFieldForNewGame() {
  publish({ ...look, surface: rollSurface(), ezArt: rollEzArt() });
}
