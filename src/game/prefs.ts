/**
 * Browser prefs for the 3D page. Each store randomizes or defaults first,
 * then applies the matching slice. A write happens only after a user change,
 * so a cleared store still gets a fresh random load.
 */
const KEY = "fga-prefs";

export type StoredPrefs = {
  mode?: "drill" | "practice" | "game";
  side?: "off" | "def";
  profile?: "wings" | "independent" | "classic";
  cam?: "classic" | "chase" | "broadcast" | "high" | "freestyle";
  field?: {
    surface?: string;
    ezArt?: string;
    ezTone?: string;
    /** Older saves. False means the mark was off. */
    logo?: boolean;
    /** Midfield logo: `ee` (DEFAULT), custom, folder, or off. */
    logoMode?: string;
    /** v4.38 zoom. 1 fits the mark. */
    logoZoom?: number;
    /** Data URL from the custom logo file picker. */
    logoCustom?: string;
    logoNorth?: boolean;
    /** Helmet brow logo: `home`, `away`, `folder`, or `off`. */
    helmetLogoMode?: string;
    /** Helmet side-logo zoom, 1.00–2.50. */
    helmetLogoZoom?: number;
    /** Yards, 10–100. */
    width?: number;
    /** v10 `ezTextSelect`: Elevation Edge, off, or custom. */
    ezText?: string;
    ezCustom?: string;
  };
  tuning?: {
    you?: number;
    mates?: number;
    cpu?: number;
    speed?: number;
    breakBlock?: number;
    breakTackle?: number;
  };
  personnel?: Partial<Record<"ol" | "te" | "wr" | "fb" | "qb" | "dt" | "lb" | "db", number>>;
  kits?: { offId?: number; defId?: number };
};

let cache: StoredPrefs | null = null;

function storage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function readPrefs(): StoredPrefs {
  if (cache) return cache;
  const store = storage();
  if (!store) {
    cache = {};
    return cache;
  }
  try {
    const raw = store.getItem(KEY);
    if (!raw) {
      cache = {};
      return cache;
    }
    const parsed: unknown = JSON.parse(raw);
    cache = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as StoredPrefs) : {};
  } catch {
    cache = {};
  }
  return cache;
}

/** Merge one slice. Callers pass the whole slice they own. */
export function writePrefs(patch: StoredPrefs) {
  const next: StoredPrefs = { ...readPrefs(), ...patch };
  cache = next;
  const store = storage();
  if (!store) return;
  try {
    store.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode or a full disk. The session still keeps the choice.
  }
}
