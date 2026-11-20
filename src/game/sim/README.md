# Shared sim core

Types live in `types.ts`. Import them from `./sim/types`.

`src/game/sim.ts` is the movement module. This folder does not replace it. Do not add an `index.ts` here. A barrel would compete with `sim.ts` on the `./sim` import.

Nothing in this folder runs a play. The interfaces are the shape to port into. `game.js` is still the authority for rules. `field.js` is only the field dimensions.

## Layers

The carrier specials and the pose sync stay underneath assignment execution.

1. The play layer picks a desired move for every player from the called play, the scheme, and the stick.
2. For the controlled ball carrier, that desired move is written into `Input` (`x`, `yard`, `action`, `sprint`) and passed to `step`.
3. `step` runs the existing machine: `trackBurst`, `specialMotion`, juke and hurdle gaps, `scriptDelta` for shake, hesitate, and spin, stiff-arm push, separation, and the ball on the carrier's right side.
4. `syncCarrierPose` then calls `carrierPoseName` from the pose action and the stride clock. That is the only pose sync. Other players stay on the bind pose.
5. Blockers and defenders do not enter `step`. Their assignments integrate position directly.
6. `ContactResult` is recorded beside `step`. The stiff-arm push already inside `step` is the one contact effect that stays in the carrier machine. A later resolver must not push that defender a second time.

`PlayInput` adds snap and teammate steer on top of `Input`. `step` reads only the original four fields, so the extra fields are safe to pass through.

The canvas has its own older burst (`activeMove` in `update`, with world-axis `extraDx` / `extraDy` and a hop arc). That is not the machine to port for the controlled carrier. The 3D clock already replaced it. Port the route, the blocks, the defensive jobs, and the contact outcomes. Leave hurdle height, juke stride, spin plant, dive get-up, and pose names on `sim.ts` and `carrierPose.ts`.

One canvas difference to keep in mind when the route is wired: while `useScript` is true, `update` ignores those `extraDx` bursts. Dive replaces the whole velocity. The 3D stack should not copy that. The route supplies the free-move stick, and `step` still applies a special on top of it.

## Coordinates and the spot

`field.js` defines the ground. Length 100, end zones 10, default width 75. Canvas X is the left sideline at 0. Canvas Y is the south goal at 0 and increases north. The 3D `yard` is that Y. World Z is `-yard`.

`hashLeft` / `hashRight` match `src/field/spec.ts`. At width 75 the hashes sit 6.15 yards off midfield.

Spotting, in `game.js`:

- `sideYardToAbsolute` / `absoluteToSideYard` (about 741–756). Own N is absolute N. Opp N is `100 - N`. Both clamp to 1–99. Yard 50 forces the own side.
- Game opening LOS is absolute 50 (`userStartYard`). Practice opening LOS is absolute 70, the opp 30 (`practiceStartYard`). `applyPracticeLosNow` writes that yard onto the ball and restages.
- `setSpotFromPlay` (1683). In bounds, clamp X onto the hashes. Out of bounds, use the left hash or the right hash on the side the ball crossed.
- `snapX` is the hash-clamped ball X. Formation X is measured from it.
- After a live play the new LOS is the spotted yard. Practice ignores the gain and returns to the practice yard.

`place.ts` is that spot in TypeScript: `resolveLos`, `sideYardToAbsolute`, `absoluteToSideYard`, and `hashSnapX`. `createSim` still pins `INITIAL_LOS` at 25 and places six bodies by hand: QB, two OL, two DL, one LB. `createPlaySim` is the full-roster companion and is not what the scene boots.

## Players and personnel

`createPlayer` (1713) is the canvas body. Sim fields worth keeping are on `PlayerRuntime` and `PlayAssignment`. Paint, turf stains, and fall layout stay in the canvas renderer.

Groups and the number pools are `NUM_POOLS` (36). Defaults (526–532): OL 5, FB 1, TE 3, QB 1, DT 3, LB 2, DB 5, plus one HB. `assignSideNumbers` deals from those pools.

