"use strict";
/**
 * Football Ground Attack Lab v10 engine
 * Practice lab: 6×6 books, replay cameras, robotic players, stadium bowl.
 * v10 restores offense teammate steer (Z/X, LT/RT) that v8 dropped for defense wrap/punch.
 */
const GAME_ASSET_BASE = (() => {
	const cur = document.currentScript;
	if (cur && cur.src) return cur.src.replace(/[^/]+(?:\?.*)?$/, "");
	const scripts = document.getElementsByTagName("script");
	for (let i = 0; i < scripts.length; i++) {
		const src = scripts[i].src || "";
		if (src.indexOf("game.js") !== -1) return src.replace(/[^/]+(?:\?.*)?$/, "");
	}
	return "";
})();
/**
* Football Ground Attack Lab — Default feel pass
* Port of the v1 canvas sim + locked v2 mapping / AI / truck / burst / fumble.
*/
const UNIFORMS = [
	{ id: 0, helmet: "#002244", jersey: "#FB4F14", pants: "#002244", number: "#002244", numOutline: "#FFFFFF", facemask: "#FFFFFF", endPrimary: "#002244", endSecondary: "#FB4F14", logoFill: "#002244", logoMark: "#FB4F14", crowdPri: "#FB4F14", crowdSec: "#002244", socks: "#FB4F14", shoes: "#0d0f12", ball: "#6B3A2A", lace: "#F5E6C8", ribbon: "#FB4F14", helmStripes: 1, helmStripeCol: "#FB4F14", pantStripes: 1, sleeveStripes: 3 },
	{ id: 1, helmet: "#E31837", jersey: "#FFFFFF", pants: "#E31837", number: "#E31837", numOutline: "#FFB81C", facemask: "#FFFFFF", endPrimary: "#E31837", endSecondary: "#FFB81C", logoFill: "#E31837", logoMark: "#FFB81C", crowdPri: "#E31837", crowdSec: "#FFB81C", socks: "#FFFFFF", shoes: "#E31837", ball: "#6B3A2A", lace: "#F5E6C8", ribbon: "#E31837", helmStripes: 0, helmStripeCol: "#E31837", pantStripes: 1, sleeveStripes: 3 },
	{ id: 2, helmet: "#FFFFFF", jersey: "#00338D", pants: "#FFFFFF", number: "#FFFFFF", numOutline: "#C60C30", facemask: "#00338D", endPrimary: "#00338D", endSecondary: "#FFFFFF", logoFill: "#FFFFFF", logoMark: "#00338D", crowdPri: "#00338D", crowdSec: "#C60C30", socks: "#00338D", shoes: "#00338D", ball: "#FFFFFF", lace: "#00338D", ribbon: "#00338D", helmStripes: 1, helmStripeCol: "#00338D", pantStripes: 3, sleeveStripes: 2 },
	{ id: 3, helmet: "#101820", jersey: "#006778", pants: "#101820", number: "#FFFFFF", numOutline: "#101820", facemask: "#D7A22A", endPrimary: "#006778", endSecondary: "#D7A22A", logoFill: "#006778", logoMark: "#D7A22A", crowdPri: "#006778", crowdSec: "#D7A22A", socks: "#D7A22A", shoes: "#101820", ball: "#6B3A2A", lace: "#F5E6C8", ribbon: "#006778", helmStripes: 0, helmStripeCol: "#D7A22A", pantStripes: 1, sleeveStripes: 3 },
	{ id: 4, helmet: "#A5ACAF", jersey: "#000000", pants: "#A5ACAF", number: "#A5ACAF", numOutline: "#FFFFFF", facemask: "#000000", endPrimary: "#000000", endSecondary: "#A5ACAF", logoFill: "#000000", logoMark: "#A5ACAF", crowdPri: "#111111", crowdSec: "#A5ACAF", socks: "#000000", shoes: "#111111", ball: "#6B3A2A", lace: "#F5E6C8", ribbon: "#111111", helmStripes: 1, helmStripeCol: "#111111", pantStripes: 1, sleeveStripes: 3 },
	{ id: 5, helmet: "#B3995D", jersey: "#AA0000", pants: "#B3995D", number: "#FFFFFF", numOutline: "#B3995D", facemask: "#FFFFFF", endPrimary: "#AA0000", endSecondary: "#B3995D", logoFill: "#AA0000", logoMark: "#B3995D", crowdPri: "#AA0000", crowdSec: "#B3995D", socks: "#AA0000", shoes: "#1a1208", ball: "#6B3A2A", lace: "#F5E6C8", ribbon: "#AA0000", helmStripes: 1, helmStripeCol: "#AA0000", pantStripes: 1, sleeveStripes: 3 },
	{ id: 6, helmet: "#4F2683", jersey: "#FFC62F", pants: "#4F2683", number: "#4F2683", numOutline: "#FFFFFF", facemask: "#FFC62F", endPrimary: "#4F2683", endSecondary: "#FFC62F", logoFill: "#4F2683", logoMark: "#FFC62F", crowdPri: "#4F2683", crowdSec: "#FFC62F", socks: "#FFC62F", shoes: "#2a1548", ball: "#6B3A2A", lace: "#F5E6C8", ribbon: "#4F2683", helmStripes: 0, helmStripeCol: "#FFC62F", pantStripes: 1, sleeveStripes: 3 },
	{ id: 7, helmet: "#FFB612", jersey: "#203731", pants: "#FFB612", number: "#FFFFFF", numOutline: "#FFB612", facemask: "#203731", endPrimary: "#203731", endSecondary: "#FFB612", logoFill: "#203731", logoMark: "#FFB612", crowdPri: "#FFB612", crowdSec: "#203731", socks: "#203731", shoes: "#203731", ball: "#6B3A2A", lace: "#F5E6C8", ribbon: "#203731", helmStripes: 1, helmStripeCol: "#203731", pantStripes: 1, sleeveStripes: 2 }
];
function numRange(a, b) {
	const o = [];
	for (let n = a; n <= b; n++) o.push(n);
	return o;
}
const NUM_POOLS = {
	QB: numRange(1, 19),
	TE: numRange(10, 19).concat(numRange(80, 89)),
	DT: numRange(50, 59).concat(numRange(70, 79)).concat(numRange(90, 99)),
	FB: numRange(20, 49),
	HB: numRange(1, 39),
	DB: numRange(0, 9).concat(numRange(20, 49)),
	LB: numRange(0, 9).concat(numRange(40, 59)).concat(numRange(90, 99)),
	OL: numRange(50, 79)
};

const OFF_PLAYS = [
	{
		id: "blastR",
		name: "Blast",
		arrow: [.45, .55],
		blockStyle: "zoneR",
		lockFirst: false,
		steps: [{
			dx: .35,
			dy: .55,
			t: .16
		}, {
			dx: .4,
			dy: .9,
			t: .22
		}]
	},
	{
		id: "sweepL",
		name: "Pitch",
		arrow: [-1.15],
		blockStyle: "wallL",
		lockFirst: false,
		steps: [{
			dx: -.9,
			dy: .5,
			t: .22
		}]
	},
	{
		id: "sweepR",
		name: "Sweep",
		arrow: [1.15],
		blockStyle: "wallR",
		lockFirst: false,
		steps: [{
			dx: .9,
			dy: .5,
			t: .22
		}]
	},
	{
		id: "river",
		name: "River",
		arrow: [-.4, .55, -.25, .7],
		blockStyle: "river",
		lockFirst: true,
		steps: [{
			dx: -.45,
			dy: .25,
			t: .14
		}, {
			dx: .5,
			dy: .45,
			t: .16
		}, {
			dx: -.3,
			dy: .4,
			t: .14
		}, {
			dx: .55,
			dy: .7,
			t: .2
		}]
	},
	{
		id: "diveL",
		name: "Zig Zag",
		arrow: [-.45, .55, -.5, .5, -.35],
		blockStyle: "zigzag",
		lockFirst: false,
		steps: [{
			dx: -.42,
			dy: .72,
			t: .18
		}, {
			dx: .58,
			dy: .75,
			t: .18
		}, {
			dx: -.52,
			dy: .78,
			t: .18
		}, {
			dx: .5,
			dy: .78,
			t: .18
		}, {
			dx: -.38,
			dy: .85,
			t: .22
		}]
	},
	{
		id: "wedgeL",
		name: "Wedge",
		arrow: [.4, -1.35],
		blockStyle: "wedgeL",
		lockFirst: false,
		steps: [{
			dx: .45,
			dy: .12,
			t: .13
		}, {
			dx: -1.15,
			dy: .5,
			t: .2
		}, {
			dx: -.85,
			dy: .75,
			t: .2
		}, {
			dx: -.55,
			dy: .9,
			t: .18
		}]
	},
	];
const AUDIBLE_BUTTONS = [
	// Instant-pick LB/RB shortcuts removed — 1–6 and stick browse only.
];
const DEF_SCHEMES = [
	{
		id: "cover4Quarters",
		name: "Quarters",
		depthLB: 5.5,
		depthDB: 12,
		cluster: "spread"
	},
	{
		id: "overloadBlitz",
		name: "Overload",
		depthLB: 4.4,
		depthDB: 9.2,
		cluster: "left"
	},
	{
		id: "prevent",
		name: "Prevent / Cloud",
		depthLB: 6.8,
		depthDB: 13.5,
		cluster: "spread"
	},
	{
		id: "tight",
		name: "Bear",
		depthLB: 4.2,
		depthDB: 8,
		cluster: "middle"
	},
	{
		id: "wide",
		name: "Fire Zone",
		depthLB: 5.2,
		depthDB: 9.5,
		cluster: "wide"
	},
	{
		id: "goalLine",
		name: "Walk-Up",
		depthLB: 3.6,
		depthDB: 6.2,
		cluster: "middle"
	}
];

const ROUTE_TEMPLATES = {
	ozR: [{ dx: .55, dy: .65, t: .18 }, { dx: .7, dy: .85, t: .26 }],
	ozL: [{ dx: -.55, dy: .65, t: .18 }, { dx: -.7, dy: .85, t: .26 }],
	blastR: [{ dx: .35, dy: .55, t: .16 }, { dx: .4, dy: .9, t: .22 }],
	blastL: [{ dx: -.35, dy: .55, t: .16 }, { dx: -.4, dy: .9, t: .22 }],
	arrowR: [{ dx: .85, dy: .45, t: .16 }, { dx: .5, dy: .8, t: .2 }],
	arrowL: [{ dx: -.85, dy: .45, t: .16 }, { dx: -.5, dy: .8, t: .2 }],
	needleL: [{ dx: -.55, dy: .85, t: .2 }],
	needleR: [{ dx: .55, dy: .85, t: .2 }],
	sweepL: [{ dx: -.9, dy: .5, t: .22 }, { dx: -.7, dy: .75, t: .2 }],
	sweepR: [{ dx: .9, dy: .5, t: .22 }, { dx: .7, dy: .75, t: .2 }],
	stretchR: [{ dx: .75, dy: .35, t: .16 }, { dx: .85, dy: .7, t: .24 }],
	stretchL: [{ dx: -.75, dy: .35, t: .16 }, { dx: -.85, dy: .7, t: .24 }],
	counterR: [{ dx: -.4, dy: .2, t: .14 }, { dx: .85, dy: .7, t: .22 }],
	counterL: [{ dx: .4, dy: .2, t: .14 }, { dx: -.85, dy: .7, t: .22 }],
	floodR: [{ dx: .5, dy: .6, t: .16 }, { dx: .35, dy: .9, t: .22 }],
	floodL: [{ dx: -.5, dy: .6, t: .16 }, { dx: -.35, dy: .9, t: .22 }],
	diveL: [{ dx: -.22, dy: .95, t: .28 }],
	leadL: [{ dx: -.55, dy: .7, t: .2 }, { dx: -.4, dy: .85, t: .22 }],
	plungeL: [{ dx: -.12, dy: .3, t: .12 }, { dx: -.5, dy: .95, t: .3 }],
	delayMid: [{ dx: .04, dy: .12, t: .22 }, { dx: .08, dy: .75, t: .24 }],
	pressL: [{ dx: -.9, dy: .32, t: .16 }, { dx: -.15, dy: .8, t: .22 }],
	shortL: [{ dx: -.4, dy: .72, t: .16 }],
	shortCounterR: [{ dx: -.3, dy: .18, t: .12 }, { dx: .7, dy: .65, t: .18 }],
	flatArrowL: [{ dx: -.7, dy: .25, t: .16 }, { dx: -.55, dy: .5, t: .16 }],
	// 1.1.A clip trails, truncated 10 yd past the LOS, world units (sx=8.4, sy=6.6).
	bounceR: [{ dx: .84, dy: .91, t: .18 }, { dx: .92, dy: 1.36, t: .22 }],
	cutbackR: [{ dx: -.83, dy: .94, t: .16 }, { dx: .55, dy: 1.34, t: .22 }]
};
function cloneSteps(steps) {
	return (steps || []).map((st) => ({ ...st }));
}
function stepsToArrow(steps) {
	return (steps || []).map((st) => st.dx || 0);
}
// Keeper film sheet. Dropped cells omit the facing so stock / mirrored art stays.
const ROUTE_BOOK = {
	blast: {
		overloadBlitz: { stock: { primary: "ozR" }, flipped: { primary: "diveL" } },
		prevent: { stock: { primary: "arrowR", secondary: "needleL" }, flipped: { primary: "blastL", secondary: "blastR" } },
		wide: { stock: { primary: "ozR", secondary: "blastL" }, flipped: { primary: "leadL" } },
		goalLine: { stock: { primary: "ozR", secondary: "sweepL" }, flipped: { primary: "plungeL" } },
		cover4Quarters: { stock: { primary: "bounceR", secondary: "cutbackR" }, flipped: { primary: "blastL" } }
	},
	pitch: {
		cover4Quarters: { stock: { primary: "arrowL" } },
		overloadBlitz: { stock: { primary: "leadL" } },
		prevent: { stock: { primary: "arrowL", secondary: "stretchR" } }
	},
	sweep: {
		prevent: { flipped: { primary: "ozL", secondary: "ozR" } },
		wide: { flipped: { primary: "stretchR" } }
	},
	river: {
		cover4Quarters: { stock: { primary: "counterR" } },
		overloadBlitz: { stock: { primary: "stretchR", secondary: "flatArrowL" } },
		prevent: { stock: { primary: "blastR", secondary: "arrowL" }, flipped: { primary: "arrowL", secondary: "arrowR" } },
		wide: { stock: { primary: "arrowR", secondary: "ozR" }, flipped: { primary: "counterR" } },
		tight: { flipped: { primary: "stretchR" } }
	},
	zigzag: {
		cover4Quarters: { stock: { primary: "pressL" }, flipped: { primary: "pressL" } },
		overloadBlitz: { stock: { primary: "sweepR" } },
		prevent: { stock: { primary: "floodR", secondary: "arrowR" }, flipped: { primary: "delayMid" } },
		wide: { stock: { primary: "counterR" }, flipped: { primary: "arrowL", secondary: "blastR" } },
		tight: { flipped: { primary: "sweepR" } }
	},
	wedge: {
		cover4Quarters: { stock: { primary: "counterL" } },
		prevent: { stock: { primary: "floodL", secondary: "blastL" }, flipped: { primary: "blastL" } },
		tight: { stock: { primary: "sweepL" } },
		goalLine: { stock: { primary: "sweepL", secondary: "counterL" } }
	}
};
function playBookKey(play) {
	if (!play) return "";
	const id = String(play.baseId || play.id || "");
	if (id === "blastR" || (play.name === "Blast" && !String(play.blockStyle || "").startsWith("wedge"))) return "blast";
	if (id === "sweepL" || play.name === "Pitch") return "pitch";
	if (id === "sweepR" || play.name === "Sweep") return "sweep";
	if (id.startsWith("river") || play.name === "River") return "river";
	if (id.startsWith("dive") || play.name === "Zig Zag") return "zigzag";
	if (id.startsWith("wedge") || play.name === "Wedge" || String(play.blockStyle || "").startsWith("wedge")) return "wedge";
	return "";
}
function cellFacing(play, oFlip, dFlip) {
	const key = playBookKey(play);
	if (key === "river" || key === "wedge") return dFlip ? "flipped" : "stock";
	return oFlip ? "flipped" : "stock";
}

const CAMERAS = {
	iso: {
		id: "iso",
		name: "Angled 2D",
		skew: .072,
		yScale: .72,
		yBias: .12,
		xLean: .08,
		follow: 6,
		zoom: 1,
		sc: 1.05
	},
	top: {
		id: "top",
		name: "Overhead",
		skew: 0,
		yScale: 1,
		yBias: 0,
		xLean: 0,
		follow: 6,
		zoom: 1,
		sc: 1
	},
	topZoom: {
		id: "topZoom",
		name: "Overhead Zoom",
		skew: 0,
		yScale: 1,
		yBias: 0,
		xLean: 0,
		follow: 4.2,
		zoom: 1.52,
		sc: 1.18
	},
	high: {
		id: "high",
		name: "High Angle",
		skew: .16,
		yScale: .58,
		yBias: .2,
		xLean: .16,
		follow: 8,
		zoom: .94,
		sc: 1.02
	},
	zoom: {
		id: "zoom",
		name: "Zoom",
		skew: .05,
		yScale: .78,
		yBias: .08,
		xLean: .05,
		follow: 3.5,
		zoom: 1.48,
		sc: 1.22
	},
	wide: {
		id: "wide",
		name: "Wide",
		skew: .11,
		yScale: .55,
		yBias: .18,
		xLean: .1,
		follow: 11,
		zoom: .66,
		sc: .82
	},
	free: {
		id: "free",
		name: "Freestyle",
		skew: 0,
		yScale: 1,
		yBias: 0,
		xLean: 0,
		follow: 6,
		zoom: 1,
		sc: 1
	}
};
const SPRINT_MULT = 1.38;
const SPRINT_GRACE = 3;
const STORAGE_KEY = "fga_lab_top5_v5";
const DPAD_DIAG_WIN = .04;
function clamp(v, lo, hi) {
	return Math.max(lo, Math.min(hi, v));
}
function dist(a, b) {
	return Math.hypot(a.x - b.x, a.y - b.y);
}
function randChoice(arr) {
	return arr[Math.floor(Math.random() * arr.length)];
}
function hashSeed(str) {
	let h = 2166136261 >>> 0;
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}
function mulberry32(a) {
	return function () {
		a |= 0;
		a = a + 0x6D2B79F5 | 0;
		let t = Math.imul(a ^ a >>> 15, 1 | a);
		t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}
function shuffle(arr) {
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr;
}
function hash2(ix, iy) {
	let n = Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) | 0;
	n = Math.imul(n ^ n >>> 13, 1274126177);
	return ((n ^ n >>> 16) >>> 0) / 4294967296;
}
function $(id) {
	return document.getElementById(id);
}
function startGame(canvas) {
	const maybeCtx = canvas.getContext("2d");
	if (!maybeCtx) return () => {};
	let ctx = maybeCtx;
	let FIELD_WIDTH = Field.setWidth(Field.spec.defaultWidth);
	let surface = "grass";
	let ezArtMode = "mountains";
	let ezTextMode = "ee";
	let ezCustomText = "ELEVATION EDGE";
	let midLogoOn = true;
	const eeLogoImg = new Image();
	eeLogoImg.src = GAME_ASSET_BASE + "ee-logo.png?v=4";
	function eeLogoReady() {
		return !!(eeLogoImg && eeLogoImg.complete && eeLogoImg.naturalWidth > 0);
	}
	const homeLogoCache = {};
	function homeLogoReady() {
		if (!eeLogoReady()) return null;
		const uni = getUni("off");
		if (!uni || uni.id === 0) return eeLogoImg;
		const fill = uni.logoFill || uni.endPrimary || "#002244";
		const mark = uni.logoMark || uni.endSecondary || "#FB4F14";
		const key = String(uni.id) + "|" + fill + "|" + mark;
		if (homeLogoCache[key]) return homeLogoCache[key];
		const src = eeLogoImg;
		const c = document.createElement("canvas");
		c.width = src.naturalWidth;
		c.height = src.naturalHeight;
		const g = c.getContext("2d");
		g.drawImage(src, 0, 0);
		const img = g.getImageData(0, 0, c.width, c.height);
		const d = img.data;
		const F = hexRgb(fill), M = hexRgb(mark);
		for (let i = 0; i < d.length; i += 4) {
			if (d[i + 3] < 18) continue;
			const r = d[i], gv = d[i + 1], b = d[i + 2];
			if (r > 200 && gv > 200 && b > 200) continue;
			if (r > gv + 18 && r > b + 18 && r > 70) {
				d[i] = M.r; d[i + 1] = M.g; d[i + 2] = M.b;
			} else {
				d[i] = F.r; d[i + 1] = F.g; d[i + 2] = F.b;
			}
		}
		g.putImageData(img, 0, 0);
		homeLogoCache[key] = c;
		return c;
	}
	const BASE_CANVAS_H = 620;
	const PX_PER_YARD_X = BASE_CANVAS_H / Field.length;
	const VISIBLE_YARDS = Field.visibleYards;
	let SCALE_X = PX_PER_YARD_X;
	let SCALE_Y = BASE_CANVAS_H / VISIBLE_YARDS;
	function refreshScale() {
		FIELD_WIDTH = Field.setWidth(FIELD_WIDTH);
		const wrap = canvas.parentElement;
		const cssW = Math.max(520, wrap && wrap.clientWidth || 900);
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		canvas.style.width = "100%";
		canvas.style.height = "auto";
		canvas.width = Math.round(cssW * dpr);
		canvas.height = Math.round(BASE_CANVAS_H * dpr);
		SCALE_X = canvas.width / FIELD_WIDTH;
		SCALE_Y = canvas.height / VISIBLE_YARDS;
	}
	function fieldLeft() {
		return Field.left();
	}
	function fieldRight() {
		return Field.right();
	}
	let cameraY = 55;
	let clock = 120;
	let gameSeconds = 120;
	let score = 0;
	let totalYards = 0;
	let tdCount = 0;
	let playActive = true;
	let paused = false;
	let camAdjust = false;
	let camAdjustEdge = false;
	let poseClock = 0;
	let cheerAmp = 0;
	let cheerHoldT = 0;
	let cheerHoldArmed = false;
	const CHEER_HOLD_MAX = 10;
	let lastPlayContact = null;
	let pauseTimer = 0;
	let lastTime = performance.now();
	const SIM_DT = 1 / 60;
	const SIM_MAX_STEPS = 8;
	let simAcc = 0;
	let padName = "";
	let padT9 = ""; // "" | "v1" | "v2" — T-9 DirectInput vs standard mapping
	let t9RyAxis = 5; // latched raw T-9 right-stick Y: 5 (v1) or 3 (v2-raw)
	const T9_ID_RE = /1949.*0402|Vendor:\s*1949\s*Product:\s*0402|\bT-?9\b|Terios/i;
	const T9_BTN_MAP = [0, 1, 3, 4, 6, 7, 8, 9, 10, 11, 13, 14]; // standard → T-9 v1 DirectInput
	let sessionOver = false;
	let gamesPlayed = 0;
	let numOL = 5;
	let numFB = 1;
	let numTE = 3;
	let numQB = 1;
	let numDT = 3;
	let numLBs = 2;
	let numDBs = 6;
	let playSpeed = 1.1;
	const SPEED_UI_SCALE = 1.1; // labeled 1.00× runs at 1.10; whole scale is +10%
	let youStrength = 1.0;
	let mateStrength = 1.0;
	let cpuStrength = 1.0;
	let offStrength = 1.0;
	let defStrength = 1.0;
	const BREAK_BLOCK_UI_SCALE = 0.75; // labeled 1.00 runs at 0.75
	const BREAK_TACKLE_UI_SCALE = 1.50; // labeled 1.00 runs at 1.50
	let breakBlock = 0.75;   // defense ability to shed blocks (>1 sheds more)
	let breakTackle = 1.50;  // RB ability to break tackles (>1 more YAC / fewer wraps)
	let fumblesOn = false;
	let userStartYard = 50; // game-mode opening LOS (50)
	let practiceStartYard = 70; // practice LOS (OPP 30), fully adjustable
	let postTdMode = "random";
	let tdIncrement = 5;
	let startSide = "own"; // own triangle down, opp triangle up
	let randMin = 20;
	let randMax = 80;
	let ballYard = 50;
	let playStartYard = 50;
	let driveStartYard = 40;
	let ballX = 25;
	let sprintCharge = 1;
	let sprintHoldT = 0;
	let sprintExhausted = false;
	let fatigueOn = true;
	let camZoom = 1;
	let breakaway = false;
	let tdZoom = false;
	let cameraMode = "free";
	let camCorner = Math.random() < .5 ? "sw" : "nw";
	let playArtMode = "on";
	let padProfile = "v6";
	let qaPad = null;
	const PROFILE_LABELS = {
		basic: "Basic (v1)",
		classic: "Expanded (v2)",
		v3: "Wings (v3)",
		v4: "Independent (v4)",
		v6: "Classic (v6)"
	};
	function profileLabel(id) {
		return PROFILE_LABELS[id] || id;
	}
	let gameMode = "game"; // "game" | "practice"
	let userSide = "off"; // "off" | "def"
	let userDefender = null;
	let userDefHuddleKey = null;
	let defAHoldT = 0;
	let defAHoldArmed = false;
	let defCycleEdge = false;
	let defPointLatch = false;
	let defBPointed = false;
	let defSwitchEdge = false;
	let defStartEdge = false;
	let defWrapPhase = "none";
	let defWrapT = 0;
	let defWrapFrom = null;
	let defHitLatch = false;
	let defHitCool = 0;
	let defDive = null;
	let defMoveId = null;
	let defMoveT = 0;
	let defDiveEdge = false;
	let defWrapLEdge = false;
	let defWrapREdge = false;
	let defShedEdge = false;
	let defYSnapEdge = false;
	let qaNoCpuTackle = false;
	let nextPlayOnSnap = false; // game default: automatic next play
	let gameAutoSnapT = 0;
	let practiceOffPlayId = null;
	let practiceDefSchemeId = null;
	let huddleOffPickId = null;
	let huddleDefPickId = null;
	let practiceOffPlayIdPrev = null;
	let practiceDefSchemeIdPrev = null;
	let practiceYCancelEdge = false;
	let practiceAwaitSnap = false;
	let practiceFlipped = false;
	let practiceFlipEdge = false;
	let practiceDefFlipped = false;
	let practiceDefFlipEdge = false;
	let showRunnerTrail = true;
	let speedTrail = false; // thickness-by-speed removed
	let runnerTrail = []; // [{x,y,spd}, ...]
	let _trailAcc = 0;
	let practiceAudibleArm = false;
	let practiceAudibleEdge = false;
	let practiceDefAudibleArm = false;
	let practiceDefAudibleEdge = false;
	let practiceFocusSide = "off"; // "off" | "def" — focused playbook
	let practiceBookLatch = false;
	let practiceNumLatch = false;
	let practiceStickNavT = 0;
	let practiceStickLatch = 0;
	let practiceDefStickLatch = 0;
	let lastRsY = 0;
	let allowSameUniform = false; // always enforce different kits
	let swapStickDpad = false;
	let replayMode = "pip";
	let playAge = 0;
	let idleCarrierT = 0;
	let ankleCam = null;
	let camOp = { panX: 0, panY: 0, yaw: 0, zoom: 1, theta: 0, phi: 0.82 };
	let viewHook = null;
	let jumboCan = null;
	let jumboBusy = false;
	let sbFaceCanN = null;
	let sbFaceCanS = null;
	let camFocusX = 25;
	let camFocusY = 55;
	let lookX = 25;
	let lookY = 55;
	let replayCursorFree = false;
	let freeLook = false;
	let freeOrbit = { theta: 0, phi: 0.82, zoom: 1 };
	let replayToggleEdge = false;
	let replayLeaveEdge = false;
	let replayHudRate = 1;
	let peekHeld = false;
	let peekToggle = false;
	let revealDefThisPlay = false;
	let fullReplay = null;
	let pipReplay = null;
	let replayBuf = [];
	let replayAcc = 0;
	let playFrames = [];
	let lastPlayFrames = [];
	let huddleBuf = [];
	const REPLAY_HZ = 30;
	const REPLAY_CAP = 1200;
	const HUDDLE_KEEP = 15;
	const SAVED_CLIPS_KEY = "fga_saved_clips_v1";
	const SAVED_CLIPS_MAX = 10;
	let ctrlLeft = null;
	let ctrlRight = null;
	let latchCtrlL = null;
	let latchCtrlR = null;
	let playArtAnchor = {
		x: 25,
		y: 80
	};
	let divePauseEdge = false;
	let getUpT = 0;
	let diveHangT = 0;
	let autoRun = false;
	let rb = null;
	let qb = null;
	let blockers = [];
	let defenders = [];
	let offUni = 0;
	let defUni = Math.random() < 0.5 ? 4 : 1;
	function emptyNumMap() {
		return { QB: [], TE: [], DT: [], FB: [], HB: [], OL: [], LB: [], DB: [] };
	}
	const assignedNums = { off: emptyNumMap(), def: emptyNumMap() };
	let currentPlay = null;
	let currentScheme = DEF_SCHEMES[0];
	let preSnapTimer = 0;
	let handoffDone = true;
	let handoffT = 0;
	let handoffPhase = "done"; // pre | toss | done
	let handoffBall = null; // {x,y} mid-air during pitch
	let celebrateTimer = 0;
	let logoFlip = Math.random() < 0.5 ? 1 : 0;
	let fieldArtSide = "off";
	let moveCooldown = 0;
	let activeMove = null;
	let moveTimer = 0;
	let moveDur = 0;
	let autoStartTimer = null;
	let scriptSteps = [];
	let scriptIndex = 0;
	let scriptTimer = 0;
	let scriptLocked = false;
	let tackleAnim = null;
	let fumbleSeq = null;
	let scoreSeq = null;
	let hurdleTarget = null;
	let hurdleOk = false;
	let hurdleDidTrip = false;
	let lastSteer = {
		dx: 0,
		dy: 1
	};
	let dive = null;
	let pauseEdge = false;
	let spinPauseEdge = false;
	let confirmEdge = false;
	let celebrateEdge = false;
	let celebFumbleLock = false;
	let prevA = false;
	let prevStart = false;
	const keys = /* @__PURE__ */ new Set();
	const touch = {
		active: false,
		ox: 0,
		oy: 0,
		dx: 0,
		dy: 0,
		burst: false
	};
	let dpadLatch = false;
	let dpadPending = null;
	let dpadPendingT = 0;
	let dpadMove = null;
	function sideYardToAbsolute(side, yd50) {
		const y = clamp(Math.round(yd50), 1, 50);
		if (side === "opp") return clamp(100 - y, 1, 99);
		return clamp(y, 1, 99);
	}
	function absoluteToSideYard(abs) {
		const a = clamp(Math.round(abs), 1, 99);
		if (a >= 50) return { side: "opp", yd: clamp(100 - a, 1, 50) };
		return { side: "own", yd: clamp(a, 1, 50) };
	}
	function userToAbsolute(userYd) {
		// legacy: treat raw number as absolute field yard
		return clamp(userYd, 1, 99);
	}
	function absoluteToUser(abs) {
		return clamp(Math.round(abs), 1, 99);
	}
	function refreshStartTri() {
		const tri = $("startSideTri");
		if (!tri) return;
		const yd = parseInt($("startYard50")?.value, 10);
		if (yd === 50) {
			tri.textContent = "◆";
			tri.className = "los-tri mid";
			tri.title = "50";
			return;
		}
		if (startSide === "opp") {
			tri.textContent = "▲";
			tri.className = "los-tri opp";
			tri.title = "OPP";
		} else {
			tri.textContent = "▼";
			tri.className = "los-tri own";
			tri.title = "OWN";
		}
	}
	function syncStartYardFromUI() {
		const ydEl = $("startYard50");
		const hidden = $("startYardInput");
		const sideEl = $("startSideSelect");
		const yd = ydEl ? parseInt(ydEl.value, 10) || 50 : 50;
		if (yd === 50) startSide = "own"; // 50 is midfield either way
		userStartYard = sideYardToAbsolute(startSide, yd);
		if (hidden) hidden.value = String(userStartYard);
		if (sideEl) sideEl.value = startSide;
		refreshStartTri();
		return userStartYard;
	}
	function nudgeStartYard(dir) {
		const el = $("startYard50");
		if (!el) return;
		let yd = clamp((parseInt(el.value, 10) || 50) + dir, 1, 50);
		el.value = String(yd);
		syncStartYardFromUI();
	}
	function syncPracticeYardFromUI() {
		const sideEl = $("practiceSideSelect");
		const ydEl = $("practiceYard50");
		const side = sideEl ? sideEl.value : "opp";
		const yd = ydEl ? parseInt(ydEl.value, 10) || 30 : 30;
		practiceStartYard = sideYardToAbsolute(side, yd);
		return practiceStartYard;
	}
	function applyPracticeLosNow() {
		if (gameMode !== "practice") return;
		const fixed = clamp(syncPracticeYardFromUI(), 1, 99);
		practiceStartYard = fixed;
		ballYard = fixed;
		playStartYard = fixed;
		driveStartYard = fixed;
		ballX = (hashLeft() + hashRight()) / 2;
		practiceAwaitSnap = true;
		playActive = false;
		try { placeEntitiesForNewPlay(); } catch (err) { console.error(err); }
		updateBallOn();
		if (typeof refreshPracticePreviews === "function") refreshPracticePreviews();
		setPlayCall((currentPlay ? currentPlay.name : "Practice") + " @ " + yardLabel(fixed) + huddleWaitHint());
		if (typeof armGameDefAutoSnap === "function") armGameDefAutoSnap();
	}
	function updateConfigPanelForMode() {
		const title = $("configPanelTitle");
		const gameBody = $("gameConfigBody");
		const pracBody = $("practiceConfigBody");
		const isPrac = gameMode === "practice";
		if (title) title.innerHTML = (isPrac ? "Practice Config" : "Game Config") + ' <span aria-hidden>▾</span>';
		if (gameBody) gameBody.classList.toggle("hidden", isPrac);
		if (pracBody) pracBody.classList.toggle("hidden", !isPrac);
	}
	function refreshHudSegments() {
		const sideSel = $("sideSelect");
		const nextSel = $("nextPlaySelect");
		const current = {
			mode: gameMode,
			side: sideSel ? sideSel.value : "off",
			next: nextSel ? nextSel.value : "auto"
		};
		document.querySelectorAll(".hud-segments button[data-seg]").forEach((btn) => {
			const seg = btn.getAttribute("data-seg");
			btn.setAttribute("aria-pressed", btn.getAttribute("data-value") === current[seg] ? "true" : "false");
		});
	}
	function bindHudSegments() {
		const ids = { mode: "modeSelect", side: "sideSelect", next: "nextPlaySelect" };
		document.querySelectorAll(".hud-segments button[data-seg]").forEach((btn) => {
			btn.addEventListener("click", () => {
				const sel = $(ids[btn.getAttribute("data-seg")]);
				if (!sel) return;
				const value = btn.getAttribute("data-value") || "";
				if (sel.value !== value) {
					sel.value = value;
					sel.dispatchEvent(new Event("change", { bubbles: true }));
				}
				refreshHudSegments();
			});
		});
		refreshHudSegments();
	}
	function syncNextPlayDefault() {
		const np = $("nextPlaySelect");
		if (gameMode === "game") {
			if (np) np.value = "auto";
			nextPlayOnSnap = false;
		} else {
			if (np) np.value = "snap";
			nextPlayOnSnap = true;
		}
		refreshHudSegments();
	}
	function huddleWaitHint() {
		if (!nextPlayOnSnap) return " — auto snap";
		if (gameMode === "practice") return " — X/B book · A snap · R replay";
		return " — A snap · R replay";
	}
	function armGameDefAutoSnap() {
		gameAutoSnapT = 0;
		if (playingDefense() && !nextPlayOnSnap && practiceAwaitSnap) {
			// Uniform 1.1–2.1s huddle to switch / shade (Practice and Game).
			gameAutoSnapT = 1.1 + Math.random();
		}
	}
	function wantsDefHuddle() {
		return nextPlayOnSnap || gameMode === "practice" || (gameMode === "game" && playingDefense());
	}
	function nudgeUserDefenderPresnap(dt, inp) {
		const me = userDefender;
		if (!me || !inp) return;
		if (inp.spin && Math.hypot(inp.dx, inp.dy) > 0.4) return;
		const mag = Math.hypot(inp.dx, inp.dy);
		if (mag < 0.16) {
			me.vx = 0;
			me.vy = 0;
			return;
		}
		const spd = (me.baseSpeed || 8.6) * 0.7 * playSpeed;
		me.vx = inp.dx * spd;
		me.vy = inp.dy * spd;
		me.x += me.vx * dt;
		me.y += me.vy * dt;
		me.x = clamp(me.x, fieldLeft() + 2.2, fieldRight() - 2.2);
		me.y = clamp(me.y, playStartYard + 1.15, Math.min(Field.bodyCapY, playStartYard + 18));
		me.facing = Math.atan2(inp.dy, inp.dx);
	}
	function yardLabel(y) {
		if (y >= 100) return "TD";
		if (y <= 0) return "OWN G";
		if (Math.abs(y - 50) < 0.5) return "50";
		if (y > 50) return "OPP " + Math.round(100 - y);
		return "OWN " + Math.round(y);
	}
	function formatClock(t) {
		if (t <= 0) return "0:00";
		if (t >= 60) {
			const m = Math.floor(t / 60);
			const s = Math.floor(t % 60);
			return m + ":" + String(s).padStart(2, "0");
		}
		return t.toFixed(1);
	}
	function setPlayCall(name) {
		const pc = $("playCallName");
		if (!pc) return;
		pc.textContent = name;
		pc.classList.remove("play-call-flash");
		pc.offsetWidth;
		pc.classList.add("play-call-flash");
	}
	function pauseBannerHTML(kind) {
		const banner = $("pauseBanner");
		if (!banner) return;
		const inner = banner.querySelector("div");
		if (!inner) return;
		if (kind === "replay") inner.innerHTML = "Instant replay<br /><span style=\"font-size:1rem;font-weight:500\">A pause/play · X/B zoom · LB/RB slow · LT/RT fast · LS pan the X · Y+LS orbit · View/R exit</span>";
		else if (kind === "pauseFree") inner.innerHTML = "Game paused.<br /><span style=\"font-size:1rem;font-weight:500\">A resume · B restart<br />Y adjust camera · X or View instant replay</span>";
		else inner.innerHTML = "Game paused.<br /><span style=\"font-size:1rem;font-weight:500\">Press A to resume. Press B to restart.<br />Press X or View for Instant Replay</span>";
	}
	function syncPauseChrome() {
		const banner = $("pauseBanner");
		if (banner) banner.classList.toggle("hidden", !paused || !!fullReplay || camAdjust);
		if (paused && !fullReplay && !camAdjust) pauseBannerHTML(cameraMode === "free" ? "pauseFree" : "pause");
	}
	let pauseCamPose = null;
	function captureFreeCam() {
		pauseCamPose = {
			lookX,
			lookY,
			cameraY,
			camFocusX,
			camFocusY,
			theta: camOp.theta || 0,
			phi: camOp.phi != null ? camOp.phi : 0.82,
			zoom: camOp.zoom || 1,
			panX: camOp.panX || 0,
			panY: camOp.panY || 0,
			freeOrbit: { theta: freeOrbit.theta || 0, phi: freeOrbit.phi != null ? freeOrbit.phi : 0.82, zoom: freeOrbit.zoom || 1 }
		};
		return pauseCamPose;
	}
	function applyFreeCamPose(pose) {
		const p = pose || pauseCamPose;
		if (!p) return;
		lookX = p.lookX;
		lookY = p.lookY;
		cameraY = p.cameraY;
		camFocusX = p.camFocusX;
		camFocusY = p.camFocusY;
		camOp.theta = p.theta;
		camOp.phi = p.phi;
		camOp.zoom = p.zoom;
		camOp.panX = p.panX;
		camOp.panY = p.panY;
		if (p.freeOrbit) freeOrbit = { theta: p.freeOrbit.theta, phi: p.freeOrbit.phi, zoom: p.freeOrbit.zoom };
	}
	function setPaused(on) {
		if (on && !paused) captureFreeCam();
		paused = on;
		if (!paused) camAdjust = false;
		const pb = $("pauseBtn");
		if (pb) pb.textContent = paused ? "Resume" : "Pause";
		syncPauseChrome();
		if (paused) focusCanvas();
	}
	function updateBallOn() {
		const el = $("ballOn");
		if (el) el.textContent = yardLabel(ballYard);
	}
	function camSpec() {
		const base = CAMERAS[cameraMode] || CAMERAS.iso;
		if (cameraMode === "top" || cameraMode === "topZoom" || camCorner !== "sw") return base;
		return {
			...base,
			skew: -base.skew,
			xLean: -base.xLean
		};
	}
	function resetCamOp() {
		resetThetaStick();
		camOp.panX = 0;
		camOp.panY = 0;
		camOp.yaw = 0;
		if (cameraMode === "free") {
			camOp.zoom = freeOrbit.zoom || 1;
			camOp.theta = freeOrbit.theta || 0;
			camOp.phi = freeOrbit.phi != null ? freeOrbit.phi : 0.82;
			return;
		}
		camOp.zoom = 1;
		camOp.theta = 0;
		camOp.phi = camPhiFromMode();
	}
	function camPhiFromMode() {
		if (cameraMode === "free") return freeOrbit.phi != null ? freeOrbit.phi : 0.82;
		if (cameraMode === "top" || cameraMode === "topZoom") return Math.PI / 2;
		if (cameraMode === "high") return 0.72;
		if (cameraMode === "wide") return 0.52;
		if (cameraMode === "iso") return 0.84;
		if (cameraMode === "zoom") return 0.96;
		return Math.PI / 2;
	}
	function orbitCamOn() {
		return !!fullReplay || cameraMode === "free";
	}
	function camWorldFromStick(sx, sy) {
		const th = orbitCamOn() ? (camOp.theta || 0) : 0;
		if (Math.abs(th) < 0.001) return { x: sx, y: sy };
		const ct = Math.cos(th), st = Math.sin(th);
		return { x: sx * ct + sy * st, y: -sx * st + sy * ct };
	}
	function clampCursor(x, y) {
		return {
			x: clamp(x, fieldLeft(), fieldRight()),
			y: clamp(y, Field.southBack, Field.northBack)
		};
	}
	function applyLook(x, y) {
		const c = clampCursor(x, y);
		lookX = c.x;
		lookY = c.y;
		camFocusX = lookX;
		camFocusY = lookY;
		if (orbitCamOn()) cameraY = lookY;
	}
	function hexRgb(hex) {
		let h = String(hex || "#888888").replace("#", "");
		if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
		if (h.length < 6) h = "888888";
		const n = parseInt(h.slice(0, 6), 16);
		if (Number.isNaN(n)) return { r: 136, g: 136, b: 136 };
		return { r: n >> 16 & 255, g: n >> 8 & 255, b: n & 255 };
	}
	function mixHex(a, b, t) {
		const A = hexRgb(a), B = hexRgb(b);
		const m = clamp(t, 0, 1);
		const r = Math.round(A.r + (B.r - A.r) * m);
		const g = Math.round(A.g + (B.g - A.g) * m);
		const bl = Math.round(A.b + (B.b - A.b) * m);
		return "rgb(" + r + "," + g + "," + bl + ")";
	}
	function colorDist(a, b) {
		const A = hexRgb(a), B = hexRgb(b);
		return Math.abs(A.r - B.r) + Math.abs(A.g - B.g) + Math.abs(A.b - B.b);
	}
	function contrastOn(base, cands) {
		let best = "#ffffff", d = -1;
		(cands || []).forEach((c) => {
			if (!c) return;
			const dd = colorDist(base || "#888", c);
			if (dd > d) { d = dd; best = c; }
		});
		if (d < 90) return "#f4f6f8";
		return best;
	}
	function lerpNum(a, b, t) {
		return a + (b - a) * t;
	}
	function lerpPose(a, b, t) {
		if (!a) return b ? { ...b } : null;
		if (!b) return { ...a };
		return {
			...b,
			x: lerpNum(a.x, b.x, t),
			y: lerpNum(a.y, b.y, t),
			vx: lerpNum(a.vx || 0, b.vx || 0, t),
			vy: lerpNum(a.vy || 0, b.vy || 0, t),
			gaitSpd: lerpNum(a.gaitSpd || 0, b.gaitSpd || 0, t),
			facing: (a.facing || 0) + wrapAng((b.facing || 0) - (a.facing || 0)) * t,
			hop: lerpNum(a.hop || 0, b.hop || 0, t),
			spinT: lerpNum(a.spinT || 0, b.spinT || 0, t),
			atkT: lerpNum(a.atkT || 0, b.atkT || 0, t),
			downAmt: lerpNum(a.downAmt || 0, b.downAmt || 0, t),
			takenDown: !!(a.takenDown || b.takenDown),
			whiffT: lerpNum(a.whiffT || 0, b.whiffT || 0, t),
			hitCheerT: lerpNum(a.hitCheerT || 0, b.hitCheerT || 0, t),
			hitCheerDur: lerpNum(a.hitCheerDur || 0, b.hitCheerDur || 0, t),
			hitCheerKind: t < 0.5 ? a.hitCheerKind : b.hitCheerKind,
			scuffleT: lerpNum(a.scuffleT || 0, b.scuffleT || 0, t),
			scuffleDur: lerpNum(a.scuffleDur || 0, b.scuffleDur || 0, t),
			scuffleRole: t < 0.5 ? a.scuffleRole : b.scuffleRole,
			scuffleDX: lerpNum(a.scuffleDX || 0, b.scuffleDX || 0, t),
			scuffleDY: lerpNum(a.scuffleDY || 0, b.scuffleDY || 0, t),
			turfStainT: lerpNum(a.turfStainT || 0, b.turfStainT || 0, t),
			turfX: b.turfX != null ? b.turfX : a.turfX,
			turfY: b.turfY != null ? b.turfY : a.turfY
		};
	}
	function lerpFrame(a, b, t) {
		if (!a) return b;
		if (!b || t < 0.02) return a;
		if (t > 0.98) return b;
		return {
			...b,
			cameraY: lerpNum(a.cameraY, b.cameraY, t),
			camZoom: lerpNum(a.camZoom || 1, b.camZoom || 1, t),
			rb: lerpPose(a.rb, b.rb, t),
			qb: lerpPose(a.qb, b.qb, t),
			blockers: (b.blockers || []).map((p, i) => lerpPose((a.blockers || [])[i], p, t)),
			defenders: (b.defenders || []).map((p, i) => lerpPose((a.defenders || [])[i], p, t)),
			scoreSeq: b.scoreSeq && a.scoreSeq ? { ...b.scoreSeq, player: lerpPose(a.scoreSeq.player, b.scoreSeq.player, t), t: lerpNum(a.scoreSeq.t || 0, b.scoreSeq.t || 0, t) } : b.scoreSeq,
			fumbleSeq: b.fumbleSeq,
			trail: t < 0.5 ? a.trail : b.trail,
			activeMove: t < 0.5 ? a.activeMove : b.activeMove,
			moveTimer: lerpNum(a.moveTimer || 0, b.moveTimer || 0, t),
			moveDur: t < 0.5 ? a.moveDur : b.moveDur
		};
	}
	function replayFrame() {
		if (!fullReplay || !fullReplay.frames || !fullReplay.frames.length) return null;
		const frames = fullReplay.frames;
		const i = clamp(fullReplay.i || 0, 0, frames.length - 1);
		const i0 = Math.floor(i);
		const i1 = Math.min(i0 + 1, frames.length - 1);
		return lerpFrame(frames[i0], frames[i1], i - i0);
	}
	function nearestContactAhead(carrier) {
		if (!carrier) return null;
		let best = null;
		let nd = 7.2;
		for (const d of defenders) {
			if (!d || !d.active) continue;
			const dy = d.y - carrier.y;
			if (dy < -0.35 || dy > 6.8) continue;
			const dd = dist(d, carrier);
			if (dd < nd) {
				nd = dd;
				best = d;
			}
		}
		return best;
	}
	function toScreenYRaw(absY) {
		return (cameraY - absY) * SCALE_Y + canvas.height * .55;
	}
	function yardToPx() {
		// Size sprites by a length-yard, not the variable field width.
		return SCALE_Y;
	}
	function postGapHalf() {
		// Scale hashes + upright gap with field width. The old 3.85 yd cap
		// left them bunched in the middle of 75–100 yd surfaces.
		return Field.postGapHalf();
	}
	function fieldWideT() {
		return Field.fieldWideT();
	}
	function coverFrac(frac) {
		const pull = fieldWideT() * 0.44;
		return 0.5 + (frac - 0.5) * (1 - pull);
	}
	let thetaLatch = null;
	let thetaBreakAcc = 0;
	function resetThetaStick() {
		thetaLatch = null;
		thetaBreakAcc = 0;
	}
	function wrapTau(a) {
		while (a > Math.PI) a -= Math.PI * 2;
		while (a < -Math.PI) a += Math.PI * 2;
		return a;
	}
	function applyThetaStick(delta) {
		const STICK_IN = 0.055;
		const STICK_HOLD = 0.2;
		let th = camOp.theta || 0;
		if (thetaLatch != null) {
			thetaBreakAcc += delta;
			if (Math.abs(thetaBreakAcc) > STICK_HOLD) {
				th = wrapTau(thetaLatch + thetaBreakAcc);
				thetaLatch = null;
				thetaBreakAcc = 0;
				camOp.theta = th;
				return th;
			}
			camOp.theta = thetaLatch;
			return thetaLatch;
		}
		th = wrapTau(th + delta);
		if (Math.abs(th) < STICK_IN) {
			thetaLatch = 0;
			thetaBreakAcc = 0;
			camOp.theta = 0;
			return 0;
		}
		if (Math.abs(Math.abs(th) - Math.PI) < STICK_IN) {
			thetaLatch = th >= 0 ? Math.PI : -Math.PI;
			thetaBreakAcc = 0;
			camOp.theta = thetaLatch;
			return thetaLatch;
		}
		camOp.theta = th;
		return th;
	}
	const NEAR_Z = 0.72;
	function getCamWorld() {
		if (!orbitCamOn()) return null;
		const theta = camOp.theta || 0;
		const phi = camOp.phi != null ? camOp.phi : Math.PI / 2;
		const fx = camFocusX != null ? camFocusX : FIELD_WIDTH / 2;
		const fy = camFocusY != null ? camFocusY : cameraY;
		const elev = clamp(phi, 0.05, Math.PI / 2);
		const R = 40;
		const camH = Math.max(3.6, R * Math.sin(elev));
		const groundR = Math.sqrt(Math.max(0.04, R * R - camH * camH));
		const camX = fx - groundR * Math.sin(theta);
		const camY = fy - groundR * Math.cos(theta);
		const lx = fx - camX, ly = fy - camY, lh = -camH;
		const llen = Math.hypot(lx, ly, lh) || 1;
		const fwx = lx / llen, fwy = ly / llen, fwh = lh / llen;
		let rtx = fwy, rty = -fwx;
		const rlen = Math.hypot(rtx, rty) || 1;
		rtx /= rlen;
		rty /= rlen;
		const upx = rty * fwh;
		const upy = -rtx * fwh;
		const uph = rtx * fwy - rty * fwx;
		const ulen = Math.hypot(upx, upy, uph) || 1;
		return {
			theta,
			phi: elev,
			fx,
			fy,
			R,
			camX,
			camY,
			camH,
			fwx,
			fwy,
			fwh,
			rtx,
			rty,
			upx: upx / ulen,
			upy: upy / ulen,
			uph: uph / ulen,
			dist: llen
		};
	}
	function lookingTowardY(worldY, slack) {
		const cw = getCamWorld();
		if (!cw) return true;
		const pad = slack == null ? 2 : slack;
		const toY = worldY - cw.camY;
		if (Math.abs(cw.fwy) < 0.08) return Math.abs(toY) > 3.5;
		return toY * cw.fwy > -pad;
	}
	function panLookFromStick(sx, sy, dt) {
		const speedPx = 520 * dt;
		const wantSx = sx * speedPx;
		const wantSy = -sy * speedPx;
		const o = project(lookX, lookY);
		const px = project(lookX + 1, lookY);
		const py = project(lookX, lookY + 1);
		const a = px.sx - o.sx, b = px.sy - o.sy, c = py.sx - o.sx, d = py.sy - o.sy;
		const det = a * d - c * b;
		if (!isFinite(det) || Math.abs(det) < 1e-3 || o.behind || px.behind || py.behind) {
			const w = camWorldFromStick(sx, sy);
			applyLook(lookX + w.x * dt * 28, lookY + w.y * dt * 28);
			return;
		}
		const dx = (d * wantSx - c * wantSy) / det;
		const dy = (-b * wantSx + a * wantSy) / det;
		applyLook(lookX + dx, lookY + dy);
	}
	function heightToPx(h) {
		if (!h) return 0;
		let k = 0.4;
		if (orbitCamOn()) {
			const phi = camOp.phi != null ? camOp.phi : Math.PI / 2;
			const elev = Math.sin(clamp(phi, 0, Math.PI / 2));
			k = 0.22 + 0.78 * Math.pow(1 - elev, 1.08);
		} else if (cameraMode === "top" || cameraMode === "topZoom") {
			k = 0.22;
		} else {
			k = 0.46;
		}
		return h * SCALE_Y * k;
	}
	function project(absX, absY, h) {
		if (viewHook) return viewHook(absX, absY, h);
		const liftH = h || 0;
		const cam = camSpec();
		const theta = orbitCamOn() ? (camOp.theta || 0) : 0;
		const phi = orbitCamOn() && camOp.phi != null ? camOp.phi : Math.PI / 2;
		const useOrb = orbitCamOn() && (Math.abs(theta) > 0.002 || phi < Math.PI / 2 - 0.03);
		if (useOrb) {
			const cw = getCamWorld();
			if (!cw) {
				return { sx: absX * SCALE_X, sy: toScreenYRaw(absY) - heightToPx(liftH), sc: cam.sc || 1, depth: 40, behind: false };
			}
			const relX = absX - cw.camX;
			const relY = absY - cw.camY;
			const relH = liftH - cw.camH;
			const cx = relX * cw.rtx + relY * cw.rty;
			const cy = relX * cw.upx + relY * cw.upy + relH * cw.uph;
			const cz = relX * cw.fwx + relY * cw.fwy + relH * cw.fwh;
			const behind = cz < NEAR_Z;
			const z = behind ? NEAR_Z : cz;
			const pxYard = SCALE_Y * 1.26;
			const focal = pxYard * cw.dist;
			const sc = (focal / z) / Math.max(1e-3, SCALE_Y);
			const lookYScreen = 0.50 + 0.22 * (1 - Math.sin(cw.phi));
			return {
				sx: canvas.width * 0.5 + focal * cx / z,
				sy: canvas.height * lookYScreen - focal * cy / z,
				sc: sc * (cam.sc || 1),
				depth: cz,
				behind,
				cx,
				cy,
				cz
			};
		}
		const lift = heightToPx(liftH);
		if (cameraMode === "top" || cameraMode === "topZoom") return {
			sx: absX * SCALE_X,
			sy: toScreenYRaw(absY) - lift,
			sc: cam.sc,
			depth: 80 - absY,
			behind: false
		};
		const depth = cameraY - absY;
		const lean = (cam.xLean || 0) * (1 - camEdgeLock().sideT * 0.85);
		return {
			sx: absX * SCALE_X + depth * cam.skew * SCALE_X,
			sy: toScreenYRaw(absY) * cam.yScale + canvas.height * cam.yBias + (absX - FIELD_WIDTH / 2) * lean - lift,
			sc: cam.sc,
			depth: depth,
			behind: false
		};
	}
	function lerpCamPt(a, b, t) {
		return {
			cx: a.cx + (b.cx - a.cx) * t,
			cy: a.cy + (b.cy - a.cy) * t,
			cz: a.cz + (b.cz - a.cz) * t
		};
	}
	function camPtToScreen(p) {
		const cw = getCamWorld();
		if (!cw || p.cz == null) return p;
		const z = Math.max(NEAR_Z, p.cz);
		const pxYard = SCALE_Y * 1.26;
		const focal = pxYard * cw.dist;
		const lookYScreen = 0.50 + 0.22 * (1 - Math.sin(cw.phi));
		const cam = camSpec();
		return {
			sx: canvas.width * 0.5 + focal * p.cx / z,
			sy: canvas.height * lookYScreen - focal * p.cy / z,
			sc: ((focal / z) / Math.max(1e-3, SCALE_Y)) * (cam.sc || 1),
			depth: p.cz,
			behind: p.cz < NEAR_Z,
			cx: p.cx,
			cy: p.cy,
			cz: p.cz
		};
	}
	function clipPolyNear(pts) {
		if (!pts || pts.length < 3) return [];
		if (!pts.every((p) => p && p.cz != null)) return pts.filter((p) => p && !p.behind);
		let cur = pts;
		const out = [];
		for (let i = 0; i < cur.length; i++) {
			const a = cur[i], b = cur[(i + 1) % cur.length];
			const aIn = a.cz >= NEAR_Z, bIn = b.cz >= NEAR_Z;
			if (aIn && bIn) out.push(b);
			else if (aIn && !bIn) {
				const t = (NEAR_Z - a.cz) / (b.cz - a.cz || 1e-6);
				const cut = lerpCamPt(a, b, t);
				cut.cz = NEAR_Z;
				out.push(camPtToScreen(cut));
			} else if (!aIn && bIn) {
				const t = (NEAR_Z - a.cz) / (b.cz - a.cz || 1e-6);
				const cut = lerpCamPt(a, b, t);
				cut.cz = NEAR_Z;
				out.push(camPtToScreen(cut));
				out.push(b);
			}
		}
		return out;
	}
	function clipSegNear(a, b) {
		if (!a || !b) return null;
		if (a.cz == null || b.cz == null) {
			if (a.behind || b.behind) return null;
			return [a, b];
		}
		if (a.cz < NEAR_Z && b.cz < NEAR_Z) return null;
		if (a.cz >= NEAR_Z && b.cz >= NEAR_Z) return [a, b];
		const t = (NEAR_Z - a.cz) / (b.cz - a.cz || 1e-6);
		const cut = lerpCamPt(a, b, t);
		cut.cz = NEAR_Z;
		const s = camPtToScreen(cut);
		return a.cz < NEAR_Z ? [s, b] : [a, s];
	}
	function ctxXfPt(p) {
		if (!p) return { sx: 0, sy: 0 };
		const m = ctx.getTransform();
		return {
			sx: m.a * p.sx + m.c * p.sy + m.e,
			sy: m.b * p.sx + m.d * p.sy + m.f
		};
	}
	function screenBoxOf(pts, pad) {
		pad = pad == null ? 280 : pad;
		let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, hit = false;
		for (let i = 0; i < (pts || []).length; i++) {
			const p = pts[i];
			if (!p) continue;
			const s = ctxXfPt(p);
			if (s.sx < minX) minX = s.sx;
			if (s.sx > maxX) maxX = s.sx;
			if (s.sy < minY) minY = s.sy;
			if (s.sy > maxY) maxY = s.sy;
			if (!p.behind && s.sx > -pad && s.sx < canvas.width + pad && s.sy > -pad && s.sy < canvas.height + pad) hit = true;
		}
		return { minX, maxX, minY, maxY, hit, spanX: maxX - minX, spanY: maxY - minY };
	}
	function lerp3(a, b, t) {
		return {
			x: a.x + (b.x - a.x) * t,
			y: a.y + (b.y - a.y) * t,
			h: (a.h || 0) + ((b.h || 0) - (a.h || 0)) * t
		};
	}
	function drawImageWorld3(img, corners, nu, nv) {
		if (!img || !corners || corners.length < 4) return;
		const iw = img.naturalWidth || img.width || 0;
		const ih = img.naturalHeight || img.height || 0;
		if (iw < 2 || ih < 2) return;
		nu = Math.max(2, nu || 10);
		nv = Math.max(2, nv || 8);
		function at(u, v) {
			const top = lerp3(corners[0], corners[1], u);
			const bot = lerp3(corners[3], corners[2], u);
			return lerp3(top, bot, v);
		}
		const ovU = 0.5 / nu, ovV = 0.5 / nv;
		for (let i = 0; i < nu; i++) {
			for (let j = 0; j < nv; j++) {
				const u0 = Math.max(0, i / nu - (i ? ovU : 0));
				const u1 = Math.min(1, (i + 1) / nu + ovU);
				const v0 = Math.max(0, j / nv - (j ? ovV : 0));
				const v1 = Math.min(1, (j + 1) / nv + ovV);
				const w00 = at(u0, v0), w10 = at(u1, v0), w01 = at(u0, v1);
				const p00 = project(w00.x, w00.y, w00.h);
				const p10 = project(w10.x, w10.y, w10.h);
				const p01 = project(w01.x, w01.y, w01.h);
				if (p00.behind || p10.behind || p01.behind) continue;
				if (p00.cz != null && (p00.cz < 1.55 || p10.cz < 1.55 || p01.cz < 1.55)) continue;
				const sx = u0 * iw, sy = v0 * ih;
				const sw = Math.max(0.5, (u1 - u0) * iw), sh = Math.max(0.5, (v1 - v0) * ih);
				const a = (p10.sx - p00.sx) / sw;
				const b = (p10.sy - p00.sy) / sw;
				const c = (p01.sx - p00.sx) / sh;
				const d = (p01.sy - p00.sy) / sh;
				if (!isFinite(a + b + c + d) || Math.abs(a * d - c * b) < 1e-8) continue;
				ctx.save();
				ctx.transform(a, b, c, d, p00.sx, p00.sy);
				ctx.imageSmoothingEnabled = true;
				ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
				ctx.restore();
			}
		}
	}
	function withFieldPlane(wx, wy, fn) {
		const o = project(wx, wy);
		const px = project(wx + 1, wy);
		const py = project(wx, wy + 1);
		if (o.behind || px.behind || py.behind) return;
		let a = px.sx - o.sx, b = px.sy - o.sy, c = py.sx - o.sx, d = py.sy - o.sy;
		if (Math.abs(a * d - c * b) < 1e-4) return;
		// Keep a proper (non-mirroring) basis so paint reads upright, left-to-right.
		if (a * d - c * b < 0) {
			c = -c;
			d = -d;
		}
		ctx.save();
		ctx.transform(a, b, c, d, o.sx, o.sy);
		fn();
		ctx.restore();
	}
	function toScreenY(absY, absX) {
		return project(absX == null ? FIELD_WIDTH / 2 : absX, absY).sy;
	}
	function updateCamera() {
		if (paused && !camAdjust && !fullReplay && pauseCamPose) {
			applyFreeCamPose();
			return;
		}
		if (fullReplay) {
			applyLook(lookX, lookY);
			camZoom += (1 - camZoom) * 0.2;
			return;
		}
		if (cameraMode === "free") {
			if (!camAdjust && !freeLook) {
				let carrier = scoreSeq ? scoreSeq.player : (fumbleSeq && fumbleSeq.phase === "return" && fumbleSeq.defender) || rb;
				if (playingDefense() && userDefender && !scoreSeq && !(fumbleSeq && fumbleSeq.phase === "return")) {
					if (practiceAwaitSnap) carrier = userDefender;
					else if (rb) carrier = { x: rb.x * 0.58 + userDefender.x * 0.42, y: rb.y * 0.52 + userDefender.y * 0.48 };
				}
				if (carrier) {
					const framed = keepTargetFramed(carrier.x, carrier.y);
					applyLook(framed.x, framed.y);
				} else applyLook(lookX, lookY);
			} else {
				applyLook(lookX, lookY);
			}
			camZoom += (1 - camZoom) * 0.2;
			return;
		}
		let fy = rb ? rb.y : null;
		let fx = rb ? rb.x : FIELD_WIDTH / 2;
		if (playingDefense() && userDefender && !scoreSeq && !fumbleSeq) {
			if (practiceAwaitSnap) {
				fx = userDefender.x;
				fy = userDefender.y;
			} else if (rb) {
				fx = rb.x * 0.58 + userDefender.x * 0.42;
				fy = rb.y * 0.52 + userDefender.y * 0.48;
			}
		}
		if (fumbleSeq) {
			fy = fumbleSeq.ballY;
			fx = fumbleSeq.ballX;
		}
		if (scoreSeq) {
			fy = scoreSeq.player.y;
			fx = scoreSeq.player.x;
		}
		if (ankleCam && ankleCam.t > 0 && ankleCam.runner && ankleCam.defender) {
			fx = ankleCam.runner.x * .72 + ankleCam.defender.x * .28;
			fy = ankleCam.runner.y * .72 + ankleCam.defender.y * .28;
		}
		if (fy == null) return;
		const carrier = scoreSeq ? scoreSeq.player : (fumbleSeq && fumbleSeq.phase === "return" && fumbleSeq.defender) || rb;
		if (!fullReplay && carrier) {
			const hit = nearestContactAhead(carrier);
			if (hit) {
				fx = carrier.x * .64 + hit.x * .36;
				fy = carrier.y * .58 + hit.y * .42;
			}
		}
		const framed = keepTargetFramed(fx, fy);
		fx = framed.x;
		fy = framed.y;
		camFocusX = fx;
		camFocusY = fy;
		const cam = camSpec();
		const targetY = fy + (cam.follow || 6);
		const snapCam = fumbleSeq && fumbleSeq.phase === "return" ? .72 : (scoreSeq ? .35 : .18);
		// Allow camera into the endzone during celebrations / near goal line
		const yMax = scoreSeq || (rb && rb.y > 92) ? 102 : 88;
		cameraY += (clamp(targetY, 8, yMax) - cameraY) * snapCam;
		// Milder TD zoom; almost none on overhead so zones stay readable
		let zBoost = 1;
		if (ankleCam && ankleCam.t > 0) zBoost = 1.32;
		else if (breakaway) zBoost = 1.28;
		else if (scoreSeq || tdZoom) zBoost = (cameraMode === "top" || cameraMode === "topZoom") ? 1.06 : 1.18;
		const want = (cam.zoom || 1) * zBoost;
		camZoom += (want - camZoom) * .1;
		if (ankleCam) {
			ankleCam.t -= 1 / 60;
			if (ankleCam.t <= 0) ankleCam = null;
		}
	}
	function offMult(p) {
		if (playingDefense()) return cpuStrength;
		if (!p || p === rb || p.hasBall) return youStrength;
		return mateStrength;
	}
	function defMult(p) {
		if (!playingDefense()) return cpuStrength;
		if (p && isUserDef(p)) return youStrength;
		return mateStrength;
	}
	function keepTargetFramed(fx, fy) {
		const marginX = 3.2;
		const marginY = 4.0;
		return {
			x: clamp(fx, Field.left() + marginX, Field.right() - marginX),
			y: clamp(fy, Field.southBack + marginY, Field.northBack - marginY)
		};
	}
	function camEdgeLock() {
		const x = camFocusX != null ? camFocusX : Field.midX();
		const y = camFocusY != null ? camFocusY : cameraY;
		const side = Math.min(x - Field.left(), Field.right() - x);
		const end = Math.min(y - Field.southBack, Field.northBack - y);
		return {
			sideT: clamp(1 - side / 8, 0, 1),
			endT: clamp(1 - end / 8, 0, 1)
		};
	}
	function uniGlove(uni) {
		const j = String((uni && uni.jersey) || "#888888").toLowerCase();
		function hexLum(c) {
			const h = String(c || "").replace("#", "");
			if (h.length < 6) return 0;
			const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
			return (r * 299 + g * 587 + b * 114) / 1000;
		}
		function isSkinLike(c) {
			const h = String(c || "").replace("#", "");
			if (h.length < 6) return false;
			const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
			return r > 150 && g > 100 && b < 180 && r >= g && (r - b) > 35 && (g - b) > 12 && (r - g) < 70;
		}
		const opts = [uni && uni.endSecondary, uni && uni.logoMark, uni && uni.pants, uni && uni.helmet, uni && uni.endPrimary];
		for (let i = 0; i < opts.length; i++) {
			const c = opts[i];
			if (!c) continue;
			const s = String(c).toLowerCase();
			if (s === j) continue;
			if (isSkinLike(s)) continue;
			if (Math.abs(hexLum(s) - hexLum(j)) < 18) continue;
			return c;
		}
		return mixHex((uni && uni.jersey) || "#444444", "#0a0a0a", 0.42);
	}
	function getUni(side) {
		const id = side === "off" ? offUni : defUni;
		return UNIFORMS.find((u) => u.id === id) || UNIFORMS[0];
	}
	function paintRoster() {
		function paint(p, side) {
			if (!p) return;
			const uni = getUni(side);
			p.color = uni.jersey;
			p.helmet = uni.helmet;
		p.facemask = uni.facemask || uni.number || "#c5c8cc";
			p.pants = uni.pants;
			p.numColor = uni.number;
			p.numOutline = uni.numOutline || "#ffffff";
			p.glove = uniGlove(uni);
			p.socks = uni.socks || uni.jersey;
			p.shoes = uni.shoes || "#111111";
			p.stripeCol = contrastOn(uni.jersey, [uni.helmet, uni.endPrimary, uni.pants, uni.number, uni.endSecondary]);
			p.pantStripeCol = contrastOn(uni.pants, [uni.jersey, uni.endSecondary, uni.number, uni.helmet]);
			p.helmStripeCol = uni.helmStripeCol || uni.endSecondary || uni.facemask || "#ffffff";
			p.helmStripes = uni.helmStripes == null ? 1 : uni.helmStripes;
			p.pantStripes = uni.pantStripes || 1;
			p.sleeveStripes = 1;
		}
		paint(rb, "off");
		paint(qb, "off");
		blockers.forEach((b) => paint(b, "off"));
		defenders.forEach((d) => paint(d, "def"));
	}
	function hashHalf() {
		return Field.hashHalf();
	}
	function hashLeft() {
		return Field.hashLeft();
	}
	function hashRight() {
		return Field.hashRight();
	}
	function capCoverageY(y) {
		return Math.min(Field.bodyCapY, y);
	}
	function clampToHash(x) {
		return Field.clampToHash(x);
	}
	function setSpotFromPlay(x, oob) {
		if (oob) ballX = x < (fieldLeft() + fieldRight()) / 2 ? hashLeft() : hashRight();
		else ballX = clampToHash(x);
	}
	function snapX() {
		return clampToHash(ballX);
	}
	function assignSideNumbers(side) {
		const used = new Set();
		const counts = side === "def"
			? { DT: numDT, LB: numLBs, DB: numDBs }
			: { QB: Math.max(1, numQB), HB: 1, FB: numFB, TE: numTE, OL: numOL };
		if (!assignedNums[side]) assignedNums[side] = emptyNumMap();
		Object.keys(emptyNumMap()).forEach((g) => { assignedNums[side][g] = []; });
		Object.keys(counts).forEach((group) => {
			const count = Math.max(0, counts[group] || 0);
			const pool = shuffle((NUM_POOLS[group] || []).filter((n) => !used.has(n)));
			const nums = pool.slice(0, count);
			nums.forEach((n) => used.add(n));
			assignedNums[side][group] = nums;
		});
	}
	function refreshAllNumbers() {
		assignSideNumbers("off");
		assignSideNumbers("def");
	}
	function adjustNumbersForGroup(group, count) {
		const side = (group === "DT" || group === "LB" || group === "DB") ? "def" : "off";
		assignSideNumbers(side);
	}
	function createPlayer(x, y, group, numIdx, side) {
		const uni = getUni(side);
		const nums = ((assignedNums[side] || assignedNums.off)[group]) || [];
		return {
			x,
			y,
			vx: 0,
			vy: 0,
			radius: group === "OL" || group === "DT" ? .95 : group === "FB" || group === "TE" ? .9 : .85,
			mass: group === "DT" || group === "OL" ? 1.35 : group === "LB" || group === "FB" || group === "TE" ? 1.05 : 0.78,
			speed: group === "OL" ? 8.15 : group === "FB" ? 8.35 : group === "TE" ? 8.55 : group === "DT" ? 7.45 : group === "QB" ? 7.2 : 9,
			baseSpeed: 0,
			gaitSpd: 0,
			_gx: x,
			_gy: y,
			color: uni.jersey,
			helmet: uni.helmet,
			facemask: uni.facemask || uni.number || "#c5c8cc",
			pants: uni.pants,
			numColor: uni.number,
			numOutline: uni.numOutline || "#ffffff",
			glove: uniGlove(uni),
			number: nums[numIdx] !== void 0 ? nums[numIdx] : 0,
			group,
			side,
			active: true,
			facing: side === "off" ? Math.PI / 2 : -Math.PI / 2,
			hasBall: false,
			slowed: 0,
			routePhase: 0,
			sprintOn: false,
			sprintT: Math.random() * 2.4,
			state: "pursue",
			whiffT: 0,
			recoverT: 0,
			engageT: 0,
			_pushYards: 0,
			blitzDelay: 0,
			driveBlock: false,
			sturdyBlock: false,
			_jitter: (Math.random() - .5) * .8,
			low: false,
			hop: 0,
			spinT: 0,
			job: "pursue",
			jobX: x,
			jobY: y,
			readT: 0,
			misfireT: 0,
			misfireIdx: -1,
			manIdx: -1,
			aggressor: false,
			reactT: 0,
			isCorner: false,
			isSafety: false,
			fakeBlitz: false,
			lagT: 0,
			pancaked: false,
			takenDown: false,
			downAmt: 0,
			fallSide: 1,
			fallLayout: 0.05,
			fallPitch: 0.2,
			fallRoll: 1.18,
			helmBars: (group === "OL" || group === "DT" || group === "FB" || group === "LB") ? 4 : (group === "QB" || group === "TE") ? 3 : 2,
			helmGrill: group === "OL" || group === "DT" || group === "FB" || group === "LB",
			helmVisor: group === "DB" || group === "HB" || (group === "QB" && (nums[numIdx] || 0) % 3 === 0) || ((nums[numIdx] || 0) % 5 === 1),
			helmStripes: uni.helmStripes == null ? 1 : uni.helmStripes,
			pantStripes: uni.pantStripes || 1,
			sleeveStripes: 1,
			socks: uni.socks || uni.jersey,
			shoes: uni.shoes || "#111111",
			stripeCol: contrastOn(uni.jersey, [uni.helmet, uni.endPrimary, uni.pants, uni.number, uni.endSecondary]),
			pantStripeCol: contrastOn(uni.pants, [uni.jersey, uni.endSecondary, uni.number, uni.helmet]),
			helmStripeCol: uni.helmStripeCol || uni.endSecondary || uni.facemask || "#ffffff",
			turfX: null,
			turfY: null,
			turfStainT: 0,
			turfStainMax: 0,
			turfSeed: null,
			dtPenetrate: false,
			atkKind: null,
			atkT: 0,
			atkDX: 0,
			atkDY: 0,
			atkDecideT: 0,
			laneOffset: 0,
			stutter: false,
			stutterX: x,
			stutterY: y,
			artCurve: false,
			zoneRx: 3.5,
			zoneRy: 2.2,
			_userCtrl: 0,
			blockTarget: null,
			blockMode: "man",
			pullPhase: 0,
			pullVia: null,
			driveSide: 1,
			sealSide: 1,
			levelY: 3,
			station: null,
			stationX: x,
			stationY: y
		};
	}
	function mirrorPlay(play) {
		if (!play) return play;
		const flipId = (id) => {
			if (id.endsWith("L")) return id.slice(0, -1) + "R";
			if (id.endsWith("R")) return id.slice(0, -1) + "L";
			return id;
		};
		const flipName = (n) => n.replace(/Left/g, "§R§").replace(/Right/g, "Left").replace(/§R§/g, "Right");
		return {
			...play,
			id: flipId(play.id),
			name: flipName(play.name),
			arrow: (play.arrow || []).map((a) => -a),
			blockStyle: ({ wallL: "wallR", wallR: "wallL", pullL: "pullR", pullR: "pullL", zoneL: "zoneR", zoneR: "zoneL", swingL: "swingR", swingR: "swingL", river: "river", wedgeL: "wedgeR", wedgeR: "wedgeL", zigzag: "zigzag" })[play.blockStyle] || play.blockStyle,
			steps: (play.steps || []).map((s) => ({ ...s, dx: -s.dx })),
			altSteps: (play.altSteps || []).map((s) => ({ ...s, dx: -s.dx })),
			baseId: play.baseId || play.id
		};
	}
	function applyKeeperRoutes(play) {
		if (!play) return play;
		play.baseId = play.baseId || play.id;
		play.altSteps = null;
		const key = playBookKey(play);
		const schemeId = (currentScheme && currentScheme.id) || practiceDefSchemeId || "";
		const facing = cellFacing(play, practiceFlipped, practiceDefFlipped);
		const cell = ROUTE_BOOK[key] && ROUTE_BOOK[key][schemeId] && ROUTE_BOOK[key][schemeId][facing];
		if (!cell || !cell.primary) return play;
		const prim = ROUTE_TEMPLATES[cell.primary];
		if (!prim) return play;
		play.steps = cloneSteps(prim);
		play.arrow = stepsToArrow(prim);
		if (cell.secondary && ROUTE_TEMPLATES[cell.secondary]) {
			play.altSteps = cloneSteps(ROUTE_TEMPLATES[cell.secondary]);
		}
		return play;
	}
	function choosePlay() {
		let pool = OFF_PLAYS;
		const lockId = gameMode === "practice" ? practiceOffPlayId : huddleOffPickId;
		if (lockId) {
			const found = OFF_PLAYS.find((p) => p.id === lockId) || pool[0];
			currentPlay = practiceFlipped ? mirrorPlay(found) : { ...found, steps: (found.steps || []).map((st) => ({ ...st })), baseId: found.id };
		} else {
			const prev = currentPlay && (currentPlay.baseId || currentPlay.id);
			if (gameMode === "game" && prev && pool.length > 1) {
				const fresh = pool.filter((p) => p.id !== prev);
				if (fresh.length) pool = fresh;
			}
			currentPlay = randChoice(pool);
			currentPlay = { ...currentPlay, steps: (currentPlay.steps || []).map((st) => ({ ...st })), baseId: currentPlay.id };
		}
		applyKeeperRoutes(currentPlay);
		preSnapTimer = 0;
		scriptSteps = (currentPlay.steps || []).map((st) => ({ ...st }));
		scriptIndex = 0;
		scriptTimer = 0;
		scriptLocked = !!currentPlay.lockFirst;
		const defName = currentScheme && currentScheme.name ? currentScheme.name : "";
		setPlayCall(currentPlay.name + (revealDefThisPlay && defName ? " · vs " + defName : ""));
		if (typeof refreshPracticePreviews === "function") refreshPracticePreviews();
		if (typeof syncCallSelects === "function") syncCallSelects();
	}
	function chooseScheme() {
		const lockId = gameMode === "practice" ? practiceDefSchemeId : huddleDefPickId;
		if (lockId) {
			currentScheme = DEF_SCHEMES.find((s) => s.id === lockId) || DEF_SCHEMES[0];
			if (typeof syncCallSelects === "function") syncCallSelects();
			return;
		}
		const prevId = currentScheme && currentScheme.id;
		let pool = DEF_SCHEMES.slice();
		if (gameMode === "game" && prevId && pool.length > 1) {
			const fresh = pool.filter((s) => s.id !== prevId);
			if (fresh.length) pool = fresh;
		}
		const weights = pool.map((s) => s.id === "prevent" || s.id === "cover4Quarters" ? 2 : 1);
		let total = weights.reduce((a, b) => a + b, 0);
		let r = Math.random() * total;
		let acc = 0;
		currentScheme = pool[pool.length - 1];
		for (let i = 0; i < pool.length; i++) {
			acc += weights[i];
			if (r <= acc) {
				currentScheme = pool[i];
				break;
			}
		}
		if (typeof syncCallSelects === "function") syncCallSelects();
	}
	function placeEntitiesForNewPlay(scope) {
		scope = scope === "off" || scope === "def" ? scope : "both";
		const restageOff = scope !== "def";
		const restageDef = scope !== "off";
		if (scope === "both") {
			resetCamOp();
			freeLook = false;
			replayCursorFree = false;
		}
		if (gameMode === "practice") {
			const fixed = clamp(syncPracticeYardFromUI(), 1, 99);
			practiceStartYard = fixed;
			ballYard = fixed;
			playStartYard = fixed;
			driveStartYard = fixed;
		}
		refreshAllNumbers();
		revealDefThisPlay = true;
		if (restageDef) chooseScheme();
		if (restageOff) choosePlay();
		else if (currentPlay) {
			applyKeeperRoutes(currentPlay);
			scriptSteps = (currentPlay.steps || []).map((st) => ({ ...st }));
			scriptIndex = 0;
			scriptTimer = 0;
			scriptLocked = !!currentPlay.lockFirst;
		}
		if (currentPlay) {
			const defName = currentScheme && currentScheme.name ? currentScheme.name : "";
			setPlayCall(currentPlay.name + (revealDefThisPlay && defName ? " · vs " + defName : ""));
		}
		if (scope === "both") {
			tackleAnim = null;
			fumbleSeq = null;
			scoreSeq = null;
			hurdleTarget = null;
			hurdleOk = false;
			hurdleDidTrip = false;
			dive = null;
			getUpT = 0;
			diveHangT = 0;
			celebrateTimer = 0;
			sprintCharge = 1;
			sprintHoldT = 0;
			sprintExhausted = false;
			celebFumbleLock = false;
			tdZoom = false;
			defHitCool = 0;
			defHitLatch = false;
			defWrapPhase = "none";
			defYSnapEdge = false;
			defPointLatch = false;
			defBPointed = false;
			defWrapT = 0;
			defWrapFrom = null;
			defDive = null;
			defMoveId = null;
			defMoveT = 0;
		}
		const snap = snapX();
		const wt = fieldWideT();
		if (restageOff) {
			const behind = playStartYard - 5;
			rb = createPlayer(snap + (Math.random() - .5) * (1.4 + wt * 1.2), behind, "HB", 0, "off");
			rb.speed = 9;
			rb.hasBall = false;
			qb = null;
			handoffDone = false;
			handoffT = 0;
			handoffPhase = "pre"; // pre | toss | done
			if (qb) { qb.hasBall = true; rb.hasBall = false; }
			else if (rb) { rb.hasBall = true; handoffDone = true; handoffPhase = "done"; }
			runnerTrail = [];
			_trailAcc = 0;
			blockers = [];
			const olGap = 2.6 + wt * 1.55;
			for (let i = 0; i < numOL; i++) {
				const b = createPlayer(snap + (i - (numOL - 1) / 2) * olGap, playStartYard - 0.48, "OL", i, "off");
				b.speed = 8.8;
				blockers.push(b);
			}
			const olHalf = Math.max(0, numOL - 1) / 2 * olGap;
			const teOff = 1.85 + wt * 2.2;
			const teRankGap = 1.55 + wt * 1.35;
			for (let i = 0; i < numTE; i++) {
				const side = i % 2 === 0 ? -1 : 1;
				const rank = Math.floor(i / 2);
				const b = createPlayer(snap + side * (olHalf + teOff + rank * teRankGap), playStartYard - 0.4, "TE", i, "off");
				b.speed = 8.7;
				blockers.push(b);
			}
			// QB under center (or slightly offset); FB always deeper behind QB
			if (numQB > 0) {
				qb = createPlayer(snap - .35, playStartYard - 1.05, "QB", 0, "off");
				qb.speed = 7.35;
				blockers.push(qb);
			}
			for (let i = 0; i < numFB; i++) {
				const qbY = qb ? qb.y : playStartYard - 1.05;
				// Stack behind QB (toward own endzone = lower yard)
				const fbY = qbY - 1.85 - i * 0.55;
				const b = createPlayer(snap + (i - (numFB - 1) / 2) * (1.4 + wt * 0.8), fbY, "FB", i, "off");
				b.speed = 8.95;
				blockers.push(b);
			}
		}
		const sch = currentScheme;
		const mid = snap + ((fieldLeft() + fieldRight()) / 2 - snap) * .38;
		const flDb = fieldLeft();
		const frDb = fieldRight();
		function clusterX(i, n, mode) {
			if (n <= 1) return mid;
			const t = i / (n - 1);
			if (mode === "middle") return mid + (t - .5) * FIELD_WIDTH * .5;
			if (mode === "wide") return mid + (t - .5) * FIELD_WIDTH * .78;
			if (mode === "left") return mid - FIELD_WIDTH * .28 + t * FIELD_WIDTH * .42;
			if (mode === "right") return mid - FIELD_WIDTH * .14 + t * FIELD_WIDTH * .42;
			return mid + (t - .5) * FIELD_WIDTH * .64;
		}
		const EZ_BACK = Field.bodyCapY; // keep bodies inside the endzone (back line is Field.northBack)
		function clampDefAlignY(y) {
			return clamp(y, playStartYard + 1.15, EZ_BACK);
		}
		if (restageDef) {
			if (scope === "def" && defenders.length) {
				mirrorDefenseHorizontal();
			} else {
			defenders = [];
			const room = Math.max(4.2, EZ_BACK - playStartYard);
			const depthScale = Math.min(1, room / 16);
			for (let i = 0; i < numDT; i++) {
				const t = numDT <= 1 ? .5 : i / (numDT - 1);
				// Deeper alignment so DTs sit clearly on the defensive side of the OL (was ~+2.05)
				const x = snap + (t - .5) * Math.min(FIELD_WIDTH * .32, (3.7 + fieldWideT() * 2.2) * Math.max(1, numDT));
				const d = createPlayer(x + (Math.random() - .5) * .4, clampDefAlignY(playStartYard + Math.min(3.25, room * 0.22) + (Math.random() - .5) * .3), "DT", i, "def");
				d.baseSpeed = 7.7;
				d.speed = d.baseSpeed;
				d.dtLag = true;
				defenders.push(d);
			}
			for (let i = 0; i < numLBs; i++) {
				const d = createPlayer(clusterX(i, numLBs, sch.cluster) + (Math.random() - .5) * 1.3, clampDefAlignY(playStartYard + Math.min(sch.depthLB * depthScale, room * 0.42) + (Math.random() - .5) * .4), "LB", i, "def");
				d.baseSpeed = 8.55;
				d.speed = d.baseSpeed;
				defenders.push(d);
			}
			{
				const Wdb = Math.max(8, frDb - flDb);
				const fieldMid = (flDb + frDb) / 2;
				const cbInset = Math.min(Wdb * 0.22, 9.5) + Math.max(0, Wdb - 53) * 0.2;
				const slots = [];
				const cbL = { x: flDb + cbInset, y: playStartYard + 2.35, role: "CB", corner: true, safety: false };
				const cbR = { x: frDb - cbInset, y: playStartYard + 2.35, role: "CB", corner: true, safety: false };
				const fs = { x: fieldMid, y: playStartYard + Math.min(sch.depthDB * depthScale, 13.2), role: "FS", corner: false, safety: true };
				const ss = { x: snap + (snap >= mid ? 1 : -1) * Math.min(Wdb * 0.18, 9.2), y: playStartYard + 8.4, role: "SS", corner: false, safety: true };
				const nick = { x: snap - playSideSign() * Math.min(Wdb * 0.16, 8.4), y: playStartYard + 4.1, role: "NCB", corner: false, safety: false };
				const dime = { x: snap + playSideSign() * Math.min(Wdb * 0.14, 7.2), y: playStartYard + 6.4, role: "DIME", corner: false, safety: true };
				if (numDBs <= 1) slots.push(fs);
				else if (numDBs === 2) {
					const spread = Math.min(Wdb * 0.18, 9.5);
					slots.push(
						{ x: fieldMid - spread, y: playStartYard + Math.min(sch.depthDB * depthScale, 12.4), role: "SS", corner: false, safety: true },
						{ x: fieldMid + spread, y: playStartYard + Math.min(sch.depthDB * depthScale, 13.0), role: "FS", corner: false, safety: true }
					);
				}
				else if (numDBs === 3) slots.push(cbL, cbR, fs);
				else if (numDBs === 4) slots.push(cbL, cbR, ss, fs);
				else if (numDBs === 5) slots.push(cbL, nick, cbR, ss, fs);
				else {
					slots.push(cbL, nick, dime, cbR, ss, fs);
					for (let extra = 6; extra < numDBs; extra++) {
						const t = (extra - 5) / Math.max(1, numDBs - 5);
						slots.push({ x: mid + (t - 0.5) * Wdb * 0.28, y: playStartYard + 7.2 + extra * 0.4, role: "DB", corner: false, safety: false });
					}
				}
				for (let i = 0; i < numDBs; i++) {
					const slot = slots[i] || fs;
					const jitter = numDBs <= 2 ? 0 : (Math.random() - .5) * 0.45;
					const yJit = numDBs <= 2 ? 0 : (Math.random() - .5) * 0.25;
					const px = numDBs === 1 ? fieldMid : slot.x + jitter;
					const d = createPlayer(px, clampDefAlignY(slot.y + yJit), "DB", i, "def");
					d.baseSpeed = 9.15;
					d.speed = d.baseSpeed;
					d.dbRole = slot.role;
					d.isCorner = !!slot.corner;
					d.isSafety = !!slot.safety;
					defenders.push(d);
				}
			}
			defenders.forEach((d) => {
				d._pushYards = 0;
				d.pancaked = false;
				d.takenDown = false;
				d.downAmt = 0;
				d.atkKind = null;
				d.atkT = 0;
				d.atkDecideT = 0;
			});
			assignDefenseJobs();
			defenders.forEach((d) => {
				d.y = clampDefAlignY(d.y);
				if (d.jobY != null) d.jobY = Math.min(d.jobY, EZ_BACK);
				if (d.stutterY != null) d.stutterY = Math.min(d.stutterY, EZ_BACK);
				// Near the goal line, coverage landmarks used to pin at y=99 while bodies
				// aligned in the EZ — on snap they teleported back to the goal line.
				if (d.jobY != null && d.job !== "blitz" && d.job !== "man" && d.jobY < d.y - 0.45) {
					d.jobY = d.y;
				}
				if (playStartYard >= 82 && (d.job === "deep" || d.job === "robber" || d.isSafety)) {
					d.zoneRy = Math.min(d.zoneRy || 3.4, Math.max(1.4, EZ_BACK - d.y));
				}
			});
			if (practiceDefFlipped) mirrorDefenseHorizontal();
			applyCellDefenseTweaks();
			limitDtPenetration();
			}
		}
		assignBlockJobs();
		applyCellBlockTweaks();
		blockers.forEach((b) => {
			b.sealSide = b.driveSide || playSideSign() || 1;
		});
		if (restageDef && scope !== "def") applyPresnapLook();
		alignLoneDb();
		alignTwoDbs();
		clampDbWings();
		spreadInteriorDefense();
		assignStations();
		pinOffenseToOwnSide();
		if (scope === "both") {
			playAge = 0;
			idleCarrierT = 0;
			replayBuf.length;
			playFrames = [];
			huddleBuf = [];
		}
		playArtAnchor = {
			x: rb.x,
			y: rb.y
		};
		peekToggle = false;
		ctrlLeft = null;
		ctrlRight = null;
		if (playingDefense()) {
			ensureUserDefender();
			if (userDefender && (!playActive || practiceAwaitSnap)) {
				setPlayCall(huddleCallLabel() + " — A/B switch · B+stick point · Y snap/shed");
			}
		} else userDefender = null;
		updateCamera();
		if (typeof refreshPracticePreviews === "function") refreshPracticePreviews();
	}
	function limitDtPenetration() {
		// P0b: at most one DT may slant across the LOS. Everyone else 2-gaps
		// on their side of the ball so they cannot appear untouched in the backfield.
		const dts = defenders.filter((d) => d.group === "DT");
		if (!dts.length) return;
		const schemeId = (currentScheme && currentScheme.id) || "";
		const allowPen = schemeId === "overloadBlitz" || schemeId === "wide" || schemeId === "tight" || schemeId === "goalLine" || schemeId === "stormBlitz";
		const side = playSideSign();
		const snap = snapX();
		const already = dts.filter((d) => d.job === "blitz" && d.jobY != null && d.jobY < playStartYard + 0.45);
		let chosen = null;
		if (allowPen) {
			const pool = already.length ? already : dts.slice();
			pool.sort((a, b) => {
				const playRank = side ? side * (b.x - a.x) : (Math.abs(a.x - snap) - Math.abs(b.x - snap));
				return playRank;
			});
			chosen = pool[0] || null;
		}
		dts.forEach((d) => {
			d.dtPenetrate = d === chosen;
			d.dtLag = true;
			if (d.dtPenetrate) {
				d.job = "blitz";
				d.aggressor = true;
				d.jobX = d.jobX != null ? d.jobX : d.x;
				d.jobY = clamp(d.jobY != null ? d.jobY : playStartYard - 0.35, playStartYard - 0.85, playStartYard - 0.12);
				d.zoneRx = 1.2;
				d.zoneRy = 1.2;
				d.zoneFollow = false;
				if (d.stutterY != null) d.stutterY = Math.max(d.stutterY, playStartYard + 0.6);
			} else {
				d.job = "shade";
				d.aggressor = false;
				d.artCurve = false;
				d.stutter = false;
				d.fakeBlitz = false;
				d.jobX = d.x;
				d.jobY = playStartYard + 1.65 + (Math.abs(d.x - snap) < 1.2 ? 0.25 : 0);
				d.zoneRx = 1.6;
				d.zoneRy = 1.15;
				d.zoneFollow = false;
				d.y = Math.max(d.y, playStartYard + 2.15);
			}
		});
	}
	function playSideSign() {
		const id = currentPlay ? currentPlay.id : "";
		const st = currentPlay ? currentPlay.blockStyle : "";
		if (id.endsWith("L") || st === "wallL" || st === "pullL" || st === "zoneL" || st === "wedgeL" || st === "swingL") return -1;
		if (id.endsWith("R") || st === "wallR" || st === "pullR" || st === "zoneR" || st === "wedgeR" || st === "swingR") return 1;
		return 1;
	}
	function stockPlayId() {
		if (practiceOffPlayId) return practiceOffPlayId;
		if (currentPlay) return currentPlay.baseId || currentPlay.id;
		return OFF_PLAYS[0] ? OFF_PLAYS[0].id : "";
	}
	function cellPlayKey() { return playBookKey(currentPlay); }
	function cellSchemeId() { return (currentScheme && currentScheme.id) || practiceDefSchemeId || ""; }
	function isStockFacing() { return cellFacing(currentPlay, practiceFlipped, practiceDefFlipped) === "stock"; }
	function isFlippedFacing() { return cellFacing(currentPlay, practiceFlipped, practiceDefFlipped) === "flipped"; }
	function applyCellBlockTweaks() {
		const key = cellPlayKey();
		const sch = cellSchemeId();
		const snap = snapX();
		const fbs = blockers.filter((b) => b.group === "FB");
		const defs = [...defenders].sort((a, b) => a.x - b.x);
		function leadFb(sideSign) {
			fbs.forEach((b, i) => {
				b.blockMode = "climb";
				b.driveSide = sideSign;
				b.driveBlock = true;
				const pack = sideSign < 0 ? defs.slice(0, 3) : defs.slice(-3);
				b.blockTarget = pack[Math.min(i, Math.max(0, pack.length - 1))] || pack[0] || null;
				b.gapAimX = snap + sideSign * (8.2 + i * 1.1);
				b.gapAimY = playStartYard + 5.4 + i * 0.5;
				b.levelY = 5.5 + i * 0.4;
			});
		}
		function retargetLeftmost(n) {
			const left = defs.slice(0, n);
			const pullers = blockers.filter((b) => b.blockMode === "pull" || b.blockMode === "climb");
			pullers.forEach((b, i) => {
				if (left[i]) b.blockTarget = left[i];
				b.driveSide = -1;
				b.gapAimX = (left[i] ? left[i].x : snap - 8) - 0.4;
				b.gapAimY = playStartYard + 4.8 + i * 0.4;
			});
			if (!pullers.length) leadFb(-1);
		}
		// Pitch vs Overload, stock: FB lead play-side / left
		if (key === "pitch" && sch === "overloadBlitz" && isStockFacing()) leadFb(-1);
		// Blast vs Fire Zone, O-flipped: FB lead left
		if (key === "blast" && sch === "wide" && practiceFlipped) leadFb(-1);
		// Sweep vs Bear, flipped: retarget 2–3 leftmost defenders
		if (key === "sweep" && sch === "tight" && practiceFlipped) retargetLeftmost(3);
	}
	function unstackGroup(list, minDist) {
		for (let pass = 0; pass < 10; pass++) {
			for (let i = 0; i < list.length; i++) {
				for (let j = i + 1; j < list.length; j++) {
					const a = list[i], b = list[j];
					if (!a || !b) continue;
					const dx = b.x - a.x, dy = b.y - a.y;
					const d = Math.hypot(dx, dy);
					if (d >= minDist || d < 0.001) {
						if (d < 0.001) {
							b.x += 0.8;
							continue;
						}
						continue;
					}
					const push = (minDist - d) * 0.52;
					const nx = dx / d, ny = dy / d;
					a.x -= nx * push * 0.85;
					b.x += nx * push * 0.85;
					a.y -= ny * push * 0.28;
					b.y += ny * push * 0.28;
				}
			}
		}
	}
	function applyPresnapLook() {
		const sch = (currentScheme && currentScheme.id) || "";
		const fl = fieldLeft();
		const fr = fieldRight();
		const mid = (fl + fr) / 2;
		const W = fr - fl;
		const snap = snapX();
		const dbs = defenders.filter((d) => d.group === "DB").sort((a, b) => a.x - b.x);
		const lbs = defenders.filter((d) => d.group === "LB").sort((a, b) => a.x - b.x);
		const dts = defenders.filter((d) => d.group === "DT").sort((a, b) => a.x - b.x);

		function plantDeep(d, xFrac, yOff, rx) {
			d.x = clamp(fl + W * coverFrac(xFrac), fl + 3.2, fr - 3.2);
			d.y = playStartYard + yOff;
			d.job = "deep";
			d.jobX = d.x;
			d.jobY = d.y + 1.6;
			d.zoneRx = rx || W * 0.16;
			d.zoneRy = 5.0;
			d.zoneFollow = false;
			d.isSafety = true;
			d.isCorner = false;
			d.artCurve = false;
		}

		if (sch === "cover4Quarters" || sch === "goalLine") {
			const deepFracs = dbs.length === 2 ? [0.375, 0.625] : [0.125, 0.375, 0.625, 0.875];
			const deepY = sch === "goalLine" ? 10.4 : 11.6;
			dbs.slice(0, deepFracs.length).forEach((d, i) => plantDeep(d, deepFracs[i], deepY, W * 0.16));
			dbs.slice(deepFracs.length).forEach((d, i) => {
				d.x = snap + (i % 2 === 0 ? -1 : 1) * (4.2 + i);
				d.y = playStartYard + 4.6 + i * 0.6;
				if (d.job === "deep") d.job = "curl";
				d.isSafety = false;
				d.jobX = d.x;
				d.jobY = playStartYard + 5.2;
			});
			if (sch === "cover4Quarters") {
				lbs.forEach((d) => {
					if (d.job !== "blitz") return;
					const gap = Math.sign(d.x - snap) || playSideSign() || 1;
					d.jobX = clamp(snap + gap * 1.35, snap - 3.0, snap + 3.0);
					d.jobY = playStartYard - 0.25;
					d.artCurve = false;
					d.stutter = false;
					d.x = clamp(d.x, snap - 5.4, snap + 5.4);
					d.y = playStartYard + 4.6;
				});
			}
		} else if (sch === "prevent") {
			const deepFracs = dbs.length === 2 ? [0.375, 0.625] : [0.10, 0.30, 0.50, 0.70, 0.90];
			dbs.slice(0, deepFracs.length).forEach((d, i) => plantDeep(d, deepFracs[i], 12.2, W * 0.14));
			dbs.slice(deepFracs.length).forEach((d) => {
				d.x = mid + 6.2;
				d.y = playStartYard + 6.6;
				d.job = "curl";
				d.isSafety = false;
				d.isCorner = false;
				d.jobX = d.x;
				d.jobY = d.y + 0.4;
				d.zoneFollow = false;
			});
		} else if (sch === "tight") {
			const outerL = dbs[0], outerR = dbs[dbs.length - 1];
			const keepX = new Set();
			if (outerL) keepX.add(outerL);
			if (outerR) keepX.add(outerR);
			dbs.forEach((d, i, arr) => {
				if (keepX.has(d)) return;
				const t = arr.length <= 1 ? 0 : i / (arr.length - 1) - 0.5;
				d.x = mid + t * Math.min(W * 0.52, 16);
			});
			lbs.forEach((d, i, arr) => {
				const t = arr.length <= 1 ? 0 : i / (arr.length - 1) - 0.5;
				d.x = snap + t * Math.min(W * 0.48, 14.5);
				d.y = playStartYard + 4.6;
			});
			const ols = blockers.filter((b) => b.group === "OL").sort((a, b) => a.x - b.x);
			dts.forEach((d, i, arr) => {
				if (ols.length >= 2) {
					const gap = Math.min(i + 1, ols.length - 1);
					d.x = (ols[gap - 1].x + ols[gap].x) / 2;
				} else {
					d.x = snap + (i - (arr.length - 1) / 2) * 3.15;
				}
				d.y = playStartYard + 2.85;
			});
		} else if (sch === "wide") {
			if (dbs.length >= 3) {
				const L = dbs[0], R = dbs[dbs.length - 1];
				L.x = clamp(L.x - 2.6, fl + 2.4, snap - 7);
				R.x = clamp(R.x + 2.6, snap + 7, fr - 2.4);
				L.y += 2.5;
				R.y += 2.5;
				if (L.job === "spy") {
					L.stutterX = L.x + Math.min(2.2, Math.max(1.4, (mid - L.x) * 0.22));
					L.stutterY = L.y - 1.1;
					L.jobX = L.x + Math.min(3.2, Math.max(2.0, (mid - L.x) * 0.28));
					L.jobY = L.y + 2.1;
					L.zoneRx = 1.55;
					L.zoneRy = 1.45;
					L.artCurve = true;
					L.fakeBlitz = true;
				} else {
					if (L.jobX != null) L.jobX = L.x;
					if (L.jobY != null) L.jobY = L.y + 0.8;
				}
				if (R.jobX != null) R.jobX = R.x;
				if (R.jobY != null) R.jobY = R.y + 0.8;
			}
			const innerLbs = lbs.slice(1, Math.max(1, lbs.length - 1));
			const bump = innerLbs.length >= 2 ? innerLbs.slice(0, 2) : lbs.slice(0, 2);
			bump.forEach((d) => {
				d.y += 2.5;
				if (d.jobY != null && d.job !== "blitz") d.jobY = Math.max(d.jobY, d.y);
			});
		} else if (sch === "overloadBlitz") {
			if (dbs.length <= 2) {
				dbs.forEach((d, i) => {
					d.x = mid + (dbs.length === 1 ? 0 : (i === 0 ? -2.55 : 2.55));
					d.y = playStartYard + 11.3;
					d.job = "deep";
					d.jobX = d.x;
					d.jobY = d.y + 1.4;
					d.isSafety = true;
					d.isCorner = false;
					d.zoneFollow = false;
				});
			} else {
			const corners = dbs.length >= 2 ? [dbs[0], dbs[dbs.length - 1]] : [];
			const rest = dbs.filter((d) => !corners.includes(d)).sort((a, b) => a.x - b.x);
			if (rest.length >= 2) {
				rest[0].x = mid - 2.55;
				rest[1].x = mid + 2.55;
				rest[0].y = playStartYard + 11.3;
				rest[1].y = playStartYard + 11.3;
				rest.slice(0, 2).forEach((d) => {
					d.job = "deep";
					d.jobX = d.x;
					d.jobY = d.y + 1.4;
					d.isSafety = true;
					d.zoneFollow = false;
				});
			}
			}
		}

		unstackGroup(defenders, 2.05);
		unstackGroup(blockers, 1.55);
		defenders.forEach((d) => {
			blockers.forEach((b) => {
				const gap = (d.radius || 0.9) + (b.radius || 0.9) + 0.25;
				const dd = dist(d, b);
				if (dd < gap && dd > 0.01) {
					const push = gap - dd;
					d.y += push * 0.7 + 0.35;
					d.x += Math.sign(d.x - b.x || d.x - snap) * push * 0.45;
				}
			});
		});
		defenders.forEach((d) => {
			d.x = clamp(d.x, fl + 2.2, fr - 2.2);
			d.y = clamp(d.y, playStartYard + 1.15, Field.bodyCapY);
			if (d.jobX != null && Math.abs(d.jobX - d.x) < 1.4) d.jobX = d.x;
		});
		if (dbs.length === 1) plantDeep(dbs[0], 0.5, 11.4, W * 0.22);
		else if (dbs.length === 2) {
			plantDeep(dbs[0], 0.375, 11.6, W * 0.18);
			plantDeep(dbs[1], 0.625, 11.6, W * 0.18);
		}
	}
	function pinOffenseToOwnSide() {
		const los = playStartYard;
		(blockers || []).forEach((b) => {
			if (!b) return;
			if (b.group === "OL" || b.group === "TE") b.y = Math.min(b.y, los - 0.28);
			else if (b.group === "QB") b.y = Math.min(b.y, los - 0.85);
			else if (b.group === "FB") b.y = Math.min(b.y, los - 2.0);
		});
		if (rb) rb.y = Math.min(rb.y, los - 4.2);
	}
	function clampDbWings() {
		const wt = fieldWideT();
		if (wt <= 0.02) return;
		const fl = fieldLeft(), fr = fieldRight();
		const minInset = 3.4 + wt * 14.2;
		const dbs = (defenders || []).filter((d) => d && d.group === "DB").sort((a, b) => a.x - b.x);
		if (dbs.length < 4) return;
		const left = dbs[0], right = dbs[dbs.length - 1];
		if (left.x < fl + minInset) {
			left.x = fl + minInset;
			if (left.jobX != null) left.jobX = left.x;
		}
		if (right.x > fr - minInset) {
			right.x = fr - minInset;
			if (right.jobX != null) right.jobX = right.x;
		}
	}
	function stationForDefender(d) {
		const snap = typeof snapX === "function" ? snapX() : Field.midX();
		const dx = (d.x || 0) - snap;
		if (d.job === "contain") return "contain";
		if (d.job === "blitz") return (d.group === "DT" && Math.abs(dx) < 2.4) ? "gap" : "fold";
		if (d.job === "flat" || d.job === "shade") return "alley";
		if (d.job === "deep" || d.job === "robber" || d.isSafety || d.isCorner) return "alley";
		if (d.job === "drop" || d.job === "hook" || d.job === "curl" || d.job === "spy") return "cutback";
		if (d.job === "man") return Math.abs(dx) < 3.2 ? "gap" : "alley";
		if (d.group === "DT") return "gap";
		if (d.group === "LB") return "cutback";
		return "alley";
	}
	function stationForBlocker(b) {
		if (b.blockMode === "pull") return "fold";
		if (b.backsideSeal) return "cutback";
		if (b.blockMode === "reach" || b.blockMode === "seal") return "alley";
		if (Math.abs((b.x || 0) - snapX()) > 5) return "contain";
		return "gap";
	}
	function bindStation(p, role) {
		if (!p) return;
		p.station = role;
		p.stationX = p.jobX != null ? p.jobX : p.x;
		p.stationY = p.jobY != null ? p.jobY : p.y;
	}
	function assignStations() {
		(defenders || []).forEach((d) => bindStation(d, stationForDefender(d)));
		(blockers || []).forEach((b) => bindStation(b, stationForBlocker(b)));
	}
	function applyAssignmentRepulsion(dt) {
		if (!playActive || practiceAwaitSnap || tackleAnim || preSnapTimer > 0) return;
		if (scoreSeq || fumbleSeq) return;
		const minSep = 1.05 + Field.fieldWideT() * 0.7;
		const pushRate = 5.4;
		function packRepel(list, userSkip) {
			const body = (list || []).filter((p) => p && p.active !== false && !p.pancaked && !p.takenDown && p.state !== "whiff" && p.state !== "recover");
			for (let i = 0; i < body.length; i++) {
				for (let j = i + 1; j < body.length; j++) {
					const a = body[i], b = body[j];
					if (userSkip && (userSkip(a) || userSkip(b))) continue;
					if (Math.abs((a.y || 0) - (b.y || 0)) > 2.6) continue;
					const dx = (a.x || 0) - (b.x || 0);
					const dy = (a.y || 0) - (b.y || 0);
					const distAB = Math.hypot(dx, dy) || 1e-4;
					const need = minSep + ((a.radius || 0.7) + (b.radius || 0.7)) * 0.12;
					if (distAB >= need) continue;
					const push = (need - distAB) * pushRate * dt;
					const nx = dx / distAB;
					const ny = dy / distAB * 0.32;
					a.x += nx * push * 0.5;
					b.x -= nx * push * 0.5;
					a.y += ny * push * 0.5;
					b.y -= ny * push * 0.5;
				}
			}
		}
		packRepel(defenders, isUserDef);
		packRepel(blockers, (p) => (p._userCtrl || 0) > 0.05);
		const fl = fieldLeft() + 0.8, fr = fieldRight() - 0.8;
		function clampBody(p) {
			if (!p) return;
			p.x = clamp(p.x, fl, fr);
			p.y = Math.min(p.y, Field.bodyCapY);
		}
		(defenders || []).forEach(clampBody);
		(blockers || []).forEach(clampBody);
	}
	function spreadInteriorDefense() {
		const fl = fieldLeft(), fr = fieldRight();
		const mid = (fl + fr) / 2;
		const W = fr - fl;
		const dbs = (defenders || []).filter((d) => d && d.group === "DB").sort((a, b) => a.x - b.x);
		const wings = new Set();
		const wingN = dbs.length >= 6 ? 4 : dbs.length >= 4 ? 2 : 0;
		for (let i = 0; i < Math.floor(wingN / 2); i++) {
			wings.add(dbs[i]);
			wings.add(dbs[dbs.length - 1 - i]);
		}
		const box = (defenders || []).filter((d) => d && !wings.has(d)).sort((a, b) => a.x - b.x);
		if (box.length < 3) return;
		const span = Math.min(W * 0.52, 11.5 + box.length * 3.7);
		const left = mid - span / 2;
		const minX = fl + 9.2;
		const maxX = fr - 9.2;
		box.forEach((d, i) => {
			const t = box.length <= 1 ? 0.5 : i / (box.length - 1);
			d.x = clamp(left + t * span, minX, maxX);
			if (d.jobX != null) d.jobX = d.x;
		});
	}
	function applyCellDefenseTweaks() {
		const key = cellPlayKey();
		const sch = cellSchemeId();
		const snap = snapX();
		const mid = (fieldLeft() + fieldRight()) / 2;
		function stiffen() {
			defenders.forEach((d) => {
				d.readT = Math.min(d.readT || 0, 0.12);
				d.reactT = Math.min(d.reactT || 0, 0.08);
				d.fakeBlitz = false;
				d.blitzDelay = Math.min(d.blitzDelay || 0, 0.08);
				if (d.job !== "deep") {
					d.y = Math.max(playStartYard + 2.2, Math.min(d.y, playStartYard + (d.group === "DT" ? 3.4 : d.group === "LB" ? 5.2 : 8.5)));
					if (d.jobY != null && d.job !== "deep") d.jobY = Math.min(d.jobY, playStartYard + (d.job === "blitz" ? -0.15 : 7.2));
				}
				if (d.job === "blitz" || d.job === "man") d.aggressor = true;
				d.baseSpeed = (d.baseSpeed || d.speed || 8.4) * 1.06;
				d.speed = d.baseSpeed;
			});
		}
		function unskewOverload() {
			defenders.forEach((d) => {
				const pull = (d.x - mid) * 0.28;
				d.x -= pull;
				if (d.jobX != null) d.jobX -= (d.jobX - mid) * 0.22;
			});
		}
		function holdFireZoneSafety() {
			defenders.filter((d) => d.group === "DB" && (d.job === "deep" || d.isSafety)).forEach((d) => {
				d.artCurve = false;
				d.stutter = false;
				d.fakeBlitz = false;
				d.zoneFollow = false;
				d.readT = Math.max(d.readT || 0, 0.35);
				d.job = "deep";
				d.jobX = d.x;
				d.jobY = Math.max(d.y, playStartYard + 12);
			});
		}
		function stabilizeQuarters() {
			const fl = fieldLeft();
			const fr = fieldRight();
			const mid = (fl + fr) / 2;
			const W = fr - fl;
			const snap = snapX();
			const stations = [0.14, 0.38, 0.62, 0.86];
			defenders.filter((d) => d.group === "DB").sort((a, b) => a.x - b.x).forEach((d, i) => {
				d.x = fl + W * coverFrac(stations[Math.min(i, stations.length - 1)]);
				d.artCurve = false;
				d.stutter = false;
				if (d.job === "deep") {
					d.y = playStartYard + 11.5;
					d.jobX = d.x;
					d.jobY = playStartYard + 14.2;
				} else {
					d.y = clamp(d.y, playStartYard + 3.6, playStartYard + 7.4);
					if (d.jobX != null) d.jobX = d.x;
				}
			});
			defenders.filter((d) => d.group === "LB").sort((a, b) => a.x - b.x).forEach((d, i, arr) => {
				const t = arr.length <= 1 ? 0 : (i / (arr.length - 1) - 0.5);
				d.x = mid + t * W * 0.28;
				d.y = playStartYard + 5.1;
				d.artCurve = false;
			});
			defenders.filter((d) => d.group === "DT").sort((a, b) => a.x - b.x).forEach((d, i, arr) => {
				d.x = snap + (i - (arr.length - 1) / 2) * 2.35;
				d.y = playStartYard + 2.55;
			});
		}
		function tightenOverloadForZigzag() {
			const snap = snapX();
			const fl = fieldLeft();
			const fr = fieldRight();
			const mid = (fl + fr) / 2;
			const capY = playStartYard + 11;
			defenders.forEach((d) => {
				d.x = mid + (d.x - mid) * 0.52;
				d.x = clamp(d.x, snap - 13, snap + 11);
				d.y = Math.min(d.y, capY);
				if (d.jobY != null) d.jobY = Math.min(d.jobY, capY);
				if (d.stutterY != null) d.stutterY = Math.min(d.stutterY, playStartYard + 2.6);
				d.artCurve = false;
			});
			defenders.filter((d) => d.job === "blitz").forEach((d) => {
				d.y = clamp(d.y, playStartYard + 2.2, playStartYard + 5.2);
				d.jobY = playStartYard - 0.2;
				d.stutter = false;
			});
			defenders.filter((d) => d.job === "deep").forEach((d) => {
				d.y = playStartYard + 9.6;
				d.jobY = playStartYard + 10.5;
			});
		}
		// Walk-Up / Bear cells that were standing/lazy
		if (sch === "tight" && key === "wedge" && isStockFacing()) stiffen();
		if (sch === "goalLine" && key === "wedge" && isStockFacing()) stiffen();
		if (sch === "tight" && key === "river" && practiceDefFlipped) stiffen();
		if (sch === "overloadBlitz" && key === "wedge" && practiceDefFlipped) unskewOverload();
		if (sch === "wide" && key === "zigzag" && practiceFlipped) holdFireZoneSafety();
		if (sch === "cover4Quarters" && key === "zigzag" && isFlippedFacing()) stabilizeQuarters();
		if (sch === "overloadBlitz" && key === "zigzag" && isFlippedFacing()) tightenOverloadForZigzag();
	}
	function assignBlockJobs() {
		const snap = snapX();
		const style = currentPlay ? currentPlay.blockStyle : "tight";
		const side = playSideSign();
		const ols = blockers.filter((b) => b.group === "OL").sort((a, b) => a.x - b.x);
		const tes = blockers.filter((b) => b.group === "TE").sort((a, b) => a.x - b.x);
		const fbs = blockers.filter((b) => b.group === "FB").sort((a, b) => a.x - b.x);
		const qbs = blockers.filter((b) => b.group === "QB");
		const defs = [...defenders].sort((a, b) => a.x - b.x);
		// HB Zone / Blast: drive defenders BACK — every OL/TE claims someone
		if (style === "zoneR" || style === "zoneL") {
			const zSide = style === "zoneR" ? 1 : -1;
			const used = new Set();
			function takeDef(preferX, maxD, preferGroup) {
				let best = null, bd = maxD;
				for (const d of defs) {
					if (used.has(d)) continue;
					let dd = Math.hypot(d.x - preferX, (d.y - playStartYard) * 0.5);
					if (preferGroup && d.group === preferGroup) dd *= 0.5;
					if (dd < bd) { bd = dd; best = d; }
				}
				if (best) used.add(best);
				return best;
			}
			const bGapX = snap + zSide * (ols.length >= 3 ? 2.4 : 1.9);
			blockers.forEach((b) => {
				b.blockTarget = null; b.blockMode = "man"; b.pullPhase = 0; b.pullVia = null;
				b.driveSide = zSide; b.levelY = 2.8; b.driveBlock = true; b.sturdyBlock = false; b._userCtrl = 0;
			});
			ols.forEach((b, i) => {
				b.blockMode = "reach";
				b.driveSide = zSide;
				b.driveBlock = true;
				b.blockTarget = takeDef(b.x + zSide * 0.9, 22, "DT") || takeDef(b.x + zSide * 1.1, 24);
				b.levelY = 2.4 + i * 0.3;
			});
			tes.forEach((b, i) => {
				b.blockMode = "reach";
				b.driveSide = zSide;
				b.driveBlock = true;
				b.blockTarget = takeDef(b.x + zSide * 1.4, 20, "DT") || takeDef(b.x + zSide * 1.4, 20);
				b.levelY = 3.0 + i * 0.35;
			});
			fbs.forEach((b, i) => {
				b.blockMode = "climb";
				b.driveSide = zSide;
				b.driveBlock = true;
				b.levelY = 3.6 + i * 0.35;
				b.blockTarget = takeDef(bGapX + zSide * i * 0.7, 24) || takeDef(bGapX, 28);
				b.gapAimX = bGapX + zSide * 0.8;
				b.gapAimY = playStartYard + 4.8 + i * 0.7;
			});
			qbs.forEach((b) => {
				b.blockMode = "man";
				b.driveSide = zSide;
				b.driveBlock = true;
				b.blockTarget = takeDef(snap - zSide * 2.2, 14, "DT") || takeDef(snap - zSide * 2.2, 14);
				b.levelY = 1.2;
			});
			// Any unclaimed DT: assign nearest free OL
			defs.filter((d) => d.group === "DT" && !used.has(d)).forEach((d) => {
				const free = ols.find((b) => !b.blockTarget) || ols[0];
				if (free) { free.blockTarget = d; free.driveBlock = true; used.add(d); }
			});
			return;
		}
		// Sweep Left: rightmost two pull; backside OL must claim DTs (no free rushers)
		if (style === "wallL") {
			const wSide = -1;
			const used = new Set();
			function takeDef(preferX, maxD, preferGroup) {
				let best = null, bd = maxD;
				for (const d of defs) {
					if (used.has(d)) continue;
					let dd = Math.hypot(d.x - preferX, (d.y - playStartYard) * 0.55);
					if (preferGroup && d.group === preferGroup) dd *= 0.55;
					if (dd < bd) { bd = dd; best = d; }
				}
				if (best) used.add(best);
				return best;
			}
			blockers.forEach((b) => {
				b.blockTarget = null; b.blockMode = "man"; b.pullPhase = 0; b.pullVia = null;
				b.driveSide = wSide; b.levelY = 2.6; b.pullBoost = 1; b._userCtrl = 0;
			});
			const line = [...ols, ...tes].sort((a, b) => a.x - b.x);
			const pullers = line.slice(-2).reverse();
			pullers.forEach((b, i) => {
				b.blockMode = "pull"; b.pullPhase = 0; b.driveSide = wSide;
				b.pullVia = {
					x: b.x - wSide * 0.3, y: playStartYard - 1.5 - i * 0.35,
					x2: snap + wSide * (5.8 + i * 1.1), y2: playStartYard + 1.4 + i * 0.5
				};
				b.blockTarget = takeDef(snap + wSide * (7 + i), 24);
				b.levelY = 4.0 + i * 0.4;
			});
			// Backside (right) blockers: prioritize DTs on their side — pancakes not free runs
			line.forEach((b, i) => {
				if (pullers.includes(b)) return;
				b.blockMode = "man";
				b.driveSide = Math.sign(b.x - snap) || 1;
				const preferX = b.x + 0.6;
				b.blockTarget = takeDef(preferX, 16, "DT") || takeDef(preferX, 20);
				b.levelY = 2.0 + i * 0.25;
			});
			fbs.forEach((b, i) => {
				b.blockMode = "climb"; b.driveSide = wSide; b.levelY = 5.5 + i * 0.4;
				const outsideX = snap + wSide * (8.5 + i * 1.2);
				b.blockTarget = takeDef(outsideX, 26);
				b.gapAimX = outsideX; b.gapAimY = playStartYard + 5.5 + i * 0.6;
			});
			qbs.forEach((b) => {
				b.blockMode = "man"; b.driveSide = -wSide;
				b.blockTarget = takeDef(snap - wSide * 2.2, 12, "DT") || takeDef(snap - wSide * 2.2, 12);
				b.levelY = 1.2;
			});
			return;
		}
		// Sweep Right: leftmost pull; EVERY other blocker must claim a defender (prefer DT)
		if (style === "wallR") {
			const wSide = 1;
			const used = new Set();
			function takeDef(preferX, maxD, preferGroup) {
				let best = null, bd = maxD;
				for (const d of defs) {
					if (used.has(d)) continue;
					let dd = Math.hypot(d.x - preferX, (d.y - playStartYard) * 0.5);
					if (preferGroup && d.group === preferGroup) dd *= 0.45;
					if (dd < bd) { bd = dd; best = d; }
				}
				if (best) used.add(best);
				return best;
			}
			blockers.forEach((b) => {
				b.blockTarget = null; b.blockMode = "man"; b.pullPhase = 0; b.pullVia = null;
				b.driveSide = wSide; b.levelY = 3.0; b.pullBoost = 1; b.driveBlock = true; b._userCtrl = 0;
			});
			const line = [...ols, ...tes].sort((a, b) => a.x - b.x);
			const pullers = line.slice(0, Math.min(2, line.length));
			pullers.forEach((b, i) => {
				b.blockMode = "pull"; b.pullPhase = 0; b.driveSide = wSide; b.driveBlock = true;
				b.pullVia = {
					x: b.x + wSide * 0.8, y: playStartYard + 0.4 + i * 0.2,
					x2: snap + wSide * (6.0 + i * 1.1), y2: playStartYard + 3.4 + i * 0.6
				};
				b.blockTarget = takeDef(snap + wSide * (7 + i), 26);
				b.levelY = 4.5 + i * 0.3;
			});
			line.forEach((b) => {
				if (pullers.includes(b)) return;
				b.blockMode = "reach";
				b.driveSide = Math.sign(b.x - snap) || -1;
				b.driveBlock = true;
				b.blockTarget = takeDef(b.x, 18, "DT") || takeDef(b.x, 22);
				b.levelY = 2.4;
			});
			// Force-cover remaining DTs
			defs.filter((d) => d.group === "DT" && !used.has(d)).forEach((d) => {
				const free = line.find((b) => !pullers.includes(b) && (!b.blockTarget || b.blockTarget.group !== "DT"));
				const host = free || line[line.length - 1];
				if (host) { host.blockTarget = d; host.blockMode = "reach"; host.driveBlock = true; used.add(d); }
			});
			fbs.forEach((b, i) => {
				b.blockMode = "climb"; b.driveSide = wSide; b.driveBlock = true; b.levelY = 5.8;
				const ox = snap + wSide * (8.5 + i);
				b.blockTarget = takeDef(ox, 26); b.gapAimX = ox; b.gapAimY = playStartYard + 6;
			});
			qbs.forEach((b) => {
				b.blockMode = "man"; b.driveBlock = true;
				b.blockTarget = takeDef(snap - 2, 14, "DT") || takeDef(snap - 2, 14);
				b.levelY = 1.2;
			});
			return;
		}
		// Swing Right: literal swinging door — leftmost arcs all the way to far right of hinge
		if (style === "swingR" || style === "swingL") {
			const gSide = style === "swingR" ? 1 : -1;
			const used = new Set();
			function takeDef(preferX, maxD) {
				let best = null, bd = maxD;
				for (const d of defs) {
					if (used.has(d)) continue;
					const dd = Math.hypot(d.x - preferX, (d.y - playStartYard) * 0.65);
					if (dd < bd) { bd = dd; best = d; }
				}
				if (best) used.add(best);
				return best;
			}
			blockers.forEach((b) => {
				b.blockTarget = null; b.blockMode = "man"; b.pullPhase = 0; b.pullVia = null;
				b.driveSide = gSide; b.levelY = 2.8; b.pullBoost = 1; b.driveBlock = true; b._userCtrl = 0;
			});
			const line = [...ols, ...tes].sort((a, b) => a.x - b.x);
			if (!line.length) return;
			const n = line.length;
			const pivot = gSide > 0 ? line[n - 1] : line[0];
			const hingeX = pivot.x;
			const hingeY = playStartYard + 0.2;
			// Hinge + next 1–2: punch DOWNFIELD to open the door swing
			const hingeGroup = gSide > 0 ? line.slice(-Math.min(3, n)) : line.slice(0, Math.min(3, n));
			hingeGroup.forEach((b, i) => {
				b.blockMode = "reach";
				b.driveSide = gSide;
				b.driveBlock = true;
				b.levelY = 3.6 + i * 0.35;
				b.blockTarget = takeDef(b.x + gSide * (0.8 + i * 0.3), 16);
				b.gapAimX = b.x + gSide * 0.5;
				b.gapAimY = playStartYard + 3.5 + i * 0.5;
			});
			// Door panel: everyone else swings on a circular arc around hinge
			// rank 1 = nearest non-hinge traveler … rank high = leftmost → ends furthest outside hinge
			const panel = line.filter((b) => !hingeGroup.includes(b));
			panel.forEach((b) => {
				const i = line.indexOf(b);
				// For swingR: leftmost (i=0) has highest rank
				const rank = gSide > 0 ? (n - 1 - i) : i;
				const radius = Math.max(2.2, Math.abs(b.x - hingeX) + 0.4);
				// Arc through backfield: start left of hinge, midpoint deep, end right of hinge
				// Angle in field plane: 0 = +x, π/2 = +y (downfield)
				const startAng = gSide > 0 ? Math.PI * 0.92 : Math.PI * 0.08;
				const endAng = gSide > 0 ? -0.25 - rank * 0.08 : Math.PI + 0.25 + rank * 0.08;
				const midAng = gSide > 0
					? startAng + (endAng - startAng) * 0.45
					: startAng + (endAng - startAng) * 0.45;
				const midR = radius * (0.85 + rank * 0.06);
				const endR = radius * 0.55 + 1.2 + rank * 1.35;
				const midX = hingeX + Math.cos(midAng) * midR;
				const midY = hingeY + Math.sin(midAng) * midR - (0.8 + rank * 0.55);
				const endX = hingeX + gSide * (1.3 + rank * 1.55);
				const endY = playStartYard + 1.3 + rank * 0.25;
				b.blockMode = "pull";
				b.pullPhase = 0;
				b.driveSide = gSide;
				b.pullBoost = 1.05 + Math.min(0.22, rank * 0.05);
				b.pullVia = { x: midX, y: Math.min(playStartYard - 0.3, midY), x2: endX, y2: endY };
				b.blockTarget = takeDef(endX + gSide * 0.8, 20);
				b.levelY = 2.5 + rank * 0.3;
			});
			fbs.forEach((b) => {
				b.blockMode = "climb"; b.driveSide = gSide; b.driveBlock = true; b.levelY = 4.6;
				b.blockTarget = takeDef(hingeX + gSide * 5, 20);
				b.gapAimX = hingeX + gSide * 5.2; b.gapAimY = playStartYard + 4.5;
			});
			qbs.forEach((b) => {
				b.blockMode = "man";
				b.blockTarget = takeDef(snap - gSide * 2, 12);
				b.levelY = 1.2;
			});
			return;
		}
		// River: purge middle — inside blockers drive defenders SIDEWAYS; levels downfield; sturdy holds
		if (style === "river") {
			const used = new Set();
			function takeDef(preferX, maxD) {
				let best = null, bd = maxD;
				for (const d of defs) {
					if (used.has(d)) continue;
					const dd = Math.hypot(d.x - preferX, (d.y - playStartYard) * 0.6);
					if (dd < bd) { bd = dd; best = d; }
				}
				if (best) used.add(best);
				return best;
			}
			blockers.forEach((b) => {
				b.blockTarget = null; b.blockMode = "man"; b.pullPhase = 0; b.pullVia = null;
				b.driveSide = 0; b.levelY = 3; b.sturdyBlock = true; b.driveBlock = false; b._userCtrl = 0;
			});
			const line = [...ols, ...tes].sort((a, b) => a.x - b.x);
			const midI = (line.length - 1) / 2;
			line.forEach((b, i) => {
				const outward = Math.sign(i - midI) || (i % 2 === 0 ? -1 : 1);
				// Inside: wash defenders out of the A/B gaps
				b.blockMode = "reach";
				b.driveSide = outward;
				b.sturdyBlock = true;
				b.blockTarget = takeDef(b.x + outward * 1.4, 18);
				// Staggered levels so RB can weave S-path through channels
				b.levelY = 2.2 + Math.abs(i - midI) * 0.9 + (i % 2) * 0.35;
			});
			fbs.forEach((b, i) => {
				b.blockMode = "climb";
				b.sturdyBlock = true;
				b.driveSide = i % 2 === 0 ? 1 : -1;
				b.levelY = 5.0 + i * 0.8;
				b.blockTarget = takeDef(snap + b.driveSide * 2.5, 20);
				b.gapAimX = snap + b.driveSide * 3.2;
				b.gapAimY = playStartYard + 5.5;
			});
			qbs.forEach((b) => {
				b.blockMode = "man";
				b.sturdyBlock = true;
				b.blockTarget = takeDef(snap, 12);
				b.levelY = 1.5;
			});
			return;
		}

		// Wedge Left: mass pull left like a swinging gate, staggered levels; RB fake R then pitch L
		if (style === "wedgeL") {
			const used = new Set();
			function takeDef(preferX, maxD) {
				let best = null, bd = maxD;
				for (const d of defs) {
					if (used.has(d)) continue;
					const dd = Math.hypot(d.x - preferX, (d.y - playStartYard) * 0.55);
					if (dd < bd) { bd = dd; best = d; }
				}
				if (best) used.add(best);
				return best;
			}
			const line = [...ols, ...tes].sort((a, b) => a.x - b.x);
			const hinges = line.slice(0, 2); // two leftmost stay — the hinge
			blockers.forEach((b) => {
				b.blockTarget = null; b.blockMode = "man"; b.pullPhase = 0; b.pullVia = null;
				b.driveSide = -1; b.levelY = 3; b.driveBlock = true; b.sturdyBlock = true; b._userCtrl = 0;
			});
			line.forEach((b, i) => {
				const rank = line.length - 1 - i; // rightmost travels farthest left
				if (hinges.includes(b)) {
					b.blockMode = "reach";
					b.driveBlock = true;
					b.sturdyBlock = true;
					b.pullVia = null;
					b.pullPhase = 0;
					b.gapAimX = b.x - 0.8;
					b.gapAimY = playStartYard + 2.2;
					b.blockTarget = takeDef(b.x - 1.1, 14);
					b.levelY = 2.2;
					return;
				}
				b.blockMode = "pull";
				b.pullPhase = 0;
				b.pullBoost = 1 + rank * 0.06;
				const midX = snap - 2.8 - rank * 0.55;
				const midY = playStartYard - (1.1 + rank * 0.65);
				const endX = snap - (6.5 + rank * 1.55);
				const endY = playStartYard + 2.4 + rank * 0.95; // staggered levels
				b.pullVia = { x: midX, y: midY, x2: endX, y2: endY };
				b.pullBoost = 1.08 + rank * 0.08;
				b.blockTarget = takeDef(endX, 22);
				b.gapAimX = endX;
				b.gapAimY = endY + 1.2;
				b.levelY = 3 + rank * 0.9;
				b.driveBlock = true;
			});
			fbs.forEach((b, i) => {
				b.blockMode = "man";
				b.pullVia = null;
				b.pullPhase = 0;
				b.driveSide = 1;
				b.sealSide = 1;
				b.backsideSeal = true;
				b.driveBlock = true;
				b.sturdyBlock = true;
				b.facing = 0;
				b.x = snap + 3.2 + i * 0.7;
				b.y = playStartYard - 1.1;
				b.blockTarget = takeDef(snap + 4.2 + i * 0.8, 18);
				b.gapAimX = snap + 4.4;
				b.gapAimY = playStartYard + 2.8;
				b.levelY = 2.6;
			});
			qbs.forEach((b) => {
				b.blockMode = "man";
				b.pullVia = null;
				b.driveSide = 1;
				b.sealSide = 1;
				b.backsideSeal = true;
				b.driveBlock = true;
				b.sturdyBlock = true;
				b.facing = 0;
				b.x = snap + 2.4;
				b.y = playStartYard - 0.55;
				b.blockTarget = takeDef(snap + 3.2, 16);
				b.gapAimX = snap + 3.6;
				b.gapAimY = playStartYard + 2.4;
				b.levelY = 2.2;
			});
			return;
		}

		if (style === "wedgeR") {
			const used = new Set();
			function takeDef(preferX, maxD) {
				let best = null, bd = maxD;
				for (const d of defs) {
					if (used.has(d)) continue;
					const dd = Math.hypot(d.x - preferX, (d.y - playStartYard) * 0.55);
					if (dd < bd) { bd = dd; best = d; }
				}
				if (best) used.add(best);
				return best;
			}
			const line = [...ols, ...tes].sort((a, b) => a.x - b.x);
			const hinges = line.slice(-2); // two rightmost stay — the hinge
			blockers.forEach((b) => {
				b.blockTarget = null; b.blockMode = "man"; b.pullPhase = 0; b.pullVia = null;
				b.driveSide = 1; b.levelY = 3; b.driveBlock = true; b.sturdyBlock = true; b._userCtrl = 0;
			});
			line.forEach((b, i) => {
				const rank = i;
				if (hinges.includes(b)) {
					b.blockMode = "reach";
					b.driveBlock = true;
					b.sturdyBlock = true;
					b.pullVia = null;
					b.pullPhase = 0;
					b.gapAimX = b.x + 0.8;
					b.gapAimY = playStartYard + 2.2;
					b.blockTarget = takeDef(b.x + 1.1, 14);
					b.levelY = 2.2;
					return;
				}
				b.blockMode = "pull";
				b.pullPhase = 0;
				b.pullBoost = 1 + rank * 0.06;
				const midX = snap + 2.8 + rank * 0.55;
				const midY = playStartYard - (1.1 + rank * 0.65);
				const endX = snap + (6.5 + rank * 1.55);
				const endY = playStartYard + 2.4 + rank * 0.95;
				b.pullVia = { x: midX, y: midY, x2: endX, y2: endY };
				b.pullBoost = 1.08 + rank * 0.08;
				b.blockTarget = takeDef(endX, 22);
				b.gapAimX = endX;
				b.gapAimY = endY + 1.2;
				b.levelY = 3 + rank * 0.9;
				b.driveBlock = true;
			});
			fbs.forEach((b, i) => {
				b.blockMode = "man";
				b.pullVia = null;
				b.pullPhase = 0;
				b.driveSide = -1;
				b.sealSide = -1;
				b.backsideSeal = true;
				b.driveBlock = true;
				b.sturdyBlock = true;
				b.facing = Math.PI;
				b.blockTarget = takeDef(snap - 3.4 - i * 0.8, 16);
				b.gapAimX = snap - 3.8;
				b.gapAimY = playStartYard + 1.2;
				b.levelY = 1.8;
			});
			qbs.forEach((b) => {
				b.blockMode = "man";
				b.pullVia = null;
				b.driveSide = -1;
				b.sealSide = -1;
				b.backsideSeal = true;
				b.driveBlock = true;
				b.sturdyBlock = true;
				b.facing = Math.PI;
				b.blockTarget = takeDef(snap - 2.4, 14);
				b.gapAimX = snap - 2.8;
				b.gapAimY = playStartYard + 1.1;
				b.levelY = 1.4;
			});
			return;
		}
		// Zig Zag: blockers form staggered lane matching runner path L-R-L-R-L
		if (style === "zigzag") {
			const used = new Set();
			function takeDef(preferX, maxD) {
				let best = null, bd = maxD;
				for (const d of defs) {
					if (used.has(d)) continue;
					const dd = Math.hypot(d.x - preferX, (d.y - playStartYard) * 0.55);
					if (dd < bd) { bd = dd; best = d; }
				}
				if (best) used.add(best);
				return best;
			}
			const zSign = playSideSign();
			// Path waypoints follow flipped play id / playSideSign()
			const zigs = [
				{ x: snap + zSign * -2.4, y: playStartYard + 3.2, side: -1 * zSign },
				{ x: snap + zSign * 2.6, y: playStartYard + 6.4, side: 1 * zSign },
				{ x: snap + zSign * -2.7, y: playStartYard + 9.5, side: -1 * zSign },
				{ x: snap + zSign * 2.4, y: playStartYard + 12.4, side: 1 * zSign },
				{ x: snap + zSign * -1.4, y: playStartYard + 15.0, side: -1 * zSign }
			];
			blockers.forEach((b) => {
				b.blockTarget = null; b.blockMode = "man"; b.pullPhase = 0; b.pullVia = null;
				b.driveSide = -1; b.levelY = 3; b.driveBlock = true; b.sturdyBlock = true; b._userCtrl = 0;
			});
			const line = [...ols, ...tes].sort((a, b) => a.x - b.x);
			// Pair blockers to zig points: seal outside of each bend
			line.forEach((b, i) => {
				const z = zigs[Math.min(i, zigs.length - 1)];
				const sealX = z.x + z.side * 1.35; // outside the lane
				b.blockMode = "reach";
				b.driveSide = z.side;
				b.sturdyBlock = true;
				b.driveBlock = true;
				b.levelY = (z.y - playStartYard) * 0.55;
				b.blockTarget = takeDef(sealX, 18);
				b.gapAimX = sealX;
				b.gapAimY = z.y;
			});
			fbs.forEach((b, i) => {
				const z = zigs[Math.min(1 + i, zigs.length - 1)];
				b.blockMode = "climb";
				b.driveSide = z.side;
				b.sturdyBlock = true;
				b.levelY = z.y - playStartYard;
				b.blockTarget = takeDef(z.x + z.side * 1.8, 20);
				b.gapAimX = z.x + z.side * 1.5;
				b.gapAimY = z.y + 0.5;
			});
			qbs.forEach((b) => {
				b.blockMode = "man";
				b.blockTarget = takeDef(snap + 1.5, 12);
				b.levelY = 1.2;
			});
			return;
		}
		let nPull = 0;
		if (style === "pullL" || style === "pullR") nPull = 1 + (Math.random() < .42 ? 1 : 0);
		else nPull = Math.random() < .38 ? 1 : Math.random() < .12 ? 2 : 0;
		nPull = Math.min(nPull, Math.max(0, ols.length - 1));
		const pullers = [];
		if (nPull >= 1 && ols.length) pullers.push(side < 0 ? ols[ols.length - 1] : ols[0]);
		if (nPull >= 2 && ols.length >= 3) {
			const second = side < 0 ? ols[ols.length - 2] : ols[1];
			if (!pullers.includes(second)) pullers.push(second);
		}
		const used = /* @__PURE__ */ new Set();
		function takeDef(preferX, maxD) {
			let best = null;
			let bd = maxD;
			for (const d of defs) {
				if (used.has(d)) continue;
				const dd = Math.hypot(d.x - preferX, (d.y - playStartYard) * .65);
				if (dd < bd) {
					bd = dd;
					best = d;
				}
			}
			if (best) used.add(best);
			return best;
		}
		blockers.forEach((b, i) => {
			b.blockTarget = null;
			b.blockMode = "man";
			b.pullPhase = 0;
			b.pullVia = null;
			b.driveSide = Math.sign(b.x - snap) || (i < blockers.length / 2 ? -1 : 1);
			b.levelY = 2.4 + i % 5 * .85 + Math.random() * .45;
			b._userCtrl = 0;
		});
		ols.forEach((b, i) => {
			if (pullers.includes(b)) {
				b.blockMode = "pull";
				b.pullPhase = 0;
				const behindY = playStartYard - 1.6 - Math.random() * .7;
				b.pullVia = {
					x: snap + side * .4,
					y: behindY,
					x2: snap + side * (5.5 + Math.random()),
					y2: playStartYard + 1.2
				};
				b.blockTarget = takeDef(snap + side * 7, 22);
				b.levelY = 4.2 + Math.random();
			} else {
				b.blockMode = i % 2 === 0 ? "man" : "reach";
				b.blockTarget = takeDef(b.x + b.driveSide * .8, 22);
				b.levelY = 2.1 + i * .75 + Math.random() * .4;
			}
		});
		fbs.forEach((b, i) => {
			b.blockMode = "climb";
			b.blockTarget = defs.filter((d) => d.group === "LB" && !used.has(d))[i] || takeDef(b.x + side * 2.2, 18);
			b.levelY = 5.2 + i * 1.5;
		});
		tes.forEach((b, i) => {
			b.blockMode = "reach";
			b.driveSide = Math.sign(b.x - snap) || (i % 2 === 0 ? -1 : 1);
			b.blockTarget = takeDef(b.x + b.driveSide * 1.4, 18);
			b.levelY = 3.4 + i * .8;
		});
		qbs.forEach((b) => {
			b.blockMode = "man";
			b.blockTarget = takeDef(b.x, 10);
			b.levelY = 1.2;
		});
	}


	function assignOverloadBlitzJobs(fl, fr, mid, _rnd) {
		const W = fr - fl;
		const used = new Set();
		const dts = defenders.filter((d) => d.group === "DT").sort((a, b) => a.x - b.x);
		const lbs = defenders.filter((d) => d.group === "LB").sort((a, b) => a.x - b.x);
		const dbs = defenders.filter((d) => d.group === "DB").sort((a, b) => a.x - b.x);

		function claimBlitz(d, jobX, jobY, opts) {
			opts = opts || {};
			d.job = "blitz";
			d.jobX = clamp(jobX, fl + 2.5, fr - 2.5);
			d.jobY = jobY;
			d.zoneRx = 1.2;
			d.zoneRy = 1.2;
			d.zoneFollow = false;
			d.artCurve = !!opts.curve;
			d.stutter = !!opts.stutter;
			if (d.stutter) {
				d.stutterX = clamp(opts.stutterX != null ? opts.stutterX : (d.x + jobX) / 2, fl + 3, fr - 3);
				d.stutterY = opts.stutterY != null ? opts.stutterY : playStartYard + 1.1;
				d.artCurve = true;
			}
			d.readT = 0.1 + _rnd() * 0.18;
			d.isSafety = false;
			d.isCorner = false;
			d.aggressor = true;
			used.add(d);
		}
		function claimZone(d, job, x, y, rx, ry, follow) {
			d.job = job;
			d.jobX = clamp(x, fl + 2.5, fr - 2.5);
			d.jobY = y;
			d.zoneRx = rx;
			d.zoneRy = ry;
			d.zoneFollow = !!follow || job === "drop" || job === "spy";
			d.artCurve = false;
			d.stutter = false;
			d.readT = job === "deep" ? 0.4 + _rnd() * 0.3 : 0.22 + _rnd() * 0.25;
			d.isSafety = job === "deep";
			d.isCorner = job === "curl" || job === "flat";
			d.aggressor = false;
			used.add(d);
		}

		// --- Overload LEFT ---
		// Leftmost DB: blitz down-and-in, force contain
		if (dbs[0]) {
			claimBlitz(dbs[0], mid - W * 0.08, playStartYard - 0.35, {
				curve: true,
				stutter: true,
				stutterX: dbs[0].x + W * 0.06,
				stutterY: playStartYard + 1.4
			});
		}
		// Leftmost LB: sweep into next available gap (inside the DB path)
		if (lbs[0]) {
			claimBlitz(lbs[0], mid - W * 0.04, playStartYard - 0.15, {
				curve: true,
				stutter: true,
				stutterX: lbs[0].x + W * 0.1,
				stutterY: playStartYard + 0.9
			});
		}
		// Leftmost DT: inside angle — pull OL in, open lanes for LB/DB
		if (dts[0]) {
			claimBlitz(dts[0], mid - W * 0.02, playStartYard - 0.45, {
				curve: true,
				stutter: false
			});
		}
		// Other DTs: straight-ahead blitz
		dts.slice(1).forEach((d) => {
			claimBlitz(d, d.x, playStartYard - 0.25 - _rnd() * 0.35, { curve: false });
		});
		// Middle LB (or second from left): also blitz overloaded side
		if (lbs[1]) {
			claimBlitz(lbs[1], mid - W * 0.06, playStartYard - 0.2, {
				curve: true,
				stutter: false
			});
		}
		// Any further LBs: straight / light contain-side blitz
		lbs.slice(2).forEach((d, i) => {
			claimBlitz(d, d.x - W * 0.03, playStartYard - 0.15, { curve: i === 0 });
		});

		// --- Backside / residual: ZONE (not man) ---
		const freeDbs = dbs.filter((d) => !used.has(d));
		// Nearest available DB → left curl/flat
		if (freeDbs[0]) {
			claimZone(freeDbs[0], "curl", fl + W * 0.16, playStartYard + 4.4, W * 0.13, 1.9, false);
		}
		// Next two DBs → deep halves
		if (freeDbs[1]) {
			claimZone(freeDbs[1], "deep", fl + W * 0.32, capCoverageY(playStartYard + 15), W * 0.2, 5.0, false);
		}
		if (freeDbs[2]) {
			claimZone(freeDbs[2], "deep", fr - W * 0.32, capCoverageY(playStartYard + 15), W * 0.2, 5.0, false);
		}
		// Remaining DB slots / leftover defenders: drop + curl flat right
		const rest = defenders.filter((d) => !used.has(d)).sort((a, b) => a.x - b.x);
		const zoneTail = [
			{ job: "drop", x: mid + W * 0.04, y: playStartYard + 8.0, rx: W * 0.11, ry: 2.5, follow: true },
			{ job: "curl", x: fr - W * 0.16, y: playStartYard + 4.4, rx: W * 0.13, ry: 1.9, follow: false },
			{ job: "deep", x: mid, y: capCoverageY(playStartYard + 14.5), rx: W * 0.18, ry: 4.5, follow: false },
			{ job: "flat", x: fr - W * 0.22, y: playStartYard + 3.6, rx: W * 0.12, ry: 1.5, follow: false }
		];
		rest.forEach((d, i) => {
			const slot = zoneTail[Math.min(i, zoneTail.length - 1)];
			claimZone(d, slot.job, slot.x, slot.y, slot.rx, slot.ry, slot.follow);
		});

		defenders.forEach((d, i) => {
			d.laneOffset = (i - (defenders.length - 1) / 2) * 1.7;
		});
	}



	function assignStormBlitzJobs(fl, fr, mid, _rnd) {
		// Storm Blitz: front 4 angle-right; outside contains arc; one cross blitz; deep middle + flat L/R
		const W = fr - fl;
		const used = new Set();
		const dts = defenders.filter((d) => d.group === "DT").sort((a, b) => a.x - b.x);
		const lbs = defenders.filter((d) => d.group === "LB").sort((a, b) => a.x - b.x);
		const dbs = defenders.filter((d) => d.group === "DB").sort((a, b) => a.x - b.x);

		function claimBlitz(d, jobX, jobY, opts) {
			opts = opts || {};
			d.job = "blitz";
			d.jobX = clamp(jobX, fl + 2.5, fr - 2.5);
			d.jobY = jobY;
			d.zoneRx = 1.2;
			d.zoneRy = 1.2;
			d.zoneFollow = false;
			d.artCurve = !!opts.curve;
			d.stutter = !!opts.stutter;
			if (d.stutter) {
				d.stutterX = clamp(opts.stutterX != null ? opts.stutterX : (d.x + jobX) / 2, fl + 3, fr - 3);
				d.stutterY = opts.stutterY != null ? opts.stutterY : playStartYard + 1.0;
			}
			d.readT = 0.08 + _rnd() * 0.15;
			d.isSafety = false;
			d.isCorner = false;
			d.aggressor = true;
			used.add(d);
		}
		function claimZone(d, job, x, y, rx, ry, follow) {
			d.job = job;
			d.jobX = clamp(x, fl + 2.5, fr - 2.5);
			d.jobY = y;
			d.zoneRx = rx;
			d.zoneRy = ry;
			d.zoneFollow = !!follow || job === "drop" || job === "spy";
			d.artCurve = false;
			d.stutter = false;
			d.readT = job === "deep" ? 0.45 + _rnd() * 0.3 : 0.22 + _rnd() * 0.25;
			d.isSafety = job === "deep";
			d.isCorner = job === "flat" || job === "curl";
			d.aggressor = false;
			used.add(d);
		}

		// Front 4 (DTs, pad with LBs if fewer than 4 DTs): all blitz angle RIGHT
		const front = [...dts];
		while (front.length < 4 && lbs.length) {
			const lb = lbs.find((d) => !front.includes(d) && !used.has(d));
			if (!lb) break;
			front.push(lb);
		}
		front.slice(0, 4).forEach((d, i) => {
			const angX = d.x + W * (0.06 + i * 0.015); // angle right
			claimBlitz(d, angX, playStartYard - 0.25 - _rnd() * 0.3, {
				curve: true,
				stutter: false
			});
		});

		// Outside contain: leftmost free LB/DB and rightmost free LB/DB — angled curved arc blitz
		const freeLbDb = [...lbs, ...dbs].filter((d) => !used.has(d)).sort((a, b) => a.x - b.x);
		const leftContain = freeLbDb[0];
		const rightContain = freeLbDb.length > 1 ? freeLbDb[freeLbDb.length - 1] : null;
		if (leftContain) {
			claimBlitz(leftContain, fl + W * 0.12, playStartYard - 0.1, {
				curve: true,
				stutter: true,
				stutterX: fl + W * 0.22,
				stutterY: playStartYard + 1.6
			});
			leftContain.job = "contain"; // show as contain art color while still rushing
			leftContain.zoneRx = 2.2;
			leftContain.zoneRy = 2.0;
		}
		if (rightContain && rightContain !== leftContain) {
			claimBlitz(rightContain, fr - W * 0.12, playStartYard - 0.1, {
				curve: true,
				stutter: true,
				stutterX: fr - W * 0.22,
				stutterY: playStartYard + 1.6
			});
			rightContain.job = "contain";
			rightContain.zoneRx = 2.2;
			rightContain.zoneRy = 2.0;
		}

		// Next LB/DB to the right of left contain: cross blitz between 3rd and 4th DT
		const gapX = dts.length >= 4
			? (dts[2].x + dts[3].x) / 2
			: dts.length >= 2
				? (dts[dts.length - 2].x + dts[dts.length - 1].x) / 2
				: mid + W * 0.05;
		const crossCands = [...lbs, ...dbs].filter((d) => !used.has(d)).sort((a, b) => a.x - b.x);
		// prefer one just right of left contain / mid-left
		let cross = crossCands.find((d) => d.x >= mid - W * 0.15) || crossCands[0];
		if (cross) {
			claimBlitz(cross, gapX, playStartYard - 0.35, {
				curve: true,
				stutter: true,
				stutterX: cross.x - W * 0.04,
				stutterY: playStartYard + 0.8
			});
		}

				// 4 deepest DBs: move 30% closer to LOS
		const byDepth = [...dbs].sort((a, b) => b.y - a.y);
		byDepth.slice(0, 4).forEach((d) => {
			const depth = d.y - playStartYard;
			d.y = playStartYard + depth * 0.7;
		});

		// Two free DBs/safeties: cross-blitz into adjacent gaps (no cross-field flat)
		const freeSaf = defenders.filter((d) => !used.has(d) && d.group === "DB").sort((a, b) => a.x - b.x);
		const gapA = mid - W * 0.06;
		const gapB = mid + W * 0.06;
		if (freeSaf[0] && freeSaf[1]) {
			// Cross: left safety attacks right gap, right safety attacks left gap — land one gap apart
			claimBlitz(freeSaf[0], gapB, playStartYard - 0.3, {
				curve: true, stutter: true,
				stutterX: mid, stutterY: playStartYard + 1.2
			});
			claimBlitz(freeSaf[1], gapA, playStartYard - 0.3, {
				curve: true, stutter: true,
				stutterX: mid, stutterY: playStartYard + 1.2
			});
		} else if (freeSaf[0]) {
			claimBlitz(freeSaf[0], gapA, playStartYard - 0.3, { curve: true, stutter: true });
		}

		// Coverage residual: flats on matching side only + optional deep
		const cov = defenders.filter((d) => !used.has(d)).sort((a, b) => a.x - b.x);
		const leftCov = cov.filter((d) => d.x <= mid);
		const rightCov = cov.filter((d) => d.x > mid);
		if (leftCov[0]) claimZone(leftCov[0], "flat", fl + W * 0.18, playStartYard + 4.0, W * 0.12, 1.6, false);
		if (rightCov[0]) claimZone(rightCov[0], "flat", fr - W * 0.18, playStartYard + 4.0, W * 0.12, 1.6, false);
		const rest = defenders.filter((d) => !used.has(d));
		if (rest[0]) claimZone(rest[0], "deep", mid, capCoverageY(playStartYard + 14), W * 0.2, 4.8, false);
		rest.slice(1).forEach((d, i) => {
			const side = d.x < mid ? -1 : 1;
			claimZone(d, "drop", mid + side * W * 0.1, playStartYard + 8, W * 0.1, 2.4, true);
		});

		defenders.forEach((d, i) => {
			d.laneOffset = (i - (defenders.length - 1) / 2) * 1.7;
		});
	}

	function assignJamMiddleJobs(fl, fr, mid, _rnd) {
		const W = fr - fl;
		const used = new Set();
		const dbs = defenders.filter((d) => d.group === "DB").sort((a, b) => a.x - b.x);
		const others = defenders.filter((d) => d.group !== "DB").sort((a, b) => a.x - b.x);
		// Spread DBs: wider horizontally, deeper vertically — no LOS stack
		if (dbs.length >= 2) {
			const wing = 0.36 * (1 - fieldWideT() * 0.42);
			dbs[0].x = clamp(mid - W * wing, fl + 3, mid - 3);
			dbs[dbs.length - 1].x = clamp(mid + W * wing, mid + 3, fr - 3);
		}
		dbs.forEach((d, i) => {
			const t = dbs.length <= 1 ? 0.5 : i / (dbs.length - 1);
			d.x = clamp(mid + (t - 0.5) * W * (0.72 * (1 - fieldWideT() * 0.42)), fl + 3, fr - 3);
			d.y = playStartYard + 9.5 + Math.abs(t - 0.5) * 3.5 + _rnd() * 0.6;
		});
		others.forEach((d, i) => {
			const t = others.length <= 1 ? 0.5 : i / (others.length - 1);
			d.x = clamp(mid + (t - 0.5) * W * 0.45, fl + 4, fr - 4);
			if (d.group === "DT") d.y = playStartYard + 3.2 + _rnd() * 0.5;
			else d.y = playStartYard + 5.5 + Math.abs(t - 0.5) * 1.5 + _rnd() * 0.4;
		});
		function claimZone(d, job, x, y, rx, ry, follow) {
			d.job = job;
			d.jobX = clamp(x, fl + 2.5, fr - 2.5);
			d.jobY = y;
			d.zoneRx = rx; d.zoneRy = ry;
			d.zoneFollow = !!follow || job === "drop";
			d.artCurve = false; d.stutter = false;
			d.blitzDelay = 0;
			d.readT = 0.25 + _rnd() * 0.25;
			d.isSafety = false;
			d.aggressor = false;
			// Misdirection: show as blitz first, then settle into zone
			d.fakeBlitz = true;
			d.reactT = 0.55 + _rnd() * 0.45;
			used.add(d);
		}
		function claimBlitz(d, jobX, delay, curve, cross) {
			d.job = "blitz";
			d.jobX = clamp(jobX, mid - W * 0.2, mid + W * 0.2);
			d.jobY = playStartYard - 0.2 - _rnd() * 0.3;
			d.zoneRx = 1.2; d.zoneRy = 1.2;
			d.zoneFollow = false;
			d.artCurve = !!curve || !!cross;
			d.stutter = !!cross;
			if (cross) {
				d.stutterX = mid + (d.x < mid ? W * 0.08 : -W * 0.08);
				d.stutterY = playStartYard + 1.0;
			}
			d.blitzDelay = delay || 0;
			d.readT = (delay || 0) + 0.06;
			d.aggressor = true;
			// Misdirection: show drop/coverage first, then fire
			d.fakeBlitz = true;
			d.reactT = 0.5 + _rnd() * 0.55 + (delay || 0) * 0.3;
			used.add(d);
		}
		// 2 DBs drop
		const dropDbs = dbs.slice(0, 2);
		dropDbs.forEach((d, i) => {
			claimZone(d, "drop", mid + (i === 0 ? -W * 0.1 : W * 0.1), playStartYard + 10.5, W * 0.11, 2.4, true);
		});
		// Flat each side — prefer remaining DBs then LB
		const free = [...dbs.filter((d) => !used.has(d)), ...others.filter((d) => !used.has(d))];
		const leftFlat = free.find((d) => d.x <= mid) || free[0];
		if (leftFlat) claimZone(leftFlat, "flat", mid - W * 0.28, playStartYard + 5.2, W * 0.12, 1.6, false);
		const rightFlat = free.find((d) => !used.has(d) && d.x >= mid) || free.find((d) => !used.has(d));
		if (rightFlat) claimZone(rightFlat, "flat", mid + W * 0.28, playStartYard + 5.2, W * 0.12, 1.6, false);
		// Rest: curved / crossover / delayed blitzes into pocket
		const delays = [0, 0.45, 0.75, 1.05, 0.6, 1.2, 0.3];
		const rush = defenders.filter((d) => !used.has(d)).sort((a, b) => a.x - b.x);
		rush.forEach((d, i) => {
			const t = rush.length <= 1 ? 0.5 : i / (rush.length - 1);
			const gap = mid - W * 0.14 + t * W * 0.28;
			const cross = i % 3 === 1;
			const curve = true;
			const delay = delays[i % delays.length];
			claimBlitz(d, gap, delay, curve, cross);
		});
		defenders.forEach((d, i) => { d.laneOffset = (i - (defenders.length - 1) / 2) * 1.5; });
	}

	function assignFreeFireJobs(fl, fr, mid, _rnd) {
		// Free Fire: aggressive arcing / delayed blitzes; corners tighter to LOS & hash
		const W = fr - fl;
		const used = new Set();
		const dts = defenders.filter((d) => d.group === "DT").sort((a, b) => a.x - b.x);
		const lbs = defenders.filter((d) => d.group === "LB").sort((a, b) => a.x - b.x);
		const dbs = defenders.filter((d) => d.group === "DB").sort((a, b) => a.x - b.x);
		// Pull wide DBs 5 yd closer to LOS and 5 yd toward center (pre-snap align)
		if (dbs.length >= 2) {
			const left = dbs[0], right = dbs[dbs.length - 1];
			left.x = clamp(left.x + 5, fl + 2, mid - 2);
			left.y = Math.max(playStartYard + 2.5, left.y - 5);
			right.x = clamp(right.x - 5, mid + 2, fr - 2);
			right.y = Math.max(playStartYard + 2.5, right.y - 5);
		}
		const delays = [0, 0.35, 0.6, 0.95, 1.25, 0.75, 1.05];
		function claimBlitz(d, jobX, jobY, delay, curve) {
			d.job = "blitz";
			d.jobX = clamp(jobX, fl + 2.5, fr - 2.5);
			d.jobY = jobY;
			d.zoneRx = 1.2; d.zoneRy = 1.2;
			d.zoneFollow = false;
			d.artCurve = !!curve;
			d.stutter = !!curve;
			if (curve) {
				d.stutterX = (d.x + jobX) / 2 + (_rnd() - 0.5) * 2;
				d.stutterY = playStartYard + 1.2 + _rnd();
			}
			d.blitzDelay = delay || 0;
			d.readT = (delay || 0) + 0.05;
			d.aggressor = true;
			used.add(d);
		}
		function claimZone(d, job, x, y, rx, ry, follow) {
			d.job = job;
			d.jobX = clamp(x, fl + 2.5, fr - 2.5);
			d.jobY = y;
			d.zoneRx = rx; d.zoneRy = ry;
			d.zoneFollow = !!follow || job === "drop";
			d.artCurve = false; d.stutter = false;
			d.blitzDelay = 0;
			d.readT = 0.3 + _rnd() * 0.25;
			d.isSafety = job === "deep";
			d.aggressor = false;
			used.add(d);
		}
		// Most rush with arcs; keep 1–2 deep/flat
		const pool = [...defenders].sort((a, b) => a.x - b.x);
		const coverN = Math.min(2, Math.max(1, Math.floor(pool.length * 0.2)));
		const cover = pool.filter((d) => d.group === "DB").slice(-coverN);
		if (!cover.length && pool.length) cover.push(pool[pool.length - 1]);
		cover.forEach((d, i) => {
			if (i === 0) claimZone(d, "deep", mid, playStartYard + 14, W * 0.2, 5, false);
			else claimZone(d, "flat", d.x < mid ? fl + W * 0.2 : fr - W * 0.2, playStartYard + 4, W * 0.12, 1.6, false);
		});
		let di = 0;
		const gapL = mid - W * 0.15;
		const gapR = mid + W * 0.15;
		const rushers = defenders.filter((d) => !used.has(d)).sort((a, b) => a.x - b.x);
		rushers.forEach((d, i) => {
			const t = rushers.length <= 1 ? 0.5 : i / (rushers.length - 1);
			const gap = gapL + t * (gapR - gapL);
			const delay = delays[di++ % delays.length];
			claimBlitz(d, gap + (_rnd() - 0.5) * 0.6, playStartYard - 0.3, delay, true);
		});
		const spyDb = dbs.length === 1 ? null : dbs[0];
		if (spyDb) {
			spyDb.job = "spy";
			spyDb.fakeBlitz = true;
			spyDb.artCurve = true;
			spyDb.stutter = true;
			spyDb.aggressor = false;
			spyDb.blitzDelay = 0;
			spyDb.readT = 0.42;
			spyDb.reactT = 0.48;
			spyDb.zoneFollow = false;
			spyDb.isSafety = false;
			spyDb.stutterX = spyDb.x + Math.min(2.2, Math.max(1.4, (mid - spyDb.x) * 0.22));
			spyDb.stutterY = spyDb.y - 1.1;
			spyDb.jobX = spyDb.x + Math.min(3.2, Math.max(2.0, (mid - spyDb.x) * 0.28));
			spyDb.jobY = spyDb.y + 2.1;
			spyDb.zoneRx = 1.55;
			spyDb.zoneRy = 1.45;
			spyDb.spyPhase = "fake";
			used.add(spyDb);
		}
		defenders.forEach((d, i) => { d.laneOffset = (i - (defenders.length - 1) / 2) * 1.7; });
	}

	function assignZoneBlitzJobs(fl, fr, mid, _rnd) {
		const W = fr - fl;
		const used = new Set();
		const dts = defenders.filter((d) => d.group === "DT").sort((a, b) => a.x - b.x);
		const lbs = defenders.filter((d) => d.group === "LB").sort((a, b) => a.x - b.x);
		const dbs = defenders.filter((d) => d.group === "DB").sort((a, b) => a.x - b.x);
		function claimZone(d, job, x, y, rx, ry, follow) {
			d.job = job;
			d.jobX = clamp(x, fl + 2.5, fr - 2.5);
			d.jobY = y;
			d.zoneRx = rx; d.zoneRy = ry;
			d.zoneFollow = !!follow || job === "drop";
			d.artCurve = false; d.stutter = false;
			d.blitzDelay = 0;
			d.readT = job === "deep" ? 0.4 + _rnd() * 0.3 : 0.25 + _rnd() * 0.2;
			d.isSafety = job === "deep";
			d.aggressor = false;
			used.add(d);
		}
		function claimBlitz(d, jobX) {
			d.job = "blitz";
			d.jobX = clamp(jobX, fl + 2.5, fr - 2.5);
			d.jobY = playStartYard - 0.25;
			d.zoneRx = 1.2; d.zoneRy = 1.2;
			d.zoneFollow = false;
			d.artCurve = false; // no crossover
			d.stutter = false;
			d.blitzDelay = 0;
			d.readT = 0.1 + _rnd() * 0.12;
			d.aggressor = true;
			used.add(d);
		}
		// DTs drop on opposite sides: one flat, one curl
		if (dts[0]) claimZone(dts[0], "flat", fl + W * 0.2, playStartYard + 4.0, W * 0.12, 1.7, false);
		if (dts[dts.length - 1] && dts[dts.length - 1] !== dts[0]) {
			claimZone(dts[dts.length - 1], "curl", fr - W * 0.2, playStartYard + 4.5, W * 0.13, 1.9, false);
		}
		// Extra DTs also soft drop mid if any
		dts.forEach((d) => {
			if (used.has(d)) return;
			claimZone(d, "drop", d.x, playStartYard + 7.5, W * 0.1, 2.3, true);
		});
		// Priority: 2 deep halves — 1 DB, 1 LB if available
		if (dbs[0]) claimZone(dbs[0], "deep", dbs.length === 1 ? mid : fl + W * 0.32, playStartYard + 15, dbs.length === 1 ? W * 0.22 : W * 0.18, 5, false);
		if (lbs[0]) claimZone(lbs[0], "deep", fr - W * 0.32, playStartYard + 15, W * 0.18, 5, false);
		else if (dbs[1]) claimZone(dbs[1], "deep", fr - W * 0.32, playStartYard + 15, W * 0.18, 5, false);
		// 1 DB drop
		const freeDb = dbs.find((d) => !used.has(d));
		if (freeDb) claimZone(freeDb, "drop", mid, playStartYard + 8.5, W * 0.11, 2.5, true);
		// Optional extra drop LB/DB
		const extraDrop = [...lbs, ...dbs].find((d) => !used.has(d));
		if (extraDrop && _rnd() < 0.85) claimZone(extraDrop, "drop", mid + (_rnd() - 0.5) * W * 0.1, playStartYard + 7.8, W * 0.1, 2.3, true);
		// Remaining: straight gap blitzes, unique gaps, no cross
		// Gaps stay inside the pocket (between the tackles), not outside contain
		const gaps = [];
		const nGap = 6;
		const gapL = mid - W * 0.16;
		const gapR = mid + W * 0.16;
		for (let i = 0; i < nGap; i++) gaps.push(gapL + (i / Math.max(1, nGap - 1)) * (gapR - gapL));
		let gi = 0;
		defenders.filter((d) => !used.has(d)).sort((a, b) => a.x - b.x).forEach((d) => {
			claimBlitz(d, gaps[gi++ % gaps.length]);
		});
		defenders.forEach((d, i) => { d.laneOffset = (i - (defenders.length - 1) / 2) * 1.7; });
	}

	function assignPreventJobs(fl, fr, mid, _rnd) {
		const W = fr - fl;
		const used = new Set();
		const sorted = [...defenders].sort((a, b) => a.x - b.x);
		const dbs = defenders.filter((d) => d.group === "DB").sort((a, b) => a.x - b.x);
		const nonDb = defenders.filter((d) => d.group !== "DB").sort((a, b) => a.x - b.x);

		const deepY = capCoverageY(playStartYard + 16.5);
		const quarters = [
			{ id: "q1", job: "deep", x: fl + W * 0.125, y: deepY, rx: W * 0.15, ry: 5.4 },
			{ id: "q2", job: "deep", x: fl + W * 0.375, y: deepY + 0.4, rx: W * 0.15, ry: 5.6 },
			{ id: "q3", job: "deep", x: fl + W * 0.625, y: deepY + 0.4, rx: W * 0.15, ry: 5.6 },
			{ id: "q4", job: "deep", x: fl + W * 0.875, y: deepY, rx: W * 0.15, ry: 5.4 }
		];
		// Middle two quarters prioritized when fewer than 4 available
		const midQuarters = [quarters[1], quarters[2]];
		const outerQuarters = [quarters[0], quarters[3]];

		function claim(d, slot) {
			d.job = slot.job;
			d.jobX = clamp(slot.x, fl + 2.5, fr - 2.5);
			d.jobY = slot.y;
			d.zoneRx = slot.rx;
			d.zoneRy = slot.ry;
			d.zoneFollow = !!slot.follow || slot.job === "drop" || slot.job === "spy";
			d.artCurve = false;
			d.stutter = false;
			d.isSafety = slot.job === "deep";
			d.isCorner = slot.job === "curl" || slot.job === "flat";
			d.readT = slot.job === "deep" ? 0.5 + _rnd() * 0.35 : 0.25 + _rnd() * 0.3;
			d.aggressor = slot.job === "blitz";
			used.add(d);
		}
		function freePool(preferDbFirst) {
			const a = preferDbFirst
				? [...dbs.filter((d) => !used.has(d)), ...nonDb.filter((d) => !used.has(d))]
				: [...nonDb.filter((d) => !used.has(d)), ...dbs.filter((d) => !used.has(d))];
			return a;
		}

		// Priority 1: 4 deep quarters — middle 2 filled first, then outers; DBs preferred
		const deepSlots = [];
		const n = defenders.length;
		if (n >= 4) deepSlots.push(...midQuarters, ...outerQuarters);
		else if (n === 3) deepSlots.push(...midQuarters, outerQuarters[0]);
		else if (n === 2) deepSlots.push(...midQuarters);
		else if (n === 1) deepSlots.push({ id: "qMid", job: "deep", x: mid, y: deepY, rx: W * 0.22, ry: 5.6 });

		const deepPool = freePool(true);
		deepSlots.forEach((slot, i) => {
			if (i >= deepPool.length) return;
			// Match L→R among assigned: sort chosen by x against slot x
			claim(deepPool[i], slot);
		});
		// Re-sort deep assignees L→R onto quarters L→R for cleaner art when 4 filled
		if (deepSlots.length >= 4) {
			const deepDefs = defenders.filter((d) => used.has(d) && d.job === "deep").sort((a, b) => a.x - b.x);
			deepDefs.forEach((d, i) => {
				if (quarters[i]) {
					d.jobX = quarters[i].x;
					d.jobY = quarters[i].y;
					d.zoneRx = quarters[i].rx;
					d.zoneRy = quarters[i].ry;
				}
			});
		}

		// Priority 2: curl/flat L and R (2)
		const curls = [
			{ job: "curl", x: fl + W * 0.17, y: playStartYard + 4.5, rx: W * 0.13, ry: 1.9, side: -1 },
			{ job: "curl", x: fr - W * 0.17, y: playStartYard + 4.5, rx: W * 0.13, ry: 1.9, side: 1 }
		];
		const curlPool = freePool(true);
		curls.forEach((slot) => {
			if (!curlPool.length) return;
			// pick spatially closest free
			let best = 0, bestD = 1e9;
			curlPool.forEach((d, i) => {
				if (used.has(d)) return;
				const pen = (slot.side < 0 && d.x > mid) || (slot.side > 0 && d.x < mid) ? 30 : 0;
				const dist = Math.abs(d.x - slot.x) + pen;
				if (dist < bestD) { bestD = dist; best = i; }
			});
			const d = curlPool.splice(best, 1)[0];
			if (d && !used.has(d)) claim(d, slot);
		});

		// Priority 3: drop zone (2)
		const drops = [
			{ job: "drop", x: mid - W * 0.08, y: playStartYard + 8.5, rx: W * 0.1, ry: 2.6, follow: true },
			{ job: "drop", x: mid + W * 0.08, y: playStartYard + 8.5, rx: W * 0.1, ry: 2.6, follow: true }
		];
		const dropPool = freePool(false); // LBs/DTs fine for hook drops
		drops.forEach((slot) => {
			const cand = dropPool.find((d) => !used.has(d));
			if (cand) claim(cand, slot);
		});

		// Priority 4: blitz (3) — randomized which defenders + which gaps (not always same side)
		const blitzPool = freePool(false).filter((d) => !used.has(d));
		// Shuffle with seeded rng
		for (let i = blitzPool.length - 1; i > 0; i--) {
			const j = Math.floor(_rnd() * (i + 1));
			const tmp = blitzPool[i]; blitzPool[i] = blitzPool[j]; blitzPool[j] = tmp;
		}
		const gapXs = [
			mid - W * 0.18, mid - W * 0.06, mid + W * 0.06, mid + W * 0.18,
			fl + W * 0.22, fr - W * 0.22
		];
		for (let i = gapXs.length - 1; i > 0; i--) {
			const j = Math.floor(_rnd() * (i + 1));
			const tmp = gapXs[i]; gapXs[i] = gapXs[j]; gapXs[j] = tmp;
		}
		blitzPool.slice(0, 3).forEach((d, i) => {
			let gap = gapXs[i % gapXs.length];
			if (d.group === "DB") {
				const near = gapXs.filter((x) => Math.sign(x - mid) === Math.sign(d.x - mid) || Math.abs(x - mid) < W * 0.08);
				gap = near.length ? near.reduce((a, x) => Math.abs(x - d.x) < Math.abs(a - d.x) ? x : a, near[0]) : (d.x < mid ? mid - W * 0.14 : mid + W * 0.14);
			}
			claim(d, {
				job: "blitz",
				x: gap,
				y: playStartYard - 0.2 - _rnd() * 0.4,
				rx: 1.2,
				ry: 1.2
			});
			d.artCurve = d.group === "DB" || _rnd() < 0.45;
			d.stutter = _rnd() < 0.35;
		});

		// Priority 5: any remaining → drop zone
		defenders.filter((d) => !used.has(d)).forEach((d, i) => {
			const side = i % 2 === 0 ? -1 : 1;
			claim(d, {
				job: "drop",
				x: mid + side * W * (0.12 + (i * 0.04)),
				y: playStartYard + 7.5 + (i % 3) * 0.6,
				rx: W * 0.1,
				ry: 2.4,
				follow: true
			});
		});

		defenders.forEach((d, i) => {
			d.laneOffset = (i - (defenders.length - 1) / 2) * 1.7;
		});
	}

	function assignCover4QuartersJobs(fl, fr, mid, _rnd) {
		const W = fr - fl;
		const deepY = capCoverageY(playStartYard + 15.5);
		const quarters = [
			{ id: "q1", job: "deep", x: fl + W * 0.125, y: deepY, rx: W * 0.16, ry: 5.2 },
			{ id: "q2", job: "deep", x: fl + W * 0.375, y: deepY, rx: W * 0.16, ry: 5.2 },
			{ id: "q3", job: "deep", x: fl + W * 0.625, y: deepY, rx: W * 0.16, ry: 5.2 },
			{ id: "q4", job: "deep", x: fl + W * 0.875, y: deepY, rx: W * 0.16, ry: 5.2 }
		];
		const under = [
			{ id: "curlL", job: "curl", x: fl + W * 0.18, y: playStartYard + 4.6, rx: W * 0.14, ry: 2.0, side: -1 },
			{ id: "drop", job: "drop", x: mid, y: playStartYard + 6.8, rx: W * 0.105, ry: 2.4, side: 0, follow: true },
			{ id: "curlR", job: "curl", x: fr - W * 0.18, y: playStartYard + 4.6, rx: W * 0.14, ry: 2.0, side: 1 }
		];
		const used = new Set();
		function claim(d, slot) {
			d.job = slot.job;
			d.jobX = clamp(slot.x, fl + 2.5, fr - 2.5);
			d.jobY = slot.y;
			d.zoneRx = slot.rx;
			d.zoneRy = slot.ry;
			d.zoneFollow = !!slot.follow || slot.job === "drop" || slot.job === "spy";
			d.artCurve = false;
			d.stutter = false;
			d.isSafety = slot.job === "deep";
			d.isCorner = slot.job === "curl" || slot.job === "flat";
			d.readT = slot.job === "deep" ? 0.45 + _rnd() * 0.35 : 0.25 + _rnd() * 0.3;
			// Drop defender: mild nudge toward center (halfway vs prior aggressive pull)
			if (slot.job === "drop") {
				d.x = d.x * 0.55 + mid * 0.45;
				d.y = Math.min(d.y, playStartYard + 7.2);
				d.y = Math.max(d.y, playStartYard + 5.6);
			}
			used.add(d);
		}
function remaining(group) {
			return defenders.filter((d) => !used.has(d) && (!group || d.group === group)).sort((a, b) => a.x - b.x);
		}
		function remainingAny() {
			return defenders.filter((d) => !used.has(d)).sort((a, b) => a.x - b.x);
		}
		// On this play: all DBs take zone coverage (deep / curl / drop) — never blitz.
		const dbs = remaining("DB");
		const nonDb = defenders.filter((d) => d.group !== "DB").sort((a, b) => a.x - b.x);

		// --- Priority 1: deep quarters — fill with DBs first (L→R), then other positions ---
		function pickDeepSlotList(count) {
			if (count >= 4) return quarters.slice();
			if (count === 3) {
				const meanX = (dbs.length ? dbs : nonDb).slice(0, 3).reduce((s, d) => s + d.x, 0) / Math.max(1, Math.min(3, (dbs.length || nonDb.length)));
				return meanX < mid ? [quarters[0], quarters[1], quarters[2]] : [quarters[1], quarters[2], quarters[3]];
			}
			if (count === 2) return [quarters[1], quarters[2]]; // middle two preferred
			if (count === 1) return null; // handled per-player
			return [];
		}
		// Assign DBs to deep first
		const dbDeepBudget = Math.min(4, dbs.length);
		if (dbDeepBudget === 1) {
			claim(dbs[0], { id: "qMid", job: "deep", x: mid, y: deepY, rx: W * 0.22, ry: 5.2 });
		} else if (dbDeepBudget > 0) {
			const slots = pickDeepSlotList(dbDeepBudget);
			for (let i = 0; i < dbDeepBudget; i++) claim(dbs[i], slots[i]);
		}
		// Fill remaining deep slots with non-DB (only if fewer than 4 deep filled)
		let deepFilled = [...used].filter((d) => d.job === "deep").length;
		if (deepFilled < 4) {
			const need = 4 - deepFilled;
			const open = quarters.filter((q) => ![...used].some((d) => d.job === "deep" && Math.abs(d.jobX - q.x) < 0.01));
			// Match open quarters L→R with remaining non-DB L→R
			const pool = remainingAny().filter((d) => d.group !== "DB");
			const nAssign = Math.min(need, open.length, pool.length);
			// Prefer middle quarters when only 2 total deep desired was already handled; here fill empties L→R
			for (let i = 0; i < nAssign; i++) claim(pool[i], open[i]);
			deepFilled += nAssign;
		}
		// If we still have < 2 deep and only 2 total defenders scenario already handled via DB path.

		// --- Priority 2: underneath — remaining DBs first, then LB/DT, spatial match ---
		const freeSlots = under.slice();
		function assignUnder(pool) {
			const freeDefs = pool.filter((d) => !used.has(d));
			while (freeSlots.length && freeDefs.length) {
				let best = null, bestScore = 1e9;
				for (const d of freeDefs) {
					if (used.has(d)) continue;
					for (const s of freeSlots) {
						const sidePen = (s.side < 0 && d.x > mid + W * 0.08) ? 40
							: (s.side > 0 && d.x < mid - W * 0.08) ? 40
							: (s.side === 0 ? Math.abs(d.x - mid) * 0.15 : 0);
						const dist = Math.hypot(d.x - s.x, (d.y - s.y) * 0.55) + sidePen;
						if (dist < bestScore) {
							bestScore = dist;
							best = { d, s };
						}
					}
				}
				if (!best) break;
				claim(best.d, best.s);
				freeSlots.splice(freeSlots.indexOf(best.s), 1);
				const ix = freeDefs.indexOf(best.d);
				if (ix >= 0) freeDefs.splice(ix, 1);
			}
		}
		assignUnder(remaining("DB"));
		assignUnder(remainingAny().filter((d) => d.group !== "DB"));

		// Any DB still unassigned (more DBs than 7 zone slots): put on nearest deep quarter as extra help / soft deep
		remaining("DB").forEach((d) => {
			const q = quarters.reduce((best, slot) => {
				const dist = Math.abs(d.x - slot.x);
				return !best || dist < best.dist ? { slot, dist } : best;
			}, null);
			if (q) claim(d, { ...q.slot, rx: q.slot.rx * 0.85, ry: q.slot.ry });
		});

		// --- Priority 3+: blitz — LB and DT only (no DB blitz on this play) ---
		remainingAny().filter((d) => d.group !== "DB").forEach((d) => {
			d.job = "blitz";
			const gap = Math.sign(d.x - snapX()) || 1;
			d.jobX = clamp(snapX() + gap * (d.group === "LB" ? 1.25 : 1.8), fl + 2.7, fr - 2.7);
			d.jobY = playStartYard - 0.2 - _rnd() * 0.5;
			d.zoneRx = 1.2;
			d.zoneRy = 1.2;
			d.zoneFollow = false;
			d.artCurve = d.group !== "LB";
			d.stutter = false;
			d.readT = 0.12 + _rnd() * 0.2;
			d.isSafety = false;
			d.isCorner = false;
			used.add(d);
		});
		defenders.filter((d) => d.group === "DB" && d.isCorner && d.job === "deep").forEach((d) => {
			const inward = Math.sign(mid - d.x) || 1;
			d.jobX = clamp((d.jobX != null ? d.jobX : d.x) + inward * Math.min(2.8, W * 0.06), fl + 3, fr - 3);
			d.artCurve = true;
		});

		defenders.forEach((d, i) => {
			d.laneOffset = (i - (defenders.length - 1) / 2) * 1.7;
			d.aggressor = d.job === "blitz";
		});
		const ranked = [...defenders].filter((d) => d.job === "blitz").sort((a, b) => a.y - b.y);
		ranked.slice(0, Math.min(3, ranked.length)).forEach((d) => { d.aggressor = true; });
	}


	function mirrorDefenseHorizontal() {
		const mid = (fieldLeft() + fieldRight()) / 2;
		defenders.forEach((d) => {
			d.x = mid - (d.x - mid);
			if (d.jobX != null) d.jobX = mid - (d.jobX - mid);
			if (d.stutterX != null) d.stutterX = mid - (d.stutterX - mid);
			if (d.laneOffset != null) d.laneOffset = -d.laneOffset;
		});
	}

	function assignSpinCycleJobs(fl, fr, mid, _rnd) {
		// Spin Cycle: cyclone — body paths arc CCW around a storm center (not torso spin)
		const W = fr - fl;
		const cx = mid;
		const cy = playStartYard + 8.0;
		const defs = [...defenders];
		// Keep normal front / LB / DB depths (like Grizzly / Safety Strike / Chaos) — only jobs arc
		const dts = defs.filter((d) => d.group === "DT").sort((a, b) => a.x - b.x);
		const lbs = defs.filter((d) => d.group === "LB").sort((a, b) => a.x - b.x);
		const dbs = defs.filter((d) => d.group === "DB").sort((a, b) => a.x - b.x);
		dts.forEach((d, i) => {
			const t = dts.length <= 1 ? 0.5 : i / (dts.length - 1);
			d.x = clamp(mid + (t - 0.5) * W * 0.28, fl + 4, fr - 4);
			d.y = playStartYard + 3.1 + _rnd() * 0.35;
		});
		lbs.forEach((d, i) => {
			const t = lbs.length <= 1 ? 0.5 : i / (lbs.length - 1);
			d.x = clamp(mid + (t - 0.5) * W * 0.42, fl + 4, fr - 4);
			d.y = playStartYard + 5.2 + _rnd() * 0.4;
		});
		dbs.forEach((d, i) => {
			const t = dbs.length <= 1 ? 0.5 : i / (dbs.length - 1);
			d.x = clamp(mid + (t - 0.5) * W * 0.62, fl + 3, fr - 3);
			d.y = playStartYard + 9.5 + Math.abs(t - 0.5) * 2.2 + _rnd() * 0.5;
		});
		defs.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
		const n = defs.length;
		defs.forEach((d, i) => {
			const ang0 = Math.atan2(d.y - cy, d.x - cx);
			const right = d.x >= cx;
			const deep = d.y > cy + 1.5;
			// Quadrant-flavored destinations (CCW cyclone feel)
			let job, jobX, jobY, midAng;
			if (!right && !deep) {
				// upper-left-ish → blitz down and in
				job = "blitz";
				jobX = cx - W * 0.04;
				jobY = playStartYard - 0.25;
				midAng = ang0 + 0.7;
			} else if (right && !deep) {
				// lower-right front → arc back into coverage
				job = i % 2 === 0 ? "curl" : "flat";
				jobX = cx + W * 0.22;
				jobY = playStartYard + 6.5;
				midAng = ang0 + 0.85;
			} else if (right && deep) {
				// upper right → spin left and down toward LOS
				job = "blitz";
				jobX = cx + W * 0.06;
				jobY = playStartYard - 0.15;
				midAng = ang0 + 0.95;
			} else {
				// deep left → drop / deep, continuing CCW
				job = d.group === "DB" ? "deep" : "drop";
				jobX = cx - W * 0.18;
				jobY = playStartYard + (job === "deep" ? 14 : 9);
				midAng = ang0 + 0.65;
			}
			const rad0 = Math.hypot(d.x - cx, d.y - cy);
			const midR = rad0 * 0.9;
			d.job = job;
			d.jobX = clamp(jobX, fl + 2.5, fr - 2.5);
			d.jobY = jobY;
			d.zoneRx = job === "deep" ? W * 0.16 : job === "blitz" ? 1.2 : W * 0.11;
			d.zoneRy = job === "deep" ? 4.5 : job === "blitz" ? 1.2 : 2.0;
			d.zoneFollow = job === "drop";
			d.aggressor = job === "blitz";
			d.artCurve = true;
			d.stutter = true;
			// Arc waypoint: CCW along the ring (cyclone path)
			d.stutterX = clamp(cx + Math.cos(midAng) * midR, fl + 3, fr - 3);
			d.stutterY = cy + Math.sin(midAng) * midR * 0.55;
			d.readT = 0.12 + _rnd() * 0.25;
			d.reactT = 0.2 + _rnd() * 0.25;
			d.fakeBlitz = false;
			d.spinT = 0; // no torso whirl
			d.isSafety = job === "deep";
			d.isCorner = job === "flat" || job === "curl";
			d.blitzDelay = job === "blitz" ? 0.05 + _rnd() * 0.2 : 0;
			d.laneOffset = (i - (n - 1) / 2) * 1.2;
		});
		if (dbs.length === 1 && dbs[0]) {
			const d = dbs[0];
			d.x = cx;
			d.jobX = cx;
			d.job = "deep";
			d.jobY = playStartYard + 14;
			d.isSafety = true;
			d.isCorner = false;
			d.stutter = false;
		}
	}

	function assignDefenseJobs() {
		// Practice: deterministic jobs for a given scheme + personnel so offense play changes
		// do not reshuffle defense art when the defensive call is unchanged.
		const _rnd = mulberry32(hashSeed([
					(practiceDefSchemeId || (currentScheme && currentScheme.id) || "base"),
					numDT, numLBs, numDBs, numOL, numTE, numFB,
					Math.round(playStartYard), Math.round(FIELD_WIDTH)
				].join("|")));
		const fl = fieldLeft();
		const fr = fieldRight();
		const mid = (fl + fr) / 2;
		const schemeId = (currentScheme && currentScheme.id) || (practiceDefSchemeId) || "base";
		if (schemeId === "cover4Quarters") {
			assignCover4QuartersJobs(fl, fr, mid, _rnd);
			return;
		}
		if (schemeId === "overloadBlitz") {
			assignOverloadBlitzJobs(fl, fr, mid, _rnd);
			return;
		}
		if (schemeId === "prevent") {
			assignPreventJobs(fl, fr, mid, _rnd);
			return;
		}
		if (schemeId === "stormBlitz") {
			assignStormBlitzJobs(fl, fr, mid, _rnd);
			return;
		}
		if (schemeId === "wide") {
			assignFreeFireJobs(fl, fr, mid, _rnd);
			return;
		}
		if (schemeId === "tight") {
			assignZoneBlitzJobs(fl, fr, mid, _rnd);
			return;
		}
		if (schemeId === "goalLine") {
			assignJamMiddleJobs(fl, fr, mid, _rnd);
			return;
		}
		if (schemeId === "base") {
			assignSpinCycleJobs(fl, fr, mid, _rnd);
			return;
		}
		const dbs = defenders.filter((d) => d.group === "DB").sort((a, b) => a.x - b.x);
		const lbs = defenders.filter((d) => d.group === "LB").sort((a, b) => a.x - b.x);
		const ol = blockers.filter((b) => b.group === "OL").sort((a, b) => a.x - b.x);
		const lanes = [];
		if (ol.length >= 2) {
			lanes.push(ol[0].x - 2.05);
			for (let i = 0; i < ol.length - 1; i++) {
				const ax = ol[i].x, bx = ol[i + 1].x;
				lanes.push((ax + bx) / 2);
				if (bx - ax > 2.4) lanes.push(ax + (bx - ax) * .33);
			}
			lanes.push(ol[ol.length - 1].x + 2.05);
		} else {
			const n = Math.max(6, defenders.length + 1);
			for (let i = 0; i < n; i++) lanes.push(fl + 3.1 + i / Math.max(1, n - 1) * (fr - fl - 6.2));
		}
		const usedLane = new Set();
		function takeLane(preferX) {
			let best = -1, bestD = 1e9;
			for (let i = 0; i < lanes.length; i++) {
				if (usedLane.has(i)) continue;
				const dd = Math.abs(lanes[i] - preferX);
				if (dd < bestD) {
					bestD = dd;
					best = i;
				}
			}
			if (best < 0) {
				let fx = preferX, far = -1;
				for (let i = 0; i < lanes.length; i++) {
					let minE = 1e9;
					defenders.forEach((d) => {
						if (d.job === "blitz" && d.jobX != null) minE = Math.min(minE, Math.abs(d.jobX - lanes[i]));
					});
					if (minE > far) {
						far = minE;
						fx = lanes[i];
					}
				}
				return clamp(fx, fl + 2.7, fr - 2.7);
			}
			usedLane.add(best);
			return clamp(lanes[best], fl + 2.7, fr - 2.7);
		}
		function setBlitz(d, preferX, opts) {
			opts = opts || {};
			d.job = "blitz";
			d.jobX = takeLane(preferX != null ? preferX : d.x);
			d.jobY = playStartYard - .25 - _rnd() * .85;
			d.artCurve = opts.curve != null ? opts.curve : _rnd() < .42;
			d.stutter = !!opts.stutter;
			if (d.stutter) {
				const swing = opts.swing != null ? opts.swing : d.x < mid ? 1.7 : -1.7;
				d.stutterX = clamp((d.x + d.jobX) / 2 + swing, fl + 3.4, fr - 3.4);
				d.stutterY = playStartYard + 1.05 + _rnd() * 1.2;
				d.artCurve = true;
			}
		}
		defenders.filter((d) => d.group === "DT").forEach((d, i) => {
			d.readT = .12 + _rnd() * .28;
			setBlitz(d, d.x + (i % 2 === 0 ? -.4 : .4), { curve: _rnd() < .3, stutter: false });
		});
		let corners = [];
		let safeties = [];
		if (dbs.length <= 2) {
			safeties = dbs.slice();
		} else {
			corners = [dbs[0], dbs[dbs.length - 1]];
			safeties = dbs.slice(1, -1);
		}
		function zoneFor(d, kind, x, y, rx, ry, follow) {
			d.job = kind;
			d.jobX = clamp(x, fl + 3, fr - 3);
			d.jobY = y;
			d.zoneRx = rx;
			d.zoneRy = ry;
			d.artCurve = false;
			d.stutter = false;
			// drop / spy zones track the defender; most others are fixed field points
			d.zoneFollow = !!follow || kind === "drop" || kind === "spy";
		}
		corners.forEach((d) => {
			d.isCorner = true;
			d.isSafety = false;
			d.readT = .35 + _rnd() * .55;
			const side = d.x < mid ? -1 : 1;
			const r = _rnd();
			if (r < .22) d.job = "blitz";
			else if (r < .28) d.job = "man";
			else if (r < .42) d.job = "deep";
			else if (r < .62) d.job = "flat";
			else d.job = "contain";
			if (d.job === "contain") zoneFor(d, "contain", side < 0 ? fl + FIELD_WIDTH * .16 : fr - FIELD_WIDTH * .16, playStartYard + 5 + _rnd() * 2, 2.4, 2.8);
			else if (d.job === "deep") zoneFor(d, "deep", side < 0 ? fl + FIELD_WIDTH * .24 : fr - FIELD_WIDTH * .24, capCoverageY(playStartYard + 12 + _rnd() * 4), 6.4, 5);
			else if (d.job === "flat") zoneFor(d, "flat", side < 0 ? fl + FIELD_WIDTH * .2 : fr - FIELD_WIDTH * .2, playStartYard + 3.2 + _rnd(), 5.4, 1.32);
			else if (d.job === "man") {
				const sorted = [...blockers].sort((a, b) => a.x - b.x);
				const t = side < 0 ? sorted[0] : sorted[sorted.length - 1];
				d.manIdx = t ? blockers.indexOf(t) : -1;
				d.jobX = d.x;
				d.jobY = playStartYard + 6;
			} else setBlitz(d, d.x - side * 2.4, {
				curve: _rnd() < .55,
				stutter: _rnd() < .4,
				swing: side * 1.8
			});
		});
		if (corners.length >= 2 && corners.every((c) => c.job === "blitz")) {
			const keep = corners[1];
			zoneFor(keep, "flat", keep.x < mid ? fl + FIELD_WIDTH * .1 : fr - FIELD_WIDTH * .1, playStartYard + 4.2, 5.2, 1.3);
		}
		safeties.forEach((d) => {
			d.isSafety = true;
			d.isCorner = false;
			d.readT = .4 + _rnd() * .65;
		});
		const shells = ["cover2", "cover3", "cover4", "tampa2", "cover6", "palms"];
		const shell = shells[Math.floor(_rnd() * shells.length)];
		function deepAt(d, x, y, rx, ry, job) {
			zoneFor(d, job || "deep", x, capCoverageY(y), rx, ry);
			if (job === "deep" || job === "robber") d.isSafety = true;
		}
		const poolDb = [...safeties, ...corners.filter((c) => c.job !== "contain")];
		if (dbs.length === 1 && dbs[0]) {
			deepAt(dbs[0], mid, playStartYard + 14.8, 7.4, 5.6, "deep");
			dbs[0].x = mid;
			dbs[0].jobX = mid;
		} else if (shell === "cover2") {
			const two = (safeties.length >= 2 ? safeties : poolDb).slice(0, 2);
			two.forEach((d, i) => deepAt(d, mid + (i === 0 ? -1 : 1) * FIELD_WIDTH * .2, playStartYard + 14.5 + _rnd() * 2.4, 8.4, 5.2, "deep"));
		} else if (shell === "cover3") {
			const midS = safeties[0] || poolDb[0];
			if (midS) deepAt(midS, mid, playStartYard + 15.5 + _rnd() * 2, 6.2, 5.6, "deep");
			const wings = corners.filter((c) => c !== midS).slice(0, 2);
			wings.forEach((d, i) => deepAt(d, mid + (i === 0 ? -1 : 1) * FIELD_WIDTH * .22, playStartYard + 13 + _rnd() * 2, 5.4, 4.6, "deep"));
		} else if (shell === "cover4") {
			const four = poolDb.slice(0, Math.min(4, poolDb.length));
			four.forEach((d, i) => {
				const t = four.length <= 1 ? .5 : i / (four.length - 1);
				deepAt(d, fl + 3.6 + t * (fr - fl - 7.2), playStartYard + 16 + (i % 2) * 2.8, 4.6, 4.5, "deep");
			});
		} else if (shell === "cover6") {
			const half = safeties[0] || poolDb[0];
			if (half) deepAt(half, mid + FIELD_WIDTH * .16, playStartYard + 15, 7.6, 5.1, "deep");
			const qs = poolDb.filter((d) => d !== half).slice(0, 2);
			qs.forEach((d, i) => deepAt(d, mid - FIELD_WIDTH * (.08 + i * .16), playStartYard + 16.5, 4.4, 4.4, "deep"));
		} else if (shell === "palms") {
			const midS = safeties[0] || poolDb[0];
			if (midS) deepAt(midS, mid, playStartYard + 14.2, 5.5, 5.8, "robber");
			corners.forEach((d, i) => {
				if (d === midS) return;
				const side = d.x < mid ? -1 : 1;
				deepAt(d, side < 0 ? fl + FIELD_WIDTH * .18 : fr - FIELD_WIDTH * .18, playStartYard + 11.5 + _rnd() * 1.8, 6.2, 2.2, "curl");
			});
		} else {
			const two = (safeties.length >= 2 ? safeties : poolDb).slice(0, 2);
			two.forEach((d, i) => deepAt(d, mid + (i === 0 ? -1 : 1) * FIELD_WIDTH * .2, playStartYard + 15.5, 8, 5, "deep"));
		}
		safeties.forEach((d, i) => {
			if (d.job === "deep" || d.job === "robber" || d.job === "curl") return;
			const side = i % 2 === 0 ? -1 : 1;
			deepAt(d, mid + side * FIELD_WIDTH * .14, playStartYard + 13 + i * 3, 6.4, 5, "deep");
		});
		lbs.forEach((d, i) => {
			d.readT = .3 + _rnd() * .5;
			if (shell === "tampa2" && i === Math.floor(lbs.length / 2)) {
				zoneFor(d, "hook", mid, playStartYard + 11.2 + _rnd(), 3.5, 3.3);
				return;
			}
			const r = _rnd();
			if (r < .38) {
				const cross = lbs.length >= 2 && _rnd() < .5;
				setBlitz(d, cross ? lbs[(i + 1) % lbs.length].x : d.x, {
					curve: true,
					stutter: cross || _rnd() < .28,
					swing: (i % 2 === 0 ? 1 : -1) * (1.5 + _rnd())
				});
				if (_rnd() < .2) {
					d.fakeBlitz = true;
					d.reactT = .45 + _rnd() * .35;
				}
			} else if (r < .5) {
				d.job = "man";
				const fbs = blockers.filter((b) => b.group === "FB");
				const ols = blockers.filter((b) => b.group === "OL");
				const pool = fbs.length ? fbs : ols.length ? ols : blockers;
				const t = pool.length ? pool[i % pool.length] : null;
				d.manIdx = t ? blockers.indexOf(t) : -1;
				d.jobX = t ? t.x : d.x;
				d.jobY = playStartYard + 3;
				d.artCurve = lbs.length >= 2 && _rnd() < .4;
			} else if (r < .72) {
				const depth = 4.6 + i * 2.1 + _rnd() * 1.4;
				zoneFor(d, "drop", mid + (i - (lbs.length - 1) / 2) * Math.max(5.4, FIELD_WIDTH * .12), playStartYard + depth, 2.6, 2.4);
			} else if (r < .88) {
				zoneFor(d, "hook", mid + (i - (lbs.length - 1) / 2) * Math.max(4.6, FIELD_WIDTH * .1) + (_rnd() - .5) * 1.4, playStartYard + 8.2 + _rnd() * 2.4, 3.2, 3);
			} else zoneFor(d, "flat", d.x < mid ? fl + FIELD_WIDTH * .2 : fr - FIELD_WIDTH * .2, playStartYard + 3.6, 5.2, 1.28);
		});
		// Deep coverage: either one deep-middle OR left+right deep DBs
		{
			const midX = (fieldLeft() + fieldRight()) / 2;
			const fl = fieldLeft(), fr = fieldRight();
			const deeps = defenders.filter((d) => d.job === "deep" || d.job === "robber");
			const hasDeepMid = deeps.some((d) => Math.abs((d.jobX != null ? d.jobX : d.x) - midX) < FIELD_WIDTH * .22);
			const hasLeftDeep = deeps.some((d) => (d.jobX != null ? d.jobX : d.x) < midX - FIELD_WIDTH * .1);
			const hasRightDeep = deeps.some((d) => (d.jobX != null ? d.jobX : d.x) > midX + FIELD_WIDTH * .1);
			const dualDeep = hasLeftDeep && hasRightDeep;
			if (!hasDeepMid && !dualDeep && defenders.length) {
				const dbs = defenders.filter((d) => d.group === "DB");
				if (dbs.length >= 2 && _rnd() < 0.55) {
					// Dual deep halves
					const left = dbs.slice().sort((a, b) => a.x - b.x)[0];
					const right = dbs.slice().sort((a, b) => b.x - a.x)[0];
					[left, right].forEach((d, i) => {
						const side = i === 0 ? -1 : 1;
						d.job = "deep";
						d.jobX = midX + side * FIELD_WIDTH * 0.18;
						d.jobY = capCoverageY(playStartYard + 12 + _rnd() * 4);
						d.zoneRx = 6.4;
						d.zoneRy = 5.2;
						d.isSafety = true;
						d.artCurve = false;
					});
				} else {
					const cands = defenders.filter((d) => d.job !== "blitz" || d.group === "DT").sort((a, b) => {
						const da = Math.abs(a.x - midX) + (a.group === "DB" ? 0 : a.group === "LB" ? 1 : 2);
						const db = Math.abs(b.x - midX) + (b.group === "DB" ? 0 : b.group === "LB" ? 1 : 2);
						return da - db;
					});
					const pick = cands[0] || defenders[0];
					pick.job = "deep";
					pick.jobX = midX + (_rnd() - .5) * 2.2;
					pick.jobY = capCoverageY(playStartYard + 11 + _rnd() * 3);
					pick.zoneRx = 7.2;
					pick.zoneRy = 5.5;
					pick.isSafety = pick.group === "DB";
					pick.artCurve = false;
				}
			}
		}
		const blitzCount = defenders.filter((d) => d.job === "blitz").length;
		const need = Math.ceil(defenders.length * .3);
		if (blitzCount < need) {
			const candidates = defenders.filter((d) => d.job !== "blitz" && d.job !== "deep" && d.job !== "curl" && d.job !== "robber" && d.job !== "hook" && !d.isSafety).sort(() => _rnd() - .5);
			for (let i = 0; i < need - blitzCount && i < candidates.length; i++) {
				const d = candidates[i];
				if (d.job === "contain" && defenders.filter((x) => x.job === "contain").length <= 1) continue;
				setBlitz(d, d.x, {
					curve: _rnd() < .5,
					stutter: _rnd() < .28
				});
			}
		}
		function countJob(k) {
			return defenders.filter((d) => d.job === k).length;
		}
		const wantDeep = dbs.length >= 3 ? 2 : dbs.length >= 1 ? 1 : 0;
		if (countJob("deep") + countJob("robber") < wantDeep && dbs.length) {
			const cands = dbs.filter((d) => d.job !== "deep" && d.job !== "robber").sort((a, b) => b.y - a.y);
			cands.forEach((d, i) => {
				if (countJob("deep") + countJob("robber") >= wantDeep) return;
				const side = i % 2 === 0 ? -1 : 1;
				const depth = countJob("deep") === 0 ? 13.5 : 18;
				zoneFor(d, "deep", mid + side * FIELD_WIDTH * .14, capCoverageY(playStartYard + depth), 6.6, 5);
				d.isSafety = true;
			});
		}
		if (countJob("contain") < 2 && corners.length) {
			const cands = corners.filter((d) => d.job !== "contain" && d.job !== "deep").sort((a, b) => a.x - b.x);
			if (cands[0]) zoneFor(cands[0], "contain", fl + FIELD_WIDTH * .16, playStartYard + 5.2, 2.4, 2.8);
			if (cands[cands.length - 1] && cands[cands.length - 1] !== cands[0]) zoneFor(cands[cands.length - 1], "contain", fr - FIELD_WIDTH * .16, playStartYard + 5.2, 2.4, 2.8);
		}
		if (_rnd() < .32 && blockers.length && defenders.length) {
			const victim = defenders[Math.floor(_rnd() * defenders.length)];
			victim.misfireT = 1.8 + _rnd() * 1.4;
			victim.misfireIdx = Math.floor(_rnd() * blockers.length);
		}
		const ranked = [...defenders].sort((a, b) => {
			const as = a.job === "blitz" ? 0 : 1;
			const bs = b.job === "blitz" ? 0 : 1;
			if (as !== bs) return as - bs;
			return a.y - b.y;
		});
		const nAgg = defenders.length <= 3 ? 2 : 3;
		ranked.slice(0, nAgg).forEach((d) => {
			d.aggressor = true;
		});
		defenders.forEach((d, i) => {
			d.laneOffset = (i - (defenders.length - 1) / 2) * 1.7;
		});
		for (let pass = 0; pass < 3; pass++) {
			for (let i = 0; i < defenders.length; i++) {
				for (let j = i + 1; j < defenders.length; j++) {
					const a = defenders[i], b = defenders[j];
					if (a.jobX == null || b.jobX == null) continue;
					const dx = b.jobX - a.jobX, dy = (b.jobY || 0) - (a.jobY || 0);
					const dd = Math.hypot(dx, dy);
					if (dd < 2.15 && dd > .01) {
						const push = (2.15 - dd) * .52;
						const ang = Math.atan2(dy, dx);
						a.jobX = clamp(a.jobX - Math.cos(ang) * push, fl + 2.7, fr - 2.7);
						b.jobX = clamp(b.jobX + Math.cos(ang) * push, fl + 2.7, fr - 2.7);
						if (Math.abs(dy) < .8) {
							a.jobY = (a.jobY || playStartYard) - .45;
							b.jobY = (b.jobY || playStartYard) + .45;
						}
					}
				}
			}
		}
		const xs = defenders.map((d) => d.jobX != null ? d.jobX : d.x);
		const span = Math.max(...xs) - Math.min(...xs);
		if (span < FIELD_WIDTH * .34 && defenders.length >= 3) {
			defenders.forEach((d, i) => {
				const t = defenders.length <= 1 ? .5 : i / (defenders.length - 1);
				d.jobX = fl + 3.2 + t * (fr - fl - 6.4);
			});
		}
	}
	function radialDeadzone(x, y, dz = .18) {
		const m = Math.hypot(x, y);
		if (m < dz) return {
			x: 0,
			y: 0
		};
		const scale = (m - dz) / (1 - dz) / m;
		return {
			x: x * scale,
			y: y * scale
		};
	}
	function isT9Family(gp) {
		return !!(gp && T9_ID_RE.test(gp.id || ""));
	}
	function isT9Raw(gp) {
		// T-9 v1 / T-3 DirectInput: browser did not remap to the standard layout.
		return !!(gp && gp.mapping !== "standard" && isT9Family(gp));
	}
	function t9HatDpad(gp) {
		const hat = gp.axes[9] ?? 3.29;
		const targets = [
			{v: -1.00, u:1, d:0, l:0, r:0},
			{v:  1.00, u:1, d:0, l:1, r:0},
			{v: -0.71, u:1, d:0, l:0, r:1},
			{v:  0.71, u:0, d:0, l:1, r:0},
			{v:  0.43, u:0, d:1, l:1, r:0},
			{v:  0.14, u:0, d:1, l:0, r:0},
			{v: -0.14, u:0, d:1, l:0, r:1},
			{v: -0.43, u:0, d:0, l:0, r:1}
		];
		let best = null, bestDist = 0.35;
		if (hat < 2.5) {
			for (const t of targets) {
				const dist = Math.abs(hat - t.v);
				if (dist < bestDist) {
					bestDist = dist;
					best = t;
				}
			}
		}
		return best
			? { u: !!best.u, d: !!best.d, l: !!best.l, r: !!best.r }
			: { u: false, d: false, l: false, r: false };
	}
	function t9RightStickY(gp) {
		const mag = (v) => (v != null && Math.abs(v) <= 1.05 ? Math.abs(v) : 0);
		const a3 = gp.axes[3];
		const a5 = gp.axes[5];
		const m3 = mag(a3);
		const m5 = mag(a5);
		if (m5 > 0.28 && m5 > m3 + 0.08) t9RyAxis = 5;
		else if (m3 > 0.28 && m3 > m5 + 0.08) t9RyAxis = 3;
		const y = t9RyAxis === 3 ? (a3 || 0) : (a5 || 0);
		return Math.abs(y) <= 1.05 ? y : 0;
	}
	function padTeammate() {
		return padProfile === "v3" || padProfile === "v4" || padProfile === "v6";
	}
	function classifyDpad(b) {
		const n = (b.u ? 1 : 0) + (b.d ? 1 : 0) + (b.l ? 1 : 0) + (b.r ? 1 : 0);
		if (n === 0 || n >= 3) return null;
		if (b.u && b.d) return null;
		if (b.l && b.r) return null;
		if (padProfile === "v4" || padProfile === "v6") {
			if (b.u && b.l) return inGoal() ? "hurdleL" : "stiffL";
			if (b.u && b.r) return inGoal() ? "hurdleR" : "stiffR";
			if (b.d && b.l) return "deadlegL";
			if (b.d && b.r) return "deadlegR";
			if (b.u) return "hurdle";
			if (b.d) return "deadleg";
			if (b.l) return "shakeL";
			if (b.r) return "shakeR";
			return null;
		}
		if (padProfile === "v3") {
			if (b.u && b.l) return inGoal() ? "truckL" : "stiffL";
			if (b.u && b.r) return inGoal() ? "truckR" : "stiffR";
			if (b.d && b.l) return "deadlegL";
			if (b.d && b.r) return "deadlegR";
			if (b.u) return "truck";
			if (b.d) return "deadleg";
			if (b.l) return "shakeL";
			if (b.r) return "shakeR";
			return null;
		}
		if (b.u && b.l) return "hurdleL";
		if (b.u && b.r) return "hurdleR";
		if (b.d && b.l) return "deadlegL";
		if (b.d && b.r) return "deadlegR";
		if (b.u) return "hurdle";
		if (b.d) return "deadleg";
		if (b.l) return "shakeL";
		if (b.r) return "shakeR";
		return null;
	}
	function getInput(dt) {
		let dx = 0;
		let dy = 0;
		let rsY = 0;
		let sprint = false;
		let spin = false;
		let dive = false;
		let truck = false;
		let jukeL = false;
		let jukeR = false;
		let wrapL = false;
		let wrapR = false;
		let strafe = false;
		let stiffL = false;
		let stiffR = false;
		let hurdle = false;
		let celebrate = false;
		let pausePress = false;
		let confirm = false;
		let padLive = false;
		let peek = false;
		let replayPress = false;
		let zoomIn = false;
		let zoomOut = false;
		let slowBack = false;
		let slowFwd = false;
		let fastBack = false;
		let fastFwd = false;
		let camRotate = false;
		let stickX = 0;
		let stickY = 0;
		let rsX = 0;
		let rsCamY = 0;
		let ctrlL = false;
		let ctrlR = false;
		let blockLdx = 0, blockLdy = 0, blockRdx = 0, blockRdy = 0;
		dpadMove = null;
		autoRun = false;
		const typing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLSelectElement;
		if (!typing) {
			if (keys.has("ArrowLeft") || keys.has("KeyA")) dx -= 1;
			if (keys.has("ArrowRight") || keys.has("KeyD")) dx += 1;
			if (keys.has("ArrowUp") || keys.has("KeyW")) dy += 1;
			if (keys.has("ArrowDown") || keys.has("KeyS")) dy -= 1;
			if (keys.has("Space")) sprint = true;
			if (!(fullReplay || camAdjust) && keys.has("KeyF")) spin = true;
			if (!(fullReplay || camAdjust) && keys.has("KeyC")) dive = true;
			if (padProfile === "v4" || padProfile === "v6") {
				if (keys.has("KeyV") || keys.has("KeyY")) truck = true;
			} else if (padProfile === "v3") {
				if (keys.has("KeyV") || keys.has("KeyY")) hurdle = true;
			} else if (keys.has("KeyV") || keys.has("KeyY")) truck = true;
			if (keys.has("KeyQ")) {
				if (playingDefense()) wrapL = true;
				else jukeL = true;
			}
			if (keys.has("KeyE")) {
				if (playingDefense()) wrapR = true;
				else jukeR = true;
			}
			if (playingDefense() && (keys.has("ShiftLeft") || keys.has("ShiftRight"))) strafe = true;
			if (keys.has("KeyH")) peek = true;
			if (keys.has("KeyR")) replayPress = true;
			if (keys.has("Equal") || keys.has("NumpadAdd")) zoomIn = true;
			if (keys.has("Minus") || keys.has("NumpadSubtract")) zoomOut = true;
			if (fullReplay || camAdjust) {
				if (keys.has("KeyC") || keys.has("KeyX")) zoomIn = true;
				if (keys.has("KeyF") || keys.has("KeyB")) zoomOut = true;
			}
			if (keys.has("KeyQ")) slowBack = true;
			if (keys.has("KeyE")) slowFwd = true;
			if (keys.has("KeyZ")) fastBack = true;
			if (keys.has("KeyX")) fastFwd = true;
			if (keys.has("KeyV") || keys.has("KeyY")) camRotate = true;
			if (padTeammate()) {
				if (keys.has("KeyZ")) ctrlL = true;
				if (keys.has("KeyX")) ctrlR = true;
				if (keys.has("Comma") || keys.has("KeyN")) dpadMove = dpadMove || "shakeL";
				if (keys.has("Period") || keys.has("KeyM")) dpadMove = dpadMove || "shakeR";
			} else {
				if (keys.has("KeyZ")) stiffL = true;
				if (keys.has("KeyX")) stiffR = true;
			}
			if (keys.has("KeyG") && padProfile !== "v6") celebrate = true;
			if (keys.has("KeyP") || keys.has("Escape")) pausePress = true;
			if (keys.has("Enter")) confirm = true;
			if (playingDefense() && playActive && !practiceAwaitSnap && !fullReplay && !camAdjust) {
				const krsX = (keys.has("KeyL") ? 1 : 0) - (keys.has("KeyJ") ? 1 : 0);
				const krsY = (keys.has("KeyI") ? 1 : 0) - (keys.has("KeyK") ? 1 : 0);
				if (Math.hypot(krsX, krsY) > 0.2) {
					rsX = krsX;
					rsCamY = krsY;
				}
				if (keys.has("KeyT") && userDefender && rb) {
					rsX = rb.x - userDefender.x;
					rsCamY = rb.y - userDefender.y;
				}
			}
		}
		if (touch.active) {
			dx += touch.dx;
			dy += touch.dy;
			if (touch.burst) sprint = true;
		}
		const pads = navigator.getGamepads ? navigator.getGamepads() : [];
		let gp = null;
		let fallback = null;
		for (let i = 0; i < pads.length; i++) {
			const p = pads[i];
			if (!p || p.connected === false) continue;
			if (!fallback) fallback = p;
			let live = false;
			for (let b = 0; b < p.buttons.length; b++) {
				const gb = p.buttons[b];
				if (gb && (gb.pressed || gb.value > .25)) {
					live = true;
					break;
				}
			}
			if (!live) {
				for (let a = 0; a < p.axes.length; a++) if (Math.abs(p.axes[a] || 0) > .2) {
					live = true;
					break;
				}
			}
			if (live) {
				gp = p;
				break;
			}
		}
		if (!gp && fallback) {
			gp = fallback;
			fallback.index;
		}
		if (!gp);

		// T-9 / T-3: v1 is raw DirectInput (gapped buttons, hat on axis 9, RS Y on 5 or 3).
		// v2 is standard-mapping — already remapped by the browser; do not remap again.
		const t9Raw = isT9Raw(gp);
		const t9Fam = isT9Family(gp);
		padT9 = t9Raw ? "v1" : (t9Fam ? "v2" : "");
		const btn = (i) => {
			if (!gp) return false;
			const idx = t9Raw ? (T9_BTN_MAP[i] !== undefined ? T9_BTN_MAP[i] : -1) : i;
			if (idx < 0 || !gp.buttons[idx]) return false;
			const b = gp.buttons[idx];
			return !!(b.pressed || b.value > .4);
		};
		const kbDpad = {
			u: !typing && keys.has("KeyI"),
			d: !typing && keys.has("KeyK"),
			l: !typing && keys.has("KeyJ"),
			r: !typing && keys.has("KeyL")
		};
		let gpDpad = {
			u: btn(12),
			d: btn(13),
			l: btn(14),
			r: btn(15)
		};
		if (t9Raw && gp) gpDpad = t9HatDpad(gp);
		const bits = {
			u: kbDpad.u || gpDpad.u,
			d: kbDpad.d || gpDpad.d,
			l: kbDpad.l || gpDpad.l,
			r: kbDpad.r || gpDpad.r
		};
		const anyD = bits.u || bits.d || bits.l || bits.r;
		if (dpadLatch) {
			if (!anyD) dpadLatch = false;
		} else if (anyD) {
			if (!dpadPending) {
				dpadPending = { ...bits };
				dpadPendingT = 0;
			} else {
				dpadPending = {
					u: dpadPending.u || bits.u,
					d: dpadPending.d || bits.d,
					l: dpadPending.l || bits.l,
					r: dpadPending.r || bits.r
				};
				dpadPendingT += dt;
				if ((dpadPending.u ? 1 : 0) + (dpadPending.d ? 1 : 0) + (dpadPending.l ? 1 : 0) + (dpadPending.r ? 1 : 0) >= 2 || dpadPendingT >= DPAD_DIAG_WIN) {
					dpadMove = (padProfile === "basic" || swapStickDpad) ? null : classifyDpad(dpadPending);
					dpadLatch = true;
					dpadPending = null;
				}
			}
		} else if (dpadPending) {
			dpadPendingT += dt;
			if (dpadPendingT >= DPAD_DIAG_WIN) {
				dpadMove = (padProfile === "basic" || swapStickDpad) ? null : classifyDpad(dpadPending);
				dpadLatch = true;
				dpadPending = null;
			}
		}
		if (gp) {
			padLive = true;
			padName = gp.id || "Xbox";
			const st = radialDeadzone(gp.axes[0] || 0, -(gp.axes[1] || 0), .18);
			const rst = t9Raw
				? radialDeadzone(gp.axes[2] || 0, -t9RightStickY(gp), .22)
				: radialDeadzone(gp.axes[2] || 0, -(gp.axes[3] || 0), .22);
			rsY = rst.y;
			rsX = rst.x;
			rsCamY = rst.y;
			stickX = st.x;
			stickY = st.y;
			const lt = t9Raw
				? (gp.buttons[8] && gp.buttons[8].value || 0)
				: (gp.buttons[6] && gp.buttons[6].value || 0);
			const rt = t9Raw
				? (gp.buttons[9] && gp.buttons[9].value || 0)
				: (gp.buttons[7] && gp.buttons[7].value || 0);
			if (padTeammate()) {
				ctrlL = ctrlL || lt > .52;
				ctrlR = ctrlR || rt > .52;
			}
			if (playingDefense() && !fullReplay && !camAdjust) {
				wrapL = wrapL || lt > .42;
				wrapR = wrapR || rt > .42;
			}
			// Stick ↔ D-pad swap support
			const stickMove = (st.x !== 0 || st.y !== 0);
			const dpadDigital = {
				x: (bits.r ? 1 : 0) - (bits.l ? 1 : 0),
				y: (bits.u ? 1 : 0) - (bits.d ? 1 : 0)
			};
			const dpadMag = Math.hypot(dpadDigital.x, dpadDigital.y);
			if (dpadMag > 1) { dpadDigital.x /= dpadMag; dpadDigital.y /= dpadMag; }

			if (swapStickDpad) {
				// Physical D-pad → continuous movement, physical left stick → specials
				if (dpadMag > 0.1) {
					dx = dpadDigital.x;
					dy = dpadDigital.y;
					autoRun = false;
					if (!playingDefense() && padProfile === "v3") {
						if (ctrlL) { blockLdx = dx; blockLdy = dy; }
						if (ctrlR) { blockRdx = dx; blockRdy = dy; }
					}
				} else if (padTeammate() && (ctrlL || ctrlR)) autoRun = true;
				else autoRun = false;
				// Classify left stick into specials
				if (!ctrlR) {
					if (st.x < -.55) dpadMove = dpadMove || "shakeL";
					if (st.x > .55) dpadMove = dpadMove || "shakeR";
					if (st.y > .65) dpadMove = dpadMove || "hurdle";
					if (st.y < -.65) dpadMove = dpadMove || "deadleg";
				}
			} else {
				// Normal: left stick → continuous movement, D-pad → specials
				if (stickMove) {
					dx = st.x;
					dy = st.y;
					autoRun = false;
					// Wings (v3): one stick drives the runner and selected teammates.
					if (!playingDefense() && padProfile === "v3") {
						if (ctrlL) { blockLdx = st.x; blockLdy = st.y; }
						if (ctrlR) {
							if (ctrlL && Math.hypot(rst.x, rst.y) >= .14) {
								blockRdx = rst.x;
								blockRdy = rst.y;
							} else {
								blockRdx = st.x;
								blockRdy = st.y;
							}
						}
					}
				} else if (padTeammate() && (ctrlL || ctrlR)) autoRun = true;
				else autoRun = false;
				// Independent/Classic: right stick steers teammates (see main loop).
				// Wings: RS specials still available when RT is not held.
				if (padProfile === "v3" && !ctrlR) {
					if (rst.x < -.55) dpadMove = dpadMove || "shakeL";
					if (rst.x > .55) dpadMove = dpadMove || "shakeR";
					if (rst.y > .65) dpadMove = dpadMove || "hurdle";
					if (rst.y < -.65) dpadMove = dpadMove || "deadleg";
				}
			}
			if (btn(0)) sprint = true;
			if (fullReplay || camAdjust) {
				if (btn(2)) zoomIn = true;
				if (btn(1)) zoomOut = true;
			} else {
				if (btn(1)) spin = true;
				if (btn(2)) dive = true;
			}
			if (btn(3)) {
				if (padProfile === "v3") hurdle = true;
				else truck = true;
			}
			if (btn(4)) {
				if (playingDefense() && !fullReplay && !camAdjust) strafe = true;
				else jukeL = true;
			}
			if (btn(5)) {
				if (playingDefense() && !fullReplay && !camAdjust) strafe = true;
				else jukeR = true;
			}
			if (fullReplay || camAdjust) {
				slowBack = slowBack || btn(4);
				slowFwd = slowFwd || btn(5);
				fastBack = fastBack || lt > .4;
				fastFwd = fastFwd || rt > .4;
				camRotate = camRotate || btn(3);
			}
			if (padProfile === "v6") {
				if (btn(8)) stiffL = true;
				if (btn(9)) stiffR = true;
			} else if (padProfile === "basic" || padProfile === "classic") {
				// Xbox XInput may report LT/RT on axes 2/5. T-9 uses those axes for the right stick.
				const analogTrig = !t9Fam && gp.mapping !== "standard";
				if (btn(6) || (analogTrig && gp.axes[2] !== void 0 && gp.axes[2] > .4)) stiffL = true;
				if (btn(7) || (analogTrig && gp.axes[5] !== void 0 && gp.axes[5] > .4)) stiffR = true;
			}
			if (btn(8) && padProfile !== "v6") celebrate = true;
			if (padProfile === "basic") {
				if (btn(9)) pausePress = true;
			} else if (btn(11)) pausePress = true;
			if (btn(9) && padProfile !== "basic" && padProfile !== "v6") peek = true;
			const aNow = btn(0);
			const sNow = btn(9);
			if (aNow && !prevA || (sNow && !prevStart && padProfile !== "v6")) confirm = true;
			prevA = aNow;
			prevStart = sNow;
			const viewHeld = btn(8);
			if (viewHeld && (fullReplay || paused || !playActive || practiceAwaitSnap)) replayPress = true;
		} else {
			padName = "";
			padT9 = "";
			prevA = false;
			prevStart = false;
		}
		if (padProfile === "basic" && anyD) {
			if (bits.l) dx -= 1;
			if (bits.r) dx += 1;
			if (bits.u) dy += 1;
			if (bits.d) dy -= 1;
			dpadMove = null;
		}
		if (qaPad) {
			const qLs = radialDeadzone(qaPad.lsX || 0, qaPad.lsY || 0, .18);
			const qRs = radialDeadzone(qaPad.rsX || 0, qaPad.rsY || 0, .22);
			if (qLs.x !== 0 || qLs.y !== 0) {
				dx = qLs.x;
				dy = qLs.y;
				stickX = qLs.x;
				stickY = qLs.y;
				autoRun = false;
			}
			rsX = qRs.x;
			rsCamY = qRs.y;
			if (qaPad.lt > .52) ctrlL = true;
			if (qaPad.rt > .52) ctrlR = true;
			if (!playingDefense() && padProfile === "v3") {
				if (ctrlL) { blockLdx = dx; blockLdy = dy; }
				if (ctrlR) {
					if (ctrlL && Math.hypot(qRs.x, qRs.y) >= .14) {
						blockRdx = qRs.x;
						blockRdy = qRs.y;
					} else {
						blockRdx = dx;
						blockRdy = dy;
					}
				}
			}
		}
		// Keyboard share, and Wings always share the run stick.
		// Independent/Classic on a live left stick use the right stick instead (main loop).
		if (padTeammate() && !playingDefense()) {
			const padDriving = !!(gp && (Math.abs(gp.axes[0] || 0) > .18 || Math.abs(gp.axes[1] || 0) > .18));
			const shareRun = padProfile === "v3" || !padDriving;
			if (shareRun) {
				if (ctrlL) {
					blockLdx = dx;
					blockLdy = dy;
				}
				if (ctrlR && !(padProfile === "v3" && ctrlL && Math.hypot(rsX, rsCamY) >= .14)) {
					blockRdx = dx;
					blockRdy = dy;
				}
				if ((ctrlL || ctrlR) && Math.hypot(dx, dy) < .12) autoRun = true;
			}
		}
		const mag = Math.hypot(dx, dy);
		if (mag > 1) {
			dx /= mag;
			dy /= mag;
		}
		if (keys.has("BracketLeft") || keys.has("PageUp")) rsY = -1;
		if (keys.has("BracketRight") || keys.has("PageDown")) rsY = 1;
		if (!gp || fullReplay || camAdjust) {
			if (Math.hypot(dx, dy) > 0.1) {
				stickX = dx;
				stickY = dy;
			} else if (!gp) {
				stickX = dx;
				stickY = dy;
			}
		}
		{
			const w = camWorldFromStick(dx, dy);
			dx = w.x;
			dy = w.y;
			if (Math.hypot(blockLdx, blockLdy) > 0.02) {
				const b = camWorldFromStick(blockLdx, blockLdy);
				blockLdx = b.x;
				blockLdy = b.y;
			}
			if (Math.hypot(blockRdx, blockRdy) > 0.02) {
				const b = camWorldFromStick(blockRdx, blockRdy);
				blockRdx = b.x;
				blockRdy = b.y;
			}
		}
		peekHeld = peek || peekToggle;
		return {
			dx,
			dy,
			sprint,
			spin,
			dive,
			truck,
			hurdle,
			jukeL,
			jukeR,
			wrapL,
			wrapR,
			strafe,
			stiffL,
			stiffR,
			celebrate,
			pausePress,
			confirm,
			padLive,
			peek,
			replayPress,
			zoomIn,
			zoomOut,
			slowBack,
			slowFwd,
			fastBack,
			fastFwd,
			camRotate,
			stickX,
			stickY,
			rsX,
			rsCamY,
			ctrlL,
			ctrlR,
			blockLdx,
			blockLdy,
			blockRdx,
			blockRdy,
			_dpadUp: !!(bits && bits.u),
			_dpadDn: !!(bits && bits.d),
			_dpadLeft: !!(bits && bits.l),
			_dpadRight: !!(bits && bits.r),
			_rsY: rsY,
			startHeld: !!(gp && btn(9)),
			btnAHeld: !!(gp && btn(0))
		};
	}
	function playingDefense() {
		return userSide === "def";
	}
	function isUserDef(d) {
		return !!(playingDefense() && d && (d === userDefender || d === ctrlLeft || d === ctrlRight || (d._userCtrl || 0) > 0.05));
	}
	function defIdentity(d) {
		if (!d) return null;
		const mates = defenders.filter((x) => x.group === d.group).sort((a, b) => a.x - b.x);
		return {
			group: d.group,
			role: d.dbRole || null,
			number: d.number,
			xRank: Math.max(0, mates.indexOf(d)),
			x: d.x
		};
	}
	function findDefenderByKey(key) {
		if (!key) return null;
		const pool = defenders.filter((d) => d.group === key.group);
		if (!pool.length) return defenderSequence()[0] || null;
		const uniqueRole = !!(key.role && key.role !== "CB" && key.role !== "DB");
		if (uniqueRole) {
			const byRole = pool.find((d) => d.dbRole === key.role);
			if (byRole) return byRole;
		}
		const rolePool = key.role ? pool.filter((d) => d.dbRole === key.role) : [];
		const cand = (rolePool.length ? rolePool : pool).slice().sort((a, b) => {
			const tx = key.x != null ? key.x : 0;
			const dx = Math.abs(a.x - tx) - Math.abs(b.x - tx);
			if (Math.abs(dx) > 0.35) return dx;
			return Math.abs((a.number || 0) - (key.number || 0)) - Math.abs((b.number || 0) - (key.number || 0));
		});
		if (cand.length) return cand[0];
		const byNum = pool.find((d) => d.number === key.number);
		if (byNum) return byNum;
		const sorted = pool.slice().sort((a, b) => a.x - b.x);
		if (key.xRank != null && sorted[clamp(key.xRank, 0, sorted.length - 1)]) return sorted[clamp(key.xRank, 0, sorted.length - 1)];
		return sorted[0] || null;
	}
	function lockHuddleDefender() {
		if (playingDefense() && userDefender) userDefHuddleKey = defIdentity(userDefender);
	}
	function alignLoneDb() {
		const dbs = defenders.filter((d) => d.group === "DB");
		if (dbs.length !== 1) return;
		const d = dbs[0];
		const midX = (fieldLeft() + fieldRight()) / 2;
		d.x = midX;
		d.jobX = midX;
		d.y = clamp(Math.max(d.y, playStartYard + 8.2), playStartYard + 2.4, Field.bodyCapY);
		d.dbRole = "FS";
		d.isSafety = true;
		d.isCorner = false;
		d.stutter = false;
		d.fakeBlitz = false;
		if (d.job !== "blitz") {
			d.job = "deep";
			d.jobY = clamp(Math.max(d.jobY || 0, playStartYard + 12.4), playStartYard + 4, Field.bodyCapY);
			d.zoneRx = Math.max(d.zoneRx || 0, 8.4);
			d.zoneRy = Math.max(d.zoneRy || 0, 5.4);
			d.zoneFollow = false;
		}
	}
	function alignTwoDbs() {
		const dbs = defenders.filter((d) => d.group === "DB").sort((a, b) => a.x - b.x);
		if (dbs.length !== 2) return;
		const midX = (fieldLeft() + fieldRight()) / 2;
		const spread = Math.min((fieldRight() - fieldLeft()) * 0.12, 5.8);
		const deepY = clamp(Math.max(playStartYard + 10.6, playStartYard + 6), playStartYard + 2.4, Field.bodyCapY);
		dbs.forEach((d, i) => {
			d.x = midX + (i === 0 ? -spread : spread);
			d.jobX = d.x;
			d.y = Math.max(d.y, deepY);
			d.dbRole = i === 0 ? "SS" : "FS";
			d.isSafety = true;
			d.isCorner = false;
			d.stutter = false;
			d.fakeBlitz = false;
			if (d.job !== "blitz") {
				d.job = "deep";
				d.jobY = clamp(Math.max(d.jobY || 0, playStartYard + 12.2), playStartYard + 4, Field.bodyCapY);
				d.zoneRx = Math.max(d.zoneRx || 0, 7.2);
				d.zoneRy = Math.max(d.zoneRy || 0, 5.0);
				d.zoneFollow = false;
			}
		});
	}
	function defenderSequence() {
		const dts = defenders.filter((d) => d.group === "DT").sort((a, b) => a.x - b.x);
		const lbs = defenders.filter((d) => d.group === "LB").sort((a, b) => a.x - b.x);
		const dbs = defenders.filter((d) => d.group === "DB").sort((a, b) => a.x - b.x);
		return dts.concat(lbs, dbs);
	}
	function pickDefaultUserDefender() {
		const midX = (fieldLeft() + fieldRight()) / 2;
		const dbs = defenders.filter((d) => d.group === "DB");
		if (dbs.length) {
			const fs = dbs.find((d) => d.dbRole === "FS") || dbs.find((d) => d.isSafety && d.dbRole !== "SS" && !d.isCorner);
			if (fs) return fs;
			return dbs.slice().sort((a, b) => {
				if (Math.abs(b.y - a.y) > 0.8) return b.y - a.y;
				return Math.abs(a.x - midX) - Math.abs(b.x - midX);
			})[0];
		}
		const lbs = defenders.filter((d) => d.group === "LB");
		if (lbs.length) {
			return lbs.slice().sort((a, b) => {
				if (Math.abs(b.y - a.y) > 0.6) return b.y - a.y;
				return Math.abs(a.x - midX) - Math.abs(b.x - midX);
			})[0];
		}
		const dts = defenders.filter((d) => d.group === "DT");
		if (dts.length) return dts.slice().sort((a, b) => Math.abs(a.x - midX) - Math.abs(b.x - midX))[0];
		return defenders[0] || null;
	}
	function defRoleLabel(d) {
		if (!d) return "DEF";
		return d.dbRole || d.group || "DEF";
	}
	function huddleCallLabel() {
		const on = currentPlay ? currentPlay.name : "Play";
		const dn = currentScheme && currentScheme.name ? currentScheme.name : "";
		const vs = dn ? " · vs " + dn : "";
		if (playingDefense() && userDefender) {
			return on + vs + " · DEF " + defRoleLabel(userDefender) + " #" + userDefender.number;
		}
		return on + vs;
	}
	function setUserDefender(d, announce, huddle) {
		if (!d) return;
		if (d !== userDefender) {
			if (userDefender) userDefender._userCtrl = 0;
			defWrapPhase = "none";
			defWrapT = 0;
			defWrapFrom = null;
			defDive = null;
			defMoveId = null;
			defMoveT = 0;
		}
		userDefender = d;
		d._userCtrl = 0.4;
		if (huddle === true || (huddle !== false && practiceAwaitSnap)) userDefHuddleKey = defIdentity(d);
		if (announce) {
			const extra = practiceAwaitSnap ? " — A/B switch · B+stick point · Y snap" : "";
			setPlayCall(huddleCallLabel() + extra);
		}
	}
	function ensureUserDefender() {
		if (!playingDefense()) {
			userDefender = null;
			return;
		}
		if (userDefender && defenders.indexOf(userDefender) >= 0) return;
		const found = findDefenderByKey(userDefHuddleKey);
		if (found) {
			setUserDefender(found, false, false);
			return;
		}
		setUserDefender(pickDefaultUserDefender(), false, true);
	}
	function cycleUserDefender(dir) {
		const seq = defenderSequence();
		if (!seq.length) return;
		ensureUserDefender();
		let idx = seq.indexOf(userDefender);
		if (idx < 0) idx = 0;
		setUserDefender(seq[(idx + dir + seq.length) % seq.length], true, true);
	}
	function pointSelectDefender(dx, dy, from) {
		const mag = Math.hypot(dx, dy);
		if (mag < 0.28) return null;
		const ux = dx / mag, uy = dy / mag;
		const origin = from || userDefender || { x: snapX(), y: playStartYard + 6 };
		let best = null, score = 0.16;
		for (const d of defenders) {
			if (d === origin) continue;
			if (d.pancaked || d.state === "whiff") continue;
			const vx = d.x - origin.x, vy = d.y - origin.y;
			const L = Math.hypot(vx, vy);
			if (L < 0.35 || L > 30) continue;
			const dot = (vx * ux + vy * uy) / L;
			if (dot < 0.18) continue;
			const s = dot * 1.4 - L * 0.02;
			if (s > score) {
				score = s;
				best = d;
			}
		}
		return best;
	}
	function bestPursuitDefender(skip) {
		if (!rb) return pickDefaultUserDefender();
		const cd = carrierDir(rb);
		const ranked = [];
		for (const d of defenders) {
			if (d.pancaked || d.state === "whiff" || d.state === "recover") continue;
			const toX = rb.x - d.x, toY = rb.y - d.y;
			const L = Math.hypot(toX, toY) || 1;
			const closing = ((d.vx || 0) * toX + (d.vy || 0) * toY) / L;
			const side = Math.abs(cd.x * (toY / L) - cd.y * (toX / L));
			const blocked = d.engageT > 0 ? 2.6 : 0;
			const dtBias = d.group === "DT" ? 0.55 : 0;
			ranked.push({ d, score: (L - closing * 0.25) * (1.12 - side * 0.32) + blocked + dtBias });
		}
		ranked.sort((a, b) => a.score - b.score);
		if (!ranked.length) return skip || pickDefaultUserDefender();
		if (ranked[0].d === skip && ranked[1]) return ranked[1].d;
		if (ranked[0].d === skip) return ranked[1] ? ranked[1].d : skip;
		return ranked[0].d;
	}
	function setUserSide(side) {
		userSide = side === "def" ? "def" : "off";
		if (typeof syncSideAliases === "function") syncSideAliases();
		const hint = $("sideHint");
		if (hint) {
			hint.textContent = userSide === "def"
				? "Defense: tap A/B switch · B + stick point · Y shed (huddle Y snaps). Automatic next play snaps after a 1.1–2.1s huddle. Live: A sprint · B switch · X dive · Y shed · LT wrap · RT punch · LB/RB strafe · RS hit stick."
				: "Offense: A snaps. Game re-rolls both calls every play. Keys: WASD · Space sprint · F spin · C dive.";
		}
		document.body.classList.toggle("defense-mode", userSide === "def");
		const sel = $("sideSelect");
		if (sel && sel.value !== userSide) sel.value = userSide;
		refreshHudSegments();
		defAHoldArmed = false;
		defAHoldT = 0;
		defWrapPhase = "none";
		if (!playActive || practiceAwaitSnap) {
			try { placeEntitiesForNewPlay(); } catch (err) { console.error(err); }
		}
		ensureUserDefender();
		if (typeof syncCallSelects === "function") syncCallSelects();
		if (typeof refreshPracticePreviews === "function") refreshPracticePreviews();
		if (practiceAwaitSnap && typeof armGameDefAutoSnap === "function") armGameDefAutoSnap();
		if (userSide === "def" && userDefender) {
			setPlayCall(huddleCallLabel() + huddleWaitHint());
		}
	}
	function shedBlock(d) {
		if (!d) return;
		let blocker = blockers.find((b) => b.active && b.blockTarget === d) || null;
		if (!blocker) {
			let nd = 2.7, best = null;
			for (const b of blockers) {
				if (!b.active) continue;
				const dd = dist(b, d);
				if (dd < nd) {
					nd = dd;
					best = b;
				}
			}
			blocker = best;
		}
		d.engageT = 0;
		d.slowed = 0;
		d.state = "pursue";
		d.low = false;
		if (blocker) {
			const away = Math.sign(blocker.x - d.x) || 1;
			blocker.x += away * 0.42;
			blocker.y -= 0.95;
			blocker.vx = away * 2.4;
			blocker.vy = -3.6;
			blocker.blockTarget = null;
			blocker._userCtrl = 0;
		}
		defMoveId = "shed";
		defMoveT = 0.22;
	}
	function startDefDive(d, inp) {
		if (!d || (d.atkKind === "dive" && d.atkT > 0)) return;
		let dx = inp.dx, dy = inp.dy;
		if (Math.hypot(dx, dy) < 0.18 && rb) {
			dx = rb.x - d.x;
			dy = rb.y - d.y;
		}
		const L = Math.hypot(dx, dy) || 1;
		d.atkKind = "dive";
		d.atkDX = dx / L;
		d.atkDY = dy / L;
		d.atkT = 0.5;
		d.state = "dive";
		d.low = true;
		d.hop = 0.3;
		defDive = { t: 0.5 };
		defMoveId = "dive";
		defMoveT = 0.5;
	}
	function finishUserWrapTackle(d) {
		if (!d || !rb) {
			defWrapPhase = "none";
			return;
		}
		const yg = Math.round(rb.y - playStartYard);
		tackleAnim = {
			mode: "tackle",
			kind: "wrap",
			timer: 0.48,
			dur: 0.48,
			ox: rb.x,
			oy: rb.y,
			fx: rb.x - d.x,
			fy: rb.y - d.y,
			dist: 0,
			hold: 0.42,
			yards: yg,
			defender: d
		};
		const flen = Math.hypot(tackleAnim.fx, tackleAnim.fy) || 1;
		tackleAnim.fx /= flen;
		tackleAnim.fy /= flen;
		defWrapPhase = "none";
		defWrapT = 0;
	}
	function tryWrap(d, which) {
		if (!d || !rb) return;
		const dd = dist(d, rb);
		const maxR = d._strafe ? 3.95 : 2.65;
		if (dd > maxR) return;
		if (defWrapPhase !== "wrapped") {
			defWrapPhase = "wrapped";
			defWrapT = 0.9;
			defWrapFrom = which;
			d.atkKind = "wrap";
			d.atkT = 0.45;
			d.state = "commit";
			d.low = true;
			rb.vx *= 0.38;
			rb.vy *= 0.38;
			return;
		}
		if (defWrapFrom && defWrapFrom !== which) {
			const cd = carrierDir(rb);
			const toX = d.x - rb.x, toY = d.y - rb.y;
			const L = Math.hypot(toX, toY) || 1;
			const side = Math.abs(cd.x * (toY / L) - cd.y * (toX / L));
			let p = 0.16 + side * 0.58;
			if (dd < 1.4) p += 0.08;
			if (Math.random() < p) {
				startFumble(d, true);
				defWrapPhase = "none";
				defWrapT = 0;
				return;
			}
			finishUserWrapTackle(d);
		}
	}
	function resolveHitStick(d, ux, uy, L, aim) {
		if (!d || !rb) return;
		const cd = carrierDir(rb);
		const side = Math.abs(cd.x * uy - cd.y * ux);
		const headOn = clamp(1 - side, 0, 1);
		const closing = Math.max(0, aim == null ? 0.6 : aim);
		rb.low = true;
		rb.hop = 0.22 + headOn * 0.18;
		rb.vx = ux * (3.4 + headOn * 1.4) + (rb.vx || 0) * 0.08;
		rb.vy = uy * (1.8 + closing * 0.8);
		const punch = 0.28 + closing * 0.16 + headOn * 0.22 + (L < 2.4 ? 0.12 : 0) + (d._strafe ? 0.22 : 0);
		if (Math.random() < punch) {
			startFumble(d, true);
			clearAttack(d);
			return;
		}
		const yg = Math.round(rb.y - playStartYard);
		tackleAnim = {
			mode: "tackle",
			kind: "hit",
			timer: 0.88,
			dur: 0.88,
			ox: rb.x,
			oy: rb.y,
			fx: ux,
			fy: uy,
			dist: 2.15 + headOn * 0.55,
			hold: 0.95,
			yards: yg,
			defender: d
		};
		triggerAnkleCam(rb, d);
		clearAttack(d);
	}
	function fireHitStick(d, hx, hy) {
		if (!d || !rb || defHitCool > 0) return;
		const mag = Math.hypot(hx, hy);
		if (mag < 0.22) return;
		let ux = hx / mag, uy = hy / mag;
		defHitLatch = true;
		defHitCool = 0.28;
		const toX = rb.x - d.x, toY = rb.y - d.y;
		const L = Math.hypot(toX, toY) || 1;
		const tux = toX / L, tuy = toY / L;
		const aim = ux * tux + uy * tuy;
		const strafing = !!d._strafe;
		if (aim > -0.42) {
			const blend = aim < 0.15 ? 0.72 : 0.48;
			let mx = ux * (1 - blend) + tux * blend;
			let my = uy * (1 - blend) + tuy * blend;
			const mm = Math.hypot(mx, my) || 1;
			ux = mx / mm;
			uy = my / mm;
		}
		d.atkKind = "hit";
		d.atkDX = ux;
		d.atkDY = uy;
		d.atkT = strafing ? 0.66 : 0.58;
		d.state = "hit";
		d.facing = Math.atan2(uy, ux);
		d._hitAim = Math.max(aim, strafing ? 0.5 : 0.35);
		d._hitRange = L;
		if (aim < (strafing ? -0.72 : -0.55)) {
			d.state = "whiff";
			d._userMiss = true;
			d.low = true;
			stampTurfImpact(d, 0.55 + Math.random() * 0.18);
			d.spinT = 0.55;
			d.hop = 0.42;
			d.vx = ux * (8 + Math.random() * 3);
			d.vy = uy * (6.5 + Math.random() * 2);
			clearAttack(d);
			return;
		}
		if (L <= (strafing ? 8.2 : 6.4) && aim >= (strafing ? -0.32 : -0.12)) {
			resolveHitStick(d, ux, uy, L, Math.max(aim, strafing ? 0.62 : 0.45));
			return;
		}
	}
	function tickPresnapDefense(dt, inp, bookWasOpen) {
		ensureUserDefender();
		const bookOpen = !!(bookWasOpen || practiceAudibleArm || practiceDefAudibleArm);
		const yHeld = !!(inp.truck || inp.hurdle);
		const bHeld = !!inp.spin;
		const stickMag = Math.hypot(inp.dx, inp.dy);
		if (!bookOpen && bHeld && stickMag > 0.4) {
			if (!defPointLatch) {
				const pick = pointSelectDefender(inp.dx, inp.dy, userDefender);
				if (pick) setUserDefender(pick, true, true);
				defPointLatch = true;
			}
			defBPointed = true;
		} else if (!bHeld) {
			defPointLatch = false;
			defBPointed = false;
		} else if (stickMag < 0.28) {
			defPointLatch = false;
		}
		const kbPrev = keys.has("BracketLeft") || keys.has("Comma");
		const kbNext = keys.has("BracketRight") || keys.has("Period");
		if (!bookOpen && bHeld && !defCycleEdge && stickMag < 0.28 && !defBPointed) cycleUserDefender(-1);
		if (!bookOpen && kbPrev && !defCycleEdge) cycleUserDefender(-1);
		if (!bookOpen && kbNext && !defCycleEdge) cycleUserDefender(1);
		defCycleEdge = !!(bHeld || kbPrev || kbNext);
		let snapped = false;
		if (keys.has("Enter") && inp.confirm && !confirmEdge) snapped = true;
		if (padProfile !== "basic" && inp.startHeld && !defStartEdge) snapped = true;
		defStartEdge = !!inp.startHeld;
		if (!bookOpen && yHeld && !defYSnapEdge && stickMag < 0.28) snapped = true;
		defYSnapEdge = yHeld;
		const padA = !!(inp.padLive && inp.sprint);
		if (!bookOpen && padA) {
			if (!defAHoldArmed) {
				defAHoldArmed = true;
				defAHoldT = 0;
			}
			defAHoldT += dt;
			if (defAHoldT >= 0.4) snapped = true;
		} else if (defAHoldArmed) {
			if (!bookOpen && defAHoldT < 0.4) cycleUserDefender(1);
			defAHoldArmed = false;
			defAHoldT = 0;
		}
		if (snapped) {
			defAHoldArmed = false;
			defAHoldT = 0;
			return "snap";
		}
		return "hold";
	}
	function tickUserDefense(dt, inp) {
		ensureUserDefender();
		const d = userDefender;
		if (!d) return;
		if (defHitCool > 0) defHitCool -= dt;
		if (defMoveT > 0) {
			defMoveT -= dt;
			if (defMoveT <= 0) {
				defMoveId = null;
				defDive = null;
			}
		}
		if (defWrapPhase === "wrapped") {
			defWrapT -= dt;
			const wrapFall = Math.min(1, (0.9 - Math.max(0, defWrapT)) / 0.55);
			if (rb) {
				rb.vx *= Math.max(0, 1 - 1.6 * dt);
				rb.vy *= Math.max(0, 1 - 1.6 * dt);
				rb.takenDown = true;
				rb.downAmt = wrapFall;
				rb.low = true;
				rb.fallLayout = 0.05;
				rb.fallPitch = 0.2;
				rb.fallRoll = 1.18;
				if (d) rb.fallSide = Math.sign(d.x - rb.x) || 1;
			}
			if (d) {
				d.takenDown = true;
				d.downAmt = wrapFall;
				d.low = true;
				d.atkKind = "wrap";
				d.fallLayout = 0.05;
				d.fallPitch = 0.2;
				d.fallRoll = 1.18;
				d.fallSide = rb ? -(Math.sign(d.x - rb.x) || 1) : 1;
			}
			if (defWrapT <= 0) finishUserWrapTackle(d);
		}
		if (inp.spin) {
			const stickMag = Math.hypot(inp.dx, inp.dy);
			const any = !!(inp._dpadLeft || inp._dpadRight || inp._dpadUp || inp._dpadDn);
			if (stickMag > 0.4) {
				if (!defPointLatch) {
					const pick = pointSelectDefender(inp.dx, inp.dy, d) || bestPursuitDefender(d);
					if (pick) setUserDefender(pick, true, false);
					defPointLatch = true;
				}
				defBPointed = true;
			} else {
				defPointLatch = false;
				if (!defSwitchEdge && !defBPointed) {
					if (any) {
						const dx = (inp._dpadRight ? 1 : 0) - (inp._dpadLeft ? 1 : 0);
						const dy = (inp._dpadUp ? 1 : 0) - (inp._dpadDn ? 1 : 0);
						const w = camWorldFromStick(dx, dy);
						const pick = pointSelectDefender(w.x, w.y, d) || bestPursuitDefender(d);
						if (pick) setUserDefender(pick, true, false);
					} else {
						const pick = bestPursuitDefender(d);
						if (pick) setUserDefender(pick, true, false);
					}
				}
			}
		} else {
			defPointLatch = false;
			defBPointed = false;
		}
		defSwitchEdge = !!inp.spin;
		const me = userDefender;
		if (!me) return;
		const yHeld = !!(inp.truck || inp.hurdle);
		if (yHeld && !defShedEdge && (me.engageT > 0 || blockers.some((b) => b.active && (b.blockTarget === me || dist(b, me) < 2.4)))) {
			shedBlock(me);
		}
		defShedEdge = yHeld;
		if ((inp.wrapL || (inp.ctrlL && playActive && !practiceAwaitSnap)) && !defWrapLEdge) tryWrap(me, "lt");
		if ((inp.wrapR || (inp.ctrlR && playActive && !practiceAwaitSnap)) && !defWrapREdge) tryWrap(me, "rt");
		defWrapLEdge = !!(inp.wrapL || inp.ctrlL);
		defWrapREdge = !!(inp.wrapR || inp.ctrlR);
		const strafing = !!(inp.strafe || (playingDefense() && (inp.jukeL || inp.jukeR)));
		me._strafe = strafing;
		const rsMag = Math.hypot(inp.rsX || 0, inp.rsCamY || 0);
		if (rsMag > 0.26 && !defHitLatch) {
			const w = camWorldFromStick(inp.rsX || 0, inp.rsCamY || 0);
			fireHitStick(me, w.x, w.y);
		}
		if (rsMag < 0.16) defHitLatch = false;
		if (inp.dive && !defDiveEdge && !(me.atkKind === "dive" && me.atkT > 0)) startDefDive(me, inp);
		defDiveEdge = !!inp.dive;
		if (me.pancaked || me.state === "whiff" || me.state === "recover") {
			if (me._userMiss) return;
			const wantMove = Math.hypot(inp.dx, inp.dy) > 0.16 || inp.sprint;
			if (!wantMove) return;
			me.pancaked = false;
			me.state = "pursue";
			me.whiffT = 0;
			me.recoverT = 0;
			me.low = false;
			me.engageT = 0;
			me.spinT = 0;
		}
		me._userMiss = false;
		let spd = (me.baseSpeed || me.speed || 8.6) * defMult(me) * playSpeed;
		if (inp.sprint) spd *= SPRINT_MULT;
		if (strafing) {
			spd *= 0.64;
			me.low = true;
			if (rb) {
				const tx = rb.x - me.x, ty = rb.y - me.y;
				if (Math.hypot(tx, ty) > 0.35) me.facing = Math.atan2(ty, tx);
			}
		}
		if (me.engageT > 0) spd *= 0.34;
		if (me.atkKind === "dive" && me.atkT > 0) {
			me.vx = (me.atkDX || 0) * spd * 1.4;
			me.vy = (me.atkDY || 0) * spd * 1.4;
			me.x += me.vx * dt;
			me.y += me.vy * dt;
			me.facing = Math.atan2(me.vy, me.vx);
			me.atkT -= dt;
			if (me.atkT <= 0) {
				me.state = "whiff";
				me._userMiss = true;
				stampTurfImpact(me, 0.55);
				me.low = true;
				clearAttack(me);
				defDive = null;
			}
		} else if (me.atkKind === "hit" && me.atkT > 0) {
			const burst = spd * 1.95;
			let hx = me.atkDX || 0, hy = me.atkDY || 0;
			if (rb) {
				const tx = rb.x - me.x, ty = rb.y - me.y;
				const tl = Math.hypot(tx, ty) || 1;
				hx = hx * 0.42 + (tx / tl) * 0.58;
				hy = hy * 0.42 + (ty / tl) * 0.58;
				const hm = Math.hypot(hx, hy) || 1;
				hx /= hm; hy /= hm;
			}
			me.vx = hx * burst;
			me.vy = hy * burst;
			me.x += me.vx * dt;
			me.y += me.vy * dt;
			me.facing = Math.atan2(me.vy, me.vx);
			me.atkT -= dt;
			if (rb && dist(me, rb) < 2.85) {
				resolveHitStick(me, hx, hy, dist(me, rb), Math.max(me._hitAim || 0.5, 0.55));
			} else if (me.atkT <= 0) {
				if (rb && dist(me, rb) < 5.4) {
					resolveHitStick(me, hx, hy, dist(me, rb), Math.max(me._hitAim || 0.4, 0.4));
				} else {
					me.state = "whiff";
					me._userMiss = true;
					stampTurfImpact(me, 0.42);
					me.low = true;
					clearAttack(me);
				}
			}
		} else {
			if (me.atkT > 0) {
				me.atkT -= dt;
				if (me.atkT <= 0) clearAttack(me);
			}
			me.vx = inp.dx * spd;
			me.vy = inp.dy * spd;
			me.x += me.vx * dt;
			me.y += me.vy * dt;
			if (Math.hypot(me.vx, me.vy) > 0.45) me.facing = Math.atan2(me.vy, me.vx);
		}
		me.x = clamp(me.x, fieldLeft() + 0.8, fieldRight() - 0.8);
		me.y = clamp(me.y, Math.max(0, playStartYard - 12), Field.bodyCapY);
		me._userCtrl = 0.35;
	}
	function cpuOffenseDrive(dt, spd) {
		if (!rb) return;
		let useScript = scriptIndex < scriptSteps.length;
		let sdx = 0, sdy = 1;
		if (useScript) {
			const step = scriptSteps[scriptIndex];
			sdx = step.dx;
			sdy = step.dy;
			scriptTimer += dt;
			if (scriptTimer >= step.t) {
				scriptTimer = 0;
				scriptIndex++;
			}
		} else {
			const side = playSideSign();
			sdx = side * 0.2;
			sdy = 1;
			let nearest = null, nd = 99;
			for (const def of defenders) {
				if (def.pancaked || def.state === "whiff") continue;
				const dd = dist(def, rb);
				if (dd < nd) {
					nd = dd;
					nearest = def;
				}
			}
			if (nearest && nd < 4.4) {
				const away = Math.sign(rb.x - nearest.x) || side;
				sdx += away * (nd < 2.15 ? 1.2 : 0.72);
			}
			if (nd > 6) spd *= 1.12;
			const mag = Math.hypot(sdx, sdy) || 1;
			sdx /= mag;
			sdy /= mag;
		}
		rb.vx = sdx * spd;
		rb.vy = sdy * spd;
	}

	function chooseDefenderAttack(d, distToRb) {
		if (!rb || !d) return;
		if (d.pancaked || d.engageT > 0) return;
		if (d.state === "whiff" || d.state === "recover") return;
		if (d.atkT > 0) return;
		if ((d.atkDecideT || 0) > 0) return;
		d.atkDecideT = 0.12 + Math.random() * 0.1;
		if (distToRb > 5.2 || distToRb < 1.05) return;
		// Shade DTs holding the LOS do not launch into the backfield
		if (d.group === "DT" && !d.dtPenetrate && rb.y < playStartYard + 0.25) return;
		const closing = Math.hypot(d.vx || 0, d.vy || 0);
		const ang = Math.atan2(rb.y - d.y, rb.x - d.x);
		const face = d.facing || 0;
		let turn = Math.abs(ang - face);
		if (turn > Math.PI) turn = Math.PI * 2 - turn;
		const headUp = turn < 0.85;
		const crossing = Math.abs(rb.vx || 0) > 2.4 && Math.abs(rb.x - d.x) < 3.2;
		const r = Math.random();
		let kind = null;
		if (d.group !== "DT" && distToRb > 1.85 && distToRb < 5.15) {
			let diveP = d.group === "DB" ? 0.56 : 0.48;
			if (crossing) diveP += 0.22;
			if (r < diveP) kind = "dive";
		}
		if (!kind && d.group !== "DT" && distToRb > 1.55 && distToRb < 3.45 && headUp && closing > 5.4 && r < 0.3) kind = "hit";
		if (!kind && distToRb < 2.95) kind = "wrap";
		if (!kind) return;
		d.atkKind = kind;
		d.atkDX = Math.cos(ang);
		d.atkDY = Math.sin(ang);
		if (kind === "dive") {
			d.state = "dive";
			d.atkT = 0.5 + Math.random() * 0.16;
			d.low = true;
			d.hop = 0.22;
		} else if (kind === "hit") {
			d.state = "hit";
			d.atkT = 0.26 + Math.random() * 0.1;
			d.low = false;
		} else {
			d.state = "commit";
			d.atkT = 0.55;
		}
	}
	function clearAttack(d) {
		if (!d) return;
		if (d.atkKind) d._tackleKind = d.atkKind;
		d.atkKind = null;
		d.atkT = 0;
		d.hop = 0;
	}
	function playerMass(p) {
		return (p && p.mass) || 1;
	}
	function carrierDir(p) {
		if (!p) return { x: 0, y: 1 };
		let dx = p.vx || 0, dy = p.vy || 0;
		if (Math.hypot(dx, dy) < 0.55) {
			dx = Math.cos(p.facing || Math.PI / 2);
			dy = Math.sin(p.facing || Math.PI / 2);
		}
		const L = Math.hypot(dx, dy) || 1;
		return { x: dx / L, y: dy / L };
	}
	function tryMiss(kind) {
		if (!rb) return;
		for (const d of defenders) {
			// P0a / P0c: miss moves beat engaged, diving, and hit-sticking defenders.
			if (d.pancaked || d.state === "whiff") continue;
			const engaged = d.engageT > 0;
			const diving = d.atkKind === "dive" && d.atkT > 0;
			const hitting = d.atkKind === "hit" && d.atkT > 0;
			if (!engaged && !diving && !hitting && d.state !== "commit" && d.state !== "breakdown" && d.state !== "recover") continue;
			const dd = dist(d, rb);
			if (dd > (diving ? 4.2 : 3.2)) continue; // dive commit can be beaten from a step farther
			const side = Math.sign(d.x - rb.x) || 1;
			const trail = rb.y - d.y;
			let chance = 0;
			if (kind === "jukeL") chance = side > 0 ? .88 : .38;
			else if (kind === "jukeR") chance = side < 0 ? .88 : .38;
			else if (kind === "shakeL" || kind === "shakeR") chance = d.state === "commit" ? .95 : .82;
			else if (kind === "spin") chance = Math.abs(side) && trail > -.8 ? .92 : .55;
			else if (kind.startsWith("deadleg")) chance = trail > .2 ? .9 : .45;
			else continue;
			if (d.state === "breakdown") chance *= .75;
			if (engaged) chance = Math.min(0.97, chance + 0.22);
			if (diving || hitting) {
				if (kind.startsWith("shake") || kind.startsWith("deadleg") || kind === "spin" || kind.startsWith("juke")) chance = Math.min(0.97, Math.max(chance, 0.9) + 0.04);
			} else if (d.state === "commit" && !engaged && (kind.startsWith("juke") || kind === "spin")) {
				chance *= 0.72; // square wrap: finesse is weaker
			}
			if (d.state === "recover") chance *= 0.7;
			if (Math.random() > chance) continue;
			d.engageT = 0;
			clearAttack(d);
			d.state = "whiff";
			d.low = true;
			stampTurfImpact(d, diving ? 0.72 + Math.random() * 0.2 : kind.startsWith("shake") ? .48 : .38);
			const spd = Math.min(4.5, Math.hypot(d.vx, d.vy) || d.speed * .45);
			const ang = Math.atan2(d.vy, d.vx) || d.facing;
			const boost = kind.startsWith("shake") ? 1.15 : 1.08;
			d.vx = Math.cos(ang) * spd * boost;
			d.vy = Math.sin(ang) * spd * boost * 0.55; // less downfield slide
			if (kind === "shakeL") d.vx += 1.6;
			else if (kind === "shakeR") d.vx -= 1.6;
			if (kind === "spin") {
				const bite = Math.sign(d.x - rb.x) || 1;
				d.vx += bite * (2.0 + Math.random() * 1.1);
				d.vy *= 0.35;
				stampTurfImpact(d, 0.45 + Math.random() * 0.15);
				d.laneOffset = (d.laneOffset || 0) + bite * 1.2;
			}
			if (kind.startsWith("shake") || kind === "spin" || d.state === "whiff" && dd < 2.35 && chance >= .7) triggerAnkleCam(rb, d);
		}
	}
	function resolveHurdle() {
		if (!rb) return {
			target: null,
			ok: false
		};
		const carrier = rb;
		const aimX = activeMove === "hurdleL" ? -1 : activeMove === "hurdleR" ? 1 : 0;
		const inLane = defenders.filter((d) => {
			if (d.state === "whiff" || d.state === "recover") return false;
			const dy = d.y - carrier.y;
			const dx = d.x - carrier.x;
			if (dy < -.35 || dy > 4.5) return false;
			if (Math.abs(dx) > 2.55) return false;
			if (aimX !== 0 && aimX * dx < -.4) return false;
			return true;
		});
		inLane.sort((a, b) => dist(a, carrier) - dist(b, carrier));
		if (inLane.length === 0) return {
			target: null,
			ok: true
		};
		if (carrier.y >= 94.2) {
			const front = inLane.filter((d) => Math.abs(d.x - carrier.x) < 1.35 && d.y >= carrier.y - .15);
			return {
				target: front[0] || inLane[0] || null,
				ok: true
			};
		}
		const close = inLane.filter((d) => dist(d, carrier) < 3.05);
		if (close.length >= 2) return {
			target: close[0],
			ok: false
		};
		if (inLane.length >= 2) {
			const a = inLane[0];
			const b = inLane[1];
			const split = Math.sign(a.x - carrier.x) !== Math.sign(b.x - carrier.x) && a.x !== carrier.x;
			const similar = Math.abs(dist(a, carrier) - dist(b, carrier)) < 1.35;
			if (split && similar && dist(a, carrier) < 3.5 && dist(b, carrier) < 3.5) return {
				target: a,
				ok: false
			};
		}
		return {
			target: inLane[0],
			ok: true
		};
	}
	function clonePose(p) {
		if (!p) return null;
		return {
			x: p.x,
			y: p.y,
			vx: p.vx,
			vy: p.vy,
			radius: p.radius,
			color: p.color,
			helmet: p.helmet,
			pants: p.pants,
			numColor: p.numColor,
			numOutline: p.numOutline,
			glove: p.glove,
			number: p.number,
			group: p.group,
			side: p.side,
			active: p.active,
			facing: p.facing,
			hasBall: p.hasBall,
			low: p.low,
			hop: p.hop,
			spinT: p.spinT,
			state: p.state,
			mass: p.mass,
			facemask: p.facemask,
			pancaked: p.pancaked,
			takenDown: p.takenDown,
			downAmt: p.downAmt,
			fallSide: p.fallSide,
			fallLayout: p.fallLayout,
			fallPitch: p.fallPitch,
			fallRoll: p.fallRoll,
			whiffT: p.whiffT,
			whiffMax: p.whiffMax,
			turfSeed: p.turfSeed,
			turfX: p.turfX,
			turfY: p.turfY,
			turfStainT: p.turfStainT,
			turfStainMax: p.turfStainMax,
			atkKind: p.atkKind,
			atkT: p.atkT,
			truckDir: p.truckDir,
			spinSide: p.spinSide,
			helmStripes: p.helmStripes,
			helmStripeCol: p.helmStripeCol,
			helmBars: p.helmBars,
			helmGrill: !!p.helmGrill,
			helmVisor: p.helmVisor,
			stripeCol: p.stripeCol,
			pantStripeCol: p.pantStripeCol,
			sleeveStripes: p.sleeveStripes,
			pantStripes: p.pantStripes,
			socks: p.socks,
			shoes: p.shoes,
			driveBlock: p.driveBlock,
			engageT: p.engageT,
			gaitSpd: p.gaitSpd || 0,
			hitCheerT: p.hitCheerT || 0,
			hitCheerDur: p.hitCheerDur || 0,
			hitCheerKind: p.hitCheerKind || null,
			scuffleT: p.scuffleT || 0,
			scuffleDur: p.scuffleDur || 0,
			scuffleRole: p.scuffleRole || null,
			scuffleDX: p.scuffleDX || 0,
			scuffleDY: p.scuffleDY || 0
		};
	}
	function captureFrame() {
		return {
			cameraY,
			camZoom,
			cameraMode,
			rb: clonePose(rb),
			qb: clonePose(qb),
			blockers: blockers.map(clonePose),
			defenders: defenders.map(clonePose),
			playStartYard,
			ballYard,
			celebrateTimer,
			scoreSeq: scoreSeq && {
				...scoreSeq,
				player: clonePose(scoreSeq.player)
			},
			fumbleSeq: fumbleSeq && { ...fumbleSeq },
			currentPlayName: currentPlay ? currentPlay.name : "",
			currentSchemeName: currentScheme ? currentScheme.name : "",
			trail: showRunnerTrail && runnerTrail.length ? runnerTrail.map((p) => ({ x: p.x, y: p.y, spd: p.spd || 0 })) : null,
			activeMove,
			moveTimer,
			moveDur,
			celebrateTimer
		};
	}
	function triggerAnkleCam(runner, defender) {
		ankleCam = {
			t: 1.25,
			runner,
			defender
		};
		startPip(3.2);
	}
	function startPip(seconds) {
		if (replayMode === "off") return;
		const n = Math.max(8, Math.round(seconds * REPLAY_HZ));
		const frames = replayBuf.slice(-n);
		if (frames.length < 6) return;
		pipReplay = {
			frames,
			i: 0,
			acc: 0
		};
	}

	function loadSavedClips() {
		try {
			const raw = localStorage.getItem(SAVED_CLIPS_KEY);
			const list = raw ? JSON.parse(raw) : [];
			return Array.isArray(list) ? list : [];
		} catch {
			return [];
		}
	}
	function persistSavedClips(list) {
		localStorage.setItem(SAVED_CLIPS_KEY, JSON.stringify(list.slice(0, SAVED_CLIPS_MAX)));
	}
	function renderSavedClips() {
		const host = $("savedClipsList");
		if (!host) return;
		const list = loadSavedClips();
		host.innerHTML = "";
		if (!list.length) {
			host.innerHTML = "<div class=\"clip-empty\">No saved plays yet</div>";
			return;
		}
		list.forEach((clip, idx) => {
			const row = document.createElement("div");
			row.className = "clip-row";
			const name = document.createElement("span");
			name.className = "clip-name";
			name.textContent = clip.name || ("Clip " + (idx + 1));
			const meta = document.createElement("span");
			meta.className = "clip-meta";
			meta.textContent = (clip.playName || "?") + " vs " + (clip.schemeName || "?") + " · " + (clip.frames ? clip.frames.length : 0) + "f";
			const playBtn = document.createElement("button");
			playBtn.type = "button";
			playBtn.textContent = "▶";
			playBtn.title = "Play clip";
			playBtn.onclick = () => playSavedClip(clip);
			const dlBtn = document.createElement("button");
			dlBtn.type = "button";
			dlBtn.textContent = "↓";
			dlBtn.title = "Download JSON";
			dlBtn.onclick = () => downloadClipJson(clip);
			const delBtn = document.createElement("button");
			delBtn.type = "button";
			delBtn.textContent = "×";
			delBtn.title = "Delete";
			delBtn.onclick = () => {
				const next = loadSavedClips().filter((c) => c.id !== clip.id);
				persistSavedClips(next);
				renderSavedClips();
			};
			row.appendChild(name);
			row.appendChild(meta);
			row.appendChild(playBtn);
			row.appendChild(dlBtn);
			row.appendChild(delBtn);
			host.appendChild(row);
		});
	}
	function downloadClipJson(clip) {
		const blob = new Blob([JSON.stringify(clip)], { type: "application/json" });
		const a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = (clip.name || "fga-clip").replace(/[^\w\-]+/g, "_") + ".json";
		a.click();
		URL.revokeObjectURL(a.href);
	}
	function playSavedClip(clip) {
		if (!clip || !clip.frames || clip.frames.length < 6) return;
		fullReplay = {
			frames: clip.frames,
			i: 0,
			acc: 0,
			playing: true
		};
		resetCamOp();
		camOp.theta = 0;
		camOp.phi = Math.PI / 2;
		camOp.zoom = 1;
		replayCursorFree = false;
		const seed = clip.frames[0] && clip.frames[0].rb;
		applyLook(seed ? seed.x : FIELD_WIDTH / 2, seed ? seed.y : 50);
		replayLeaveEdge = true;
		replayToggleEdge = true;
		cheerHoldT = 0;
		cheerAmp = 0;
		cheerHoldArmed = false;
		setPaused(true);
		pauseBannerHTML("replay");
	}
	function saveLastPlayClip() {
		const frames = lastPlayFrames && lastPlayFrames.length >= 6 ? lastPlayFrames : playFrames;
		if (!frames || frames.length < 6) {
			setPlayCall("Nothing to save — run a play first");
			return;
		}
		const defaultName = (currentPlay ? currentPlay.name : "Play") + " vs " + (currentScheme ? currentScheme.name : "D");
		const name = window.prompt("Name this clip", defaultName);
		if (name === null) return;
		const clip = {
			id: "c" + Date.now().toString(36),
			name: (name || defaultName).slice(0, 48),
			playName: currentPlay ? currentPlay.name : "",
			schemeName: currentScheme ? currentScheme.name : "",
			savedAt: new Date().toISOString(),
			frames: frames.map((f) => ({
				cameraY: f.cameraY,
				camZoom: f.camZoom,
				cameraMode: f.cameraMode,
				rb: f.rb,
				qb: f.qb,
				blockers: f.blockers,
				defenders: f.defenders,
				playStartYard: f.playStartYard,
				trail: f.trail
			}))
		};
		const list = loadSavedClips();
		list.unshift(clip);
		persistSavedClips(list.slice(0, SAVED_CLIPS_MAX));
		renderSavedClips();
		setPlayCall("Saved \"" + clip.name + "\" (" + list.length + "/" + SAVED_CLIPS_MAX + ")");
	}

	function startFullReplay() {
		const frames = lastPlayFrames && lastPlayFrames.length >= 6 ? lastPlayFrames
			: (playFrames && playFrames.length >= 6 ? playFrames : null);
		if (!frames) {
			setPlayCall("No replay yet — finish a play first");
			return;
		}
		fullReplay = {
			frames,
			i: 0,
			acc: 0,
			playing: false
		};
		if (cameraMode === "free") {
			freeOrbit = { theta: camOp.theta || 0, phi: camOp.phi != null ? camOp.phi : 0.82, zoom: camOp.zoom || 1 };
		}
		camAdjust = false;
		resetCamOp();
		camOp.theta = 0;
		camOp.phi = Math.PI / 2;
		camOp.zoom = 1;
		replayCursorFree = false;
		const seed = frames[0] && frames[0].rb;
		applyLook(seed ? seed.x : FIELD_WIDTH / 2, seed ? seed.y : 50);
		replayLeaveEdge = true;
		replayToggleEdge = true;
		replayHudRate = 0;
		cheerHoldT = 0;
		cheerAmp = 0;
		cheerHoldArmed = false;
		setPaused(true);
		pauseBannerHTML("replay");
	}
	function nearestTeammate(side, skip = null) {
		const origin = playingDefense() ? userDefender : rb;
		const pool = playingDefense() ? defenders : blockers;
		if (!origin || !pool.length) return null;
		const f = origin.facing || (playingDefense() ? -Math.PI / 2 : Math.PI / 2);
		const rx = Math.sin(f);
		const ry = -Math.cos(f);
		const behind = !playingDefense() && rb && rb.y < playStartYard - .2;
		let best = null;
		let nd = behind ? 32 : 22;
		for (const b of pool) {
			if (!b || b === skip || b === origin) continue;
			if (b.active === false) continue;
			const lat = (b.x - origin.x) * rx + (b.y - origin.y) * ry;
			if (side < 0 && lat > .55) continue;
			if (side > 0 && lat < -.55) continue;
			const dd = dist(b, origin);
			if (dd < nd) {
				nd = dd;
				best = b;
			}
		}
		if (!best) for (const b of pool) {
			if (!b || b === skip || b === origin) continue;
			if (b.active === false) continue;
			const dd = dist(b, origin);
			if (dd < nd + 8) {
				nd = dd;
				best = b;
			}
		}
		return best;
	}
	function steerTeammate(b, sdx, sdy, dt) {
		if (!b) return;
		const origin = playingDefense() ? userDefender : rb;
		if (!origin) return;
		b._userCtrl = 0.22;
		let dx = Math.cos(origin.facing || (playingDefense() ? -Math.PI / 2 : Math.PI / 2));
		let dy = Math.sin(origin.facing || (playingDefense() ? -Math.PI / 2 : Math.PI / 2));
		const mag = Math.hypot(sdx, sdy);
		if (mag >= .12) {
			dx = sdx / mag;
			dy = sdy / mag;
		}
		const spd = Math.min(10.5, (b.speed || 8.6) * (playingDefense() ? defMult(b) : offMult(b)) * 1.05);
		const step = spd * Math.min(dt, 0.05);
		b.vx = dx * spd;
		b.vy = dy * spd;
		b.x += dx * step;
		b.y += dy * step;
		b.facing = Math.atan2(dy, dx);
		b.x = clamp(b.x, fieldLeft() + .8, fieldRight() - .8);
		b.y = clamp(b.y, playStartYard - 10, 105);
	}
	function stiffTarget(side) {
		if (!rb) return null;
		let best = null;
		let nd = 3.35;
		for (const d of defenders) {
			if (d.state === "whiff" || d.state === "recover") continue;
			const dx = d.x - rb.x;
			if (side < 0 && dx > -.2) continue;
			if (side > 0 && dx < .2) continue;
			const dd = dist(d, rb);
			if (dd < nd) {
				nd = dd;
				best = d;
			}
		}
		return best;
	}
	function startFumble(hitter, force) {
		if (!force && !fumblesOn) return;
		if (!rb) return;
		const playYards = Math.round(rb.y - playStartYard);
		score = Math.max(0, score - 50);
		rb.hasBall = false;
		rb.low = false;
		rb.takenDown = false;
		rb.downAmt = 0;
		rb.hop = 0;
		celebrateTimer = 0;
		const house = rb.y <= 20;
		const playY = rb.y;
		if (Math.random() < .4) {
			hitter.hasBall = true;
			hitter.facing = -Math.PI / 2;
			fumbleSeq = {
				phase: "return",
				t: 0,
				defender: hitter,
				ballX: hitter.x,
				ballY: hitter.y,
				ballVx: 0,
				ballVy: 0,
				ballHop: 0,
				ballHopV: 0,
				bounces: 0,
				returnStartY: hitter.y,
				house,
				playYards,
				fumbleY: playY,
				actLock: 0,
				scored: false
			};
			rb.low = true;
			return;
		}
		const away = Math.atan2(hitter.y - rb.y, hitter.x - rb.x) || (Math.random() - .5) * Math.PI;
		const chaos = (Math.random() - .5) * 2.6;
		const ang = away * .4 + chaos;
		const pop = 1.15 + Math.random() * 3.5;
		fumbleSeq = {
			phase: "loose",
			t: 0,
			defender: null,
			ballX: rb.x + Math.cos(ang) * .4,
			ballY: rb.y + Math.sin(ang) * .4,
			ballVx: Math.cos(ang) * pop * (.85 + Math.random() * .5),
			ballVy: Math.sin(ang) * pop * (.85 + Math.random() * .5),
			ballHop: 1.8 + Math.random() * 1.4,
			ballHopV: 5.5 + Math.random() * 3.5,
			bounces: 0,
			returnStartY: rb.y,
			house,
			playYards,
			fumbleY: rb.y,
			actLock: 0,
			scored: false
		};
		rb.vx = -Math.cos(ang) * 1.4;
		rb.vy = -Math.sin(ang) * .6;
	}
	function offenseNearBall(bx, by, range) {
		if (rb && dist(rb, {
			x: bx,
			y: by
		}) < range) return true;
		return blockers.some((b) => b.active && dist(b, {
			x: bx,
			y: by
		}) < range);
	}
	function chaseToBall(p, bx, by, spd, dt) {
		const ang = Math.atan2(by - p.y, bx - p.x);
		p.x += Math.cos(ang) * spd * dt;
		p.y += Math.sin(ang) * spd * dt;
		p.facing = ang;
		p.x = clamp(p.x, fieldLeft() + .8, fieldRight() - .8);
	}
	function finishOffFumbleRecover(spotY, down) {
		if (!fumbleSeq || !rb) return;
		score += 50;
		score = Math.max(0, score);
		rb.hasBall = false;
		if (down) {
			rb.low = true;
			const yg = Math.round(spotY - playStartYard);
			fumbleSeq = null;
			endPlay("Fumble recovered", yg, clamp(spotY, 0, 100));
		} else fumbleSeq = null;
	}
	function pickSpikeStyle(player) {
		// 7 horizontal zones across the goal line
		// 1 & 7: near pylons (2.5 yd) → pylon leap
		// 2: between 1 and left post → nonchalant / casual
		// 3: left post area → windmill
		// 4: between posts → punt through uprights
		// 5: right post area → windmill
		// 6: between right post and right pylon → windmill spike
		const fl = fieldLeft(), fr = fieldRight();
		const mid = (fl + fr) / 2;
		// Uprights ~18.5 ft apart ≈ 3.1 yd from center each side
		const postHalf = postGapHalf();
		const leftPost = mid - postHalf;
		const rightPost = mid + postHalf;
		const pylonW = 2.8;
		const postR = 4.2; // windmill zone radius around each upright
		const x = player.x;
		if (x <= fl + pylonW) return "pylon";              // zone 1 near left pylon
		if (x >= fr - pylonW) return "pylon";              // zone 7 near right pylon
		// Zone 4: between the uprights
		if (x >= leftPost && x <= rightPost) return "punt";
		// Zones 3, 5, 6: windmill spike (dunk removed)
		if (Math.abs(x - leftPost) <= postR) return "force"; // zone 3
		if (Math.abs(x - rightPost) <= postR) return "force"; // zone 5
		if (x < leftPost - postR) return "casual";          // zone 2
		return "force"; // zone 6 windmill
	}
	function spikeDirFromInput(player) {
		if (Math.abs(lastSteer.dx) > .18) return lastSteer.dx < 0 ? -1 : 1;
		if (player && Math.abs(player.vx) > .45) return player.vx < 0 ? -1 : 1;
		const mid = (fieldLeft() + fieldRight()) / 2;
		return player && player.x < mid ? -1 : 1;
	}
	function sealDiveLand(player) {
		if (!player) return;
		if (player._landX == null) player._landX = player.x;
		if (player._landY == null) player._landY = player.y;
		if (player.y > player._landY + 0.001) {
			player._landX = player.x;
			player._landY = player.y;
		}
	}
	function startScoreSeq(who, player, spike, playYards, nextStart) {
		tdZoom = true;
		const diveLand = !!(player && (player._diveScore || player.takenDown || player.recoverKind === "dive" || activeMove === "dive" || dive));
		if (player) player._diveScore = false;
		const doSpike = !diveLand;
		const style = who === "off" ? pickSpikeStyle(player) : (spike ? "force" : "casual");
		const pendingStyle = (diveLand && player && player._oobLand) ? "casual" : style;
		scoreSeq = {
			who,
			t: 0,
			spike: doSpike,
			spikeStyle: diveLand ? "none" : style,
			spikeDir: spikeDirFromInput(player),
			player,
			ballX: player.x,
			ballY: player.y,
			ballHop: 0,
			ballHopV: 0,
			ballOut: false,
			nextStart,
			playYards,
			bounced: false,
			bounceN: 0,
			hanging: false,
			diveLand,
			diveRecover: diveLand,
			pendingStyle,
			pendingSpike: who === "off" || !!spike
		};
		if (diveLand) {
			sealDiveLand(player);
			if (player._landX != null) player.x = player._landX;
			if (player._landY != null) player.y = player._landY;
			layOutPlayer(player, player.fallSide || 1);
			player.hasBall = true;
			player.vx = 0;
			player.vy = 0;
			player.gaitSpd = 0;
			if (!(player.hop > 0.35)) stampTurfImpact(player, 0.78);
		} else {
			player.hasBall = !doSpike;
			player.hop = 0;
			player.low = false;
			haltPlayerMotion(player);
		}
		lastPlayFrames = playFrames.slice();
		if (who === "off") startPip(6.5);
	}
	function tickScore(dt) {
		const s = scoreSeq;
		if (!s) return;
		// Celebration rate tracks game speed linearly but milder (k≈0.45)
		const diveAccel = (s.diveRecover || s._dived) ? 1.32 : 1;
		const celebRate = Math.max(0.55, 1 + 0.45 * (playSpeed - 1)) * diveAccel;
		const cdt = dt * celebRate;
		s.t += cdt;
		const p = s.player;
		const dir = s.spikeDir || 1;
		tickTurfFx(p, cdt);
		(blockers || []).forEach((b) => {
			if (b === p) return;
			tickTurfStain(b, cdt);
			b.vx = 0;
			b.vy = 0;
			b.engageT = 0;
			b.blockTarget = null;
			b.driveBlock = false;
		});
		(defenders || []).forEach((d) => {
			if (d === p) return;
			tickTurfStain(d, cdt);
			d.vx = 0;
			d.vy = 0;
			d.engageT = 0;
		});
		if (s.diveRecover) {
			sealDiveLand(p);
			if (p._landX != null) p.x = p._landX;
			if (p._landY != null) p.y = p._landY;
			p.vx = 0;
			p.vy = 0;
			p.gaitSpd = 0;
			if (p.hop > 0) p.hop = Math.max(0, p.hop - 8 * cdt);
			else if (!p._diveTurf) {
				p._diveTurf = true;
				stampTurfImpact(p, 0.78);
			}
			const GETUP = 0.38;
			const u = Math.min(1, s.t / GETUP);
			if (u < 0.48) {
				layOutPlayer(p, p.fallSide || 1);
				p.downAmt = 1;
			} else {
				p.takenDown = true;
				p.fallLayout = 1;
				p.low = true;
				p.downAmt = Math.max(0, 1 - (u - 0.48) / 0.52);
				p.hop = 0;
			}
			if (s.t < GETUP) return;
			s.diveRecover = false;
			s.diveLand = false;
			s._dived = true;
			p.takenDown = false;
			p.downAmt = 0;
			p.low = false;
			p.hop = 0;
			p.recoverKind = null;
			p.recoverT = 0;
			s.t = 0.001;
			s.spike = !!s.pendingSpike;
			s.spikeStyle = s.pendingStyle || (s.who === "off" ? pickSpikeStyle(p) : "casual");
			p.hasBall = !s.spike;
		} else if (s.who === "off") {
			const runOut = s.t < 0.48 && p.y < 103.2;
			if (runOut) {
				p.y = Math.min(103.2, p.y + 3.2 * cdt);
				p.vy = 3.2;
			} else {
				p.vy = 0;
				p.vx = 0;
			}
		} else {
			p.y = Math.max(-6.2, p.y - 8.2 * celebRate * dt);
			p.vy = -8.2 * celebRate;
		}
		if (s.spikeStyle === "pylon" && s.spike && !s.diveLand && !p._oobLand) {
			// Diagonal leap toward pylon — stay mostly in camera frame
			const toward = (p.x < (fieldLeft() + fieldRight()) / 2) ? -1 : 1;
			const edge = toward < 0 ? fieldLeft() + 0.6 : fieldRight() - 0.6;
			if (s.t < .5) {
				p.x += (edge - p.x) * Math.min(1, 3.2 * cdt);
				p.y = Math.min(101.2, p.y + 2.8 * cdt);
				p.hop = Math.sin(s.t / .5 * Math.PI) * 2.6;
				p.low = false;
			} else {
				p.x = edge;
				p.hop = Math.max(0, 1.3 - (s.t - .5) * 3.2);
				p.low = s.t > .65;
			}
		} else if (s.spikeStyle === "force" && s.spike) {
			if (s.t < .28) {
				p.x = clamp(p.x + dir * 6.4 * dt, fieldLeft() + 1.2, fieldRight() - 1.2);
				p.hop = .28 + Math.abs(Math.sin(s.t * 26)) * .32;
				p.low = false;
			} else if (s.t < .62) {
				p.hop = .45 + (s.t - .28) * 1.35;
				p.low = false;
			} else p.low = true;
		} else if (!s.diveLand && !p._oobLand) {
			p.x = clamp(p.x, fieldLeft() + 1, fieldRight() - 1);
		}
		const releaseAt = s.spikeStyle === "force" ? .62 : s.spikeStyle === "pylon" ? .48 : s.spikeStyle === "post" ? .42 : .32;
		if (s.spike && !s.ballOut && s.t > releaseAt) {
			s.ballOut = true;
			p.hasBall = false;
			// Keep dunk hang hop; only set hop for styles that need it
			if (s.spikeStyle === "force") p.hop = .7;
			else if (s.spikeStyle !== "pylon") p.hop = 1.1;
			const mid = (fieldLeft() + fieldRight()) / 2;
			if (s.spikeStyle === "punt") {
				s.ballX = p.x;
				s.ballY = p.y + .4;
				s.ballHop = 5.2;
				s.ballHopV = 11.4;
				s.ballVx = (mid - p.x) * .35;
				s.ballVy = s.who === "off" ? 14.5 : -14.5;
			} else if (s.spikeStyle === "throw") {
				s.ballX = p.x;
				s.ballY = p.y + .5;
				s.ballHop = 3.6;
				s.ballHopV = 6.2;
				s.ballVx = (mid - p.x) * .55;
				s.ballVy = s.who === "off" ? 18 : -18;
			} else if (s.spikeStyle === "post") {
				s.ballX = p.x;
				s.ballY = p.y + .35;
				s.ballHop = 3.4;
				s.ballHopV = 10.4;
				s.ballVx = (mid - p.x) * 1.25;
				s.ballVy = 11.6;
				p.low = true;
			} else if (s.spikeStyle === "pylon") {
				const toward = (p.x < (fieldLeft() + fieldRight()) / 2) ? -1 : 1;
				s.ballX = p.x + toward * 0.9;
				s.ballY = p.y + 0.3;
				s.ballHop = 1.8;
				s.ballHopV = 4.2;
				s.ballVx = toward * (3.2 + Math.random() * 2);
				s.ballVy = 2.5;
				p.low = true;
				s.pylonHit = true;
			} else if (s.spikeStyle === "force") {
				s.ballX = p.x + dir * .85;
				s.ballY = p.y + .15;
				s.ballHop = 2.35;
				s.ballHopV = -7.2;
				s.ballVx = dir * (6.4 + Math.random() * 2.8);
				s.ballVy = .5 + Math.random() * 1.6;
				p.low = true;
			} else {
				s.ballX = p.x + .35;
				s.ballY = p.y + (s.who === "off" ? .6 : -.6);
				s.ballHop = 2.15;
				s.ballHopV = 7.2;
				s.ballVx = (Math.random() - .5) * 1.2;
				s.ballVy = s.who === "off" ? 1.6 : -1.6;
			}
		}
		if (s.ballOut) {
			const g = s.spikeStyle === "punt" || s.spikeStyle === "throw" || s.spikeStyle === "post" ? 11.2 : s.spikeStyle === "force" ? 28 : 18;
			s.ballHopV -= g * dt;
			s.ballHop += s.ballHopV * dt;
			s.ballX += (s.ballVx || 0) * dt;
			s.ballY += (s.ballVy || (s.who === "off" ? 1.4 : -1.4)) * dt;
			if (s.spikeStyle === "punt" || s.spikeStyle === "throw" || s.spikeStyle === "post") s.ballVy = (s.ballVy || 0) - 1.6 * dt;
			if (s.ballHop <= 0) {
				s.ballHop = 0;
				s.bounceN = (s.bounceN || 0) + 1;
				if (s.spikeStyle === "force" && s.bounceN <= 5) {
					s.bounced = true;
					s.ballHop = .05;
					s.ballHopV = (8.4 - s.bounceN * 1.05) * (.75 + Math.random() * .7);
					const kick = s.bounceN % 2 === 0 ? 1 : .28;
					s.ballVx = dir * (2.8 + Math.random() * 5.2) * kick + (Math.random() - .5) * 4.2;
					s.ballVy = (Math.random() - .28) * 6.5;
				} else {
					s.ballHopV *= s.spikeStyle === "force" ? -.38 : -.35;
					if (Math.abs(s.ballHopV) < 1.2) s.ballHopV = 0;
				}
			}
		}
		if (p.hop > 0 && !(s.spikeStyle === "force" && s.t < .68)) p.hop = Math.max(0, p.hop - 4 * dt);
		const hold = (s.who === "def" ? s.spike ? 1.18 : .48 : s.spikeStyle === "force" ? 1.85 : s.spikeStyle === "pylon" ? 1.7 : s.spikeStyle === "punt" || s.spikeStyle === "throw" ? 1.55 : s.spikeStyle === "post" ? 1.4 : s.spike ? 1.12 : 1.55) + 0.1;
		if (s.t > hold) {
			const next = s.nextStart;
			const who = s.who;
			const yg = s.playYards;
			scoreSeq = null;
			fumbleSeq = null;
			if (who === "off") endPlay("Touchdown! +100", yg, next);
			else endPlay("Pick-six! −50", yg, next);
		}
	}
	function tickFumble(dt, inp) {
		const fs = fumbleSeq;
		if (!fs) return;
		fs.t += dt;
		if (fs.actLock > 0) fs.actLock -= dt;
		if (fs.phase === "loose") {
			fs.ballHopV -= 22 * dt;
			fs.ballHop += fs.ballHopV * dt;
			fs.ballX += fs.ballVx * dt;
			fs.ballY += fs.ballVy * dt;
			if (fs.ballHop <= 0) {
				fs.ballHop = 0;
				if (Math.abs(fs.ballHopV) > 2.4 && fs.bounces < 6) {
					fs.bounces += 1;
					fs.ballHopV *= -.52 - Math.random() * .12;
					const mag = Math.hypot(fs.ballVx, fs.ballVy) * (.55 + Math.random() * .55);
					const ang = Math.atan2(fs.ballVy, fs.ballVx) + (Math.random() - .5) * 2.5;
					fs.ballVx = Math.cos(ang) * mag * (.7 + Math.random() * .7);
					fs.ballVy = Math.sin(ang) * mag * (.7 + Math.random() * .7);
				} else {
					fs.ballHopV = 0;
					fs.ballVx *= .86;
					fs.ballVy *= .86;
				}
			}
			fs.ballX = clamp(fs.ballX, fieldLeft() + .6, fieldRight() - .6);
			fs.ballY = clamp(fs.ballY, -8, 108);
			const ball = {
				x: fs.ballX,
				y: fs.ballY
			};
			if (rb) {
				let spd = rb.speed * .95;
				if (inp.sprint) spd *= SPRINT_MULT;
				const mx = inp.dx * spd;
				const my = inp.dy * spd;
				rb.x += mx * dt;
				rb.y += my * dt;
				rb.vx = mx;
				rb.vy = my;
				if (Math.hypot(mx, my) > .4) rb.facing = Math.atan2(my, mx);
				rb.x = clamp(rb.x, fieldLeft() + .8, fieldRight() - .8);
				rb.low = false;
			}
			blockers.forEach((b) => {
				if (!b.active) return;
				chaseToBall(b, fs.ballX, fs.ballY, b.speed * .92, dt);
			});
			defenders.forEach((d) => {
				if (d.state === "whiff") return;
				chaseToBall(d, fs.ballX, fs.ballY, Math.max(d.speed, 8.3) * 1.05, dt);
			});
			const rbRange = rb ? dist(rb, ball) : 99;
			if (rb && fs.actLock <= 0 && rbRange < 2.15 && inp.dive) {
				fs.actLock = .4;
				if (Math.random() < .9) {
					rb.low = true;
					rb.x = fs.ballX;
					rb.y = fs.ballY;
					finishOffFumbleRecover(fs.ballY, true);
					return;
				}
				fs.ballVx += (Math.random() - .5) * 6;
				fs.ballVy += (Math.random() - .5) * 6;
				fs.ballHop = 1.1;
				fs.ballHopV = 4;
			}
			if (rb && fs.actLock <= 0 && rbRange < 2 && inp.truck) {
				fs.actLock = .4;
				if (Math.random() < .58) {
					rb.x = fs.ballX;
					rb.y = fs.ballY;
					finishOffFumbleRecover(fs.ballY, false);
					return;
				}
				fs.ballVx += (Math.random() - .5) * 5;
				fs.ballVy += (Math.random() - .5) * 5;
				fs.ballHop = .9;
				fs.ballHopV = 3.4;
			}
			let best = null;
			let nd = 1.12;
			defenders.forEach((d) => {
				if (d.state === "whiff" || d.state === "recover") return;
				const dd = dist(d, ball);
				if (dd < nd) {
					nd = dd;
					best = d;
				}
			});
			if (best && fs.t > .22) {
				const rec = best;
				rec.hasBall = true;
				if (offenseNearBall(fs.ballX, fs.ballY, 3.8)) {
					rec.low = true;
					rec.hasBall = true;
					const spot = clamp(fs.ballY, 0, 100);
					fumbleSeq = null;
					endPlay("Fumble! −50", fs.playYards, clamp((fs.fumbleY ?? fs.ballY) - 10, 1, 99));
					return;
				}
				fs.phase = "return";
				fs.t = 0;
				fs.defender = rec;
				fs.returnStartY = rec.y;
				fs.house = true;
				fs.returnSpd = Math.max(70, (rec.y - 5) / .22);
				rec.facing = -Math.PI / 2;
			}
			if (fs.t > 6.5) {
				const spot = clamp(fs.ballY, 0, 100);
				fumbleSeq = null;
				endPlay("Fumble! −50", fs.playYards, clamp((fs.fumbleY ?? fs.ballY) - 10, 1, 99));
			}
			return;
		}
		const rec = fs.defender;
		if (!rec) return;
		rec.hasBall = true;
		rec.sprintOn = true;
		const cruise = Math.max(rec.baseSpeed || 8.4, 8.4) * SPRINT_MULT * 1.05 * playSpeed;
		rec.vy = rec.y > 5.15 ? -(fs.returnSpd || 70) : -cruise;
		rec.vx = 0;
		rec.y += rec.vy * dt;
		rec.facing = -Math.PI / 2;
		fs.ballX = rec.x;
		fs.ballY = rec.y;
		if (rec.y <= 0) {
			rec.hasBall = true;
			const nextStart = clamp((fs.fumbleY ?? rec.y) - 20, 1, 99);
			startScoreSeq("def", rec, true, fs.playYards, nextStart);
			fumbleSeq = null;
			return;
		}
	}
	function startMove(id) {
		if (moveCooldown > 0 || !handoffDone) return;
		if (getUpT > 0) return;
		if (dive || activeMove === "dive") return;
		if (id === "dive" && diveHangT > 0.4) return;
		activeMove = id;
		const durs = {
			jukeL: .28,
			jukeR: .28,
			shakeL: .34,
			shakeR: .34,
			deadleg: .32,
			deadlegL: .34,
			deadlegR: .34,
			hurdle: .58,
			hurdleL: .62,
			hurdleR: .62,
			spin: .56,
			dive: 1.65,
			truck: .85,
			truckL: .85,
			truckR: .85,
			stiffL: .45,
			stiffR: .45
		};
		const cds = {
			jukeL: .75,
			jukeR: .75,
			shakeL: 1.05,
			shakeR: 1.05,
			deadleg: .9,
			deadlegL: .95,
			deadlegR: .95,
			hurdle: 1.1,
			hurdleL: 1.15,
			hurdleR: 1.15,
			spin: 1.1,
			dive: 1.3,
			truck: .95,
			truckL: .95,
			truckR: .95,
			stiffL: .95,
			stiffR: .95
		};
		moveDur = durs[id] ?? .3;
		moveTimer = moveDur;
		moveCooldown = cds[id] ?? .8;
		if (id === "stiffL" || id === "stiffR") {
			if (!stiffTarget(id === "stiffL" ? -1 : 1)) {
				activeMove = null;
				moveTimer = 0;
				moveCooldown = .08;
				return;
			}
		}
		if (id === "truck" || id === "truckL" || id === "truckR") {
			if (rb) rb.truckDir = id === "truckL" ? -1 : id === "truckR" ? 1 : 0;
		}
		if (id.startsWith("juke") || id.startsWith("shake") || id.startsWith("deadleg") || id === "spin") tryMiss(id);
		if (id === "spin" && rb) {
			let near = null, nd = 9;
			for (const d of defenders) {
				if (d.state === "whiff" || d.state === "recover") continue;
				const dd = dist(d, rb);
				if (dd < nd) {
					nd = dd;
					near = d;
				}
			}
			let side = Math.abs(lastSteer.dx) > .2 ? Math.sign(lastSteer.dx) : near ? Math.sign(rb.x - near.x) : 0;
			if (!side) side = rb.x >= snapX() ? 1 : -1;
			rb.spinSide = side;
			rb.spinT = 1;
		}
		if (id.startsWith("hurdle")) {
			const h = resolveHurdle();
			hurdleTarget = h.target;
			hurdleOk = h.ok;
			hurdleDidTrip = false;
			h.ok && h.target;
		} else if (id === "dive" && rb) {
			rb._diveTurf = false;
			rb._diveScore = false;
			rb._diveOob = false;
			rb._oobLand = false;
			rb._landX = null;
			rb._landY = null;
			let dx = lastSteer.dx;
			let dy = lastSteer.dy;
			const mag = Math.hypot(dx, dy);
			if (mag < .14) {
				dx = 0;
				dy = 1;
			} else {
				dx /= mag;
				dy /= mag;
			}
			const near = defenders.filter((d) => d.state !== "whiff" && d.state !== "recover" && dist(d, rb) < (inGoal() ? 4.4 : 3.55)).sort((a, b) => dist(a, rb) - dist(b, rb));
			const squeeze = near.length >= 2 || inGoal() && near.length >= 1;
			if (squeeze && near.length) {
				const a = near[0];
				const b = near[1] || {
					x: a.x + (a.x >= rb.x ? 2.4 : -2.4),
					y: a.y
				};
				let tx = (a.x + b.x) / 2 - rb.x;
				let ty = (a.y + b.y) / 2 - rb.y;
				if (Math.abs(tx) < .35) tx = (rb.x < a.x ? -1 : 1) * .8;
				let tm = Math.hypot(tx, ty) || 1;
				dx = dx * .28 + tx / tm * .72;
				dy = Math.max(.45, dy * .28 + ty / tm * .72);
				const nm = Math.hypot(dx, dy) || 1;
				dx /= nm;
				dy /= nm;
			}
			const nearLeft = rb.x - fieldLeft() < 5.4;
			const nearRight = fieldRight() - rb.x < 5.4;
			const pylonDive = rb.y >= 94.4 && (nearLeft || nearRight);
			if (pylonDive) {
				const pylX = nearLeft ? fieldLeft() + .62 : fieldRight() - .62;
				const pylY = 100.2;
				let tx = pylX - rb.x;
				let ty = pylY - rb.y;
				ty = Math.max(ty, Math.abs(tx) * 1.22);
				const tm = Math.hypot(tx, ty) || 1;
				dx = tx / tm;
				dy = ty / tm;
			}
			const pylonReach = pylonDive ? Math.hypot((nearLeft ? fieldLeft() + .62 : fieldRight() - .62) - rb.x, 100.2 - rb.y) : 0;
			let launchYards = pylonDive ? Math.min(6.1, pylonReach + .7) : near.length ? 4.2 + Math.random() * .9 : 5;
			const ezLeap = rb.y >= 94.2 || playStartYard >= 95;
			if (ezLeap) {
				const needPlane = Math.max(0, 100.45 - rb.y);
				launchYards = Math.max(launchYards, 8, needPlane + 1.2);
				if (near.length) launchYards = Math.max(launchYards, 7.2, needPlane + 0.9);
				if (pylonDive) launchYards = Math.max(launchYards, Math.min(8.4, pylonReach + 2.6), 6.1);
			} else {
				if (inGoal() && !pylonDive) launchYards = Math.max(launchYards, 4.6);
				if (pylonDive && dy > .08) launchYards = Math.min(launchYards, (100.85 - rb.y) / dy + .35);
			}
			dive = {
				dx,
				dy,
				startX: rb.x,
				startY: rb.y,
				phase: "launch",
				launchYards,
				slideYards: ezLeap || pylonDive ? 0 : near.length ? 0 : 3 + Math.random() * 2,
				squeeze,
				contacted: false,
				contactX: rb.x,
				contactY: rb.y,
				afterContactYards: inGoal() ? 5.6 : 2 + Math.random() * 1.05,
				pylon: pylonDive,
				ezLeap,
				duck: squeeze && !ezLeap
			};
		} else if (id.startsWith("shake"));
		else if (id.startsWith("deadleg"));
	}
	function finishDive(reason) {
		if (!rb) {
			dive = null;
			activeMove = null;
			return;
		}
		rb._landX = rb.x;
		rb._landY = rb.y;
		const pastSideline = rb.x < fieldLeft() || rb.x > fieldRight() || rb.x <= fieldLeft() + .2 || rb.x >= fieldRight() - .2;
		if (pastSideline) rb._oobLand = true;
		if (ballBrokePlane(rb)) {
			rb._diveScore = true;
			dive = null;
			activeMove = null;
			scoreTouchdown();
			return;
		}
		const sidelineOut = !!(rb._diveOob || rb._oobLand || pastSideline || isSidelineOob(rb));
		if (sidelineOut) {
			stampTurfImpact(rb, 0.7);
			layOutPlayer(rb, rb.fallSide || Math.sign((dive && dive.dx) || 1));
			rb.hop = 0;
			rb.low = true;
			rb.x = rb._landX;
			rb.y = rb._landY;
			rb._diveOob = false;
			const yg = Math.round(rb.y - playStartYard);
			dive = null;
			activeMove = null;
			endPlay("Out of bounds", yg);
			awardPlayYards(yg);
			return;
		}
		// No defender contact → brief grounded recovery, then get back up
		if (dive && !dive.contacted) {
			stampTurfImpact(rb, 0.7);
			layOutPlayer(rb, rb.fallSide || Math.sign((dive && dive.dx) || 1));
			rb.hop = 0;
			rb.low = true;
			rb.vx = 0;
			rb.vy = 0;
			dive = null;
			activeMove = null;
			moveTimer = 0;
			moveCooldown = 1.55;
			getUpT = 0.92;
			diveHangT = 1.05;
			sprintCharge = Math.min(sprintCharge, 0.28);
			sprintHoldT = 0;
			return;
		}
		const yg = Math.round(rb.y - playStartYard);
		rb.hop = 0;
		rb.low = true;
		dive = null;
		activeMove = null;
		endPlay(reason, yg);
		awardPlayYards(yg);
	}
	function ballBrokePlane(carrier) {
		if (!carrier) return false;
		if (carrier.y >= 100) return true;
		const nearL = carrier.x - fieldLeft() < 3.5;
		const nearR = fieldRight() - carrier.x < 3.5;
		const pylonish = nearL || nearR;
		const diving = !!(dive && dive.pylon) || activeMove === "dive" && pylonish;
		if (pylonish && carrier.y >= 98.25 && (diving || carrier.hop > .2)) return true;
		return false;
	}
	function isSidelineOob(carrier) {
		if (!carrier) return false;
		if (ballBrokePlane(carrier)) return false;
		return carrier.x <= fieldLeft() + .2 || carrier.x >= fieldRight() - .2;
	}
	function scoreTouchdown() {
		if (!rb || scoreSeq) return;
		// Seal trail at the goal line — fill any gap so path reaches plane
		if (showRunnerTrail && rb) {
			for (const p of runnerTrail) { if (p.y > 100) p.y = 100; }
			const last = runnerTrail.length ? runnerTrail[runnerTrail.length - 1] : null;
			const x0 = last ? last.x : rb.x;
			const y0 = last ? last.y : rb.y;
			if (!last || y0 < 99.2) {
				const steps = 4;
				for (let i = 1; i <= steps; i++) {
					const t = i / steps;
					runnerTrail.push({
						x: x0 + (rb.x - x0) * t,
						y: Math.min(100, y0 + (100 - y0) * t)
					});
				}
			} else {
				runnerTrail.push({ x: rb.x, y: 100 });
			}
		}
		const yg = Math.max(0, Math.round(rb.y - playStartYard));
		tdCount += 1;
		score += 100;
		tdZoom = true;
		postTdMode = postTdMode || "random";
		tdIncrement = Number.isFinite(parseInt($("incrementInput")?.value, 10)) ? parseInt($("incrementInput").value, 10) : 0;
		randMin = clamp(parseInt($("randMin")?.value || "20", 10) || 20, 1, 99);
		randMax = clamp(parseInt($("randMax")?.value || "80", 10) || 80, 1, 99);
		const nextStart = chooseNextStartAfterTD();
		refreshAllNumbers();
		driveStartYard = nextStart;
		dive = null;
		activeMove = null;
		haltPlayerMotion(rb);
		if (rb && rb._landY != null && (rb.takenDown || getUpT > 0 || rb.recoverKind === "dive")) {
			rb._diveScore = true;
		}
		if (rb && rb._diveScore) {
			sealDiveLand(rb);
			rb.x = rb._landX;
			rb.y = rb._landY;
			if (rb.x < fieldLeft() || rb.x > fieldRight()) rb._oobLand = true;
			layOutPlayer(rb, rb.fallSide || 1);
			stampTurfImpact(rb, 0.78);
		}
		startScoreSeq("off", rb, celebrateTimer > 0, yg, nextStart);
	}
	function inGoal() {
		return playStartYard >= 95 || !!(rb && rb.y >= 94.6);
	}
	function yieldBlocker(b, minD, dd) {
		if (!rb || !b) return;
		let lat = b.sealSide || b.driveSide || Math.sign(b.x - rb.x) || 1;
		const need = minD - dd;
		if (b._escortFrom == null) b._escortFrom = rb.y;
		const shoved = rb.y - b._escortFrom;
		const peel = shoved > 1.8;
		b.x += lat * need * (peel ? 1.85 : 1.25);
		if (peel || b.y <= rb.y + 0.55) {
			b.y = Math.min(b.y + need * 0.12, rb.y + 0.7);
			b.x += lat * Math.min(0.28, 0.06 + shoved * 0.02);
		}
		b.x = clamp(b.x, fieldLeft() + .8, fieldRight() - .8);
	}
	function yieldToCarrier() {
		if (!rb) return;
		blockers.forEach((b) => {
			if (!b.active) return;
			const minD = rb.radius + b.radius + .1;
			const dd = dist(rb, b);
			if (dd < minD && dd > .01) yieldBlocker(b, minD, dd);
			else b._escortFrom = null;
		});
	}
	function separate(group, minDist) {
		for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
			const a = group[i], b = group[j];
			if (!a.active || !b.active) continue;
			const d = dist(a, b);
			if (d < minDist && d > .01) {
				const overlap = (minDist - d) * .38;
				const ang = Math.atan2(b.y - a.y, b.x - a.x);
				a.x -= Math.cos(ang) * overlap;
				a.y -= Math.sin(ang) * overlap * .85;
				b.x += Math.cos(ang) * overlap;
				b.y += Math.sin(ang) * overlap * .85;
				if (Math.abs(a.x - b.x) < .7) {
					const push = (.7 - Math.abs(a.x - b.x)) * .5;
					const s = a.x <= b.x ? -1 : 1;
					a.x += s * push;
					b.x -= s * push;
				}
			}
		}
	}
	function pushPair(a, b, minDist, strength) {
		if (!a || !b) return;
		const d = dist(a, b);
		if (d >= minDist || d <= 0.01) return;
		const overlap = (minDist - d) * strength;
		const ang = Math.atan2(b.y - a.y, b.x - a.x);
		const ca = Math.cos(ang), sa = Math.sin(ang);
		a.x -= ca * overlap;
		a.y -= sa * overlap;
		b.x += ca * overlap;
		b.y += sa * overlap;
	}
	function separateOpposing() {
		if (!playActive || practiceAwaitSnap || tackleAnim || preSnapTimer > 0) return;
		const off = [];
		if (rb) off.push(rb);
		if (qb && qb !== rb) off.push(qb);
		(blockers || []).forEach((b) => off.push(b));
		for (const o of off) {
			if (!o || o.active === false) continue;
			if (o.pancaked || o.takenDown) continue;
			for (const d of defenders) {
				if (!d || d.active === false) continue;
				if (d.pancaked || d.takenDown || d.state === "whiff" || d.state === "recover") continue;
				if (activeMove && String(activeMove).startsWith("hurdle") && d === hurdleTarget) continue;
				const rMin = ((o.radius || 0.85) + (d.radius || 0.85)) * 0.84;
				const engaged = (d.engageT > 0 && o.blockTarget === d) || (o.engageT > 0 && d.blockTarget === o);
				const tackling = o.hasBall && d.atkT > 0 && (d.atkKind === "wrap" || d.atkKind === "dive" || d.atkKind === "hit");
				const wrappingUser = o.hasBall && defWrapPhase === "wrapped" && d === userDefender;
				if (tackling || wrappingUser) {
					pushPair(o, d, rMin * 0.52, 0.22);
				} else if (engaged) {
					pushPair(o, d, rMin * 0.68, 0.3);
				} else {
					pushPair(o, d, rMin, 0.48);
				}
			}
		}
	}
	function chooseNextStartAfterTD() {
		if (postTdMode === "random") {
			// Always OWN 20 through OPP 20 on a 5-yard line: abs 20,25,...,80
			const spots = [];
			for (let y = 20; y <= 80; y += 5) spots.push(y);
			return spots[Math.floor(Math.random() * spots.length)];
		}
		if (postTdMode === "fixed") return clamp(userStartYard, 1, 99);
		const step = Math.abs(tdIncrement) || 5;
		if (postTdMode === "decreasing") return clamp(driveStartYard - step, 1, 99);
		return clamp(driveStartYard + step, 1, 99); // increasing
	}
	function endPlay(reason, yardsGained, forcedBallYard = null) {
		playActive = false;
		pauseTimer = /Touchdown|Pick-six/.test(reason) ? .12 : 0.12;
		const yg = clamp(yardsGained, -20, 100);
		if (forcedBallYard !== null) ballYard = forcedBallYard;
		else ballYard = clamp(playStartYard + yg, 0, 100);
		if (rb) {
			const oob = reason === "Out of bounds";
			setSpotFromPlay(rb.x, oob);
		}
		if (forcedBallYard !== null) ballX = (hashLeft() + hashRight()) / 2;
		lastPlayFrames = playFrames.slice();
		if (!/Fumble|Pick-six/.test(reason)) totalYards += Math.max(0, Math.round(yg));
		updateBallOn();
		updateHUD();
		activeMove = null;
		sprintCharge = 1;
		sprintHoldT = 0;
		sprintExhausted = false;
		if (lastPlayFrames.length >= 6) {
			setPlayCall(reason + " — Pause or R for instant replay · A snaps next");
		}
		haltPlayerMotion();
		if (/Tackled|Out of bounds|Truck/.test(reason)) spawnPostWhistleScrum(reason);
		else lastPlayContact = null;
	}
	function haltPlayerMotion(keep) {
		function z(pl) {
			if (!pl || pl === keep) return;
			pl.vx = 0;
			pl.vy = 0;
			pl.engageT = 0;
			pl.blockTarget = null;
			pl.driveBlock = false;
		}
		z(rb);
		z(qb);
		(blockers || []).forEach(z);
		(defenders || []).forEach(z);
	}
	function tickCheerAmp(dt, moving) {
		if (moving) cheerAmp = Math.min(1, cheerAmp + dt * 5);
		else cheerAmp = Math.max(0, cheerAmp - dt * 2.8);
	}
	function tickHitCheers(dt) {
		function rec(p) {
			if (!p || !(p.hitCheerT > 0)) return;
			p.hitCheerT = Math.max(0, p.hitCheerT - dt);
			if (p.hitCheerT <= 0) p.hitCheerKind = null;
		}
		(defenders || []).forEach(rec);
	}
	function tickScuffles(dt) {
		function rec(p) {
			if (!p || !(p.scuffleT > 0)) return;
			p.scuffleT -= dt;
			const dur = Math.max(0.01, p.scuffleDur || 1);
			const u = 1 - Math.max(0, p.scuffleT) / dur;
			const pulse = Math.sin(Math.min(1, Math.max(0, u)) * Math.PI);
			const dx = p.scuffleDX || 0;
			const dy = p.scuffleDY || 0;
			if (p.scuffleRole === "push") {
				p.x += dx * dt * 1.55 * pulse;
				p.y += dy * dt * 1.55 * pulse;
				if (Math.hypot(dx, dy) > 0.08) p.facing = Math.atan2(dy, dx);
			} else if (p.scuffleRole === "shoved") {
				p.x += dx * dt * 2.05 * pulse;
				p.y += dy * dt * 2.05 * pulse;
				p.hop = Math.max(p.hop || 0, pulse * 0.1);
			}
			if (p.scuffleT <= 0) {
				p.scuffleT = 0;
				p.scuffleRole = null;
				p.scuffleDur = 0;
			}
		}
		rec(rb);
		rec(qb);
		(blockers || []).forEach(rec);
		(defenders || []).forEach(rec);
	}
	function spawnHitCheers(tackler) {
		if (!tackler || !rb) return;
		const pool = (defenders || []).filter((d) => {
			if (!d || d === tackler) return false;
			if (d.takenDown || d.pancaked || d.state === "whiff") return false;
			return dist(d, rb) < 9.8 || dist(d, tackler) < 8.6;
		});
		for (let i = pool.length - 1; i > 0; i--) {
			const j = (Math.random() * (i + 1)) | 0;
			const tmp = pool[i];
			pool[i] = pool[j];
			pool[j] = tmp;
		}
		const n = Math.min(pool.length, 1 + ((Math.random() * 4) | 0));
		const kinds = ["fist1", "fist2", "jump3"];
		for (let i = 0; i < n; i++) {
			const d = pool[i];
			d.hitCheerKind = kinds[(Math.random() * kinds.length) | 0];
			d.hitCheerDur = d.hitCheerKind === "jump3" ? 1.38 : 0.98;
			d.hitCheerT = d.hitCheerDur;
		}
	}
	function tagTackleContact(anim) {
		if (!anim || anim._postTagged) return;
		anim._postTagged = true;
		const d = anim.defender;
		const kind = anim.kind || (d && (d._tackleKind || d.atkKind)) || "wrap";
		anim.kind = kind;
		const unearned = !!(d && (
			d.engageT > 0 ||
			d.pancaked ||
			d.state === "whiff" ||
			d.state === "recover" ||
			(d._hitAim != null && d._hitAim < 0.4)
		));
		lastPlayContact = { kind, defender: d, unearned, bigHit: kind === "hit" };
		if (kind === "hit") spawnHitCheers(d);
	}
	function spawnPostWhistleScrum(reason) {
		const unearned = !!(lastPlayContact && lastPlayContact.unearned);
		const bigHit = !!(lastPlayContact && lastPlayContact.bigHit);
		const tackler = lastPlayContact && lastPlayContact.defender;
		const standingOff = [];
		if (qb && qb !== rb && !qb.takenDown && !qb.pancaked) standingOff.push(qb);
		(blockers || []).forEach((b) => {
			if (b && b !== rb && !b.takenDown && !b.pancaked && b.state !== "whiff") standingOff.push(b);
		});
		const standingDef = (defenders || []).filter((d) => d && !d.takenDown && !d.pancaked && d.state !== "whiff");
		const usedOff = new Set();
		const usedDef = new Set();
		const pairs = [];
		function addPair(off, def, lead) {
			if (!off || !def || usedOff.has(off) || usedDef.has(def)) return;
			const dx = def.x - off.x, dy = def.y - off.y;
			const L = Math.hypot(dx, dy) || 1;
			usedOff.add(off);
			usedDef.add(def);
			pairs.push({ off, def, lead, dx: dx / L, dy: dy / L });
		}
		if (tackler && standingOff.length && (unearned || bigHit || Math.random() < 0.78)) {
			const near = standingOff.filter((o) => dist(o, tackler) < 7.2).sort((a, b) => dist(a, tackler) - dist(b, tackler));
			const n = Math.min(near.length, unearned ? 2 : 1);
			for (let i = 0; i < n; i++) addPair(near[i], tackler, "off");
		}
		const want = (unearned ? 2 : 0) + (bigHit ? 1 : 0) + (Math.random() < 0.72 ? 1 : 0) + (Math.random() < 0.38 ? 1 : 0);
		const shuffled = standingOff.slice().sort(() => Math.random() - 0.5);
		for (let i = 0; i < shuffled.length && pairs.length < Math.max(1, want); i++) {
			const o = shuffled[i];
			let best = null, bd = /Out of bounds/.test(reason) ? 3.8 : 5.1;
			for (const d of standingDef) {
				if (usedDef.has(d)) continue;
				const dd = dist(o, d);
				if (dd < bd) { bd = dd; best = d; }
			}
			if (best) addPair(o, best, "off");
		}
		if (Math.random() < (unearned ? 0.1 : 0.22) && standingDef.length && standingOff.length) {
			const dPool = standingDef.filter((d) => !usedDef.has(d));
			const d = dPool[(Math.random() * dPool.length) | 0];
			if (d) {
				const oNear = standingOff.filter((o) => !usedOff.has(o) && dist(o, d) < 5.2).sort((a, b) => dist(a, d) - dist(b, d));
				if (oNear[0]) addPair(oNear[0], d, "def");
			}
		}
		const dur = unearned ? 1.28 : 0.98;
		pairs.forEach((pr, i) => {
			const delay = i * 0.07;
			const pusher = pr.lead === "off" ? pr.off : pr.def;
			const victim = pr.lead === "off" ? pr.def : pr.off;
			const towardX = victim.x - pusher.x;
			const towardY = victim.y - pusher.y;
			const L = Math.hypot(towardX, towardY) || 1;
			const ux = towardX / L, uy = towardY / L;
			pusher.scuffleT = dur - delay;
			pusher.scuffleDur = dur;
			pusher.scuffleRole = "push";
			pusher.scuffleDX = ux;
			pusher.scuffleDY = uy;
			victim.scuffleT = dur - delay;
			victim.scuffleDur = dur;
			victim.scuffleRole = "shoved";
			victim.scuffleDX = ux;
			victim.scuffleDY = uy;
		});
		if (pairs.length) pauseTimer = Math.max(pauseTimer, Math.max(0.12, dur - 0.74));
		lastPlayContact = null;
	}
	function stampWhistleRecover() {
		function mark(pl) {
			if (!pl) return;
			if (pl.pancaked) {
				if (!(pl.recoverT > 0)) pl.recoverT = 0.72;
				pl.recoverKind = "pancake";
				return;
			}
			if (pl === rb && activeMove === "dive") {
				pl.recoverKind = "dive";
				pl.recoverT = 0.82;
				pl.low = true;
				return;
			}
			if (pl.atkKind === "dive" && pl.atkT > 0) {
				pl.recoverKind = "dive";
				pl.recoverT = 0.78;
				pl.low = true;
				pl.atkT = 0;
				return;
			}
			if (pl.state === "whiff" || pl.whiffT > 0) {
				pl.recoverKind = "whiff";
				if (!(pl.whiffT > 0)) pl.whiffT = 0.52;
				if (!(pl.recoverT > 0)) pl.recoverT = 0.48;
				pl.low = true;
			}
		}
		mark(rb);
		mark(qb);
		(blockers || []).forEach(mark);
		(defenders || []).forEach(mark);
	}
	function tickPancakeRecover(dt) { tickPostWhistleRecover(dt); }
	function tickPostWhistleRecover(dt) {
		function rec(pl) {
			if (!pl) return;
			pl.vx = 0;
			pl.vy = 0;
			if (pl.pancaked || pl.recoverKind === "pancake") {
				if (!(pl.recoverT > 0)) pl.recoverT = 0.72;
				pl.recoverT -= dt;
				if (pl.recoverT <= 0) {
					pl.recoverT = 0;
					pl.pancaked = false;
					pl.recoverKind = null;
					pl.state = "pursue";
					pl.low = false;
				}
				return;
			}
			if (pl.recoverKind === "dive") {
				if (!(pl.recoverT > 0)) pl.recoverT = 0.78;
				pl.recoverT -= dt;
				pl.low = true;
				if (pl.recoverT <= 0) {
					pl.recoverT = 0;
					pl.recoverKind = null;
					pl.atkKind = null;
					pl.low = false;
					pl.state = "pursue";
				}
				return;
			}
			if (pl.recoverKind === "whiff" || pl.state === "whiff" || pl.whiffT > 0) {
				if (pl.whiffT > 0) pl.whiffT -= dt;
				if (!(pl.recoverT > 0)) pl.recoverT = 0.48;
				pl.recoverT -= dt;
				pl.low = true;
				pl.state = pl.whiffT > 0 ? "whiff" : "recover";
				if (pl.whiffT <= 0 && pl.recoverT <= 0) {
					pl.whiffT = 0;
					pl.recoverT = 0;
					pl.recoverKind = null;
					pl.state = "pursue";
					pl.low = false;
				}
				return;
			}
			if (pl.state === "recover" && pl.recoverT > 0) {
				pl.recoverT -= dt;
				if (pl.recoverT <= 0) {
					pl.recoverT = 0;
					pl.state = "pursue";
					pl.low = false;
					pl.recoverKind = null;
				}
			}
		}
		rec(rb);
		rec(qb);
		(blockers || []).forEach(rec);
		(defenders || []).forEach(rec);
	}
	function awardPlayYards(yg) {
		if (yg > 0) score += yg;
		if (yg >= 10) score += 10;
		if (yg < 0) score = Math.max(0, score - 2);
	}
	function clearAutoStart() {
		if (autoStartTimer) {
			clearInterval(autoStartTimer);
			autoStartTimer = null;
		}
	}
	function kitLabel(u) {
		return "Kit " + ((u && u.id != null ? u.id : 0) + 1);
	}
	function syncAbbrFromOffense() {
		const el = $("teamAbbr");
		if (el && !el.value) el.value = "EE";
		const ni = $("nameInput");
		if (ni && !ni.value) ni.value = "EE";
	}
	function getTeamAbbr() {
		const el = $("teamAbbr");
		if (!el) return "EE";
		el.value = (el.value || "EE").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) || "EE";
		return el.value;
	}
	function rebuildWidthSelect() {
		const sel = $("widthSelect");
		if (!sel) return;
		const current = parseInt(sel.value, 10) || FIELD_WIDTH;
		sel.innerHTML = "";
		for (let w = Field.spec.widthMin; w <= Field.spec.widthMax; w += Field.spec.widthStep) {
			const opt = document.createElement("option");
			opt.value = String(w);
			opt.textContent = w + " yd";
			if (w === current) opt.selected = true;
			sel.appendChild(opt);
		}
		FIELD_WIDTH = Field.setWidth(sel.value);
		refreshScale();
	}
	function rebuildUniformSelects() {
		const offSel = $("offUniform");
		const defSel = $("defUniform");
		if (offSel && defSel) {
			offSel.innerHTML = "";
			defSel.innerHTML = "";
			UNIFORMS.forEach((u) => {
				const o1 = document.createElement("option");
				o1.value = String(u.id);
				o1.textContent = kitLabel(u);
				if (u.id === offUni) o1.selected = true;
				offSel.appendChild(o1);
				const o2 = document.createElement("option");
				o2.value = String(u.id);
				o2.textContent = kitLabel(u);
				if (u.id === defUni) o2.selected = true;
				defSel.appendChild(o2);
			});
		}
		buildUniformBanner();
	}
	function makeUniSwatch(u, selected) {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "uni-swatch";
		btn.setAttribute("role", "option");
		btn.setAttribute("aria-selected", selected ? "true" : "false");
		btn.dataset.id = String(u.id);
		btn.setAttribute("aria-label", kitLabel(u));
		const helm = document.createElement("div");
		helm.className = "uni-helmet";
		helm.style.background = u.helmet;
		const jer = document.createElement("div");
		jer.className = "uni-jersey";
		jer.style.background = u.jersey;
		const pants = document.createElement("div");
		pants.className = "uni-pants";
		pants.style.background = u.pants;
		btn.appendChild(helm);
		btn.appendChild(jer);
		btn.appendChild(pants);
		return btn;
	}
	function buildUniformBanner() {
		const offRow = $("offUniRow");
		const defRow = $("defUniRow");
		if (!offRow || !defRow) return;
		offRow.innerHTML = "";
		defRow.innerHTML = "";
		UNIFORMS.forEach((u) => {
			const ob = makeUniSwatch(u, u.id === offUni);
			ob.onclick = () => selectOffUni(u.id);
			offRow.appendChild(ob);
			const db = makeUniSwatch(u, u.id === defUni);
			db.onclick = () => selectDefUni(u.id);
			defRow.appendChild(db);
		});
	}
	function selectOffUni(id) {
		id = parseInt(id, 10);
		if (!Number.isFinite(id)) return;
		offUni = id;
		if (defUni === offUni) {
			const alt = UNIFORMS.find((u) => u.id !== offUni);
			if (alt) defUni = alt.id;
		}
		rebuildUniformSelects();
		if (typeof paintRoster === "function") paintRoster();
	}
	function selectDefUni(id) {
		id = parseInt(id, 10);
		if (!Number.isFinite(id)) return;
		defUni = id;
		if (defUni === offUni) {
			const alt = UNIFORMS.find((u) => u.id !== defUni);
			if (alt) offUni = alt.id;
		}
		rebuildUniformSelects();
		if (typeof paintRoster === "function") paintRoster();
	}
	function refreshPersonnelUI() {
		Object.entries({
			ol: numOL,
			te: numTE,
			fb: numFB,
			qb: numQB,
			dt: numDT,
			lb: numLBs,
			db: numDBs
		}).forEach(([k, v]) => {
			const el = $(k + "Val");
			if (el) el.textContent = String(v);
		});
	}
	function modalShow(id, on) {
		const el = $(id);
		if (!el) return;
		el.classList.toggle("hidden", !on);
		el.classList.toggle("flex", on);
	}
	function randomizeSurface() {
		surface = randChoice([
			"grass",
			"fieldturf",
			"astroturf"
		]);
		turfPattern = null;
		turfPatternKey = "";
		turfTile = null;
		const sel = $("surfaceSelect");
		if (sel) sel.value = surface;
		// EZ art: diamonds 75%, mountains 25% (off/solid only if user picks)
		ezArtMode = Math.random() < 0.75 ? "diamonds" : "mountains";
		const ez = $("ezArtSelect");
		if (ez) ez.value = ezArtMode;
	}
	function fullRestart(keepOffense = false) {
		clearAutoStart();
		modalShow("nameModal", false);
		userStartYard = (typeof syncStartYardFromUI === "function") ? syncStartYardFromUI() : clamp(parseInt($("startYardInput")?.value || "90", 10) || 90, 1, 99);
		tdIncrement = Number.isFinite(parseInt($("incrementInput")?.value, 10)) ? parseInt($("incrementInput").value, 10) : 0;
		randMin = clamp(parseInt($("randMin")?.value || "20", 10) || 20, 1, 99);
		randMax = clamp(parseInt($("randMax")?.value || "80", 10) || 80, 1, 99);
		postTdMode = postTdMode || "random";
		gameSeconds = parseInt($("minSelect")?.value || "120", 10) || 120;
		clock = gameSeconds;
		if (defUni === offUni) {
			const alt = UNIFORMS.find((u) => u.id !== offUni);
			if (alt) defUni = alt.id;
		}
		randomizeSurface();
		rebuildUniformSelects();
		syncAbbrFromOffense();
		fieldArtSide = "off";
		camCorner = Math.random() < .5 ? "sw" : "nw";
		const cornerEl = $("camCornerSelect");
		if (cornerEl) cornerEl.value = camCorner;
		refreshAllNumbers();
		score = 0;
		totalYards = 0;
		tdCount = 0;
		if (gameMode === "practice") {
			const fixed = clamp(syncPracticeYardFromUI(), 1, 99);
			practiceStartYard = fixed;
			ballYard = fixed;
			playStartYard = fixed;
			driveStartYard = fixed;
		} else {
			ballYard = userToAbsolute(userStartYard);
			playStartYard = ballYard;
			driveStartYard = ballYard;
		}
		ballX = (hashLeft() + hashRight()) / 2;
		sprintCharge = 1;
		sprintHoldT = 0;
		sprintExhausted = false;
		getUpT = 0;
		diveHangT = 0;
		breakaway = false;
		tdZoom = false;
		sessionOver = false;
		playActive = true;
		paused = false;
		pauseTimer = 0;
		huddleOffPickId = null;
		huddleDefPickId = null;
		gameAutoSnapT = 0;
		activeMove = null;
		moveTimer = 0;
		moveCooldown = 0;
		celebrateTimer = 0;
		const pb = $("pauseBtn");
		if (pb) pb.textContent = "Pause";
		const banner = $("pauseBanner");
		if (banner) banner.classList.add("hidden");
		placeEntitiesForNewPlay();
		if (wantsDefHuddle()) {
			playActive = false;
			practiceAwaitSnap = true;
			armGameDefAutoSnap();
		}
		updateBallOn();
		updateHUD();
	}
	function updateHUD() {
		const s = $("score");
		if (s) s.textContent = String(score);
		const ty = $("totalYards");
		if (ty) {
			let shown = totalYards;
			if (scoreSeq && scoreSeq.who === "off") shown = totalYards + Math.max(0, Math.round(scoreSeq.playYards || 0));
			else if (playActive && rb && !scoreSeq && !fumbleSeq) shown = totalYards + Math.max(0, Math.round(rb.y - playStartYard));
			ty.textContent = String(shown);
		}
		const td = $("tdCount");
		if (td) td.textContent = String(tdCount);
		const clockEl = $("clock");
		if (clockEl) {
			if (gameMode === "practice") {
				clockEl.textContent = "OFF";
				clockEl.classList.remove("text-red-400", "font-bold", "clock-expired");
			} else {
				clockEl.textContent = formatClock(clock);
				const expired = clock <= 0;
				const low = clock > 0 && clock <= 10;
				clockEl.classList.toggle("text-red-400", low || expired);
				clockEl.classList.toggle("font-bold", low || expired);
				clockEl.classList.toggle("clock-expired", expired && !sessionOver);
			}
		}
		document.body.classList.toggle("practice-mode", gameMode === "practice");
		const ps = $("padStatus");
		if (ps) {
			const t9tag = padT9 === "v1" ? "T-9 DI · " : padT9 === "v2" ? "T-9 · " : "";
			ps.textContent = padName ? "Pad · " + t9tag + profileLabel(padProfile) : "Pad: — · " + profileLabel(padProfile);
		}
	}
	function loadScores() {
		try {
			return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
		} catch {
			return [];
		}
	}
	function saveScores(list) {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
	}
	function renderScores() {
		const list = loadScores();
		const ol = $("scoreList");
		if (!ol) return;
		ol.innerHTML = "";
		if (!list.length) {
			ol.innerHTML = "<li class=\"text-muted\">No scores yet</li>";
			return;
		}
		list.forEach((s) => {
			const li = document.createElement("li");
			li.textContent = s.name + " — " + s.score;
			ol.appendChild(li);
		});
	}
	function tryAddScore(name, finalScore) {
		let list = loadScores();
		list.push({
			name: (name || "EE").toUpperCase().slice(0, 3),
			score: finalScore
		});
		list.sort((a, b) => b.score - a.score);
		list = list.slice(0, 5);
		saveScores(list);
		renderScores();
	}
	function expireGame() {
		clock = 0;
		sessionOver = true;
		playActive = false;
		gamesPlayed = (gamesPlayed || 0) + 1;
		const fs = $("finalScore");
		if (fs) fs.textContent = String(score);
		const ni = $("nameInput");
		if (ni) ni.value = $("teamAbbr")?.value || "EE";
		modalShow("nameModal", true);
		ni?.focus();
	}
	function submitScore() {
		clearAutoStart();
		tryAddScore(($("nameInput")?.value || $("teamAbbr")?.value || "EE").toUpperCase().slice(0, 3), score);
		modalShow("nameModal", false);
		if (gamesPlayed >= 5) modalShow("continueModal", true);
		else fullRestart(true);
	}
	function continueSet() {
		gamesPlayed = 0;
		modalShow("continueModal", false);
		fullRestart();
	}
	function tickReplayDirector(dt, inp) {
		if (!fullReplay || !fullReplay.frames || !fullReplay.frames.length) return false;
		const fr = fullReplay;
		if (fr.playing == null) fr.playing = false;
		if (fr.i == null) fr.i = 0;
		if (inp.pausePress && !replayLeaveEdge) {
			fullReplay = null;
			resetCamOp();
			setPaused(true);
			pauseBannerHTML("pause");
			replayLeaveEdge = true;
			replayHudRate = 1;
			return true;
		}
		if (inp.replayPress && !replayLeaveEdge) {
			fullReplay = null;
			resetCamOp();
			setPaused(true);
			pauseBannerHTML("pause");
			replayLeaveEdge = true;
			replayHudRate = 1;
			return true;
		}
		replayLeaveEdge = !!(inp.pausePress || inp.replayPress);
		if ((inp.confirm || inp.sprint) && !replayToggleEdge) {
			fr.playing = !fr.playing;
		}
		replayToggleEdge = !!(inp.confirm || inp.sprint);
		const shuttle = !!(inp.fastBack || inp.fastFwd || inp.slowBack || inp.slowFwd);
		if (shuttle) fr.playing = false;
		let rate = 0;
		if (inp.fastBack) rate = -2.5;
		else if (inp.fastFwd) rate = 2.5;
		else if (inp.slowBack) rate = -0.28;
		else if (inp.slowFwd) rate = 0.28;
		else if (fr.playing) rate = 1;
		replayHudRate = rate;
		const maxI = fr.frames.length - 1;
		fr.i = clamp((fr.i || 0) + rate * REPLAY_HZ * dt, 0, maxI);
		if (fr.i <= 0.02 && rate < 0) fr.playing = false;
		if (fr.i >= maxI - 0.02 && rate > 0) fr.playing = false;
		const rotate = !!inp.camRotate;
		const px = inp.stickX || 0;
		const py = inp.stickY || 0;
		if (rotate) {
			applyThetaStick(px * dt * 2.15);
			const phi0 = camOp.phi != null ? camOp.phi : Math.PI / 2;
			camOp.phi = clamp(phi0 + py * dt * 1.35, 0, Math.PI / 2);
		} else if (Math.hypot(px, py) > 0.06) {
			replayCursorFree = true;
			panLookFromStick(px, py, dt);
		} else if (!replayCursorFree) {
			const film = replayFrame();
			const ball = film && ((film.scoreSeq && film.scoreSeq.player) || film.rb);
			if (ball) applyLook(ball.x, ball.y);
		} else {
			applyLook(lookX, lookY);
		}
		if (inp.zoomIn) camOp.zoom = clamp(camOp.zoom + dt * 1.15, camZoomMin(), camZoomMax());
		if (inp.zoomOut) camOp.zoom = clamp(camOp.zoom - dt * 1.15, camZoomMin(), camZoomMax());
		return true;
	}
	function tickFreeCam(dt, inp) {
		if (!camAdjust || fullReplay) return;
		const rotate = !!(inp.camRotate || inp.truck || inp.hurdle);
		const px = inp.stickX || 0;
		const py = inp.stickY || 0;
		if (rotate) {
			applyThetaStick(px * dt * 2.15);
			const phi0 = camOp.phi != null ? camOp.phi : 0.82;
			camOp.phi = clamp(phi0 + py * dt * 1.35, 0, Math.PI / 2);
			freeOrbit = { theta: camOp.theta, phi: camOp.phi, zoom: camOp.zoom || 1 };
		} else if (Math.hypot(px, py) > 0.06) {
			freeLook = true;
			panLookFromStick(px, py, dt);
		} else {
			applyLook(lookX, lookY);
		}
		if (inp.zoomIn) camOp.zoom = clamp(camOp.zoom + dt * 1.15, camZoomMin(), camZoomMax());
		if (inp.zoomOut) camOp.zoom = clamp(camOp.zoom - dt * 1.15, camZoomMin(), camZoomMax());
		if (inp.zoomIn || inp.zoomOut) freeOrbit.zoom = camOp.zoom;
	}
	function applyLiveCam(dt, inp) {
		if (fullReplay || cameraMode === "free" || !rb) return;
		const live = playActive && !practiceAwaitSnap;
		if (!live) {
			camOp.panX += (0 - camOp.panX) * Math.min(1, dt * 2.4);
			camOp.panY += (0 - camOp.panY) * Math.min(1, dt * 2.4);
			camOp.panX = clamp(camOp.panX, -5.5, 5.5);
			camOp.panY = clamp(camOp.panY, -3.2, 7);
			return;
		}
		if (!inp.ctrlL && !inp.ctrlR && !(playingDefense() && live)) {
			const rsx = inp.rsX || 0;
			const rsy = inp.rsCamY || 0;
			if (Math.hypot(rsx, rsy) > 0.18) {
				camOp.panX = clamp(camOp.panX + rsx * dt * 10, -5.5, 5.5);
				camOp.panY = clamp(camOp.panY + rsy * dt * 10, -3.2, 7);
			} else {
				camOp.panX += (0 - camOp.panX) * Math.min(1, dt * 1.8);
				camOp.panY += (0 - camOp.panY) * Math.min(1, dt * 1.8);
			}
		}
		const kbZoomIn = keys.has("Equal") || keys.has("NumpadAdd") || keys.has("BracketRight");
		const kbZoomOut = keys.has("Minus") || keys.has("NumpadSubtract") || keys.has("BracketLeft");
		if (kbZoomIn) camOp.zoom = clamp(camOp.zoom + dt * 0.9, camZoomMin(), camZoomMax());
		if (kbZoomOut) camOp.zoom = clamp(camOp.zoom - dt * 0.9, camZoomMin(), camZoomMax());
		camOp.panX = clamp(camOp.panX, -5.5, 5.5);
		camOp.panY = clamp(camOp.panY, -3.2, 7);
		camOp.yaw = clamp(camOp.yaw, -0.35, 0.35);
	}
	let replayEdge = false;
	let peekEdge = false;
	function update(dt) {
		const inp = getInput(dt);
		if (inp.peek && !peekEdge) peekToggle = !peekToggle;
		peekEdge = !!inp.peek;
		if (fullReplay) {
			tickReplayDirector(dt, inp);
			const filmCheer = replayFrame();
			const celebrating = !!(filmCheer && filmCheer.scoreSeq);
			const chrono = !!(inp.fastBack || inp.fastFwd || inp.slowBack || inp.slowFwd || inp.confirm || inp.sprint || inp.btnAHeld);
			if (celebrating) {
				if (chrono || !cheerHoldArmed) {
					cheerHoldT = CHEER_HOLD_MAX;
					cheerHoldArmed = true;
				}
				if (cheerHoldT > 0) {
					cheerHoldT = Math.max(0, cheerHoldT - dt);
					poseClock += dt;
					tickCheerAmp(dt, true);
				} else {
					tickCheerAmp(dt, false);
				}
			} else {
				cheerHoldArmed = false;
				tickCheerAmp(dt, false);
			}
			return;
		}
		if (!paused) poseClock += dt;
		if (!paused) {
			tickCheerAmp(dt, !!scoreSeq);
			tickHitCheers(dt);
			tickScuffles(dt);
		}
		if (inp.replayPress && !replayEdge) {
			camAdjust = false;
			startFullReplay();
			replayEdge = true;
			if (fullReplay) return;
		}
		replayEdge = !!inp.replayPress;
		if (inp.pausePress && !pauseEdge && !sessionOver) setPaused(!paused);
		pauseEdge = !!inp.pausePress;
		if (paused) {
			const yCam = !!(inp.camRotate || inp.truck || inp.hurdle);
			if (camAdjust) {
				tickFreeCam(dt, inp);
				if (inp.confirm && !confirmEdge) {
					camAdjust = false;
					freeLook = false;
					freeOrbit = { theta: camOp.theta || 0, phi: camOp.phi != null ? camOp.phi : 0.82, zoom: camOp.zoom || 1 };
					captureFreeCam();
					syncPauseChrome();
				}
				confirmEdge = inp.confirm;
				spinPauseEdge = true;
				divePauseEdge = true;
				camAdjustEdge = yCam;
				return;
			}
			if (yCam && !camAdjustEdge && cameraMode === "free") {
				camAdjust = true;
				freeLook = true;
				const focus = scoreSeq?.player || rb || { x: FIELD_WIDTH / 2, y: playStartYard || 50 };
				applyLook(focus.x, focus.y);
				syncPauseChrome();
				camAdjustEdge = true;
				confirmEdge = inp.confirm;
				spinPauseEdge = inp.spin;
				divePauseEdge = inp.dive;
				return;
			}
			if (inp.confirm && !confirmEdge) setPaused(false);
			if ((inp.dive || keys.has("KeyX")) && !divePauseEdge) startFullReplay();
			if (inp.spin && !spinPauseEdge) {
				setPaused(false);
				fullRestart();
				confirmEdge = inp.confirm;
				spinPauseEdge = true;
				divePauseEdge = true;
				return;
			}
			confirmEdge = inp.confirm;
			spinPauseEdge = inp.spin;
			divePauseEdge = inp.dive;
			camAdjustEdge = yCam;
			return;
		}
		camAdjustEdge = false;
		if (!playActive && !practiceAwaitSnap && lastPlayFrames.length >= 6 && (inp.dive || keys.has("KeyX")) && !divePauseEdge) {
			startFullReplay();
			divePauseEdge = true;
			if (fullReplay) return;
		}
		divePauseEdge = !!inp.dive;
		applyLiveCam(dt, inp);
		if (pipReplay) {
			pipReplay.acc += dt;
			const step = 1 / REPLAY_HZ;
			while (pipReplay && pipReplay.acc >= step) {
				pipReplay.acc -= step;
				pipReplay.i += 1;
				if (pipReplay.i >= pipReplay.frames.length) pipReplay = null;
			}
		}
		if (Math.hypot(inp.dx, inp.dy) > .12) lastSteer = {
			dx: inp.dx,
			dy: inp.dy
		};
		// Independent (v4) / Classic (v6): right stick steers the teammate LT/RT selected.
		// Wings (v3) shares the left stick instead — do not overwrite with RS.
		if (playActive && !paused && !playingDefense() && (inp.ctrlL || inp.ctrlR) && (padProfile === "v4" || padProfile === "v6")) {
			const rx = inp.rsX || 0;
			const ry = inp.rsCamY || 0;
			const rmag = Math.hypot(rx, ry);
			if (rmag > 0.18) {
				const scale = Math.min(1, (rmag - 0.18) / 0.82) / rmag;
				const aligned = camWorldFromStick(rx * scale, ry * scale);
				const rdx = aligned.x, rdy = aligned.y;
				if (inp.ctrlL) { inp.blockLdx = rdx; inp.blockLdy = rdy; }
				if (inp.ctrlR) { inp.blockRdx = rdx; inp.blockRdy = rdy; }
			}
		}
		if (playActive && !playingDefense() && (inp.ctrlL || inp.ctrlR) && autoRun && Math.hypot(inp.dx, inp.dy) < .12 && Math.hypot(lastSteer.dx, lastSteer.dy) > .08) {
			inp.dx = lastSteer.dx;
			inp.dy = lastSteer.dy;
			if (inp.ctrlL && Math.hypot(inp.blockLdx, inp.blockLdy) < .12) {
				inp.blockLdx = lastSteer.dx;
				inp.blockLdy = lastSteer.dy;
			}
			if (inp.ctrlR && Math.hypot(inp.blockRdx, inp.blockRdy) < .12) {
				inp.blockRdx = lastSteer.dx;
				inp.blockRdy = lastSteer.dy;
			}
		}
		ctrlLeft = null;
		ctrlRight = null;
		if (playActive && !paused && !sessionOver && !playingDefense()) {
			if (inp.ctrlL) {
				if (!latchCtrlL || !latchCtrlL.active) latchCtrlL = nearestTeammate(-1);
				ctrlLeft = latchCtrlL;
				steerTeammate(ctrlLeft, inp.blockLdx, inp.blockLdy, dt);
			} else latchCtrlL = null;
			if (inp.ctrlR) {
				if (!latchCtrlR || !latchCtrlR.active || latchCtrlR === latchCtrlL) latchCtrlR = nearestTeammate(1, ctrlLeft);
				ctrlRight = latchCtrlR;
				steerTeammate(ctrlRight, inp.blockRdx, inp.blockRdy, dt);
			} else latchCtrlR = null;
		} else {
			latchCtrlL = null;
			latchCtrlR = null;
		}
		const nameOpen = !$("nameModal")?.classList.contains("hidden");
		const contOpen = !$("continueModal")?.classList.contains("hidden");
		if (nameOpen || contOpen) {
			if (inp.confirm && !confirmEdge) {
				if (nameOpen) submitScore();
				else continueSet();
			}
			confirmEdge = inp.confirm;
			return;
		}
		confirmEdge = false;
		// Practice mode: hold at pre-snap until A / confirm; RT flips the called play
		if (practiceAwaitSnap && !paused && !fullReplay) {
			if (gameMode !== "practice") {
				practiceAudibleArm = false;
				practiceDefAudibleArm = false;
			}
			// Menu toggles: X = offense focus, B = defense focus (practice playbooks only)
			if (gameMode === "practice" && playingDefense() && inp.dive && !practiceAudibleEdge) {
				if (!practiceAudibleArm && !practiceDefAudibleArm) {
					practiceAudibleArm = true;
					practiceDefAudibleArm = false;
					practiceFocusSide = "off";
				} else if (practiceAudibleArm) {
					practiceAudibleArm = false;
					practiceDefAudibleArm = true;
					practiceFocusSide = "def";
				} else {
					practiceDefAudibleArm = false;
				}
				if (typeof refreshPracticePreviews === "function") refreshPracticePreviews();
				updateAudibleHint();
			} else if (gameMode === "practice" && !playingDefense() && inp.dive && !practiceAudibleEdge) {
				practiceAudibleArm = !practiceAudibleArm;
				if (practiceAudibleArm) {
					practiceDefAudibleArm = false;
					practiceFocusSide = "off";
					if (typeof refreshPracticePreviews === "function") refreshPracticePreviews();
				} else if (typeof refreshPracticePreviews === "function") {
					refreshPracticePreviews();
				}
				updateAudibleHint();
			}
			practiceAudibleEdge = !!inp.dive;
			if (inp.spin && !practiceDefAudibleEdge && !playingDefense() && gameMode === "practice") {
				practiceDefAudibleArm = !practiceDefAudibleArm;
				if (practiceDefAudibleArm) {
					practiceAudibleArm = false;
					practiceFocusSide = "def";
					if (typeof refreshPracticePreviews === "function") refreshPracticePreviews();
				} else if (typeof refreshPracticePreviews === "function") {
					refreshPracticePreviews();
				}
				updateAudibleHint();
			}
			practiceDefAudibleEdge = !!inp.spin;

			const sy = inp.dy || 0;
			const rsy = inp._rsY || 0;
			const stickUp = (v) => Math.abs(v) > 0.55;

			function cycleOffense(step) {
				if (gameMode !== "practice") return;
				practiceFocusSide = "off";
				const idx = Math.max(0, OFF_PLAYS.findIndex((p) => p.id === stockPlayId()));
				const ni = (idx + step + OFF_PLAYS.length) % OFF_PLAYS.length;
				if (OFF_PLAYS[ni].id !== stockPlayId()) {
					practiceOffPlayIdPrev = practiceOffPlayId || stockPlayId() || null;
				}
				if (gameMode === "practice") practiceOffPlayId = OFF_PLAYS[ni].id;
				else huddleOffPickId = OFF_PLAYS[ni].id;
				const sel = $("practiceOffPlay");
				if (sel) sel.value = OFF_PLAYS[ni].id;
				try { placeEntitiesForNewPlay(); } catch (err) { console.error(err); }
				setPlayCall(OFF_PLAYS[ni].name + (practiceDefAudibleArm || practiceAudibleArm ? "  (menu)" : " — press A to snap"));
				renderPracticePlayList();
				if (typeof refreshPracticePreviews === "function") refreshPracticePreviews();
			}
			function cycleDefense(step) {
				if (gameMode !== "practice") return;
				practiceFocusSide = "def";
				const idx = Math.max(0, DEF_SCHEMES.findIndex((s) => s.id === (practiceDefSchemeId || huddleDefPickId || (currentScheme && currentScheme.id))));
				const ni = (idx + step + DEF_SCHEMES.length) % DEF_SCHEMES.length;
				if (DEF_SCHEMES[ni].id !== (practiceDefSchemeId || huddleDefPickId || (currentScheme && currentScheme.id))) {
					practiceDefSchemeIdPrev = practiceDefSchemeId || huddleDefPickId || (currentScheme && currentScheme.id) || null;
				}
				if (gameMode === "practice") practiceDefSchemeId = DEF_SCHEMES[ni].id;
				else huddleDefPickId = DEF_SCHEMES[ni].id;
				const sel = $("practiceDefScheme");
				if (sel) sel.value = DEF_SCHEMES[ni].id;
				try { placeEntitiesForNewPlay(); } catch (err) { console.error(err); }
				setPlayCall((currentPlay ? currentPlay.name : "Play") + " · vs " + DEF_SCHEMES[ni].name + (practiceDefAudibleArm ? "  (B menu — LS↕)" : " — press A to snap"));
				renderPracticeDefList();
				if (typeof refreshPracticePreviews === "function") refreshPracticePreviews();
			}


			function pickFocusedByIndex(n) {
				if (gameMode !== "practice") return;
				// n is 1-6
				const i = n - 1;
				if (practiceFocusSide === "def") {
					if (gameMode === "game" && userSide !== "def") return;
					if (!DEF_SCHEMES[i]) return;
					if (DEF_SCHEMES[i].id !== (practiceDefSchemeId || huddleDefPickId || (currentScheme && currentScheme.id))) {
						practiceDefSchemeIdPrev = practiceDefSchemeId || huddleDefPickId || (currentScheme && currentScheme.id) || null;
					}
					if (gameMode === "practice") practiceDefSchemeId = DEF_SCHEMES[i].id;
					else huddleDefPickId = DEF_SCHEMES[i].id;
					const sel = $("practiceDefScheme");
					if (sel) sel.value = DEF_SCHEMES[i].id;
					try { placeEntitiesForNewPlay(); } catch (err) { console.error(err); }
					setPlayCall((currentPlay ? currentPlay.name : "Play") + " · vs " + DEF_SCHEMES[i].name + " — press A to snap");
					renderPracticeDefList();
				} else {
					if (gameMode === "game" && userSide !== "off") return;
					if (!OFF_PLAYS[i]) return;
					if (OFF_PLAYS[i].id !== stockPlayId()) {
						practiceOffPlayIdPrev = practiceOffPlayId || stockPlayId() || null;
					}
					if (gameMode === "practice") practiceOffPlayId = OFF_PLAYS[i].id;
					else huddleOffPickId = OFF_PLAYS[i].id;
					const sel = $("practiceOffPlay");
					if (sel) sel.value = OFF_PLAYS[i].id;
					try { placeEntitiesForNewPlay(); } catch (err) { console.error(err); }
					setPlayCall(OFF_PLAYS[i].name + " — press A to snap");
					renderPracticePlayList();
				}
				if (typeof refreshPracticePreviews === "function") refreshPracticePreviews();
			}
			let numPick = 0;
			for (let n = 1; n <= 6; n++) {
				if (keys.has("Digit" + n) || keys.has("Numpad" + n)) { numPick = n; break; }
			}
			const bookOpen = !!(practiceAudibleArm || practiceDefAudibleArm);
			if (numPick && !practiceNumLatch && bookOpen) {
				pickFocusedByIndex(numPick);
				practiceNumLatch = true;
			} else if (!numPick) practiceNumLatch = false;

			// ← / → switch books only while a menu is open
			const bookLeft = !!(inp._dpadLeft || keys.has("ArrowLeft"));
			const bookRight = !!(inp._dpadRight || keys.has("ArrowRight"));
			if (bookOpen && (bookLeft || bookRight) && !practiceBookLatch) {
				if (gameMode === "practice") {
					practiceFocusSide = bookLeft ? "off" : "def";
					practiceAudibleArm = bookLeft;
					practiceDefAudibleArm = bookRight;
					practiceBookLatch = true;
					if (typeof refreshPracticePreviews === "function") refreshPracticePreviews();
					if (typeof updateAudibleHint === "function") updateAudibleHint();
				}
			} else if (!bookLeft && !bookRight) practiceBookLatch = false;

			// Left stick / ↑↓ browse only while X or B menu is open
			const navY = (inp.dy || 0) + (inp._dpadUp && !inp._dpadDn ? 1 : 0) + (inp._dpadDn && !inp._dpadUp ? -1 : 0);
			if (bookOpen && !inp.ctrlL && !inp.ctrlR && stickUp(navY)) {
				if (practiceStickLatch === 0) {
					const step = navY > 0 ? -1 : 1;
					if (practiceDefAudibleArm || practiceFocusSide === "def") cycleDefense(step);
					else cycleOffense(step);
					practiceStickLatch = navY > 0 ? 1 : -1;
				}
			} else if (!stickUp(navY) || inp.ctrlL || inp.ctrlR) practiceStickLatch = 0;

			// Right stick cycles defense only in the B menu
			if (practiceDefAudibleArm && !inp.ctrlL && !inp.ctrlR && stickUp(rsy)) {
				if (practiceDefStickLatch === 0) {
					cycleDefense(rsy > 0 ? -1 : 1);
					practiceDefStickLatch = rsy > 0 ? 1 : -1;
				}
			} else if (!stickUp(rsy) || inp.ctrlL || inp.ctrlR) practiceDefStickLatch = 0;

			// Optional hotkeys (no A/B): Y/LB/RB/LT/D-pad while a menu is open
			if (practiceAudibleArm && gameMode === "practice") {
				for (const m of getAudibleMap()) {
					if (m.match(inp)) {
						practiceOffPlayIdPrev = practiceOffPlayId || (currentPlay && currentPlay.id) || null;
						if (gameMode === "practice") practiceOffPlayId = m.play.id;
						else huddleOffPickId = m.play.id;
						practiceAudibleArm = false;
						const sel = $("practiceOffPlay");
						if (sel) sel.value = m.play.id;
						try { placeEntitiesForNewPlay(); } catch (err) { console.error(err); }
						setPlayCall(m.play.name + " — Y cancel · A snap");
						updateAudibleHint();
						if (typeof refreshPracticePreviews === "function") refreshPracticePreviews();
						confirmEdge = true;
						return;
					}
				}
			}
			if (practiceDefAudibleArm && gameMode === "practice") {
				for (const m of getDefAudibleMap()) {
					if (m.match(inp)) {
						practiceDefSchemeIdPrev = practiceDefSchemeId || huddleDefPickId || (currentScheme && currentScheme.id) || null;
						if (gameMode === "practice") practiceDefSchemeId = m.scheme.id;
						else huddleDefPickId = m.scheme.id;
						practiceDefAudibleArm = false;
						const sel = $("practiceDefScheme");
						if (sel) sel.value = m.scheme.id;
						try { placeEntitiesForNewPlay(); } catch (err) { console.error(err); }
						setPlayCall((currentPlay ? currentPlay.name : "Play") + " · vs " + m.scheme.name + " — Y cancel · A snap");
						updateAudibleHint();
						if (typeof refreshPracticePreviews === "function") refreshPracticePreviews();
						confirmEdge = true;
						return;
					}
				}
			}

			if (inp.ctrlR && !practiceFlipEdge) {
				practiceFlipped = !practiceFlipped;
				try { placeEntitiesForNewPlay("off"); } catch (err) { console.error(err); }
				setPlayCall((currentPlay ? currentPlay.name : "Practice") + (practiceFlipped ? " ⇄" : "") + " — press A to snap");
			}
			practiceFlipEdge = !!inp.ctrlR;
			// LT flips defensive alignment / jobs horizontally — offense stays put
			if (inp.ctrlL && !practiceDefFlipEdge) {
				practiceDefFlipped = !practiceDefFlipped;
				try { placeEntitiesForNewPlay("def"); } catch (err) { console.error(err); }
				setPlayCall((currentPlay ? currentPlay.name : "Play") + (currentScheme ? " · vs " + currentScheme.name : "") + (practiceDefFlipped ? " (D⇄)" : "") + " — press A to snap");
				if (typeof refreshPracticePreviews === "function") refreshPracticePreviews();
			}
			practiceDefFlipEdge = !!inp.ctrlL;

			// Y closes the open book, or restores the last audible if no menu is open
			const bookWasOpen = !!(practiceAudibleArm || practiceDefAudibleArm);
			const yPressed = !!(inp.truck || inp.hurdle) && !(playingDefense() && Math.hypot(inp.dx, inp.dy) > 0.35);
			if (yPressed && !practiceYCancelEdge && bookWasOpen) {
				practiceAudibleArm = false;
				practiceDefAudibleArm = false;
				setPlayCall((currentPlay ? currentPlay.name : "Play") + (currentScheme ? " · vs " + currentScheme.name : "") + " — press X/B for book · A snap");
				if (typeof refreshPracticePreviews === "function") refreshPracticePreviews();
				updateAudibleHint();
			} else if (!playingDefense() && yPressed && !practiceYCancelEdge && !practiceAudibleArm && !practiceDefAudibleArm) {
				let restored = false;
				if (practiceFocusSide === "def" && practiceDefSchemeIdPrev) {
					const tmp = practiceDefSchemeId;
					practiceDefSchemeId = practiceDefSchemeIdPrev;
					practiceDefSchemeIdPrev = tmp;
					restored = true;
				} else if (practiceOffPlayIdPrev) {
					const tmp = practiceOffPlayId;
					practiceOffPlayId = practiceOffPlayIdPrev;
					practiceOffPlayIdPrev = tmp;
					restored = true;
				} else if (practiceDefSchemeIdPrev) {
					const tmp = practiceDefSchemeId;
					practiceDefSchemeId = practiceDefSchemeIdPrev;
					practiceDefSchemeIdPrev = tmp;
					restored = true;
				}
				if (restored) {
					try { placeEntitiesForNewPlay(); } catch (err) { console.error(err); }
					const on = currentPlay ? currentPlay.name : "Play";
					const dn = currentScheme ? currentScheme.name : "";
					setPlayCall(on + (dn ? " · vs " + dn : "") + " — audible cancelled · A snap");
					if (typeof refreshPracticePreviews === "function") refreshPracticePreviews();
					updateAudibleHint();
				}
			}
			practiceYCancelEdge = yPressed;

			// A / Y snaps the ball (closes any open menu first). Defense auto-snaps after a 1.1–2.1s huddle.
			let doSnap = false;
			if (playingDefense()) {
				doSnap = tickPresnapDefense(dt, inp, bookWasOpen) === "snap";
				if (!doSnap) nudgeUserDefenderPresnap(dt, inp);
			} else if (inp.confirm && !confirmEdge) doSnap = true;
			if (gameAutoSnapT > 0) {
				gameAutoSnapT -= dt;
				if (gameAutoSnapT <= 0) doSnap = true;
			}
			if (doSnap) {
				gameAutoSnapT = 0;
				practiceAudibleArm = false;
				practiceDefAudibleArm = false;
				practiceAwaitSnap = false;
				playActive = true;
				lockHuddleDefender();
				playFrames = huddleBuf.slice();
				huddleBuf = [];
				replayAcc = 0;
				const defName = currentScheme && currentScheme.name ? currentScheme.name : "";
				const who = playingDefense() && userDefender ? " · DEF " + defRoleLabel(userDefender) + " #" + userDefender.number : "";
				setPlayCall((currentPlay ? currentPlay.name : "Play") + (defName ? " · vs " + defName : "") + who);
				updateAudibleHint();
				if (typeof refreshPracticePreviews === "function") refreshPracticePreviews();
			}
			confirmEdge = inp.confirm;
			return;
		}
		practiceAudibleArm = false;
		practiceFlipEdge = false;
		confirmEdge = false;
		spinPauseEdge = inp.spin;
		divePauseEdge = inp.dive;
		if (sessionOver) return;
		if (scoreSeq) {
			if (inp.celebrate && !celebrateEdge && scoreSeq.who === "off") {
				if (!scoreSeq.spike || scoreSeq.spikeStyle === "none") {
					scoreSeq.spike = true;
					scoreSeq.spikeStyle = pickSpikeStyle(scoreSeq.player);
					scoreSeq.spikeDir = spikeDirFromInput(scoreSeq.player);
					scoreSeq.player.hasBall = false;
					scoreSeq.t = Math.min(scoreSeq.t, .06);
					scoreSeq.ballOut = false;
					celebrateTimer = 99;
				}
			}
			celebrateEdge = !!inp.celebrate;
			tickScore(dt);
			updateCamera();
			return;
		}
		if (fumbleSeq) {
			tickFumble(dt, inp);
			updateCamera();
			return;
		}
		if (!playActive) {
			if (pauseTimer > 0) {
				pauseTimer -= dt;
				if (pauseTimer <= 0) {
					if (clock <= 0 && gameMode !== "practice") {
						expireGame();
						return;
					}
					pauseTimer = 0;
					tackleAnim = null;
					if (gameMode === "practice") {
						const fixed = clamp(practiceStartYard, 1, 99);
						ballYard = fixed;
						playStartYard = fixed;
						driveStartYard = fixed;
						ballX = (hashLeft() + hashRight()) / 2;
					} else {
						playStartYard = ballYard;
					}
					if (wantsDefHuddle()) {
						playActive = false;
						practiceAwaitSnap = true;
						practiceAudibleArm = false;
						practiceDefAudibleArm = false;
					}
					if (gameMode === "game") {
						huddleOffPickId = null;
						huddleDefPickId = null;
					}
					try {
						placeEntitiesForNewPlay();
						currentPlay && currentPlay.name;
					} catch (err) {
						console.error(err);
					}
					if (wantsDefHuddle()) {
						armGameDefAutoSnap();
						const who = playingDefense() && userDefender ? " · DEF " + defRoleLabel(userDefender) + " #" + userDefender.number : "";
						setPlayCall((currentPlay ? currentPlay.name : "Play") + (currentScheme ? " · vs " + currentScheme.name : "") + who + huddleWaitHint());
						updateBallOn();
					} else {
						playActive = true;
						practiceAwaitSnap = false;
						gameAutoSnapT = 0;
					}
				}
			}
			updateCamera();
			return;
		}
		if (gameMode !== "practice" && clock > 0 && preSnapTimer <= 0) {
			clock -= dt;
			if (clock < 0) clock = 0;
		}
		if (preSnapTimer > 0) {
			preSnapTimer = Math.max(0, preSnapTimer - dt);
			updateCamera();
			updateHUD();
			return;
		}
		playAge += dt;
		tickTurfFx(rb, dt);
		tickTurfStain(qb, dt);
		(blockers || []).forEach((b) => tickTurfStain(b, dt));
		(defenders || []).forEach((d) => tickTurfStain(d, dt));
		const userDrive = Math.hypot(inp.dx, inp.dy) > .16 || inp.sprint || inp.spin || inp.jukeL || inp.jukeR || inp.truck || inp.hurdle || inp.dive || !!activeMove;
		if (rb && !userDrive && Math.hypot(rb.vx || 0, rb.vy || 0) < 2.4) idleCarrierT += dt;
		else idleCarrierT = 0;
		if (inp.celebrate && !celebrateEdge && rb) {
			if (celebrateTimer > 0) {
				celebrateTimer = 0;
				currentPlay && currentPlay.name;
			} else celebrateTimer = 99;
		}
		celebrateEdge = inp.celebrate;
		if (celebrateTimer > 0 && rb && fumblesOn) {
			let touching = false;
			for (const d of defenders) {
				if (d.state === "whiff" || d.state === "recover" || d.engageT > 0) continue;
				if (dist(d, rb) < rb.radius + d.radius + .32) {
					touching = true;
					if (!celebFumbleLock) {
						celebFumbleLock = true;
						if (Math.random() < .95) {
							startFumble(d);
							return;
						}
					}
					break;
				}
			}
			if (!touching) celebFumbleLock = false;
		} else celebFumbleLock = false;
		if (moveCooldown > 0) moveCooldown -= dt;
		if (getUpT > 0) {
			getUpT -= dt;
			if (rb) {
				rb.low = true;
				rb.hop = 0;
				if (rb.takenDown) rb.downAmt = Math.max(0, Math.min(1, getUpT / 0.92));
				if (rb._landY != null) sealDiveLand(rb);
			}
			if (getUpT <= 0) {
				getUpT = 0;
				if (rb) {
					rb.low = false;
					rb.takenDown = false;
					rb.downAmt = 0;
					rb.recoverKind = null;
				}
			}
		}
		if (diveHangT > 0) diveHangT = Math.max(0, diveHangT - dt);
		if (moveTimer > 0) {
			moveTimer -= dt;
			if (moveTimer <= 0) {
				if (activeMove === "dive" && dive) {
					finishDive(dive.phase === "slide" ? "Dive — slide" : "Dive");
					return;
				}
				if (rb && activeMove === "spin") rb.spinT = 0;
				activeMove = null;
				if (rb && getUpT <= 0) rb.low = false;
				if (rb) rb.hop = 0;
				hurdleTarget = null;
				hurdleOk = false;
			}
		}
		if (handoffDone && moveCooldown <= 0 && !playingDefense()) {
			if (dpadMove) startMove(dpadMove);
			else if (inp.spin) startMove("spin");
			else if (inp.jukeL) startMove("jukeL");
			else if (inp.jukeR) startMove("jukeR");
			else if (inp.stiffL) startMove("stiffL");
			else if (inp.stiffR) startMove("stiffR");
			else if (inp.dive) startMove("dive");
			else if (inp.hurdle) startMove("hurdle");
			else if (inp.truck && celebrateTimer <= 0) startMove("truck");
		}
		if (playActive && playingDefense()) tickUserDefense(dt, inp);
		if (rb) {
			const carrier = rb;
			let spd = carrier.speed * offMult(carrier) * playSpeed;
			const cpu = playingDefense();
			if (cpu) {
				sprintCharge = 1;
				sprintHoldT = 0;
				sprintExhausted = false;
			} else if (!fatigueOn) {
				sprintCharge = 1;
				sprintHoldT = 0;
				sprintExhausted = false;
				if (inp.sprint) spd *= SPRINT_MULT;
			} else if (inp.sprint && !sprintExhausted && sprintCharge > .06) {
				const mix = .2 + .8 * sprintCharge;
				spd *= 1 + (SPRINT_MULT - 1) * mix;
				sprintHoldT += dt;
				if (sprintHoldT >= SPRINT_GRACE) {
					sprintCharge = Math.max(0, sprintCharge - .32 * dt);
					if (sprintCharge <= .04) sprintExhausted = true;
				}
			} else {
				sprintHoldT = 0;
				sprintCharge = Math.min(1, sprintCharge + (sprintExhausted ? .12 : .18) * dt);
				if (sprintExhausted && sprintCharge >= .42) sprintExhausted = false;
			}
			if (fatigueOn && sprintExhausted) spd *= .86;
			breakaway = false;
			if (handoffDone && defenders.length) {
				let nearestD = defenders[0];
				let nd = dist(nearestD, carrier);
				defenders.forEach((d) => {
					const dd = dist(d, carrier);
					if (dd < nd) {
						nd = dd;
						nearestD = d;
					}
				});
				const trail = rb.y - nearestD.y;
				if (nd > 6.5 && trail > 2.4) breakaway = true;
			}
			// Clear-field 1.55× only while burst is held (not a free runaway gear)
			if (breakaway && ((cpu && handoffDone) || (!cpu && inp.sprint)) && !(fatigueOn && sprintExhausted) && getUpT <= 0 && diveHangT <= 0.15) spd *= 1.55 / SPRINT_MULT;
			if (getUpT > 0) {
				const rise = 1 - Math.min(1, getUpT / 0.92);
				spd = carrier.speed * offMult(carrier) * playSpeed * (0.18 + 0.7 * rise * rise);
			}
			let useScript = scriptIndex < scriptSteps.length;
			let sdx = 0, sdy = 0;
			if (useScript && !cpu) {
				const step = scriptSteps[scriptIndex];
				sdx = step.dx;
				sdy = step.dy;
				scriptTimer += dt;
				if (!cpu && (scriptIndex > 0 || !scriptLocked) && (Math.abs(inp.dx) > .15 || Math.abs(inp.dy) > .15)) {
					scriptIndex = scriptSteps.length;
					useScript = false;
				} else if (scriptTimer >= step.t) {
					scriptTimer = 0;
					scriptIndex++;
				}
			}
			let extraDx = 0, extraDy = 0;
			const phase = moveDur > 0 ? 1 - moveTimer / moveDur : 1;
			if (activeMove === "jukeL") {
				extraDx = -4.5;
				spd *= .7;
			}
			if (activeMove === "jukeR") {
				extraDx = 4.5;
				spd *= .7;
			}
			if (activeMove === "shakeL") {
				if (phase < .35) {
					extraDx = 2.4;
					spd *= .42;
				} else {
					extraDx = -5.4;
					spd *= 1.05;
				}
			}
			if (activeMove === "shakeR") {
				if (phase < .35) {
					extraDx = -2.4;
					spd *= .42;
				} else {
					extraDx = 5.4;
					spd *= 1.05;
				}
			}
			if (activeMove === "deadleg") {
				if (phase < .48) spd *= .08;
				else spd *= 1.08;
			}
			if (activeMove === "deadlegL") {
				if (phase < .45) spd *= .08;
				else {
					extraDx = -5.2;
					spd *= 1.1;
				}
			}
			if (activeMove === "deadlegR") {
				if (phase < .45) spd *= .08;
				else {
					extraDx = 5.2;
					spd *= 1.1;
				}
			}
			if (activeMove?.startsWith("hurdle")) {
				const air = Math.sin(Math.min(1, Math.max(0, phase)) * Math.PI);
				const gl = inGoal();
				rb.hop = air * (gl ? 3.85 : rb.y >= 90 ? 3.35 : 2.25);
				extraDy = (gl ? 5.1 : 3.7) + (rb.y >= 90 ? 1.85 : 0);
				spd *= gl ? 1.22 : 1.1;
				rb.low = false;
				if (activeMove === "hurdleL") extraDx = -2.4;
				if (activeMove === "hurdleR") extraDx = 2.4;
			} else if (rb && activeMove !== "spin") rb.hop = 0;
			if (activeMove === "spin") {
				const u = phase;
				const side = rb.spinSide || 1;
				rb.spinT = 1 - u;
				if (u < .18) {
					spd *= .58;
					extraDx = -side * 2.1;
					extraDy = 0;
					rb.low = true;
					rb.hop = 0;
					rb.facing = Math.PI / 2 + side * .4;
				} else if (u < .7) {
					const t = (u - .18) / .52;
					spd *= 0.92;
					extraDx = side * (2.8 + 1.8 * t);
					extraDy = 0;
					rb.low = false;
					rb.hop = 0.08 * Math.sin(t * Math.PI);
					rb.facing = Math.PI / 2 - side * t * Math.PI * 2;
				} else {
					const t = (u - .7) / .3;
					spd *= 0.96;
					extraDx = side * (1.8 * (1 - t));
					extraDy = 0;
					rb.low = false;
					rb.hop = 0;
					rb.facing = Math.PI / 2 + side * 0.28 * (1 - t);
				}
			}
			const trucking = activeMove === "truck" || activeMove === "truckL" || activeMove === "truckR";
			if (trucking) {
				const dir = rb.truckDir || 0;
				const gl = inGoal();
				spd *= gl ? 1.32 : 1.08;
				extraDy += gl ? 4.6 : 1.15;
				extraDx += dir * (gl ? 3.4 : 1.35);
				rb.low = true;
				rb.hop = 0;
			}
			if (celebrateTimer > 0 && !activeMove) {
				spd *= .93;
				extraDy += .08;
			}
			if (activeMove === "dive" && dive) {
				const prog = (rb.x - dive.startX) * dive.dx + (rb.y - dive.startY) * dive.dy;
				if (dive.phase === "launch") {
					const u = clamp(prog / Math.max(.4, dive.launchYards), 0, 1);
					if (dive.duck) {
						rb.hop = 0;
						rb.low = true;
					} else {
						const peak = dive.ezLeap ? 2.72 + Math.min(1.05, dive.launchYards * 0.07) : (dive.pylon ? 3.65 : 1.4);
						rb.hop = Math.sin(u * Math.PI) * peak;
						rb.low = false;
					}
					const hang = dive.ezLeap ? Math.max(0.56, dive.launchYards / 14.2) : 0.36;
					const launchSpd = dive.launchYards / hang;
					rb.vx = dive.dx * launchSpd;
					rb.vy = dive.dy * launchSpd;
					if (ballBrokePlane(rb)) rb._diveScore = true;
					if (prog >= dive.launchYards) {
						stampTurfImpact(rb, 0.7);
						layOutPlayer(rb, Math.sign(dive.dx) || 1);
						rb._landX = rb.x;
						rb._landY = rb.y;
						if (rb.x < fieldLeft() || rb.x > fieldRight() || isSidelineOob(rb)) rb._diveOob = true;
						if (rb._diveScore || ballBrokePlane(rb) || rb._diveOob) {
							finishDive(rb._diveOob && !ballBrokePlane(rb) ? "Out of bounds" : "Dive");
							return;
						}
						if (!dive.contacted) {
							if (dive.slideYards <= 0 && dive.ezLeap && !dive.pylon) {
								dive.slideYards = clamp(100.45 - rb.y + 1.05, 1.35, 3.8);
							}
							if (dive.slideYards > 0) {
								dive.phase = "slide";
								rb.low = true;
							} else {
								finishDive("Dive");
								return;
							}
						} else {
							finishDive("Dive");
							return;
						}
					}
				} else {
					rb.hop = 0;
					rb.low = true;
					layOutPlayer(rb, Math.sign(dive.dx) || 1);
					if (!rb._diveTurf) {
						rb._diveTurf = true;
						stampTurfImpact(rb, 0.7);
					}
					const slideSpd = 8.5;
					rb.vx = dive.dx * slideSpd;
					rb.vy = dive.dy * slideSpd;
					sealDiveLand(rb);
					if (ballBrokePlane(rb)) {
						rb._diveScore = true;
						finishDive("Dive — slide");
						return;
					}
					if (prog >= dive.launchYards + dive.slideYards) {
						finishDive("Dive — slide");
						return;
					}
				}
			} else if (cpu) {
				cpuOffenseDrive(dt, spd);
			} else if (useScript) {
				rb.vx = sdx * spd;
				rb.vy = sdy * spd;
			} else {
				rb.vx = inp.dx * spd + extraDx * playSpeed;
				rb.vy = inp.dy * spd + extraDy * playSpeed;
			}
			rb.x += rb.vx * dt;
			rb.y += rb.vy * dt;
			if (Math.hypot(rb.vx, rb.vy) > .5) rb.facing = Math.atan2(rb.vy, rb.vx);
			if (activeMove?.startsWith("hurdle") && hurdleOk && hurdleTarget && !hurdleDidTrip && rb.y >= hurdleTarget.y - .2) {
				hurdleDidTrip = true;
				let trip = .46;
				if (defenders.filter((d) => d !== hurdleTarget && dist(d, hurdleTarget) < 4.3).length) trip += .14;
				if (rb.y >= 90) trip += .22;
				trip = Math.min(.86, trip);
				if (Math.random() < trip) {
					const t = hurdleTarget;
					t.state = "whiff";
					stampTurfImpact(t, 0.92);
					t.low = true;
					t.spinT = .95;
					t.vx = (Math.random() - .5) * 2.2;
					t.vy = 6.2 + Math.random() * 3.4;
				}
			}
			if (!(activeMove === "dive" && dive) && (rb.x <= fieldLeft() + .15 || rb.x >= fieldRight() - .15)) {
				const yg = Math.round(rb.y - playStartYard);
				endPlay("Out of bounds", yg);
				awardPlayYards(yg);
				return;
			}
			blockers.forEach((b) => {
				if (!b.active || !rb) return;
				const minD = rb.radius + b.radius + .08;
				const dd = dist(rb, b);
				if (dd < minD && dd > .01) yieldBlocker(b, minD, dd);
			});
		}
		const style = currentPlay ? currentPlay.blockStyle : "tight";
		const fl = fieldLeft();
		const fr = fieldRight();
		const claimedDefs = /* @__PURE__ */ new Set();
		blockers.forEach((b) => {
			if (b.blockTarget && b.blockTarget.active) claimedDefs.add(b.blockTarget);
		});
		blockers.forEach((b, idx) => {
			if (!b.active || !rb) return;
			if (b._userCtrl > 0) {
				b._userCtrl -= dt;
				return;
			}
			const nB = blockers.length;
			let targetX = b.x;
			let targetY = b.y;
			let tgt = b.blockTarget && b.blockTarget.active && b.blockTarget.state !== "whiff" ? b.blockTarget : null;
			if (tgt && rb && !b.backsideSeal) {
				const beaten = tgt.y < rb.y - 1.8 && dist(tgt, rb) + .4 < dist(b, rb);
				const stale = rb.y - tgt.y > 6.2;
				if (beaten || stale) {
					tgt.engageT = 0;
					if (tgt.state !== "whiff") tgt.state = "pursue";
					claimedDefs.delete(tgt);
					b.blockTarget = null;
					tgt = null;
				}
			}
			if (!tgt && !b.backsideSeal) {
				let best = null, nd = 8.8;
				const hole = rb.x;
				const seal = b.sealSide || b.driveSide || playSideSign() || 1;
				defenders.forEach((d) => {
					if (d.state === "whiff" || d.state === "recover" || claimedDefs.has(d)) return;
					if (d.y < rb.y - 1.6) return;
					const sameLane = Math.abs(d.x - b.x) < 3.6;
					const playSide = seal > 0 ? d.x >= hole - 1.4 : d.x <= hole + 1.4;
					if (!sameLane && !playSide) return;
					const groupBias = (b.group === "OL" && d.group === "DT") ? 0.72 : 1;
					const sideBias = playSide ? 0.82 : 1;
					const dd = (dist(d, b) * .65 + dist(d, rb) * .35) * groupBias * sideBias;
					if (dd < nd) {
						nd = dd;
						best = d;
					}
				});
				if (best) {
					claimedDefs.add(best);
					b.blockTarget = best;
					tgt = best;
				}
			}
			const behindLos = rb.y < playStartYard - .35;
			if (b.backsideSeal) {
				const side = b.sealSide || b.driveSide || 1;
				const snap = snapX();
				if (tgt && (tgt.x - snap) * side < 1.1) {
					claimedDefs.delete(tgt);
					b.blockTarget = null;
					tgt = null;
				}
				if (!tgt) {
					let best = null, bd = 12;
					defenders.forEach((d) => {
						if (d.state === "whiff" || d.state === "recover" || claimedDefs.has(d)) return;
						if ((d.x - snap) * side < 1.1) return;
						const dd = Math.hypot(d.x - (snap + side * 3.8), d.y - (playStartYard + 2.4));
						if (dd < bd) { bd = dd; best = d; }
					});
					if (best) { claimedDefs.add(best); b.blockTarget = best; tgt = best; }
				}
				if (tgt) {
					targetX = Math.max(tgt.x + side * 0.7, snap + side * 2.6);
					targetY = Math.max(tgt.y + 0.85, playStartYard + 2.4);
				} else {
					targetX = snap + side * 3.8;
					targetY = playStartYard + 2.6;
				}
				if (side > 0) targetX = Math.max(targetX, snap + 2.6);
				else targetX = Math.min(targetX, snap - 2.6);
			} else if (b.blockMode === "pull" && b.pullVia) {
				if (b.pullPhase === 0) {
					targetX = b.pullVia.x;
					targetY = b.pullVia.y;
					if (b.y <= playStartYard - .6 || dist(b, {
						x: b.pullVia.x,
						y: b.pullVia.y
					}) < 1.1) b.pullPhase = 1;
				} else if (b.pullPhase === 1) {
					targetX = b.pullVia.x2;
					targetY = b.pullVia.y2;
					if (Math.abs(b.x - b.pullVia.x2) < 1.4) b.pullPhase = 2;
				} else if (tgt) {
					const side = b.sealSide || b.driveSide || 1;
					targetX = tgt.x + side * .85;
					targetY = tgt.y + .35;
				} else {
					targetX = rb.x + (b.sealSide || playSideSign()) * 3.2;
					targetY = Math.max(playStartYard + 3.5, rb.y + 2.2);
				}
			} else if (tgt) {
				const side = b.sealSide || b.driveSide || 1;
				targetX = tgt.x + side * .9;
				targetY = tgt.y + (b.blockMode === "climb" ? .25 : .35);
				if (b.blockMode === "reach") {
					targetX = tgt.x + side * 1.15;
					targetY = tgt.y + .12;
				}
			} else if (behindLos) {
				let best = null;
				let nd = 12;
				defenders.forEach((d) => {
					if (d.state === "whiff" || d.state === "recover" || claimedDefs.has(d)) return;
					if (d.y > playStartYard + 6) return;
					const dd = dist(d, rb);
					if (dd < nd) {
						nd = dd;
						best = d;
					}
				});
				if (best) {
					claimedDefs.add(best);
					b.blockTarget = best;
					targetX = best.x + (b.sealSide || b.driveSide || 1) * .8;
					targetY = best.y + .3;
				} else {
					const f = rb.facing || Math.PI / 2;
					targetX = rb.x + Math.cos(f) * 2.4 + (idx - (nB - 1) / 2) * 1.6;
					targetY = rb.y + Math.sin(f) * 2.4;
				}
			} else {
				const lane = idx - (nB - 1) / 2;
				const gained = rb.y - playStartYard;
				let threat = null, td = 8.2;
				defenders.forEach((d) => {
					if (d.state === "whiff" || d.state === "recover" || claimedDefs.has(d)) return;
					if (d.y < rb.y - 1.2 || d.y > rb.y + 7) return;
					if (Math.abs(d.x - rb.x) > 5.5) return;
					const seal = b.sealSide || playSideSign() || 1;
					if (seal > 0 && d.x < rb.x - 3.2) return;
					if (seal < 0 && d.x > rb.x + 3.2) return;
					const dd = dist(d, b) * 0.55 + dist(d, rb) * 0.45;
					if (dd < td) {
						td = dd;
						threat = d;
					}
				});
				if (threat) {
					claimedDefs.add(threat);
					b.blockTarget = threat;
					targetX = threat.x + (b.sealSide || b.driveSide || 1) * .8;
					targetY = threat.y + .3;
				} else if (gained > 6.2) {
					const side = b.sealSide || b.driveSide || Math.sign(b.x - rb.x) || 1;
					targetX = rb.x + side * (3.3 + Math.min(3.6, (gained - 6) * .32));
					targetY = rb.y + .55;
				} else {
					const side = b.sealSide || b.driveSide || 1;
					targetX = rb.x + side * (2.2 + Math.abs(lane) * 0.55);
					targetY = Math.max(playStartYard + (b.levelY || 3), rb.y + 3.1);
					if (idleCarrierT > .4) {
						targetX = rb.x + (lane === 0 ? (b.driveSide || 1) : lane) * 3.4;
						targetY = rb.y + 3.6;
					}
				}
			}
			if (!b.backsideSeal && (playStartYard >= 95 || rb.y >= 96)) {
				const lane = idx - (nB - 1) / 2;
				targetX = snapX() + lane * 3.05 + (b.driveSide || 1) * .35;
				targetY = Math.min(103.2, playStartYard + 3.4 + Math.abs(lane) * .8);
			}
			const ang = Math.atan2(targetY - b.y, targetX - b.x);
			let bspd = b.speed * offMult(b) * playSpeed;
			const fatigue = playAge < 4.5 ? 1 : Math.max(.55, 1 - (playAge - 4.5) * .1);
			bspd *= fatigue;
			if (style === "wallL" || style === "wallR") bspd *= 1.12;
			if (style === "zoneR" || style === "zoneL") bspd *= 1.08;
			if (b.blockMode === "pull" && b.pullPhase < 2) bspd *= 1.18 * (b.pullBoost || 1);
			if (b.backsideSeal) bspd *= 1.22;
			if (!tgt) bspd *= 1.06;
			const distT = Math.hypot(targetX - b.x, targetY - b.y);
			const step = distT < 0.02 ? 0 : Math.min(bspd * dt, distT, 0.55);
			const dx = distT < 0.02 ? 0 : Math.cos(ang) * step;
			const dy = distT < 0.02 ? 0 : Math.sin(ang) * step;
			b.x += dx;
			b.y += dy;
			b.vx = dx / Math.max(dt, 0.001);
			b.vy = dy / Math.max(dt, 0.001);
			turnToward(b, ang, dt, 10);
			const backLimit = behindLos ? Math.min(playStartYard - 8, rb.y - 2) : playStartYard - 6;
			b.y = clamp(b.y, backLimit, Math.min(104.8, Math.max(rb.y + 10, playStartYard + 12)));
			b.x = clamp(b.x, fl + 1, fr - 1);
			if (b.backsideSeal) {
				const side = b.sealSide || b.driveSide || 1;
				const snap = snapX();
				if (side > 0) b.x = Math.max(b.x, snap + 2.15);
				else b.x = Math.min(b.x, snap - 2.15);
			}
		});
		blockers.forEach((b) => {
			if (!b.active) return;
			defenders.forEach((d) => {
				const gap = b.radius + d.radius + .12;
				const dd = dist(b, d);
				if (dd < gap + .08) {
					if (d.state === "whiff" || d.state === "recover" || d.recoverT > 0) return;
					const userHeld = isUserDef(d);
					// Wrong-side / past-the-defender = don't cling (anti-holding)
					const pastDef = rb && (b.y > d.y + 0.35) && dist(b, rb) > dist(d, rb);
					const wrongSide = rb && Math.sign(b.x - d.x) === Math.sign(d.x - rb.x) && Math.abs(b.x - d.x) > 0.4 && dist(b, rb) > dist(d, rb) + 0.15;
					const holding = rb && dist(d, rb) + .25 < dist(b, rb);
					if (holding || pastDef || wrongSide || (!userHeld && rb && dist(d, rb) > 9.2)) {
						if (b.blockTarget === d) b.blockTarget = null;
						d.engageT = 0;
						if (userHeld) return;
						d.state = "recover";
						d.recoverT = .08;
						d.low = false;
						const ang = rb ? Math.atan2(rb.y - d.y, rb.x - d.x) : -Math.PI / 2;
						d.vx = Math.cos(ang) * 9;
						d.vy = Math.sin(ang) * 9;
						return;
					}
					if (d.engageT <= 0) {
						const holding2 = rb && dist(d, rb) + .25 < dist(b, rb);
						const farPlay = rb && dist(d, rb) > 8.5;
						const isDt = d.group === "DT";
						const olOnDt = isDt && (b.group === "OL" || b.group === "TE" || b.group === "FB");
						// P0a: hold the point long enough to make a lane. Slip only after
						// the block has done work, not on first contact.
						let slipP = (d._pushYards || 0) > 1.15 || d.y > 95.5 || rb && d.y > rb.y + 2.4 || playAge > 2.15 || idleCarrierT > .45 ? .72 : .28;
						if (olOnDt) slipP = (d._pushYards || 0) > 2.1 || d.y > 95.5 || playAge > 2.8 ? .38 : .1;
						// breakBlock > 1 → shed more; < 1 → stay engaged longer
						slipP = clamp(slipP * (0.55 + 0.45 * breakBlock), 0.06, 0.92);
						if (b._userCtrl > 0) slipP *= 0.35; // user-steered blockers hold much better
						if (holding2 || farPlay || idleCarrierT > .4 || Math.random() < slipP) {
							d.engageT = 0;
							if (userHeld) return;
							d.state = "recover";
							d.recoverT = holding2 ? .08 : (olOnDt ? .28 : .16) + Math.random() * .12;
							d.low = false;
							const ang = rb ? Math.atan2(rb.y - d.y, rb.x - d.x) : -Math.PI / 2;
							d.vx = Math.cos(ang) * (8 + Math.random() * 3);
							d.vy = Math.sin(ang) * (8 + Math.random() * 3);
							return;
						}
						const fatigue = playAge < 2.2 ? 1 : Math.max(.42, 1 - (playAge - 2.2) * .22);
						// P0a: OL–DT ~1.15–1.6s; other sturdy contacts ~0.55–0.85s
						d.engageT = ((olOnDt || b.driveBlock ? 1.15 : .55) + Math.random() * (olOnDt || b.driveBlock ? .45 : .3)) * fatigue * (b.sturdyBlock ? 1.2 : 1) / Math.max(0.45, breakBlock);
						if (b._userCtrl > 0) d.engageT *= 1.65;
						// Prefer sustained blocks over pancakes; rare short pancake only
						if (!userHeld && b.y <= d.y + .55 && Math.random() < (d.group === "DT" ? (b.group === "OL" ? .11 : .08) : (b.group === "FB" ? .1 : .07))) {
							d.state = "whiff";
							d.pancaked = true;
							stampTurfImpact(d, 0.7 + Math.random() * .3);
							d.low = true;
							d.spinT = .35 + Math.random() * .2;
							d.vx = (Math.sign(d.x - b.x) || 1) * (1.1 + Math.random() * 0.9);
							d.vy = 1.2 + Math.random() * 1.0; // ~1–2 yd, not 20
							d.engageT = 0;
							return;
						}
					}
					d.slowed = Math.max(d.slowed, d.group === "DT" ? .62 : .42);
					const hole = rb ? rb.x : snapX();
					const side = b.sealSide || Math.sign(d.x - hole) || Math.sign(d.x - b.x) || 1;
					if (Math.sign(b.x - d.x) !== side) b.x += side * 0.1;
					const overlap = Math.max(.04, gap - dd + .1);
					let pushScale = d.group === "DT" ? 1.65 : 1;
					if (b.driveBlock) pushScale *= 1.45;
					if (b._userCtrl > 0) pushScale *= 1.55;
					// River / sturdy: hold the point, less lateral skating
					if (b.sturdyBlock && !b.backsideSeal) {
						pushScale *= 0.55;
						d.slowed = Math.max(d.slowed, 0.78);
					}
					if (b.backsideSeal) {
						pushScale *= 1.55;
						d.slowed = Math.max(d.slowed, 0.7);
						d.y += 0.16;
					}
					d.x += side * Math.min(b.sturdyBlock ? .22 : .48, (.09 + overlap * .55) * pushScale);
					let dyPush = Math.min(b.sturdyBlock ? .28 : .58, (.12 + overlap * .7) * pushScale);
					if (b.driveBlock && !b.sturdyBlock) dyPush *= 1.35;
					if (d.y > 94 && !inGoal()) dyPush *= .12;
					if (inGoal()) dyPush *= 1.15;
					if (rb && d.y > rb.y + 3.2) dyPush *= .18;
					d.y += dyPush;
					d.y = Math.min(d.y, 104.6);
					// Engaged DTs lose lag so they don't feel frozen while blocked
					if (d.group === "DT") d.dtLag = false;
					if (rb && (d.y > rb.y + 6 || dist(d, rb) > 9)) {
						d.engageT = 0;
						d.state = "recover";
						d.recoverT = .42;
						const ang = rb ? Math.atan2(rb.y - d.y, rb.x - d.x) : -Math.PI / 2;
						d.vx = Math.cos(ang) * 8.5;
						d.vy = Math.sin(ang) * 8.5;
					}
					b.x -= side * .028;
					b.y += .05;
					d._pushYards = (d._pushYards || 0) + overlap * (d.group === "DT" ? 1.25 : 1);
				}
			});
		});
		if (activeMove === "stiffL" || activeMove === "stiffR") {
			const n = stiffTarget(activeMove === "stiffL" ? -1 : 1);
			if (n && rb) {
				n.slowed = Math.max(n.slowed, .5);
				const push = 2.1;
				const ang = Math.atan2(n.y - rb.y, n.x - rb.x);
				n.x += Math.cos(ang) * push * dt * 8;
				n.y += Math.sin(ang) * push * dt * 8;
			}
		}
		blockers.forEach((b) => { if (b._userCtrl > 0) b._userCtrl = Math.max(0, b._userCtrl - dt * 0.85); });
		separate(blockers, playStartYard >= 92 || rb && rb.y >= 95 ? 2.85 : 2.65);
		separate(defenders, 2.35);
		yieldToCarrier();
		blockers.forEach((b) => {
			if (!b.backsideSeal) return;
			const side = b.sealSide || b.driveSide || 1;
			const snap = snapX();
			if (side > 0) b.x = Math.max(b.x, snap + 2.15);
			else b.x = Math.min(b.x, snap - 2.15);
		});
		defenders.forEach((d) => {
			if (!rb) return;
			if (d._userCtrl > 0 && d !== userDefender && d !== ctrlLeft && d !== ctrlRight) {
				d._userCtrl = Math.max(0, d._userCtrl - dt * 3);
			}
			if (d.engageT > 0) {
				d.engageT -= dt;
				d.y = Math.min(d.y, 104.6);
				// P0a: runner proximity must not pop the block. Only release
				// once the runner has clearly cleared the engagement.
				if (rb && d.y > rb.y + 4.2) {
					d.engageT = 0;
					if (!isUserDef(d)) {
						d.state = "recover";
						d.recoverT = .18;
					}
				}
				d.x = clamp(d.x, fieldLeft() + .8, fieldRight() - .8);
				return;
			}
			if (d.whiffT > 0) {
				d.whiffT -= dt;
				if (d.spinT > 0) {
					d.spinT -= dt;
					d.facing += 18 * dt;
				}
				// Hard cap slide distance while pancaked / missing
				d.vx = clamp(d.vx, -5.5, 5.5);
				d.vy = clamp(d.vy, -2.5, 4.0);
				d.x += d.vx * dt;
				d.y += d.vy * dt;
				d.low = true;
				d.state = "whiff";
				if (d.whiffT <= 0) {
					d.state = "recover";
					// Pancakes stay down longer so they cannot wrap on the get-up
					d.recoverT = d.pancaked ? 0.7 : .4;
					d.vx *= .15;
					d.vy *= .15;
				}
				d.x = clamp(d.x, fieldLeft() + .8, fieldRight() - .8);
				return;
			}
			if (d.recoverT > 0) {
				d.recoverT -= dt;
				d.state = "recover";
				if (d.spinT > 0) {
					d.spinT -= dt;
					d.facing += 10 * dt;
				}
				d.x += d.vx * dt * .3;
				d.y += d.vy * dt * .3;
				if (d.recoverT <= 0) {
					d.state = "pursue";
					d.low = false;
					d.pancaked = false;
				}
				d.x = clamp(d.x, fieldLeft() + .8, fieldRight() - .8);
				return;
			}
			if (playingDefense() && (d === userDefender || d === ctrlLeft || d === ctrlRight || d._userCtrl > 0.05)) {
				d.x = clamp(d.x, fieldLeft() + .8, fieldRight() - .8);
				return;
			}
			if (d.readT > 0) d.readT -= dt;
			if (d.reactT > 0) d.reactT -= dt;
			if (d.misfireT > 0) d.misfireT -= dt;
			if (d.atkDecideT > 0) d.atkDecideT -= dt;
			if (d.atkT > 0) {
				d.atkT -= dt;
				if (d.atkT <= 0 && (d.atkKind === "dive" || d.atkKind === "hit")) {
					d.state = "whiff";
					d.low = true;
					stampTurfImpact(d, d.atkKind === "dive" ? 0.62 + Math.random() * 0.18 : 0.36 + Math.random() * 0.12);
					d.vx = (d.atkDX || 0) * (d.atkKind === "dive" ? 7.2 : 4.4);
					d.vy = (d.atkDY || 0) * (d.atkKind === "dive" ? 5.4 : 3.2);
					clearAttack(d);
					d.x = clamp(d.x, fieldLeft() + .8, fieldRight() - .8);
					return;
				}
				if (d.atkT <= 0 && d.atkKind === "wrap") {
					d.atkT = 0;
				} else if (d.atkT <= 0) {
					clearAttack(d);
				}
			}
			if (d.lagT > 0) {
				d.lagT -= dt;
				if (d.lagT <= 0) d.lagT = -1;
			} else if (d.lagT < 0 && dist(d, rb) > 6) d.lagT = 0;
			d.sprintT += dt;
			const distToRb = dist(d, rb);
			const trail = rb.y - d.y;
			const zoneBehind = d.jobY != null && rb.y > d.jobY + 1.15;
			const dancing = Math.abs(rb.vx) > 9 && playAge > 8; // don't drop assignments just because the play is long
			// Moving zones (drop / spy): center tracks defender; fixed zones keep original jobX/Y
			if (d.zoneFollow) {
				d.jobX = d.x;
				d.jobY = d.y;
			}
			const zoneJob = d.job === "deep" || d.job === "drop" || d.job === "flat" || d.job === "curl" || d.job === "hook" || d.job === "robber" || d.job === "contain" || d.job === "spy" || d.job === "shade";
			const nearSideline = rb.x <= fieldLeft() + 7.2 || rb.x >= fieldRight() - 7.2;
			const wideRun = nearSideline || Math.abs(rb.x - snapX()) > 9.5;
			const outsideZoneX = d.jobX != null && Math.abs(rb.x - d.jobX) > (d.zoneRx || 5) * 0.52;
			const pastZone = (d.jobY != null && rb.y > d.jobY + 2.4) || outsideZoneX || nearSideline || wideRun;
			const atLevel = zoneJob && d.jobY != null && !pastZone && rb.y > playStartYard - 1 && rb.y > d.jobY - 8 && d.readT > 0;
			const keepDeep = (d.job === "deep" || d.job === "robber" || d.isSafety) && !pastZone && !wideRun && distToRb > 7.2 && rb.y < (d.jobY || d.y) - 1.5 && d.readT > 0;
			const rbBehindLos = rb.y < playStartYard - 0.35;
			// Close in the backfield, but not with full chase-down sprint intensity
			d.sprintOn = !rbBehindLos && (distToRb < 8.6 && trail < 3.4 || distToRb < 4.2);
			if (d.slowed > 0) {
				d.speed = d.baseSpeed * .55 * defMult(d) * playSpeed;
				d.slowed -= dt;
			} else {
				let lag = 1;
				if (d.dtLag && rb && (rb.y - d.y) < 10) lag = 0.55 + Math.max(0, (rb.y - d.y) / 10) * 0.45;
				else if (d.dtLag && rb && (rb.y - d.y) >= 10) d.dtLag = false;
				d.speed = d.baseSpeed * defMult(d) * playSpeed * lag;
			}
			if (d.sprintOn) d.speed *= SPRINT_MULT;
			// Behind LOS: still pursue, but dial back closing speed so RB can burst back to the line
			if (rbBehindLos) {
				const depth = playStartYard - rb.y; // yards behind LOS
				const closeMult = clamp(0.78 - Math.min(0.18, depth * 0.025), 0.58, 0.82);
				d.speed *= closeMult;
			}
			if (d.engageT > 0) d.speed *= (d.group === "DT" ? .18 : .32);
			if (d.lagT > 0) d.speed *= .45;
			if (trail > 2.2 && distToRb > 3.6) d.speed *= .94;
			chooseDefenderAttack(d, distToRb);
			if (!(d.atkT > 0 && (d.atkKind === "dive" || d.atkKind === "hit"))) {
				if (distToRb < 2.9) d.state = "commit";
				else if (distToRb < 5.6) d.state = "breakdown";
				else d.state = "pursue";
			}
			if (d.state === "commit" && d.lagT === 0 && distToRb < 4.4 && distToRb > 3.2) d.lagT = .04 + Math.random() * .05;
			let shownJob = d.job;
			if (d.fakeBlitz && d.reactT > 0) shownJob = d.job === "blitz" ? "drop" : "blitz";
			const runKnown = d.readT <= 0;
			const behindLos = rb.y < playStartYard - .35;
			let tx = d.x;
			let ty = d.y;
			const wrong = d.misfireT > 0 && distToRb > 7 ? blockers[d.misfireIdx] : null;
			const keepContain = d.job === "contain" && !pastZone && !wideRun && distToRb > 4 && Math.abs(rb.x - d.x) < 10;
			const holdZone = zoneJob && !pastZone && !wideRun && d.readT > 0 && distToRb > 6.4 && (atLevel || rbBehindLos);
			if (d.atkT > 0 && (d.atkKind === "dive" || d.atkKind === "hit")) {
				tx = d.x + (d.atkDX || 0) * 10;
				ty = d.y + (d.atkDY || 0) * 10;
				d.speed *= d.atkKind === "dive" ? 1.38 : 1.2;
			} else if (d.job === "spy") {
				if (playAge < 0.28) {
					tx = d.stutterX != null ? d.stutterX : d.x + 1.6;
					ty = d.stutterY != null ? d.stutterY : d.y - 1.0;
					d.spyPhase = "fake";
				} else if (Math.hypot((d.jobX != null ? d.jobX : d.x) - d.x, (d.jobY != null ? d.jobY : d.y) - d.y) > 0.85 && playAge < 0.85) {
					tx = d.jobX != null ? d.jobX : d.x;
					ty = d.jobY != null ? d.jobY : playStartYard + 6.4;
					d.spyPhase = "catch";
				} else {
					d.spyPhase = "follow";
					d.zoneFollow = true;
					tx = rb.x + (d.x < rb.x ? -0.8 : 0.8);
					ty = rb.y + 0.35;
					d.jobX = d.x;
					d.jobY = d.y;
				}
			} else if (d.stutter && playAge < .5) {
				tx = d.stutterX;
				ty = d.stutterY;
			} else if (wrong) {
				tx = wrong.x;
				ty = wrong.y;
			} else if (distToRb < 3.2) {
				tx = rb.x + (d.laneOffset || 0) * .18;
				ty = rb.y;
			} else if (keepDeep || holdZone) {
				const homeX = d.stationX != null ? d.stationX : (d.jobX || d.x);
				const homeY = d.stationY != null ? d.stationY : (d.jobY || d.y);
				const rx = (d.zoneRx || 5) * 1.2;
				const ry = (d.zoneRy || 3.4) * 1.15;
				tx = clamp(rb.x, homeX - rx, homeX + rx);
				ty = clamp(rb.y + .8, homeY - ry, homeY + 2.2);
				if (d.y >= 99 && rb.y < playStartYard + 1.2) ty = Math.max(ty, d.y - 0.4);
			} else if (keepContain) {
				tx = rb.x;
				ty = Math.max(rb.y - .2, playStartYard);
			} else if (d.blitzDelay && playAge < d.blitzDelay) {
				// Delayed blitz: hold / soft drift until delay elapses
				tx = d.x + (d.jobX - d.x) * 0.08;
				ty = d.y + 0.15;
			} else if (!runKnown && playAge < (.7 + (d.blitzDelay || 0)) && shownJob === "blitz") {
				tx = d.jobX;
				ty = d.jobY;
			} else if (shownJob === "man" && playAge < 1.05 && distToRb > 5) {
				const t = blockers[d.manIdx];
				if (t) {
					tx = t.x;
					ty = t.y + .8;
				} else {
					tx = rb.x + (d.laneOffset || 0) * .4;
					ty = rb.y;
				}
			} else {
				// Level-based contain: don't all collapse to the same point
				const level = d.job === "deep" || d.isSafety ? 2 : d.job === "drop" || d.job === "hook" || d.job === "robber" ? 1 : 0;
				const lead = distToRb < 3.2 ? 0 : Math.min(2.4, distToRb * (.12 + level * .04));
				const sideBias = wideRun ? 0 : (d.laneOffset || 0) * (0.35 + level * 0.15);
				const containY = wideRun ? rb.y : level === 2 ? rb.y + 2.8 : level === 1 ? rb.y + 1.1 : rb.y;
				tx = rb.x + (rb.vx || 0) * lead * .12 + sideBias;
				ty = (behindLos ? rb.y : containY) + (rb.vy || 0) * lead * .06;
				if (wideRun) tx = rb.x;
				// Support angle: shade toward the ball-carrier's open side relative to other defenders
				if (level < 2 && distToRb > 4.5) {
					let nearestAlly = null, nad = 99;
					defenders.forEach((o) => {
						if (o === d || o.state === "whiff") return;
						const dd = dist(o, d);
						if (dd < nad && dd < 9) { nad = dd; nearestAlly = o; }
					});
					if (nearestAlly) {
						const away = Math.sign(d.x - nearestAlly.x) || 1;
						tx += away * 0.55;
					}
				}
			}
			if (rb.y >= 98.4 && (d.isSafety || d.job === "deep")) {
				tx = rb.x * .7 + d.x * .3;
				ty = Math.min(98.8, Math.max(rb.y + 1.4, 96.5));
			}
			// P0b: unblocked DTs stay on their side of the LOS unless they are
			// the single designated slanter. After the runner crosses they can chase.
			if (d.group === "DT" && d.engageT <= 0 && !d.pancaked) {
				if (!d.dtPenetrate) {
					if (!rb || rb.y < playStartYard + 0.25) {
						tx = d.jobX != null ? d.x * 0.35 + d.jobX * 0.65 : tx;
						ty = Math.max(ty, d.jobY != null ? d.jobY : playStartYard + 1.6);
						ty = Math.max(ty, playStartYard + 0.45);
					}
				} else {
					ty = Math.max(ty, playStartYard - 1.05);
				}
			}
			const ang = Math.atan2(ty - d.y, tx - d.x);
			const want = Math.hypot(tx - d.x, ty - d.y);
			let mx = Math.cos(ang) * d.speed * dt;
			let my = Math.sin(ang) * d.speed * dt;
			const step = Math.hypot(mx, my);
			const maxStep = Math.min(1.15, want);
			if (step > maxStep && step > 0.0001) {
				mx *= maxStep / step;
				my *= maxStep / step;
			}
			if (want < 0.04) {
				mx = 0;
				my = 0;
			}
			d.x += mx;
			d.y += my;
			d.vx = mx / Math.max(dt, .001);
			d.vy = my / Math.max(dt, .001);
			turnToward(d, ang, dt, 10);
			d.x = clamp(d.x, fieldLeft() + .8, fieldRight() - .8);
			d.y = Math.min(d.y, Field.bodyCapY);
			if (d.group === "DT" && d.engageT <= 0 && !d.pancaked && d.state !== "whiff") {
				if (!d.dtPenetrate && (!rb || rb.y < playStartYard + 0.25)) d.y = Math.max(d.y, playStartYard + 0.4);
				else if (d.dtPenetrate) d.y = Math.max(d.y, playStartYard - 1.15);
			}
		});
		separateOpposing();
		applyAssignmentRepulsion(dt);
		if (tackleAnim) {
			tagTackleContact(tackleAnim);
			tackleAnim.timer -= dt;
			const prog = 1 - Math.max(0, tackleAnim.timer) / Math.max(0.01, tackleAnim.dur);
			const tKind = tackleAnim.kind || (tackleAnim.defender && (tackleAnim.defender._tackleKind || tackleAnim.defender.atkKind)) || "wrap";
			tackleAnim.kind = tKind;
			const bigHit = tKind === "hit";
			const e = tackleAnim.mode === "truckDrive" ? prog * prog : (bigHit ? 1 - (1 - prog) * (1 - prog) : prog);
			const fall = prog < 0.42 ? (prog / 0.42) * (prog / 0.42) : 1;
			function stampFall(p, isDef) {
				if (!p) return;
				if (tKind === "hit") {
					if (isDef) {
						p.fallLayout = 0;
						p.fallPitch = 0.12;
						p.fallRoll = 0.18;
					} else {
						p.fallLayout = 1;
						p.fallPitch = Math.PI * 0.48;
						p.fallRoll = 0.3;
					}
				} else if (tKind === "dive") {
					p.fallLayout = 0.42;
					p.fallPitch = 0.82;
					p.fallRoll = 0.7;
				} else {
					p.fallLayout = 0.05;
					p.fallPitch = 0.2;
					p.fallRoll = 1.18;
				}
			}
			if (rb) {
				rb.takenDown = true;
				rb.downAmt = fall;
				rb.low = true;
				stampFall(rb, false);
				if (bigHit || tackleAnim.mode === "truckDrive") {
					rb.facing = Math.atan2(tackleAnim.fy, tackleAnim.fx);
				}
				if (tackleAnim.defender) rb.fallSide = Math.sign(tackleAnim.defender.x - rb.x) || 1;
				if (tackleAnim.mode === "truckDrive") {
					rb.x = tackleAnim.ox + tackleAnim.fx * e * tackleAnim.dist;
					rb.y = tackleAnim.oy + tackleAnim.fy * e * tackleAnim.dist;
					if (tackleAnim.defender) {
						tackleAnim.defender.x = rb.x - tackleAnim.fx * .55;
						tackleAnim.defender.y = rb.y - tackleAnim.fy * .55;
						tackleAnim.defender.low = true;
						tackleAnim.defender.takenDown = true;
						tackleAnim.defender.downAmt = fall;
						tackleAnim.defender.facing = rb.facing;
						tackleAnim.defender.fallSide = -rb.fallSide;
						stampFall(tackleAnim.defender, true);
						if (tKind === "dive") {
							tackleAnim.defender.atkKind = "dive";
							tackleAnim.defender.atkT = Math.max(0.12, tackleAnim.defender.atkT || 0.12);
						} else if (tKind === "hit") {
							tackleAnim.defender.atkKind = "hit";
						} else {
							tackleAnim.defender.atkKind = "wrap";
						}
					}
				} else {
					const travel = (tackleAnim.dist || 0) * e;
					if (travel > 0.02) {
						rb.x = tackleAnim.ox + tackleAnim.fx * travel;
						rb.y = tackleAnim.oy + tackleAnim.fy * travel;
					}
					if (tackleAnim.defender) {
						const hold = tackleAnim.hold != null ? tackleAnim.hold : (bigHit ? 0.95 : 0.45);
						if (travel > 0.02) {
							tackleAnim.defender.x = rb.x - tackleAnim.fx * hold;
							tackleAnim.defender.y = rb.y - tackleAnim.fy * hold;
						}
						tackleAnim.defender.low = true;
						tackleAnim.defender.fallSide = -rb.fallSide;
						stampFall(tackleAnim.defender, true);
						if (tKind === "dive") {
							tackleAnim.defender.atkKind = "dive";
							tackleAnim.defender.atkT = Math.max(0.12, tackleAnim.defender.atkT || 0.12);
							tackleAnim.defender.takenDown = true;
							tackleAnim.defender.downAmt = fall;
						} else if (tKind === "hit") {
							tackleAnim.defender.atkKind = "hit";
							tackleAnim.defender.takenDown = false;
							tackleAnim.defender.downAmt = 0;
							tackleAnim.defender.low = true;
						} else {
							tackleAnim.defender.atkKind = "wrap";
							tackleAnim.defender.takenDown = true;
							tackleAnim.defender.downAmt = fall;
						}
					}
				}
			}
			if (rb && ballBrokePlane(rb)) {
				tackleAnim = null;
				scoreTouchdown();
				return;
			}
			if (tackleAnim.timer <= 0) {
				const yg = tackleAnim.yards;
				endPlay(tackleAnim.mode === "truckDrive" ? "Truck — tackled" : "Tackled", yg);
				awardPlayYards(yg);
				tackleAnim = null;
				updateCamera();
				return;
			}
			updateCamera();
			return;
		}
		if (!playActive) {
			updateCamera();
			return;
		}
		if (handoffDone && rb && !tackleAnim) {
			const hurdling = !!activeMove?.startsWith("hurdle");
			const ezInAir = !!(activeMove === "dive" && dive && dive.ezLeap);
			if (ezInAir && ballBrokePlane(rb)) rb._diveScore = true;
			for (const d of defenders) {
				if (ezInAir) break;
				if (d.pancaked || d.state === "whiff" || d.state === "recover") continue;
				if (playingDefense() && d === userDefender && !(d.atkKind === "wrap" || d.atkKind === "dive" || d.atkKind === "hit" || defWrapPhase === "wrapped" || d._strafe)) continue;
				if (qaNoCpuTackle && d !== userDefender) continue;
				let tackleRadius = rb.radius + d.radius + .14;
				// P0a: an engaged defender is occupied — shrink the wrap, do not
				// skip the check entirely (runner can slip the gap).
				if (d.engageT > 0) tackleRadius *= 0.38;
				const divingAtk = d.atkKind === "dive" && d.atkT > 0;
				const hittingAtk = d.atkKind === "hit" && d.atkT > 0;
				if (divingAtk) tackleRadius *= 1.55;
				else if (hittingAtk) tackleRadius *= 2.25;
				if (d._strafe) tackleRadius *= hittingAtk ? 1.22 : 1.48;
				if (idleCarrierT > .5) tackleRadius += .42;
				if (rb.y - playStartYard > 10) tackleRadius *= .96;
				if (activeMove === "spin") tackleRadius *= (moveTimer / Math.max(.01, moveDur) > .28) ? .38 : .7;
				const trucking = activeMove === "truck" || activeMove === "truckL" || activeMove === "truckR";
				if (activeMove === "dive" && (dive?.squeeze || dive?.duck)) tackleRadius *= .48;
				else if (activeMove === "dive") tackleRadius *= .82;
				if (hurdling && d.low) continue;
				if (hurdling && rb.hop > .22) {
					if (d === hurdleTarget) continue;
					if (hurdleOk && Math.abs(d.x - rb.x) < 1.4) continue;
					if (rb.y >= 90 && Math.abs(d.x - rb.x) < 1.6) continue;
				}
				if (dist(rb, d) < tackleRadius) {
					if (divingAtk) {
						const toRbX = rb.x - d.x;
						const toRbY = rb.y - d.y;
						const span = Math.hypot(toRbX, toRbY) || 1;
						const align = (toRbX * (d.atkDX || 0) + toRbY * (d.atkDY || 0)) / span;
						if (align < 0.32) {
							d.state = "whiff";
							stampTurfImpact(d, 0.48 + Math.random() * 0.16);
							d.low = true;
							d.vx = (d.atkDX || 0) * 5.2;
							d.vy = (d.atkDY || 0) * 3.4;
							clearAttack(d);
							continue;
						}
						const cd = carrierDir(rb);
						const ygDive = Math.round(rb.y - playStartYard);
						clearAttack(d);
						tackleAnim = {
							mode: "tackle",
							kind: "dive",
							timer: 0.58,
							dur: 0.58,
							ox: rb.x,
							oy: rb.y,
							fx: cd.x * 0.55 + (d.atkDX || 0) * 0.45,
							fy: cd.y * 0.55 + (d.atkDY || 0) * 0.45,
							dist: 0.22,
							hold: 0.5,
							yards: ygDive,
							defender: d
						};
						const flD = Math.hypot(tackleAnim.fx, tackleAnim.fy) || 1;
						tackleAnim.fx /= flD;
						tackleAnim.fy /= flD;
						return;
					}
					if (hittingAtk) {
						if (playingDefense() && d === userDefender) {
							const aim = d._hitAim != null ? d._hitAim : 0.45;
							resolveHitStick(d, d.atkDX || 0, d.atkDY || 0, dist(d, rb), aim);
							return;
						}
						const finesse = !!(activeMove && (activeMove === "spin" || activeMove.startsWith("juke") || activeMove.startsWith("shake") || activeMove.startsWith("deadleg")));
						let hitWin = 0.6;
						if (finesse) hitWin = 0.22;
						if (trucking) hitWin = 0.78;
						if (d._strafe) hitWin = Math.min(0.96, hitWin + 0.22);
						if (d.engageT > 0) hitWin *= 0.45;
						if (Math.random() > hitWin) {
							d.state = "recover";
							d.recoverT = 0.48 + Math.random() * 0.16;
							d.low = true;
							d.vx = -(d.atkDX || Math.sign(d.x - rb.x) || 1) * 5.2;
							d.vy = -(d.atkDY || 0) * 3.4;
							clearAttack(d);
							rb.x += Math.sign(rb.x - d.x || 1) * 0.45;
							rb.y += 0.85;
							continue;
						}
					}
					if (activeMove === "dive" && dive) {
						if (ballBrokePlane(rb)) {
							finishDive("Dive");
							return;
						}
						if (!dive.contacted) {
							dive.contacted = true;
							dive.contactX = rb.x;
							dive.contactY = rb.y;
							rb.low = true;
							rb.hop = 0;
							if (dive.phase === "slide" && !dive.duck) {
								finishDive("Dive — contact");
								return;
							}
							d.state = "recover";
							d.recoverT = .28;
							d.low = true;
							d.vx = (d.x - rb.x) * 2.2;
							d.vy = 1.4;
							continue;
						}
						if (Math.hypot(rb.x - dive.contactX, rb.y - dive.contactY) >= dive.afterContactYards) {
							if (dive.duck && rb.y >= 99.2) {
								finishDive("Dive");
								return;
							}
							finishDive(dive.squeeze ? "Dive — squeezed" : "Dive — down");
							return;
						}
						continue;
					}
					if (hurdling && !(hurdleOk && d === hurdleTarget)) {
						if (inGoal()) {
							d.state = "recover";
							d.recoverT = .32;
							stampTurfImpact(d, 0.2);
							d.vx = (d.x - rb.x) * 3.4;
							d.vy = 2.2;
							rb.x += Math.sign(rb.x - d.x || 1) * .45;
							rb.y += .55;
							continue;
						}
						const yg = Math.round(rb.y - playStartYard);
						tackleAnim = {
							mode: "tackle",
							timer: .48,
							dur: .48,
							ox: rb.x,
							oy: rb.y,
							fx: rb.x - d.x,
							fy: rb.y - d.y,
							dist: 1.4,
							yards: yg,
							defender: d
						};
						const flen = Math.hypot(tackleAnim.fx, tackleAnim.fy) || 1;
						tackleAnim.fx /= flen;
						tackleAnim.fy /= flen;
						rb.hop = 0;
						return;
					}
					if (hurdling && hurdleOk && d === hurdleTarget) {
						if (inGoal()) {
							d.state = "whiff";
							stampTurfImpact(d, 0.7);
							d.low = true;
							d.vy = 5.2;
							d.vx = (d.x - rb.x) * 2;
							rb.y += .4;
						}
						continue;
					}
					if (trucking) {
						const carrier = rb;
						const pile = defenders.filter((od) => od !== d && dist(carrier, od) < 2.35).length;
						const td = carrierDir(carrier);
						if (divingAtk && pile < 1 && !inGoal()) {
							const yg = Math.round(rb.y - playStartYard);
							clearAttack(d);
							tackleAnim = {
								mode: "tackle",
								timer: .42,
								dur: .42,
								ox: rb.x,
								oy: rb.y,
								fx: rb.x - d.x,
								fy: rb.y - d.y,
								dist: 1.2,
								yards: yg,
								defender: d
							};
							const flDive = Math.hypot(tackleAnim.fx, tackleAnim.fy) || 1;
							tackleAnim.fx /= flDive;
							tackleAnim.fy /= flDive;
							return;
						}
						if (inGoal()) {
							if (pile >= 3 && Math.random() < .32) {
								const yg = Math.round(rb.y - playStartYard);
								tackleAnim = {
									mode: "truckDrive",
									timer: .4,
									dur: .4,
									ox: rb.x,
									oy: rb.y,
									fx: td.x * 0.45 + (rb.truckDir || 0) * 0.2,
									fy: Math.max(0.35, td.y),
									dist: Math.max(1.6, 101.2 - rb.y),
									yards: yg + 2,
									defender: d
								};
								return;
							}
							const dir = rb.truckDir || 0;
							d.state = "recover";
							d.recoverT = .38;
							d.low = true;
							d.x += (dir || Math.sign(d.x - rb.x) || 1) * 0.7;
							d.y += td.y * 0.55;
							d.vx = (dir || Math.sign(d.x - rb.x) || 1) * 3.2 + td.x * 1.4;
							d.vy = td.y * 2.4;
							rb.y += td.y * 0.55;
							rb.x += td.x * 0.45 + dir * .25;
							continue;
						}
						if (pile >= 1) {
							const yg = Math.round(rb.y - playStartYard);
							tackleAnim = {
								mode: "truckDrive",
								timer: .45,
								dur: .45,
								ox: rb.x,
								oy: rb.y,
								fx: td.x,
								fy: td.y,
								dist: 2.2,
								yards: yg + 2,
								defender: d
							};
							return;
						}
						const roll = Math.random();
						// P0c: open-field truck is no longer the safe button (was 55% fall-forward)
						if (roll < .28) {
							const yg = Math.round(rb.y - playStartYard);
							const extra = 1.6 + Math.random() * 2.4;
							tackleAnim = {
								mode: "truckDrive",
								timer: .7,
								dur: .7,
								ox: rb.x,
								oy: rb.y,
								fx: td.x,
								fy: td.y,
								dist: extra,
								yards: yg + Math.round(extra),
								defender: d
							};
							return;
						} else if (roll < .85) {
							d.state = "whiff";
							stampTurfImpact(d, 0.32 + Math.random() * 0.14);
							d.low = true;
							d.x += Math.sign(d.x - rb.x || 1) * (0.55 + Math.random() * 0.35);
							d.y += td.y * 0.45;
							d.vx = Math.sign(d.x - rb.x || 1) * 3.4 + td.x * 1.6;
							d.vy = td.y * 2.2;
							d.slowed = .7;
							rb.x += td.x * 0.45;
							rb.y += td.y * 0.5;
							activeMove = null;
							moveTimer = 0;
							continue;
						} else {
							d.x += (d.x - rb.x) * .4;
							d.slowed = .9;
							activeMove = null;
							continue;
						}
					}
					const yg = Math.round(rb.y - playStartYard);
					clearAttack(d);
					const mR = playerMass(rb);
					const mD = playerMass(d);
					const rvx = rb.vx || 0, rvy = rb.vy || 0;
					const dvx = clamp(d.vx || 0, -7, 7), dvy = clamp(d.vy || 0, -7, 7);
					const comx = (mR * rvx + mD * dvx) / (mR + mD);
					const comy = (mR * rvy + mD * dvy) / (mR + mD);
					let comSpd = Math.hypot(comx, comy);
					const cd = carrierDir(rb);
					if (comSpd < 0.7) {
						comSpd = 0.7;
					}
					let fx = comx / (Math.hypot(comx, comy) || 1);
					let fy = comy / (Math.hypot(comx, comy) || 1);
					if (Math.hypot(comx, comy) < 0.7) {
						fx = cd.x;
						fy = cd.y;
					}
					const along = rvx * fx + rvy * fy;
					const chasedown = along > 1.2 && (d.y < rb.y - 0.15);
					const relSpd = Math.hypot(rvx - dvx, rvy - dvy);
					const defSpd = Math.hypot(dvx, dvy);
					let kind = d._tackleKind || d.atkKind || "wrap";
					if (hittingAtk || kind === "hit") kind = "hit";
					else if (divingAtk || kind === "dive") kind = "dive";
					else if (relSpd > 9.0 || (relSpd > 7.2 && defSpd > 6.2)) kind = "hit";
					else kind = "wrap";
					let drag = comSpd * (chasedown ? 0.26 : 0.16) * (mR / (mR + mD * 0.85));
					drag *= clamp(breakTackle, 0.55, 1.6);
					if (d.group === "DT") drag *= 0.72;
					else if (d.group === "DB") drag *= 1.12;
					if (kind === "hit") drag = clamp(drag, chasedown ? 1.6 : 1.4, chasedown ? 4.4 : 3.2);
					else if (kind === "dive") drag = clamp(drag, 0.12, 0.28);
					else drag = 0;
					if (breakTackle > 1.05 && !d._strafe && Math.random() < clamp((breakTackle - 1) * 0.35, 0, 0.55)) {
						d.slowed = Math.max(d.slowed, 0.55);
						d.recoverT = 0.2 + Math.random() * 0.15;
						d.state = "recover";
						rb.x += fx * 0.25 * breakTackle;
						rb.y += fy * 0.25 * breakTackle;
						continue;
					}
					const dur = kind === "hit"
						? clamp(0.7 + drag * 0.08, 0.7, 1.05)
						: kind === "dive" ? 0.56 : 0.46;
					tackleAnim = {
						mode: "tackle",
						kind,
						timer: dur,
						dur,
						ox: rb.x,
						oy: rb.y,
						fx,
						fy,
						dist: drag,
						hold: kind === "hit" ? 0.95 : (chasedown ? 0.4 : 0.45),
						yards: yg + Math.round(drag * (kind === "hit" ? (chasedown ? 0.7 : 0.35) : 0.15)),
						defender: d
					};
					return;
				}
			}
		}
		if (handoffDone && rb && !tackleAnim && !scoreSeq) {
			if (ballBrokePlane(rb)) {
				if (activeMove === "dive" || dive) {
					rb._diveScore = true;
				} else {
					scoreTouchdown();
					return;
				}
			}
			if (isSidelineOob(rb) && !(activeMove === "dive" || dive)) {
				const yg = Math.round(rb.y - playStartYard);
				endPlay("Out of bounds", yg);
				awardPlayYards(yg);
				return;
			}
		}
		if (rb && rb.y >= 100 && handoffDone && !scoreSeq) {
			if (activeMove === "dive" || dive) {
				rb._diveScore = true;
			} else {
				scoreTouchdown();
				return;
			}
		}

		// Runner path trail

		// Mesh exchange: QB → RB (handoff or pitch)
		if (playActive && !handoffDone && rb) {
			handoffT += dt;
			const style = currentPlay ? currentPlay.blockStyle : "";
			const isPitch = /wall|sweep|wedge|swing|pull/.test(style) || (currentPlay && /sweep|wedge|swing|pitch/i.test(currentPlay.name || ""));
			const tossDur = isPitch ? 0.42 : 0.28;
			if (handoffPhase === "pre") {
				if (qb) {
					qb.hasBall = true;
					rb.hasBall = false;
					// QB opens toward RB
					const ang = Math.atan2(rb.y - qb.y, rb.x - qb.x);
					qb.facing = ang;
				}
				if (handoffT > 0.08) {
					handoffPhase = "toss";
					handoffT = 0;
					if (qb) qb.hasBall = false;
					handoffBall = { x: qb ? qb.x : rb.x, y: qb ? qb.y : playStartYard };
				}
			} else if (handoffPhase === "toss") {
				const t = Math.min(1, handoffT / tossDur);
				const sx = qb ? qb.x : (handoffBall ? handoffBall.x : rb.x);
				const sy = qb ? qb.y : playStartYard;
				// Pitch arcs slightly behind LOS; handoff is tighter
				const arc = isPitch ? Math.sin(t * Math.PI) * 1.4 : Math.sin(t * Math.PI) * 0.35;
				handoffBall = {
					x: sx + (rb.x - sx) * t,
					y: sy + (rb.y - sy) * t - arc
				};
				if (t >= 1) {
					handoffDone = true;
					handoffPhase = "done";
					handoffBall = null;
					rb.hasBall = true;
					if (qb) qb.hasBall = false;
				}
			}
		}
		if (showRunnerTrail && rb && !paused && (playActive || scoreSeq) && (handoffDone || dive || activeMove === "dive" || scoreSeq)) {
			_trailAcc += dt;
			const last = runnerTrail.length ? runnerTrail[runnerTrail.length - 1] : null;
			const moved = !last || Math.hypot(rb.x - last.x, rb.y - last.y) > 0.15;
			const nearGoal = rb.y >= 96 || (dive && dive.pylon) || activeMove === "dive";
			const minT = nearGoal || dive || activeMove === "dive" ? 0.016 : 0.04;
			if ((moved || nearGoal) && _trailAcc > minT) {
				const spd = Math.hypot(rb.vx || 0, rb.vy || 0);
				runnerTrail.push({ x: rb.x, y: Math.min(100, rb.y), spd });
				_trailAcc = 0;
				if (runnerTrail.length > 600) runnerTrail.shift();
			}
		}
		updateCamera();
	}
	function wrapAng(a) {
		while (a > Math.PI) a -= Math.PI * 2;
		while (a < -Math.PI) a += Math.PI * 2;
		return a;
	}
	function turnToward(p, ang, dt, rate) {
		if (p.facing == null) {
			p.facing = ang;
			return;
		}
		const dlt = wrapAng(ang - p.facing);
		const max = (rate || 9) * dt;
		p.facing += Math.abs(dlt) < max ? dlt : Math.sign(dlt) * max;
	}
	function facingToPreset(p) {
		const facing = typeof p === "number" ? p : p && p.facing != null ? p.facing : Math.PI / 2;
		const a = (facing % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
		const raw = Math.round(a / (Math.PI / 4)) % 8;
		if (!p || typeof p === "number") return raw;
		if (p._sector == null) p._sector = raw;
		const center = p._sector * (Math.PI / 4);
		if (Math.abs(wrapAng(a - center)) > Math.PI / 4 * .78) p._sector = raw;
		return p._sector;
	}
	const TORSO_POSES = [
		{
			rx: .52,
			ry: .62,
			rot: .42,
			hx: .22,
			hy: -.82,
			nx: .18,
			ny: -.02,
			ns: .72,
			hip: .18
		},
		{
			rx: .58,
			ry: .6,
			rot: .22,
			hx: .12,
			hy: -.86,
			nx: .08,
			ny: -.06,
			ns: .55,
			hip: .1
		},
		{
			rx: .72,
			ry: .58,
			rot: 0,
			hx: 0,
			hy: -.88,
			nx: 0,
			ny: -.1,
			ns: .48,
			hip: 0
		},
		{
			rx: .58,
			ry: .6,
			rot: -.22,
			hx: -.12,
			hy: -.86,
			nx: -.08,
			ny: -.06,
			ns: .55,
			hip: -.1
		},
		{
			rx: .52,
			ry: .62,
			rot: -.42,
			hx: -.22,
			hy: -.82,
			nx: -.18,
			ny: -.02,
			ns: .72,
			hip: -.18
		},
		{
			rx: .7,
			ry: .62,
			rot: -.18,
			hx: -.1,
			hy: -.84,
			nx: -.06,
			ny: .02,
			ns: .85,
			hip: -.08
		},
		{
			rx: .85,
			ry: .65,
			rot: 0,
			hx: 0,
			hy: -.85,
			nx: 0,
			ny: .02,
			ns: 1,
			hip: 0
		},
		{
			rx: .7,
			ry: .62,
			rot: .18,
			hx: .1,
			hy: -.84,
			nx: .06,
			ny: .02,
			ns: .85,
			hip: .08
		}
	];
	function ballColorsFor(pl) {
		const uni = getUni(pl && pl.side ? pl.side : "off");
		const fill = uni.ball || uni.logoFill || "#6B3A2A";
		const lace = uni.lace || uni.logoMark || "#F5E6C8";
		return { fill, lace };
	}
	function drawFootball(sx, sy, r, angle = -.4, fill, lace) {
		fill = fill || "#6B3A2A";
		lace = lace || "#F5E6C8";
		const rx = r * 0.5, ry = r * 0.3;
		ctx.save();
		ctx.translate(sx, sy);
		ctx.rotate(angle);
		ctx.beginPath();
		ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
		ctx.fillStyle = fill;
		ctx.fill();
		ctx.strokeStyle = mixHex(fill, "#000000", 0.32);
		ctx.lineWidth = Math.max(1, r * 0.06);
		ctx.stroke();
		function laceStroke(col, wMul) {
			ctx.strokeStyle = col;
			ctx.lineCap = "round";
			ctx.lineWidth = Math.max(0.7, ry * 0.11) * wMul;
			ctx.beginPath();
			ctx.moveTo(-rx * 0.38, 0);
			ctx.lineTo(rx * 0.38, 0);
			ctx.stroke();
			ctx.lineWidth = Math.max(0.55, ry * 0.09) * wMul;
			for (let i = -3; i <= 3; i++) {
				ctx.beginPath();
				ctx.moveTo(i * rx * 0.09, -ry * 0.16);
				ctx.lineTo(i * rx * 0.09, ry * 0.16);
				ctx.stroke();
			}
		}
		laceStroke(mixHex(lace, "#000000", 0.28), 1.15);
		laceStroke(lace, 1);
		ctx.restore();
	}
	function jerseyRingColor(side) {
		const s = side || "off";
		return getUni(s).jersey || (s === "def" ? "#1d4ed8" : "#3b82f6");
	}
	function drawControlRing(sx, sy, r, dashed, label, side) {
		if (label) {
			const col = jerseyRingColor(side || "off");
			ctx.save();
			ctx.font = "bold " + Math.max(11, r * .7) + "px Barlow Condensed, sans-serif";
			ctx.textAlign = "center";
			ctx.textBaseline = "bottom";
			ctx.lineWidth = 3;
			ctx.strokeStyle = "rgba(0,0,0,0.7)";
			ctx.strokeText(label, sx, sy - r - 8);
			ctx.fillStyle = col;
			ctx.fillText(label, sx, sy - r - 8);
			ctx.restore();
		}
	}
	function drawFieldRing(wx, wy, radYd, col, dashed) {
		const n = 40;
		const pts = [];
		for (let i = 0; i <= n; i++) {
			const a = (i / n) * Math.PI * 2;
			pts.push(project(wx + Math.cos(a) * radYd, wy + Math.sin(a) * radYd, 0));
		}
		const mid = project(wx, wy, 0);
		if (mid.behind) return;
		const sc = Math.max(0.35, mid.sc || 1);
		ctx.save();
		ctx.lineJoin = "round";
		ctx.lineCap = "round";
		if (dashed) ctx.setLineDash([Math.max(4, 7 * sc), Math.max(3, 5 * sc)]);
		function strokeRing(color, width) {
			ctx.strokeStyle = color;
			ctx.lineWidth = width;
			ctx.beginPath();
			let started = false;
			for (const pt of pts) {
				if (!pt || pt.behind) { started = false; continue; }
				if (!started) { ctx.moveTo(pt.sx, pt.sy); started = true; }
				else ctx.lineTo(pt.sx, pt.sy);
			}
			ctx.stroke();
		}
		strokeRing("rgba(0,0,0,0.55)", Math.max(2.2, 3.4 * sc));
		strokeRing(col, Math.max(1.5, 2.2 * sc));
		ctx.setLineDash([]);
		ctx.restore();
	}
	function drawPlayerRings(p, isBallCarrier) {
		if (!p) return;
		const ringRad = (p.radius || 0.85) * 1.18;
		if (isBallCarrier && p.hasBall) drawFieldRing(p.x, p.y, ringRad, jerseyRingColor("off"), false);
		if (playingDefense() && p === userDefender) drawFieldRing(p.x, p.y, ringRad, jerseyRingColor("def"), false);
		if (p === ctrlLeft) drawFieldRing(p.x, p.y, ringRad, jerseyRingColor(playingDefense() ? "def" : "off"), true);
		if (p === ctrlRight) drawFieldRing(p.x, p.y, ringRad, jerseyRingColor(playingDefense() ? "def" : "off"), true);
	}
	function volumeEllipse(x, y, rx, ry, rot, color) {
		const light = mixHex(color, "#ffffff", 0.3);
		const dark = mixHex(color, "#050505", 0.4);
		ctx.save();
		ctx.translate(x, y);
		ctx.rotate(rot || 0);
		const g = ctx.createLinearGradient(-rx, -ry * 0.85, rx * 0.72, ry);
		g.addColorStop(0, light);
		g.addColorStop(0.46, color);
		g.addColorStop(1, dark);
		ctx.beginPath();
		ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
		ctx.fillStyle = g;
		ctx.fill();
		ctx.globalAlpha = 0.22;
		ctx.fillStyle = "#ffffff";
		ctx.beginPath();
		ctx.ellipse(-rx * 0.28, -ry * 0.36, rx * 0.36, ry * 0.2, -0.45, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
	}
	function clothEllipse(x, y, rx, ry, rot, color) {
		const light = mixHex(color, "#ffffff", 0.12);
		const dark = mixHex(color, "#0a0a0a", 0.16);
		ctx.save();
		ctx.translate(x, y);
		ctx.rotate(rot || 0);
		const g = ctx.createLinearGradient(-rx, -ry * 0.6, rx * 0.4, ry * 0.8);
		g.addColorStop(0, light);
		g.addColorStop(0.5, color);
		g.addColorStop(1, dark);
		ctx.beginPath();
		ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
		ctx.fillStyle = g;
		ctx.fill();
		ctx.restore();
	}
	function fillArmorCapsule(a, b, wa, wb, color, cloth, caps) {
		if (!a && !b) return;
		if ((!a || a.behind) && (!b || b.behind)) return;
		const drawCap = cloth ? clothEllipse : volumeEllipse;
		if (!a || a.behind || !b || b.behind) {
			const vis = (a && !a.behind) ? a : b;
			const w = (a && !a.behind) ? wa : wb;
			if (vis) drawCap(vis.sx, vis.sy, w, w * 0.82, 0, color);
			return;
		}
		const dx = b.sx - a.sx, dy = b.sy - a.sy;
		const len = Math.hypot(dx, dy) || 1;
		const nx = -dy / len, ny = dx / len;
		ctx.beginPath();
		ctx.moveTo(a.sx + nx * wa, a.sy + ny * wa);
		ctx.lineTo(b.sx + nx * wb, b.sy + ny * wb);
		ctx.lineTo(b.sx - nx * wb, b.sy - ny * wb);
		ctx.lineTo(a.sx - nx * wa, a.sy - ny * wa);
		ctx.closePath();
		ctx.fillStyle = color;
		ctx.fill();
		ctx.strokeStyle = mixHex(color, "#000000", cloth ? 0.22 : 0.38);
		ctx.lineWidth = 1;
		ctx.stroke();
		const mode = caps == null ? "both" : caps;
		if (mode === "both" || mode === "start") drawCap(a.sx, a.sy, wa, wa * 0.82, 0, color);
		if (mode === "both" || mode === "end") drawCap(b.sx, b.sy, wb, wb * 0.82, 0, color);
	}
	function armorJoint(pt, rad, color) {
		if (!pt || pt.behind) return;
		volumeEllipse(pt.sx, pt.sy, rad, rad * 0.82, 0, mixHex(color, "#05070a", 0.32));
		clothEllipse(pt.sx, pt.sy, rad * 0.5, rad * 0.42, 0, mixHex(color, "#c8cdd2", 0.12));
	}
	function sleeveRings(a, b, n, armW, color) {
		if (!a || !b || a.behind || b.behind) return;
		const dx = b.sx - a.sx, dy = b.sy - a.sy;
		const t = 0.55;
		const cx = a.sx + dx * t, cy = a.sy + dy * t;
		const ang = Math.atan2(dy, dx);
		const hw = armW * 0.95;
		ctx.save();
		ctx.translate(cx, cy);
		ctx.rotate(ang);
		ctx.strokeStyle = color;
		ctx.lineCap = "round";
		ctx.lineWidth = Math.max(1.05, armW * 0.12);
		ctx.beginPath();
		ctx.ellipse(0, 0, hw * 0.28, hw * 0.92, 0, 0, Math.PI * 2);
		ctx.stroke();
		ctx.restore();
	}
	function pantSideStripes(a, b, n, width, color, outer) {
		if (!a || !b || a.behind || b.behind) return;
		const dx = b.sx - a.sx, dy = b.sy - a.sy;
		const len = Math.hypot(dx, dy) || 1;
		const ux = dx / len, uy = dy / len;
		let nx = -uy, ny = ux;
		if (outer && (outer.sx != null)) {
			nx = outer.sx;
			ny = outer.sy;
		}
		ctx.strokeStyle = color;
		ctx.lineCap = "butt";
		const off = width * 0.52;
		if (n <= 1) {
			ctx.lineWidth = Math.max(1.4, width * 0.18);
			ctx.beginPath();
			ctx.moveTo(a.sx + nx * off + ux * len * 0.02, a.sy + ny * off + uy * len * 0.02);
			ctx.lineTo(b.sx + nx * off - ux * len * 0.02, b.sy + ny * off - uy * len * 0.02);
			ctx.stroke();
		} else {
			ctx.lineWidth = Math.max(1, width * 0.1);
			for (let i = -1; i <= 1; i++) {
				const o = off + i * Math.max(1.4, width * 0.14);
				ctx.beginPath();
				ctx.moveTo(a.sx + nx * o + ux * len * 0.02, a.sy + ny * o + uy * len * 0.02);
				ctx.lineTo(b.sx + nx * o - ux * len * 0.02, b.sy + ny * o - uy * len * 0.02);
				ctx.stroke();
			}
		}
	}
	function visualBulk(p) {
		const g = p && p.group;
		if (g === "OL" || g === "DT") return 1.2;
		if (g === "FB" || g === "TE" || g === "LB") return 1.07;
		if (g === "QB") return 0.98;
		return 0.95;
	}
	function gaitTime() {
		if (fullReplay && fullReplay.i != null) return (fullReplay.i || 0) / REPLAY_HZ;
		return poseClock;
	}
	function gaitCadence(ground) {
		const g = Math.max(0, ground || 0);
		if (g <= 0.32) return 0;
		// rad/s; 2π = one full left/right cycle (two steps).
		// ~2.5 steps/s at a jog, ~4.6 at a sprint so stride length stays ~2 yd.
		return Math.min(16.8, 4.85 + g * 1.05);
	}
	function playerGroundSpeed(p) {
		if (!p) return 0;
		if (p.gaitSpd != null && isFinite(p.gaitSpd)) return Math.max(0, p.gaitSpd);
		return Math.hypot(p.vx || 0, p.vy || 0);
	}
	function eachLivePlayer(fn) {
		if (rb) fn(rb);
		if (qb && qb !== rb) fn(qb);
		(blockers || []).forEach(fn);
		(defenders || []).forEach(fn);
	}
	function syncGaitSpeeds(dt) {
		const inv = 1 / Math.max(dt || 0.016, 0.001);
		eachLivePlayer((p) => {
			if (!p) return;
			if (p._gx == null || p._gy == null) {
				p._gx = p.x;
				p._gy = p.y;
				p.gaitSpd = 0;
				return;
			}
			const dx = (p.x || 0) - p._gx;
			const dy = (p.y || 0) - p._gy;
			const distMoved = Math.hypot(dx, dy);
			p._gx = p.x;
			p._gy = p.y;
			if (distMoved > 6.5) {
				p.gaitSpd = 0;
				return;
			}
			let inst = distMoved * inv;
			if (inst > 13.2) inst = Math.min(inst, Math.hypot(p.vx || 0, p.vy || 0) * 1.08);
			inst = Math.min(13.2, inst);
			p.gaitSpd = p.gaitSpd == null ? inst : Math.min(13.2, p.gaitSpd * 0.28 + inst * 0.72);
		});
	}
	function strokeLimb(ax, ay, bx, by, width, color) {
		if (!isFinite(ax + ay + bx + by)) return;
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		ctx.strokeStyle = mixHex(color, "#000000", 0.32);
		ctx.lineWidth = width + 1.25;
		ctx.beginPath();
		ctx.moveTo(ax, ay);
		ctx.lineTo(bx, by);
		ctx.stroke();
		ctx.strokeStyle = color;
		ctx.lineWidth = width;
		ctx.beginPath();
		ctx.moveTo(ax, ay);
		ctx.lineTo(bx, by);
		ctx.stroke();
	}
	function fillJoint(pt, rx, ry, color) {
		if (!pt || pt.behind) return;
		volumeEllipse(pt.sx, pt.sy, rx, ry, 0, color);
	}
	function playerBasis(p) {
		const a = p.facing != null ? p.facing : Math.PI / 2;
		return {
			fwx: Math.cos(a),
			fwy: Math.sin(a),
			rtx: Math.sin(a),
			rty: -Math.cos(a)
		};
	}
	function jointP(p, lat, fwd, up) {
		const b = playerBasis(p);
		let plat = lat, pfwd = fwd, pup = up;
		if (p && p.takenDown) {
			const fall = Math.max(0, Math.min(1, p.downAmt != null ? p.downAmt : 1));
			const pitch = fall * (p.fallPitch != null ? p.fallPitch : Math.PI * 0.5);
			const cp = Math.cos(pitch), sp = Math.sin(pitch);
			const nf = pfwd * cp + pup * sp;
			const nu = pup * cp - pfwd * sp * 0.1;
			const roll = fall * (p.fallRoll != null ? p.fallRoll : 0.48) * (p.fallSide || 1);
			const cr = Math.cos(roll), sr = Math.sin(roll);
			plat = lat * cr - nu * sr;
			pup = Math.max(0.06, lat * sr + nu * cr);
			pfwd = nf;
		}
		return project(p.x + b.rtx * plat + b.fwx * pfwd, p.y + b.rty * plat + b.fwy * pfwd, Math.max(0.02, pup));
	}
	function drawFootballAt(p, lat, fwd, up, ang) {
		const q = jointP(p, lat, fwd, up);
		if (q.behind) return;
		const rr = Math.max(6.2, 0.55 * yardToPx() * (q.sc || 1));
		const bc = ballColorsFor(p);
		drawFootball(q.sx, q.sy, rr, ang, bc.fill, bc.lace);
	}
	function stampTurfImpact(p, dur) {
		if (!p) return;
		const t = dur == null ? 0.66 : dur;
		p.whiffT = Math.max(p.whiffT || 0, t);
		p.whiffMax = Math.max(p.whiffMax || 0, p.whiffT);
		p.turfX = p.x;
		p.turfY = p.y;
		p.turfStainT = Math.max(p.turfStainT || 0, 2.7);
		p.turfStainMax = Math.max(p.turfStainMax || 0, p.turfStainT);
		p.turfSeed = (((p.number || 7) * 131) + (Math.floor((p.x || 0) * 13) * 17) + (Math.floor((p.y || 0) * 11) * 31)) >>> 0;
		p.turfN = 2 + (p.turfSeed % 2);
	}
	function tickTurfStain(p, dt) {
		if (!p || !(p.turfStainT > 0)) return;
		p.turfStainT = Math.max(0, p.turfStainT - dt);
		if (p.turfStainT <= 0) p.turfStainMax = 0;
	}
	function tickTurfFx(p, dt) {
		if (!p) return;
		if (p.whiffT > 0) {
			p.whiffT = Math.max(0, p.whiffT - dt);
			if (p.whiffT <= 0) p.whiffMax = 0;
		}
		tickTurfStain(p, dt);
	}
	function layOutPlayer(p, side) {
		if (!p) return;
		p.takenDown = true;
		p.downAmt = 1;
		p.low = true;
		p.fallLayout = 1;
		p.fallPitch = Math.PI * 0.46;
		p.fallRoll = 0.22;
		p.fallSide = side || p.fallSide || 1;
	}
	function drawTurfImpact(p) {
		if (!p) return;
		if ((p.whiffT > 0 || p.state === "whiff") && p.turfX == null) {
			p.turfX = p.x;
			p.turfY = p.y;
			if (!(p.turfStainT > 0)) {
				p.turfStainT = 2.7;
				p.turfStainMax = 2.7;
			}
		}
		const ix = p.turfX != null ? p.turfX : p.x;
		const iy = p.turfY != null ? p.turfY : p.y;
		if (p.turfSeed == null) {
			p.turfSeed = (((p.number || 7) * 131) + (Math.floor((ix || 0) * 13) * 17) + (Math.floor((iy || 0) * 11) * 31)) >>> 0;
		}
		if (!(p.whiffMax > 0) && p.whiffT > 0) p.whiffMax = Math.max(p.whiffT, 0.38);
		const maxT = p.whiffMax || 0.65;
		const tLeft = p.whiffT || 0;
		const u = Math.max(0, Math.min(1, 1 - tLeft / Math.max(0.12, maxT)));
		const stainMax = p.turfStainMax || 2.7;
		const stainLeft = p.turfStainT != null ? p.turfStainT : (tLeft > 0 ? stainMax : 0);
		const stainU = Math.max(0, Math.min(1, 1 - stainLeft / Math.max(0.2, stainMax)));
		let s = p.turfSeed >>> 0;
		function rnd() {
			s = (s + 0x6D2B79F5) >>> 0;
			let n = Math.imul(s ^ s >>> 15, 1 | s);
			n = n + Math.imul(n ^ n >>> 7, 61 | n) ^ n;
			return ((n ^ n >>> 14) >>> 0) / 4294967296;
		}
		const nPatch = 2 + (p.turfSeed % 2);
		p.turfN = nPatch;
		const facing = p.facing != null ? p.facing : (p.vy < -0.05 ? -Math.PI / 2 : Math.PI / 2);
		const fwdX = Math.cos(facing), fwdY = Math.sin(facing);
		const latX = -fwdY, latY = fwdX;
		const footLen = 0.34, footWid = 0.14;
		function footQuad(wx, wy, h) {
			const hl = footLen * 0.5, hw = footWid * 0.5;
			return [
				project(wx + fwdX * hl + latX * hw, wy + fwdY * hl + latY * hw, h),
				project(wx + fwdX * hl - latX * hw, wy + fwdY * hl - latY * hw, h),
				project(wx - fwdX * hl - latX * hw, wy - fwdY * hl - latY * hw, h),
				project(wx - fwdX * hl + latX * hw, wy - fwdY * hl + latY * hw, h)
			];
		}
		if (stainLeft > 0) {
			const fade = 1 - stainU * 0.9;
			for (let i = 0; i < nPatch; i++) {
				const along = (i - (nPatch - 1) * 0.5) * 0.42;
				const lat = ((i % 2) * 2 - 1) * 0.12;
				const wx = ix + fwdX * along + latX * lat;
				const wy = iy + fwdY * along + latY * lat;
				const col = i % 2 === 0
					? mixHex(turfBase(), "#030504", 0.7)
					: mixHex(stripeFill(wy || 50), "#020302", 0.52);
				fillWorldPoly(footQuad(wx, wy, 0.018), col, null, 0.52 * fade, false);
			}
		}
		if (!(tLeft > 0)) return;
		for (let i = 0; i < nPatch; i++) {
			const a0 = facing + (rnd() - 0.5) * 0.9;
			const spread = 0.08 + rnd() * 0.22;
			const lift = 0.18 + rnd() * 0.28;
			const dist = 0.04 + spread * u;
			const hop = Math.sin(Math.min(1, u * 1.15) * Math.PI) * lift * (1 - u * 0.28);
			const wx = ix + Math.cos(a0) * dist;
			const wy = iy + Math.sin(a0) * dist;
			const z = Math.max(0.02, hop);
			const dirt = rnd();
			let col;
			if (dirt < 0.35) col = mixHex("#1a1610", "#050504", 0.35);
			else if (dirt < 0.7) col = mixHex(turfBase(), "#030403", 0.4);
			else col = mixHex(stripeFill(iy || 50), "#6a9a4a", 0.16);
			fillWorldPoly(footQuad(wx, wy, z), col, null, 0.88 * (1 - Math.pow(u, 1.25)), false);
		}
	}
	function drawHelmet3(p, hx, hy, hh, rPx, bulk) {
		const shell = jointP(p, hx, hy - 0.05, hh + 0.02);
		if (shell.behind) return;
		const back = jointP(p, hx, hy - 0.18, hh + 0.01);
		const front = jointP(p, hx, hy + 0.12, hh + 0.01);
		const rx = rPx * 0.36 * (0.98 + (bulk - 1) * 0.08);
		const ry = rPx * 0.26;
		const ang = (back && front) ? Math.atan2(front.sy - back.sy, front.sx - back.sx) : 0;
		const cw = getCamWorld();
		const b = playerBasis(p);
		let faceToward = true;
		if (cw) {
			faceToward = ((cw.camX - p.x) * b.fwx + (cw.camY - p.y) * b.fwy) > 0.08;
		}
		ctx.save();
		ctx.translate(shell.sx, shell.sy);
		ctx.rotate(ang);
		const g = ctx.createLinearGradient(-rx, -ry, rx * 0.6, ry);
		g.addColorStop(0, mixHex(p.helmet, "#ffffff", 0.22));
		g.addColorStop(0.5, p.helmet);
		g.addColorStop(1, mixHex(p.helmet, "#050505", 0.38));
		const upRef = jointP(p, hx, hy - 0.05, hh + 0.32);
		let neckX = 0, neckY = ry * 0.82, neckOn = false;
		if (upRef && !upRef.behind) {
			const vx = upRef.sx - shell.sx, vy = upRef.sy - shell.sy;
			const c = Math.cos(ang), s = Math.sin(ang);
			const luX = vx * c + vy * s;
			const luY = -vx * s + vy * c;
			const uLen = Math.hypot(luX, luY);
			if (uLen > 2.4) {
				neckOn = true;
				const ndx = -luX / uLen, ndy = -luY / uLen;
				neckX = ndx * rx * 0.72 - rx * 0.16;
				neckY = ndy * ry * 0.8;
			}
		}
		ctx.beginPath();
		ctx.ellipse(-rx * 0.08, 0, rx * 1.14, ry * 1.08, 0, 0, Math.PI * 2);
		ctx.fillStyle = g;
		ctx.fill();
		ctx.restore();
		const nStripe = p.helmStripes || 0;
		const stripeCol = p.helmStripeCol || p.facemask || "#ffffff";
		if (nStripe > 0) {
			const n = nStripe === 2 ? 2 : nStripe >= 3 ? 3 : 1;
			const lats = n === 1 ? [0] : n === 2 ? [-0.2, 0.2] : [-0.36, 0, 0.36];
			ctx.save();
			ctx.translate(shell.sx, shell.sy);
			ctx.rotate(ang);
			ctx.beginPath();
			ctx.ellipse(0, 0, rx * 1.14, ry * 1.1, 0, 0, Math.PI * 2);
			ctx.clip();
			let dome = 0, dirX = 0, dirY = -1;
			if (upRef && !upRef.behind) {
				const vx = upRef.sx - shell.sx, vy = upRef.sy - shell.sy;
				const c = Math.cos(ang), s = Math.sin(ang);
				const luX = vx * c + vy * s;
				const luY = -vx * s + vy * c;
				const uLen = Math.hypot(luX, luY);
				dome = Math.min(1, uLen / Math.max(11, ry * 1.85));
				if (uLen > 0.4) {
					dirX = luX / uLen;
					dirY = luY / uLen;
				}
			}
			ctx.strokeStyle = stripeCol;
			ctx.lineCap = "round";
			ctx.lineJoin = "round";
			ctx.lineWidth = Math.max(1.15, rPx * (n === 1 ? 0.068 : 0.042));
			const fwdCam = cw ? ((cw.camX - p.x) * b.fwx + (cw.camY - p.y) * b.fwy) : (faceToward ? 1 : -1);
			for (const latOff of lats) {
				ctx.beginPath();
				let started = false;
				for (let i = 0; i <= 20; i++) {
					const t = i / 20;
					const a = Math.PI * (0.96 - 0.82 * t);
					const keep = dome < 0.32 || Math.abs(fwdCam) < 0.42 || Math.cos(a) * fwdCam >= -0.15 || Math.sin(a) > 0.8;
					if (!keep) { started = false; continue; }
					const along = rx * Math.cos(a) * 0.96;
					const rise = ry * Math.sin(a) * dome;
					const px = along + rise * dirX;
					const py = latOff * rx * (1 - dome * 0.25) + rise * dirY;
					if (!started) { ctx.moveTo(px, py); started = true; }
					else ctx.lineTo(px, py);
				}
				ctx.stroke();
			}
			ctx.restore();
		}
		const vis = jointP(p, hx, hy + 0.16, hh + 0.0);
		if (faceToward && vis && !vis.behind) {
			ctx.fillStyle = "#070b10";
			ctx.beginPath();
			ctx.ellipse(vis.sx, vis.sy, rx * 0.36, ry * 0.4, ang, 0, Math.PI * 2);
			ctx.fill();
		}
		if (p.helmVisor && faceToward && vis && !vis.behind) {
			ctx.globalAlpha = 0.82;
			clothEllipse(vis.sx, vis.sy, rx * 0.5, ry * 0.22, ang, "#071018");
			ctx.globalAlpha = 0.35;
			clothEllipse(vis.sx, vis.sy - ry * 0.04, rx * 0.36, ry * 0.09, ang, mixHex(p.facemask || "#4aa3c8", "#071018", 0.4));
			ctx.globalAlpha = 1;
		}
		const grill = !!(p.helmGrill || p.group === "OL" || p.group === "DT" || p.group === "FB" || p.group === "LB");
		const barsN = grill ? Math.max(4, p.helmBars || 4) : Math.max(2, Math.min(3, p.helmBars || 2));
		ctx.strokeStyle = p.facemask || p.numColor || "#c5c8cc";
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		ctx.lineWidth = Math.max(0.8, rPx * 0.036);
		const maskR = 0.155;
		const maskFwd = 0.055;
		const browH = 0.01;
		const chinH = grill ? -0.13 : -0.115;
		function maskVis(lat, fwd) {
			if (!cw) return true;
			const camLat = (cw.camX - p.x) * b.rtx + (cw.camY - p.y) * b.rty;
			const camFwd = (cw.camX - p.x) * b.fwx + (cw.camY - p.y) * b.fwy;
			return fwd * camFwd + lat * camLat > -0.45;
		}
		function strokeMask(pts) {
			ctx.beginPath();
			let started = false;
			for (const item of pts) {
				const q = item && item.q ? item.q : item;
				const visPt = item && item.vis != null ? item.vis : (q && !q.behind);
				if (!q || q.behind || !visPt) { started = false; continue; }
				if (!started) { ctx.moveTo(q.sx, q.sy); started = true; }
				else ctx.lineTo(q.sx, q.sy);
			}
			ctx.stroke();
		}
		const fwdCam = cw && b ? ((cw.camX - p.x) * b.fwx + (cw.camY - p.y) * b.fwy) : 1;
		if (fwdCam > -0.62) {
			for (let i = 0; i < barsN; i++) {
				const u = barsN === 1 ? 0.5 : i / (barsN - 1);
				const barH = chinH + u * (browH - chinH);
				const pts = [];
				for (let k = 0; k <= 12; k++) {
					const t = k / 12;
					const a = -1.18 + 2.36 * t;
					const lat = Math.sin(a) * maskR;
					const fwd = maskFwd + Math.cos(a) * 0.14;
					pts.push({ q: jointP(p, hx + lat, hy + fwd, hh + barH - Math.abs(a) * 0.008), vis: maskVis(lat, fwd) });
				}
				strokeMask(pts);
			}
			for (const s of [-1, 1]) {
				const a = s * 1.08;
				const lat = Math.sin(a) * maskR;
				const fwd = maskFwd + Math.cos(a) * 0.14;
				const pts = [];
				for (let k = 0; k <= 6; k++) {
					const u = k / 6;
					pts.push({ q: jointP(p, hx + lat, hy + fwd, hh + chinH + u * (browH - chinH)), vis: maskVis(lat, fwd) });
				}
				strokeMask(pts);
			}
			if (grill) {
				const pts = [];
				for (let k = 0; k <= 7; k++) {
					const u = k / 7;
					const h = browH + u * (chinH - browH);
					const fwd = maskFwd + 0.145 - Math.abs(u - 0.45) * 0.04;
					pts.push({ q: jointP(p, hx, hy + fwd, hh + h), vis: maskVis(0, fwd) });
				}
				strokeMask(pts);
			}
		}
	}
	function drawPlayer(p, isBallCarrier) {
		if (!p) return;
		const pr = project(p.x, p.y, 0.15);
		if (pr.behind) return;
		const r = p.radius * yardToPx() * (pr.sc || 1) * 0.74;
		const bulk = visualBulk(p);
		const celebrating = isBallCarrier && celebrateTimer > 0 && p.hasBall;
		const tdSpike = !!(scoreSeq && scoreSeq.player === p && scoreSeq.spike);
		const st = tdSpike ? scoreSeq.t : 0;
		const spikeStyle = tdSpike ? scoreSeq.spikeStyle : "none";
		const spikeDir = tdSpike ? scoreSeq.spikeDir || 1 : 1;
		const spiking = tdSpike && st > 0.08;
		const forceSpike = spikeStyle === "force";
		const postSpike = spikeStyle === "post";
		const dunkSpike = spikeStyle === "dunk";
		const puntSpike = spiking && spikeStyle === "punt";
		const throwSpike = spiking && spikeStyle === "throw";
		const moveId = isBallCarrier ? activeMove : (p.atkKind || null);
		const moveU = isBallCarrier && moveDur > 0 ? 1 - moveTimer / Math.max(0.01, moveDur) : (p.atkT > 0 ? 1 - Math.min(1, p.atkT) : 0);
		const diving = moveId === "dive" || (p.atkKind === "dive" && p.atkT > 0) || (p.recoverKind === "dive" && p.recoverT > 0);
		const diveLeap = diving && !p.takenDown && (p.hop || 0) > 0.4;
		const trucking = moveId === "truck" || moveId === "truckL" || moveId === "truckR";
		const stiffL = moveId === "stiffL";
		const stiffR = moveId === "stiffR";
		const jukeL = moveId === "jukeL" || moveId === "shakeL";
		const jukeR = moveId === "jukeR" || moveId === "shakeR";
		const deadL = moveId === "deadleg" || moveId === "deadlegL";
		const deadR = moveId === "deadlegR";
		const hurdling = !!(moveId && String(moveId).startsWith("hurdle"));
		const hitting = (p.atkKind === "hit" && p.atkT > 0) || (tackleAnim && tackleAnim.defender === p && tackleAnim.kind === "hit");
		const wrapping = (p.atkKind === "wrap" && (p.atkT > 0 || p.takenDown || (rb && dist(p, rb) < 2.35) || (defWrapPhase === "wrapped" && p === userDefender))) || (tackleAnim && tackleAnim.defender === p && (tackleAnim.kind || p._tackleKind || p.atkKind) !== "dive" && (tackleAnim.kind || p._tackleKind || p.atkKind) !== "hit");
		const shedding = defMoveId === "shed" && p === userDefender && defMoveT > 0;
		const strafing = !!p._strafe;
		const ground = playerGroundSpeed(p);
		const spd = ground;
		const huddle = !!(practiceAwaitSnap || (!playActive && !scoreSeq && !fullReplay) || preSnapTimer > 0);
		const engaging = !scoreSeq && !!(playActive && !practiceAwaitSnap && preSnapTimer <= 0 && (p.blockTarget || p.driveBlock || p.engageT > 0));
		const tdCarry = !!(scoreSeq && scoreSeq.player === p && !scoreSeq.diveLand);
		const liveMove = !scoreSeq && playActive && !practiceAwaitSnap && preSnapTimer <= 0;
		const moving = (ground > 0.32 || engaging) && (fullReplay || tdCarry || liveMove) && !(scoreSeq && scoreSeq.player !== p);
		const gt = gaitTime();
		let legL = 0, legR = 0, armL = 0, armR = 0;
		let leanX = 0, leanF = 0, crouch = 0, hop = p.hop || 0;
		if (huddle && !moving && !diving && !p.pancaked && !p.takenDown && !p.recoverKind && p.state !== "whiff" && !(p.recoverT > 0) && !(p.whiffT > 0)) {
			armL = 0.12;
			armR = 0.1;
		} else if (moving && ground > 0.32 && !diving && !p.pancaked && !hurdling && !wrapping && !p.takenDown) {
			const cad = gaitCadence(ground);
			const phase = gt * cad + (p.number || 0) * 0.31;
			const amp = ground < 1.4 ? 0.55 + ground * 0.28 : 1;
			legL = Math.sin(phase) * amp;
			legR = Math.sin(phase + Math.PI) * amp;
			armL = -legL * 0.95;
			armR = -legR * 0.95;
			leanF = 0.08 + Math.min(0.14, spd * 0.02);
		} else {
			armL = 0.16;
			armR = 0.16;
		}
		if (jukeL) {
			leanX = -0.42;
			legL = 0.55;
			legR = -0.85;
			armL = 0.7;
			armR = -0.55;
			hop += 0.06;
		} else if (jukeR) {
			leanX = 0.42;
			legR = 0.55;
			legL = -0.85;
			armR = 0.7;
			armL = -0.55;
			hop += 0.06;
		} else if (deadL) {
			legL = -0.15;
			legR = 0.7;
			leanX = -0.18;
			armL = 0.25;
			armR = -0.4;
		} else if (deadR) {
			legR = -0.15;
			legL = 0.7;
			leanX = 0.18;
			armR = 0.25;
			armL = -0.4;
		} else if (stiffL) {
			armL = 1.15;
			armR = -0.2;
			leanX = -0.12;
			leanF = 0.16;
			legL = 0.35;
			legR = -0.2;
		} else if (stiffR) {
			armR = 1.15;
			armL = -0.2;
			leanX = 0.12;
			leanF = 0.16;
			legR = 0.35;
			legL = -0.2;
		} else if (trucking) {
			crouch = 0.28;
			leanF = 0.32;
			armL = moveId === "truckL" ? 0.95 : 0.25;
			armR = moveId === "truckR" ? 0.95 : 0.55;
			legL = 0.45;
			legR = -0.35;
		} else if (hurdling) {
			hop += 0.55 * Math.sin(Math.min(1, moveU) * Math.PI);
			legL = 0.85;
			legR = 0.7;
			armL = 0.55;
			armR = -0.35;
			crouch = 0.1;
		} else if (diving) {
			const leapH = p.hop || 0;
			crouch = diveLeap ? 0.02 : 0.05;
			leanF = diveLeap ? 0.52 : 0.85;
			hop = diveLeap ? leapH : Math.max(leapH, 0.18);
			if (diveLeap) {
				legL = -0.22;
				legR = -0.58;
				armL = 0.88;
				armR = 0.72;
			} else {
				legL = -0.55;
				legR = -0.4;
				armL = 0.95;
				armR = 0.9;
			}
		} else if (hitting) {
			leanF = 0.45;
			crouch = 0.2;
			armL = 0.75;
			armR = 0.8;
			legL = 0.5;
			legR = -0.15;
		} else if (wrapping) {
			leanF = 0.48;
			armL = 0.92;
			armR = 0.92;
			crouch = 0.32;
			legL = 0.35;
			legR = -0.15;
		} else if (shedding) {
			armR = 0.95;
			armL = -0.15;
			leanF = 0.2;
			leanX = 0.12;
		} else if (strafing) {
			crouch = 0.16;
			leanF = 0;
			armL = 0.45;
			armR = 0.45;
			const sh = Math.sin(gt * 7.5);
			legL = sh * 0.22;
			legR = -sh * 0.22;
		}
		const spinning = isBallCarrier && activeMove === "spin";
		if (spinning) {
			const t = Math.min(1, Math.max(0, moveU));
			const side = p.spinSide || 1;
			crouch = t < 0.18 ? 0.22 : 0.1;
			hop += 0.04 + 0.08 * Math.sin(Math.min(1, t) * Math.PI);
			leanX = t < 0.18 ? -side * 0.28 : side * (0.12 + 0.22 * t);
			leanF = t < 0.18 ? 0.04 : 0.14;
			if (side >= 0) {
				legR = t < 0.18 ? 0.55 : -0.12;
				legL = t < 0.18 ? -0.35 : Math.sin(t * Math.PI * 2) * 0.7;
				armL = Math.cos(t * Math.PI * 2) * 0.9;
				armR = -Math.cos(t * Math.PI * 2) * 0.45;
			} else {
				legL = t < 0.18 ? 0.55 : -0.12;
				legR = t < 0.18 ? -0.35 : Math.sin(t * Math.PI * 2) * 0.7;
				armR = Math.cos(t * Math.PI * 2) * 0.9;
				armL = -Math.cos(t * Math.PI * 2) * 0.45;
			}
		}
		if (spiking) hop += 0.1;
		const tdSelf = !!(scoreSeq && scoreSeq.player === p);
		const tdArmsUp = !!(tdSelf && !scoreSeq.diveLand && !p.takenDown && !diving && (
			((spikeStyle === "punt" || spikeStyle === "throw") && scoreSeq.ballOut) ||
			(scoreSeq.ballOut && spikeStyle !== "force") ||
			celebrating
		));
		if (tdSelf && scoreSeq.diveLand) {
			legL = -0.35;
			legR = -0.22;
			armL = 0.55;
			armR = 0.48;
			leanF = 0.82;
			crouch = 0.08;
			hop = Math.min(hop, 0.06);
		} else if (tdSelf && !diving && !p.takenDown) {
			if (spd <= 0.45) {
				legL = 0.06;
				legR = -0.05;
			}
			if (tdArmsUp) {
				armL = 0.95;
				armR = 0.95;
			} else if (scoreSeq.ballOut && spikeStyle === "force") {
				armL = 0.14;
				armR = 0.12;
			}
		}
		let jumpCheerOn = false;
		let jumpCheerAmt = 0;
		let fistL = false, fistR = false, fistAmt = 0;
		let scufflePush = false, scuffleShoved = false;
		if (p.hitCheerT > 0 && p.hitCheerDur > 0 && !p.takenDown && !p.pancaked) {
			const u = 1 - p.hitCheerT / Math.max(0.01, p.hitCheerDur);
			if (p.hitCheerKind === "jump3") {
				jumpCheerOn = true;
				jumpCheerAmt = Math.abs(Math.sin(u * Math.PI * 3));
				hop = Math.max(hop, jumpCheerAmt * 0.36);
				armL = 0.72 + jumpCheerAmt * 0.28;
				armR = 0.72 + jumpCheerAmt * 0.28;
			} else if (p.hitCheerKind === "fist2") {
				fistL = true;
				fistR = true;
				fistAmt = Math.sin(Math.min(1, u / 0.7) * Math.PI);
			} else {
				if ((p.number || 0) % 2 === 0) fistR = true;
				else fistL = true;
				fistAmt = Math.sin(Math.min(1, u / 0.7) * Math.PI);
			}
		}
		if (p.scuffleT > 0 && p.scuffleDur > 0 && !p.takenDown && !p.pancaked) {
			const u = 1 - p.scuffleT / Math.max(0.01, p.scuffleDur);
			const scufflePulse = Math.sin(Math.min(1, Math.max(0, u)) * Math.PI);
			if (p.scuffleRole === "push") {
				scufflePush = true;
				leanF = Math.max(leanF, 0.34 + scufflePulse * 0.14);
				armL = 0.9;
				armR = 0.84;
			} else if (p.scuffleRole === "shoved") {
				scuffleShoved = true;
				leanF = -0.18 * scufflePulse;
				hop = Math.max(hop, scufflePulse * 0.1);
				armL = 0.32;
				armR = 0.38;
			}
		}
		const BS = 0.8;
		const falling = !!p.takenDown;
		const down = falling ? Math.max(0, Math.min(1, p.downAmt != null ? p.downAmt : 1)) : 0;
		const layout = falling ? (p.fallLayout != null ? p.fallLayout : 0.05) : 1;
		const standH = 1.02 - crouch;
		const crumpleH = 0.48;
		const bodyH = falling
			? standH * (1 - down * (1 - layout * 0.88)) + crumpleH * down * (1 - layout)
			: (p.pancaked ? 0.42 : (diving && !diveLeap ? 0.62 : standH));
		const hipH = (bodyH + hop) * BS;
		const shH = hipH + ((diving && !falling && !diveLeap) ? 0.12 : 0.5 * (falling ? (0.35 + 0.65 * layout) : 1)) * BS;
		const headH = shH + ((diving && !falling && !diveLeap) ? 0.1 : 0.3 * (falling ? (0.35 + 0.65 * layout) : 1)) * BS;
		const wide = (p.group === "OL" || p.group === "DT") ? 0.75 : 1;
		const padW = (p.group === "OL" || p.group === "DT" ? 0.5 : p.group === "FB" || p.group === "TE" || p.group === "LB" ? 0.42 : 0.38) * bulk * BS * wide;
		const thighLen = 0.44 * BS;
		const shinLen = 0.42 * BS;
		const upperLen = 0.34 * BS;
		const foreLen = 0.32 * BS;
		function legKin(side, swing) {
			const lat0 = side * 0.16 * BS;
			const hip = { lat: lat0 + leanX * 0.15, fwd: leanF * 0.06, up: hipH };
			const restBend = 0.78;
			const runBend = 0.48 + 0.42 * (1 - Math.abs(swing));
			const bend = (diving && !diveLeap) || falling ? 0.32 : (moving ? runBend : restBend);
			const kneeFwd = (diving && !diveLeap) ? 0.55 + swing * 0.1 : (falling ? 0.42 : (diveLeap ? 0.38 + swing * 0.12 : 0.24 + swing * 0.36));
			const kneeUp = hipH - thighLen * (0.36 + bend * 0.52);
			const footFwd = (diving && !diveLeap) ? 0.95 : (falling ? 0.78 : (diveLeap ? 0.62 : swing * 0.52 - 0.08));
			const shinDrop = shinLen * (0.78 - Math.max(0, swing) * 0.14);
			const footUp = (p.pancaked && !falling) ? 0.07 : (hurdling ? hipH - 0.35 : Math.max(0.04, kneeUp - shinDrop));
			return {
				hip,
				knee: { lat: lat0 * 1.72, fwd: leanF * 0.1 + kneeFwd, up: kneeUp },
				foot: { lat: lat0 * 0.88, fwd: leanF * 0.04 + footFwd, up: footUp }
			};
		}
		function armKin(side, swing) {
			const lat0 = side * padW;
			const sh = { lat: lat0 + leanX * 0.2, fwd: leanF * 0.16, up: shH };
			let elFwd, elUp, hdFwd, hdUp, elLat, hdLat;
			if (stiffL && side < 0) {
				elFwd = 0.42; elUp = shH + 0.02; hdFwd = 0.78; hdUp = shH + 0.04; elLat = lat0 - 0.04; hdLat = lat0 - 0.02;
			} else if (stiffR && side > 0) {
				elFwd = 0.42; elUp = shH + 0.02; hdFwd = 0.78; hdUp = shH + 0.04; elLat = lat0 + 0.04; hdLat = lat0 + 0.02;
			} else if (tdArmsUp || celebrating || dunkSpike || postSpike) {
				elFwd = 0.05; elUp = shH + 0.32; hdFwd = 0.02; hdUp = shH + 0.62; elLat = lat0 * 0.7; hdLat = lat0 * 0.45;
			} else if (jumpCheerOn) {
				elFwd = 0.04; elUp = shH + 0.18 + jumpCheerAmt * 0.16; hdFwd = 0.02; hdUp = shH + 0.44 + jumpCheerAmt * 0.22; elLat = lat0 * 0.62; hdLat = lat0 * 0.38;
			} else if ((fistL && side < 0) || (fistR && side > 0)) {
				elFwd = 0.08; elUp = shH + 0.1 + fistAmt * 0.36; hdFwd = 0.04; hdUp = shH + 0.28 + fistAmt * 0.52; elLat = lat0 * 0.55; hdLat = lat0 * 0.32;
			} else if (scufflePush) {
				elFwd = 0.48; elUp = shH + 0.05; hdFwd = 0.74; hdUp = shH + 0.03; elLat = lat0 * 0.42; hdLat = lat0 * 0.2;
			} else if (scuffleShoved) {
				elFwd = -0.06; elUp = shH - 0.08; hdFwd = -0.1; hdUp = shH - 0.16; elLat = lat0 * 1.05; hdLat = lat0 * 1.12;
			} else if (diving) {
				elFwd = 0.55; elUp = shH + 0.02; hdFwd = 0.95; hdUp = shH - 0.02; elLat = lat0 * 0.55; hdLat = lat0 * 0.4;
			} else if (wrapping) {
				elFwd = 0.52; elUp = shH - 0.1; hdFwd = 0.16; hdUp = shH - 0.18; elLat = lat0 * 0.12; hdLat = -lat0 * 0.72;
			} else if (falling && (p.hasBall || isBallCarrier)) {
				elFwd = 0.2; elUp = shH - 0.06; hdFwd = 0.1; hdUp = shH - 0.1; elLat = lat0 * 0.28; hdLat = lat0 * 0.06;
			} else if (falling) {
				elFwd = 0.48; elUp = shH - 0.02; hdFwd = 0.72; hdUp = shH - 0.04; elLat = lat0 * 0.45; hdLat = lat0 * 0.32;
			} else if (trucking && ((moveId === "truckL" && side < 0) || (moveId === "truckR" && side > 0) || moveId === "truck")) {
				elFwd = 0.38; elUp = shH + 0.18; hdFwd = 0.55; hdUp = shH + 0.22; elLat = lat0 * 0.7; hdLat = lat0 * 0.5;
			} else {
				elFwd = leanF * 0.1 + swing * 0.32;
				elUp = shH - 0.22 + Math.abs(swing) * 0.04;
				hdFwd = leanF * 0.08 + swing * 0.5;
				hdUp = shH - 0.42;
				elLat = lat0 * 0.92;
				hdLat = lat0 * 0.85;
			}
			return {
				sh,
				elb: { lat: elLat, fwd: elFwd, up: elUp },
				hand: { lat: hdLat, fwd: hdFwd, up: hdUp }
			};
		}
		const Lleg = legKin(-1, legL);
		const Rleg = legKin(1, legR);
		const Larm = armKin(-1, armL);
		const Rarm = armKin(1, armR);
		const hips = jointP(p, leanX * 0.1, leanF * 0.06, hipH);
		const chest = jointP(p, leanX * 0.22, leanF * 0.18, shH - 0.06);
		const lPad = jointP(p, -padW, leanF * 0.16, shH);
		const rPad = jointP(p, padW, leanF * 0.16, shH);
		const lHipP = jointP(p, Lleg.hip.lat, Lleg.hip.fwd, Lleg.hip.up);
		const rHipP = jointP(p, Rleg.hip.lat, Rleg.hip.fwd, Rleg.hip.up);
		const lKneeP = jointP(p, Lleg.knee.lat, Lleg.knee.fwd, Lleg.knee.up);
		const rKneeP = jointP(p, Rleg.knee.lat, Rleg.knee.fwd, Rleg.knee.up);
		const lFootP = jointP(p, Lleg.foot.lat, Lleg.foot.fwd, Lleg.foot.up);
		const rFootP = jointP(p, Rleg.foot.lat, Rleg.foot.fwd, Rleg.foot.up);
		const lShP = jointP(p, Larm.sh.lat, Larm.sh.fwd, Larm.sh.up);
		const rShP = jointP(p, Rarm.sh.lat, Rarm.sh.fwd, Rarm.sh.up);
		const lElP = jointP(p, Larm.elb.lat, Larm.elb.fwd, Larm.elb.up);
		const rElP = jointP(p, Rarm.elb.lat, Rarm.elb.fwd, Rarm.elb.up);
		const lHdP = jointP(p, Larm.hand.lat, Larm.hand.fwd, Larm.hand.up);
		const rHdP = jointP(p, Rarm.hand.lat, Rarm.hand.fwd, Rarm.hand.up);
		const cw = getCamWorld();
		let rightNear = true;
		if (cw) {
			const b = playerBasis(p);
			rightNear = ((cw.camX - p.x) * b.rtx + (cw.camY - p.y) * b.rty) > 0;
		} else {
			rightNear = (pr.sx || 0) > canvas.width * 0.5;
		}
		const thighW = Math.max(3.0, r * 0.5 * bulk * wide);
		const shinW = Math.max(1.9, r * 0.26 * bulk * wide);
		const armW = Math.max(2.6, r * 0.36 * bulk * wide);
		const foreW = Math.max(2.2, r * 0.28 * bulk * wide);
		const jointC = mixHex(p.helmet || p.pants || "#333", "#1a1a1a", 0.18);
		const sockC = p.socks || p.color;
		const shoeC = p.shoes || "#111111";
		const stripeC = p.stripeCol || p.numColor || "#ffffff";
		ctx.save();
		const grounded = !p.takenDown && ((p.pancaked) || p.recoverKind === "pancake" || (p.recoverKind === "whiff" && p.low) || (p.state === "whiff" && p.low));
		if (grounded) {
			const rec = p.recoverT || p.whiffT || 0;
			const tot = p.pancaked || p.recoverKind === "pancake" ? 0.72 : 0.5;
			const u = 1 - Math.max(0, Math.min(1, rec / tot));
			const getUp = u > 0.42 ? (u - 0.42) / 0.58 : 0;
			const side = p.x >= FIELD_WIDTH / 2 ? 1 : -1;
			ctx.translate(pr.sx, pr.sy);
			ctx.rotate(0.72 * (1 - getUp * 0.9) * side);
			ctx.scale(1.06 - 0.06 * getUp, 0.78 + 0.22 * getUp);
			ctx.translate(-pr.sx, -pr.sy);
		}
		function midPt(a, b, t) {
			if (!a || !b) return a || b;
			return { sx: a.sx + (b.sx - a.sx) * t, sy: a.sy + (b.sy - a.sy) * t, behind: a.behind || b.behind };
		}
		function drawLeg(hip, knee, foot, latSign) {
			fillArmorCapsule(hip, knee, thighW, thighW * 0.72, p.pants, true, "none");
			if (knee && !knee.behind) {
				clothEllipse(knee.sx, knee.sy, Math.max(3.2, r * 0.24 * bulk), Math.max(2.6, r * 0.2 * bulk), 0, p.pants);
				clothEllipse(knee.sx, knee.sy, Math.max(1.8, r * 0.14 * bulk), Math.max(1.5, r * 0.11 * bulk), 0, mixHex(p.pants, "#ffffff", 0.1));
			}
			const sockTop = midPt(knee, foot, 0.38);
			const ankle = midPt(knee, foot, 0.8);
			fillArmorCapsule(knee, sockTop, shinW, shinW * 0.7, p.pants, true, "none");
			const pantStripe = p.pantStripeCol || stripeC;
			const outS = jointP(p, (latSign || 1) * 0.4, leanF * 0.06, hipH);
			const inS = jointP(p, 0, leanF * 0.06, hipH);
			let outer = null;
			if (outS && inS && !outS.behind && !inS.behind) {
				const ox = outS.sx - inS.sx, oy = outS.sy - inS.sy;
				const ol = Math.hypot(ox, oy) || 1;
				outer = { sx: ox / ol, sy: oy / ol };
			}
			pantSideStripes(hip, knee, p.pantStripes || 1, thighW, pantStripe, outer);
			pantSideStripes(knee, sockTop, p.pantStripes || 1, shinW, pantStripe, outer);
			fillArmorCapsule(sockTop, ankle, shinW * 0.66, shinW * 0.52, sockC, true, "start");
			if (foot && !foot.behind) {
				volumeEllipse(foot.sx, foot.sy, Math.max(3.6, r * 0.4), Math.max(1.9, r * 0.18), 0, shoeC);
				clothEllipse(foot.sx, foot.sy + r * 0.015, Math.max(2.2, r * 0.22), Math.max(1.15, r * 0.1), 0, mixHex(shoeC, "#ffffff", 0.1));
			}
		}
		function drawArm(sh, elb, hand) {
			const gcol = p.glove || mixHex(p.color, "#111", 0.3);
			fillArmorCapsule(sh, elb, armW, armW * 0.82, p.color, true, "both");
			sleeveRings(sh, elb, p.sleeveStripes || 3, armW, stripeC);
			if (elb && !elb.behind) clothEllipse(elb.sx, elb.sy, armW * 0.82, armW * 0.68, 0, p.color);
			fillArmorCapsule(elb, hand, Math.max(foreW, armW * 0.72), foreW * 0.8, mixHex(p.color, p.helmet || p.color, 0.12), true, "start");
			if (hand && !hand.behind) {
				clothEllipse(hand.sx, hand.sy, Math.max(2.6, r * 0.24), Math.max(2.0, r * 0.18), 0, gcol);
			}
		}
		const farLeg = rightNear ? [lHipP, lKneeP, lFootP] : [rHipP, rKneeP, rFootP];
		const nearLeg = rightNear ? [rHipP, rKneeP, rFootP] : [lHipP, lKneeP, lFootP];
		const farArm = rightNear ? [lShP, lElP, lHdP] : [rShP, rElP, rHdP];
		const nearArm = rightNear ? [rShP, rElP, rHdP] : [lShP, lElP, lHdP];
		function drawCarryBall() {
			if (!(p.hasBall || isBallCarrier)) return false;
			if (forceSpike || dunkSpike || postSpike || puntSpike || throwSpike || celebrating) return false;
			if (activeMove === "dive" && dive && dive.pylon && isBallCarrier) return false;
			if (p.hasBall) drawFootballAt(p, 0.16, 0.05, hipH + 0.16, -0.35);
			return true;
		}
		let ballNear = rightNear;
		if (cw && (p.hasBall || isBallCarrier)) {
			const ballQ = jointP(p, 0.16, 0.05, hipH + 0.16);
			if (ballQ && chest && ballQ.cz != null && chest.cz != null) ballNear = ballQ.cz < chest.cz;
		}
		drawLeg(farLeg[0], farLeg[1], farLeg[2], rightNear ? -1 : 1);
		drawArm(farArm[0], farArm[1], farArm[2]);
		if (!ballNear) drawCarryBall();
		if (!hips.behind) clothEllipse(hips.sx, hips.sy, r * 0.4 * bulk * wide, r * 0.11 * bulk, 0, mixHex(p.pants, p.color, 0.35));
		if (!hips.behind && !chest.behind) fillArmorCapsule(hips, chest, r * 0.36 * bulk * wide, r * 0.5 * bulk, p.color, true, "end");
		if (!chest.behind) {
			clothEllipse(chest.sx, chest.sy, r * 0.66 * bulk * wide, r * 0.34 * bulk, 0, p.color);
			clothEllipse(chest.sx, chest.sy - r * 0.05, r * 0.52 * bulk * wide, r * 0.16 * bulk, 0, mixHex(p.color, "#ffffff", 0.06));
		}
		if (!lPad.behind) clothEllipse(lPad.sx, lPad.sy, r * 0.4 * bulk * wide, r * 0.26 * bulk, 0, p.color);
		if (!rPad.behind) clothEllipse(rPad.sx, rPad.sy, r * 0.4 * bulk * wide, r * 0.26 * bulk, 0, p.color);
		if (lPad && rPad && !lPad.behind && !rPad.behind) fillArmorCapsule(lPad, rPad, r * 0.18 * bulk, r * 0.18 * bulk, p.color, true);
		{
			const bnum = playerBasis(p);
			let faceDot = 1;
			if (cw) faceDot = (cw.camX - p.x) * bnum.fwx + (cw.camY - p.y) * bnum.fwy;
			const numAt = faceDot >= 0
				? jointP(p, leanX * 0.22, leanF * 0.12 + 0.02, shH - 0.14)
				: jointP(p, leanX * 0.22, leanF * 0.12 - 0.12, shH - 0.12);
			const hideNum = falling || !!p.pancaked || grounded || (diving && !diveLeap) || (p.low && (p.recoverKind === "dive" || p.recoverKind === "pancake"));
			if (numAt && !numAt.behind && Math.abs(faceDot) > 0.18 && !hideNum) {
				ctx.save();
				ctx.translate(numAt.sx, numAt.sy);
				const digits = String(p.number).split("");
				const fs = Math.max(8, r * 0.5 * bulk);
				ctx.font = "600 " + fs + "px Barlow Condensed, IBM Plex Sans, sans-serif";
				ctx.textAlign = "center";
				ctx.textBaseline = "middle";
				ctx.lineJoin = "round";
				ctx.miterLimit = 2;
				ctx.lineWidth = Math.max(0.7, fs * 0.048);
				ctx.strokeStyle = p.numOutline || "#ffffff";
				ctx.fillStyle = p.numColor || "#ffffff";
				const gw = fs * 0.5, gap = fs * 0.16;
				const total = digits.length * gw + (digits.length - 1) * gap;
				let x = -total / 2 + gw / 2;
				for (const ch of digits) {
					ctx.strokeText(ch, x, r * 0.04);
					ctx.fillText(ch, x, r * 0.04);
					x += gw + gap;
				}
				ctx.restore();
			}
		}
		drawLeg(nearLeg[0], nearLeg[1], nearLeg[2], rightNear ? 1 : -1);
		drawArm(nearArm[0], nearArm[1], nearArm[2]);
		if (ballNear) drawCarryBall();
		drawHelmet3(p, leanX * 0.18, leanF * 0.22 + (diving ? 0.35 : 0.04), headH, r, bulk);
		if (p.hasBall || isBallCarrier) {
			if (forceSpike && scoreSeq && !scoreSeq.ballOut) {
				if (st < 0.28) drawFootballAt(p, spikeDir * 0.55, 0.35, shH + 0.15, -0.5);
				else {
					const ang = -Math.PI * 0.15 + spikeDir * ((st - 0.28) / 0.34) * Math.PI * 2.15;
					drawFootballAt(p, Math.cos(ang) * 0.55, 0.2, shH + Math.sin(ang) * 0.4, ang);
				}
			} else if (dunkSpike && scoreSeq && !scoreSeq.ballOut) drawFootballAt(p, 0.02, 0.05, st < 0.48 ? headH + 0.45 : hipH, st < 0.48 ? -1.55 : 0.8);
			else if (postSpike && scoreSeq && !scoreSeq.ballOut) drawFootballAt(p, 0.04, 0.02, headH + 0.35, -1.4);
			else if ((puntSpike || throwSpike) && scoreSeq && !scoreSeq.ballOut) drawFootballAt(p, throwSpike ? 0.55 : 0.12, 0.3, throwSpike ? headH + 0.1 : hipH, throwSpike ? -0.9 : 1.1);
			else if (celebrating) drawFootballAt(p, 0.55, 0.15, headH + 0.15, -0.9);
			else if (activeMove === "dive" && dive && dive.pylon && isBallCarrier) drawFootballAt(p, 0.15, 0.7, 0.45, -0.2);
		}
		ctx.restore();
		if (playingDefense() && p === userDefender) drawControlRing(pr.sx, pr.sy - r * 0.2, r, false, defRoleLabel(p), "def");
		if (forceSpike && scoreSeq && scoreSeq.ballOut && scoreSeq.t < 1.05) {
			ctx.strokeStyle = "rgba(255,255,255,0.55)";
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.arc(pr.sx, pr.sy + r * 1.15, r * (0.4 + scoreSeq.t), 0, Math.PI * 2);
			ctx.stroke();
		}
	}
	function stripeFill(yd) {
		const stripe = Math.floor((yd + 1000) / 5) % 2 === 0;
		if (surface === "grass") return stripe ? "#5d8f4a" : "#4e7d3e";
		if (surface === "astroturf") return stripe ? "#32b056" : "#228a42";
		return stripe ? "#1f5230" : "#143820";
	}
	function turfBase() {
		if (surface === "grass") return "#4a753b";
		if (surface === "astroturf") return "#278a42";
		return "#163d24";
	}
	function fillWorldQuad(x0, y0, x1, y1, color, alpha) {
		fillWorldPoly([
			project(x0, y0),
			project(x1, y0),
			project(x1, y1),
			project(x0, y1)
		], color, null, alpha);
	}
	function strokeWorldLine(x0, y0, x1, y1, color, width) {
		const seg = clipSegNear(project(x0, y0), project(x1, y1));
		if (!seg) return;
		ctx.strokeStyle = color;
		ctx.lineWidth = width;
		ctx.lineCap = "butt";
		ctx.beginPath();
		ctx.moveTo(seg[0].sx, seg[0].sy);
		ctx.lineTo(seg[1].sx, seg[1].sy);
		ctx.stroke();
	}
	function fillTurfRange(y0, y1) {
		const lo = Math.min(y0, y1), hi = Math.max(y0, y1);
		const fl = fieldLeft(), fr = fieldRight();
		const pat = getTurfPattern();
		const start = Math.floor(lo / 5) * 5;
		const xStep = 5;
		for (let yd = start; yd < hi; yd += 5) {
			const ya = Math.max(yd, lo), yb = Math.min(yd + 5, hi);
			if (yb <= ya) continue;
			const col = stripeFill(yd);
			for (let x = fl; x < fr; x += xStep) {
				const xb = Math.min(fr, x + xStep);
				const quad = [project(x, ya), project(xb, ya), project(xb, yb), project(x, yb)];
				fillWorldPoly(quad, col);
				if (!pat) continue;
				const pts = clipPolyNear(quad);
				if (pts.length < 3) continue;
				ctx.save();
				ctx.beginPath();
				ctx.moveTo(pts[0].sx, pts[0].sy);
				for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].sx, pts[i].sy);
				ctx.closePath();
				ctx.clip();
				ctx.globalAlpha = surface === "astroturf" ? 0.28 : surface === "grass" ? 0.2 : 0.32;
				ctx.fillStyle = pat;
				let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
				for (const p of pts) {
					if (p.sx < minX) minX = p.sx;
					if (p.sx > maxX) maxX = p.sx;
					if (p.sy < minY) minY = p.sy;
					if (p.sy > maxY) maxY = p.sy;
				}
				if (isFinite(minX) && maxX > minX && maxY > minY) ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
				ctx.restore();
			}
		}
	}
	function drawDiamondEndzone(yGoal, yBack, uni) {
		const fl = fieldLeft(), fr = fieldRight();
		if (!lookingTowardY((yGoal + yBack) * 0.5, 4)) return;
		const mid = project((fl + fr) / 2, (yGoal + yBack) * 0.5, 0);
		if (!mid || mid.behind || (mid.cz != null && mid.cz < 5)) return;
		const n = 8;
		const w = (fr - fl) / n;
		const midY = (yGoal + yBack) / 2;
		for (let i = 0; i < n; i++) {
			const cx = fl + (i + .5) * w;
			const left = fl + i * w;
			const right = fl + (i + 1) * w;
			const fill = i % 2 === 0 ? (uni.endPrimary || uni.jersey) : (uni.endSecondary || uni.helmet);
			fillWorldPoly([
				project(cx, yGoal),
				project(right, midY),
				project(cx, yBack),
				project(left, midY)
			], fill, "rgba(255,255,255,0.5)", 0.86);
		}
	}
	function fillEzBackground(yGoal, yBack) {
		fillTurfRange(yGoal, yBack);
	}
	function drawMountainEndzoneWorld(yGoal, yBack, primary, secondary) {
		const uni = getUni("off");
		fillEzBackground(yGoal, yBack);
		const fl = fieldLeft(), fr = fieldRight();
		const midY = (yGoal + yBack) * 0.5;
		const inFront = lookingTowardY(midY, 4);
		const mid = project((fl + fr) / 2, midY, 0);
		if (!inFront || !mid || mid.behind || (mid.cz != null && mid.cz < 5)) {
			if (ezArtMode !== "off") drawEzText(yGoal, yBack);
			return;
		}
		if (ezArtMode === "off") {
			drawEzText(yGoal, yBack);
			return;
		}
		if (ezArtMode === "solid") {
			fillWorldQuad(fl, yGoal, fr, yBack, uni.jersey || primary, 0.88);
			drawEzText(yGoal, yBack);
			return;
		}
		if (ezArtMode === "diamonds") {
			drawDiamondEndzone(yGoal, yBack, uni);
			drawEzText(yGoal, yBack);
			return;
		}
		const quad = [project(fl, yGoal), project(fr, yGoal), project(fr, yBack), project(fl, yBack)];
		const poly = clipPolyNear(quad);
		if (!poly || poly.length < 3) {
			drawEzText(yGoal, yBack);
			return;
		}
		const box = screenBoxOf(poly, 80);
		if (!isFinite(box.minX) || box.maxX < -80 || box.minX > canvas.width + 80 || box.maxY < -80 || box.minY > canvas.height + 80) {
			drawEzText(yGoal, yBack);
			return;
		}
		let clipped = false;
		for (let i = 0; i < poly.length; i++) {
			const p = poly[i];
			if (p && p.cz != null && p.cz <= NEAR_Z + 0.08) { clipped = true; break; }
		}
		if (clipped && (box.spanX > canvas.width * 1.2 || box.spanY > canvas.height * 1.2)) {
			drawEzText(yGoal, yBack);
			return;
		}
		ctx.save();
		ctx.beginPath();
		ctx.moveTo(poly[0].sx, poly[0].sy);
		for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].sx, poly[i].sy);
		ctx.closePath();
		ctx.clip();
		ctx.globalAlpha = 0.86;
		ctx.fillStyle = primary;
		ctx.fill();
		const pts = [
			[0, 0],
			[.06, .12],
			[.14, .58],
			[.22, .1],
			[.36, .92],
			[.48, .08],
			[.6, .54],
			[.72, .12],
			[.84, .64],
			[.94, .14],
			[1, 0]
		];
		ctx.globalAlpha = 0.8;
		ctx.fillStyle = secondary;
		ctx.beginPath();
		let started = false;
		for (const [xf, hf] of pts) {
			const p = project(fl + xf * (fr - fl), yGoal + (yBack - yGoal) * hf);
			if (!p || p.behind || (p.cz != null && p.cz < 2.2)) continue;
			if (!started) { ctx.moveTo(p.sx, p.sy); started = true; }
			else ctx.lineTo(p.sx, p.sy);
		}
		const b = project(fr, yGoal);
		const a = project(fl, yGoal);
		if (b && !b.behind) ctx.lineTo(b.sx, b.sy);
		if (a && !a.behind) ctx.lineTo(a.sx, a.sy);
		ctx.closePath();
		if (started) ctx.fill();
		ctx.restore();
		drawEzText(yGoal, yBack);
	}
	const ezTextCanCache = {};
	const yardNumCanCache = {};
	function yardNumCanvas(label, big) {
		const key = String(label) + (big ? "b" : "s");
		if (yardNumCanCache[key]) return yardNumCanCache[key];
		const c = document.createElement("canvas");
		c.width = big ? 320 : 220;
		c.height = big ? 260 : 180;
		const g = c.getContext("2d");
		g.clearRect(0, 0, c.width, c.height);
		g.textAlign = "center";
		g.textBaseline = "middle";
		const fs = big ? 190 : 140;
		g.font = "bold " + fs + "px Barlow Condensed, IBM Plex Sans, sans-serif";
		g.lineJoin = "round";
		g.miterLimit = 2;
		g.lineWidth = fs * 0.1;
		g.strokeStyle = "rgba(12,20,16,0.84)";
		g.strokeText(label, c.width / 2, c.height / 2);
		g.fillStyle = big ? "rgba(236,240,230,0.92)" : "rgba(236,240,230,0.62)";
		g.fillText(label, c.width / 2, c.height / 2);
		yardNumCanCache[key] = c;
		return c;
	}
	function ezTextCanvas(label) {
		if (ezTextCanCache[label]) return ezTextCanCache[label];
		const c = document.createElement("canvas");
		c.width = 1400;
		c.height = 280;
		const g = c.getContext("2d");
		g.clearRect(0, 0, c.width, c.height);
		g.textAlign = "center";
		g.textBaseline = "middle";
		let fs = 168;
		g.font = "bold " + fs + "px Barlow Condensed, sans-serif";
		const maxW = c.width * 0.9;
		while (fs > 28 && g.measureText(label).width > maxW) {
			fs *= 0.9;
			g.font = "bold " + fs + "px Barlow Condensed, sans-serif";
		}
		g.lineJoin = "round";
		g.lineWidth = Math.max(10, fs * 0.11);
		g.strokeStyle = "rgba(10,16,12,0.78)";
		g.strokeText(label, c.width / 2, c.height / 2);
		g.fillStyle = "#ffffff";
		g.fillText(label, c.width / 2, c.height / 2);
		ezTextCanCache[label] = c;
		return c;
	}
	function drawEzText(yGoal, yBack) {
		if (ezTextMode === "off") return;
		let label = ezTextMode === "custom" ? String(ezCustomText || "").trim() : "ELEVATION EDGE";
		if (!label) return;
		label = Array.from(label).slice(0, 48).join("");
		const img = ezTextCanvas(label);
		const fl = fieldLeft(), fr = fieldRight();
		const cx = (fl + fr) / 2;
		const midY = yGoal + (yBack - yGoal) * 0.52;
		const halfW = Math.max(8, fr - fl) * 0.4;
		const halfD = Math.abs(yBack - yGoal) * 0.2;
		const yA = midY - Math.sign(yBack - yGoal) * halfD;
		const yB = midY + Math.sign(yBack - yGoal) * halfD;
		const h = 0;
		const cwEz = getCamWorld();
		if (cwEz) {
			const yMid = (yGoal + yBack) * 0.5;
			if (!lookingTowardY(yMid, 4)) return;
			if (yGoal > 50 && cwEz.camY > 98 && cwEz.fy < cwEz.camY) return;
			if (yGoal < 50 && cwEz.camY < 2 && cwEz.fy > cwEz.camY) return;
		}
		const north = yGoal > 50;
		const corners = north ? [
			{ x: cx - halfW, y: yB, h },
			{ x: cx + halfW, y: yB, h },
			{ x: cx + halfW, y: yA, h },
			{ x: cx - halfW, y: yA, h }
		] : [
			{ x: cx + halfW, y: yB, h },
			{ x: cx - halfW, y: yB, h },
			{ x: cx - halfW, y: yA, h },
			{ x: cx + halfW, y: yA, h }
		];
		ctx.save();
		ctx.globalAlpha = 0.94;
		drawImageWorld3(img, corners, 14, 4);
		ctx.restore();
	}


	function drawMidfieldLogo() {
		if (!midLogoOn) return;
		const img = homeLogoReady();
		if (!img) return;
		const fl = fieldLeft(), fr = fieldRight();
		const cx = (fl + fr) / 2;
		const cy = Field.midfield;
		const midP = project(cx, cy);
		if (midP.behind) return;
		if (midP.sy < -200 || midP.sy > canvas.height + 200) return;
		const iw = img.naturalWidth || img.width || 1;
		const ih = img.naturalHeight || img.height || 1;
		const along = Field.spec.midLogoHalf;
		const rot90 = !!logoFlip;
		let corners;
		if (rot90) {
			const across = along * (iw / Math.max(1, ih));
			corners = [
				{ x: cx - across, y: cy + along, h: 0 },
				{ x: cx + across, y: cy + along, h: 0 },
				{ x: cx + across, y: cy - along, h: 0 },
				{ x: cx - across, y: cy - along, h: 0 }
			];
		} else {
			const across = along * (ih / Math.max(1, iw));
			corners = [
				{ x: cx - across, y: cy - along, h: 0 },
				{ x: cx - across, y: cy + along, h: 0 },
				{ x: cx + across, y: cy + along, h: 0 },
				{ x: cx + across, y: cy - along, h: 0 }
			];
		}
		ctx.save();
		ctx.globalAlpha = 0.96;
		drawImageWorld3(img, corners, 12, 8);
		ctx.restore();
		ctx.globalAlpha = 1;
	}
	function stepsToWorldPts(steps, ax, ay, sx, sy) {
		sx = sx == null ? 8.4 : sx;
		sy = sy == null ? 6.6 : sy;
		let px = ax, py = ay;
		const pts = [[px, py]];
		(steps || []).forEach((st) => {
			px += (st.dx || 0) * sx;
			py += (st.dy || 0) * sy;
			pts.push([px, py]);
		});
		return pts;
	}
	function playArrowWorld(play, ax, ay) {
		if (play && play.steps && play.steps.length) {
			const pts = stepsToWorldPts(play.steps, ax, ay);
			return { type: pts.length >= 3 ? "poly" : "poly", pts };
		}
		if (play && play.arrow && play.arrow.length) {
			let px = ax, py = ay;
			const pts = [[px, py]];
			play.arrow.forEach((dx) => {
				px += dx * 6;
				py += 5;
				pts.push([px, py]);
			});
			return { type: "poly", pts };
		}
		return { type: "poly", pts: [[ax, ay], [ax, ay + 7]] };
	}
	function drawWorldPoly(pts, color, width, alpha, arrow, dashed) {
		if (!pts || pts.length < 2) return;
		const scr = pts.map((p) => project(p[0], p[1]));
		ctx.save();
		ctx.globalAlpha = alpha;
		ctx.strokeStyle = color;
		ctx.fillStyle = color;
		ctx.lineWidth = width;
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		if (dashed) ctx.setLineDash([7, 5]);
		ctx.beginPath();
		ctx.moveTo(scr[0].sx, scr[0].sy);
		for (let i = 1; i < scr.length; i++) ctx.lineTo(scr[i].sx, scr[i].sy);
		ctx.stroke();
		if (dashed) ctx.setLineDash([]);
		if (arrow) {
			const last = scr[scr.length - 1];
			const prev = scr[scr.length - 2];
			const ang = Math.atan2(last.sy - prev.sy, last.sx - prev.sx);
			ctx.beginPath();
			ctx.moveTo(last.sx, last.sy);
			ctx.lineTo(last.sx - Math.cos(ang - .4) * 10, last.sy - Math.sin(ang - .4) * 10);
			ctx.lineTo(last.sx - Math.cos(ang + .4) * 10, last.sy - Math.sin(ang + .4) * 10);
			ctx.closePath();
			ctx.fill();
		}
		ctx.restore();
	}
	function drawWorldCurve(pts, color, width, a0, a1) {
		if (!pts || pts.length < 3) return;
		if (a1 == null) a1 = a0;
		if (a0 <= .02 && a1 <= .02) return;
		const ax = pts[0][0], ay = pts[0][1];
		const cx = pts[1][0], cy = pts[1][1];
		const bx = pts[2][0], by = pts[2][1];
		function q(t) {
			const u = 1 - t;
			return [u * u * ax + 2 * u * t * cx + t * t * bx, u * u * ay + 2 * u * t * cy + t * t * by];
		}
		ctx.save();
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		const n = 10;
		for (let i = 0; i < n; i++) {
			const t0 = i / n, t1 = (i + 1) / n;
			const p0 = q(t0), p1 = q(t1);
			const al = a0 + (a1 - a0) * t0;
			if (al < .03) continue;
			const s0 = project(p0[0], p0[1]), s1 = project(p1[0], p1[1]);
			ctx.strokeStyle = colorAlpha(color, al);
			ctx.lineWidth = width;
			ctx.beginPath();
			ctx.moveTo(s0.sx, s0.sy);
			ctx.lineTo(s1.sx, s1.sy);
			ctx.stroke();
		}
		if (a1 > .05) {
			const c = project(cx, cy);
			const b = project(bx, by);
			const ang = Math.atan2(b.sy - c.sy, b.sx - c.sx);
			ctx.fillStyle = colorAlpha(color, a1);
			ctx.beginPath();
			ctx.moveTo(b.sx, b.sy);
			ctx.lineTo(b.sx - Math.cos(ang - .4) * 10, b.sy - Math.sin(ang - .4) * 10);
			ctx.lineTo(b.sx - Math.cos(ang + .4) * 10, b.sy - Math.sin(ang + .4) * 10);
			ctx.closePath();
			ctx.fill();
		}
		ctx.restore();
	}

	function speedTrailColor(spd) {
		// Smooth blue→cyan→green→yellow→orange→red (more stops + wider speed range)
		const t = Math.max(0, Math.min(1, (spd - 1.5) / 14));
		const stops = [
			[35, 70, 210],
			[30, 140, 220],
			[40, 190, 140],
			[80, 210, 60],
			[200, 220, 45],
			[240, 170, 35],
			[235, 100, 30],
			[210, 35, 35]
		];
		const x = t * (stops.length - 1);
		const i = Math.floor(x);
		const f = x - i;
		const a = stops[i], b = stops[Math.min(i + 1, stops.length - 1)];
		// smoothstep for less banding
		const s = f * f * (3 - 2 * f);
		return "rgb(" + Math.round(a[0] + (b[0] - a[0]) * s) + "," + Math.round(a[1] + (b[1] - a[1]) * s) + "," + Math.round(a[2] + (b[2] - a[2]) * s) + ")";
	}
	function strokeTrailWorld(pts) {
		if (!pts || pts.length < 2) return;
		ctx.save();
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		ctx.strokeStyle = "rgba(120, 12, 18, 0.88)";
		ctx.lineWidth = 2.6;
		ctx.beginPath();
		const p0 = project(pts[0].x, pts[0].y);
		ctx.moveTo(p0.sx, p0.sy);
		for (let i = 1; i < pts.length; i++) {
			const p = project(pts[i].x, pts[i].y);
			ctx.lineTo(p.sx, p.sy);
		}
		ctx.stroke();
		ctx.restore();
	}

	function drawHandoffBall() {
		if (!handoffBall || handoffDone) return;
		const q = project(handoffBall.x, handoffBall.y);
		if (q.behind) return;
		const bc = ballColorsFor(rb);
		drawFootball(q.sx, q.sy, 12, -0.4, bc.fill, bc.lace);
	}
	function drawRunnerTrail() {
		if (!showRunnerTrail || !runnerTrail || runnerTrail.length < 2) return;
		strokeTrailWorld(runnerTrail);
	}
	function drawRouteArrow() {
		if (!currentPlay) return;
		if (playArtMode === "off" || playArtMode === "defense") return;
		const a0 = artAlpha(0), a1 = artAlpha(1);
		if (a0 <= .02 && a1 <= .02) return;
		const ax = playArtAnchor.x;
		const ay = playArtAnchor.y;
		if (currentPlay.altSteps && currentPlay.altSteps.length) {
			const alt = { type: "poly", pts: stepsToWorldPts(currentPlay.altSteps, ax, ay) };
			drawWorldPoly(alt.pts, "#FBBF24", 2.4, Math.max(a0, a1) * .7, true, true);
		}
		const art = playArrowWorld(currentPlay, ax, ay);
		if (art.type === "curve") drawWorldCurve(art.pts, "#FBBF24", 3.2, a0, a1);
		else drawWorldPoly(art.pts, "#FBBF24", 3.2, Math.max(a0, a1) * .9, true, false);
	}
	function drawPlayingSurface(sx0, fTop, sx1, fBot) {
		fillTurfRange(0, 100);
	}
	function fillWorldPattern(pat, sx0, fTop, w, h) {
		const originY = toScreenY(0);
		ctx.save();
		ctx.translate(sx0, originY);
		ctx.fillStyle = pat;
		ctx.fillRect(0, fTop - originY, w, h);
		ctx.restore();
	}
	let turfPattern = null;
	let turfPatternKey = "";
	let turfTile = null;
	function getTurfPattern() {
		const key = surface;
		if (turfPattern && turfPatternKey === key) return turfPattern;
		turfPatternKey = key;
		const tile = document.createElement("canvas");
		tile.width = 64;
		tile.height = 64;
		const t = tile.getContext("2d");
		if (!t) return null;
		if (surface === "grass") {
			t.fillStyle = "#466f38";
			t.fillRect(0, 0, 64, 64);
			for (let i = 0; i < 220; i++) {
				const x = hash2(i, 3) * 64;
				const y = hash2(i, 9) * 64;
				t.fillStyle = hash2(i, 17) > .55 ? "#6a9a56" : "#35582c";
				t.globalAlpha = 0.45 + hash2(i, 21) * 0.5;
				t.fillRect(x, y, 1.2 + hash2(i, 5), 2.4 + hash2(i, 7) * 2.2);
			}
			t.globalAlpha = 1;
		} else if (surface === "astroturf") {
			// Old carpet turf: bright green + tight weave, almost no crumb rubber
			t.fillStyle = "#2b9348";
			t.fillRect(0, 0, 64, 64);
			t.strokeStyle = "rgba(18, 70, 32, 0.55)";
			t.lineWidth = 1;
			for (let x = 0; x <= 64; x += 3) {
				t.beginPath(); t.moveTo(x + 0.5, 0); t.lineTo(x + 0.5, 64); t.stroke();
			}
			t.strokeStyle = "rgba(12, 55, 26, 0.4)";
			for (let y = 0; y <= 64; y += 3) {
				t.beginPath(); t.moveTo(0, y + 0.5); t.lineTo(64, y + 0.5); t.stroke();
			}
			t.fillStyle = "rgba(180, 230, 160, 0.18)";
			t.fillRect(0, 0, 64, 64);
		} else {
			// Field turf: dark modern turf + crumb-rubber speckle
			t.fillStyle = "#163d24";
			t.fillRect(0, 0, 64, 64);
			t.fillStyle = "#0a0a0a";
			for (let i = 0; i < 160; i++) {
				const x = hash2(i + 40, 5) * 64;
				const y = hash2(i + 40, 11) * 64;
				const r = .5 + hash2(i, 19) * 1.2;
				t.globalAlpha = .5 + hash2(i, 23) * .45;
				t.beginPath();
				t.arc(x, y, r, 0, Math.PI * 2);
				t.fill();
			}
			t.globalAlpha = 1;
		}
		turfPattern = ctx.createPattern(tile, "repeat");
		return turfPattern;
	}
	function colorAlpha(color, a) {
		const al = clamp(a, 0, 1);
		if (!color) return "rgba(255,255,255," + al + ")";
		if (color.startsWith("rgba")) return color.replace(/rgba\(([^)]+)\)/, (_, inner) => {
			const parts = inner.split(",").map((s) => s.trim());
			return "rgba(" + parts[0] + "," + parts[1] + "," + parts[2] + "," + al + ")";
		});
		if (color[0] === "#" && (color.length === 7 || color.length === 4)) {
			let r, g, b;
			if (color.length === 7) {
				r = parseInt(color.slice(1, 3), 16);
				g = parseInt(color.slice(3, 5), 16);
				b = parseInt(color.slice(5, 7), 16);
			} else {
				r = parseInt(color[1] + color[1], 16);
				g = parseInt(color[2] + color[2], 16);
				b = parseInt(color[3] + color[3], 16);
			}
			return "rgba(" + r + "," + g + "," + b + "," + al + ")";
		}
		return color;
	}
	function artAlpha(along) {
		if (peekHeld || peekToggle) return .92;
		if (preSnapTimer > 0) return Math.min(1, preSnapTimer / .25) * .95;
		const practice = gameMode === "practice";
		const hold = (practice ? 0.42 : 0.32) + clamp(along, 0, 1) * 0.06;
		const fadeDur = practice ? 0.28 : 0.16;
		const t = playAge - hold;
		if (t <= 0) return .82;
		return Math.max(0, .82 * (1 - t / fadeDur));
	}
	function artAlphaOff(along) {
		if (peekHeld || peekToggle) return .92;
		if (preSnapTimer > 0) return Math.min(1, preSnapTimer / .25) * .95;
		const practice = gameMode === "practice";
		const hold = (practice ? 0.68 : 0.58) + clamp(along, 0, 1) * 0.06;
		const fadeDur = practice ? 0.28 : 0.16;
		const t = playAge - hold;
		if (t <= 0) return .82;
		return Math.max(0, .82 * (1 - t / fadeDur));
	}
	function zoneAlpha() {
		if (peekHeld || peekToggle) return .9;
		if (preSnapTimer > 0) return Math.min(1, preSnapTimer / .25) * .95;
		const practice = gameMode === "practice";
		const hold = practice ? 0.70 : 0.48;
		const fadeDur = 0.52;
		const t = playAge - hold;
		if (t <= 0) return .62;
		return Math.max(0, .62 * (1 - t / fadeDur));
	}
	function drawAssignmentArrow(x0, y0, x1, y1, color, a0, a1, noHead) {
		if (a0 == null) a0 = .9;
		if (a1 == null) a1 = a0;
		if (a0 <= .02 && a1 <= .02) return;
		const n = 7;
		ctx.save();
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		for (let i = 0; i < n; i++) {
			const t0 = i / n, t1 = (i + 1) / n;
			const xa = x0 + (x1 - x0) * t0, ya = y0 + (y1 - y0) * t0;
			const xb = x0 + (x1 - x0) * t1, yb = y0 + (y1 - y0) * t1;
			const al = a0 + (a1 - a0) * t0;
			if (al < .03) continue;
			const pa = project(xa, ya), pb = project(xb, yb);
			ctx.globalAlpha = 1;
			ctx.strokeStyle = colorAlpha(color, al);
			ctx.lineWidth = 2.2;
			ctx.beginPath();
			ctx.moveTo(pa.sx, pa.sy);
			ctx.lineTo(pb.sx, pb.sy);
			ctx.stroke();
		}
		// Arrowheads only for attack paths (blitz/man). Zone links are plain lines to zone center.
		if (!noHead && a1 > .05) {
			const a = project(x0, y0);
			const b = project(x1, y1);
			const ang = Math.atan2(b.sy - a.sy, b.sx - a.sx);
			ctx.fillStyle = colorAlpha(color, a1);
			ctx.beginPath();
			ctx.moveTo(b.sx, b.sy);
			ctx.lineTo(b.sx - Math.cos(ang - .4) * 8, b.sy - Math.sin(ang - .4) * 8);
			ctx.lineTo(b.sx - Math.cos(ang + .4) * 8, b.sy - Math.sin(ang + .4) * 8);
			ctx.closePath();
			ctx.fill();
		}
		ctx.restore();
	}
	function drawBlockT(x0, y0, segs, a0, a1) {
		if (!segs || !segs.length) return;
		if (a0 == null) a0 = .9;
		if (a1 == null) a1 = a0;
		if (a0 <= .02 && a1 <= .02) return;
		const pts = [[x0, y0], ...segs];
		ctx.save();
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		for (let i = 0; i < pts.length - 1; i++) {
			const t0 = i / Math.max(1, pts.length - 1);
			const al = a0 + (a1 - a0) * t0;
			if (al < .03) continue;
			const p0 = project(pts[i][0], pts[i][1]);
			const p1 = project(pts[i + 1][0], pts[i + 1][1]);
			ctx.strokeStyle = colorAlpha("rgba(210,214,208,0.9)", al);
			ctx.lineWidth = 2.1;
			ctx.beginPath();
			ctx.moveTo(p0.sx, p0.sy);
			ctx.lineTo(p1.sx, p1.sy);
			ctx.stroke();
		}
		const last = segs[segs.length - 1];
		const prev = segs.length > 1 ? segs[segs.length - 2] : [x0, y0];
		if (a1 > .05) {
			const ang = Math.atan2(last[1] - prev[1], last[0] - prev[0]);
			const cap = .85;
			const c1 = project(last[0] + Math.cos(ang + Math.PI / 2) * cap, last[1] + Math.sin(ang + Math.PI / 2) * cap);
			const c2 = project(last[0] + Math.cos(ang - Math.PI / 2) * cap, last[1] + Math.sin(ang - Math.PI / 2) * cap);
			ctx.strokeStyle = colorAlpha("rgba(210,214,208,0.9)", a1);
			ctx.lineWidth = 2.1;
			ctx.beginPath();
			ctx.moveTo(c1.sx, c1.sy);
			ctx.lineTo(c2.sx, c2.sy);
			ctx.stroke();
		}
		ctx.restore();
	}
	function drawZoneCloud(x, y, rx, ry, color, alpha) {
		if (alpha <= .02) return;
		const c = project(x, y);
		const r = project(x + rx, y);
		const t = project(x, y + ry);
		const px = Math.max(9, Math.abs(r.sx - c.sx));
		const py = Math.max(8, Math.abs(t.sy - c.sy));
		ctx.save();
		ctx.globalAlpha = 1;
		ctx.fillStyle = colorAlpha(color, alpha);
		ctx.strokeStyle = colorAlpha(color, Math.min(1, alpha * 2.4));
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.ellipse(c.sx, c.sy, px, py, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();
		ctx.restore();
	}
	
	function getDefAudibleMap() {
		const schemes = DEF_SCHEMES.slice();
		return AUDIBLE_BUTTONS.map((b, i) => ({
			...b,
			scheme: schemes[i] || null
		})).filter((x) => x.scheme);
	}
	function getAudibleMap() {
		const plays = OFF_PLAYS.slice();
		return AUDIBLE_BUTTONS.map((b, i) => ({
			...b,
			play: plays[i] || null
		})).filter((x) => x.play);
	}
	function updateAudibleHint() {
		const el = $("audibleHint");
		if (!el) return;
		if (!practiceAwaitSnap || gameMode !== "practice") {
			el.classList.add("hidden");
			return;
		}
		if (practiceAudibleArm) {
			const lines = [
				"OFFENSE MENU — Left stick ↕ to browse",
				...getAudibleMap().map((m) => m.label + "  " + m.play.name),
				"A = confirm · X = close"
			];
			el.classList.remove("hidden");
			el.textContent = lines.join("\n");
			return;
		}
		if (practiceDefAudibleArm) {
			const lines = [
				"DEFENSE MENU — Left stick ↕ to browse",
				...getDefAudibleMap().map((m) => m.label + "  " + m.scheme.name),
				"A = confirm · B = close"
			];
			el.classList.remove("hidden");
			el.textContent = lines.join("\n");
			return;
		}
		el.classList.remove("hidden");
		el.textContent = "X offense book · B defense book · Y close · A snap · R replay";
	}
	function audibleLabelForPlay(playId) {
		const map = getAudibleMap();
		const hit = map.find((m) => m.play && m.play.id === playId);
		return hit ? hit.label : "";
	}
		function stylePrevBlock(side) {
		const uni = getUni(side);
		const jer = uni.jersey || "#888";
		const block = $(side === "def" ? "prevDefBlock" : "prevOffBlock");
		const banner = $(side === "def" ? "prevDefBanner" : "prevOffBanner");
		const label = $(side === "def" ? "prevDefLabel" : "prevOffLabel");
		const btn = $(side === "def" ? "prevDefBtn" : "prevOffBtn");
		const numEl = $(side === "def" ? "prevDefNum" : "prevOffNum");
		if (block) block.style.borderColor = jer;
		if (banner) {
			banner.style.background = jer;
			const hex = jer.replace("#", "");
			let lum = 128;
			if (hex.length >= 6) {
				const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
				lum = 0.299 * r + 0.587 * g + 0.114 * b;
			}
			banner.style.color = lum > 160 ? "#111" : "#fff";
		}
		if (side === "def") {
			const idx = Math.max(0, DEF_SCHEMES.findIndex((s) => s.id === (practiceDefSchemeId || (currentScheme && currentScheme.id))));
			const scheme = DEF_SCHEMES[idx] || currentScheme;
			if (numEl) numEl.textContent = scheme ? String(idx + 1) : "";
			if (label) label.textContent = scheme ? scheme.name + (practiceDefFlipped ? " ⇄" : "") : "Defense";
			if (btn) {
				btn.textContent = "";
				btn.style.display = "none";
			}
		} else {
			const stockId = stockPlayId();
			const idx = Math.max(0, OFF_PLAYS.findIndex((p) => p.id === stockId));
			const play = OFF_PLAYS[idx] || currentPlay;
			if (numEl) numEl.textContent = play ? String(idx + 1) : "";
			if (label) label.textContent = play ? play.name + (practiceFlipped ? " ⇄" : "") : "Offense";
			if (btn) {
				btn.textContent = "";
				btn.style.display = "none";
			}
		}
	}
function drawMiniPreview(canvas, kind) {
		if (!canvas) return;
		const c = canvas.getContext("2d");
		if (!c) return;
		const W = canvas.width, H = canvas.height;
		c.clearRect(0, 0, W, H);
		c.fillStyle = "#0a1210";
		c.fillRect(0, 0, W, H);
		const pad = 12;
		const snap = typeof snapX === "function" ? snapX() : FIELD_WIDTH / 2;
		const span = Math.min(FIELD_WIDTH, 30);
		const x0 = snap - span / 2;
		const losY = H * 0.58;
		const toPX = (wx) => pad + ((wx - x0) / span) * (W - pad * 2);
		const toPY = (wy) => losY - (wy - playStartYard) * 3.4;
		// LOS
		c.strokeStyle = "rgba(255,255,255,0.4)";
		c.lineWidth = 1.2;
		c.setLineDash([4, 3]);
		c.beginPath();
		c.moveTo(pad, losY);
		c.lineTo(W - pad, losY);
		c.stroke();
		c.setLineDash([]);
		function dot(wx, wy, color, r) {
			const x = toPX(wx), y = toPY(wy);
			if (y < 2 || y > H - 2) return;
			c.fillStyle = color;
			c.beginPath();
			c.arc(x, y, r || 3.4, 0, Math.PI * 2);
			c.fill();
			c.strokeStyle = "rgba(0,0,0,0.35)";
			c.lineWidth = 1;
			c.stroke();
		}
		function arrow(x0w, y0w, x1w, y1w, color, dashed) {
			const a = { x: toPX(x0w), y: toPY(y0w) };
			const b = { x: toPX(x1w), y: toPY(y1w) };
			c.strokeStyle = color;
			c.lineWidth = dashed ? 1.25 : 1.5;
			if (dashed) c.setLineDash([5, 4]);
			c.beginPath();
			c.moveTo(a.x, a.y);
			c.lineTo(b.x, b.y);
			c.stroke();
			c.setLineDash([]);
			const ang = Math.atan2(b.y - a.y, b.x - a.x);
			c.beginPath();
			c.moveTo(b.x, b.y);
			c.lineTo(b.x - 5 * Math.cos(ang - 0.4), b.y - 5 * Math.sin(ang - 0.4));
			c.lineTo(b.x - 5 * Math.cos(ang + 0.4), b.y - 5 * Math.sin(ang + 0.4));
			c.closePath();
			c.fillStyle = color;
			c.fill();
		}
		function zoneEllipse(wx, wy, rx, ry, color, follow) {
			const x = toPX(wx), y = toPY(wy);
			const sx = Math.max(6, rx * (W - pad * 2) / span);
			const sy = Math.max(5, ry * 3.4);
			c.save();
			c.globalAlpha = follow ? 0.22 : 0.16;
			c.fillStyle = color;
			c.beginPath();
			c.ellipse(x, y, sx, sy, 0, 0, Math.PI * 2);
			c.fill();
			c.globalAlpha = 0.55;
			c.strokeStyle = color;
			c.lineWidth = follow ? 1.6 : 1.1;
			c.setLineDash(follow ? [3, 2] : []);
			c.stroke();
			c.setLineDash([]);
			c.restore();
		}
		if (kind === "def") {
			// Priority draw: deep zones → linebackers → DTs → blitz arrows
			const order = [...defenders].sort((a, b) => {
				const rank = (d) => d.job === "deep" || d.job === "robber" ? 0 : d.job === "drop" || d.job === "hook" || d.job === "spy" ? 1 : d.group === "DT" ? 3 : 2;
				return rank(a) - rank(b);
			});
			order.forEach((d) => {
				const col = d.job === "blitz" ? "#ef4444" : d.job === "deep" || d.job === "robber" ? "#a78bfa" : d.job === "drop" || d.job === "spy" ? "#facc15" : d.job === "flat" || d.job === "contain" || d.job === "curl" || d.job === "shade" ? "#38bdf8" : d.job === "hook" ? "#ddd6fe" : "#e2e8f0";
				const tx = d.jobX != null ? d.jobX : d.x;
				const ty = d.jobY != null ? d.jobY : d.y + 2;
				const zoneish = d.job === "deep" || d.job === "drop" || d.job === "flat" || d.job === "curl" || d.job === "hook" || d.job === "robber" || d.job === "contain" || d.job === "spy" || d.job === "shade";
				if (zoneish) {
					zoneEllipse(tx, ty, d.zoneRx || 4, d.zoneRy || 2.4, col, !!d.zoneFollow);
					// plain connector to zone center (no arrowhead)
					const a = { x: toPX(d.x), y: toPY(d.y) }, b = { x: toPX(tx), y: toPY(ty) };
					c.strokeStyle = col;
					c.lineWidth = 1.3;
					c.beginPath();
					c.moveTo(a.x, a.y);
					c.lineTo(b.x, b.y);
					c.stroke();
				} else if (d.job === "blitz" || d.job === "man") {
					arrow(d.x, d.y, tx, ty, col);
				}
				dot(d.x, d.y, col, d.group === "DT" ? 4.2 : 3.3);
			});
		} else {
			// Offense priority: OL → TE → FB → QB → RB path
			const groups = ["OL", "TE", "FB", "QB"];
			groups.forEach((g) => {
				blockers.filter((b) => b.group === g).forEach((b) => {
					const col = g === "OL" ? "#94a3b8" : g === "FB" ? "#fbbf24" : g === "TE" ? "#34d399" : "#cbd5e1";
					dot(b.x, b.y, col, 3.3);
					// Match on-field art: grey stroke + perpendicular T-cap (not yellow arrows)
					function miniBlockT(x0, y0, x1, y1) {
						const a = { x: toPX(x0), y: toPY(y0) };
						const bpt = { x: toPX(x1), y: toPY(y1) };
						c.strokeStyle = "rgba(210,214,208,0.92)";
						c.lineWidth = 1.6;
						c.lineCap = "round";
						c.beginPath();
						c.moveTo(a.x, a.y);
						c.lineTo(bpt.x, bpt.y);
						c.stroke();
						const ang = Math.atan2(bpt.y - a.y, bpt.x - a.x);
						const cap = 5;
						c.beginPath();
						c.moveTo(bpt.x + Math.cos(ang + Math.PI / 2) * cap, bpt.y + Math.sin(ang + Math.PI / 2) * cap);
						c.lineTo(bpt.x + Math.cos(ang - Math.PI / 2) * cap, bpt.y + Math.sin(ang - Math.PI / 2) * cap);
						c.stroke();
					}
					function aimShort(tx, ty, maxDist) {
						const dx = tx - b.x, dy = ty - b.y;
						const len = Math.hypot(dx, dy) || 1;
						const s = Math.min(1, maxDist / len);
						return [b.x + dx * s, b.y + dy * s];
					}
					if (b.blockMode === "pull" && b.pullVia) {
						const p = aimShort(b.pullVia.x2 || b.pullVia.x, b.pullVia.y2 || b.pullVia.y, 5.5);
						miniBlockT(b.x, b.y, p[0], p[1]);
					} else if (b.blockTarget || b.gapAimX != null) {
						const tx = b.blockTarget ? b.blockTarget.x : b.gapAimX;
						const ty = b.blockTarget ? b.blockTarget.y : (b.gapAimY != null ? b.gapAimY : playStartYard + 4.5);
						// Climb / next-level blocks draw longer so they read clearly vs base blocks
						const maxD = b.blockMode === "climb" ? 6.2 : b.blockMode === "reach" ? 3.8 : 2.6;
						const p = aimShort(tx, ty, maxD);
						miniBlockT(b.x, b.y, p[0], p[1]);
					}
				});
			});
			if (rb) {
				dot(rb.x, rb.y, "#fb4f14", 4.5);
				function drawStepPath(steps, color, dashed) {
					if (!steps || !steps.length) return;
					let px = rb.x, py = rb.y;
					steps.forEach((st) => {
						const nx = px + (st.dx || 0) * 9;
						const ny = py + (st.dy || 0) * 7;
						arrow(px, py, nx, ny, color, dashed);
						px = nx; py = ny;
					});
				}
				if (currentPlay && currentPlay.altSteps && currentPlay.altSteps.length) {
					drawStepPath(currentPlay.altSteps, "rgba(251,191,36,0.8)", true);
				}
				if (currentPlay && currentPlay.steps && currentPlay.steps.length) {
					drawStepPath(currentPlay.steps, "#fb4f14", false);
				} else if (currentPlay && currentPlay.arrow) {
					const a = currentPlay.arrow;
					let px = rb.x, py = rb.y;
					a.forEach((dx) => {
						const nx = px + dx * 6;
						const ny = py + 5;
						arrow(px, py, nx, ny, "#fb4f14", false);
						px = nx; py = ny;
					});
				}
			}
		}
	}


	function renderPracticeDefList() {
		const list = $("practiceDefList");
		if (!list) return;
		const cur = practiceDefSchemeId || huddleDefPickId || (currentScheme && currentScheme.id);
		list.innerHTML = "";
		DEF_SCHEMES.forEach((s, i) => {
			const row = document.createElement("div");
			row.className = "play-item" + (s.id === cur ? " selected" : "");
			row.dataset.id = s.id;
			const num = document.createElement("span");
			num.className = "play-num";
			num.textContent = String(i + 1);
			const name = document.createElement("span");
			name.className = "play-name";
			name.textContent = s.name;
			row.appendChild(num);
			row.appendChild(name);
			row.onclick = () => {
				if (gameMode === "game" && userSide !== "def") return;
				if (gameMode === "practice") practiceDefSchemeId = s.id;
				else huddleDefPickId = s.id;
				const sel = $("practiceDefScheme");
				if (sel) sel.value = s.id;
				try { placeEntitiesForNewPlay(); } catch (err) { console.error(err); }
				setPlayCall((currentPlay ? currentPlay.name : "Play") + " · vs " + s.name + " — press A to snap");
				renderPracticeDefList();
				refreshPracticePreviews();
			};
			list.appendChild(row);
		});
	}
	function renderPracticePlayList() {
		const list = $("practicePlayList");
		if (!list) return;
		const cur = stockPlayId();
		list.innerHTML = "";
		OFF_PLAYS.forEach((p, i) => {
			const row = document.createElement("div");
			row.className = "play-item" + (p.id === cur ? " selected" : "");
			row.dataset.id = p.id;
			const num = document.createElement("span");
			num.className = "play-num";
			num.textContent = String(i + 1);
			const name = document.createElement("span");
			name.className = "play-name";
			name.textContent = p.name;
			row.appendChild(num);
			row.appendChild(name);
			row.onclick = () => {
				if (gameMode === "game" && userSide !== "off") return;
				if (gameMode === "practice") practiceOffPlayId = p.id;
				else huddleOffPickId = p.id;
				const sel = $("practiceOffPlay");
				if (sel) sel.value = p.id;
				try { placeEntitiesForNewPlay(); } catch (err) { console.error(err); }
				setPlayCall(p.name + " — press A to snap");
				renderPracticePlayList();
				refreshPracticePreviews();
			};
			list.appendChild(row);
		});
	}

	function wirePracticePreviewClicks() {
		const offB = $("prevOffBlock");
		const defB = $("prevDefBlock");
		if (offB && !offB._fgaClick) {
			offB._fgaClick = true;
			offB.style.cursor = "pointer";
			offB.title = "Click to focus — then ↑↓ cycles offense plays";
			offB.addEventListener("click", (e) => {
				if (e.target.closest(".play-item")) return; // list row handles itself
				practiceFocusSide = "off";
				practiceAudibleArm = false;
				practiceDefAudibleArm = false;
				if (typeof refreshPracticePreviews === "function") refreshPracticePreviews();
				if (typeof updateAudibleHint === "function") updateAudibleHint();
			});
		}
		if (defB && !defB._fgaClick) {
			defB._fgaClick = true;
			defB.style.cursor = "pointer";
			defB.title = "Click to focus — then ↑↓ cycles defense schemes";
			defB.addEventListener("click", (e) => {
				if (e.target.closest(".play-item")) return;
				practiceFocusSide = "def";
				practiceAudibleArm = false;
				practiceDefAudibleArm = false;
				if (typeof refreshPracticePreviews === "function") refreshPracticePreviews();
				if (typeof updateAudibleHint === "function") updateAudibleHint();
			});
		}
	}
	function refreshPracticePreviews() {
		const panel = $("practicePreview");
		if (panel) panel.classList.toggle("hidden", gameMode !== "practice");
		if (gameMode !== "practice") {
			updateAudibleHint();
			return;
		}
		const offB = $("prevOffBlock");
		const defB = $("prevDefBlock");
		// Closer to field = lower order (field is left of this column)
		if (offB && defB) {
			// Offense always left of defense
			offB.style.order = "0";
			defB.style.order = "1";
			offB.classList.toggle("prev-focused", practiceFocusSide === "off");
			defB.classList.toggle("prev-focused", practiceFocusSide === "def");
		}
		stylePrevBlock("def");
		stylePrevBlock("off");
		drawMiniPreview($("prevDefCanvas"), "def");
		drawMiniPreview($("prevOffCanvas"), "off");
		renderPracticePlayList();
		renderPracticeDefList();
		updateAudibleHint();
		wirePracticePreviewClicks();
	}

	function drawPlayArt() {
		const holdPeek = peekHeld || peekToggle;
		const artOn = playArtMode !== "off";
		const wantOff = artOn && (playArtMode === "on" || playArtMode === "offense");
		const wantDef = artOn && (playArtMode === "on" || playArtMode === "defense") || holdPeek;
		const returning = !!(fumbleSeq && (fumbleSeq.phase === "return" || fumbleSeq.defender && fumbleSeq.phase !== "loose") || scoreSeq && scoreSeq.who === "def");
		const showOff = wantOff && !!currentPlay && (preSnapTimer > 0 || playAge < 5.2 || holdPeek || (practiceAwaitSnap && practiceAudibleArm));
		const showDef = !returning && wantDef && (holdPeek || (!practiceAwaitSnap && (revealDefThisPlay || preSnapTimer > .2 || playAge < 5.4)) || (practiceAwaitSnap && practiceDefAudibleArm));
		if (!showOff && !showDef) return;
		const aOrigin = artAlpha(0);
		const aDest = artAlpha(1);
		const oOrigin = artAlphaOff(0);
		const oDest = artAlphaOff(1);
		const zA = zoneAlpha();
		if (showOff && currentPlay && (oOrigin > .02 || oDest > .02 || holdPeek)) blockers.forEach((b) => {
			const segs = [];
			// Shorten art paths so "next level" blocks don't draw stadium-long arrows
			function shortAim(tx, ty, maxDist) {
				maxDist = maxDist == null ? 3.2 : maxDist;
				const dx = tx - b.x, dy = ty - b.y;
				const len = Math.hypot(dx, dy) || 1;
				const s = Math.min(1, maxDist / len);
				return [b.x + dx * s, b.y + dy * s];
			}
			if (b.blockMode === "pull" && b.pullVia) {
				const p1 = shortAim(b.pullVia.x, b.pullVia.y, 2.4);
				segs.push(p1);
				const p2 = shortAim(b.pullVia.x2, b.pullVia.y2, 3.6);
				segs.push(p2);
			} else if (b.blockTarget) {
				const t = b.blockTarget;
				const aim = shortAim(t.x + (b.driveSide || 1) * 0.35, t.y, b.blockMode === "climb" ? 3.4 : 2.8);
				segs.push(aim);
			} else if (b.gapAimX != null) {
				segs.push(shortAim(b.gapAimX, b.gapAimY != null ? b.gapAimY : playStartYard + 4.5, 3.2));
			} else segs.push(shortAim(b.x + (b.driveSide || 0) * 1.2, playStartYard + Math.min(3.2, b.levelY || 2.5), 2.6));
			drawBlockT(b.x, b.y, segs, oOrigin, oDest);
		});
		if (showDef && (aOrigin > .02 || aDest > .02 || zA > .02 || holdPeek)) {
			defenders.forEach((d) => {
				const col = d.job === "blitz" ? "#ef4444" : d.job === "spy" ? "#f97316" : d.job === "contain" || d.job === "shade" ? "#38bdf8" : d.job === "curl" ? "#67e8f9" : d.job === "hook" || d.job === "robber" ? "#c4b5fd" : d.job === "deep" ? "#a78bfa" : d.job === "drop" ? "#facc15" : d.job === "flat" ? "#7dd3fc" : "#f8fafc";
				const fl = fieldLeft(), fr = fieldRight();
				const tx = clamp(d.jobX != null ? d.jobX : d.x, fl + 2.6, fr - 2.6);
				const ty = d.jobY != null ? d.jobY : d.y + 3;
				if (d.job === "spy") {
					const zx = d.spyPhase === "follow" ? d.x : tx;
					const zy = d.spyPhase === "follow" ? d.y : ty;
					if (zA > .02 || holdPeek) drawZoneCloud(zx, zy, d.zoneRx || 1.55, d.zoneRy || 1.45, col, zA * .42);
					if (aOrigin > .02 || holdPeek) {
						const midX = d.stutterX != null ? d.stutterX : (d.x + tx) / 2;
						const midY = d.stutterY != null ? d.stutterY : (d.y + ty) / 2;
						drawWorldCurve([
							[d.x, d.y],
							[midX, midY],
							[tx, ty]
						], col, 2.3, aOrigin * .9, aDest * .95);
					}
				} else if (d.job === "deep" || d.job === "drop" || d.job === "flat" || d.job === "curl" || d.job === "hook" || d.job === "robber" || d.job === "contain" || d.job === "shade") {
					if (zA > .02 || holdPeek) drawZoneCloud(tx, ty, d.zoneRx || 4, d.zoneRy || 2.4, col, zA * .3);
					if (aOrigin > .02 || holdPeek) drawAssignmentArrow(d.x, d.y, tx, ty, col, aOrigin * .9, aDest * .55, true);
				} else if (d.job === "blitz" && (d.artCurve || d.stutter)) {
					const inward = tx > (fl + fr) / 2 ? -1.35 : 1.35;
					const midX = clamp(d.stutter ? d.stutterX : (d.x + tx) / 2 + inward, fl + 3.2, fr - 3.2);
					const midY = d.stutter ? d.stutterY : (d.y + ty) / 2;
					drawWorldCurve([
						[d.x, d.y],
						[midX, midY],
						[tx, ty]
					], col, 2.3, aOrigin * .9, aDest * .95);
				} else drawAssignmentArrow(d.x, d.y, tx, ty, col, aOrigin * .9, aDest * .95);
			});
			if (currentScheme && currentScheme.name && aOrigin > .12) {
				ctx.save();
				ctx.fillStyle = colorAlpha("rgba(248,250,252,0.8)", Math.min(1, aOrigin + .1));
				ctx.font = "bold 13px Barlow Condensed, sans-serif";
				ctx.textAlign = "left";
				ctx.fillText("D: " + currentScheme.name, 14, 22);
				ctx.restore();
			}
		}
	}
	function drawPip() {
		if (!pipReplay || !pipReplay.frames.length) return;
		const frame = pipReplay.frames[Math.min(pipReplay.i, pipReplay.frames.length - 1)];
		if (!frame) return;
		const split = replayMode === "split";
		const pipW = split ? canvas.width * .4 : canvas.width * .22;
		const pipH = split ? canvas.height * .84 : canvas.height * .3;
		const pipX = split ? canvas.width * .59 : canvas.width - pipW - 10;
		const pipY = split ? canvas.height * .08 : canvas.height - pipH - 12;
		ctx.save();
		ctx.fillStyle = "rgba(8,12,10,0.88)";
		ctx.strokeStyle = "rgba(251,79,20,0.9)";
		ctx.lineWidth = 2;
		ctx.beginPath();
		if (typeof ctx.roundRect === "function") ctx.roundRect(pipX, pipY, pipW, pipH, 8);
		else ctx.rect(pipX, pipY, pipW, pipH);
		ctx.fill();
		ctx.stroke();
		ctx.beginPath();
		ctx.rect(pipX, pipY, pipW, pipH);
		ctx.clip();
		ctx.fillStyle = "#1a5c32";
		ctx.fillRect(pipX + 3, pipY + 18, pipW - 6, pipH - 22);
		ctx.fillStyle = "#fb4f14";
		ctx.font = "bold 11px Barlow Condensed, sans-serif";
		ctx.textAlign = "left";
		ctx.fillText(split ? "REPLAY · SPLIT" : "REPLAY", pipX + 10, pipY + 14);
		const focus = frame.rb || {
			x: FIELD_WIDTH / 2,
			y: 50
		};
		const cam = camSpec();
		const innerW = pipW - 16;
		const innerH = pipH - 36;
		const k = Math.min(innerW / 22, innerH / 28);
		function map(wx, wy) {
			const depth = (focus.y - wy);
			const sx = pipX + pipW / 2 + (wx - focus.x) * k + depth * cam.skew * k * .55;
			const sy = pipY + 22 + innerH * .62 - (wy - focus.y) * k * cam.yScale;
			return {
				sx,
				sy
			};
		}
		ctx.strokeStyle = "rgba(255,255,255,0.28)";
		ctx.lineWidth = 1;
		for (let y = Math.floor(focus.y / 10) * 10 - 20; y <= focus.y + 30; y += 5) {
			const a = map(0, y), b = map(FIELD_WIDTH, y);
			ctx.beginPath();
			ctx.moveTo(a.sx, a.sy);
			ctx.lineTo(b.sx, b.sy);
			ctx.stroke();
		}
		// Runner path trail up to this frame
		if (frame.trail && frame.trail.length >= 2) {
			ctx.lineCap = "round";
			ctx.lineJoin = "round";
			ctx.strokeStyle = "rgba(120, 12, 18, 0.9)";
			ctx.lineWidth = 2.4;
			ctx.beginPath();
			const t0 = map(frame.trail[0].x, frame.trail[0].y);
			ctx.moveTo(t0.sx, t0.sy);
			for (let i = 1; i < frame.trail.length; i++) {
				const t = map(frame.trail[i].x, frame.trail[i].y);
				ctx.lineTo(t.sx, t.sy);
			}
			ctx.stroke();
		}
		const uniOff = getUni("off");
		const uniDef = getUni("def");
		const defJer = (uniDef && uniDef.jersey) || "#e8ece6";
		const offJer = (uniOff && uniOff.jersey) || "#fbbf24";
		(frame.defenders || []).forEach((d) => {
			const p = map(d.x, d.y);
			ctx.fillStyle = d.color || defJer;
			ctx.beginPath();
			ctx.arc(p.sx, p.sy, 4, 0, Math.PI * 2);
			ctx.fill();
		});
		(frame.blockers || []).forEach((b) => {
			const p = map(b.x, b.y);
			ctx.fillStyle = b.color || offJer;
			ctx.beginPath();
			ctx.arc(p.sx, p.sy, 4, 0, Math.PI * 2);
			ctx.fill();
		});
		if (frame.rb) {
			const p = map(frame.rb.x, frame.rb.y);
			ctx.fillStyle = frame.rb.color || offJer || "#fb4f14";
			ctx.beginPath();
			ctx.arc(p.sx, p.sy, 5.4, 0, Math.PI * 2);
			ctx.fill();
			// ball marker
			ctx.fillStyle = "#fb4f14";
			ctx.beginPath();
			ctx.arc(p.sx, p.sy - 3.2, 2.2, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.restore();
	}
	function tdSkyColor() {
		if (!scoreSeq || (scoreSeq.who !== "off" && scoreSeq.who !== "def")) return null;
		return getUni(scoreSeq.who).jersey || (scoreSeq.who === "def" ? "#E31837" : "#FB4F14");
	}
	function drawSky() {
		const td = tdSkyColor();
		ctx.fillStyle = td || "#1c3144";
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}
	function drawSidelineFigure(wx, wy, uni, kind, idx) {
		const pr = project(wx, wy, 0.04);
		if (!pr || pr.behind) return;
		if (pr.sy < -40 || pr.sy > canvas.height + 40) return;
		const isRef = kind === "ref";
		const isCoach = kind === "coach";
		const leftSide = wx < FIELD_WIDTH / 2;
		const salt = ((idx || 0) * 17 + Math.floor(wx * 5) + Math.floor(wy * 3)) | 0;
		const look = ((salt % 7) - 3) * 0.11;
		const facing = isRef ? (Math.PI / 2 + look * 0.4) : ((leftSide ? 0 : Math.PI) + look);
		const p = {
			x: wx,
			y: wy,
			facing,
			radius: isCoach ? 0.6 : 0.5,
			color: isRef ? "#141618" : (uni.jersey || "#888888"),
			helmet: isRef ? "#f4f6f8" : (uni.helmet || "#333333"),
			pants: isRef ? "#eef0f2" : (uni.pants || "#444444"),
			socks: isRef ? "#1a1a1a" : (uni.socks || uni.jersey || "#333333"),
			shoes: isRef ? "#1a1a1a" : (uni.shoes || "#111111"),
			glove: isRef ? "#1c1c1c" : uniGlove(uni),
			facemask: isRef ? "#2a2a2a" : (uni.facemask || "#cccccc"),
			helmStripes: isRef ? 0 : (uni.helmStripes == null ? 1 : uni.helmStripes),
			helmStripeCol: uni.helmStripeCol || uni.jersey,
			group: isCoach ? "LB" : "WR"
		};
		const r = p.radius * yardToPx() * (pr.sc || 1) * 0.7;
		if (r < 2.4) return;
		const bulk = isCoach ? 1.08 : 1;
		const BS = 0.78;
		const pose = salt % 3;
		let leanX = 0, leanF = 0.04;
		if (pose === 1) leanX = leftSide ? -0.08 : 0.08;
		if (pose === 2) leanF = 0.08;
		if (isCoach) {
			leanF = 0.06;
			leanX = leftSide ? 0.05 : -0.05;
		}
		const hipH = 0.8 * BS;
		const shH = hipH + 0.46 * BS;
		const headH = shH + 0.28 * BS;
		const padW = (isCoach ? 0.36 : 0.3) * BS;
		function jp(lat, fwd, up) { return jointP(p, lat, fwd, up); }
		const lHip = jp(-0.14 * BS + leanX * 0.1, leanF * 0.05, hipH);
		const rHip = jp(0.14 * BS + leanX * 0.1, leanF * 0.05, hipH);
		const lKnee = jp(-0.16 * BS, 0.1, hipH - 0.3 * BS);
		const rKnee = jp(0.16 * BS, 0.08, hipH - 0.32 * BS);
		const lFoot = jp(-0.13 * BS, 0.02, 0.05);
		const rFoot = jp(0.13 * BS, 0, 0.05);
		let lSh, rSh, lEl, rEl, lHd, rHd;
		if (isCoach) {
			lSh = jp(-padW, leanF * 0.12, shH);
			rSh = jp(padW, leanF * 0.12, shH);
			lEl = jp(-padW * 1.35, 0.04, shH - 0.14);
			rEl = jp(padW * 1.35, 0.04, shH - 0.14);
			lHd = jp(-0.16, 0.1, hipH + 0.1);
			rHd = jp(0.22, 0.14, hipH + 0.12);
		} else if (isRef) {
			lSh = jp(-padW, 0.08, shH);
			rSh = jp(padW, 0.1, shH);
			lEl = jp(-padW * 1.05, 0.06, shH - 0.2);
			rEl = jp(padW * 1.1, 0.16, shH + 0.04);
			lHd = jp(-padW * 0.9, 0.08, shH - 0.4);
			rHd = jp(padW * 0.85, 0.22, shH + 0.18);
		} else if (pose === 2) {
			lSh = jp(-padW, 0.1, shH);
			rSh = jp(padW, 0.1, shH);
			lEl = jp(-padW * 0.55, 0.18, shH - 0.16);
			rEl = jp(padW * 0.55, 0.16, shH - 0.18);
			lHd = jp(0.04, 0.2, shH - 0.22);
			rHd = jp(-0.02, 0.18, shH - 0.24);
		} else {
			lSh = jp(-padW, leanF * 0.12, shH);
			rSh = jp(padW, leanF * 0.12, shH);
			lEl = jp(-padW * 1.05, 0.04 + (pose === 1 ? 0.08 : 0), shH - 0.22);
			rEl = jp(padW * 1.05, 0.05, shH - 0.2);
			lHd = jp(-padW * 0.95, 0.06, shH - 0.42);
			rHd = jp(padW * 0.95, 0.08, shH - 0.4);
		}
		const hips = jp(leanX * 0.08, leanF * 0.05, hipH);
		const chest = jp(leanX * 0.16, leanF * 0.14, shH - 0.05);
		const cw = getCamWorld();
		const b = playerBasis(p);
		const rightNear = cw
			? ((cw.camX - p.x) * b.rtx + (cw.camY - p.y) * b.rty) > 0
			: pr.sx > canvas.width * 0.5;
		const thighW = Math.max(2.1, r * 0.42);
		const shinW = Math.max(1.5, r * 0.24);
		const armW = Math.max(1.8, r * 0.3);
		const foreW = Math.max(1.5, r * 0.24);
		ctx.save();
		ctx.globalAlpha = 0.28;
		ctx.fillStyle = "#05080a";
		ctx.beginPath();
		ctx.ellipse(pr.sx, pr.sy, r * 0.55, r * 0.18, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.globalAlpha = 1;
		function drawLeg(hip, knee, foot) {
			fillArmorCapsule(hip, knee, thighW, thighW * 0.72, p.pants, true, "none");
			if (knee && !knee.behind) clothEllipse(knee.sx, knee.sy, Math.max(1.8, r * 0.16), Math.max(1.5, r * 0.13), 0, p.pants);
			fillArmorCapsule(knee, foot, shinW, shinW * 0.7, p.socks, true, "none");
			if (foot && !foot.behind) volumeEllipse(foot.sx, foot.sy, Math.max(2.4, r * 0.32), Math.max(1.3, r * 0.14), 0, p.shoes);
		}
		function drawArm(sh, elb, hand) {
			fillArmorCapsule(sh, elb, armW, armW * 0.78, p.color, true, "both");
			if (elb && !elb.behind) clothEllipse(elb.sx, elb.sy, armW * 0.78, armW * 0.64, 0, p.color);
			fillArmorCapsule(elb, hand, foreW, foreW * 0.78, mixHex(p.color, p.helmet, 0.1), true, "start");
			if (hand && !hand.behind) clothEllipse(hand.sx, hand.sy, Math.max(1.7, r * 0.18), Math.max(1.4, r * 0.14), 0, p.glove);
		}
		const farLeg = rightNear ? [lHip, lKnee, lFoot] : [rHip, rKnee, rFoot];
		const nearLeg = rightNear ? [rHip, rKnee, rFoot] : [lHip, lKnee, lFoot];
		const farArm = rightNear ? [lSh, lEl, lHd] : [rSh, rEl, rHd];
		const nearArm = rightNear ? [rSh, rEl, rHd] : [lSh, lEl, lHd];
		drawLeg(farLeg[0], farLeg[1], farLeg[2]);
		drawArm(farArm[0], farArm[1], farArm[2]);
		if (hips && chest && !hips.behind && !chest.behind) {
			fillArmorCapsule(hips, chest, r * 0.32 * bulk, r * 0.44 * bulk, p.color, true, "end");
		}
		if (chest && !chest.behind) {
			clothEllipse(chest.sx, chest.sy, r * 0.55 * bulk, r * 0.3 * bulk, 0, p.color);
			if (isRef) {
				ctx.save();
				ctx.strokeStyle = "#f3f5f7";
				ctx.lineWidth = Math.max(1.1, r * 0.09);
				ctx.lineCap = "butt";
				for (let s = -2; s <= 2; s++) {
					ctx.beginPath();
					ctx.moveTo(chest.sx - r * 0.42, chest.sy + s * r * 0.11);
					ctx.lineTo(chest.sx + r * 0.42, chest.sy + s * r * 0.11);
					ctx.stroke();
				}
				ctx.restore();
			}
		}
		if (lSh && !lSh.behind) clothEllipse(lSh.sx, lSh.sy, r * 0.32 * bulk, r * 0.22 * bulk, 0, p.color);
		if (rSh && !rSh.behind) clothEllipse(rSh.sx, rSh.sy, r * 0.32 * bulk, r * 0.22 * bulk, 0, p.color);
		drawArm(nearArm[0], nearArm[1], nearArm[2]);
		drawLeg(nearLeg[0], nearLeg[1], nearLeg[2]);
		if (isCoach) {
			const board = jp(0.22, 0.16, hipH + 0.1);
			if (board && !board.behind) {
				ctx.save();
				ctx.translate(board.sx, board.sy);
				ctx.rotate(leftSide ? 0.35 : -0.35);
				ctx.fillStyle = "#d7c49a";
				ctx.fillRect(-r * 0.16, -r * 0.22, r * 0.32, r * 0.42);
				ctx.strokeStyle = "#6a5434";
				ctx.lineWidth = 1;
				ctx.strokeRect(-r * 0.16, -r * 0.22, r * 0.32, r * 0.42);
				ctx.restore();
			}
		}
		drawHelmet3(p, leanX * 0.12, leanF * 0.16, headH, r, bulk);
		ctx.restore();
	}
	function crowdDotInfo(wx, wy, side, rng) {
		const off = getUni("off"), defu = getUni("def");
		const visitor = side > 0 && wy < 50;
		function crowdCol(uni) {
			const roll = rng();
			if (roll < 0.6) return uni.crowdPri || uni.jersey || "#fb4f14";
			if (roll < 0.9) return uni.crowdSec || uni.endSecondary || uni.helmet || "#ffffff";
			return "#f4f6f8";
		}
		if (visitor) return { color: crowdCol(defu), home: false };
		const home = rng() < 0.93;
		return { color: home ? crowdCol(off) : crowdCol(defu), home };
	}
	function crowdCheerH(isHome, salt) {
		if (!scoreSeq) return 0;
		const homeTd = scoreSeq.who === "off";
		if (homeTd !== !!isHome) return 0;
		const amp = cheerAmp || 0;
		if (amp <= 0.01) return 0;
		return amp * (0.45 + 1.55 * Math.abs(Math.sin(poseClock * 12.2 + salt)));
	}
	function drawCrowdFan(wx, wy, h, rng, side) {
		const info = crowdDotInfo(wx, wy, side, rng);
		const hop = crowdCheerH(info.home, wx * 2.7 + wy * 1.4);
		const pt = project(wx, wy, (h || 0) + hop + 0.62);
		if (pt.behind) return;
		ctx.fillStyle = info.color;
		const rr = 1.02 + rng() * 0.72;
		ctx.beginPath();
		ctx.ellipse(pt.sx, pt.sy, rr * 0.55, rr * 1.15, 0, 0, Math.PI * 2);
		ctx.fill();
	}
	function fillWorldPoly(pts, fill, stroke, alpha, frontOnly) {
		if (!pts || pts.length < 3) return;
		if (frontOnly) {
			if (pts.some((p) => !p || p.behind || (p.cz != null && p.cz < 1.45))) return;
		}
		const poly = frontOnly ? pts : clipPolyNear(pts);
		if (!poly || poly.length < 3) return;
		const box = screenBoxOf(poly, 260);
		if (!isFinite(box.minX)) return;
		if (box.maxX < -260 || box.minX > canvas.width + 260 || box.maxY < -260 || box.minY > canvas.height + 260) return;
		let clipped = false;
		let nearish = false;
		let uMinX = Infinity, uMaxX = -Infinity, uMinY = Infinity, uMaxY = -Infinity;
		for (let i = 0; i < poly.length; i++) {
			const p = poly[i];
			if (!p) continue;
			if (p.cz != null && p.cz < 3.4) nearish = true;
			if (p.cz != null && p.cz <= NEAR_Z + 0.08) clipped = true;
			if (p.sx < uMinX) uMinX = p.sx;
			if (p.sx > uMaxX) uMaxX = p.sx;
			if (p.sy < uMinY) uMinY = p.sy;
			if (p.sy > uMaxY) uMaxY = p.sy;
		}
		if (clipped && ((uMaxX - uMinX) > 1400 || (uMaxY - uMinY) > 1000 || box.spanX > canvas.width * 1.25 || box.spanY > canvas.height * 1.25)) return;
		if (nearish && (box.spanX > canvas.width * 1.55 || box.spanY > canvas.height * 1.55)) return;
		if (box.spanX > canvas.width * 8 || box.spanY > canvas.height * 8) return;
		ctx.save();
		if (alpha != null && alpha < 1) ctx.globalAlpha = alpha;
		ctx.beginPath();
		ctx.moveTo(poly[0].sx, poly[0].sy);
		for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].sx, poly[i].sy);
		ctx.closePath();
		ctx.fillStyle = fill;
		ctx.fill();
		if (stroke) {
			ctx.strokeStyle = stroke;
			ctx.lineWidth = 1.15;
			ctx.stroke();
		}
		ctx.restore();
	}
	function endzoneDeckSpec(dir) {
		const RUN = 2.7 * 1.25;
		const RISE = RUN;
		const WALK = 0.24;
		const fills = ["#2a3338", "#232b30", "#1c2428", "#191f24", "#151b1f", "#12181c"];
		const walls = ["#5e6c74", "#546168", "#414c53", "#3a444a", "#323b41", "#2b3338"];
		const decks = [];
		let y = dir > 0 ? Field.northBack + 0.4 : Field.southBack - 0.4;
		let h = 1.05 * 1.25;
		let pad = 5.1;
		const N_BASE = 3;
		const N_WING = dir > 0 ? 3 : 0;
		for (let i = 0; i < N_BASE + N_WING; i++) {
			const y0 = y;
			const y1 = y + dir * RUN;
			decks.push({
				y0,
				y1,
				h0: h,
				h1: h + RISE,
				pad0: pad,
				pad1: pad + 4.1,
				fill: fills[Math.min(i, fills.length - 1)],
				wall: walls[Math.min(i, walls.length - 1)],
				rows: 9,
				wing: i >= N_BASE
			});
			y = y1 + dir * WALK;
			h += RISE + 0.12;
			pad += 4.1;
		}
		return decks;
	}
	function scoreboardGeom(dir) {
		const decks = endzoneDeckSpec(dir);
		const base = decks.filter((d) => !d.wing).pop();
		const northTop = endzoneDeckSpec(1);
		const wingTop = northTop[northTop.length - 1];
		const fl = fieldLeft(), fr = fieldRight();
		const midX = (fl + fr) / 2;
		const fieldW = fr - fl;
		const bwYd = dir < 0 ? fieldW * 1.02 : Math.max(24, fieldW * 0.52);
		const hBase = base.h1 + 0.2;
		const hTop = wingTop.h1 + 0.08;
		const bhYd = hTop - hBase;
		const thick = 0.95;
		const yInner = base.y1 + dir * 0.18;
		const yOuter = yInner + dir * 1.25;
		return {
			dir,
			size: 1.18,
			midX,
			bwYd,
			bhYd,
			thick,
			tilt: Math.abs(yOuter - yInner),
			yInner,
			yOuter,
			hBase,
			hTop,
			x0: midX - bwYd / 2,
			x1: midX + bwYd / 2,
			yBInner: yInner + dir * thick,
			yBOuter: yOuter + dir * thick,
			top: base,
			wingTop
		};
	}
	function drawEndzoneStands(dir, seed) {
		if (!lookingTowardY(dir > 0 ? 118 : -18, 3)) return;
		const fl = fieldLeft(), fr = fieldRight();
		const decks = endzoneDeckSpec(dir);
		const sb = scoreboardGeom(dir);
		const rng = mulberry32(hashSeed("ezcrowd" + seed + String(dir)));
		const gap = 0.5;
		const cutL = sb.x0 - gap, cutR = sb.x1 + gap;
		function spansFor(deck) {
			const l0 = fl - deck.pad0, r0 = fr + deck.pad0;
			const l1 = fl - deck.pad1, r1 = fr + deck.pad1;
			if (!deck.wing) return [{ l0, r0, l1, r1, cut: null }];
			const out = [];
			if (l0 < cutL - 0.9) out.push({ l0, r0: Math.min(r0, cutL), l1, r1: Math.min(r1, cutL), cut: "R" });
			if (r0 > cutR + 0.9) out.push({ l0: Math.max(l0, cutR), r0, l1: Math.max(l1, cutR), r1, cut: "L" });
			return out.filter((s) => s.r0 - s.l0 > 1.15 && s.r1 - s.l1 > 1.15);
		}
		const lastBase = decks.filter((d) => !d.wing).pop();
		const lastWing = decks[decks.length - 1];
		for (let di = decks.length - 1; di >= 0; di--) {
			const deck = decks[di];
			const hBelow = di === 0 ? 0 : decks[di - 1].h1;
			const hOutBelow = di === 0 ? 0 : decks[di - 1].h1;
			const spans = spansFor(deck);
			const isOuter = deck === lastWing;
			for (const sp of spans) {
				if (isOuter) {
					fillWorldPoly([
						project(sp.l1, deck.y1, deck.h0),
						project(sp.r1, deck.y1, deck.h0),
						project(sp.r1, deck.y1, deck.h1 + 0.18),
						project(sp.l1, deck.y1, deck.h1 + 0.18)
					], "#12181b", "rgba(8,12,14,0.5)");
				}
				fillWorldPoly([
					project(sp.l0, deck.y0, deck.h0),
					project(sp.r0, deck.y0, deck.h0),
					project(sp.r1, deck.y1, deck.h1),
					project(sp.l1, deck.y1, deck.h1)
				], deck.fill, "rgba(8,12,14,0.45)");
				fillWorldPoly([
					project(sp.l0, deck.y0, Math.max(hBelow, deck.h0 - 0.55)),
					project(sp.r0, deck.y0, Math.max(hBelow, deck.h0 - 0.55)),
					project(sp.r0, deck.y0, deck.h0),
					project(sp.l0, deck.y0, deck.h0)
				], deck.wall, "rgba(8,12,14,0.4)");
				fillWorldPoly([
					project(sp.l0, deck.y0, Math.max(hBelow, deck.h0 - 0.45)),
					project(sp.l0, deck.y0, deck.h0),
					project(sp.l1, deck.y1, deck.h1),
					project(sp.l1, deck.y1, Math.max(hOutBelow, deck.h1 - 0.45))
				], mixHex(deck.fill, "#0a0e10", 0.28));
				fillWorldPoly([
					project(sp.r0, deck.y0, Math.max(hBelow, deck.h0 - 0.45)),
					project(sp.r0, deck.y0, deck.h0),
					project(sp.r1, deck.y1, deck.h1),
					project(sp.r1, deck.y1, Math.max(hOutBelow, deck.h1 - 0.45))
				], mixHex(deck.fill, "#0a0e10", 0.18));
				if (sp.cut === "R") {
					fillWorldPoly([
						project(sp.r0, deck.y0, Math.max(hBelow, deck.h0 - 0.4)),
						project(sp.r0, deck.y0, deck.h0),
						project(sp.r1, deck.y1, deck.h1),
						project(sp.r1, deck.y1, Math.max(hOutBelow, deck.h1 - 0.4))
					], mixHex(deck.wall, "#0a0e10", 0.12));
				}
				if (sp.cut === "L") {
					fillWorldPoly([
						project(sp.l0, deck.y0, Math.max(hBelow, deck.h0 - 0.4)),
						project(sp.l0, deck.y0, deck.h0),
						project(sp.l1, deck.y1, deck.h1),
						project(sp.l1, deck.y1, Math.max(hOutBelow, deck.h1 - 0.4))
					], mixHex(deck.wall, "#0a0e10", 0.12));
				}
				const nSec = deck.wing ? 3 : 7;
				for (let s = 0; s < nSec; s++) {
					const t0 = s / nSec, t1 = (s + 1) / nSec;
					const xA = sp.l0 + (sp.r0 - sp.l0) * t0;
					const xB = sp.l0 + (sp.r0 - sp.l0) * t1;
					if (endzoneBlocksView(dir, xA, xB)) continue;
					if (s > 0) {
						const x0 = sp.l0 + (sp.r0 - sp.l0) * t0;
						const x1 = sp.l1 + (sp.r1 - sp.l1) * t0;
						const a = project(x0, deck.y0, deck.h0), b = project(x1, deck.y1, deck.h1);
						const aisle = clipSegNear(a, b);
						if (aisle) {
							ctx.strokeStyle = "rgba(210,220,225,0.24)";
							ctx.lineWidth = 1.7;
							ctx.beginPath();
							ctx.moveTo(aisle[0].sx, aisle[0].sy);
							ctx.lineTo(aisle[1].sx, aisle[1].sy);
							ctx.stroke();
						}
					}
					for (let row = 0; row < deck.rows; row++) {
						const rt = (row + 0.45) / deck.rows;
						const wy = deck.y0 + (deck.y1 - deck.y0) * rt;
						const hh = deck.h0 + (deck.h1 - deck.h0) * rt + 0.05;
						const n = 20 + (s % 2);
						for (let k = 0; k < n; k++) {
							const xt = t0 + (t1 - t0) * ((k + 0.38 + rng() * 0.24) / n);
							const wx2 = (sp.l0 + (sp.r0 - sp.l0) * xt) * (1 - rt) + (sp.l1 + (sp.r1 - sp.l1) * xt) * rt + (rng() - 0.5) * 0.08;
							drawCrowdFan(wx2, wy, hh, rng, 0);
						}
					}
				}
			}
		}
		if (lastBase) {
			fillWorldPoly([
				project(cutL, lastBase.y1, lastBase.h1),
				project(cutR, lastBase.y1, lastBase.h1),
				project(cutR, lastBase.y1, lastBase.h1 + 0.55),
				project(cutL, lastBase.y1, lastBase.h1 + 0.55)
			], "#2a3338");
		}
	}
	function drawCrowdDeck(y0, y1, pad0, pad1, fill, seed) {
		const fl = fieldLeft(), fr = fieldRight();
		const a = project(fl - pad0, y0), b = project(fr + pad0, y0);
		const c = project(fr + pad1, y1), d = project(fl - pad1, y1);
		fillWorldPoly([a, b, c, d], fill, "rgba(8,12,14,0.4)");
		const rng = mulberry32(hashSeed("crowd" + seed + String(y0)));
		const sections = 7;
		for (let s = 0; s < sections; s++) {
			const t0 = s / sections, t1 = (s + 1) / sections;
			if (s > 0) {
				const x0 = fl - pad0 + (fr - fl + pad0 * 2) * t0;
				const x1 = fl - pad1 + (fr - fl + pad1 * 2) * t0;
				const p0 = project(x0, y0), p1 = project(x1, y1);
				ctx.strokeStyle = "rgba(210,220,225,0.22)";
				ctx.lineWidth = 1.8;
				ctx.beginPath();
				ctx.moveTo(p0.sx, p0.sy);
				ctx.lineTo(p1.sx, p1.sy);
				ctx.stroke();
			}
			const rows = 5;
			for (let row = 0; row < rows; row++) {
				const rt = (row + 0.5) / rows;
				const y = y0 + (y1 - y0) * rt;
				const pad = pad0 + (pad1 - pad0) * rt;
				const n = 8 + (s % 2);
				for (let k = 0; k < n; k++) {
					const xt = t0 + (t1 - t0) * ((k + 0.35 + rng() * 0.3) / n);
					const wx = fl - pad + (fr - fl + pad * 2) * xt + (rng() - 0.5) * 0.28;
					const wy = y + (rng() - 0.5) * ((y1 - y0) * 0.1);
					drawCrowdFan(wx, wy, 0, rng, 0);
				}
			}
		}
	}
	function pressBoxHeight() {
		return 4.75;
	}
	function camZoomMin() {
		return 0.28;
	}
	function camZoomMax() {
		return 6.6;
	}
	function sidelineDeckSpec(side) {
		const sbTop = scoreboardGeom(1).hTop;
		const wantTop = sbTop - pressBoxHeight() * 0.5;
		const pressSide = side < 0;
		const walkH = 0.1;
		const startH = 1.18;
		const gap = 0.2;
		const bannerH = 0.92;
		const nDecks = 7;
		const banners = pressSide ? 1 : 2;
		const fixed = startH + banners * (bannerH + gap + 0.1) + (nDecks - 1) * walkH;
		const RISE = Math.max(1.15, (wantTop - fixed) / nDecks);
		const RUN = RISE / Math.tan(36 * Math.PI / 180);
		const WALK = 0.28;
		const fills = ["#2f3940", "#2a3338", "#252e32", "#21292e", "#1c2428", "#181f23", "#141b1f"];
		const walls = ["#6a787f", "#5e6c74", "#546168", "#4a575e", "#414c53", "#3a444a", "#333c42"];
		const decks = [];
		let x = 1.22, h = startH;
		function pushDecks(n, band, fillOff) {
			for (let i = 0; i < n; i++) {
				decks.push({
					a: x,
					b: x + RUN,
					h0: h,
					h1: h + RISE,
					fill: fills[Math.min(fillOff + i, fills.length - 1)],
					wall: walls[Math.min(fillOff + i, walls.length - 1)],
					rows: band === "low" ? 8 : 10,
					band
				});
				x += RUN + WALK;
				h += RISE + walkH;
			}
		}
		const overHang = 1.05;
		const thick = 0.3;
		function makeBanner() {
			const b = {
				x0: x - overHang,
				x1: x - overHang + thick,
				h0: h + gap,
				h1: h + gap + bannerH
			};
			x = b.x0;
			h = b.h1 + 0.1;
			return b;
		}
		if (pressSide) {
			pushDecks(3, "low", 0);
			decks.banner = makeBanner();
			pushDecks(4, "up", 3);
			decks.bannerHi = null;
		} else {
			pushDecks(2, "low", 0);
			decks.banner = makeBanner();
			pushDecks(2, "up", 2);
			decks.bannerHi = makeBanner();
			pushDecks(3, "up", 4);
		}
		return decks;
	}
	function worldInFront(x, y, h) {
		const p = project(x, y, h || 0);
		if (p.cz != null) return p.cz > 2.1;
		return !p.behind;
	}
	function sectionBlocksView(side, yA, yB) {
		const cw = getCamWorld();
		if (!cw) return false;
		const fl = fieldLeft(), fr = fieldRight();
		const edge = side < 0 ? fl : fr;
		const outside = side < 0 ? cw.camX < edge + 0.4 : cw.camX > edge - 0.4;
		const lookingIn = side < 0 ? cw.fx > cw.camX + 0.35 : cw.fx < cw.camX - 0.35;
		return !!(outside && lookingIn);
	}
	function endzoneBlocksView(dir, xA, xB) {
		const cw = getCamWorld();
		if (!cw) return false;
		const sb = scoreboardGeom(dir);
		const behind = dir > 0 ? (cw.camY > sb.yInner && cw.fy < cw.camY) : (cw.camY < sb.yInner && cw.fy > cw.camY);
		if (!behind) return false;
		const lo = Math.min(cw.camX, cw.fx) - 12;
		const hi = Math.max(cw.camX, cw.fx) + 12;
		return !(Math.max(xA, xB) < lo || Math.min(xA, xB) > hi);
	}
	function scoreboardBlocksView(dir) {
		const cw = getCamWorld();
		if (!cw) return false;
		const sb = scoreboardGeom(dir);
		if (dir > 0) return cw.camY > sb.yInner - 1.5 && cw.fy < cw.camY - 1;
		return cw.camY < sb.yInner + 1.5 && cw.fy > cw.camY + 1;
	}
	function drawSidelineCrowd(side, seed) {
		const fl = fieldLeft(), fr = fieldRight();
		const edge = side < 0 ? fl : fr;
		const sign = side < 0 ? -1 : 1;
		const yNear = 0, yFar = 100;
		const decks = sidelineDeckSpec(side);
		const banner = decks.banner;
		const bannerHi = decks.bannerHi;
		const rng = mulberry32(hashSeed("sidecrowd" + seed + String(side)));
		const topDeck = decks[decks.length - 1];
		const nSec = 10;
		const cw = getCamWorld();
		const camY = cw ? cw.camY : lookY;
		const order = [];
		for (let s = 0; s < nSec; s++) order.push(s);
		order.sort((a, b) => {
			const ya = yNear + (yFar - yNear) * ((a + 0.5) / nSec);
			const yb = yNear + (yFar - yNear) * ((b + 0.5) / nSec);
			return Math.abs(yb - camY) - Math.abs(ya - camY);
		});
		for (let oi = 0; oi < order.length; oi++) {
			const sec = order[oi];
			const ya = yNear + (yFar - yNear) * (sec / nSec);
			const yb = yNear + (yFar - yNear) * ((sec + 1) / nSec);
			if (sectionBlocksView(side, ya, yb)) continue;
			const midX = edge + sign * ((topDeck.a + topDeck.b) * 0.5);
			if (!worldInFront(midX, (ya + yb) * 0.5, topDeck.h0)) continue;
			const xo = edge + sign * topDeck.b;
			if (worldInFront(xo, (ya + yb) * 0.5, topDeck.h1)) {
				fillWorldPoly([
					project(xo, ya, topDeck.h0),
					project(xo, ya, topDeck.h1 + 0.2),
					project(xo, yb, topDeck.h1 + 0.2),
					project(xo, yb, topDeck.h0)
				], "#1a2226", "rgba(8,12,14,0.35)", 1, true);
			}
			for (let di = decks.length - 1; di >= 0; di--) {
				const deck = decks[di];
				const x0 = edge + sign * deck.a;
				const x1 = edge + sign * deck.b;
				fillWorldPoly([
					project(x0, ya, deck.h0),
					project(x1, ya, deck.h1),
					project(x1, yb, deck.h1),
					project(x0, yb, deck.h0)
				], deck.fill, "rgba(8,12,14,0.45)", 1, true);
				const lip = deck.h0 - 0.22;
				fillWorldPoly([
					project(x0, ya, lip),
					project(x0, ya, deck.h0),
					project(x0, yb, deck.h0),
					project(x0, yb, lip)
				], deck.wall, "rgba(8,12,14,0.35)", 1, true);
				const railH = deck.h0 + 0.32;
				const railA = project(x0, ya, railH), railB = project(x0, yb, railH);
				if (!railA.behind && !railB.behind && (railA.cz == null || (railA.cz > 1.6 && railB.cz > 1.6))) {
					ctx.strokeStyle = "rgba(210,220,225,0.32)";
					ctx.lineWidth = 1.5;
					ctx.beginPath();
					ctx.moveTo(railA.sx, railA.sy);
					ctx.lineTo(railB.sx, railB.sy);
					ctx.stroke();
				}
				if (sec > 0) {
					const pa = project(x0, ya, deck.h0), pb = project(x1, ya, deck.h1);
					if (!pa.behind && !pb.behind && (pa.cz == null || (pa.cz > 1.6 && pb.cz > 1.6))) {
						ctx.strokeStyle = "rgba(210,220,225,0.2)";
						ctx.lineWidth = 1.5;
						ctx.beginPath();
						ctx.moveTo(pa.sx, pa.sy);
						ctx.lineTo(pb.sx, pb.sy);
						ctx.stroke();
					}
				}
				for (let row = 0; row < deck.rows; row++) {
					const rt = (row + 0.45) / deck.rows;
					const wx = x0 + (x1 - x0) * rt + (rng() - 0.5) * 0.05;
					const hh = deck.h0 + (deck.h1 - deck.h0) * rt + 0.05;
					const n = 20;
					for (let k = 0; k < n; k++) {
						const wy = ya + (yb - ya) * ((k + 0.28 + rng() * 0.44) / n);
						if (!worldInFront(wx, wy, hh)) continue;
						drawCrowdFan(wx, wy, hh, rng, side);
					}
				}
			}
			if (banner) drawSidelineBannerSpan(edge, sign, banner, ya, yb);
			if (bannerHi) {
				if (side > 0) drawSidelineBannerSpan(edge, sign, bannerHi, ya, yb);
				else drawSidelineBannerSpan(edge, sign, bannerHi, ya, yb, mixHex("#2a3338", "#0a0e10", 0.12));
			}
			if (sec === 0) drawSidelineEndCap(edge, sign, ya, decks, banner, bannerHi);
			if (sec === nSec - 1) drawSidelineEndCap(edge, sign, yb, decks, banner, bannerHi);
		}
		if (banner) drawSidelineBanner(edge, sign, banner);
		if (bannerHi && side > 0) drawSidelineBanner(edge, sign, bannerHi);
		if (side > 0 && !sectionBlocksView(1, 38, 62)) drawPressBox(edge, sign, topDeck);
	}
	function drawSidelineEndCap(edge, sign, y, decks, banner, bannerHi) {
		if (!decks || !decks.length) return;
		if (!worldInFront(edge + sign * 3, y, 4)) return;
		function capBand(list, col) {
			if (!list.length) return;
			const last = list[list.length - 1];
			const first = list[0];
			const pts = [];
			pts.push(project(edge + sign * first.a, y, first.h0 - 0.22));
			for (let i = 0; i < list.length; i++) {
				pts.push(project(edge + sign * list[i].a, y, list[i].h0));
				pts.push(project(edge + sign * list[i].b, y, list[i].h1));
			}
			pts.push(project(edge + sign * last.b, y, last.h1 - 0.28));
			pts.push(project(edge + sign * last.a, y, last.h0 - 0.22));
			fillWorldPoly(pts, col, null, 1, true);
		}
		function capBanner(bn, col) {
			if (!bn) return;
			const x0 = edge + sign * bn.x0;
			const x1 = edge + sign * bn.x1;
			fillWorldPoly([
				project(x0, y, bn.h0),
				project(x1, y, bn.h0),
				project(x1, y, bn.h1),
				project(x0, y, bn.h1)
			], col, null, 1, true);
		}
		const low = decks.filter((d) => d.band === "low");
		const up = decks.filter((d) => d.band === "up");
		const top = decks[decks.length - 1];
		capBand(low, mixHex(top.fill, "#0a0e10", 0.2));
		capBand(up, mixHex(top.fill, "#0a0e10", 0.16));
		const pri = getUni("off").jersey || "#fb4f14";
		capBanner(banner, mixHex(pri, "#0a0e10", 0.35));
		if (bannerHi) capBanner(bannerHi, sideRibbonCol(sign, pri));
	}
	function sideRibbonCol(sign, pri) {
		if (sign > 0) return mixHex(pri || "#fb4f14", "#0a0e10", 0.28);
		return "#252c30";
	}
	let ribbonCan = null;
	function paintRibbonPanel() {
		if (!ribbonCan) {
			ribbonCan = document.createElement("canvas");
			ribbonCan.width = 320;
			ribbonCan.height = 84;
		}
		const c = ribbonCan.getContext("2d");
		const w = ribbonCan.width, h = ribbonCan.height;
		const off = getUni("off"), defu = getUni("def");
		const pri = off.ribbon || off.endPrimary || off.jersey || "#fb4f14";
		c.setTransform(1, 0, 0, 1, 0, 0);
		c.fillStyle = pri;
		c.fillRect(0, 0, w, h);
		c.fillStyle = mixHex(pri, "#000000", 0.28);
		c.fillRect(0, 0, w, 6);
		c.fillRect(0, h - 6, w, 6);
		c.fillStyle = "#0c1014";
		c.fillRect(10, 12, 58, 60);
		c.fillStyle = pri;
		c.fillRect(13, 15, 25, 54);
		c.fillStyle = defu.jersey || "#ffffff";
		c.fillRect(38, 15, 25, 54);
		c.strokeStyle = "rgba(255,255,255,0.78)";
		c.lineWidth = 1.4;
		c.strokeRect(13, 15, 50, 54);
		c.fillStyle = "rgba(0,0,0,0.32)";
		c.fillRect(78, 12, 230, 60);
		c.fillStyle = "rgba(255,255,255,0.72)";
		c.font = "11px IBM Plex Sans, sans-serif";
		c.textAlign = "left";
		c.textBaseline = "middle";
		c.fillText("TIME", 90, 28);
		c.fillText("SCORE", 190, 28);
		c.fillStyle = "#ffffff";
		c.font = "bold 26px Barlow Condensed, sans-serif";
		c.fillText(boardClockText(), 90, 54);
		c.fillText(String(score), 190, 54);
		return ribbonCan;
	}
	function drawSidelineBannerSpan(edge, sign, banner, ya, yb, fillCol) {
		const off = getUni("off");
		const col = fillCol || off.ribbon || off.endPrimary || off.jersey || "#fb4f14";
		const trim = mixHex(col, "#000000", 0.3);
		const shade = mixHex(col, "#0a0e10", 0.22);
		const x0 = edge + sign * banner.x0;
		const x1 = edge + sign * banner.x1;
		const h0 = banner.h0, h1 = banner.h1;
		const midY = (ya + yb) * 0.5;
		const probe = project(x0, midY, (h0 + h1) * 0.5);
		if (probe.behind) return;
		if (sectionBlocksView(sign < 0 ? -1 : 1, ya, yb)) return;
		fillWorldPoly([
			project(x0, ya, h0),
			project(x0, ya, h1),
			project(x0, yb, h1),
			project(x0, yb, h0)
		], col, null, 1, false);
		fillWorldPoly([
			project(x0, ya, h1),
			project(x1, ya, h1),
			project(x1, yb, h1),
			project(x0, yb, h1)
		], trim, null, 1, false);
		fillWorldPoly([
			project(x1, ya, h0),
			project(x1, ya, h1),
			project(x1, yb, h1),
			project(x1, yb, h0)
		], shade, null, 1, false);
		fillWorldPoly([
			project(x0, ya, h0),
			project(x1, ya, h0),
			project(x1, yb, h0),
			project(x0, yb, h0)
		], mixHex(col, "#000000", 0.45), null, 1, false);
	}
	function drawSidelineBanner(edge, sign, banner) {
		const x0 = edge + sign * banner.x0;
		const h0 = banner.h0, h1 = banner.h1;
		const n = 10;
		const side = sign < 0 ? -1 : 1;
		for (let i = 0; i < n; i++) {
			const ya = (100 * i) / n, yb = (100 * (i + 1)) / n;
			if (sectionBlocksView(side, ya, yb)) continue;
			drawSidelineBannerSpan(edge, sign, banner, ya, yb);
		}
		const img = paintRibbonPanel();
		const panels = [
			{ y0: 4, y1: 16 },
			{ y0: 84, y1: 96 }
		];
		for (const p of panels) {
			if (sectionBlocksView(side, p.y0, p.y1)) continue;
			const mid = project(x0, (p.y0 + p.y1) * 0.5, (h0 + h1) * 0.5);
			if (mid.behind) continue;
			const yA = sign > 0 ? p.y1 : p.y0;
			const yB = sign > 0 ? p.y0 : p.y1;
			drawImageWorld3(img, [
				{ x: x0, y: yA, h: h1 - 0.08 },
				{ x: x0, y: yB, h: h1 - 0.08 },
				{ x: x0, y: yB, h: h0 + 0.08 },
				{ x: x0, y: yA, h: h0 + 0.08 }
			], 8, 4);
		}
	}
	function drawPressBox(edge, sign, topDeck) {
		const x0 = edge + sign * (topDeck.a - 0.15);
		const x1 = edge + sign * (topDeck.b + 0.55);
		const y0 = 38, y1 = 62;
		const h0 = topDeck.h1;
		const h1 = topDeck.h1 + pressBoxHeight();
		fillWorldPoly([
			project(x0, y0, h0),
			project(x1, y0, h0),
			project(x1, y0, h1),
			project(x0, y0, h1)
		], "#2a3238");
		fillWorldPoly([
			project(x0, y1, h0),
			project(x1, y1, h0),
			project(x1, y1, h1),
			project(x0, y1, h1)
		], "#232b30");
		fillWorldPoly([
			project(x0, y0, h1),
			project(x1, y0, h1),
			project(x1, y1, h1),
			project(x0, y1, h1)
		], "#3a444c", "rgba(200,210,215,0.25)");
		fillWorldPoly([
			project(x0, y0, h0),
			project(x0, y0, h1),
			project(x0, y1, h1),
			project(x0, y1, h0)
		], "#4a555c");
		for (let i = 0; i < 6; i++) {
			const wy0 = y0 + 1.2 + i * 3.6;
			const wy1 = wy0 + 2.4;
			const hx0 = h0 + 0.7, hx1 = h1 - 0.55;
			fillWorldPoly([
				project(x0 + sign * 0.08, wy0, hx0),
				project(x0 + sign * 0.08, wy1, hx0),
				project(x0 + sign * 0.08, wy1, hx1),
				project(x0 + sign * 0.08, wy0, hx1)
			], "#9ec4d8");
		}
		const lab = project((x0 + x1) / 2, (y0 + y1) / 2, h1 + 0.15);
		ctx.fillStyle = "rgba(232,236,230,0.9)";
		ctx.font = "bold " + Math.max(8, 10 * (lab.sc || 1)) + "px Barlow Condensed, sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText("PRESS", lab.sx, lab.sy);
	}
	function showReplayLights() {
		return true;
	}
	function drawLightPost(wx, wy, hBase) {
		const poleH = 5.4;
		const a = project(wx, wy, hBase);
		const b = project(wx, wy, hBase + poleH);
		if ((a.behind && b.behind) || (a.cz != null && a.cz < 1.2 && b.cz != null && b.cz < 1.2)) return;
		const pole = clipSegNear(a, b);
		if (!pole) return;
		ctx.strokeStyle = "#c8d0d4";
		ctx.lineWidth = 2.15;
		ctx.beginPath();
		ctx.moveTo(pole[0].sx, pole[0].sy);
		ctx.lineTo(pole[1].sx, pole[1].sy);
		ctx.stroke();
		const sc = Math.max(0.65, b.sc || 1);
		const cell = 4.6 * sc;
		const panelW = cell * 3.15, panelH = cell * 2.15;
		const px = b.sx - panelW / 2, py = b.sy - panelH - 2 * sc;
		ctx.fillStyle = "#2c3438";
		ctx.fillRect(px - 1.5 * sc, py - 1.5 * sc, panelW + 3 * sc, panelH + 3 * sc);
		ctx.strokeStyle = "#8b9698";
		ctx.lineWidth = 1;
		ctx.strokeRect(px - 1.5 * sc, py - 1.5 * sc, panelW + 3 * sc, panelH + 3 * sc);
		for (let row = 0; row < 2; row++) {
			for (let col = 0; col < 3; col++) {
				const lx = px + (col + 0.5) * cell;
				const ly = py + (row + 0.5) * (panelH / 2);
				ctx.beginPath();
				ctx.arc(lx, ly, 1.65 * sc, 0, Math.PI * 2);
				ctx.fillStyle = "#f3e6a4";
				ctx.fill();
				ctx.strokeStyle = "#d2c070";
				ctx.lineWidth = 0.7;
				ctx.stroke();
			}
		}
	}
	function strokeWorld3(x0, y0, h0, x1, y1, h1, color, width) {
		const seg = clipSegNear(project(x0, y0, h0), project(x1, y1, h1));
		if (!seg) return;
		ctx.strokeStyle = color;
		ctx.lineWidth = width;
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		ctx.beginPath();
		ctx.moveTo(seg[0].sx, seg[0].sy);
		ctx.lineTo(seg[1].sx, seg[1].sy);
		ctx.stroke();
	}
	function drawGoalPostAt(endY) {
		const fl = fieldLeft(), fr = fieldRight();
		const midX = (fl + fr) / 2;
		const postHalf = postGapHalf();
		const crossH = 3.4;
		const upH = 10.2;
		const behind = endY > 50 ? 1.15 : -1.15;
		const baseY = endY + behind;
		function tube(x0, y0, h0, x1, y1, h1, w) {
			strokeWorld3(x0, y0, h0, x1, y1, h1, "#9a6d08", w + 2.1);
			strokeWorld3(x0, y0, h0, x1, y1, h1, "#f5d445", w);
		}
		tube(midX, baseY, 0, midX, baseY, crossH, 3.6);
		tube(midX, baseY, crossH, midX, endY, crossH, 3.3);
		tube(midX - postHalf, endY, crossH, midX + postHalf, endY, crossH, 3.5);
		tube(midX - postHalf, endY, crossH, midX - postHalf, endY, crossH + upH, 3.2);
		tube(midX + postHalf, endY, crossH, midX + postHalf, endY, crossH + upH, 3.2);
		const capL = project(midX - postHalf, endY, crossH + upH);
		const capR = project(midX + postHalf, endY, crossH + upH);
		ctx.fillStyle = "#f5d445";
		ctx.beginPath();
		ctx.arc(capL.sx, capL.sy, 2.4, 0, Math.PI * 2);
		ctx.fill();
		ctx.beginPath();
		ctx.arc(capR.sx, capR.sy, 2.4, 0, Math.PI * 2);
		ctx.fill();
	}
	function drawGoalPosts() {
		drawGoalPostAt(Field.northBack);
		drawGoalPostAt(Field.southBack);
	}
	function drawSidelineLights() {
		if (!showReplayLights()) return;
		const fl = fieldLeft(), fr = fieldRight();
		const westDecks = sidelineDeckSpec(-1);
		const eastDecks = sidelineDeckSpec(1);
		const westTop = westDecks[westDecks.length - 1];
		const eastTop = eastDecks[eastDecks.length - 1];
		const hW = westTop.h1 + 0.2;
		const hE = eastTop.h1 + 0.2;
		const yards = [Field.southGoal, Field.length * 0.25, Field.length * 0.75, Field.northGoal];
		const xW = fl - (westTop.a + (westTop.b - westTop.a) * 0.55);
		const xE = fr + (eastTop.a + (eastTop.b - eastTop.a) * 0.55);
		const pressH = hE + pressBoxHeight();
		yards.forEach((yy) => {
			drawLightPost(xW, yy, hW);
			const eastH = (yy >= 38 && yy <= 62) ? pressH : hE;
			drawLightPost(xE, yy, eastH);
		});
		drawLightPost(xW, Field.midfield, hW);
	}
	function drawVideoBoard(x, y, w, h) {
		ctx.fillStyle = "#05080a";
		ctx.fillRect(x, y, w, h);
		ctx.strokeStyle = "#2a3d32";
		ctx.lineWidth = 1.1;
		ctx.strokeRect(x, y, w, h);
		if (jumboCan) {
			ctx.save();
			ctx.beginPath();
			ctx.rect(x + 2, y + 2, w - 4, h - 4);
			ctx.clip();
			ctx.imageSmoothingEnabled = true;
			ctx.drawImage(jumboCan, x + 2, y + 2, w - 4, h - 4);
			ctx.restore();
		} else {
			ctx.fillStyle = "#0e1a14";
			ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
		}
		ctx.strokeStyle = "rgba(255,255,255,0.12)";
		ctx.lineWidth = 0.8;
		ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
	}
	function jumboFocus() {
		if (scoreSeq && scoreSeq.player) return scoreSeq.player;
		if (fumbleSeq && fumbleSeq.phase === "return" && fumbleSeq.defender) return fumbleSeq.defender;
		if (rb) return rb;
		return qb || null;
	}
	function updateJumboFeed() {
		if (jumboBusy) return;
		if (!jumboCan) {
			jumboCan = document.createElement("canvas");
			jumboCan.width = 320;
			jumboCan.height = 160;
		}
		const j = jumboCan;
		const jctx = j.getContext("2d");
		if (!jctx) return;
		const w = j.width, h = j.height;
		const focus = jumboFocus();
		const fx = focus ? focus.x : FIELD_WIDTH / 2;
		const fy = focus ? focus.y : (playStartYard || 50);
		const yardsW = 8.0;
		const px = w / yardsW;
		jumboBusy = true;
		const prev = ctx;
		ctx = jctx;
		viewHook = (ax, ay, hh) => {
			const dx = ax - fx, dy = ay - fy;
			return {
				sx: w * 0.5 + dx * px,
				sy: h * 0.6 - dy * px * 0.64 - (hh || 0) * px * 0.4,
				sc: px / Math.max(1, yardToPx())
			};
		};
		try {
			jctx.setTransform(1, 0, 0, 1, 0, 0);
			jctx.fillStyle = "#082010";
			jctx.fillRect(0, 0, w, h);
			const fl = fieldLeft(), fr = fieldRight();
			const uni = getUni("off");
			const x0 = fx - 4.6, x1 = fx + 4.6;
			const yA = fy - 3.4, yB = fy + 4.6;
			fillTurfRange(yA, yB);
			if (yA < Field.southGoal) drawMountainEndzoneWorld(Field.southGoal, Field.southBack, uni.endPrimary, uni.endSecondary);
			if (yB > Field.northGoal) drawMountainEndzoneWorld(Field.northGoal, Field.northBack, uni.endPrimary, uni.endSecondary);
			drawMidfieldLogo();
			const lw = Math.max(2.2, px * 0.055);
			for (let yd = Math.ceil((yA - 1) / 5) * 5; yd <= yB + 1; yd += 5) {
				if (yd < Field.southBack || yd > Field.northBack) continue;
				const ten = yd % 10 === 0;
				strokeWorldLine(fl, yd, fr, yd, ten ? "rgba(236,240,230,0.62)" : "rgba(236,240,230,0.34)", ten ? lw * 1.2 : lw * 0.85);
			}
			strokeWorldLine(fl, Field.southBack, fl, Field.northBack, "rgba(255,255,255,0.5)", lw * 1.35);
			strokeWorldLine(fr, Field.southBack, fr, Field.northBack, "rgba(255,255,255,0.5)", lw * 1.35);
			strokeWorldLine(fl, 20, fl, 80, "rgba(236,240,230,0.95)", lw * 2.5);
			strokeWorldLine(fr, 20, fr, 80, "rgba(236,240,230,0.95)", lw * 2.5);
			const innerTick = postGapHalf() * 0.16;
			const midHash = (fl + fr) / 2;
			const hashXs = [fl, hashLeft(), hashRight(), fr];
			for (let decade = 0; decade < 100; decade += 10) {
				for (const off of [1, 2, 3, 4, 6, 7, 8, 9]) {
					const y = decade + off;
					if (y < yA - 0.4 || y > yB + 0.4) continue;
					for (const hx of hashXs) {
						if (hx < x0 - 1.2 || hx > x1 + 1.2) continue;
						const dx = hx === fl ? 0.85 : hx === fr ? -0.85 : (hx < midHash ? -innerTick : innerTick);
						strokeWorldLine(hx, y, hx + dx, y, "rgba(236,240,230,0.55)", lw * 0.9);
					}
				}
			}
			function jumboPylon(yardY, side) {
				const pxon = side === "L" ? fl : fr;
				if (Math.abs(pxon - fx) > 5.5 || Math.abs(yardY - fy) > 5.5) return;
				const base = project(pxon, yardY, 0);
				const top = project(pxon, yardY, 1.35);
				const sc = Math.max(3.2, 0.22 * px);
				ctx.fillStyle = "#f97316";
				ctx.fillRect(base.sx - sc * 0.32, top.sy, sc * 0.64, base.sy - top.sy);
				ctx.fillStyle = "#fdba74";
				ctx.fillRect(base.sx - sc * 0.32, top.sy - sc * 0.28, sc * 0.64, sc * 0.28);
			}
			Field.pylonYards().forEach((yy) => { jumboPylon(yy, "L"); jumboPylon(yy, "R"); });
			const pack = [];
			if (qb && qb.active) pack.push(qb);
			(blockers || []).forEach((p) => { if (p && p.active) pack.push(p); });
			(defenders || []).forEach((p) => { if (p && p.active) pack.push(p); });
			if (rb && rb.active) pack.push(rb);
			pack.sort((a, b) => b.y - a.y);
			pack.forEach((p) => {
				if (Math.abs(p.x - fx) > 5.2 || Math.abs(p.y - fy) > 4.6) return;
				drawPlayerRings(p, !!(focus && p === focus));
			});
			pack.forEach((p) => {
				if (Math.abs(p.x - fx) > 5.2 || Math.abs(p.y - fy) > 4.6) return;
				drawPlayer(p, !!(focus && p === focus));
			});
		} finally {
			viewHook = null;
			ctx = prev;
			jumboBusy = false;
		}
	}
	function drawEeLogoAd(x, y, w, h) {
		ctx.fillStyle = "#fef8ec";
		ctx.fillRect(x, y, w, h);
		ctx.strokeStyle = "#1b3a6b";
		ctx.lineWidth = 1.2;
		ctx.strokeRect(x, y, w, h);
		const img = homeLogoReady();
		if (!img) {
			ctx.fillStyle = "#fb4f14";
			ctx.font = "bold " + Math.max(8, h * 0.28) + "px Barlow Condensed, sans-serif";
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText("EE", x + w / 2, y + h / 2);
			return;
		}
		const pad = Math.max(1.5, Math.min(w, h) * 0.07);
		const boxW = w - pad * 2, boxH = h - pad * 2;
		const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
		const s = Math.min(boxW / iw, boxH / ih);
		const dw = iw * s, dh = ih * s;
		ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
	}
	function drawDrinkWaterAd(x, y, w, h) {
		ctx.save();
		ctx.beginPath();
		ctx.rect(x, y, w, h);
		ctx.clip();
		ctx.fillStyle = "#d7eef7";
		ctx.fillRect(x, y, w, h);
		ctx.strokeStyle = "#6aa3b8";
		ctx.lineWidth = 1.1;
		ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
		ctx.fillStyle = "#14556c";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		const maxW = w * 0.86;
		function fitCursive(text, start) {
			let fs = start;
			for (let i = 0; i < 12; i++) {
				ctx.font = "italic " + fs + "px 'Segoe Script', 'Brush Script MT', 'Apple Chancery', cursive";
				if (ctx.measureText(text).width <= maxW) break;
				fs *= 0.88;
			}
			return fs;
		}
		const fs1 = fitCursive("Drink More", Math.min(h * 0.32, w * 0.16));
		ctx.fillText("Drink More", x + w / 2, y + h * 0.38);
		const fs2 = fitCursive("Water!", Math.min(h * 0.36, w * 0.2, fs1 * 1.12));
		ctx.fillText("Water!", x + w / 2, y + h * 0.7);
		ctx.restore();
	}
	function boardClockText() {
		return formatClock(Math.max(0, clock));
	}
	function drawBowlScoreboard(dir) {
		if (scoreboardBlocksView(dir)) return;
		if (!lookingTowardY(dir > 0 ? 120 : -20, 2)) return;
		const sb = scoreboardGeom(dir);
		const { x0, x1, yInner, yOuter, yBInner, yBOuter, hBase, hTop, bwYd, bhYd, tilt } = sb;
		const TL = project(x0, yOuter, hTop);
		const TR = project(x1, yOuter, hTop);
		const BL = project(x0, yInner, hBase);
		const BR = project(x1, yInner, hBase);
		const vis = screenBoxOf([TL, TR, BL, BR], 320);
		if ([TL, TR, BL, BR].every((p) => !p || p.behind)) return;
		if (vis.maxX < -320 || vis.minX > canvas.width + 320 || vis.maxY < -320 || vis.minY > canvas.height + 320) return;
		fillWorldPoly([
			project(x0, yBInner, hBase), project(x1, yBInner, hBase),
			project(x1, yBOuter, hTop), project(x0, yBOuter, hTop)
		], "#070b0d");
		fillWorldPoly([
			project(x0, yOuter, hTop), project(x1, yOuter, hTop),
			project(x1, yBOuter, hTop), project(x0, yBOuter, hTop)
		], "#1c252c");
		fillWorldPoly([
			project(x0, yInner, hBase), project(x0, yOuter, hTop),
			project(x0, yBOuter, hTop), project(x0, yBInner, hBase)
		], "#10161a");
		fillWorldPoly([
			project(x1, yInner, hBase), project(x1, yOuter, hTop),
			project(x1, yBOuter, hTop), project(x1, yBInner, hBase)
		], "#161d22");
		fillWorldPoly([TL, TR, BR, BL], "#0d1216", "#fb4f14");
		const faceH = Math.max(0.8, Math.hypot(tilt + 0.18, bhYd));
		const locH = 160;
		const locW = Math.round(clamp(locH * (bwYd / faceH), 300, 760));
		let sbFaceCan = dir > 0 ? sbFaceCanN : sbFaceCanS;
		if (!sbFaceCan || sbFaceCan.width !== locW) {
			sbFaceCan = document.createElement("canvas");
			sbFaceCan.width = locW;
			sbFaceCan.height = locH;
			if (dir > 0) sbFaceCanN = sbFaceCan;
			else sbFaceCanS = sbFaceCan;
		}
		const face = sbFaceCan;
		const prev = ctx;
		ctx = face.getContext("2d");
		const bw = locW, bh = locH;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.fillStyle = "#0d1216";
		ctx.fillRect(0, 0, bw, bh);
		ctx.strokeStyle = "#fb4f14";
		ctx.lineWidth = 2.3;
		ctx.strokeRect(0, 0, bw, bh);
		ctx.fillStyle = "#fb4f14";
		ctx.font = "bold " + Math.max(12, bw * 0.032) + "px Barlow Condensed, sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText("FOOTBALL GROUND ATTACK LAB", bw * 0.39, bh * 0.11);
		const adX = bw * 0.78, adW = bw * 0.2;
		drawEeLogoAd(adX, bh * 0.05, adW, bh * 0.28);
		drawDrinkWaterAd(adX, bh * 0.36, adW, bh * 0.26);
		ctx.fillStyle = "#1a2228";
		ctx.fillRect(7, bh * 0.2, bw * 0.72, bh * 0.3);
		ctx.fillStyle = "#8b9688";
		ctx.font = Math.max(9, bw * 0.022) + "px IBM Plex Sans, sans-serif";
		ctx.textAlign = "left";
		ctx.fillText("GAME TIME", 16, bh * 0.3);
		ctx.fillText("SCORE", bw * 0.4, bh * 0.3);
		ctx.fillStyle = "#e8ece6";
		ctx.font = "bold " + Math.max(18, bw * 0.05) + "px Barlow Condensed, sans-serif";
		ctx.fillText(boardClockText(), 16, bh * 0.43);
		ctx.fillText(String(score), bw * 0.4, bh * 0.43);
		drawVideoBoard(7, bh * 0.54, bw * 0.72, bh * 0.4);
		ctx = prev;
		function faceArea(pTL, pTR, pBL) {
			const a = ctxXfPt(pTL), b = ctxXfPt(pTR), c = ctxXfPt(pBL);
			return (b.sx - a.sx) * (c.sy - a.sy) - (c.sx - a.sx) * (b.sy - a.sy);
		}
		const frontArea = faceArea(TL, TR, BL);
		const bTL = project(x0, yBOuter, hTop), bTR = project(x1, yBOuter, hTop);
		const bBL = project(x0, yBInner, hBase), bBR = project(x1, yBInner, hBase);
		const backArea = faceArea(bTR, bTL, bBR);
		let corners;
		if (Math.abs(frontArea) >= Math.abs(backArea) && Math.abs(frontArea) > 18) {
			corners = [
				{ x: x0, y: yOuter, h: hTop },
				{ x: x1, y: yOuter, h: hTop },
				{ x: x1, y: yInner, h: hBase },
				{ x: x0, y: yInner, h: hBase }
			];
			if (frontArea < 0) corners = [corners[1], corners[0], corners[3], corners[2]];
		} else if (Math.abs(backArea) > 18) {
			corners = [
				{ x: x1, y: yBOuter, h: hTop },
				{ x: x0, y: yBOuter, h: hTop },
				{ x: x0, y: yBInner, h: hBase },
				{ x: x1, y: yBInner, h: hBase }
			];
			if (backArea < 0) corners = [corners[1], corners[0], corners[3], corners[2]];
		} else {
			return;
		}
		const nu = bwYd > 36 ? 14 : 10;
		const nv = 8;
		drawImageWorld3(face, corners, nu, nv);
	}
	function drawVenueBehind() {
		const fl = fieldLeft(), fr = fieldRight();
		const midX = (fl + fr) / 2;
		ctx.save();
		function skyHill(yNear, yFar, ySign) {
			if (tdSkyColor()) return;
			const midY = (yNear + yFar) * 0.5;
			if (!lookingTowardY(midY, 6)) return;
			const cwHill = getCamWorld();
			if (cwHill && Math.abs(midY - cwHill.camY) < 10) return;
			const ridge = [
				[0, 16], [12, 34], [24, 20], [38, 46], [52, 22], [66, 52], [80, 26], [92, 40], [100, 18]
			];
			const pts = [project(fl - 26, yNear, 0)];
			ridge.forEach(([xf, hh]) => {
				pts.push(project(fl + (fr - fl) * (xf / 100), yFar, hh * 0.12));
			});
			pts.push(project(fr + 26, yNear, 0));
			const live = pts.filter((p) => p && !p.behind && (p.cz == null || p.cz > 3.2));
			if (live.length < 3) return;
			fillWorldPoly(live, "#1a2832");
		}
		skyHill(116, 122, 1);
		skyHill(-16, -22, -1);
		drawEndzoneStands(1, "n");
		drawEndzoneStands(-1, "s");
		drawSidelineCrowd(-1, "west");
		drawSidelineCrowd(1, "east");
		drawSidelineLights();
		drawBowlScoreboard(1);
		drawBowlScoreboard(-1);
		const off = getUni("off"), defu = getUni("def");
		const los = playStartYard || 50;
		const nBench = 7;
		const spacing = 2.4;
		const span = (nBench - 1) * spacing;
		let y0 = los - span / 2;
		if (y0 < 20) y0 = 20;
		if (y0 + span > 80) y0 = 80 - span;
		for (let i = 0; i < nBench; i++) {
			const wy = y0 + i * spacing;
			drawSidelineFigure(fl - 1.15, wy, off, i === 3 ? "coach" : "player", i);
			drawSidelineFigure(fr + 1.15, wy, defu, i === 2 ? "coach" : "player", i + 10);
		}
		drawSidelineFigure(midX - 4.2, los - 1.6, { jersey: "#111", pants: "#eee", helmet: "#f7f8fa" }, "ref", 21);
		drawSidelineFigure(midX + 6.5, los + 6.5, { jersey: "#111", pants: "#eee", helmet: "#f7f8fa" }, "ref", 22);
		drawSidelineFigure(fl + 3.2, los + 18, { jersey: "#111", pants: "#eee", helmet: "#f7f8fa" }, "ref", 23);
		ctx.restore();
	}
	function draw() {
		let savedLive = null;
		const film = replayFrame();
		if (film) {
			savedLive = {
				rb,
				qb,
				blockers,
				defenders,
				cameraY,
				camZoom,
				celebrateTimer,
				scoreSeq,
				fumbleSeq,
				activeMove,
				moveTimer,
				moveDur
			};
			rb = film.rb;
			qb = film.qb;
			blockers = film.blockers || [];
			defenders = film.defenders || [];
			cameraY = film.cameraY;
			camZoom = film.camZoom;
			scoreSeq = film.scoreSeq;
			fumbleSeq = film.fumbleSeq;
			celebrateTimer = film.celebrateTimer || 0;
			activeMove = film.activeMove || null;
			moveTimer = film.moveTimer || 0;
			moveDur = film.moveDur || 0;
			if (rb && !replayCursorFree) {
				applyLook(rb.x, rb.y);
			}
		}
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		drawSky();
		const splitOn = replayMode === "split" && pipReplay && pipReplay.frames.length && !fullReplay;
		if (splitOn) {
			const paneW = canvas.width * .58;
			const s = paneW / canvas.width;
			ctx.save();
			ctx.beginPath();
			ctx.rect(0, 0, paneW, canvas.height);
			ctx.clip();
			ctx.translate(0, (canvas.height - canvas.height * s) / 2);
			ctx.scale(s, s);
		}
		ctx.save();
		{
			let fx, fy;
			if (fullReplay || cameraMode === "free") {
				fx = lookX;
				fy = lookY;
			} else {
				let focus = scoreSeq?.player || fumbleSeq && fumbleSeq.phase === "return" && fumbleSeq.defender || rb;
				fx = focus ? focus.x : (camFocusX != null ? camFocusX : FIELD_WIDTH / 2);
				fy = focus ? focus.y : (camFocusY != null ? camFocusY : cameraY);
				if (ankleCam && ankleCam.runner && ankleCam.defender && !fullReplay) {
					fx = ankleCam.runner.x * .72 + ankleCam.defender.x * .28;
					fy = ankleCam.runner.y * .72 + ankleCam.defender.y * .28;
				}
				if (!fullReplay && focus) {
					const hit = nearestContactAhead(focus);
					if (hit) {
						fx = focus.x * .64 + hit.x * .36;
						fy = focus.y * .58 + hit.y * .42;
					}
				}
				fx += camOp.panX;
				fy += camOp.panY;
				if (!fullReplay && focus) {
					fx = clamp(fx, focus.x - 5.5, focus.x + 5.5);
					fy = clamp(fy, focus.y - 3.2, focus.y + 7);
				}
			}
			const z = project(fx, fy);
			const zoom = camZoom * (camOp.zoom || 1);
			const opOn = Math.abs(zoom - 1) > .02 || (!fullReplay && Math.abs(camOp.yaw) > .008) || Math.abs(camOp.panX) > .04 || Math.abs(camOp.panY) > .04 || (cameraMode === "free" && Math.abs((camOp.zoom || 1) - 1) > .01);
			if (opOn) {
				ctx.translate(z.sx, z.sy);
				if (camOp.yaw && !fullReplay && cameraMode !== "free") ctx.rotate(camOp.yaw);
				ctx.scale(zoom, zoom);
				ctx.translate(-z.sx, -z.sy);
			}
		}
		const uni = getUni("off");
		const fl = fieldLeft(), fr = fieldRight();
		updateJumboFeed();
		drawVenueBehind();
		function fillBand(y0, y1, color) {
			fillWorldQuad(fl, y0, fr, y1, color, 1);
		}
		function strokeWorld(x0, y0, x1, y1, color, width) {
			strokeWorldLine(x0, y0, x1, y1, color, width);
		}
		fillTurfRange(Field.southGoal, Field.northGoal);
		drawMountainEndzoneWorld(Field.southGoal, Field.southBack, uni.endPrimary, uni.endSecondary);
		drawMountainEndzoneWorld(Field.northGoal, Field.northBack, uni.endPrimary, uni.endSecondary);
		function strokePaint(x0, y0, x1, y1, paint, width) {
			strokeWorld(x0, y0, x1, y1, "rgba(12,20,16,0.75)", width + 1.4);
			strokeWorld(x0, y0, x1, y1, paint, width);
		}
		strokePaint(fl, Field.southBack, fr, Field.southBack, "rgba(236,240,230,0.55)", 2);
		strokePaint(fl, Field.northBack, fr, Field.northBack, "rgba(236,240,230,0.6)", 2);
		function paintYardNum(side, numY, label, isTen) {
			const img = yardNumCanvas(label, isTen);
			const tall = isTen ? 1.7 : 1.2;
			const wide = isTen ? 1.9 : 1.3;
			const h = 0.012;
			let corners;
			if (side < 0) {
				const xOut = fl + 0.5, xIn = fl + 0.5 + tall;
				const y0 = numY - wide, y1 = numY + wide;
				// Right-side-up from midfield looking at the left sideline:
				// top toward the sideline, left toward the south end.
				corners = [
					{ x: xOut, y: y0, h },
					{ x: xOut, y: y1, h },
					{ x: xIn, y: y1, h },
					{ x: xIn, y: y0, h }
				];
			} else {
				const xOut = fr - 0.5, xIn = fr - 0.5 - tall;
				const y0 = numY - wide, y1 = numY + wide;
				corners = [
					{ x: xOut, y: y1, h },
					{ x: xOut, y: y0, h },
					{ x: xIn, y: y0, h },
					{ x: xIn, y: y1, h }
				];
			}
			drawImageWorld3(img, corners, 8, 4);
		}
		for (let yd = Field.southGoal; yd <= Field.northGoal; yd += 5) {
			const isTen = yd % 10 === 0;
			strokePaint(fl, yd, fr, yd, isTen ? "rgba(236,240,230,0.5)" : "rgba(236,240,230,0.28)", isTen ? 1.35 : 1.05);
			const label = yd === Field.southGoal || yd === Field.northGoal ? "G" : String(yd > Field.midfield ? Field.length - yd : yd);
			const numY = yd === Field.southGoal || yd === 5 || yd === Field.northGoal - 5 || yd === Field.northGoal ? yd + (yd < Field.midfield ? .55 : yd > Field.midfield ? -.55 : 0) : yd;
			paintYardNum(-1, numY, label, isTen);
			paintYardNum(1, numY, label, isTen);
		}
		drawMidfieldLogo();
		const hashXs = [
			fl,
			hashLeft(),
			hashRight(),
			fr
		];
		for (let decade = 0; decade < 100; decade += 10) for (const off of [
			1,
			2,
			3,
			4,
			6,
			7,
			8,
			9
		]) {
			const y = decade + off;
			const innerTick = postGapHalf() * 0.16;
			const midX = (fl + fr) / 2;
			for (const hx of hashXs) strokePaint(hx, y, hx + (hx === fl ? .85 : hx === fr ? -.85 : (hx < midX ? -innerTick : innerTick)), y, "rgba(236,240,230,0.48)", 1.15);
		}
		function drawPylon(yardY, side) {
			const pt = project(side === "L" ? fl : fr, yardY);
			if (pt.sy < -20 || pt.sy > canvas.height + 20) return;
			const sc = Math.max(4, 5 * (pt.sc || 1));
			ctx.fillStyle = "#f97316";
			ctx.fillRect(pt.sx - sc * .35, pt.sy - sc * 1.4, sc * .7, sc * 1.5);
			ctx.fillStyle = "#fdba74";
			ctx.fillRect(pt.sx - sc * .35, pt.sy - sc * 1.7, sc * .7, sc * .35);
		}
		Field.pylonYards().forEach((yy) => { drawPylon(yy, "L"); drawPylon(yy, "R"); });
		drawGoalPosts();
		strokeWorld(fl, playStartYard, fr, playStartYard, "#3b82f6", 2.6);
		strokeWorld(fl, Field.southGoal, fl, Field.northGoal, "rgba(255,255,255,0.4)", 2.5);
		strokeWorld(fr, Field.southGoal, fr, Field.northGoal, "rgba(255,255,255,0.4)", 2.5);
		strokeWorld(fl, 20, fl, 80, "rgba(236,240,230,0.92)", Math.max(5, SCALE_X * .28));
		strokeWorld(fr, 20, fr, 80, "rgba(236,240,230,0.92)", Math.max(5, SCALE_X * .28));
		{
			const pack = [];
			if (qb && qb.active && !blockers.includes(qb)) pack.push(qb);
			(blockers || []).forEach((b) => { if (b && b.active) pack.push(b); });
			(defenders || []).forEach((d) => { if (d) pack.push(d); });
			if (rb) pack.push(rb);
			pack.sort((a, b) => {
				const da = project(a.x, a.y, 0.9);
				const db = project(b.x, b.y, 0.9);
				const za = da.depth != null ? da.depth : 50;
				const zb = db.depth != null ? db.depth : 50;
				return zb - za;
			});
			pack.forEach((pl) => drawPlayerRings(pl, !!(rb && pl === rb && rb.hasBall)));
			const turfMarks = pack.filter((pl) => pl && (pl.state === "whiff" || (pl.whiffT > 0) || (pl.turfStainT > 0)));
			turfMarks.sort((a, b) => {
				const ax = a.turfX != null ? a.turfX : a.x;
				const ay = a.turfY != null ? a.turfY : a.y;
				const bx = b.turfX != null ? b.turfX : b.x;
				const by = b.turfY != null ? b.turfY : b.y;
				const da = project(ax, ay, 0.02);
				const db = project(bx, by, 0.02);
				return (db.depth || 0) - (da.depth || 0);
			});
			turfMarks.forEach((pl) => drawTurfImpact(pl));
			if (film && film.trail) strokeTrailWorld(film.trail);
			else drawRunnerTrail();
			pack.forEach((pl) => drawPlayer(pl, !!(rb && pl === rb && rb.hasBall)));
		}
		if (fumbleSeq && fumbleSeq.phase === "loose") {
			const br = .9 * yardToPx();
			const bp = project(fumbleSeq.ballX, fumbleSeq.ballY);
			{ const bc = ballColorsFor(rb); drawFootball(bp.sx, bp.sy - fumbleSeq.ballHop * SCALE_Y * .45, br, fumbleSeq.t * 11, bc.fill, bc.lace); }
		}
		if (scoreSeq && scoreSeq.ballOut) {
			const br = .9 * yardToPx();
			const bp = project(scoreSeq.ballX, scoreSeq.ballY);
			{ const bc = ballColorsFor(scoreSeq.player || rb); drawFootball(bp.sx, bp.sy - scoreSeq.ballHop * SCALE_Y * .45, br, scoreSeq.t * 8, bc.fill, bc.lace); }
		}
		drawHandoffBall();
		drawRouteArrow();
		drawPlayArt();
		ctx.restore();
		if (splitOn) ctx.restore();
		if (savedLive) {
			rb = savedLive.rb;
			qb = savedLive.qb;
			blockers = savedLive.blockers;
			defenders = savedLive.defenders;
			cameraY = savedLive.cameraY;
			camZoom = savedLive.camZoom;
			celebrateTimer = savedLive.celebrateTimer;
			scoreSeq = savedLive.scoreSeq;
			fumbleSeq = savedLive.fumbleSeq;
			activeMove = savedLive.activeMove;
			moveTimer = savedLive.moveTimer;
			moveDur = savedLive.moveDur;
		}
		drawPip();
		drawSprintMeter();
		drawReplayHud();
		drawFreeCamHud();
		drawReplayCursor();
		if (ctrlLeft || ctrlRight) {
			ctx.fillStyle = "rgba(251,79,20,0.85)";
			ctx.font = "bold 12px Barlow Condensed, sans-serif";
			ctx.textAlign = "right";
			ctx.fillText(ctrlLeft && ctrlRight ? "DUAL CONTROL" : "BLOCKER", canvas.width - 12, 18);
		}
	}
	function drawReplayCursor() {
		if (!fullReplay && !camAdjust) return;
		const col = jerseyRingColor(playingDefense() ? "def" : "off");
		const cw = getCamWorld();
		const lookYScreen = cw ? 0.50 + 0.22 * (1 - Math.sin(cw.phi)) : 0.54;
		const cx = canvas.width * 0.5;
		const cy = canvas.height * lookYScreen;
		const ref = project(lookX, lookY, 0.15);
		const zoom = (camZoom || 1) * (camOp.zoom || 1);
		const sc = Math.max(0.08, ref.sc || 1);
		const playerR = 0.85 * yardToPx() * sc * 0.74 * zoom;
		const s = Math.max(2.4, playerR * 0.9);
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.globalAlpha = 1;
		ctx.lineCap = "round";
		ctx.strokeStyle = "rgba(0,0,0,0.9)";
		ctx.lineWidth = Math.max(3.2, s * 0.28);
		ctx.beginPath();
		ctx.moveTo(cx - s, cy - s);
		ctx.lineTo(cx + s, cy + s);
		ctx.moveTo(cx - s, cy + s);
		ctx.lineTo(cx + s, cy - s);
		ctx.stroke();
		ctx.strokeStyle = "#ffffff";
		ctx.lineWidth = Math.max(2, s * 0.17);
		ctx.beginPath();
		ctx.moveTo(cx - s, cy - s);
		ctx.lineTo(cx + s, cy + s);
		ctx.moveTo(cx - s, cy + s);
		ctx.lineTo(cx + s, cy - s);
		ctx.stroke();
		ctx.strokeStyle = col;
		ctx.lineWidth = Math.max(1.15, s * 0.1);
		ctx.beginPath();
		ctx.moveTo(cx - s, cy - s);
		ctx.lineTo(cx + s, cy + s);
		ctx.moveTo(cx - s, cy + s);
		ctx.lineTo(cx + s, cy - s);
		ctx.stroke();
		ctx.fillStyle = col;
		ctx.beginPath();
		ctx.arc(cx, cy, Math.max(2.1, s * 0.16), 0, Math.PI * 2);
		ctx.fill();
		ctx.strokeStyle = "#ffffff";
		ctx.lineWidth = 1.1;
		ctx.stroke();
		ctx.restore();
	}
	function drawFreeCamHud() {
		if (fullReplay) return;
		if (!camAdjust) return;
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.fillStyle = "rgba(8,12,10,0.78)";
		ctx.strokeStyle = "rgba(251,79,20,0.75)";
		ctx.lineWidth = 1.2;
		const x = 12, y = 10;
		const w = Math.min(camAdjust ? 520 : 400, canvas.width * 0.62);
		const h = camAdjust ? 86 : 44;
		ctx.beginPath();
		if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, 8);
		else ctx.rect(x, y, w, h);
		ctx.fill();
		ctx.stroke();
		ctx.fillStyle = "#fb4f14";
		ctx.font = "bold 13px Barlow Condensed, sans-serif";
		ctx.textAlign = "left";
		ctx.textBaseline = "alphabetic";
		ctx.fillText(camAdjust ? "ADJUST CAMERA" : "FREESTYLE CAMERA", x + 12, y + 18);
		ctx.fillStyle = "#e8ece6";
		ctx.font = "10px IBM Plex Sans, sans-serif";
		if (camAdjust) {
			ctx.fillText("X / B  zoom in / out", x + 12, y + 36);
			ctx.fillText("Arrows / left stick  recenter    ·    Y + arrows / left stick  rotate (L/R theta, U/D phi)", x + 12, y + 52);
			ctx.fillText("A  confirm camera angle", x + 12, y + 68);
		} else {
			ctx.fillStyle = "#c5cec4";
			ctx.font = "9px IBM Plex Sans, sans-serif";
			ctx.fillText(paused ? "Y adjust camera · A resume · X/View replay · B restart" : "Pause, then Y to set angle", x + 12, y + 34);
		}
		ctx.restore();
	}
	function drawReplayHud() {
		if (!fullReplay || !fullReplay.frames || !fullReplay.frames.length) return;
		const n = fullReplay.frames.length;
		const i = fullReplay.i || 0;
		const playing = !!fullReplay.playing;
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		const x = 12, y = 10, w = Math.min(460, canvas.width * 0.56), h = 72;
		ctx.fillStyle = "rgba(8,12,10,0.8)";
		ctx.strokeStyle = "rgba(251,79,20,0.88)";
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, 8);
		else ctx.rect(x, y, w, h);
		ctx.fill();
		ctx.stroke();
		ctx.fillStyle = "#fb4f14";
		ctx.font = "bold 14px Barlow Condensed, sans-serif";
		ctx.textAlign = "left";
		ctx.textBaseline = "alphabetic";
		ctx.fillText("INSTANT REPLAY", x + 12, y + 20);
		ctx.fillStyle = "#e8ece6";
		ctx.font = "11px IBM Plex Sans, sans-serif";
		const rate = replayHudRate;
		let rateTxt = "PAUSE";
		if (Math.abs(rate) < 0.02 && !playing) rateTxt = "PAUSE";
		else if (playing && Math.abs(rate - 1) < 0.05) rateTxt = "PLAY  1.00×";
		else rateTxt = (rate >= 0 ? "▶ " : "◀ ") + Math.abs(rate || 0).toFixed(2) + "×";
		ctx.fillText(rateTxt + "   " + Math.round(i) + " / " + n, x + 12, y + 38);
		ctx.fillStyle = "#8b9688";
		ctx.font = "9px IBM Plex Sans, sans-serif";
		ctx.fillText("A pause/play · X/B zoom · LB/RB slow · LT/RT fast · LS pan the X · Y+LS orbit · View/R exit", x + 12, y + 52);
		const bx = x + 12, by = y + 60, bw = w - 24, bh = 4;
		ctx.fillStyle = "rgba(255,255,255,0.14)";
		ctx.fillRect(bx, by, bw, bh);
		ctx.fillStyle = "#fb4f14";
		ctx.fillRect(bx, by, bw * (n > 1 ? i / (n - 1) : 0), bh);
		ctx.restore();
	}
	function drawSprintMeter() {
		const x = 14;
		const y = canvas.height - 20;
		const w = 108;
		const h = 9;
		ctx.fillStyle = "rgba(0,0,0,0.55)";
		ctx.fillRect(13, y - 1, 110, 11);
		ctx.fillStyle = "rgba(255,255,255,0.12)";
		ctx.fillRect(x, y, w, h);
		ctx.fillStyle = sprintExhausted ? "#ef4444" : sprintCharge > .22 ? "#fbbf24" : "#f97316";
		ctx.fillRect(x, y, w * sprintCharge, h);
		ctx.fillStyle = "rgba(255,255,255,0.7)";
		ctx.font = "9px IBM Plex Sans, sans-serif";
		ctx.textAlign = "left";
		ctx.textBaseline = "bottom";
		ctx.fillText("SPRINT", x, y - 2);
	}
	let raf = 0;
	function step(dt) {
		update(dt);
		if (!paused && !fullReplay) syncGaitSpeeds(dt);
		if (!paused && !fullReplay && !sessionOver) {
			replayAcc += dt;
			if (replayAcc >= 1 / REPLAY_HZ) {
				replayAcc = 0;
				const frame = captureFrame();
				const live = playActive && !practiceAwaitSnap && preSnapTimer <= 0;
				if (live) {
					replayBuf.push(frame);
					playFrames.push(frame);
					if (replayBuf.length > REPLAY_CAP) replayBuf.shift();
					if (playFrames.length > REPLAY_CAP) playFrames.shift();
				} else {
					huddleBuf.push(frame);
					if (huddleBuf.length > HUDDLE_KEEP) huddleBuf.shift();
				}
			}
		}
	}
	function loop(now) {
		try {
			const realDt = Math.max(0, (now - lastTime) / 1e3);
			lastTime = now;
			simAcc += realDt;
			let n = 0;
			while (simAcc >= SIM_DT && n < SIM_MAX_STEPS) {
				step(SIM_DT);
				simAcc -= SIM_DT;
				n++;
			}
			if (n === SIM_MAX_STEPS) simAcc = 0;
			draw();
			updateHUD();
		} catch (err) {
			console.error(err);
		}
		raf = requestAnimationFrame(loop);
	}
	function isTypingTarget(el) {
		if (!el || el === document.body || el === document.documentElement) return false;
		const tag = el.tagName;
		if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return true;
		if (el.isContentEditable) return true;
		return false;
	}
	function isMenuClick(el) {
		if (!el || el === canvas) return false;
		return !!(el.closest && el.closest("#sideControls, .lab-aside, .lab-hud, .practice-preview, .lab-foot, .lab-modal, .lab-header, input, select, textarea, button, label, a, summary"));
	}
	function focusCanvas() {
		if (isTypingTarget(document.activeElement)) return;
		try { canvas.focus({ preventScroll: true }); } catch (err) { canvas.focus(); }
	}
	function onKeyDown(e) {
		if (isTypingTarget(e.target)) return;
		keys.add(e.code);
		if ([
			"ArrowUp",
			"ArrowDown",
			"ArrowLeft",
			"ArrowRight",
			"Space",
			"KeyI",
			"KeyJ",
			"KeyK",
			"KeyL",
			"KeyH",
			"KeyR"
		].includes(e.code)) e.preventDefault();
		if (paused && !fullReplay && !sessionOver && (e.code === "KeyX" || e.code === "KeyC")) {
			if (!(document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLSelectElement)) startFullReplay();
		}
		if (e.code === "KeyR" && !e.repeat) {
			if (!(document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLSelectElement)) {
				if (!fullReplay) startFullReplay();
			}
		}
		if (e.key === "Enter") {
			const nameModal = $("nameModal");
			const contModal = $("continueModal");
			if (nameModal && !nameModal.classList.contains("hidden")) {
				e.preventDefault();
				submitScore();
			} else if (contModal && !contModal.classList.contains("hidden")) {
				e.preventDefault();
				continueSet();
			}
		}
	}
	function onKeyUp(e) {
		keys.delete(e.code);
	}
	function onBlur() {
		keys.clear();
	}
	function onVisibility() {
		if (document.hidden) keys.clear();
	}
	function onPadConnect(e) {
		e.gamepad.index;
		navigator.getGamepads?.();
	}
	function onPadDisconnect() {}
	function wakePad(e) {
		navigator.getGamepads?.();
		if (e && isMenuClick(e.target)) return;
		focusCanvas();
	}
	function pointerToStick(e) {
		const rect = canvas.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;
		if (x < rect.width * .55) {
			if (!touch.active) {
				touch.active = true;
				touch.ox = x;
				touch.oy = y;
			}
			const dx = (x - touch.ox) / 48;
			const dy = -(y - touch.oy) / 48;
			const m = Math.hypot(dx, dy);
			const s = m > 1 ? 1 / m : 1;
			touch.dx = dx * s;
			touch.dy = dy * s;
		} else touch.burst = true;
	}
	function onPointerDown(e) {
		focusCanvas();
		canvas.setPointerCapture(e.pointerId);
		pointerToStick(e);
	}
	function onPointerMove(e) {
		if (touch.active) pointerToStick(e);
	}
	function onPointerUp() {
		touch.active = false;
		touch.dx = 0;
		touch.dy = 0;
		touch.burst = false;
	}
	window.addEventListener("keydown", onKeyDown);
	window.addEventListener("keyup", onKeyUp);
	window.addEventListener("blur", onBlur);
	document.addEventListener("visibilitychange", onVisibility);
	
		const trailEl = $("runnerTrailToggle");
		if (trailEl) {
			showRunnerTrail = !!trailEl.checked;
			trailEl.addEventListener("change", () => { showRunnerTrail = !!trailEl.checked; });
		}
		const fatigueEl = $("fatigueToggle");
		if (fatigueEl) {
			const host = fatigueEl.closest("label") || fatigueEl.parentElement;
			if (host) {
				const nodes = [...host.childNodes];
				nodes.forEach((n) => {
					if (n.nodeType === 3 && /fatigue/i.test(n.textContent)) n.textContent = " Runner Fatigue";
				});
			}
			fatigueOn = !!fatigueEl.checked;
			fatigueEl.addEventListener("change", () => {
				fatigueOn = !!fatigueEl.checked;
				if (!fatigueOn) {
					sprintCharge = 1;
					sprintHoldT = 0;
					sprintExhausted = false;
				}
			});
		}
		const speedTrailEl = $("speedTrailToggle");
		if (speedTrailEl) {
			speedTrail = !!speedTrailEl.checked;
			speedTrailEl.addEventListener("change", () => { speedTrail = !!speedTrailEl.checked; });
		}
		const saveClipBtn = $("saveClipBtn");
		if (saveClipBtn) saveClipBtn.addEventListener("click", () => saveLastPlayClip());
		renderSavedClips();
		const nextPlayEl = $("nextPlaySelect");
		if (nextPlayEl) {
			nextPlayOnSnap = nextPlayEl.value === "snap";
			nextPlayEl.addEventListener("change", () => {
				nextPlayOnSnap = nextPlayEl.value === "snap";
				if (practiceAwaitSnap) {
					armGameDefAutoSnap();
					if (playingDefense() && userDefender) setPlayCall(huddleCallLabel() + huddleWaitHint());
				}
			});
		}
		const sideEl = $("sideSelect");
		if (sideEl) {
			userSide = sideEl.value === "def" ? "def" : "off";
			sideEl.addEventListener("change", () => setUserSide(sideEl.value === "def" ? "def" : "off"));
		}
		const syncStartUI = () => { syncStartYardFromUI(); };
		$("startYard50")?.addEventListener("change", syncStartUI);
		$("startYard50")?.addEventListener("input", syncStartUI);
		$("startYardMinus")?.addEventListener("click", () => nudgeStartYard(-1));
		$("startYardPlus")?.addEventListener("click", () => nudgeStartYard(1));
		$("startSideTri")?.addEventListener("click", () => {
			startSide = startSide === "opp" ? "own" : "opp";
			const yd = parseInt($("startYard50")?.value, 10);
			if (yd === 50) $("startYard50").value = "45";
			syncStartYardFromUI();
		});
		function setPostTdMode(mode) {
			postTdMode = mode;
			document.querySelectorAll(".los-mode").forEach((b) => {
				b.classList.toggle("on", b.getAttribute("data-mode") === mode);
			});
			const row = $("incrementRow");
			if (row) row.classList.toggle("hidden", mode !== "increasing" && mode !== "decreasing");
			const inc = $("incrementInput");
			if (inc) tdIncrement = Number.isFinite(parseInt(inc.value, 10)) ? parseInt(inc.value, 10) : 5;
		}
		document.querySelectorAll(".los-mode").forEach((b) => {
			b.addEventListener("click", () => setPostTdMode(b.getAttribute("data-mode")));
		});
		$("incrementInput")?.addEventListener("change", () => {
			tdIncrement = Number.isFinite(parseInt($("incrementInput").value, 10)) ? parseInt($("incrementInput").value, 10) : 5;
		});
		setPostTdMode("random");
		syncStartYardFromUI();
		const onPracLos = () => applyPracticeLosNow();
		$("practiceSideSelect")?.addEventListener("change", onPracLos);
		$("practiceYard50")?.addEventListener("change", onPracLos);
		// debounce-ish input: apply on change only to avoid restage every keystroke mid-type
		$("practiceYard50")?.addEventListener("input", () => {
			const v = parseInt($("practiceYard50").value, 10);
			if (Number.isFinite(v) && v >= 1 && v <= 50) onPracLos();
		});
		syncPracticeYardFromUI();
		updateConfigPanelForMode();
	window.addEventListener("gamepadconnected", onPadConnect);
	window.addEventListener("gamepaddisconnected", onPadDisconnect);
	window.addEventListener("pointerdown", wakePad);
	canvas.addEventListener("pointerdown", onPointerDown);
	canvas.addEventListener("pointermove", onPointerMove);
	canvas.addEventListener("pointerup", onPointerUp);
	canvas.addEventListener("pointercancel", onPointerUp);
	function rebuildAfterPersonnelChange() {
		refreshPersonnelUI();
		// Practice: immediately restage players + play art for the new roster
		if (gameMode === "practice") {
			const fixed = clamp(practiceStartYard, 1, 99);
			ballYard = fixed;
			playStartYard = fixed;
			driveStartYard = fixed;
			ballX = (hashLeft() + hashRight()) / 2;
			practiceAwaitSnap = true;
			practiceAudibleArm = false;
			practiceDefAudibleArm = false;
			playActive = false;
			try {
				placeEntitiesForNewPlay();
			} catch (err) {
				console.error(err);
			}
			const offName = currentPlay ? currentPlay.name : "Practice";
			const defName = currentScheme ? currentScheme.name : "";
			setPlayCall(offName + (defName ? " · vs " + defName : "") + huddleWaitHint());
			updateBallOn();
			if (typeof armGameDefAutoSnap === "function") armGameDefAutoSnap();
			if (typeof refreshPracticePreviews === "function") refreshPracticePreviews();
		}
	}
	function bindCount(idMinus, idPlus, getter, setter, lo, hi, group) {
		const minus = $(idMinus), plus = $(idPlus);
		if (minus) minus.onclick = () => {
			setter(clamp(getter() - 1, lo, hi));
			if (group) adjustNumbersForGroup(group, group === "QB" ? Math.max(1, getter()) : getter());
			rebuildAfterPersonnelChange();
		};
		if (plus) plus.onclick = () => {
			setter(clamp(getter() + 1, lo, hi));
			if (group) adjustNumbersForGroup(group, group === "QB" ? Math.max(1, getter()) : getter());
			rebuildAfterPersonnelChange();
		};
	}
	bindCount("olMinus", "olPlus", () => numOL, (v) => { numOL = v; }, 0, 5, "OL");
	bindCount("teMinus", "tePlus", () => numTE, (v) => { numTE = v; }, 0, 3, "TE");
	bindCount("fbMinus", "fbPlus", () => numFB, (v) => { numFB = v; }, 0, 2, "FB");
	bindCount("qbMinus", "qbPlus", () => numQB, (v) => { numQB = v; }, 0, 1, "QB");
	bindCount("dtMinus", "dtPlus", () => numDT, (v) => { numDT = v; }, 0, 4, "DT");
	bindCount("lbMinus", "lbPlus", () => numLBs, (v) => { numLBs = v; }, 0, 4, "LB");
	bindCount("dbMinus", "dbPlus", () => numDBs, (v) => { numDBs = v; }, 0, 6, "DB");
	$("widthSelect").onchange = (e) => {
		FIELD_WIDTH = Field.setWidth(e.target.value);
		refreshScale();
		ballX = clampToHash(ballX);
		placeEntitiesForNewPlay();
	};
	const surfaceSel = $("surfaceSelect");
	if (surfaceSel) surfaceSel.onchange = () => {
		const v = surfaceSel.value;
		surface = v === "fieldturf" || v === "astroturf" ? v : "grass";
		turfPattern = null;
		turfPatternKey = "";
	};
	const minSel = $("minSelect");
	if (minSel) minSel.onchange = (e) => {
		gameSeconds = parseInt(e.target.value, 10) || 120;
	};
	const offUniSel = $("offUniform");
	if (offUniSel) offUniSel.onchange = (e) => {
		selectOffUni(parseInt(e.target.value, 10));
		paintRoster();
	};
	const defUniSel = $("defUniform");
	if (defUniSel) defUniSel.onchange = (e) => {
		selectDefUni(parseInt(e.target.value, 10));
		paintRoster();
	};
	function syncCallSelects() {
		const op = $("practiceOffPlay");
		const ds = $("practiceDefScheme");
		const offRow = $("offPlayRow");
		const defRow = $("defSchemeRow");
		const hint = $("callHint");
		const practice = gameMode === "practice";
		if (offRow) offRow.classList.remove("hidden");
		if (defRow) defRow.classList.remove("hidden");
		if (op) op.classList.toggle("hidden", !practice);
		if (ds) ds.classList.toggle("hidden", !practice);
		if (op && currentPlay && practice) {
			const id = currentPlay.baseId || currentPlay.id;
			if ([...op.options].some((o) => o.value === id)) op.value = id;
		}
		if (ds && currentScheme && practice) {
			if ([...ds.options].some((o) => o.value === currentScheme.id)) ds.value = currentScheme.id;
		}
		if (hint) {
			hint.textContent = practice
				? "Practice: first huddle is random, then both calls stick until you change them."
				: "Game: both calls re-roll every play. Names are labels — playbooks stay in Practice.";
		}
	}
	function populatePracticeSelects() {
		const op = $("practiceOffPlay");
		const ds = $("practiceDefScheme");
		if (gameMode === "practice") {
			if (!practiceOffPlayId && OFF_PLAYS.length) practiceOffPlayId = randChoice(OFF_PLAYS).id;
			if (!practiceDefSchemeId && DEF_SCHEMES.length) practiceDefSchemeId = randChoice(DEF_SCHEMES).id;
		}
		if (op) {
			op.innerHTML = "";
			OFF_PLAYS.forEach((p) => {
				const o = document.createElement("option");
				o.value = p.id;
				o.textContent = p.name;
				const cur = gameMode === "practice" ? practiceOffPlayId : (huddleOffPickId || (currentPlay && (currentPlay.baseId || currentPlay.id)));
				if (cur ? p.id === cur : false) o.selected = true;
				op.appendChild(o);
			});
		}
		if (ds) {
			ds.innerHTML = "";
			DEF_SCHEMES.forEach((s) => {
				const o = document.createElement("option");
				o.value = s.id;
				o.textContent = s.name;
				const cur = gameMode === "practice" ? practiceDefSchemeId : (huddleDefPickId || (currentScheme && currentScheme.id));
				if (cur ? s.id === cur : false) o.selected = true;
				ds.appendChild(o);
			});
		}
		syncCallSelects();
	}
	function randomizeCamCorner() {
		camCorner = Math.random() < 0.5 ? "sw" : "nw";
		const cornerEl = $("camCornerSelect");
		if (cornerEl) cornerEl.value = camCorner;
	}
	function resetSessionClock() {
		const sel = $("minSelect");
		if (sel && !sel.value) sel.value = "120";
		gameSeconds = parseInt($("minSelect")?.value || "120", 10) || 120;
		clock = gameSeconds;
		const clockEl = $("clock");
		if (clockEl) clockEl.textContent = formatClock(clock);
	}
	function setGameMode(mode) {
		gameMode = mode === "practice" ? "practice" : "game";
		const modePick = $("modeSelect");
		if (modePick && modePick.value !== gameMode) modePick.value = gameMode;
		const pc = $("practiceControls");
		if (pc) pc.classList.remove("hidden");
		updateConfigPanelForMode();
		syncNextPlayDefault();
		populatePracticeSelects();
		practiceAwaitSnap = true;
		practiceAudibleArm = false;
		practiceDefAudibleArm = false;
		if (gameMode !== "practice") resetSessionClock();
		randomizeCamCorner();
		document.body.classList.toggle("practice-mode", gameMode === "practice");
		if (gameMode === "practice") {
			applyPracticeLosNow();
			updateHUD();
		} else {
			huddleOffPickId = null;
			huddleDefPickId = null;
			syncStartYardFromUI();
			ballYard = userToAbsolute(userStartYard);
			playStartYard = ballYard;
			driveStartYard = ballYard;
			playActive = false;
			practiceAwaitSnap = true;
			resetSessionClock();
			try { placeEntitiesForNewPlay(); } catch (err) { console.error(err); }
			armGameDefAutoSnap();
			updateHUD();
		}
		if (typeof refreshPracticePreviews === "function") refreshPracticePreviews();
		syncCallSelects();
		refreshHudSegments();
	}
	const modeEl = $("modeSelect");
	if (modeEl) {
		setGameMode(modeEl.value);
		modeEl.onchange = () => setGameMode(modeEl.value);
	}
	bindHudSegments();
	const pop = $("practiceOffPlay");
	if (pop) pop.onchange = (e) => {
		const id = e.target.value;
		if (gameMode !== "practice") { syncCallSelects(); return; }
		practiceOffPlayId = id;
		if (!playActive) {
			try { placeEntitiesForNewPlay(); } catch (err) { console.error(err); }
		}
	};
	const pds = $("practiceDefScheme");
	if (pds) pds.onchange = (e) => {
		const id = e.target.value;
		if (gameMode !== "practice") { syncCallSelects(); return; }
		practiceDefSchemeId = id;
		if (!playActive) {
			try { placeEntitiesForNewPlay(); } catch (err) { console.error(err); }
		}
	};
	function syncSideAliases() {
		offStrength = playingDefense() ? cpuStrength : youStrength;
		defStrength = playingDefense() ? youStrength : cpuStrength;
	}
	wireStrengthSlider("youStrSlider", "youStrLabel", () => youStrength, (v) => { youStrength = v; syncSideAliases(); });
	wireStrengthSlider("mateStrSlider", "mateStrLabel", () => mateStrength, (v) => { mateStrength = v; });
	wireStrengthSlider("cpuStrSlider", "cpuStrLabel", () => cpuStrength, (v) => { cpuStrength = v; syncSideAliases(); });
	syncSideAliases();
	const spdEl = $("speedSlider");
	const spdLab = $("speedLabel");
	if (spdEl) {
		if (spdEl.getAttribute("value") !== "1.00") spdEl.setAttribute("value", "1.00");
		spdEl.defaultValue = "1.00";
		spdEl.value = "1.00";
		playSpeed = 1.0 * SPEED_UI_SCALE;
		if (spdLab) spdLab.textContent = "1.00×";
		const syncSpd = () => {
			const labeled = parseFloat(spdEl.value) || 1.0;
			playSpeed = labeled * SPEED_UI_SCALE;
			if (spdLab) spdLab.textContent = labeled.toFixed(2) + "×";
		};
		spdEl.oninput = syncSpd;
		spdEl.onchange = syncSpd;
	}
	function wireStrengthSlider(id, labId, getter, setter, suffix, scale) {
		const el = $(id);
		const lab = $(labId);
		if (!el) return;
		const suf = suffix == null ? "×" : suffix;
		const sc = scale == null ? 1 : scale;
		el.defaultValue = "1.00";
		el.value = "1.00";
		const labeled0 = parseFloat(el.value) || 1;
		setter(labeled0 * sc);
		if (lab) lab.textContent = labeled0.toFixed(2) + suf;
		el.oninput = () => {
			const labeled = parseFloat(el.value) || 1;
			setter(labeled * sc);
			if (lab) lab.textContent = labeled.toFixed(2) + suf;
		};
	}
	wireStrengthSlider("breakBlockSlider", "breakBlockLabel", () => breakBlock, (v) => { breakBlock = v; }, "", BREAK_BLOCK_UI_SCALE);
	wireStrengthSlider("breakTackleSlider", "breakTackleLabel", () => breakTackle, (v) => { breakTackle = v; }, "", BREAK_TACKLE_UI_SCALE);
	const fumCheck = $("fumblesCheck");
	const fumLab = $("fumblesLabel");
	function syncFumblesForProfile() {
		if (padProfile === "v6") {
			fumblesOn = false;
			if (fumCheck) fumCheck.checked = false;
			if (fumLab) fumLab.textContent = "Off";
		}
	}
	if (fumCheck) {
		fumblesOn = fumCheck.checked;
		fumCheck.onchange = () => {
			if (padProfile === "v6") {
				fumCheck.checked = false;
				fumblesOn = false;
			} else fumblesOn = fumCheck.checked;
			if (fumLab) fumLab.textContent = fumblesOn ? "On" : "Off";
		};
	}
	const ezSel = $("ezArtSelect");
	if (ezSel) {
		ezArtMode = ezSel.value || "mountains";
		ezSel.onchange = () => {
			ezArtMode = ezSel.value || "mountains";
		};
	}
	const ezTextSel = $("ezTextSelect");
	const ezTextRow = $("ezTextCustomRow");
	const ezTextInp = $("ezTextCustom");
	function syncEzTextUi() {
		if (ezTextRow) ezTextRow.style.display = ezTextMode === "custom" ? "" : "none";
	}
	if (ezTextSel) {
		ezTextMode = ezTextSel.value || "ee";
		ezTextSel.onchange = () => {
			ezTextMode = ezTextSel.value || "ee";
			syncEzTextUi();
			if (ezTextMode === "custom" && ezTextInp) {
				try { ezTextInp.focus({ preventScroll: true }); } catch (err) { ezTextInp.focus(); }
			}
		};
	}
	if (ezTextInp) {
		ezCustomText = ezTextInp.value || "ELEVATION EDGE";
		ezTextInp.oninput = () => {
			ezCustomText = ezTextInp.value || "";
		};
	}
	syncEzTextUi();
	const logoCheck = $("midLogoCheck");
	const logoLab = $("midLogoLabel");
	if (logoCheck) {
		midLogoOn = logoCheck.checked;
		logoCheck.onchange = () => {
			midLogoOn = logoCheck.checked;
			if (logoLab) logoLab.textContent = midLogoOn ? "On" : "Off";
		};
	}
	$("pauseBtn").onclick = () => {
		if (sessionOver) return;
		setPaused(!paused);
	};
	$("restartBtn").onclick = () => fullRestart();
	$("continueBtn").onclick = () => continueSet();
	$("saveScoreBtn").onclick = () => submitScore();
	const camSel = $("cameraSelect");
	function syncCamCornerUi() {
		const corner = $("camCornerSelect");
		if (corner) corner.disabled = cameraMode === "top" || cameraMode === "topZoom" || cameraMode === "free";
	}
	if (camSel) {
		if (![...camSel.options].some((o) => o.value === "topZoom")) {
			const opt = document.createElement("option");
			opt.value = "topZoom";
			opt.textContent = "Overhead Zoom";
			const after = [...camSel.options].find((o) => o.value === "top");
			if (after && after.nextSibling) camSel.insertBefore(opt, after.nextSibling);
			else camSel.appendChild(opt);
		}
		if (![...camSel.options].some((o) => o.value === "free")) {
			const opt = document.createElement("option");
			opt.value = "free";
			opt.textContent = "Freestyle";
			camSel.appendChild(opt);
		}
		camSel.value = "free";
		cameraMode = "free";
		camOp.theta = freeOrbit.theta || 0;
		camOp.phi = freeOrbit.phi != null ? freeOrbit.phi : 0.82;
		camOp.zoom = freeOrbit.zoom || 1;
		camSel.onchange = () => {
			const next = CAMERAS[camSel.value] ? camSel.value : "top";
			if (cameraMode === "free" && next !== "free") {
				freeOrbit = { theta: camOp.theta || 0, phi: camOp.phi != null ? camOp.phi : 0.82, zoom: camOp.zoom || 1 };
			}
			cameraMode = next;
			if (cameraMode === "free") {
				camOp.theta = freeOrbit.theta || 0;
				camOp.phi = freeOrbit.phi != null ? freeOrbit.phi : 0.82;
				camOp.zoom = freeOrbit.zoom || 1;
				freeLook = false;
				const focus = rb || { x: FIELD_WIDTH / 2, y: playStartYard || 50 };
				applyLook(focus.x, focus.y);
			} else {
				resetCamOp();
			}
			syncCamCornerUi();
			refreshScale();
		};
	}
	const cornerSel = $("camCornerSelect");
	if (cornerSel) {
		cornerSel.value = camCorner;
		cornerSel.onchange = () => {
			camCorner = cornerSel.value === "sw" ? "sw" : "nw";
		};
	}
	syncCamCornerUi();
	const profSel = $("profileSelect");
	if (profSel) {
		padProfile = profSel.value || "v6";
		syncFumblesForProfile();
		profSel.onchange = () => {
			padProfile = profSel.value || "v6";
			syncFumblesForProfile();
		};
	}
	const swapCheck = $("swapStickDpadCheck");
	const swapLab = $("swapStickDpadLabel");
	if (swapCheck) {
		swapStickDpad = swapCheck.checked;
		if (swapLab) swapLab.textContent = swapStickDpad ? "On" : "Off";
		swapCheck.onchange = () => {
			swapStickDpad = swapCheck.checked;
			if (swapLab) swapLab.textContent = swapStickDpad ? "On" : "Off";
		};
	}
	const repSel = $("replayModeSelect");
	if (repSel) {
		replayMode = repSel.value || "pip";
		repSel.onchange = () => {
			replayMode = repSel.value || "pip";
		};
	}
	const modeSel = $("modeSelect");
	if (modeSel) {
		const pc0 = $("practiceControls");
		if (pc0) pc0.classList.remove("hidden");
	}
	const artSel = $("playArtSelect");
	if (artSel) {
		playArtMode = artSel.value || "on";
		artSel.onchange = () => {
			playArtMode = artSel.value || "on";
		};
	}
	const peekBtn = $("peekBtn");
	if (peekBtn) peekBtn.onclick = () => {
		peekToggle = !peekToggle;
	};
	const replayBtn = $("replayBtn");
	if (replayBtn) replayBtn.onclick = () => startFullReplay();
	const teamAbbrEl = $("teamAbbr");
	if (teamAbbrEl) teamAbbrEl.addEventListener("input", () => {
		const v = getTeamAbbr();
		const ni = $("nameInput");
		if (ni) ni.value = v;
	});
	rebuildWidthSelect();
	rebuildUniformSelects();
	refreshPersonnelUI();
	refreshAllNumbers();
	if (defUni === offUni) defUni = randChoice(UNIFORMS.filter((u) => u.id !== offUni)).id;
	fieldArtSide = "off";
	syncAbbrFromOffense();
	randomizeSurface();
	ballX = (hashLeft() + hashRight()) / 2;
	placeEntitiesForNewPlay();
	if (cameraMode === "free" && rb) applyLook(rb.x, rb.y);
	updateBallOn();
	renderScores();
	canvas.tabIndex = 0;
	canvas.style.outline = "none";
	refreshScale();
	const ro = new ResizeObserver(() => refreshScale());
	if (canvas.parentElement) ro.observe(canvas.parentElement);
	window.__controlsTest = {
		getX: () => (playingDefense() && userDefender ? userDefender.x : rb?.x) ?? 0,
		getY: () => (playingDefense() && userDefender ? userDefender.y : rb?.y) ?? 0,
		getYaw: () => (playingDefense() && userDefender ? userDefender.facing : rb?.facing) ?? 0,
		getSpeed: () => {
			const pl = playingDefense() && userDefender ? userDefender : rb;
			return pl ? playerGroundSpeed(pl) : 0;
		},
		getSpeedUi: () => ({
			value: $("speedSlider") ? $("speedSlider").value : null,
			label: $("speedLabel") ? $("speedLabel").textContent : null,
			playSpeed
		}),
		getGameMode: () => gameMode,
		getArtAlpha: () => ({
			def: +artAlpha(1).toFixed(3),
			off: +artAlphaOff(1).toFixed(3),
			zone: +zoneAlpha().toFixed(3),
			playAge: +Number(playAge).toFixed(3)
		}),
		getUserSide: () => userSide,
		setUserSide,
		getUserDefender: () => userDefender && { x: userDefender.x, y: userDefender.y, group: userDefender.group, role: userDefender.dbRole, number: userDefender.number, state: userDefender.state, engageT: userDefender.engageT, pancaked: !!userDefender.pancaked },
		getHuddleDef: () => userDefHuddleKey && { ...userDefHuddleKey },
		cycleDef: (dir) => {
			cycleUserDefender(dir == null ? 1 : dir);
			return window.__controlsTest.getUserDefender();
		},
		lockHuddle: () => {
			lockHuddleDefender();
			return window.__controlsTest.getHuddleDef();
		},
		startMove,
		snapNow: () => {
			practiceAwaitSnap = false;
			practiceAudibleArm = false;
			practiceDefAudibleArm = false;
			gameAutoSnapT = 0;
			playActive = true;
			lockHuddleDefender();
			return window.__controlsTest.getUserDefender();
		},
		switchLive: () => {
			const pick = bestPursuitDefender(userDefender);
			if (pick) setUserDefender(pick, true, false);
			return { live: window.__controlsTest.getUserDefender(), huddle: window.__controlsTest.getHuddleDef() };
		},
		restagePlay: () => {
			placeEntitiesForNewPlay();
			return window.__controlsTest.getUserDefender();
		},
		setNumDBs: (n) => {
			numDBs = clamp(n, 0, 6);
			rebuildAfterPersonnelChange();
			const midX = (fieldLeft() + fieldRight()) / 2;
			return defenders.filter((d) => d.group === "DB").map((d) => ({ x: +Number(d.x).toFixed(2), y: +Number(d.y).toFixed(2), role: d.dbRole, job: d.job, dxMid: +Number(d.x - midX).toFixed(2) }));
		},
		getCalls: () => ({
			mode: gameMode,
			side: userSide,
			off: currentPlay && { id: currentPlay.baseId || currentPlay.id, name: currentPlay.name },
			def: currentScheme && { id: currentScheme.id, name: currentScheme.name },
			lockOff: practiceOffPlayId,
			lockDef: practiceDefSchemeId,
			huddleOff: huddleOffPickId,
			huddleDef: huddleDefPickId,
			offRowHidden: !!$("offPlayRow")?.classList.contains("hidden"),
			defRowHidden: !!$("defSchemeRow")?.classList.contains("hidden"),
			offSelectHidden: !!$("practiceOffPlay")?.classList.contains("hidden"),
			defSelectHidden: !!$("practiceDefScheme")?.classList.contains("hidden"),
			offLabelHidden: !!$("gameOffPlayLabel")?.classList.contains("hidden"),
			defLabelHidden: !!$("gameDefSchemeLabel")?.classList.contains("hidden"),
			offLabel: $("gameOffPlayLabel")?.textContent || "",
			defLabel: $("gameDefSchemeLabel")?.textContent || "",
			booksHidden: !!$("practicePreview")?.classList.contains("hidden"),
			nextOnSnap: !!nextPlayOnSnap,
			autoSnapT: +Number(gameAutoSnapT).toFixed(3),
			awaitSnap: !!practiceAwaitSnap,
			playActive: !!playActive
		}),
		afterPlay: () => {
			if (gameMode === "game") {
				huddleOffPickId = null;
				huddleDefPickId = null;
			}
			playActive = false;
			practiceAwaitSnap = true;
			practiceAudibleArm = false;
			practiceDefAudibleArm = false;
			placeEntitiesForNewPlay();
			armGameDefAutoSnap();
			syncCallSelects();
			return window.__controlsTest.getCalls();
		},
		endPlayNow: (reason, yards) => {
			endPlay(reason || "Tackled", yards == null ? 3 : yards);
			return {
				pauseTimer: +Number(pauseTimer).toFixed(3),
				playActive: !!playActive,
				awaitSnap: !!practiceAwaitSnap,
				autoSnapT: +Number(gameAutoSnapT).toFixed(3),
				nextOnSnap: !!nextPlayOnSnap
			};
		},
		setNextPlay: (v) => {
			const np = $("nextPlaySelect");
			const auto = v === "auto" || v === false;
			if (np) np.value = auto ? "auto" : "snap";
			nextPlayOnSnap = !auto;
			if (practiceAwaitSnap) {
				armGameDefAutoSnap();
				if (playingDefense() && userDefender) setPlayCall(huddleCallLabel() + huddleWaitHint());
			}
			return window.__controlsTest.getCalls();
		},
		pointDef: (dx, dy) => {
			const pick = pointSelectDefender(dx == null ? -1 : dx, dy == null ? 0 : dy, userDefender);
			if (pick) setUserDefender(pick, true, !!practiceAwaitSnap);
			return window.__controlsTest.getUserDefender();
		},
		setMode: (m) => {
			setGameMode(m);
			return window.__controlsTest.getCalls();
		},
		setStrafe: (on) => {
			if (userDefender) userDefender._strafe = !!on;
			return !!(userDefender && userDefender._strafe);
		},
		ySnapReady: () => ({ awaitSnap: !!practiceAwaitSnap, side: userSide }),
		fireHitAtCarrier: () => {
			if (!userDefender || !rb) return { ok: false };
			defHitCool = 0;
			defHitLatch = false;
			userDefender.state = "pursue";
			userDefender.pancaked = false;
			userDefender.whiffT = 0;
			userDefender.recoverT = 0;
			userDefender._userMiss = false;
			clearAttack(userDefender);
			fireHitStick(userDefender, rb.x - userDefender.x, rb.y - userDefender.y);
			return {
				ok: true,
				state: userDefender.state,
				atkKind: userDefender.atkKind,
				tackle: !!tackleAnim,
				whiff: userDefender.state === "whiff",
				dist: +Number(dist(userDefender, rb)).toFixed(2)
			};
		},
		placeDefNearBall: (dx, dy) => {
			if (!userDefender || !rb) return null;
			userDefender.x = rb.x + (dx != null ? dx : 0.4);
			userDefender.y = rb.y + (dy != null ? dy : -1.6);
			userDefender.state = "pursue";
			userDefender.pancaked = false;
			userDefender.whiffT = 0;
			userDefender.recoverT = 0;
			return { x: userDefender.x, y: userDefender.y, rbX: rb.x, rbY: rb.y };
		},
		getPlayActive: () => !!playActive,
		poseWrapTakedown: () => {
			if (!rb || !defenders.length) return { ok: false };
			const d = userDefender || defenders.find((x) => x.group === "LB") || defenders[0];
			qaNoCpuTackle = true;
			playActive = true;
			practiceAwaitSnap = false;
			preSnapTimer = 0;
			handoffDone = true;
			rb.takenDown = true;
			rb.downAmt = 1;
			rb.low = true;
			rb.fallSide = 1;
			rb.facing = Math.PI / 2;
			rb.hasBall = true;
			d.x = rb.x - 0.42;
			d.y = rb.y - 0.18;
			d.takenDown = true;
			d.downAmt = 1;
			d.low = true;
			d.fallSide = -1;
			d.facing = Math.PI / 2;
			d.atkKind = "wrap";
			d._tackleKind = "wrap";
			tackleAnim = {
				mode: "tackle",
				kind: "wrap",
				timer: 0.55,
				dur: 1,
				ox: rb.x,
				oy: rb.y,
				fx: 0,
				fy: 1,
				dist: 0,
				hold: 0.42,
				yards: 0,
				defender: d
			};
			applyLook(rb.x, rb.y);
			return { ok: true, rb: { x: rb.x, y: rb.y }, def: { x: d.x, y: d.y, group: d.group } };
		},
		poseWhiff: () => {
			if (!rb || !defenders.length) return { ok: false };
			playActive = true;
			practiceAwaitSnap = false;
			preSnapTimer = 0;
			const d = userDefender || defenders.find((x) => x.group === "LB") || defenders[0];
			d.x = rb.x + 1.1;
			d.y = rb.y + 0.8;
			d.state = "whiff";
			stampTurfImpact(d, 0.7);
			d.whiffT = Math.max(d.whiffT || 0, 0.42);
			d.whiffMax = Math.max(d.whiffMax || 0, 0.7);
			d.low = true;
			d.turfSeed = d.turfSeed || null;
			applyLook(d.x, d.y);
			return { ok: true, x: d.x, y: d.y };
		},
		poseTd: (style, phase) => {
			if (!rb) return { ok: false };
			playActive = true;
			practiceAwaitSnap = false;
			preSnapTimer = 0;
			handoffDone = true;
			dive = null;
			activeMove = null;
			rb._diveScore = false;
			rb.takenDown = false;
			rb.downAmt = 0;
			rb.y = 101.1;
			rb.x = FIELD_WIDTH / 2;
			rb.hasBall = true;
			rb.vx = 0;
			rb.vy = 0;
			rb.hop = 0;
			rb.low = false;
			scoreSeq = null;
			startScoreSeq("off", rb, true, 30, 25);
			if (style && scoreSeq) {
				scoreSeq.spikeStyle = style;
				scoreSeq.spike = true;
			}
			const ph = phase == null ? 0.9 : phase;
			if (scoreSeq) {
				scoreSeq.t = ph;
				if (ph > 0.32) {
					scoreSeq.ballOut = true;
					rb.hasBall = false;
					rb.vx = 0;
					rb.vy = 0;
				}
			}
			applyLook(rb.x, rb.y);
			return { ok: true, style: scoreSeq && scoreSeq.spikeStyle, diveLand: !!(scoreSeq && scoreSeq.diveLand), t: scoreSeq && scoreSeq.t, ballOut: !!(scoreSeq && scoreSeq.ballOut) };
		},
		poseDiveTd: () => {
			if (!rb) return { ok: false };
			playActive = true;
			practiceAwaitSnap = false;
			preSnapTimer = 0;
			handoffDone = true;
			rb.y = 101.2;
			rb.x = FIELD_WIDTH / 2;
			rb.hasBall = true;
			rb.hop = 0.12;
			rb._diveScore = true;
			scoreSeq = null;
			startScoreSeq("off", rb, false, 30, 25);
			applyLook(rb.x, rb.y);
			return { ok: true, diveLand: !!(scoreSeq && scoreSeq.diveLand), takenDown: !!rb.takenDown };
		},
		poseDiveLand: () => {
			if (!rb) return { ok: false };
			playActive = true;
			practiceAwaitSnap = false;
			preSnapTimer = 0;
			handoffDone = true;
			rb.y = playStartYard + 8;
			rb.hop = 0;
			layOutPlayer(rb, 1);
			stampTurfImpact(rb, 0.7);
			applyLook(rb.x, rb.y);
			return { ok: true, takenDown: !!rb.takenDown, whiffT: rb.whiffT, turfX: rb.turfX, turfY: rb.turfY };
		},
		poseEzDive: (fromY) => {
			if (!rb) return { ok: false };
			playActive = true;
			practiceAwaitSnap = false;
			preSnapTimer = 0;
			handoffDone = true;
			scoreSeq = null;
			qaNoCpuTackle = true;
			moveCooldown = 0;
			getUpT = 0;
			diveHangT = 0;
			activeMove = null;
			dive = null;
			setPaused(false);
			camAdjust = false;
			haltPlayerMotion();
			rb.x = FIELD_WIDTH / 2;
			rb.y = fromY != null ? fromY : 96.2;
			rb.hasBall = true;
			rb.takenDown = false;
			rb.downAmt = 0;
			rb.vx = 0;
			rb.vy = 0;
			rb.hop = 0;
			rb.low = false;
			rb._diveScore = false;
			rb._diveTurf = false;
			rb._diveOob = false;
			lastSteer = { dx: 0, dy: 1 };
			startMove("dive");
			tdZoom = true;
			cameraY = 102;
			camZoom = 1.12;
			applyLook(rb.x, Math.max(rb.y, 100));
			return {
				ok: true,
				y: rb.y,
				ezLeap: !!(dive && dive.ezLeap),
				launchYards: dive && +Number(dive.launchYards).toFixed(2),
				duck: !!(dive && dive.duck),
				hop: rb.hop,
				activeMove
			};
		},
		poseOobDive: () => {
			if (!rb) return { ok: false };
			playActive = true;
			practiceAwaitSnap = false;
			preSnapTimer = 0;
			handoffDone = true;
			scoreSeq = null;
			qaNoCpuTackle = true;
			moveCooldown = 0;
			getUpT = 0;
			diveHangT = 0;
			activeMove = null;
			dive = null;
			setPaused(false);
			camAdjust = false;
			haltPlayerMotion();
			rb.x = fieldRight() - 2.15;
			rb.y = Math.max(playStartYard + 5, 28);
			rb.hasBall = true;
			rb.takenDown = false;
			rb.downAmt = 0;
			rb.vx = 0;
			rb.vy = 0;
			rb.hop = 0;
			rb.low = false;
			rb._diveScore = false;
			rb._diveOob = false;
			lastSteer = { dx: 1, dy: 0.22 };
			startMove("dive");
			applyLook(rb.x, rb.y);
			return {
				ok: true,
				x: +Number(rb.x).toFixed(2),
				y: +Number(rb.y).toFixed(2),
				launchYards: dive && +Number(dive.launchYards).toFixed(2),
				dx: dive && +Number(dive.dx).toFixed(3),
				edge: +Number(fieldRight()).toFixed(2)
			};
		},
		posePylonDive: (side) => {
			if (!rb) return { ok: false };
			playActive = true;
			practiceAwaitSnap = false;
			preSnapTimer = 0;
			handoffDone = true;
			scoreSeq = null;
			qaNoCpuTackle = true;
			moveCooldown = 0;
			getUpT = 0;
			diveHangT = 0;
			activeMove = null;
			dive = null;
			setPaused(false);
			camAdjust = false;
			haltPlayerMotion();
			const left = side === "L" || side === -1;
			rb.x = left ? fieldLeft() + 2.4 : fieldRight() - 2.4;
			rb.y = 96.6;
			rb.hasBall = true;
			rb.takenDown = false;
			rb.downAmt = 0;
			rb.vx = 0;
			rb.vy = 0;
			rb.hop = 0;
			rb.low = false;
			rb._diveScore = false;
			rb._diveOob = false;
			rb._oobLand = false;
			rb._landX = null;
			rb._landY = null;
			rb._gx = rb.x;
			rb._gy = rb.y;
			rb.gaitSpd = 0;
			lastSteer = { dx: left ? -0.55 : 0.55, dy: 1 };
			startMove("dive");
			tdZoom = true;
			cameraY = 102;
			applyLook(rb.x, 100);
			return {
				ok: true,
				x: +Number(rb.x).toFixed(2),
				y: +Number(rb.y).toFixed(2),
				pylon: !!(dive && dive.pylon),
				ezLeap: !!(dive && dive.ezLeap),
				launchYards: dive && +Number(dive.launchYards).toFixed(2),
				dx: dive && +Number(dive.dx).toFixed(3),
				edge: +Number(left ? fieldLeft() : fieldRight()).toFixed(2)
			};
		},
		getGait: () => {
			const pack = [];
			if (rb) pack.push(rb);
			(blockers || []).forEach((b) => pack.push(b));
			(defenders || []).forEach((d) => pack.push(d));
			return pack.map((p) => {
				const ground = p.gaitSpd != null ? p.gaitSpd : Math.hypot(p.vx || 0, p.vy || 0);
				return {
					n: p.number,
					g: p.group,
					spd: +ground.toFixed(2),
					vxSpd: +Math.hypot(p.vx || 0, p.vy || 0).toFixed(2),
					cad: ground > 0.32 ? +gaitCadence(ground).toFixed(2) : 0,
					carrier: !!(rb && p === rb)
				};
			});
		},
		getDive: () => ({
			active: activeMove === "dive",
			phase: dive && dive.phase,
			ezLeap: !!(dive && dive.ezLeap),
			launchYards: dive && +Number(dive.launchYards).toFixed(2),
			x: rb && +Number(rb.x).toFixed(2),
			y: rb && +Number(rb.y).toFixed(2),
			getUp: +Number(getUpT).toFixed(2),
			hang: +Number(diveHangT).toFixed(2),
			cd: +Number(moveCooldown).toFixed(2),
			spd: rb ? +Math.hypot(rb.vx || 0, rb.vy || 0).toFixed(2) : 0,
			hop: rb && +Number(rb.hop || 0).toFixed(2),
			scored: !!(rb && rb._diveScore),
			oobFlag: !!(rb && rb._diveOob),
			oobLand: !!(rb && rb._oobLand),
			oob: !!(rb && isSidelineOob(rb)),
			pastSideline: !!(rb && (rb.x < fieldLeft() || rb.x > fieldRight())),
			landX: rb && rb._landX != null ? +Number(rb._landX).toFixed(2) : null,
			landY: rb && rb._landY != null ? +Number(rb._landY).toFixed(2) : null,
			playActive: !!playActive,
			scoreSeq: !!scoreSeq,
			diveLand: !!(scoreSeq && scoreSeq.diveLand),
			takenDown: !!(rb && rb.takenDown)
		}),
		shiftCarrier: (dx, dy) => {
			if (!rb) return null;
			rb.x += dx || 0;
			rb.y += dy || 0;
			return {
				x: +Number(rb.x).toFixed(2),
				y: +Number(rb.y).toFixed(2),
				turfX: rb.turfX,
				turfY: rb.turfY,
				stain: +(rb.turfStainT || 0).toFixed(2)
			};
		},
		getBlockerMotion: () => (blockers || []).map((b) => ({
			n: b.number,
			g: b.group,
			spd: +Math.hypot(b.vx || 0, b.vy || 0).toFixed(2),
			engageT: +Number(b.engageT || 0).toFixed(2),
			block: !!b.blockTarget,
			drive: !!b.driveBlock
		})),
		getTeammateCtrl: () => ({
			side: userSide,
			profile: padProfile,
			left: ctrlLeft && { n: ctrlLeft.number, g: ctrlLeft.group, x: +Number(ctrlLeft.x).toFixed(2), y: +Number(ctrlLeft.y).toFixed(2), vx: +Number(ctrlLeft.vx || 0).toFixed(2), vy: +Number(ctrlLeft.vy || 0).toFixed(2), userCtrl: +Number(ctrlLeft._userCtrl || 0).toFixed(2) },
			right: ctrlRight && { n: ctrlRight.number, g: ctrlRight.group, x: +Number(ctrlRight.x).toFixed(2), y: +Number(ctrlRight.y).toFixed(2), vx: +Number(ctrlRight.vx || 0).toFixed(2), vy: +Number(ctrlRight.vy || 0).toFixed(2), userCtrl: +Number(ctrlRight._userCtrl || 0).toFixed(2) }
		}),
		getPadProfile: () => padProfile,
		getPadT9: () => padT9,
		setPadProfile: (p) => {
			const id = PROFILE_LABELS[p] ? p : padProfile;
			padProfile = id;
			const sel = $("profileSelect");
			if (sel) sel.value = id;
			if (typeof syncFumblesForProfile === "function") syncFumblesForProfile();
			return padProfile;
		},
		setQaPad: (o) => {
			qaPad = o ? {
				lsX: +o.lsX || 0,
				lsY: +o.lsY || 0,
				rsX: +o.rsX || 0,
				rsY: +o.rsY || 0,
				lt: +o.lt || 0,
				rt: +o.rt || 0
			} : null;
			return qaPad;
		},
		getCarrierMotion: () => rb && {
			x: +Number(rb.x).toFixed(2),
			y: +Number(rb.y).toFixed(2),
			vx: +Number(rb.vx || 0).toFixed(2),
			vy: +Number(rb.vy || 0).toFixed(2)
		},
		freezeCpuTackle: (v) => {
			qaNoCpuTackle = !!v;
			return qaNoCpuTackle;
		},
		getDefDebug: () => ({
			playActive: !!playActive,
			awaitSnap: !!practiceAwaitSnap,
			playAge: +Number(playAge).toFixed(3),
			side: userSide,
			pauseTimer,
			tackle: !!tackleAnim,
			state: userDefender && userDefender.state,
			engageT: userDefender && +Number(userDefender.engageT || 0).toFixed(2),
			pancaked: !!(userDefender && userDefender.pancaked),
			recoverT: userDefender && +Number(userDefender.recoverT || 0).toFixed(2),
			whiffT: userDefender && +Number(userDefender.whiffT || 0).toFixed(2),
			miss: !!(userDefender && userDefender._userMiss),
			x: userDefender && +Number(userDefender.x).toFixed(3),
			y: userDefender && +Number(userDefender.y).toFixed(3),
			vx: userDefender && +Number(userDefender.vx || 0).toFixed(3),
			theta: camOp.theta || 0
		}),
		getPlayAge: () => playAge,
		getCelebrate: () => celebrateTimer > 0,
		getYards: () => totalYards,
		getClock: () => clock,
		setClock: (v) => {
			clock = v;
		},
		getCamCorner: () => camCorner,
		getPlayArt: () => playArtMode,
		getReplayReady: () => lastPlayFrames.length,
		getCamera: () => cameraMode,
		getCamAdjust: () => !!camAdjust,
		setCamAdjust: (on) => {
			camAdjust = !!on;
			if (camAdjust) {
				setPaused(true);
				freeLook = true;
				const focus = rb || { x: FIELD_WIDTH / 2, y: playStartYard || 50 };
				applyLook(focus.x, focus.y);
			}
			syncPauseChrome();
			return camAdjust;
		},
		setCamera: (m) => {
			if (!CAMERAS[m]) return cameraMode;
			cameraMode = m;
			if (m === "free") {
				camOp.theta = freeOrbit.theta || 0;
				camOp.phi = freeOrbit.phi != null ? freeOrbit.phi : 0.82;
				camOp.zoom = freeOrbit.zoom || 1;
			}
			return cameraMode;
		},
		getCamOp: () => ({ panX: camOp.panX, panY: camOp.panY, yaw: camOp.yaw, zoom: camOp.zoom, theta: camOp.theta || 0, phi: camOp.phi, focusX: camFocusX, focusY: camFocusY, lookX, lookY }),
		setCamOp: (o) => {
			if (!o) return;
			if (o.panX != null) camOp.panX = o.panX;
			if (o.panY != null) camOp.panY = o.panY;
			if (o.yaw != null) camOp.yaw = o.yaw;
			if (o.zoom != null) camOp.zoom = o.zoom;
			if (o.theta != null) camOp.theta = o.theta;
			if (o.phi != null) camOp.phi = clamp(o.phi, 0, Math.PI / 2);
			if (o.lookX != null || o.lookY != null) applyLook(o.lookX != null ? o.lookX : lookX, o.lookY != null ? o.lookY : lookY);
		},
		getReplay: () => fullReplay ? { i: fullReplay.i, n: fullReplay.frames.length, playing: !!fullReplay.playing, rate: replayHudRate, cheerHold: +cheerHoldT.toFixed(2), cheerAmp: +cheerAmp.toFixed(2) } : null,
		getCheerHold: () => ({ hold: +cheerHoldT.toFixed(2), amp: +cheerAmp.toFixed(2), scoreSeq: !!scoreSeq }),
		setReplayPlaying: (on) => {
			if (!fullReplay) return null;
			fullReplay.playing = !!on;
			return window.__controlsTest.getReplay();
		},
		seekReplay: (i) => {
			if (!fullReplay || !fullReplay.frames) return null;
			const maxI = Math.max(0, fullReplay.frames.length - 1);
			fullReplay.i = i == null ? maxI : Math.max(0, Math.min(maxI, i));
			fullReplay.playing = false;
			return window.__controlsTest.getReplay();
		},
		getHelmInfo: () => {
			const pack = [];
			if (rb) pack.push(rb);
			(blockers || []).forEach((b) => pack.push(b));
			(defenders || []).forEach((d) => pack.push(d));
			return pack.map((p) => ({
				n: p.number,
				g: p.group,
				bars: p.helmBars,
				grill: !!p.helmGrill
			}));
		},
		getCamDebug: () => ({
			mode: cameraMode,
			skew: camSpec().skew,
			xLean: camSpec().xLean,
			yScale: camSpec().yScale,
			a: project(0, 50),
			b: project(FIELD_WIDTH, 50),
			c: project(0, 60)
		}),
		getSnapState: () => ({
			play: currentPlay && (currentPlay.baseId || currentPlay.id),
			scheme: currentScheme && currentScheme.id,
			yard: playStartYard,
			steps: currentPlay && currentPlay.steps ? currentPlay.steps.map((s) => ({ dx: s.dx, dy: s.dy, t: s.t })) : [],
			altSteps: currentPlay && currentPlay.altSteps ? currentPlay.altSteps.map((s) => ({ dx: s.dx, dy: s.dy, t: s.t })) : null,
			pad: padProfile,
			awaitSnap: !!practiceAwaitSnap,
			userSide,
			userDef: userDefender && { group: userDefender.group, role: userDefender.dbRole, number: userDefender.number, x: +Number(userDefender.x).toFixed(2), y: +Number(userDefender.y).toFixed(2) },
			sprintCharge,
			sprintHoldT,
			sprintExhausted,
			fatigue: fatigueOn,
			breakBlock: +Number(breakBlock).toFixed(2),
			breakTackle: +Number(breakTackle).toFixed(2),
			you: +Number(youStrength).toFixed(2),
			mates: +Number(mateStrength).toFixed(2),
			cpu: +Number(cpuStrength).toFixed(2),
			defYs: (defenders || []).map((d) => +Number(d.y).toFixed(2)),
			defXs: (defenders || []).map((d) => +Number(d.x).toFixed(2)),
			jobYs: (defenders || []).map((d) => d.jobY == null ? null : +Number(d.jobY).toFixed(2)),
			stations: (defenders || []).map((d) => ({ g: d.group, job: d.job, station: d.station || null, x: d.stationX == null ? null : +Number(d.stationX).toFixed(2), y: d.stationY == null ? null : +Number(d.stationY).toFixed(2) })),
			hash: [hashLeft(), hashRight()].map((v) => +Number(v).toFixed(2)),
			post: +Number(postGapHalf() * 2).toFixed(2),
			width: FIELD_WIDTH,
			offYs: (blockers || []).map((b) => ({ g: b.group, y: +Number(b.y).toFixed(2), x: +Number(b.x).toFixed(2) })),
			rbY: rb ? +Number(rb.y).toFixed(2) : null,
			los: playStartYard,
			oFlip: !!practiceFlipped,
			dFlip: !!practiceDefFlipped,
			yardPx: +Number(yardToPx()).toFixed(2),
			scaleX: +Number(SCALE_X).toFixed(2),
			playFrames: playFrames.length
		}),
		flipOffense: () => {
			practiceFlipped = !practiceFlipped;
			placeEntitiesForNewPlay("off");
			return !!practiceFlipped;
		},
		flipDefense: () => {
			practiceDefFlipped = !practiceDefFlipped;
			placeEntitiesForNewPlay("def");
			return !!practiceDefFlipped;
		},
		getSpikeStyle: () => scoreSeq?.spikeStyle || null,
		getScoreSeq: () => scoreSeq && {
			t: +Number(scoreSeq.t).toFixed(3),
			who: scoreSeq.who,
			spike: !!scoreSeq.spike,
			spikeStyle: scoreSeq.spikeStyle || "none",
			diveLand: !!scoreSeq.diveLand,
			diveRecover: !!scoreSeq.diveRecover,
			dived: !!scoreSeq._dived,
			takenDown: !!(scoreSeq.player && scoreSeq.player.takenDown),
			downAmt: scoreSeq.player ? +Number(scoreSeq.player.downAmt || 0).toFixed(2) : 0,
			hasBall: !!(scoreSeq.player && scoreSeq.player.hasBall)
		},
		scoreDiveTd: (x) => {
			if (!rb) return null;
			scoreSeq = null;
			sessionOver = false;
			setPaused(false);
			playActive = true;
			practiceAwaitSnap = false;
			fullReplay = null;
			rb.x = x != null ? x : (fieldLeft() + fieldRight()) / 2;
			rb.y = 100.35;
			rb._diveScore = true;
			rb._landX = rb.x;
			rb._landY = rb.y;
			rb._oobLand = false;
			rb.hasBall = true;
			layOutPlayer(rb, 1);
			scoreTouchdown();
			return window.__controlsTest.getScoreSeq();
		},
		slideTdFromLand: (landY, endY) => {
			if (!rb) return null;
			scoreSeq = null;
			sessionOver = false;
			setPaused(false);
			playActive = true;
			practiceAwaitSnap = false;
			fullReplay = null;
			getUpT = 0.6;
			rb.x = (fieldLeft() + fieldRight()) / 2;
			rb._landX = rb.x;
			rb._landY = landY != null ? landY : 99.15;
			rb.y = endY != null ? endY : 100.55;
			rb._diveScore = false;
			rb._oobLand = false;
			rb.hasBall = true;
			layOutPlayer(rb, 1);
			scoreTouchdown();
			const s = window.__controlsTest.getScoreSeq();
			return {
				y: +Number(rb.y).toFixed(2),
				landY: rb._landY != null ? +Number(rb._landY).toFixed(2) : null,
				inEz: rb.y >= 100,
				diveRecover: !!(s && s.diveRecover),
				seq: s
			};
		},
		tickScoreN: (sec) => {
			if (!scoreSeq) return null;
			tickScore(sec == null ? 0.05 : sec);
			return window.__controlsTest.getScoreSeq();
		},
		getUnis: () => ({ off: offUni, def: defUni }),
		getLogo: () => ({ rot90: !!logoFlip, along: 10, on: !!midLogoOn, peaks: logoFlip ? "north" : "left" }),
		setLogoFlip: (v) => { logoFlip = v ? 1 : 0; return !!logoFlip; },
		getPressSide: () => 1,
		getTurf: () => rb && {
			stain: +(rb.turfStainT || 0).toFixed(2),
			n: rb.turfN || 0,
			x: rb.turfX,
			y: rb.turfY
		},
		getEzArt: () => ezArtMode,
		setEzArt: (v) => {
			ezArtMode = v === true ? "mountains" : v === false ? "off" : v || "mountains";
			const s = $("ezArtSelect");
			if (s) s.value = ezArtMode;
		},
		nearGoal: (x) => {
			if (rb) {
				rb.x = x != null ? x : FIELD_WIDTH / 2;
				rb.y = 99.1;
			}
			cameraY = 102;
			camZoom = 1;
		},
		celebrateTd: (dx, x) => {
			lastSteer = {
				dx: dx || 0,
				dy: 1
			};
			scoreSeq = null;
			if (rb) {
				rb.x = x != null ? x : rb.x;
				rb.y = Math.max(rb.y, 100.15);
				rb.vx = dx || 0;
				rb.vy = 4;
			}
			celebrateTimer = 99;
			scoreTouchdown();
			return scoreSeq?.spikeStyle || null;
		},
		pylonPlace: () => {
			if (!rb) return;
			rb.x = fieldLeft() + 1.4;
			rb.y = 96.8;
			lastSteer = {
				dx: -.35,
				dy: 1
			};
			cameraY = 100;
		},
		startReplay: () => startFullReplay(),
		getSim: () => ({ dt: SIM_DT, maxSteps: SIM_MAX_STEPS, acc: +simAcc.toFixed(4) }),
		stepOnce: () => { step(SIM_DT); return SIM_DT; },
		setFieldWidth: (w) => {
			FIELD_WIDTH = Field.setWidth(w);
			const sel = $("widthSelect");
			if (sel) sel.value = String(FIELD_WIDTH);
			refreshScale();
			ballX = clampToHash(ballX);
			placeEntitiesForNewPlay();
			return FIELD_WIDTH;
		},
		setKeys: (codes) => {
			keys.clear();
			codes.forEach((c) => keys.add(c));
		}
	};
	raf = requestAnimationFrame(loop);
	return () => {
		cancelAnimationFrame(raf);
		clearAutoStart();
		window.removeEventListener("keydown", onKeyDown);
		window.removeEventListener("keyup", onKeyUp);
		window.removeEventListener("blur", onBlur);
		document.removeEventListener("visibilitychange", onVisibility);
		window.removeEventListener("gamepadconnected", onPadConnect);
		window.removeEventListener("gamepaddisconnected", onPadDisconnect);
		window.removeEventListener("pointerdown", wakePad);
		canvas.removeEventListener("pointerdown", onPointerDown);
		canvas.removeEventListener("pointermove", onPointerMove);
		canvas.removeEventListener("pointerup", onPointerUp);
		canvas.removeEventListener("pointercancel", onPointerUp);
		ro.disconnect();
		delete window.__controlsTest;
	};
}


window.startGame = startGame;
window.UNIFORMS = UNIFORMS;
window.OFF_PLAYS = OFF_PLAYS;
window.DEF_SCHEMES = DEF_SCHEMES;
