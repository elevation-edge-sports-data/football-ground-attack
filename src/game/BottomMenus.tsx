import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { CAM_MODES, readCamMode, setCamMode, subscribeCamMode, type CamMode } from "./cameraMode";
import {
  readFieldLook,
  setEzArt,
  setEzCustom,
  setEzText,
  setEzTone,
  setFieldWidth,
  setHelmetLogoMode,
  setHelmetLogoZoom,
  setLogoCustom,
  setLogoMode,
  setLogoZoom,
  setSurface,
  subscribeFieldLook,
  HELMET_LOGO_ZOOM_MAX,
  HELMET_LOGO_ZOOM_MIN,
  HELMET_LOGO_ZOOM_STEP,
  LOGO_ZOOM_MAX,
  LOGO_ZOOM_MIN,
  LOGO_ZOOM_STEP,
  type EzArtId,
  type EzTextMode,
  type EzTone,
  type HelmetLogoMode,
  type LogoMode,
} from "./fieldLook";
import {
  folderLogoCount,
  helmetFolderCount,
  helmetLogoReady,
  importHelmetLogoFolder,
  importLogoFolder,
  logoLibraryReady,
  readHelmetLogoRev,
  readLogoLibraryRev,
  storeHelmetSideLogo,
  subscribeHelmetLogos,
  subscribeLogoLibrary,
  type HelmetSide,
} from "./logoLibrary";
import { FIELD_WIDTH_MAX, FIELD_WIDTH_MIN, FIELD_WIDTH_STEP } from "../field/spec";
import { HomeAwayButton, ModeToggle, PlaySideButton } from "./ModeToggle";
import { CONTROL_PROFILES, askReplay, readBoard, readPaused, readReplayFootage, relayoutFieldWidth, setPaused, setProfile, subscribeBoard, subscribeReplayFootage, type ControlProfile } from "./sim/boot";
import { readYouHome } from "./sim/attack";
import {
  readTuning,
  setBreakBlock,
  setBreakTackle,
  setCpuStrength,
  setMateStrength,
  setSpeed,
  setYouStrength,
  SLIDER_MAX,
  SLIDER_MIN,
  SLIDER_STEP,
  SPEED_SLIDER_MAX,
  subscribeTuning,
} from "./sim/tuning";
import { beginTape, readTapeOn, readTapeReady, stopTape, subscribeTape, subscribeTapeReady } from "./tapeReplay";

type MenuId = "camera" | "field" | "controller" | "settings";
type FieldPanel = "surface" | "ezart" | "width" | "eztext" | "logo" | "helmet";

const dock: CSSProperties = {
  position: "fixed",
  left: 12,
  zIndex: 24,
  pointerEvents: "none",
};

const stack: CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 6,
  pointerEvents: "auto",
};

const row: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 6,
};

function choiceStyle(on: boolean, enabled = true): CSSProperties {
  return {
    minHeight: 44,
    padding: "0 16px",
    borderRadius: 6,
    border: "1px solid",
    borderColor: !enabled ? "#2a3340" : on ? "#e8ece6" : "#243040",
    background: !enabled ? "#10161e" : on ? "#e8ece6" : "#171e28",
    color: !enabled ? "#6b7280" : on ? "#070b12" : "#e8ece6",
    fontFamily: '"Barlow Condensed", sans-serif',
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    cursor: enabled ? "pointer" : "default",
    opacity: enabled ? 1 : 0.45,
    whiteSpace: "nowrap",
  };
}

function holdFocus(event: { preventDefault: () => void }) {
  event.preventDefault();
}

const popRow = (anchor: "start" | "end" | "center"): CSSProperties => ({
  ...row,
  position: "absolute",
  bottom: "100%",
  marginBottom: 6,
  flexWrap: "nowrap",
  zIndex: 1,
  ...(anchor === "start" ? { left: 0 } : anchor === "end" ? { right: 0 } : { left: "50%", transform: "translateX(-50%)" }),
});

