import { useState, useSyncExternalStore, type CSSProperties } from "react";
import { CAM_MODES, readCamMode, setCamMode, subscribeCamMode, type CamMode } from "./cameraMode";
import {
  readFieldLook,
  setEzArt,
  setEzTone,
  setSurface,
  subscribeFieldLook,
  toggleLogo,
  type EzArtId,
  type EzTone,
} from "./fieldLook";
import { ModeToggle, PlaySideButton } from "./ModeToggle";
import { CONTROL_PROFILES, askReplay, readBoard, readPaused, readReplayFootage, setPaused, setProfile, subscribeBoard, subscribeReplayFootage, type ControlProfile } from "./sim/boot";
import { beginTape, readTapeOn, readTapeReady, stopTape, subscribeTape, subscribeTapeReady } from "./tapeReplay";

type MenuId = "camera" | "field" | "controller";
type FieldPanel = "surface" | "ezart";

const dock: CSSProperties = {
  position: "fixed",
  left: "50%",
  zIndex: 24,
  transform: "translateX(-50%)",
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

/** Hockey-style bottom menu. One open row sits above CAMERA, FIELD, or CONTROLLER. */
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
    <div style={{ ...dock, bottom: tape || board.replay ? 112 : 16 }}>
      <div style={stack}>
        <div style={row}>
          <ModeToggle mode={board.mode} embedded />
          <PlaySideButton side={board.side} />
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
                <IdleButton label="Width" />
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
                <IdleButton label="EZ text" />
                <button
                  type="button"
                  style={choiceStyle(look.logo)}
                  aria-pressed={look.logo}
                  onMouseDown={holdFocus}
                  onClick={toggleLogo}
                >
                  Logo
                </button>
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
        </div>
      </div>
    </div>
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

function IdleButton({ label }: { label: string }) {
  return (
    <button type="button" style={choiceStyle(false)} onMouseDown={holdFocus}>
      {label}
    </button>
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
