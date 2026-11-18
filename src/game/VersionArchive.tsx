import { useEffect, useRef, useState } from "react";

/** Right-hand HUD offset so personnel and practice books clear the closed cluster. */
export const VERSION_ARCHIVE_CLEARANCE = 60;

const GITHUB = "https://github.com/elevation-edge-sports-data/football-ground-attack";

const ARCHIVED: readonly { label: string; href: string }[] = [
  { label: "v0", href: "archive/v0.html" },
  { label: "v1", href: "archive/v1.html" },
  { label: "v2", href: "archive/v2.html" },
  { label: "v3", href: "archive/v3/index.html" },
  { label: "v4", href: "archive/v4/index.html" },
  { label: "v5", href: "archive/v5/index.html" },
  { label: "v6", href: "archive/v6-1/index.html" },
  { label: "v7", href: "archive/v7/index.html" },
  { label: "v8", href: "archive/v8/index.html" },
  { label: "v9", href: "archive/v9/index.html" },
  { label: "v10", href: "archive/v10/index.html" },
];

let menuOpen = false;

/** True while the archive list is open, so Escape closes it and does not also pause. */
export function versionArchiveMenuOpen(): boolean {
  return menuOpen;
}

function archivePrefix(): string {
  const path = window.location.pathname.replace(/\\/g, "/");
  return path.includes("/docs/") ? "../" : "";
}

const css = `
.lab-versions, .lab-versions * { box-sizing: border-box; }
.lab-versions {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 32;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  width: max-content;
  max-width: calc(100vw - 24px);
  pointer-events: auto;
  user-select: none;
  font-family: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
  font-size: 0.72rem;
  color: #8b9688;
}
.lab-versions .lab-eyebrow {
  margin: 0;
  font-family: "Barlow Condensed", "IBM Plex Sans", sans-serif;
  font-size: 0.65rem;
  line-height: 1;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #fb4f14;
}
.lab-versions-row {
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  align-items: center;
}
.lab-versions a,
.lab-versions button {
  font: inherit;
  color: #e8ece6;
  text-decoration: none;
  border: 1px solid #2a352c;
  background: #161c18;
  border-radius: 6px;
  padding: 4px 8px;
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}
.lab-versions a:hover,
.lab-versions a[aria-current="page"],
.lab-versions button:hover,
.lab-versions button[aria-expanded="true"] {
  border-color: #fb4f14;
  color: #fb4f14;
}
.lab-versions-list {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  max-width: min(420px, calc(100vw - 24px));
  padding: 8px;
  border: 1px solid #2a352c;
  border-radius: 8px;
  background: #161c18;
}
.lab-versions-list[hidden] { display: none !important; }
.lab-versions-list span[aria-current="page"] {
  color: #fb4f14;
  border: 1px solid #fb4f14;
  border-radius: 6px;
  padding: 4px 8px;
  min-height: 32px;
  display: inline-flex;
  align-items: center;
}
`;

/**
 * Top-right archive cluster. Same closed shape as the canvas lab:
 * Archive, the current version, and GitHub stay visible. v0–v11 are hidden
 * until Archive is clicked. Click outside or Escape closes the list.
 */
export function VersionArchive() {
  const [open, setOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const prefix = archivePrefix();
  const href = (path: string) => `${prefix}${path}`;

  useEffect(() => {
    menuOpen = open;
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const nav = navRef.current;
      const target = event.target;
      if (nav && target instanceof Node && nav.contains(target)) return;
      menuOpen = false;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      menuOpen = false;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      menuOpen = false;
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <nav ref={navRef} id="lab-versions" className="lab-versions" aria-label="Version archive">
      <style>{css}</style>
      <p className="lab-eyebrow">Elevation Edge · v11</p>
      <div className="lab-versions-row">
        <button
          type="button"
          id="lab-archive"
          aria-expanded={open}
          aria-controls="lab-version-list"
          onClick={() => {
            const next = !open;
            menuOpen = next;
            setOpen(next);
          }}
        >
          Archive
        </button>
        <a href={href("index.html")} aria-current="page">
          v11
        </a>
        <a href={GITHUB}>GitHub</a>
      </div>
      <div className="lab-versions-list" id="lab-version-list" hidden={!open}>
        {ARCHIVED.map((item) => (
          <a key={item.label} href={href(item.href)}>
            {item.label}
          </a>
        ))}
        <span aria-current="page">v11</span>
      </div>
    </nav>
  );
}