/** Hockey-style bottom menu. One open row sits above CAMERA, FIELD, CONTROLLER, or SETTINGS. */
export function BottomMenus() {
  const [menu, setMenu] = useState<MenuId | null>(null);
  const [fieldPanel, setFieldPanel] = useState<FieldPanel | null>(null);
  const mode = useSyncExternalStore(subscribeCamMode, readCamMode);
  const board = useSyncExternalStore(subscribeBoard, readBoard);
  const footage = useSyncExternalStore(subscribeReplayFootage, readReplayFootage);
  const tape = useSyncExternalStore(subscribeTape, readTapeOn);
  const tapeReady = useSyncExternalStore(subscribeTapeReady, readTapeReady);
  const playFootage = board.over && footage;
  const replayOn = board.replay || tape;
  const replayReady = replayOn || playFootage || tapeReady;
  const onReplay = () => {
    if (board.replay) {
      askReplay();
      return;
    }
    if (readTapeOn()) {
      stopTape();
      return;
    }
    if (playFootage) {
      askReplay();
      return;
    }
    if (!readTapeReady()) return;
    if (!readPaused()) setPaused(true);
    beginTape();
  };
  const look = useSyncExternalStore(subscribeFieldLook, readFieldLook);
  const toggle = (id: MenuId) => {
    setMenu((cur) => (cur === id ? null : id));
    setFieldPanel(null);
  };
  const toggleField = (id: FieldPanel) => setFieldPanel((cur) => (cur === id ? null : id));
  return (
    <div style={{ ...dock, bottom: tape || board.replay ? 54 : 16 }}>
      <div style={stack}>
        {menu === "settings" ? <SettingsPanel /> : null}
        <div style={row}>
          <ModeToggle mode={board.mode} embedded />
          <HomeAwayButton home={readYouHome()} />
          {board.mode === "game" ? null : <PlaySideButton side={board.side} />}
          <button
            type="button"
            style={choiceStyle(replayOn, replayReady)}
            aria-pressed={replayOn}
            disabled={!replayReady}
            title={replayReady ? "Replay" : "No replay footage"}
            onMouseDown={holdFocus}
            onClick={onReplay}
          >
            Replay
          </button>
          <div style={{ position: "relative" }}>
            {menu === "camera" ? (
              <div role="group" aria-label="Camera mode" style={popRow("start")}>
                {CAM_MODES.map((cam) => (
                  <ModeButton key={cam.id} id={cam.id} label={cam.label} blurb={cam.blurb} current={mode} />
                ))}
              </div>
            ) : null}
            <button
              type="button"
              style={choiceStyle(menu === "camera")}
              aria-expanded={menu === "camera"}
              onMouseDown={holdFocus}
              onClick={() => toggle("camera")}
            >
              Camera
            </button>
          </div>
          <div style={{ position: "relative" }}>
            {menu === "field" ? (
              <div role="group" aria-label="Field" style={popRow("center")}>
                <div style={{ position: "relative" }}>
                  {fieldPanel === "width" ? <WidthRow width={look.width} /> : null}
                  <button
                    type="button"
                    style={choiceStyle(fieldPanel === "width")}
                    aria-expanded={fieldPanel === "width"}
                    onMouseDown={holdFocus}
                    onClick={() => toggleField("width")}
                  >
                    Width
                  </button>
                </div>
                <div style={{ position: "relative" }}>
                  {fieldPanel === "surface" ? (
                    <div role="group" aria-label="Surface" style={popRow("center")}>
                      <PickButton label="Natural grass" on={look.surface === "grass"} onPick={() => setSurface("grass")} />
                      <PickButton label="Field turf" on={look.surface === "fieldturf"} onPick={() => setSurface("fieldturf")} />
                      <PickButton label="Astroturf" on={look.surface === "astroturf"} onPick={() => setSurface("astroturf")} />
                    </div>
                  ) : null}
                  <button
                    type="button"
                    style={choiceStyle(fieldPanel === "surface")}
                    aria-expanded={fieldPanel === "surface"}
                    onMouseDown={holdFocus}
                    onClick={() => toggleField("surface")}
                  >
                    Surface
                  </button>
                </div>
                <div style={{ position: "relative" }}>
                  {fieldPanel === "ezart" ? (
                    <EzArtRow art={look.ezArt} tone={look.ezTone} />
                  ) : null}
                  <button
                    type="button"
                    style={choiceStyle(fieldPanel === "ezart")}
                    aria-expanded={fieldPanel === "ezart"}
                    onMouseDown={holdFocus}
                    onClick={() => toggleField("ezart")}
                  >
                    EZ art
                  </button>
                </div>
                <div style={{ position: "relative" }}>
                  {fieldPanel === "eztext" ? <EzTextRow mode={look.ezText} custom={look.ezCustom} /> : null}
                  <button
                    type="button"
                    style={choiceStyle(fieldPanel === "eztext")}
                    aria-expanded={fieldPanel === "eztext"}
                    onMouseDown={holdFocus}
                    onClick={() => toggleField("eztext")}
                  >
                    EZ text
                  </button>
                </div>
                <div style={{ position: "relative" }}>
                  {fieldPanel === "logo" ? <LogoRow mode={look.logoMode} zoom={look.logoZoom} /> : null}
                  <button
                    type="button"
                    style={choiceStyle(fieldPanel === "logo")}
                    aria-expanded={fieldPanel === "logo"}
                    onMouseDown={holdFocus}
                    onClick={() => toggleField("logo")}
                  >
                    Midfield Logo
                  </button>
                </div>
                <div style={{ position: "relative" }}>
                  {fieldPanel === "helmet" ? <HelmetLogoRow mode={look.helmetLogoMode} zoom={look.helmetLogoZoom} /> : null}
                  <button
                    type="button"
                    style={choiceStyle(fieldPanel === "helmet")}
                    aria-expanded={fieldPanel === "helmet"}
                    onMouseDown={holdFocus}
                    onClick={() => toggleField("helmet")}
                  >
                    Helmet Logo
                  </button>
                </div>
              </div>
            ) : null}
            <button
              type="button"
              style={choiceStyle(menu === "field")}
              aria-expanded={menu === "field"}
              onMouseDown={holdFocus}
              onClick={() => toggle("field")}
            >
              Field
            </button>
          </div>
          <div style={{ position: "relative" }}>
            {menu === "controller" ? (
              <div role="group" aria-label="Controller profile" style={popRow("end")}>
                {CONTROL_PROFILES.map((item) => (
                  <ProfileButton key={item.id} id={item.id} label={item.label} blurb={item.blurb} current={board.profile} />
                ))}
              </div>
            ) : null}
            <button
              type="button"
              style={choiceStyle(menu === "controller")}
              aria-expanded={menu === "controller"}
              onMouseDown={holdFocus}
              onClick={() => toggle("controller")}
            >
              Controller
            </button>
          </div>
          <button
            type="button"
            style={choiceStyle(menu === "settings")}
            aria-expanded={menu === "settings"}
            onMouseDown={holdFocus}
            onClick={() => toggle("settings")}
          >
            Settings
          </button>
        </div>
      </div>
    </div>
  );
}

