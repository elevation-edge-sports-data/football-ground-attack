/**
 * Shared sim types for a future play layer.
 *
 * `src/game/sim.ts` stays the low-level movement machine for the controlled
 * carrier: `step`, the special-move clock, and `syncCarrierPose`. Nothing
 * here changes that. Import these types from `./sim/types`. The `./sim`
 * module is the movement file, not this folder.
 *
 * Assignment execution will sit above that machine. It chooses a desired
 * move for each player. The controlled carrier's move becomes `Input` and
 * goes through `step`, so juke, spin, hurdle, truck, stiff-arm, dive, and
 * sprint still own the body and the pose. Everyone else is moved from their
 * assignment directly. They do not enter the carrier pose clock.
 * `ContactResult` is filled beside that, not inside the pose sync.
 *
 * Canvas `y` is this project's `yard`. +x is the right sideline. +yard is north.
 */
import type { Input, Player, Team } from "../sim";

/** Canvas personnel bucket. The 3D label "DL" is this group's "DT". */
export type PersonnelGroup = "QB" | "HB" | "FB" | "TE" | "OL" | "DT" | "LB" | "DB";

/** DB alignment tag. The player's group stays "DB". */
export type DbAlignRole = "CB" | "FS" | "SS" | "NCB" | "DIME" | "DB";

/**
 * Counts that build a formation. The canvas defaults are OL 5, FB 1, TE 3,
 * QB 1, HB 1, DT 3, LB 2, DB 6. HB is always one.
 */
export type PersonnelCounts = {
  ol: number;
  fb: number;
  te: number;
  qb: number;
  hb: number;
  dt: number;
  lb: number;
  db: number;
};

export const DEFAULT_PERSONNEL: PersonnelCounts = {
  ol: 5,
  fb: 1,
  te: 3,
  qb: 1,
  hb: 1,
  dt: 3,
  lb: 2,
  db: 6,
};

/** Where a scheme clusters the linebackers across the formation. */
export type ClusterMode = "spread" | "left" | "right" | "middle" | "wide";

/**
 * Authored defensive calls in `DEF_SCHEMES`.
 * Storm (`stormBlitz`) and Base (`base`) are in that list after the original six.
 * Their post-snap movement is a modifier in `advance.ts`, not a separate job table.
 */
export type DefenseSchemeId =
  | "cover4Quarters"
  | "overloadBlitz"
  | "prevent"
  | "tight"
  | "wide"
  | "goalLine";

export type ExtraSchemeId = "stormBlitz" | "base";

export type DefenseScheme = {
  id: DefenseSchemeId | ExtraSchemeId;
  name: string;
  /** Linebacker depth in yards north of the LOS, before the goal-line squeeze. */
  depthLB: number;
  /** Deep-DB landmark depth in yards north of the LOS. */
  depthDB: number;
  cluster: ClusterMode;
};

/** Preview and mirror book. `diveL` is the Zig Zag play, not the dive special. */
export type OffensePlayId = "blastR" | "sweepL" | "sweepR" | "river" | "diveL" | "wedgeL";

/** Row used to look up a keeper route. Resolved from id, name, and block style. */
export type PlayBookKey = "blast" | "pitch" | "sweep" | "river" | "zigzag" | "wedge";

export type BlockStyle =
  | "zoneR"
  | "zoneL"
  | "wallL"
  | "wallR"
  | "pullL"
  | "pullR"
  | "swingL"
  | "swingR"
  | "river"
  | "wedgeL"
  | "wedgeR"
  | "zigzag"
  | "tight";

/**
 * One beat of a ball-carrier path.
 * `dx` is right-sideline yards, `dy` is north yards, `t` is seconds on this aim.
 * The runner uses the pair as a direction, then multiplies by speed. It is not
 * a world coordinate.
 */
export type RouteStep = {
  dx: number;
  dy: number;
  t: number;
};

