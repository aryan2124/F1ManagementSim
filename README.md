# BOX BOX

A click-to-advance, multiplayer-ready F1 management game with pixel-art race weekends.
Real 2026 teams and drivers, real circuit layouts, a playable qualifying session and the real sporting rules.
Personal and private project: the real names and track shapes are used without licences, so do not publish or sell it.

Stack: Vite, React 19, TypeScript, PixiJS 8, Vitest, Cloudflare Workers + Durable Objects.

## 1. Run it on your computer

1. Install Node.js 20 or newer from https://nodejs.org (check with `node -v`).
2. Unzip the project and open a terminal inside the `box-box` folder.
3. Install dependencies:
   ```
   npm install
   ```
4. Start the game:
   ```
   npm run dev
   ```
   Open the URL it prints (usually http://localhost:5173).
5. For the multiplayer league panel, open a second terminal in the same folder and run:
   ```
   npm run dev:worker
   ```
   This starts the Cloudflare Worker locally on port 8787. The Vite dev server already proxies `/api` to it.
6. Play: pick a team and a Grand Prix, then GO TO QUALIFYING (or SKIP TO THE GRID). Qualifying is live Q1, Q2 and Q3: send your cars out from the right hand panel (tyre, new or used set, one or two flying laps) or let the team run them. Then the Briefing (starting grid, tyre choice), then the race. Press START LIGHTS, use the speed buttons (up to 32x), click a driver to follow, and call pit stops or push levels from the car card. You must use two different dry compounds, or the car is disqualified.

## 2. Check that everything works

```
npm test           # sim determinism, no car overlap, F1 rules, qualifying, pole time calibration, real names, league logic, UI flow
npm run typecheck  # app and worker types
npm run build      # production bundle into dist/
```

## 3. Deploy to Cloudflare

1. Create a free account at https://dash.cloudflare.com.
2. Log in from the terminal:
   ```
   npx wrangler login
   ```
3. Deploy:
   ```
   npm run deploy
   ```
   Wrangler builds the site, uploads the static assets, the Worker and the `LeagueRoom` Durable Object (migration `v1` is already in `wrangler.jsonc`). It prints a `*.workers.dev` URL.
4. Optional custom domain: Cloudflare dashboard, Workers & Pages, your `box-box` Worker, Settings, Domains & Routes, Add custom domain.
5. Optional auto-deploy: push the folder to GitHub, then in the dashboard go to Workers & Pages, box-box, Settings, Build, Connect to Git. Build command `npm run build`, deploy command `npx wrangler deploy`.

Durable Objects need the Workers Paid plan or the free SQLite-backed tier; if wrangler complains, check your plan under Workers & Pages, Plans.

## 4. How the code is laid out

- `src/sim/` pure deterministic engine (10 ticks/s, seeded RNG, command log, state hash). `engine.ts` is the race, `qualifying.ts` is Q1/Q2/Q3, `track.ts` turns a centreline into a speed profile. No DOM, no Pixi, so it can also run inside the Worker.
- `src/game/` real teams and drivers (`data.ts`), the junior ladder (`people.ts`), the circuit list and calibration (`circuits.ts`), the GPS layouts (`circuitGeo.generated.ts`), weekend setup, and the live session wrappers (`live.ts`, `session.ts`, `qsession.ts`) for pacing, speed control and interpolation.
- `src/render/` PixiJS pixel renderer (640x360 canvas scaled with `image-rendering: pixelated`). `trackArt.ts` draws the world around each circuit from a theme (park, pine, alpine, dry, desert, city, night city, tropical, dunes), plus pit lane, garages, lake and sea.
- `src/ui/` React screens: Menu, QualiScreen, Briefing, RaceScreen, Results, league panel.
- `src/shared/league.ts` pure reducer for click-to-advance leagues (join, ready, away). A day advances only when everyone is ready or marked away. No timers anywhere.
- `src/worker/` Cloudflare Worker plus the `LeagueRoom` Durable Object (WebSocket hibernation, state saved with `ctx.storage`).

## 5. Real data, rules and how it is calibrated

**Circuits.** Layouts are real GPS centrelines from the MIT licensed dataset https://github.com/bacinger/f1-circuits. `scripts/import-circuits.mjs` converts it into `src/game/circuitGeo.generated.ts`:

```
git clone https://github.com/bacinger/f1-circuits /tmp/f1c
node scripts/import-circuits.mjs /tmp/f1c
```

The 2026 calendar has 23 rounds (Bahrain and Saudi Arabia are not on it, so Sakhir and Jeddah sit under CLASSIC CIRCUITS; the round that replaces them is run at Sepang as "Bahrain Grand Prix" in the data, change it in `circuits.ts` if your calendar differs). Race distance is the fewest whole laps over 305 km (260 km at Monaco). Every circuit has a `gripScale` tuned so one solo qualifying lap lands within 2% of the real pole time; `tests/calibration.test.ts` enforces it. Circuits without a reference time (Madring and some classics) use a typical value.

**Rules implemented.** Race: two different dry compounds or disqualification, time penalties (jump start, track limits every third warning, causing a collision), safety car and virtual safety car with pit stops allowed, 80 km/h pit lane, 90% classification, 2 hour limit, points 25-18-15-12-10-8-6-4-2-1. Qualifying: Q1 18 min / Q2 15 / Q3 12, slowest six out after Q1 and Q2, a lap counts only if it starts before the chequered flag, deleted laps for track limits, red flags after crashes, 107% rule, impeding grid penalties, limited tyre sets.

**Drivers.** F1 uses the real 2026 line-ups. F2, F3, Formula Regional, GB3, F1 Academy, F4 and the reserve bench use real entry lists first. Made-up names appear only once the real list for a tier runs out, and they are marked FICTIONAL. Junior ratings are the game's own estimates, not official data. Team and driver ratings are also the game's own estimates.

**Tuning.** Constants live at the top of `src/sim/track.ts` (physics) and `src/sim/engine.ts` (tyre life shares, overtaking, following). After any change run `npm test`.

## 5b. Weather, crashes, radios, living circuits (new)

**Weather** (`src/sim/weather.ts`, `radar.ts`). Fully random and seeded: a Markov timeline of dry, cloud, drizzle, showers, steady rain, heavy rain and storm, with wind, air and track temperature, lightning, and a wetness per sector that builds and dries at different speeds. Slicks, intermediates and full wets each have a grip curve against wetness. Weather uses its own RNG, so it never disturbs the race RNG. Menu option: RANDOM or ALWAYS DRY.

**Radar.** Each team sees the weather through its own imperfect radar (shifted, blurred, biased, and less certain further ahead). Better pit walls read it better. Your radar tab shows the picture, a forecast curve and an ETA with a range. The on track cues are your drivers' sector reports, rivals' tyre choices and lap times. Nobody gets the truth.

**Wet rules.** Running inters or wets waives the two compound rule. Extreme rain gives a safety car start. Very heavy rain or a multi car crash can red flag the race, with a standing restart.

**Crashes** (`src/sim/incidents.ts`). Lock ups, off track moments, spins, gravel, wall hits, stalls, punctures and aero damage, with local yellows per sector, VSC, SC and red flags. Risk rises with tyre wear, pushing, wet mismatch, damage, the first lap, and street circuits. First lap and restart scrums can take out several cars.

**AI pit walls** (`src/sim/strategy.ts`). Every team has a style (methodical, aggressive, analytical, gambler, opportunist, conservative), skill and boldness. They undercut, cover, call weather changes from their own radar and from what rivals do, and react to safety cars. Menu option: ROOKIE, PRO or LEGEND slows or sharpens their reactions.

**Radios** (`src/sim/radio.ts`). Your engineers and drivers talk to you with choices to reply. Drivers have moods (morale, trust, grievance) and personalities, so orders such as hold position, let your team mate by, or free race are accepted or resented differently. Rival teams talk on the open channel and may be honest, hint, bluff, or just chat; you can send a decoy pit call yourself. The results screen has a radio review that reveals which rival messages were bluffs. The radio uses a separate RNG so it does not change race physics (a test enforces this).

**Living circuits** (`src/game/venues.ts`, `src/render/venueArt.ts`). Grandstands with crowds, gravel traps and tyre walls on real corners, spectators, marshal posts, advertising boards in a 3x5 pixel font with real F1 global partner names (a 2026 snapshot, check before relying on it), and landmarks. Honest limits: stand positions are NOT surveyed. For ten circuits I named real grandstands or corners and anchored them as a fraction of a lap, snapped to the nearest real corner apex, so they are approximately right. Every other circuit gets unnamed stands at its biggest corners. To use surveyed positions, run the optional importer (needs internet; I could not reach Overpass from my sandbox, so it is untested against live data):

```
node scripts/import-grandstands.mjs /tmp/f1c            # all circuits
node scripts/import-grandstands.mjs /tmp/f1c silverstone # one circuit
```

It writes `src/game/venueGeo.generated.ts` from OpenStreetMap (c) OpenStreetMap contributors, ODbL. Brand names on boards are used descriptively as in-world signage.

## 6. Roadmap (build in this order)

1. **Management layer**: budget, car R&D tree, staff and driver contracts, sponsors. Add a `src/management/` reducer, same pure style as the league reducer.
2. **Seasons and world**: the 23 race calendar as a season, championship tables, promotion through the junior ladder, AI teams that evolve, regulation changes, driver aging.
3. **More of the weekend**: sprint weekends (the calendar already tags them), practice and setup, parc ferme.
4. **League integration**: run the sim inside the Durable Object so all players share the same race, store seasons in D1, replays in R2.
5. **Politics and story**: press, board confidence, rivalries, academy, scenario events.
6. **Polish**: sound, more sprites and liveries, accessibility options.

## Known gaps

- Crash rates, weather mix, radio personalities, team characters and strategist styles are the game's own interpretations, tuned by feel (about 20% of races have a neutralisation on lap 1 at Silverstone and Suzuka, higher at Monaco). The strategist names and engineer names are a snapshot and may be out of date.
- Music and sound effects have never been heard by their author: they were written as code and checked only for structure (tests with a mocked audio context). Balance by ear is yours to judge. The Balatro-inspired direction follows general knowledge of that soundtrack's feel (a web search found nothing concrete); no tune is copied.
- The Shanghai pit lane side comes from memory, not a reference.
- Rain, spray, lightning and crash visuals were checked in headless Chromium screenshots only, not on a phone.

- The pixel renderer has been checked in headless Chromium (menu, qualifying, grid, race on six circuits, both pit lane sides), but not on a phone or in other browsers.
- Elevation, camber and surface are not modelled; the per-circuit grip scale absorbs them, so lap times are right but corner by corner behaviour is approximate.
- Every circuit has a calibrated lap time, but the 2D model does not know about DRS zones or kerb layouts. Overtaking is statistical, not geometric.
- Classic circuits use the same GPS data source but are not calibrated to pole times.

## Circuit scenery (satellite pipeline)

Every circuit's surroundings are pixel art derived offline from satellite pictures (the pictures are not shipped):
`scripts/build_scenes.py` classifies land cover into `public/scenes/<id>.cls.png` and `<id>.tint.png`,
`scripts/find_boats.py` / `find_stands.py` detect moored boats and grandstands (via `scripts/run_objs.sh`),
and `scripts/gen_scene_ts.py` writes `src/game/scenes.generated.ts`. The game bakes the grids into textures once per circuit
(`src/render/sceneGround.ts`); only boats, water glints and stand flags animate (`src/render/animLayer.ts`).
`src/render/weekend.ts` adds the race weekend set up (grid, gantry, motorhomes, TV compound, medical centre, helipad).
Known gaps: alignment to the real track is roughly 10 to 30 m; detections are heuristic; Monaco's harbour water is under-detected so few yachts show.

## Career mode (plan steps 1 to 7)

Pick any of the 11 teams from the main menu (NEW CAREER; CONTINUE CAREER and LOAD CAREER sit beside it, and SIMULATE A RACE WEEKEND plays a single weekend with no career). Press CONTINUE (Space) and the days tick by on screen (1x, 2x, 4x). The clock stops for race weeks and for urgent decisions. Escape or PAUSE stops it. Number keys 1 to 8 switch tabs.

**Screens.** Today (decisions and notices are separate; every decision card shows plain facts per option), Calendar (month grid with races, sprint weekends, test, launch, shutdowns, decision deadlines, contract ends, sponsor reviews, era stages and the tunnel reset, plus a coming-up list), Car and R&D (tunnel use per project, a "where did it go" log of cap room, tunnel hours and cash), People (mood with causes, promises, meetings, rumours, staff market), Academy, Money (player-set budgets), Rules and World (news with causes, records, rivalries, hall of fame, legacy).

**Money.** Only the R&D and new parts line uses cost cap room. Driver pay, staff pay, facilities and the academy come out of cash and do not touch the cap (a talent cap module can limit driver pay). Budgets for drivers, staff, R&D, facilities and academy are set by you in Money; signing something that breaks a ceiling is refused until you raise it.

**Regulation eras.** A new era is designed years ahead, published in stages every summer break, and lasts 4 to 5 seasons. Concept routes have hidden quality that the Concept Lab narrows. The Rules screen shows how many modules act in the race simulation and how many in the management game; the rest only shape concept routes and news. At the start of a career you can pick locked rules.

**Academy and scouting.** About 40 prospects a year, each independently a 1 in 40 chance of being generational. You see scout ranges, not truth; trial days and time narrow them. Karting has five championships a year and Formula 4, 3 and 2 run eight named rounds each, all with real results, standings, news and season titles (SEASONS tab). Each scout follows one series: in its season he goes to the rounds, watches the front of the field and your shortlist and files a report card, out of season he only reviews tapes. A series with no scout is rumour with wide ranges. Prospects keep a season-by-season career path, and you can talk privately to a junior or his manager from his page, or open multi-day contract talks. Outcomes come from circumstances (series fit, coaching, mentoring, workload), not dice rolls on the final result. Super licence needs age 18 and 40 points over three years.

**Practice, race and review.** Practice is a garage screen: setup sliders show the engineers' range (green) and best guess (yellow tick), and each programme says what it does in the race (tyre study sharpens laps-left, race simulation steadies drivers, qualifying simulation builds one-lap confidence, part tests reveal what a held part really gives). The race has a director camera that cuts between the action, a timing board with gap or exact times and sector colours, race sound effects, and a post-race debrief. Money has a livery choice with a preview of fan, board and sponsor consequences (once a year).

**Sound.** All music and effects are synthesised in the browser: warm electric piano, soft bass, pads, brushed drums, swing, a gentle low-pass and an echo. The car reveal keeps its original chip sound. Menus are silent.

**People and story.** Drivers have a grievance ladder with named stages. Events are earned from the state of your team, never scripted, with at most one big event a week.

**Honest limits.** All numbers, odds and balance are this game's own design. Records start at zero. The qualifying timing bar follows the usual broadcast conventions (purple fastest, green personal best, yellow slower, gap to the leader's sectors) from memory; a web search found no concrete reference. Balance has had only automated seasons (after a catch-up tweak to R&D gains, 14 automated seasons across two seeds gave four different constructors champions, McLaren still the most often), not human play-throughs.