const settingsPanel: CSSProperties = {
  width: "min(600px, calc(100vw - 24px))",
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
  alignItems: "start",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #243040",
  background: "rgba(23, 30, 40, 0.96)",
};

const tuneCol: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  minWidth: 0,
};

const tuneRow: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 7.2rem) minmax(72px, 1fr) 2.8rem",
  gap: 6,
  alignItems: "center",
  minWidth: 0,
  fontFamily: '"Barlow Condensed", sans-serif',
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#8b9688",
  whiteSpace: "nowrap",
};

const tuneValue: CSSProperties = {
  color: "#e8ece6",
  fontVariantNumeric: "tabular-nums",
  textAlign: "right",
};

const tuneInput: CSSProperties = {
  width: "100%",
  height: 18,
  margin: 0,
  accentColor: "#e8ece6",
  cursor: "pointer",
};

function SettingsPanel() {
  const tune = useSyncExternalStore(subscribeTuning, readTuning);
  return (
    <div role="group" aria-label="Settings" style={settingsPanel}>
      <div style={tuneCol}>
        <TuneSlider
          label="You"
          title="Runner when you play offense; controlled defender when you play defense."
          value={tune.you}
          suffix="×"
          onChange={setYouStrength}
        />
        <TuneSlider
          label="Teammates"
          title="Your OL and skill players, or your other defenders."
          value={tune.mates}
          suffix="×"
          onChange={setMateStrength}
        />
        <TuneSlider
          label="CPU"
          title="The other side: CPU pursuit on offense, CPU line and runner on defense."
          value={tune.cpu}
          suffix="×"
          onChange={setCpuStrength}
        />
      </div>
      <div style={tuneCol}>
        <TuneSlider label="Speed" value={tune.speed} suffix="×" max={SPEED_SLIDER_MAX} onChange={setSpeed} />
        <TuneSlider label="Break block" value={tune.breakBlock} suffix="" onChange={setBreakBlock} />
        <TuneSlider label="Break tackle" value={tune.breakTackle} suffix="" onChange={setBreakTackle} />
      </div>
    </div>
  );
}