Mass and speed scales by group are set in `createPlayer`, then OL / TE / QB / FB / DT / LB / DB speeds are overwritten while aligning. Radius is 0.95 for OL and DT, 0.9 for FB and TE, 0.85 otherwise.

`controlled` on the 3D `Player` is the carrier ring. On defense the canvas controlled body is `userDefender`, and `PlayInput.userSide` says which stick that is.

The ball starts on the HB. `placeEntitiesForNewPlay` nulls the QB, then sees a null QB and sets `handoffDone`. A QB is still aligned as a blocker when `numQB > 0`. `HandoffPhase` reserves a later toss. Do not invent one yet.

## Formation

There is no named formation list. Canvas `placeEntitiesForNewPlay` (1909) builds one from the personnel, the scheme, and the spot. The TypeScript port of that spacing is `placeEntitiesForNewPlay` in `place.ts`. It includes the defense-flip mirror, the one- and two-DB aligns, the wide-field wing inset, and the offense depth caps. It does not assign jobs. `attachAssignments` in `assign.ts` is the snap-time pass that comes next. `applyPresnapLook` in `look.ts` is the optional setup call after that. Until it runs, bodies stay on the placement spots.

Offense, measured from `snapX` and the LOS. `wt` is `fieldWideT`.

- HB: the primary back (`hb-0`, the carrier) uses the first QB's x. Further backs stay at `snap` plus `(i - (n - 1) / 2) * backGap`. With no QB, the primary back keeps the old snap offset. Yard `LOS - 5`.
- WR: 0–5, default 0, after the OL/TE row is final. Each stands in a 2-point stance. X is anywhere from one OL/TE gap outside the outer OL or TE on that side out to the sideline. With no OL or TE, that inner spot is one gap off the snap. Depth is 0.5 yards behind the LOS or exactly 1.5 yards behind it. TE+WR strictly left of the snap and strictly right of it differ by at most 4. A TE on the snap counts for neither side. The split, the X, and the depth are random (`call.random`, or `Math.random`). Draws start after the fullback roll. WR does not move the OL/TE row, the quarterback, or the backs, and does not enter the block list.
- OL and TE: one row, gap `(2.6 + wt * 1.55) / 2 * 1.25` between every neighbor. A central body is on the snap. An odd count uses the middle player. An even count uses one of the two central players and puts the extra bodies on the left or right sideline with equal chance (`call.random`, or `Math.random` when no draw is supplied). OL fill the middle slots left to right before that side roll. TEs alternate outside them, even index left and odd index right, with rank `floor(i / 2)` further out. When that split would put two more OL on one side of the snap than the other, the extra left TE moves to the right wing so the OL sides differ by at most one. An even number of tight ends is then repacked around the offensive line, chosen with `call.random` or `Math.random` after the side roll. When at least one OL is in the row, an OL stays on the snap and either wing may have up to two more tight ends than the other, including 3–1 and 1–3 around a single OL. A centered row that would put a TE on the snap while an OL is present shifts so that OL is on the snap. Odd tight-end counts are not re-rolled. With no OL, the repack stays on the centered slots. OL yard `LOS - 0.48`. TE yard `LOS - 0.4`.
- QB: every quarterback stands on the snap at 1.5 yards. Pushed onto the blocker list.
- FB: one, two, or three stand 3 yards off the LOS. Their x slots are positions 1, 3, and 5 of the 3-OL, 0-TE places: behind each of those three linemen. The halfway gaps are not used. Each offset is that multiple of the current OL gap (`(2.6 + wt * 1.55) / 2 * 1.25`), so a narrower field pulls the fullbacks in with the line. The snap picks a random set of those slots and keeps it when OL or TE changes. The stepper stops at 3. With four, three keep that 3-yard depth on three of those slots, and the fourth stands 1.5 yards off the LOS on one of the other slots except the middle. Five or more stay stacked at `LOS - 1.05 - 1.85 - i * 0.55`.