The code lives in `src/career` (pure, JSON state, one `reduce(state, action)` entry point) and `src/ui/career`. Tests: `npm test` (career season runs take a minute or two).

## Online league (multiplayer)

MAIN MENU, ONLINE LEAGUE. The first person to open a league code is the host: they pick their team, the timer (none, 1, 3 or 10 minutes), race speed by majority vote or host decision, difficulty, race length and whether the rule eras turn. They send the invite link (`?league=CODE`). Everyone else joins with the link; each takes a free team (up to 11 humans, the AI runs the rest). People can join or leave mid-season, and a seat that stays empty after 10 minutes goes back to the AI.

How it works: one shared world, one Durable Object per league code (`src/worker/career-room.ts`, engine in `src/career/multi.ts`). Each manager has their own slice (cash, people, car, R&D, academy, cards). The day advances when every connected human is ready or away; with a timer, anyone who has not pressed ready when it runs out is skipped for that step. Practice and setup are individual. Qualifying and the race run once for the whole league in lockstep: the server orders commands and paces the clock, every browser runs the identical simulation, state hashes are compared and a desync banner offers RESYNC. The race waits a minute on the grid for start tyre picks. Regulation votes: each human votes, the AI votes by philosophy, and you cannot lobby another human's team through the game.

Testing it: `npm run dev:worker` serves the app and the rooms locally on port 8787. `E2E_URL=ws://localhost:8787 npx vitest run tests/e2e/workerd.test.ts` plays a full weekend between two simulated clients against that server.