function TuneSlider({
  label,
  title,
  value,
  suffix,
  max = SLIDER_MAX,
  onChange,
}: {
  label: string;
  title?: string;
  value: number;
  suffix: string;
  max?: number;
  onChange: (labeled: number) => void;
}) {
  return (
    <label title={title} style={tuneRow}>
      <span>{label}</span>
      <input
        type="range"
        min={SLIDER_MIN}
        max={max}
        step={SLIDER_STEP}
        value={value}
        aria-label={label}
        style={tuneInput}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <b style={tuneValue}>{value.toFixed(2)}{suffix}</b>
    </label>
  );
}

function PickButton({ label, on, onPick }: { label: string; on: boolean; onPick: () => void }) {
  return (
    <button type="button" style={choiceStyle(on)} aria-pressed={on} onMouseDown={holdFocus} onClick={onPick}>
      {label}
    </button>
  );
}

const EZ_CHOICES: { id: EzArtId; label: string }[] = [
  { id: "mountains", label: "Mountains" },
  { id: "diamonds", label: "Diamonds" },
  { id: "solid", label: "Solid" },
  { id: "off", label: "Off" },
];

function EzArtRow({ art, tone }: { art: EzArtId; tone: EzTone }) {
  return (
    <div role="group" aria-label="End zone art" style={popRow("center")}>
      {EZ_CHOICES.map((choice) =>
        choice.id === "solid" ? (
          <div key={choice.id} style={{ position: "relative" }}>
            {art === "solid" ? (
              <div role="group" aria-label="End zone color" style={popRow("center")}>
                <PickButton label="Primary" on={tone === "primary"} onPick={() => setEzTone("primary")} />
                <PickButton label="Secondary" on={tone === "secondary"} onPick={() => setEzTone("secondary")} />
              </div>
            ) : null}
            <PickButton label={choice.label} on={art === choice.id} onPick={() => setEzArt(choice.id)} />
          </div>
        ) : (
          <PickButton key={choice.id} label={choice.label} on={art === choice.id} onPick={() => setEzArt(choice.id)} />
        ),
      )}
    </div>
  );
}

/** 40% narrower than the 400px track, and 30% shorter. */
const FIELD_WIDTH_SLIDER_PX = 240;

const widthSliderRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  height: "100%",
};

const widthSliderPanel: CSSProperties = {
  ...popRow("start"),
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 40,
  overflow: "visible",
  width: "max-content",
  pointerEvents: "auto",
  boxSizing: "border-box",
  height: 44,
  minHeight: 44,
  padding: "0 10px",
  borderRadius: 6,
  border: "1px solid #243040",
  background: "rgba(23, 30, 40, 0.96)",
};

const widthRangeStyle: CSSProperties = {
  width: FIELD_WIDTH_SLIDER_PX,
  minWidth: FIELD_WIDTH_SLIDER_PX,
  flex: "0 0 auto",
  height: 14.7,
  margin: 0,
  cursor: "pointer",
  background: "transparent",
};

function widthStepStyle(enabled: boolean): CSSProperties {
  return {
    ...choiceStyle(false, enabled),
    boxSizing: "border-box",
    width: 32,
    minWidth: 32,
    height: 32,
    minHeight: 32,
    padding: 0,
    flex: "0 0 auto",
    textTransform: "none",
    fontSize: 18,
    lineHeight: 1,
  };
}

function adjustFieldWidth(width: number, delta: -1 | 1) {
  const next = Math.min(FIELD_WIDTH_MAX, Math.max(FIELD_WIDTH_MIN, width + delta * FIELD_WIDTH_STEP));
  if (setFieldWidth(next)) relayoutFieldWidth();
}

