/**
 * Imported midfield-logo folder. Images stay in natural filename order.
 * Kit 1 uses the first file, kit 2 the second, and so on. A missing kit draws
 * nothing. A new import replaces the previous folder.
 * IndexedDB keeps the ordered set. Object URLs are the live textures.
 */
import { UNIFORMS } from "./uniforms";

export type LogoImportResult = {
  ok: boolean;
  kept: number;
  message: string;
};

const DB_NAME = "fga-midfield-logos";
const DB_VERSION = 1;

let rev = 0;
let ready = false;
let epoch = 0;
const urls: string[] = [];
const listeners = new Set<() => void>();

const FILE_NAME_SORT = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function publish(): void {
  rev += 1;
  for (const listener of listeners) listener();
}

export function subscribeLogoLibrary(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readLogoLibraryRev(): number {
  return rev;
}

export function logoLibraryReady(): boolean {
  return ready;
}

/**
 * Image for a 0-based kit id. Kit 1 is index 0.
 * A kit past the imported files, and any file past the kit list, is null.
 */
export function folderLogoUrl(kitId: number): string | null {
  if (!Number.isInteger(kitId) || kitId < 0 || kitId >= UNIFORMS.length) return null;
  return urls[kitId] ?? null;
}

export function folderLogoCount(): number {
  return urls.length;
}

function imageMime(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function folderFileName(file: File): string {
  const rel = (file.webkitRelativePath ?? "").replace(/\\/g, "/").split("/").filter((part) => part.length > 0);
  const base = rel.length > 0 ? rel[rel.length - 1] : "";
  return base || file.name;
}

function revokeAll(): void {
  for (const url of urls) URL.revokeObjectURL(url);
  urls.length = 0;
}

function remember(blobs: readonly Blob[]): void {
  revokeAll();
  for (const blob of blobs) urls.push(URL.createObjectURL(blob));
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("files")) db.createObjectStore("files");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function hydrateIdb(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const seen = epoch;
  const db = await openDb();
  try {
    const tx = db.transaction("files", "readonly");
    const store = tx.objectStore("files");
    const keysReq = store.getAllKeys();
    const rowsReq = store.getAll();
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      keysReq.onsuccess = () => resolve(keysReq.result);
      keysReq.onerror = () => reject(keysReq.error);
    });
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      rowsReq.onsuccess = () => resolve(rowsReq.result as unknown[]);
      rowsReq.onerror = () => reject(rowsReq.error);
    });
    await txDone(tx);
    if (seen !== epoch) return;
    const blobs = keys
      .map((key, index) => ({ key: typeof key === "number" ? key : Number(key), blob: rows[index] }))
      .sort((a, b) => a.key - b.key)
      .flatMap((row) => (row.blob instanceof Blob ? [row.blob] : []));
    remember(blobs);
  } finally {
    db.close();
  }
}

async function replaceLibrary(blobs: readonly Blob[]): Promise<void> {
  epoch += 1;
  const db = await openDb();
  try {
    const tx = db.transaction("files", "readwrite");
    const store = tx.objectStore("files");
    store.clear();
    blobs.forEach((blob, index) => store.put(blob, index));
    await txDone(tx);
  } finally {
    db.close();
  }
  remember(blobs);
  publish();
}

/** Folder input. PNG, JPEG, and WebP only, in natural filename order. */
export async function importLogoFolder(list: Iterable<File>): Promise<LogoImportResult> {
  const files = Array.from(list);
  const accepted: { name: string; blob: Blob }[] = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = imageMime(bytes);
    if (!mime) continue;
    const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    accepted.push({ name: folderFileName(file), blob: new Blob([copy], { type: mime }) });
  }
  accepted.sort((a, b) => FILE_NAME_SORT.compare(a.name, b.name));
  if (accepted.length === 0) return { ok: false, kept: 0, message: "No images found." };
  if (typeof indexedDB === "undefined") {
    return { ok: false, kept: 0, message: "Could not store those images." };
  }
  await replaceLibrary(accepted.map((file) => file.blob));
  const noun = accepted.length === 1 ? "image" : "images";
  return { ok: true, kept: accepted.length, message: `Imported ${accepted.length} ${noun}.` };
}

let started = false;