Limits, stated plainly:
- Verified only on the local Cloudflare runtime (workerd via wrangler dev), never on Cloudflare's network. Deploying is the real test.
- League weekends have no sprint races. A league manager cannot be replaced by the owner (every seat stays filled), so a board at rock bottom gets the owner's last warning instead of the sack.
- Lockstep relies on every browser computing identical floating point maths. Chromium on one machine agreed; different browsers and CPUs are untested. The hash check detects drift but cannot repair it, apart from the RESYNC button.
- Your own clicks apply instantly in your browser; the server then sends its version, which wins. A random outcome can differ for a moment.
- Rivals' true car ratings, projects and ideas are hidden from your view; junior driver attributes are not.
- Radio replies cannot be tied to a team on the server, so a cheating client could answer another team's driver. News privacy uses a text rule ("you", "your") and can misfile a line.

## Feedback round 2 (what changed)

- **Race weekend**: practice no longer jumps to qualifying by itself. After the last run you make your final setup changes, then press END PRACTICE. Held parts show a bench gauge (what the staff guessed against what the bench test found, with a plain verdict).
- **Race**: safety car is a real car that leads the field, announces "Safety car in this lap", dives into the pit lane at the end of that lap, and overtaking is locked until each car has crossed the line. VSC announces "Virtual Safety Car ending". Race control banners stack neatly. A short skippable podium follows the race (turn off in Settings). Settings is always visible.
- **Sound**: engine rebuilt (low roar, no whine), the high "ring" removed (7 kHz low-pass, high notes folded down), louder simulation sounds, race music separate from sfx, and music that follows the situation (garage, quali, race, safety car, rain, podium, crisis).
- **Calendar**: pick any future day (or +30 days, +1 season, +3 seasons) and the team AI runs things: default answers to every card, honest sponsor offers accepted, every weekend simulated. Stop any time.
- **Next year's car**: Car screen has a programme for January's car: evolution, revolution or follow the leaders, and how much of the design office works on it. The result is hidden until the pre-season test. Neglect leaves you behind, a revolution with weak designers is a disaster, changing course loses 40 percent of the work.
- **Inbox**: sponsors write in (some of them shady), scouts send reports, young drivers send highlights asking for a shot. You can also go looking for sponsors yourself (cold emails, an agency, or working the rooms); a weak team gets few and worse replies.
- **Stories**: 22 small odd events and follow-ups (a dog in the garage, an envelope from a rival, a billionaire who wants a go, a prank war). Several only appear when the team is in a bad way (staff leaving, a sponsor sulking, a letter from the bank).