/** Same face as the WIDTH button. The unit stays YD. */
const widthSliderValue: CSSProperties = {
  ...tuneValue,
  fontFamily: '"Barlow Condensed", sans-serif',
  fontSize: 16,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

function WidthRow({ width }: { width: number }) {
  const atMin = width <= FIELD_WIDTH_MIN;
  const atMax = width >= FIELD_WIDTH_MAX;
  return (
    <div role="group" aria-label="Field width" style={widthSliderPanel}>
      <style>{WIDTH_RANGE_CSS}</style>
      <div style={widthSliderRow}>
        <button
          type="button"
          aria-label="Decrease field width"
          disabled={atMin}
          style={widthStepStyle(!atMin)}
          onMouseDown={holdFocus}
          onClick={() => adjustFieldWidth(width, -1)}
        >
          -
        </button>
        <input
          className="field-width-range"
          type="range"
          min={FIELD_WIDTH_MIN}
          max={FIELD_WIDTH_MAX}
          step={FIELD_WIDTH_STEP}
          value={width}
          aria-label="Field width"
          style={widthRangeStyle}
          onChange={(event) => {
            const yards = Number(event.target.value);
            if (setFieldWidth(yards)) relayoutFieldWidth();
          }}
        />
        <button
          type="button"
          aria-label="Increase field width"
          disabled={atMax}
          style={widthStepStyle(!atMax)}
          onMouseDown={holdFocus}
          onClick={() => adjustFieldWidth(width, 1)}
        >
          +
        </button>
        <b style={widthSliderValue}>{width} YD</b>
      </div>
    </div>
  );
}

const WIDTH_RANGE_CSS = `
.field-width-range {
  -webkit-appearance: none;
  appearance: none;
}
.field-width-range:focus {
  outline: none;
}
.field-width-range::-webkit-slider-runnable-track {
  width: 100%;
  height: 5.25px;
  background: #8b9688;
  border-radius: 999px;
}
.field-width-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 11.55px;
  height: 11.55px;
  margin-top: -3.15px;
  border-radius: 50%;
  background: #e8ece6;
  border: 2px solid #070b12;
  cursor: pointer;
}
.field-width-range::-moz-range-track {
  width: 100%;
  height: 5.25px;
  background: #8b9688;
  border: none;
  border-radius: 999px;
}
.field-width-range::-moz-range-thumb {
  width: 11.55px;
  height: 11.55px;
  border-radius: 50%;
  background: #e8ece6;
  border: 2px solid #070b12;
  cursor: pointer;
}
`;

const ezInput: CSSProperties = {
  minHeight: 44,
  width: "16rem",
  maxWidth: "70vw",
  padding: "0 12px",
  borderRadius: 6,
  border: "1px solid #e8ece6",
  background: "#171e28",
  color: "#e8ece6",
  fontFamily: '"Barlow Condensed", sans-serif',
  fontSize: 16,
  fontWeight: 700,
  letterSpacing: "0.02em",
};

function EzCustomInput({ value }: { value: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
  }, []);
  return (
    <input
      ref={ref}
      aria-label="Custom"
      maxLength={64}
      value={value}
      spellCheck={false}
      onChange={(event) => setEzCustom(event.target.value)}
      style={ezInput}
    />
  );
}

function EzTextRow({ mode, custom }: { mode: EzTextMode; custom: string }) {
  return (
    <div role="group" aria-label="End zone text" style={popRow("center")}>
      <PickButton label="Elevation Edge" on={mode === "ee"} onPick={() => setEzText("ee")} />
      <PickButton label="Off" on={mode === "off"} onPick={() => setEzText("off")} />
      <div style={{ position: "relative" }}>
        {mode === "custom" ? (
          <div role="group" aria-label="Custom end zone text" style={popRow("center")}>
            <EzCustomInput value={custom} />
          </div>
        ) : null}
        <PickButton label="Custom" on={mode === "custom"} onPick={() => setEzText("custom")} />
      </div>
    </div>
  );
}

const logoZoomRow: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "3.4rem minmax(88px, 140px) auto",
  gap: 4,
  alignItems: "center",
  minHeight: 44,
  fontFamily: '"Barlow Condensed", sans-serif',
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#8b9688",
};

