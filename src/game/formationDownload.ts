/** Pretty JSON the Download formation button writes, including the trailing newline. */
export function formationDownloadBody(data: unknown): string {
  return JSON.stringify(data, null, 2) + "\n";
}

/** `formation-frame-0.json` for frame 0. */
export function formationDownloadName(frame: number): string {
  return `formation-frame-${frame}.json`;
}

function saveBlob(body: string, filename: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([body], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Download one frame. The file keeps both original and adjusted. */
export function downloadFormationFrame(frame: { frame: number }): void {
  saveBlob(formationDownloadBody(frame), formationDownloadName(frame.frame));
}