function startLogoLibrary(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  void (async () => {
    try {
      await hydrateIdb();
    } catch {
      /* an empty library still resolves */
    }
    ready = true;
    publish();
  })();
}

startLogoLibrary();

/**
 * Helmet logos. This is a different database from the midfield library, so an
 * import on one cannot replace the other. Folder files use numeric keys
 * (kit 1 is key 0). Custom home and away use the keys "home" and "away".
 */
const HELMET_DB_NAME = "fga-helmet-logos";
const HELMET_STORE = "files";

export type HelmetSide = "home" | "away";
/** Sidecar tokens. The renderer does not know kit numbers. */
export type HelmetLogoRule = "none" | "mirror" | "left" | "right" | "dual";

const HELMET_RULES_KEY = "rules";
const HELMET_RULES_FILE = "helmet-logo-rules.txt";
const HELMET_RULES_FALLBACK = "rules.txt";
const HELMET_RULE_LINE = /^(\d+)\s+(none|mirror|left|right|dual)$/;

let helmetRev = 0;
let helmetReady = false;
const helmetFolderUrls: (string | null)[] = [];
let helmetHomeUrl: string | null = null;
let helmetAwayUrl: string | null = null;
/** 0-based kit id → rule. Empty means every kit uses the plain logo. */
let helmetRules = new Map<number, HelmetLogoRule>();
const helmetListeners = new Set<() => void>();
let helmetQueue: Promise<unknown> = Promise.resolve();

function publishHelmet(): void {
  helmetRev += 1;
  for (const listener of helmetListeners) listener();
}

export function subscribeHelmetLogos(listener: () => void): () => void {
  helmetListeners.add(listener);
  return () => helmetListeners.delete(listener);
}

export function readHelmetLogoRev(): number {
  return helmetRev;
}

export function helmetLogoReady(): boolean {
  return helmetReady;
}

/** How many sorted files this token takes. An unlisted kit takes one. */
function filesForRule(rule: HelmetLogoRule | null): number {
  if (rule === "none") return 0;
  if (rule === "dual") return 2;
  return 1;
}

function helmetRuleToken(value: unknown): HelmetLogoRule | null {
  if (value === "none" || value === "mirror" || value === "left" || value === "right" || value === "dual") return value;
  return null;
}

/**
 * Files this kit consumes, in sorted order.
 * Index 0 is the first file. A missing file is null. `none` returns an empty list.
 */
export function helmetFolderFiles(kitId: number): readonly (string | null)[] {
  if (!Number.isInteger(kitId) || kitId < 0 || kitId >= UNIFORMS.length) return [];
  let index = 0;
  for (let id = 0; id < kitId; id++) index += filesForRule(helmetRules.get(id) ?? null);
  const take = filesForRule(helmetRules.get(kitId) ?? null);
  const out: (string | null)[] = [];
  for (let n = 0; n < take; n++) out.push(helmetFolderUrls[index + n] ?? null);
  return out;
}

/** First folder image assigned to this kit. Null when the kit takes none or the list ran out. */
export function helmetFolderLogoUrl(kitId: number): string | null {
  for (const url of helmetFolderFiles(kitId)) if (url) return url;
  return null;
}

export function helmetFolderCount(): number {
  let count = 0;
  for (const url of helmetFolderUrls) if (url) count += 1;
  return count;
}

export function helmetSideLogoUrl(side: HelmetSide): string | null {
  return side === "home" ? helmetHomeUrl : helmetAwayUrl;
}

/** Rule for a 0-based kit id. Null keeps the same logo on both sides. */
export function helmetLogoRule(kitId: number): HelmetLogoRule | null {
  if (!Number.isInteger(kitId) || kitId < 0 || kitId >= UNIFORMS.length) return null;
  return helmetRules.get(kitId) ?? null;
}