## Feedback round 3 (what changed, and how each item was checked)

- **Weekend days**: a race weekend now starts on the Friday (race day minus 2). The calendar marks Practice (Friday), Qualifying (Saturday; Sprint plus qualifying on sprint weekends) and the Race (Sunday). The date moves as sessions are played, so Saturday is Saturday when qualifying is on.
- **Skipping**: a skip into a weekend lands on its Friday, before practice, and nothing is simulated. A skip to a day with an event on it (test, launch, deadline, reply, season review) lands the day before. From inside a weekend, a skip lets the team AI play it out.
- **Dashboard button**: on a weekend day it reads START WEEKEND, then GO TO PRACTICE / SPRINT QUALIFYING / THE SPRINT / QUALIFYING / THE RACE. Sessions run back to back without returning to the dashboard.
- **Inbox**: every message, offer and every conversation with a driver is in one list with read and unread dots and an unread count on the tab. A conversation never disappears: if you skip a month the reply is simply unread. Silent talks now lapse after 75 days, not 24. The calendar shows "Reply expected" and lapse dates.
- **Engines and gearboxes**: each driver has a power unit (allowance 4 a season) and a gearbox (allowance 5) with wear. Worn units fail more often in sessions. A unit can blow in practice (the run is lost) or in the sprint or race. You can swap at any time, including after parc ferme: a unit beyond the allowance costs 10 (power unit) or 5 (gearbox) grid places, and a swap after parc ferme costs 5 more. A unit that dies in the race is replaced at the factory and the penalty is carried to the next race (shown on the dashboard, the briefing grid and the practice screen). Rivals occasionally take a 10 place penalty too.
- **Qualifying**: engine sound for the car on camera, a gap to leader or exact times toggle like the race, and purple sectors only ever shown for one car per sector at a time.
- **Music**: the race score no longer depends on the camera, and every career screen plays the same track, so nothing restarts when you change camera or menu.
- **Smaller**: the factory window skyline stays inside the window, the road dashes no longer scroll.

Not covered: qualifying itself has no mechanical failures (only practice, sprint and race do), and I cannot hear audio, so sound was measured (engine gain 0 with the car in the garage, about 0.17 once it is on a lap) rather than listened to.

### Do practice, setup and part decisions matter? (measured)

- **Setup**: over 14 paired weekends, an awful setup (every slider at the wrong end) cost about 1.5 race places against a perfect one (11.3 against 9.8 average finish) and about 0.16 s a lap of car. Qualifying barely moved and a perfect setup against leaving everything at zero was inside the noise. So setup is a small effect, a penalty for neglect more than a prize.
- **Parts**: over a season, always starting the best-value ideas lifted the car about 0.25 s a lap and ranked it 1st to 3rd of 11 (from 5th); starting nothing gave +0.12 and 4th to 9th; random picks ranged from 7th to 3rd; holding every part back gave nothing. This is a small sample (3 seeds a policy).
- **Who decides**: the Weekend setup and Fitting parts toggles used to do nothing and Hands off on R&D left the factory idle. They now work as described on the Car screen.


## The engineering overhaul (what changed and how it works)

**One car model.** A car is ten hidden traits (downforce, aero efficiency, mechanical grip, platform control, peak output, drivability, cooling capacity, packaging, tyre life, tyre warm-up), two under each of the five areas. An area's worth is the average of its pair minus a price for a lopsided pair, so work on the weaker trait pays best. The old area numbers still exist, as a cache computed from the traits. The clock sees the car through the regulations (hidden weight per trait) and through the circuit (Monaco rewards downforce, Monza efficiency, tyre-hard tracks reward tyre life). Source: `src/career/traits.ts`.

**One knowledge model.** Every belief about the car and about what the rules reward is an estimate with an error bar (`src/career/know.ts`). Readings combine with the old belief by their precision. The quality of a reading comes from the instrument (tunnel reads aero, simulator reads chassis and tyres, dyno reads power and cooling), the specialist who reads it, the data lead and how consistent your drivers are. You buy readings with the allowance hours (STUDY on the Car screen), practice programmes add data on the traits they exercise, races pull beliefs toward the truth and the debrief says what changed. Building a part or starting a new car widens the bars again.

**People are capabilities.** New roles: head of aerodynamics, head of power unit, data and simulation lead. Everyone has a specialty across the five areas and a philosophy on three axes (downforce vs low drag, proven vs radical, refine vs invent), blurred for you by how well you know them (`src/career/capability.ts`). The car has the same three axes, its concept. A part's quality and how readable it is depend on skill times fit (specialty, philosophy match, familiarity, workload). The AI hires on the same fit score.

**Concept and programmes.** The concept leans each January's car (a downforce concept builds a strong-downforce, weaker-efficiency car; risk widens the swing; inventive concepts sometimes find a breakthrough). COMMISSION A PART lets you pick the trait, how bold it is and who leads it, instead of waiting for the factory to propose. Race setup truth now depends on the track and on the car's own traits.