export type RouteTemplateId =
  | "ozR"
  | "ozL"
  | "blastR"
  | "blastL"
  | "arrowR"
  | "arrowL"
  | "needleL"
  | "needleR"
  | "sweepL"
  | "sweepR"
  | "stretchR"
  | "stretchL"
  | "counterR"
  | "counterL"
  | "floodR"
  | "floodL"
  | "diveL"
  | "leadL"
  | "plungeL"
  | "delayMid"
  | "pressL"
  | "shortL"
  | "shortCounterR"
  | "flatArrowL"
  | "bounceR"
  | "cutbackR";

/**
 * Stock offense play, before a mirror or a keeper-route swap.
 * `steps` are the path the carrier actually runs. `altSteps` are the dashed
 * preview only. The sim does not steer along `altSteps`.
 */
export type OffensePlay = {
  id: OffensePlayId | string;
  name: string;
  /** Lateral samples for the play-art arrow. A mirror negates each one. */
  arrow: number[];
  blockStyle: BlockStyle;
  /**
   * When true, stick input cannot leave step 0 early.
   * Later steps still yield once the stick is clearly off center.
   */
  lockFirst: boolean;
  steps: RouteStep[];
  altSteps?: RouteStep[] | null;
  /** Id before `mirrorPlay`. Absent on a stock row until it is copied in. */
  baseId?: string;
};

/** River and Wedge follow the defense flip. Every other key follows the offense flip. */
export type CellFacing = "stock" | "flipped";

/** One cell of `ROUTE_BOOK`: primary replaces `steps`, secondary becomes `altSteps`. */
export type KeeperRoutes = {
  primary: RouteTemplateId;
  secondary?: RouteTemplateId;
};

export type SchemeRouteSheet = Partial<Record<DefenseSchemeId, Partial<Record<CellFacing, KeeperRoutes>>>>;

export type RouteBook = Partial<Record<PlayBookKey, SchemeRouteSheet>>;

/** Own 1–50 reads south of midfield. Opp 1–50 reads north of it. 50 is midfield. */
export type YardSide = "own" | "opp";

export type YardCall = {
  side: YardSide;
  /** 1 through 50. */
  yard: number;
};

export type SpotReason = "los" | "hash" | "oob-left" | "oob-right";

/**
 * Ball and line of scrimmage.
 * In-bounds spots clamp X onto the hashes. An out-of-bounds spot uses the
 * hash on the sideline the ball crossed. The next play's LOS is this yard.
 */
export type BallSpot = {
  /** Absolute yard line. South goal is 0. North goal is 100. */
  yard: number;
  x: number;
  reason: SpotReason;
};

/**
 * Inputs to a personnel formation. The canvas does not store a named formation.
 * `placeEntitiesForNewPlay` builds slots from these counts, the scheme depths,
 * and the field width.
 */
export type FormationCall = {
  personnel: PersonnelCounts;
  scheme: DefenseScheme;
  /** 0 on the narrow reference width, 1 on a wide field. Canvas `fieldWideT`. */
  fieldWide: number;
  /** Absolute LOS. Offense aligns on and south of this yard. */
  los: number;
  /** Hash-clamped snap X. */
  snapX: number;
  offenseFlipped: boolean;
  defenseFlipped: boolean;
};

/** A placed body, before jobs are assigned. Yards are relative to the snap. */
export type AlignSlot = {
  group: PersonnelGroup;
  /** Index within the group. OL and DL run left to right. FB stacks behind the QB. */
  index: number;
  /** Yards right of the snap spot. Negative is toward the left sideline. */
  xFromSnap: number;
  /** Yards north of the LOS. Negative is the backfield. */
  yardFromLos: number;
  dbRole: DbAlignRole | null;
};

export type BlockMode = "man" | "reach" | "climb" | "pull" | "seal";

/** Art station derived from the job or the block. Not a separate assignment. */
export type StationRole = "contain" | "fold" | "alley" | "cutback" | "gap";

export type PullVia = {
  /** First landmark, usually a step into the backfield. */
  x: number;
  y: number;
  /** Second landmark, outside the play-side gap. */
  x2: number;
  y2: number;
};