Defense uses the scheme cluster and depths. Depths shrink when the north end zone is close: `depthScale = min(1, room / 16)`.

- DT: across the snap, depth `min(0.84, room * 0.22 * 0.84 / 3.25)` plus the old ±0.15 jitter, clamped so `yard - LOS < 1`.
- LB: one linebacker stands on the snap. Two linebackers sit a hash gap either side of the snap. Three keep that center, the outer pair is 1.5× that gap, and those two stand 3 yards off the LOS. Four keep that center, the outer pair is 2× that gap and stands 3 yards off the LOS, and the inner pair stands together at 4 yards off the LOS. Wider counts use `clusterX`. Scheme depths of 3.6–6.8 fold into 2.25–4.75 yards, then ±0.2 jitter. The body is clamped to 2–5 yards off the LOS. Modes are middle, wide, left, right, and the spread default.
- DB slots by count: 1 free safety on the snap, 2 safeties, 3 corners plus free safety, 4 adds the strong safety, 5 adds a nickel, 6 and up add a dime. `dbRole` is the slot. The group stays DB. One or two DBs stand 8 yards off the LOS. With 3–5, the outer pair stands at 3 yards and the DBs between them stand at 8. Three span 3.3 times the distance between the hashes. Four keep those outside spots.

After the slots, the same function calls `assignDefenseJobs`, `assignBlockJobs`, `applyCellBlockTweaks`, `applyCellDefenseTweaks`, `limitDtPenetration` (at most one DT crosses the LOS, and only on overload, fire zone, bear, walk-up, or the unused storm call), `applyPresnapLook`, the lone-DB and two-DB aligns, `clampDbWings`, `spreadInteriorDefense`, `assignStations`, and `pinOffenseToOwnSide`.

`pinOffenseToOwnSide` (2455) caps OL and TE at `LOS - 0.28`, QB at `LOS - 0.85`, FB at `LOS - 1.5`, and the HB at `LOS - 4.2`.

`stationForDefender` / `stationForBlocker` (2482, 2495) turn a job or a block mode into `contain | fold | alley | cutback | gap`. That station is a label on the assignment, not a second behavior.

## Playbook

Stock calls live in `plays.ts` as `OFF_PLAYS` and `DEF_SCHEMES` (the same six rows as game.js, then Storm and Base). `ROUTE_TEMPLATES` and `ROUTE_BOOK` are there too. `resolveCalledPlay` mirrors a call, then `applyKeeperRoutes` replaces steps when the sheet has a cell. `altSteps` stay on the play as preview only. The carrier assignment does not run them.

`attachAssignments` (`assign.ts`) takes the roster from `placeEntitiesForNewPlay` and writes one `PlayAssignment` per player:

- The HB carrier gets a `route` assignment. `scriptIndex` and `scriptTimer` start at 0. `scriptLocked` copies `lockFirst`. The same index and timer sit on the route.
- OL, TE, QB, and FB get a `block` assignment from `assignBlockJobs`, plus `applyCellBlockTweaks`. Targets are defender ids.
- Defenders get a `defense` assignment from the scheme job (`assignCover4QuartersJobs`, `assignOverloadBlitzJobs`, `assignPreventJobs`, `assignFreeFireJobs`, `assignZoneBlitzJobs`, `assignJamMiddleJobs`), then the cell-defense tweaks and `limitDtPenetration`. Storm and Base do not run `assignStormBlitzJobs` or `assignSpinCycleJobs`. Their defenders keep the alignment landmark (`pursue`), and `limitDtPenetration` still shades the tackles. Storm is on the penetrate allow-list, so one tackle can cross. Base is not, so every tackle stays in a gap. The roll is the canvas `mulberry32(hashSeed(...))` seed, so the same scheme, personnel, yard, and width restage the same jobs.
- A defense flip is undone on the working copy before those jobs, then the landmarks are mirrored again. That matches the canvas, which assigns on the unmirrored front and mirrors afterward. Placement has already mirrored the bodies.
- Everyone else, including a second HB, gets `pursue`.