const logoFileInput: CSSProperties = {
  position: "fixed",
  width: 1,
  height: 1,
  padding: 0,
  margin: 0,
  opacity: 0,
  pointerEvents: "none",
};

const logoStatusStyle: CSSProperties = {
  fontFamily: '"Barlow Condensed", sans-serif',
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#8b9688",
  whiteSpace: "nowrap",
};

function LogoRow({ mode, zoom }: { mode: LogoMode; zoom: number }) {
  const file = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  // True only when this press began with Custom already selected.
  // The mode change itself must not open the picker in the same click.
  const customWasOn = useRef(false);
  const [status, setStatus] = useState<string | null>(null);
  const logoRev = useSyncExternalStore(subscribeLogoLibrary, readLogoLibraryRev);
  const count = logoRev >= 0 ? folderLogoCount() : 0;
  const ready = logoLibraryReady();
  const statusText =
    status ?? (mode === "folder" && ready ? (count > 0 ? `${count} ${count === 1 ? "image" : "images"}` : "No images") : null);
  return (
    <div role="group" aria-label="Midfield Logo" style={popRow("end")}>
      <PickButton label="Default" on={mode === "ee"} onPick={() => setLogoMode("ee")} />
      <button
        type="button"
        style={choiceStyle(mode === "custom")}
        aria-pressed={mode === "custom"}
        onMouseDown={(event) => {
          customWasOn.current = mode === "custom";
          holdFocus(event);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          customWasOn.current = mode === "custom";
        }}
        onClick={() => {
          if (!customWasOn.current) {
            setLogoMode("custom");
            return;
          }
          file.current?.click();
        }}
      >
        Custom
      </button>
      <button
        type="button"
        style={choiceStyle(mode === "folder")}
        aria-pressed={mode === "folder"}
        onMouseDown={holdFocus}
        onClick={() => {
          if (mode !== "folder") setLogoMode("folder");
          if (mode === "folder" || (ready && count === 0)) folder.current?.click();
        }}
      >
        Folder
      </button>
      <PickButton label="Off" on={mode === "off"} onPick={() => setLogoMode("off")} />
      {mode !== "off" ? (
        <label style={logoZoomRow}>
          <span>Zoom</span>
          <input
            type="range"
            min={LOGO_ZOOM_MIN}
            max={LOGO_ZOOM_MAX}
            step={LOGO_ZOOM_STEP}
            value={zoom}
            aria-label="Midfield logo zoom"
            style={tuneInput}
            onChange={(event) => setLogoZoom(Number(event.target.value))}
          />
          <b style={tuneValue}>{zoom.toFixed(2)}×</b>
        </label>
      ) : null}
      {statusText ? <span style={logoStatusStyle}>{statusText}</span> : null}
      <input
        ref={file}
        type="file"
        accept="image/*"
        aria-hidden="true"
        tabIndex={-1}
        style={logoFileInput}
        onChange={(event) => {
          const picked = event.target.files?.[0];
          event.target.value = "";
          if (!picked) return;
          const reader = new FileReader();
          reader.onload = () => {
            const url = reader.result;
            if (typeof url === "string") setLogoCustom(url);
          };
          reader.readAsDataURL(picked);
        }}
      />
      <input
        ref={(node) => {
          folder.current = node;
          if (node) {
            node.webkitdirectory = true;
            node.setAttribute("webkitdirectory", "");
          }
        }}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp"
        aria-hidden="true"
        tabIndex={-1}
        style={logoFileInput}
        onChange={(event) => {
          const picked = event.target.files ? Array.from(event.target.files) : [];
          event.target.value = "";
          if (picked.length === 0) return;
          setStatus("Reading images…");
          void importLogoFolder(picked)
            .then((result) => {
              if (result.ok) setLogoMode("folder");
              setStatus(result.message);
            })
            .catch(() => setStatus("Could not import those images."));
        }}
      />
    </div>
  );
}