/**
 * What one blocker is trying to do right now.
 * Assigned at the snap from `blockStyle`, then retargeted during the play
 * when the defender is beaten, stale, or unclaimed.
 */
export type BlockAssignment = {
  kind: "block";
  mode: BlockMode;
  /** Defender id. Null when the blocker is running to a landmark only. */
  targetId: string | null;
  /** +1 toward the right sideline. 0 until a side is chosen. River washes each blocker outward. */
  driveSide: -1 | 0 | 1;
  sealSide: -1 | 1;
  /** Preferred depth north of the LOS once the block climbs to the second level. */
  levelY: number;
  driveBlock: boolean;
  sturdyBlock: boolean;
  backsideSeal: boolean;
  /** 0 toward the first pull point, 1 toward the second, 2 onto the target. */
  pullPhase: 0 | 1 | 2;
  pullVia: PullVia | null;
  pullBoost: number;
  gapAimX: number | null;
  gapAimY: number | null;
  station: StationRole;
  /**
   * The first block has shed or finished. The next claim is a linebacker,
   * a deeper gap, or the climb point in `gapAim`.
   */
  secondLevel?: boolean;
};

export type DefenseJob =
  | "pursue"
  | "blitz"
  | "man"
  | "deep"
  | "drop"
  | "flat"
  | "curl"
  | "hook"
  | "robber"
  | "contain"
  | "spy"
  | "shade";

/**
 * What one defender is trying to do until the runner is close enough to chase.
 * Landmarks are field points. A follow zone copies them from the defender each frame.
 */
export type DefenseAssignment = {
  kind: "defense";
  job: DefenseJob;
  /** Landmark. Canvas `jobX` / `jobY`. */
  x: number;
  yard: number;
  zoneRx: number;
  zoneRy: number;
  /** Drop and spy track the defender. Other zones stay on the snapped landmark. */
  zoneFollow: boolean;
  station: StationRole;
  stationX: number;
  stationYard: number;
  /** Blocker id for a man assignment. Canvas stored this as `manIdx` into the blocker list. */
  manTargetId: string | null;
  /** Seconds of disguise before the real job. Canvas `readT`, counted down on the runtime. */
  readTime: number;
  blitzDelay: number;
  stutter: boolean;
  stutterX: number;
  stutterYard: number;
  artCurve: boolean;
  fakeBlitz: boolean;
  /** Seconds the fake show lasts. */
  reactTime: number;
  dbRole: DbAlignRole | null;
  isCorner: boolean;
  isSafety: boolean;
  aggressor: boolean;
  /** While this is still counting down, the defender tracks the wrong blocker. */
  misfireTime: number;
  misfireTargetId: string | null;
  /** Lateral shade so pursuit does not stack on one point. */
  laneOffset: number;
  /** The one DT allowed to cross the LOS on schemes that slant. */
  dtPenetrate: boolean;
};

/**
 * Ball-carrier path. One cursor for the play, stored on the carrier.
 * The canvas keeps the same cursor in `scriptIndex` / `scriptTimer`.
 * A stick past the deadzone abandons the path, except during a locked first step.
 * After the last step the carrier is free.
 */
export type RouteAssignment = {
  kind: "route";
  steps: RouteStep[];
  index: number;
  /** Seconds already spent on `steps[index]`. */
  timer: number;
  lockFirst: boolean;
};

/** No authored job yet. Presnap defenders and idle bodies use this. */
export type PursuitAssignment = {
  kind: "pursue";
};

export type PlayAssignment = RouteAssignment | BlockAssignment | DefenseAssignment | PursuitAssignment;

/**
 * One block overlap. `contact.ts` writes this.
 * `engaged` is a held block. `pancaked` puts the defender on the ground.
 * `broken` is a shed: the block did not hold.
 * `whiff` is a missed tackle: the carrier keeps going and the defender is late.
 * `tackled` ends the play. Callers read `Sim.playOver`.
 */