**Money and the board.** Every board move is logged with its cause and the Money screen shows results, books and owner trust separately. Bank loans cost 12 percent a year, the limit is 80m and big debt wears the board down. No seat is safe after the first season, including the weakest car. In a league the owner's last warning replaces the sack.

**The world.** Parity is managed: the grid is pulled together only when its spread passes a band, and shaken (wider January swing) when it bunches. The storyteller eases off when you are under pressure and stirs things up in long quiet spells. Junior records that are gone are pruned each year.

**Leagues get all of it.** Stories, inbox mail, sponsor hunting, next-car programmes, letters, studies, concepts and guidance work per person. A rival's traits, knowledge, concept and the true rulebook are hidden in your view.

**Optional guidance.** Facts only (default), plain-language hints, or full advice (recommended parts, studies and concept changes). A card at the start of a career asks, and the switch is always at the top of the Car screen. It only changes what the screens say.

**Delegation has a price.** Parts the head of R&D starts alone, without your brief, keep 72 percent of their gain (`CFG.unbriefedFactor`), and the Car screen says so. Every January the rulemakers also reset the baseline (`CFG.baselineAt`, `baselineReset`): all figures and beliefs fall by the same amount, so gaps are unchanged. I added this after a ten-season run showed figures drifting up until the lap clock saturated and every car rated the same.

**What the automated checks found (honest numbers).** Reading the numbers against delegating against doing nothing, three seasons, two seeds, average constructors' finish: reader 5.7th, delegator 6.7th, idle 8.2nd. The direction is the intended one, but it is a small sample and a crude scripted reader, so it does not prove that a human who reads well will beat a delegator by a margin they will feel. Over one season and eight seeds the scripted reader and the delegator were within noise on car rating before the delegation price was added. Ten seasons of the whole field: spread stayed between 0.15 and 0.23, and six different teams won the title (McLaren four times). No human has played this build.

Tests: `tests/overhaul.test.ts` (fast) and `BALANCE=1 npx vitest run tests/balance.test.ts` (slow harness: reading the numbers against delegating against doing nothing, and ten seasons of field spread and champions).


## Feedback round 3 (what changed)