function HelmetSideInput({
  side,
  inputRef,
  onDone,
}: {
  side: HelmetSide;
  inputRef: { current: HTMLInputElement | null };
  onDone: (message: string | null) => void;
}) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      aria-hidden="true"
      tabIndex={-1}
      style={logoFileInput}
      onChange={(event) => {
        const picked = event.target.files?.[0];
        event.target.value = "";
        if (!picked) return;
        void storeHelmetSideLogo(side, picked)
          .then((result) => onDone(result.ok ? null : result.message))
          .catch(() => onDone("Could not store that image."));
      }}
    />
  );
}

function HelmetLogoRow({ mode, zoom }: { mode: HelmetLogoMode; zoom: number }) {
  const homeFile = useRef<HTMLInputElement>(null);
  const awayFile = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const logoRev = useSyncExternalStore(subscribeHelmetLogos, readHelmetLogoRev);
  const count = logoRev >= 0 ? helmetFolderCount() : 0;
  const ready = helmetLogoReady();
  const statusText =
    status ?? (mode === "folder" && ready ? (count > 0 ? `${count} ${count === 1 ? "image" : "images"}` : "No images") : null);
  return (
    <div role="group" aria-label="Helmet Logo" style={popRow("end")}>
      <PickButton
        label="Custom Home"
        on={mode === "home"}
        onPick={() => {
          setHelmetLogoMode("home");
          homeFile.current?.click();
        }}
      />
      <PickButton
        label="Custom Away"
        on={mode === "away"}
        onPick={() => {
          setHelmetLogoMode("away");
          awayFile.current?.click();
        }}
      />
      <button
        type="button"
        style={choiceStyle(mode === "folder")}
        aria-pressed={mode === "folder"}
        onMouseDown={holdFocus}
        onClick={() => {
          if (mode !== "folder") setHelmetLogoMode("folder");
          if (mode === "folder" || (ready && count === 0)) folder.current?.click();
        }}
      >
        Folder
      </button>
      <PickButton label="Off" on={mode === "off"} onPick={() => setHelmetLogoMode("off")} />
      {mode !== "off" ? (
        <label style={logoZoomRow}>
          <span>Zoom</span>
          <input
            type="range"
            min={HELMET_LOGO_ZOOM_MIN}
            max={HELMET_LOGO_ZOOM_MAX}
            step={HELMET_LOGO_ZOOM_STEP}
            value={zoom}
            aria-label="Helmet logo zoom"
            style={tuneInput}
            onChange={(event) => setHelmetLogoZoom(Number(event.target.value))}
          />
          <b style={tuneValue}>{zoom.toFixed(2)}×</b>
        </label>
      ) : null}
      {statusText ? <span style={logoStatusStyle}>{statusText}</span> : null}
      <HelmetSideInput side="home" inputRef={homeFile} onDone={setStatus} />
      <HelmetSideInput side="away" inputRef={awayFile} onDone={setStatus} />
      <input
        ref={(node) => {
          folder.current = node;
          if (node) {
            node.webkitdirectory = true;
            node.setAttribute("webkitdirectory", "");
          }
        }}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,text/plain,.txt"
        aria-hidden="true"
        tabIndex={-1}
        style={logoFileInput}
        onChange={(event) => {
          const picked = event.target.files ? Array.from(event.target.files) : [];
          event.target.value = "";
          if (picked.length === 0) return;
          setStatus("Reading images…");
          void importHelmetLogoFolder(picked)
            .then((result) => {
              if (result.ok) setHelmetLogoMode("folder");
              setStatus(result.message);
            })
            .catch(() => setStatus("Could not import those images."));
        }}
      />
    </div>
  );
}

function ModeButton({ id, label, blurb, current }: { id: CamMode; label: string; blurb: string; current: CamMode }) {
  const on = current === id;
  return (
    <button
      type="button"
      title={blurb}
      aria-pressed={on}
      onMouseDown={holdFocus}
      onClick={() => setCamMode(id)}
      style={choiceStyle(on)}
    >
      {label}
    </button>
  );
}

function ProfileButton({ id, label, blurb, current }: { id: ControlProfile; label: string; blurb: string; current: ControlProfile }) {
  const on = current === id;
  return (
    <button
      type="button"
      title={blurb}
      aria-pressed={on}
      onMouseDown={holdFocus}
      onClick={() => setProfile(id)}
      style={choiceStyle(on)}
    >
      {label}
    </button>
  );
}