The job pass does not change `Player.x` or `Player.yard`. It does not call `step`.

Stock calls are `OFF_PLAYS` (47) and `DEF_SCHEMES` (168) in game.js.

| Play id | Name | Block style | Lock first step |
| --- | --- | --- | --- |
| `blastR` | Blast | `zoneR` | no |
| `sweepL` | Pitch | `wallL` | no |
| `sweepR` | Sweep | `wallR` | no |
| `river` | River | `river` | yes |
| `diveL` | Zig Zag | `zigzag` | no |
| `wedgeL` | Wedge | `wedgeL` | no |

Schemes: Quarters `cover4Quarters`, Overload `overloadBlitz`, Prevent / Cloud `prevent`, Bear `tight`, Fire Zone `wide`, Walk-Up `goalLine`, then Storm `stormBlitz` and Base `base`. Each stores `depthLB`, `depthDB`, and `cluster`. Next play still walks this list in order, so the first six calls are unchanged.

`choosePlay` (1856) locks the practice or huddle id, or picks at random and avoids repeating in a game. `chooseScheme` (1882) does the same, with Quarters and Prevent weighted twice.

`mirrorPlay` (1819) flips an id's trailing L/R, negates arrow and step `dx`, and swaps directional block styles. River and zigzag stay. `baseId` keeps the stock id.

`applyKeeperRoutes` (1838) overwrites `steps` from `ROUTE_BOOK`:

1. `playBookKey` (287) maps the play to `blast | pitch | sweep | river | zigzag | wedge`.
2. `cellFacing` (298). River and wedge use the defense flip. The others use the offense flip.
3. `ROUTE_BOOK[key][schemeId][facing]` supplies `primary` and optional `secondary`.
4. `ROUTE_TEMPLATES` (213) turns those ids into steps. Primary replaces the path and the arrow. Secondary is `altSteps`.

`altSteps` are drawn and saved on clips. The carrier never runs them. Missing cells keep the stock steps.

`ROUTE_TEMPLATES` ids are the `RouteTemplateId` union. `bounceR` and `cutbackR` are the Quarters clips, trimmed 10 yards past the LOS.

## How a play runs

`update` (7888) is the frame. Most of it is HUD, pause, replay, and the practice book. The sim portion is the sequence below. Fixed step is `SIM_DT = 1/60`, at most 8 steps per frame.

Phases on `PlayClock`:

- **presnap.** `practiceAwaitSnap`. Offense confirms to snap. Defense can nudge and auto-snaps after 1.1–2.1 seconds when the next play is automatic (`armGameDefAutoSnap`). Cycling the practice book calls `placeEntitiesForNewPlay` again.
- **live.** `playActive`, after `preSnapTimer` (usually already 0).
- **between.** `pauseTimer` after the whistle, then either another presnap huddle or an automatic snap.
- **fumble** and **score.** `tickFumble` and `tickScore`. They are separate modes. Leave them unimplemented.

Live order once the carrier exists:

1. Age the play. Start a canvas burst only if the handoff is done and the user is on offense (`startMove`, 8488). On defense, `tickUserDefense` owns the controlled defender instead.
2. Integrate the carrier (8500). Speed is group speed times `offMult`, `playSpeed` (default 1.1), and sprint. Fatigue exists on the canvas (`SPRINT_MULT` 1.38, `SPRINT_GRACE` 3). The 3D carrier has no fatigue. The full 1.38 already applies inside `step` while sprint is the pose.
3. Route cursor, user on offense (8547). While `index < steps.length`, velocity is `(dx, dy) * speed`. `timer` advances by `dt`. At `timer >= step.t` the cursor moves on and the timer resets. A stick component past 0.15 abandons the route, unless the cursor is still on step 0 and `lockFirst` is set. CPU offense (`cpuOffenseDrive`, 5739) uses the same cursor and never abandons it. After the script it aims north and bends away from the nearest live defender inside 4.4 yards.
4. If the route is not driving, velocity is the stick plus the canvas burst extras. Dive is its own branch ahead of both. Out of bounds ends the play through `endPlay`.
5. Blockers (8774). Skip a body while `userControlTime` is up. Drop a target that has beaten the runner or fallen more than 6.2 yards behind, then claim a new one. Seek a point from the block mode: pull landmarks by phase, reach and climb on the target's play side, backside seal, or a lane next to the runner. Step is capped at 0.55 yards. Speed scales by style, pull phase, and play age.
6. Contact (8966). `contact.ts` approximates the overlap: a held block, a pancake, or a shed (`broken`). The canvas also rolls a miss and a tackle. Those stay out. `breakBlock` is the canvas default 0.75. The stiff-arm shove stays inside `step` and is not applied again here.
7. Defenders (9093). An engagement holds them in place. Whiff and recover slide, then pursue. Otherwise they count down read, react, misfire, and blitz delay, pick a target from the job (zone box, man blocker, blitz landmark, spy phases, stutter), and chase once the runner is close or the zone is past. `chooseDefenderAttack` (5778) may start a dive, hit, or wrap. Those clocks are `PlayerRuntime.attack`.
8. `separate`, `separateOpposing`, and `applyAssignmentRepulsion` keep bodies apart. The 3D `separate` in `sim.ts` is a different, smaller push for the six preview players. Do not replace it until the full roster exists.

`assignBlockJobs` (2676) is the snap-time block table. Styles in that function: zone, wall (the sweep pulls), swing, river, wedge, zigzag, then a generic pull. Each style claims defenders with its local `takeDef` and sets mode, drive side, pull path, and level. `applyCellBlockTweaks` (2223) is the keeper-sheet patch on top.

`assignDefenseJobs` (4166) dispatches by scheme id to `assignCover4QuartersJobs`, `assignOverloadBlitzJobs`, `assignPreventJobs`, `assignFreeFireJobs` (Fire Zone), `assignZoneBlitzJobs` (Bear), and `assignJamMiddleJobs` (Walk-Up). The canvas also has `assignStormBlitzJobs` and `assignSpinCycleJobs` (`base`). Those two ids are not in the live `DEF_SCHEMES` list. The TypeScript book appends them and does not copy those job functions. Anything else falls through to the random shell at the bottom of `assignDefenseJobs`. Practice jobs are seeded with `mulberry32(hashSeed(...))` so the same call and personnel restage the same picture.

## Assignment execution

`stepAssignments` in `advance.ts` is the play frame. `createSim` does not call it. The R3F view does. `boot.ts` places the default personnel at the opening LOS of 50, assigns Blast against Quarters, runs `applyPresnapLook` and `spreadInteriorDefense`, and seats that roster on `createPlaySim`. Each frame calls `stepAssignments`. Escape pauses that live play, and so does a right-stick click (gamepad button 11, R3; a raw T-9 uses the remapped slot, physical button 14). P still cycles the steering profile, so it is not the pause key. While paused the view does not call `stepAssignments` or `tickClock`, the banner says Paused, and the orbit camera still moves. The same key or click resumes from the current state. Escape still leaves instant replay, and pause does not run during a whistle, a replay, or `?preview=1`. `?preview=1` keeps the six-player `createSim` path and the plain `step` for pose work. When a tackle sets `playOver`, or the carrier reaches yard 100, the view stops stepping. The score uses the canvas points: the yards gained, plus 10 when the gain is 10 or more, minus 2 for a loss, or 100 for a touchdown. The next line of scrimmage is the downed yard, hash-spotted, except a score, which draws the canvas post-score spot from the 20 to the opponent 20. Enter, N, or Next play rotates to the next authored play and scheme and snaps again. R, or Replay, scrubs the last 10 seconds: Left and Right play backward and forward, and 1, 2, and 3 set 0.5×, 1×, and 2×. During that scrub, Q and E yaw around the carrier, F and V pitch, Page Up and Page Down (or + and −) zoom, and 0 or Follow sits back behind him. The wheel and mouse drag orbit that same point. Escape or R leaves the scrub and puts the camera behind the live carrier again. The live sim stays at the whistle. The sim's `players` array is the roster from `attachAssignments` (same objects), so the controlled halfback is who `step` moves.