- **Talks**: SOUND HIM OUT and ASK WHAT MATTERS TO HIM can each be used once per set of talks. Asking again gave the same answer, so the buttons now go away and the game says so.
- **Crowd** (removed again in feedback round 4, see below): the crowd was almost silent (a murmur at about a tenth of the engine's level, and gone at fast speeds). It is now a clearly audible stadium bed that swells and falls, a roar at lights out, applause rolling past each time the followed car goes by the stands, and a cheer at the flag. All of it is made in code and I have not heard it myself, so the levels are for your ears to judge.
- **Skip when out**: when all of your cars are out of a session (knocked out of qualifying, or retired from the race) a banner offers SKIP TO THE RACE or SKIP TO THE RESULT. In a league it only appears when every manager's cars are out, and then everyone votes skip or keep watching. It settles as soon as one side has more than half the voters or everyone has voted, and a tie is decided at random by the server. A skip runs the shared clock flat out (256x) so all browsers stay in step.
- **Staff bars**: the error bands could run past the end of their bars and the rulebook bars had their "average" line in the wrong place. Both fixed, and bar lengths no longer change with the text beside them.
- **Help level**: chosen when a career starts or a league is created or joined, kept until changed in Settings (the cog). The in-game question and the switch on the Car screen are gone. Default is facts only. In a league each manager has their own.

Limits: the league skip vote is covered by unit tests of the vote rule, the engine and the screen, but I have not run two real browsers through it. A joiner who picks a help level before choosing a team gets it applied on their first screen.

### Sound and spray fixes (after round 3)

- **The race buzz**: it was not the engine. It was the steady crowd bed I added in round 3, a constant noise under everything. The engine is back exactly as it was. The crowd is now a very quiet floor with a murmur that swells for a few seconds now and then, plus the roar at lights out and the applause at the stands.
- **Rain**: it was high-pass hissy noise. It is now a soft pink wash with the top cut off, swelling and fading slowly, with gentle drops pattering. I cannot hear it from here, so the levels are for your ears to judge; they are constants near the top of `src/audio/raceAudio.ts`.
- **Spray**: the water behind a car was placed 90 degrees off its direction of travel. It now sits directly behind and drifts back.

## The beautification overhaul (design language)

The simulation was left alone. Every menu was rebuilt on a shared design language taken from a study of Balatro (full write-up in `docs/DESIGN.md`).

What changed, in plain terms:
- **One look.** `src/ui/skin/skin.css` loads after the old styles and restyles every screen through the shared classes: fat rounded panels with a label plate on top, buttons that behave like objects (lift on hover, sink on press, lip underneath), chunky faders and bars, playing-card style option cards that tilt toward the cursor.
- **Colour means something.** Gold is money, teal is cap room, blue is time and info, green is good, red is bad, purple is research and special, orange is go. The tokens are at the top of `skin.css`.
- **The table is alive.** A slow marbled swirl (`Swirl.tsx`, drawn at 160 by 90 and scaled up so it stays pixel crisp) sits behind every screen and changes colour per screen (blueprint blue on Car, green on Money, red when the team is in trouble). Scanlines and the screen-edge shading are on top.
- **Everything reacts.** `juice.ts` gives every button a hover tick, a press thunk and a wobble, shakes a denied click, pops new panels in one after another, and tilts cards. `Num.tsx` makes a number wobble and flash green or red when it changes.
- **New UI sounds,** all synthesized: `tick`, `thunk`, `swish`, `pop`, `deny` and `climb` (a pitch that rises with each step of a chain).
- **Long pages are split.** Car and R&D (overview, study, build, next year's car, facilities), People (drivers, staff, driver market, hiring) and Money (cash and board, budgets, cost cap, sponsors and livery) now use pill tabs (`Sub.tsx`). Help text can fold (`Fold`).
- **Rebuilt screens:** main menu (bobbing logo, colour-coded icon buttons), dashboard header (stat tiles with icons), the factory scene (traffic, light shafts, floating work icons, a slow golden hour), screen banners (rounded frame, title strip, drifting motes, light sweep, parallax), the garage setup sheet (faders with the engineers' band behind the thumb and a hatched "no idea yet" state), the new career screen (a car on every team card), and the podium (a staged reveal: P3, P2, then the winner, with rising chimes, a flash, a shake and confetti).
- **Settings** has a LOOK section: scanlines and shading on or off, moving background on or off. Reduced-motion users get no wobble and a still background.

Developer preview: open `/?demo=podium` to see the podium straight away on a simulated race.

How it was checked: `tsc` for the app and the worker, the full test suite, and Playwright screenshots of every tab and sub-tab at desktop width, plus an automated overflow audit (clipped text, text off screen, sideways page scroll, plate overlap) at desktop and phone width. The audit found one real problem (the 21-day strip overflowed at phone width), now scrollable. Sounds and animation feel were not heard or felt by the checker, so the timings in `skin.css` and the sound levels in `sound.ts` are tuned by eye and may want a pass after you play.

## Feedback round 4 (what changed)

- **World calendar alignment**: the season list reused a CSS class (`c-cal`) that another screen defines as a wrapping flex strip, so rows flowed into two columns and collided. It now has its own class and a strict grid per row: round, circuit, date, SPRINT tag, with the winner on a line underneath once the race is run.
- **Tooltips going behind**: the tooltip's entrance animation overwrote its centring transform, and tiles kept a stacking context after their pop-in. The tooltip now fades in without touching its position, has a sensible width, and a hovered or focused stat tile rises above its neighbours.
- **Crowd sounds removed**: murmur bed, lights-out roar, applause at the stands, cheers and gasps are gone. Engine, air, rain, thunder, tyre squeal, safety car, flag and crash effects stay. `tests/raceaudio.test.ts` now expects two noise layers (air, rain).
- **Purple background in the race**: the `race` swirl palette is a dimmer purple, used for qualifying, briefing, race, classification, debrief and the podium, in both the standalone weekend and the career weekend (practice stays brown).

## Feedback round 5 (what changed, and what was checked)

**Music.** Every scene now rotates through endless tunes. The hand-written theme plays first, then tunes written on the spot by `src/audio/musicGen.ts`: a key and mode, a chord loop with a turnaround, a bass pattern, a drum feel (twelve of them now: shuffle, funk, four on the floor, drum and bass...), a lead sound (keys, pluck, bell, soft) and a melody built from a motif that is answered and resolved. Each scene has its own style (race is fast and driving, rain is slow and bell-like, podium is major and bright). A scene moves to a new tune after 80 to 120 seconds, and every fifth is the original theme again. Settings has a NEXT TUNE button. Checked in tests: same seed gives the same tune, different seeds differ, every scene compiles to a playable pattern. Not checked: how it sounds. I cannot listen.

**Engine sound.** Rebuilt from how a 1.6 litre V6 actually sounds (three firings per crank turn, so about 250 Hz at idle and 750 Hz at the limit; the old one sat at 60 to 100 Hz). Four looped rpm layers cross-fade and change speed with the revs, with a gear-shift dip and a throttle-lift burble. Checked: spectrum, loop seam and pitch rise in tests. Not checked: by ear. Settings has an engine tone slider if it is too bright or too dull.

**Zoom.** A zoom slider in Settings and +/- buttons in the race view. Cars are redrawn from a hi-res sprite when zoomed in.

**Radar label, red flags.** The radar title is shortened and the note moved under it. SKIP RED FLAG runs the red flag out and restarts the race (solo only; in online leagues the server owns the clock).

**Records.** Every driver starts with real career totals up to the end of 2025 (wins, seconds, thirds, poles, fastest laps, sprint wins, starts, titles) and every team with its real constructors' titles. New results add on top. Clicking any name (standings, THE GRID, People) opens a profile with a trophy cabinet (drivers: titles, wins, seconds, thirds; teams: constructors' titles), the other numbers, and what you know about them. Skills, character and contract are hidden until you RESEARCH a driver; your own drivers are open. WORLD has an ACHIEVEMENTS list. Real totals come from the Jolpica (Ergast style) results API, with a few hand corrections; a number can be off by one or two.

**Titles.** A title is awarded the moment nobody can catch the leader, mid-season if need be, and a full-screen celebration plays for the drivers' and the constructors' title.

**Status and conversations.** Roles follow stature (titles, wins, years, current pace), so Alonso starts as the lead driver at Aston Martin. Demoting a proud driver makes him angry, makes the press notice, and leaves a memory that fades over about ten weeks. Drivers reach out when something builds up (status, car, pay, a broken promise, a strategy call, orders). Accepting a request opens a real conversation: he says what is on his mind, you answer from options whose weight depends on his character, he reacts, and you may get a second round. TALK TO HIM on a profile starts one yourself.

**Pit crew.** Twelve people, six slots. Skill sets the usual stop time, chemistry (stops together, temperament pairings) sets how often one goes wrong. Changing the line-up costs familiarity. PEOPLE has a PIT CREW tab.

**Double stacking.** The second car of a team now waits a car length behind the box unless the first car will be gone by the time he arrives. The wait is counted and the driver says so on the radio.

**Radio.** New talk in each driver's voice: being undercut by a rival or by the team-mate, undercutting a rival, covering when the car behind pits, being stuck behind someone and asking for an early stop, pressure from behind, and complaints about a double stack. A costly strategy call becomes a grievance that carries back to the factory and shows up in conversations.

### How to test it locally before Cloudflare

1. `npm install` (once, after replacing the folder).
2. `npm run dev` and open the address it prints (usually http://localhost:5173). This is the fast loop for everything except online leagues.
3. For online leagues, either run `npm run dev:worker` in a second terminal next to `npm run dev`, or run `npm run preview`, which builds the game and serves it all from Wrangler on http://localhost:8787 with the Durable Objects (the closest thing to Cloudflare). Open two browser windows to play a league against yourself.
4. `npm test` runs the checks. `npm run deploy` uploads to Cloudflare.

**Engine sound, second pass.** The first engine was too harsh. It is now a soft, warm hum made from smooth harmonics (lower pitch, gentle chorus, nothing above about 1.8 kHz before the tone control), and the turbo whine is a quiet low hum. It is deliberately not F1-accurate. The engine tone slider in Settings now defaults to the middle and goes from very mellow to a little brighter.

**Engine sound, third pass (researched).** Rebuilt after reading how engine simulators and middleware guides do it: a train of soft exhaust pressure pulses per cylinder firing (slightly different per cylinder, which gives the burble), sent through a feedback exhaust pipe for the throaty resonance, with chest and growl humps, a gentle roll-off and a quiet intake breath. It is a low, muscular V8 style tone on purpose, not an F1 scream. Checked by spectrogram (a clean harmonic stack that rises with revs, little energy above 3 kHz), not by ear.

**Engine sound, fourth pass.** Removed everything that could cause a wobble or an electric sound: the separate whine tone, the crossfading engine layers (tonal layers beat against each other), the gear-shift cuts and the rise and fall of pitch with every gear. It is now one soft loop whose pitch follows the car's speed smoothly, darker by default (tone slider defaults to a low cutoff around 1.7 kHz).

**Engine sound, fifth pass.** Dropped the exhaust-pipe resonance and the intake noise (both can read as an electric ringing), and made the loop 1.5 s with every firing slightly different so nothing repeats like a buzz.

### Follow-up fixes
- Race zoom now bottoms out at exactly 1x and moves in 0.25 steps (old saved values snap to the grid).
- Weather Radar title plate is no longer clipped (the scrolling panel was cutting it off).
- Race driver cards show the pixel portrait of the driver.
- Safety car: on its in lap it now peels into the real pit lane (same side and offset as the cars) before the pit entry line, so it is inside the lane when the leader crosses the line and the green flag comes out. Overtaking opens for each car as it crosses the line.
- Zoomed in (1.3x and up): the safety car gets a detailed sprite like the race cars, and the track tiles in view are baked again at double resolution (one tile per frame) so road edges, kerbs, lines and barriers are sharper. The ground scenery is a bitmap, so it stays chunky.

## Latest round

- **Driver roles on old saves.** A one-time migration (`rolesSeeded`) re-seeds first and second driver where the old save had everyone equal (Alonso over Stroll, for example). You can still change roles yourself.
- **National anthems and flags.** After the podium sound the winner's anthem plays (`src/audio/anthems.ts`). Nothing is written from memory: the melodies (plus bass and inner voices where the score has them) come from the open `anthem-scores` dataset, which converts freely licensed scores from Wikipedia, Wikisource and Wikimedia Commons. It is vendored in `data/anthems/` with each file's source, author and licence (several are CC BY-SA, so keep `data/anthems/CREDITS.md` with the game). 36 melodies cover 36 nations, including ones with no driver today, for future drivers. `node scripts/buildAnthems.mjs` regenerates `src/audio/anthemData.generated.ts`. Nations with no sourced score (for example Brazil, Argentina, Thailand, Monaco, New Zealand, Colombia, Ireland, South Korea) get a fanfare. To add one, put its JSON in `data/anthems/` and its game codes in the script.
- **Donuts.** After the last race of a season the champion and any retiring drivers do donuts on the cool-down lap (`src/career/sendoff.ts`, `RaceView.tsx`). Retirements are now decided at the start of the final weekend so the send-off knows about them.
- **Social feed.** Posts are composed from facts and running storylines (`src/career/social.ts`, World > Social). There is no AI model behind it; it is deterministic code with many composable parts. A storyline can escalate into a decision card.
- **Practice and setup.** Each circuit has a hidden best setup that persists by track and drifts by year. Runs give noisy lap times, drivers describe only their two biggest complaints and have their own taste, and the engineers' simulator carries a built-in bias. Balance depends on downforce, a trim axis trades qualifying pace against race tyres, fresh tyre sets are limited, and a notebook remembers last year's setup. Driver confidence follows how well the car suits him, not how many runs were done (`src/career/setup.ts`).
- **Radio (text only).** Timestamps, keyed-in typing for new lines, bleeped swearing for drivers under strain, drivers talking over the engineer, radio fatigue (too many pit wall calls and the driver complains and obeys less), and scanner reception for rival teams (dropouts, weak and breaking-up lines). Driver answers arrive after a delay that depends on his mood and ego (a refusal is preceded by a silent "..."), soft engineer calls such as weather advisories wait until the car is on a straight, and notable moments (bleeped lines, refusals, a driver telling the pit wall to stop talking, talking over the engineer) become posts in the social feed after the race, using only words that were actually said. All of it is text; there is no radio audio or speech input.

## Integration pass (systems multiply each other)

- **Factor bus** (`src/career/factors.ts`): eight factors around 1.0 (talent, tools, knowledge, cohesion, reputation, funding, form, story). R&D gain and speed, design quality, reading quality, board moves, sponsor income, salaries, fans, votes and poaching now multiply the factors they name instead of adding flat bonuses. `whyText` gives the readable reason.
- **Fact ledger** (`facts.ts`), **shared identity** (`identity.ts`), **driver attributes** (`attributes.ts`), **CVs, offers and trainees** (`cv.ts`, `hiring.ts`), clickable staff profiles.
- **Design Lab** (`design.ts`, `airfoil.ts`, `lab.ts`, `ui/career/Lab.tsx`): eight dials describe the car; a panel-method solver draws the wing sections; five instruments (desk, CFD, tunnel, simulator, dyno) read candidate shapes with their own noise and habitual bias; trust in each grows when the car runs on track; the committed shape is built in January in proportion to the design office's quality.
- **Story engine** (`threads.ts`): five threads (rivalry, defector, prodigy, concept gamble, heritage fight), a director with a personality (drama, steady, chaos) and a cap, a chronicle on the World page. Personal drama is only written about invented people.
- **Per-driver setup**: each driver has his own offsets on the shared setup (practice screen); comfort, run times and comments use his own.
- **More wires**: driver style fit against the car's shape, form, fatigue (heat, race length, composure), fuel saving, press answers scaled by trust and heat, heritage and bold design feeding reputation and story heat, pit stops feeding crew morale, weather card accuracy from tools, knowledge and talent. `tests/removal.test.ts` pins each of the eight factors in turn and checks it moves at least three outputs.
- **Clickable names** in news, inbox, history and academy lists (staff, drivers, teams, prospects). Live timing is left plain.
- **Real record, 1950 to 2025**: drivers' and constructors' champions with sources, on the World history tab; cross-checked against the game's own team titles in a test.
- Lab notebook, January plan and tool trust are private in a league; stories and the chronicle are per manager.
- Also: record chases (a driver near seven titles or the win record raises his asking price and pulls fans), test day lifts staff mood, delegated R&D picks worse when the office is weak, private ledger lines in a league, and a fix for a freeze after about 13 seasons (the junior code generator ran out of codes and looped).
- Ten more seasons and then twenty were run headless with a gifted trainee, a title fight and a bold plan injected each year, to check the story director's cap and that no thread lives forever.
- Not done: all-time record tables beyond champions (the sources I could read were out of date), a re-listen to the engine sound, a two-person browser run of the multiplayer weekend, and a redeploy (needs a Cloudflare login: run `npm run deploy` on your machine).

## Qualifying and race screen controls
Driver names on the qualifying and race cards open their profile. A TEAM MENU button (cash, cap, board, both tables) is available in single player sessions too. In qualifying the SET control shows how many NEW sets are left (NONE LEFT when out), USED shows the wear on the fitted set and is only available for the compound already on the car, and a line explains why GO OUT is disabled. The factory focus and idea cards now appear only when the weakest area has changed (at most every 12 weeks) or new ideas exist.

## The development scenes (board room, test day, verdicts)
The big development decisions are scenes with people instead of plain cards. All of it is driven by real state (src/career/dev.ts) and never changes the car or a race result.
- **Briefing:** the chief designer presents a blueprint of the car with each area ranked against the field. Click an area to point the factory at it. Only appears when the weakest area has moved and 12 weeks have passed.
- **Pitches:** each idea is argued by its real lead, voiced from their traits, with an honest record ("3 of his last 4 parts landed"). A trainee can bring a rookie pitch (a gamble) when a mentor, tools and cohesion allow it.
- **Verdict:** test the part on track (quick, back to back, long run: cost cash, tighten the estimate, cannot be re-rolled), then fit, hold in the crate, or scrap. A held part waits: its author's patience drops, and after two months rivals catch up and it loses 12 percent of its gain. A scrapped part costs the author mood by personality and how far it got, and a scrapped idea that later proves better leaves a regret entry.
- **Memory:** every call is written to a per-person record (backed, overruled, scrapped, heard, landed, missed) shown on the staff profile. Overruled people can hand in a letter (counter, listen, let go). A run of overrules and misses can split the drawing office, which slows ideas for six weeks.
- **Landing:** at a part's first race a good result lifts its author, a rookie's good part grows him and the press asks about him, a miss lands on the real author.
- **Living office:** the Car screen shows your people at their desks with lines drawn from their real mood and record, and held parts as crates.
- **Also animated:** press conference, pre-season test, Lab instruments (each plays its own animation before the reading), and driver talks (the driver walks in and shows how he feels).
- **Online:** all of this works per manager in a league. Each manager's record is private to their own view.
- **Second pass:** the pre-season test is a programme choice (mileage, aero mapping, race simulation, trainee laps, press show). The debrief opens with the race engineer's animated replay. Lab readings can be sent to the drawing office as a pitch (the range is the instrument's own error, the hidden gain is what the shape is really worth). A trainee whose part lands opens the rookie story. It is fluid, not scripted: how you treat him (promote, credit, quiet word), his mood and your record with him shift the odds that he stays, but the dice decide. If he stays there can be a second act (a bolder idea, a demand for a bigger role, or settling in); if not he joins a rival. New sounds: stamp, paper, shutter.

## Fixes after playtest (latest)
- **Livery on the cars:** the track sprites, garages and paddock now use the colours in the session's entries, so a livery change shows on the cars in qualifying and the race, not only in the portraits.
- **Dashboard in sessions:** the old TEAM MENU is gone. A DASHBOARD button (bottom left, with a count of what is waiting) opens your full dashboard, inbox included, during practice, qualifying and the race. Alone, it holds the session clock and restores your speed when you come back. In an online league the session keeps running for everyone.
- **Setup screen:** the top block is labelled CAR SETUP (both drivers), the lower block is the chosen driver's own tweaks, and each tweak shows the combined value on his car.
- **Ideas are a tradeoff:** when a batch of ideas is put to you and you pick one (or "Not now"), the rest are shelved for good, and their authors feel being passed over. Money and cap room still limit how many you build.
- **Scrap scene everywhere:** scrapping from the Car screen, the weekend or the verdict plays the paper-into-the-bin scene with the author reacting by personality (angry, stung, pale, sulking, shrugging).

## Test days, full bodies and the sound of the building
- **In-season test days:** two a season (about a third and two thirds of the way through, two days after a race, only when there is room before the next weekend). One day on a closed track, you choose what it is for: tyre test, correlate the simulator, run a part back to back (only when one is ready or far enough along), a young engineer day, or rest the garage. Each shifts what the engineers know or the mood of the garage, costs a little, and ends with a report. They are in the diary on the Calendar.
- **Full-body staff:** in the scenes people now stand as whole figures (the portrait's own head on a torso, arms and legs), with a pose that follows how they feel: arms crossed when furious, slumped when stung or sulking, hands on head when pale, hands on hips when proud or pleased, a shrug. Small faces remain in lists.
- **Ambient sound:** a quiet looping bed (air handling and a far hum) with random small noises on top (keys, a chair, paper, a phone down the corridor). The Car screen sounds like the factory, the Academy like the lab, everything else like the office. It stops on the race weekend screens, follows the mute switch and scales with the sound effects volume.