export type ContactOutcome = "engaged" | "pancaked" | "broken" | "whiff" | "tackled";

export type ContactResult = {
  outcome: ContactOutcome;
  actorId: string;
  targetId: string;
  /** How long the outcome holds, in seconds. */
  duration: number;
  /** Yards the defender has already been driven. Canvas `_pushYards`. */
  pushYards: number;
};

export type PlayerMotion = "pursue" | "breakdown" | "commit" | "whiff" | "recover" | "dive" | "hit";

export type AttackKind = "dive" | "hit" | "wrap";

/**
 * Clocks and flags that change during a play.
 * Visual-only canvas fields (uniform paint, turf stains, fall poses) stay out.
 */
export type PlayerRuntime = {
  vx: number;
  vy: number;
  active: boolean;
  hasBall: boolean;
  motion: PlayerMotion;
  whiffTime: number;
  recoverTime: number;
  /** Remaining seconds of a held block. Zero means not engaged. */
  engageTime: number;
  pushYards: number;
  pancaked: boolean;
  takenDown: boolean;
  /** Remaining slow from a block or a stiff-arm. */
  slowed: number;
  /** Remaining read before the defender commits to the run. */
  readLeft: number;
  /** Remaining seconds of user teammate or user-defender control. */
  userControlTime: number;
  sprintOn: boolean;
  lagTime: number;
  attack: AttackKind | null;
  attackTime: number;
  /** Last contact this frame. Null until a resolver exists. */
  contact: ContactResult | null;
};

/**
 * A canvas or 3D player plus the play layer.
 * Position, facing, team, role label, `controlled`, and `hop` stay on `Player`
 * so the carrier machine can keep using the same object.
 */
export type PlayerState = Player & {
  group: PersonnelGroup;
  number: number;
  assignment: PlayAssignment;
  runtime: PlayerRuntime;
};

export type PlayPhase = "presnap" | "live" | "between" | "fumble" | "score";

export type HandoffPhase = "pre" | "toss" | "done";

/**
 * One called play. Not stored on `Sim`.
 * The carrier's `RouteAssignment` is the live cursor. This record is the call
 * that produced it, the spot, and the phase around the play.
 */
export type PlayClock = {
  phase: PlayPhase;
  userSide: Team;
  spot: BallSpot;
  personnel: PersonnelCounts;
  play: OffensePlay | null;
  scheme: DefenseScheme | null;
  /** Seconds since the snap. Canvas `playAge`. */
  age: number;
  /**
   * The canvas starts the ball on the HB and marks the handoff done.
   * The toss phases are reserved for when a real exchange is ported.
   */
  handoff: HandoffPhase;
};

/**
 * Stick and play calls for one frame.
 * `x`, `yard`, `action`, and `sprint` are the carrier `Input` that `step`
 * already reads. The extra fields are for the play layer. `step` ignores them,
 * so a `PlayInput` can be passed to the carrier machine unchanged.
 *
 * When `userSide` is `"def"`, `x` / `yard` steer the controlled defender.
 * The offense carrier then follows the route on its own.
 */
export type PlayInput = Input & {
  userSide: Team;
  /** Snap the ball. Canvas confirm while the play is waiting. */
  snap: boolean;
  /** Field-axis steer for the left and right teammates. Null when that control is up. */
  teammateLeft: { x: number; yard: number } | null;
  teammateRight: { x: number; yard: number } | null;
  /**
   * Wings: hold to drive the nearest OL, TE, or FB on that side with the same stick.
   * Independent: Z/X still pick the side. `blockerX` / `blockerYard` drive that blocker.
   * Releasing Z/X returns the blocker to the block or the second-level climb.
   */
  steerLeft?: boolean;
  steerRight?: boolean;
  steerMode?: "wings" | "independent" | "classic";
  /** Field-axis stick for the selected blocker. Used only in Independent mode. */
  blockerX?: number;
  blockerYard?: number;
};