Each frame:

1. If the carrier route still has a step, that step's `dx` / `dy` become the stick. `scriptTimer` grows by the frame, capped at 0.05s the same way `step` caps `dt`. At `t`, the timer resets and `scriptIndex` moves on. A stick axis past 0.15 sets the index to the end of the path, except while `lockFirst` is holding step 0. After that, the caller's stick is the aim.
2. `action` and `sprint` pass through. `step` still owns juke, spin, hurdle, truck, stiff-arm, dive, sprint, the carrier's travel, separation of the whole roster, the ball on the right hand, and pose sync.
3. Blockers drop a target the runner has beaten (more than 1.8 yards behind and closer to the ball) or left more than 6.2 yards back, then claim a free defender in their lane. A shed, a finished hold, or a pancake promotes the block to the second level: mode `climb`, a deeper gap, and the next linebacker or safety instead of another tackle. When the gain is past 6.2 yards and no free defender is in the crease, the blocker washes a lane beside the runner instead of locking that next body. The lane is offset by the seal side and widens as the gain grows. Pull phases still advance. The aim is the pull waypoint, a spot beside the target, the gap aim, or a lane next to the carrier. Hold Z to take the nearest offensive lineman, tight end, or fullback on the carrier's left. Hold X for the right. Releasing Z or X returns that blocker to the block or the climb. On this path those keys do not also stiff-arm. The pad triggers still do. `?preview=1` still uses Z and X as stiff-arm. P cycles Wings, Independent, then Classic. Wings drives the selected blocker with the carrier's stick. Independent and Classic keep that stick on the carrier and drive the blocker with U/B/K/O (up/left/down/right on the screen) or a standard pad's right stick. Classic stiff-arm is Tab and \\ on the keyboard, or Select/View and Start/Menu on a pad. The triggers do not stiff-arm in Classic. There is no celebrate control and no fumble, so those Classic switches have nothing to turn off.
4. A zone defender (deep, drop, flat, curl, hook, robber, contain, spy, shade) does not sit on one dot. While the runner is at least 3.2 yards away and has not cleared the landmark, the defender slides to the runner's spot clamped inside the zone box. The box starts at 0.82 of its size and opens to 1.15 after 1.2 seconds. A blitz or man player with `blitzDelay` only drifts for that many seconds, then he can charge. Inside 3.2 yards, or once the runner is 2.4 yards past the landmark, he chases. The looser key distances remain 3.2 for a blitz or man job, 6.4 for underneath zones, and 7.2 for a deep safety. Storm and Base are the only schemes that change those numbers, and only after the snap. Storm breaks off sooner (key distance × 1.45, or 1.4 yards past the landmark), shortens a blitz delay, opens the zone box, runs defenders at 1.18×, and chases on a tighter angle. Base holds the gap longer (key distance × 0.68, or 3.6 yards past the landmark), keeps the zone box smaller, and runs defenders at 0.88×. Quarters, Overload, Prevent, Bear, Fire Zone, and Walk-Up keep the numbers in this paragraph.
5. If a blocker overlaps his target, `resolveBlockContact` writes a `ContactResult`. A hold lasts about 1.15 seconds for an offensive lineman or tight end on a tackle and about 0.55 otherwise, longer when the block is sturdy. The defender is slowed and does not chase while the hold lasts, and he is driven unless the carrier is stiff-arming. A stable pair roll can pancake him for 0.7 seconds. After about 2.1 driven yards on a tackle (1.15 otherwise) the block sheds (`broken`) and the defender recovers. Speeds are the canvas group rates (OL 8.8, TE 8.7, QB 7.35, FB 8.95, HB 9, DT 7.7, LB 8.55, DB 9.15 yards per second). Blocker seek speed also takes the canvas fatigue after 4.5 seconds, the wall, zone, pull, and backside-seal multipliers, and a 1.06 bump while the carrier has been idle.
6. A free defender who touches the carrier is judged once per approach. A squared-up angle finishes more often. The canvas break-tackle value 1.5, a sprint, and a stiff-arm make a miss more likely. A miss (`whiff`) delays that defender for 0.4 seconds and the carrier keeps moving. A finish (`tackled`) sets `sim.playOver` and zeroes the carrier's stick for that frame. `step` does not add a second shove. The view then scores the down and waits for the next snap.