function enqueueHelmet<T>(task: () => Promise<T>): Promise<T> {
  const run = helmetQueue.then(task, task);
  helmetQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function openHelmetDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HELMET_DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(HELMET_STORE)) db.createObjectStore(HELMET_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function folderKey(key: IDBValidKey): number | null {
  if (typeof key === "number" && Number.isInteger(key) && key >= 0) return key;
  if (typeof key === "string" && /^\d+$/.test(key)) return Number(key);
  return null;
}

function isHelmetFolderKey(key: IDBValidKey): boolean {
  return folderKey(key) != null;
}

function revokeHelmetFolder(): void {
  for (const url of helmetFolderUrls) if (url) URL.revokeObjectURL(url);
  helmetFolderUrls.length = 0;
}

function rememberHelmetFolder(slots: readonly (Blob | undefined)[]): void {
  revokeHelmetFolder();
  for (let i = 0; i < slots.length; i++) {
    const blob = slots[i];
    helmetFolderUrls[i] = blob ? URL.createObjectURL(blob) : null;
  }
}

function rememberHelmetRules(rules: ReadonlyMap<number, HelmetLogoRule>): void {
  helmetRules = new Map(rules);
}

/** One rule per line: a 1-based kit number, then a token. Other lines are skipped. */
function parseHelmetLogoRules(text: string): Map<number, HelmetLogoRule> {
  const rules = new Map<number, HelmetLogoRule>();
  for (const raw of text.split(/\r?\n/)) {
    const match = HELMET_RULE_LINE.exec(raw.trim());
    if (!match) continue;
    const kitNumber = Number(match[1]);
    const token = helmetRuleToken(match[2]);
    if (!Number.isInteger(kitNumber) || kitNumber < 1 || !token) continue;
    rules.set(kitNumber - 1, token);
  }
  return rules;
}

function parseStoredHelmetRules(text: string): Map<number, HelmetLogoRule> {
  const rules = new Map<number, HelmetLogoRule>();
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return rules;
    for (const [key, value] of Object.entries(parsed)) {
      const kitId = Number(key);
      const token = helmetRuleToken(value);
      if (!Number.isInteger(kitId) || kitId < 0 || !token) continue;
      rules.set(kitId, token);
    }
  } catch {
    /* a bad save is the same as no rules */
  }
  return rules;
}

function rulesPayload(rules: ReadonlyMap<number, HelmetLogoRule>): string {
  const payload: Record<string, HelmetLogoRule> = {};
  for (const [kitId, rule] of rules) payload[String(kitId)] = rule;
  return JSON.stringify(payload);
}

function pathDepth(file: File): number {
  return (file.webkitRelativePath ?? file.name).replace(/\\/g, "/").split("/").filter((part) => part.length > 0).length;
}

/** `helmet-logo-rules.txt` wins. Otherwise the shallowest `rules.txt`. */
function pickRulesFile(files: readonly File[]): File | null {
  const ranked = (name: string) =>
    files
      .filter((file) => folderFileName(file).toLowerCase() === name)
      .sort((a, b) => pathDepth(a) - pathDepth(b) || FILE_NAME_SORT.compare(folderFileName(a), folderFileName(b)));
  return ranked(HELMET_RULES_FILE)[0] ?? ranked(HELMET_RULES_FALLBACK)[0] ?? null;
}

function rememberHelmetSide(side: HelmetSide, blob: Blob | null): void {
  const prev = side === "home" ? helmetHomeUrl : helmetAwayUrl;
  if (prev) URL.revokeObjectURL(prev);
  const next = blob ? URL.createObjectURL(blob) : null;
  if (side === "home") helmetHomeUrl = next;
  else helmetAwayUrl = next;
}

async function imageBlob(file: File, folderOnly: boolean): Promise<Blob | null> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength === 0) return null;
  const sniffed = imageMime(bytes);
  const mime = sniffed ?? (!folderOnly && file.type.startsWith("image/") ? file.type : null);
  if (!mime) return null;
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Blob([copy], { type: mime });
}

async function hydrateHelmet(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openHelmetDb();
  try {
    const tx = db.transaction(HELMET_STORE, "readonly");
    const store = tx.objectStore(HELMET_STORE);
    const keys = await idbRequest(store.getAllKeys());
    const rows = (await idbRequest(store.getAll())) as unknown[];
    await txDone(tx);
    const slots: Blob[] = [];
    let home: Blob | null = null;
    let away: Blob | null = null;
    const rulesBlobs: Blob[] = [];
    keys.forEach((key, index) => {
      const blob = rows[index];
      if (!(blob instanceof Blob)) return;
      if (key === "home") home = blob;
      else if (key === "away") away = blob;
      else if (key === HELMET_RULES_KEY) rulesBlobs.push(blob);
      else {
        const indexKey = folderKey(key);
        if (indexKey != null) slots[indexKey] = blob;
      }
    });
    rememberHelmetFolder(slots);
    rememberHelmetSide("home", home);
    rememberHelmetSide("away", away);
    const savedRules = rulesBlobs[0];
    rememberHelmetRules(savedRules ? parseStoredHelmetRules(await savedRules.text()) : new Map());
  } finally {
    db.close();
  }
}