## Presnap look

After `attachAssignments`, call `applyPresnapLook(assigned, los)` once. It is not part of the frame loop. `createSim` does not call it.

The pass matches the canvas scheme picture: Quarters and Walk-Up plant deep fourths, Prevent plants a deep cloud, Bear tightens the box and shades tackles into the offensive-line gaps, Fire Zone bumps the corners and inside linebackers, Overload sets the two inside safeties. Bodies are unstacked, defenders are pushed off the line, and one or two defensive backs are planted deep. Offense faces north. Defense faces south.

`spreadInteriorDefense` then runs. Three defensive backs are spaced across 3.3 times the distance between the hashes, inset 9.2 yards from each sideline. Four keep those same outside spots and stand equally spaced between them. With five or more, the outer ones stay wings (four wings when there are six or more) and the other backs, when there are at least three of them, use `min(width * 0.52, 11.5 + count * 3.7)` with their own count. Tackles and linebackers keep the X they had. Landmark X follows that spot. One defensive back is planted on the snap.

## What remains

The core port is functionally complete on the default R3F path. Placement, the six stock plays, Quarters through Walk-Up, Storm and Base movement, the presnap look, assignment stepping, contact, scoring, downs, the clock, teammate steering, and instant replay are in. `?preview=1` and the carrier machine in `sim.ts` stay as they were.

These are limits of that port, not a second scheme left to add:

- The series is a score, a down, and a spotted next snap. A failed fourth down is a turnover and refuses another snap. There is no drive summary.
- Tackles are one roll per approach. There is no dive, wrap, or hit animation, and `breakTackle` does not change per play.
- The zone box breathes and a blitz delay hesitates. Defenders do not run a spy phase or a full zone drop with a read timer.
- Second-level blocking washes an open crease beside the runner once the gain is past 6.2 yards, and climbs to the next defender when that lane is taken. Blocker speed fatigues after about 4.5 seconds, takes the early wall, zone, pull, and backside-seal surge, and adds a bump while the carrier is idle.
- Teammate steering cycles Wings, Independent, and Classic. There is no saved control layout.
- The game clock starts at 2:00 and runs only while a play is live. It holds between snaps and during replay. A snap that is already live runs out the clock and finishes on its own whistle. Time expired appears only after that whistle. The next snap is refused once the clock is at 0:00, and also after a turnover on downs. A (gamepad button 0) then starts a fresh game. A new series is 1st & 10, or 1st & Goal inside the 10. A gain that meets the distance is a first down. Otherwise the down advances. Fourth down without a first down ends the series. A touchdown starts a new series at the post-score spot.
- Replay stores a pose and each player's position about every 80 ms, and only the last 10 seconds. Zoom and orbit apply only while the scrub is open. It does not save a clip.
- Storm and Base change pursuit after the snap. They do not draw the canvas storm-blitz picture or the spin-cycle arcs. The stiff-arm push stays in `step`.

The six-player preview in `createSim` is unchanged. `step` still accepts a plain `Player` and a plain `Input`. The route and the job seeks run only through `stepAssignments`.