async function replaceHelmetFolder(blobs: readonly Blob[], rules: ReadonlyMap<number, HelmetLogoRule>): Promise<void> {
  const db = await openHelmetDb();
  try {
    const readTx = db.transaction(HELMET_STORE, "readonly");
    const keys = await idbRequest(readTx.objectStore(HELMET_STORE).getAllKeys());
    await txDone(readTx);
    const tx = db.transaction(HELMET_STORE, "readwrite");
    const store = tx.objectStore(HELMET_STORE);
    for (const key of keys) {
      if (isHelmetFolderKey(key)) store.delete(key);
    }
    blobs.forEach((blob, index) => store.put(blob, index));
    if (rules.size === 0) store.delete(HELMET_RULES_KEY);
    else store.put(new Blob([rulesPayload(rules)], { type: "application/json" }), HELMET_RULES_KEY);
    await txDone(tx);
  } finally {
    db.close();
  }
  rememberHelmetFolder(blobs);
  rememberHelmetRules(rules);
  publishHelmet();
}

async function writeHelmetSide(side: HelmetSide, blob: Blob): Promise<void> {
  const db = await openHelmetDb();
  try {
    const tx = db.transaction(HELMET_STORE, "readwrite");
    tx.objectStore(HELMET_STORE).put(blob, side);
    await txDone(tx);
  } finally {
    db.close();
  }
  rememberHelmetSide(side, blob);
  publishHelmet();
}

/** Folder input. PNG, JPEG, and WebP only, in natural filename order. File N is kit N. */
export async function importHelmetLogoFolder(list: Iterable<File>): Promise<LogoImportResult> {
  const files = Array.from(list);
  const accepted: { name: string; blob: Blob }[] = [];
  for (const file of files) {
    const blob = await imageBlob(file, true);
    if (!blob) continue;
    accepted.push({ name: folderFileName(file), blob });
  }
  accepted.sort((a, b) => FILE_NAME_SORT.compare(a.name, b.name));
  if (accepted.length === 0) return { ok: false, kept: 0, message: "No images found." };
  if (typeof indexedDB === "undefined") {
    return { ok: false, kept: 0, message: "Could not store those images." };
  }
  let rules = new Map<number, HelmetLogoRule>();
  const rulesFile = pickRulesFile(files);
  if (rulesFile) {
    try {
      rules = parseHelmetLogoRules(await rulesFile.text());
    } catch {
      rules = new Map();
    }
  }
  await enqueueHelmet(() => replaceHelmetFolder(accepted.map((file) => file.blob), rules));
  const noun = accepted.length === 1 ? "image" : "images";
  return { ok: true, kept: accepted.length, message: `Imported ${accepted.length} ${noun}.` };
}

/** One image for the home or away helmet. Replaces only that side. */
export async function storeHelmetSideLogo(side: HelmetSide, file: File): Promise<LogoImportResult> {
  try {
    const blob = await imageBlob(file, false);
    if (!blob) return { ok: false, kept: 0, message: "No image found." };
    if (typeof indexedDB === "undefined") {
      return { ok: false, kept: 0, message: "Could not store that image." };
    }
    await enqueueHelmet(() => writeHelmetSide(side, blob));
  } catch {
    return { ok: false, kept: 0, message: "Could not store that image." };
  }
  return { ok: true, kept: 1, message: "Image stored." };
}

let helmetStarted = false;

function startHelmetLogos(): void {
  if (helmetStarted || typeof window === "undefined") return;
  helmetStarted = true;
  void enqueueHelmet(async () => {
    try {
      await hydrateHelmet();
    } catch {
      /* an empty library still resolves */
    }
    helmetReady = true;
    publishHelmet();
  });
}

startHelmetLogos();
