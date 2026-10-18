# BOX BOX: The Direction Plan (design review, test day, voices, fallout)

Goal: the manager's big decisions stop being cards and become scenes with people. Every scene reads real game state, every choice leaves a trace in the world, and nothing is scripted. The same rule as the story engine: scenes come from conditions and decisions, never from a dice roll that overrides what you did.

## 0. What already exists (so we build on it, not beside it)
- Ideas have an engineer lead, a predicted range, a hidden true gain, a kind (safe / gamble / enabler), tunnel hours and cost. Projects tick through building, ready, fitted.
- Interns (trainees) with potential, monthly growth, promotion. Staff have skill, traits, phil, mood, poach offers.
- Driver conversations (convo.ts) with options and reactions, weekly reach calls, agent talks.
- Social feed and press arcs (social.ts), story threads (threads.ts), chronicle, ledger facts, news.
- Design Lab (8 dials, panel method, instruments), test day on the calendar (only a mood bump today), FactoryScene, CarSprite, staff and driver portraits.
- Gaps: the monthly effort and idea cards are plain buttons; test day has no scene; post race talks are text panels; staff never react to YOUR direction; the Lab is separate from the card flow; media does not react to strategy.

## 1. The core loop: a development cycle is a story with five beats
1. BRIEFING (monthly, only when it matters). Your chief designer asks for the drawing office. Trigger: the weakest area moved, a part finished, a rival jumped, a regulation changed, or a trainee has a pitch. Not on a timer.
2. THE BOARD ROOM. Scene: drawing office, blueprint grid, the presenter sprite talks (typewriter bubble, mood face). The car schematic lights up zones with live numbers (rank among teams, trend). Two or three people pitch, each from their own bias (see 2).
3. YOUR CALL. Pick a direction on the blueprint (click a zone), pick a stance (safe / balanced / bold), pick whose idea to back. You can ask a question first (costs nothing but time, and a clever question reveals more of the hidden range: "what if you are wrong?").
4. TEST DAY (invitation). Appears when parts are ready, or on the calendar test day. Scene: the car on a pixel track, garage screens, telemetry streaming. You choose run plans (back to back comparison, long run, aero rake) from a short list, and the run produces real numbers from the real part truth, narrated by the engineer. This is where the hidden gain gets revealed, with noise that shrinks with tools and data staff.
5. VERDICT. Fit it, hold it, or scrap it. Then the world responds: floor, paddock, media, board.

## 2. Who speaks, and why they disagree
Every pitch comes from a real member of staff, voiced from their traits and phil (the existing fields), not random flavour.
- Chief designer: wants the big idea in his specialty area.
- Head of aero / power / data: each argues for their department's budget and tunnel time.
- Data engineer: argues for the correlation fix when tunnel and track disagree.
- Race engineers: bring what the drivers say (the car is lazy in the rear, tyres fall off) so driver feedback reaches the board room.
- Interns: a trainee with a high potential and a relevant spec may bring one idea of their own, marked "rookie pitch". Prob depends on mentor skill, tools, cohesion and the intern's own knowledge. It is a gamble kind (wide range). If you back it and it works, the intern's skill gets a real, visible bump from the project (not a stat gift: the project's delivered value feeds his growth), the promotion card unlocks with his face on it, and his growth is shown in the profile timeline. If it flops, he is quiet for a month and the department notices.
- Their pitches carry honest uncertainty: they show a range, not the truth. Reading the people (known skill, who tends to over-promise) is the game.

## 3. Consequences, in both directions (the "it all goes wrong" path)
Direction creates debts and loyalties, tracked per person (existing mood plus a new short ledger of "was overruled", "was backed", "was proven right/wrong").
- Overruling a department head too often: grievance rises, cohesion factor falls, he becomes poachable, may hand in notice (a scene: he asks for a word, you can counter, or let him go). A rival may sign him and his knowledge helps their car (existing poach rules).
- Backing a loud pitch that fails: tunnel hours and cap spent, floor correlation hit, the designer's confidence drops, press asks questions, the board mentions it at the next review.
- Backing the right quiet pitch: credit goes to the author in the paddock news; reputation of the manager's judgment rises (a visible stat in the profile: "calls that landed / missed").
- A chain of misses can produce a real crisis: department split, key staff leave, a development year lost. This is allowed to happen and is recoverable only by decisions (rehire, change philosophy, buy tools), never by a rescue event.
- A chain of hits builds a feeling: the whole garage celebrates a part's first race (existing donut / radio hooks reused).

## 4. Where the Design Lab fits
The Lab is the manager going hands on. Two entry points, one result:
- Lab as a scene: "Go down to the tunnel" from the board room opens the Lab. The instruments get a visible bay: desk (sketch animation), CFD (flow lines across the sprite), tunnel (model car with smoke and a fan), sim (car on a pixel track with a lap time ticking), dyno (engine shaking, rpm trace). Each is a short animation that ends on the real number the instrument returned. Skippable.
- Outcome: a finished design becomes an Idea that carries the designer as lead and the Lab results as its predicted range (more instrument time = tighter range, which already exists). It then enters the same pitch, test day, verdict flow. So Lab work and staff pitches compete on the same blueprint.

## 5. Post race: the paddock talk (animated)
After sessions, drivers and engineers come to you.
- Triggers come from what happened: a driver was held back by a call, a team order, a bad pit stop, a clash with the teammate, a podium he feels is down to the setup, fatigue, a contract worry. Existing convo.ts already chooses topics from state; we reuse it.
- Presentation: the driver sprite walks in, the mood face matches grievance and morale, a speech bubble types the line, the options are written as what YOU would say. Body language per stage (arms crossed when angry, slump after a DNF, grin after a win).
- Also a debrief with the race engineer: a short animated replay strip of the key moment (pit stop, undercut, collision) built from the existing session log, with the engineer explaining. You pick what changes: setup, plan, a word to the driver.
- Taking drivers into account: every choice writes trust, grievance and morale as today, plus a "heard / ignored" counter that feeds contract talks and agent mood.

## 6. Media
The press is the audience for every scene.
- Each decision creates a press hook with a tone (bold, safe, secretive, open). Journalists have outlets with leanings (existing arcs). Their coverage reacts to the hook: a bold direction gets headlines if it works and mockery if it fails.
- Press conference scene (short): after big moments, a reporter sprite asks one question; your three answers shift press heat, fans, board, and a driver can be annoyed if you throw him under the bus.
- Rival and paddock chatter: other teams' staff talk about your hires and leaks. Leaks are real: staff who left your team carry your direction knowledge (existing knowledge system).
- Social feed shows the fans reacting to a test day video clip and the part's first race.

## 7. Story space (how many are needed)
Not scripted lines: a small set of conditions, each combining with state to produce many tellings.
- Direction beats: backed-right, backed-wrong, overruled-right, overruled-wrong (4) x areas (5) x who (chief, department head, intern, driver feedback) = 80 conditions, each with 3 to 4 spoken variants by personality = about 300 lines.
- People beats: notice handed in, counter-offer, poached, rookie pitch lands, rookie flops, promotion, mentor/rival tension, department split, reconciliation = 9 core scenes, each with branches by trait.
- Driver beats (existing convo topics plus 6 new tied to development: car feels worse than last year, he questioned a hire, wants a say in the next car, thanks the factory, doubts the direction, asks for a contract after a good part).
- Media beats: pre-test hype, post-test verdict, part flop, part triumph, leak, interview answer consequences = 6 scenes x 3 tones.
- Crisis arc: a three-stage thread (warning, split, fallout) that can only start when 3 or more overrules and 2 or more misses are on record.
- Triumph arc: three-stage thread when a rookie pitch and a bold direction both land.
Everything above plugs into threads.ts as new thread kinds ("development", "rookie", "split"), obeying the existing director cap, and everything is derived from the ledger of real decisions and real part deliveries.

## 8. Rules that keep it honest
- No scene changes the car, a race, or a result. Scenes reveal truth, change people, and change how the world talks. The car only changes through the part you fit and the people who built it.
- Multiplayer: scenes are per human team, the slice scrub already hides private notes; the test day run is private, press consequences use the shared world.
- Scenes are skippable ("AUTO" delegation levels already exist): delegated managers get the same outcomes decided by the staff's biases, reported in the inbox.

## 9. Build phases
Phase 1: Board room scene. Overlay replaces the effort and idea cards. Presenter sprite, blueprint schematic with live zone data, pitches from real staff (incl. rookie pitch), decision logged to a new decision ledger.
Phase 2: Consequences. Overrule and backing ledger, notice scenes, rookie growth and promotion flow, press hooks, crisis and triumph threads. Tests: 20-season run still passes; each consequence reachable from real play.
Phase 3: Test day scene. Pixel track animation, run plans, noisy telemetry reveal, verdict step, tied into the calendar test day and ready parts.
Phase 4: Lab bays. Per-instrument animation ending in the real number; Lab output feeds the same pitch flow.
Phase 5: Paddock talks. Walking driver sprites, body language, race engineer replay strip, heard/ignored counters; press conference scene.
Phase 6: Polish and verification in a real browser at each phase, README, zip.

Each phase ships on its own and is verified in a real browser before the next starts.

## 10. Verdicts in detail: fit, hold, scrap (and what each costs the people)
Today (verified in rnd.ts): SCRAP marks the project dead and returns half the cap room only if it was less than half built. Nothing else happens, nobody reacts. HOLD only means a finished part is not fitted at the next race. It costs nothing and nobody notices. Both are too weightless. New rules:

FIT (the part goes on the car)
- Scene: the part is carried from the factory bay to the garage, the mechanics bolt it on, a money ticker counts down the cost (cap room bar and cash both visibly drain, coin sprites fly out), the author stands by the car. If the part was a rookie's, he is there too.
- The author's confidence and standing rise a little regardless; the real result lands at the first race (see 11).

HOLD (finished, kept back)
- Real meaning: the part sits in a crate in the garage. It is not fitted. Real costs: it does not get its race data, so its true gain stays unknown (no testing noise reduction); the author waits; each month it sits there the author's patience drops, and a rival who gets the same idea first makes it worth less (the idea expires into "overtaken by the field").
- Real benefits: you can choose the right race (a track where it matters), avoid the upgrade quota, or hold for a regulation change. Held parts are shown as crates in the garage scene with a tag showing how long they have waited.
- Animation: the crate is nailed shut and shelved. The author looks at it, shrugs or sulks according to his personality.

SCRAP (the project is thrown away)
- Real meaning: money already spent is gone (the cap room that was used stays used, apart from the existing early refund), the tunnel hours are lost, and the author takes it personally. A scrapped part that later turns out to have been good (an identical idea appears in a rival's car, or its true gain is revealed afterwards, which only happens if tested) leaves a permanent regret entry in the ledger.
- Animation: the blueprint is screwed up and bin-bounced, or the half-built part is wheeled to a skip. The author's sprite changes mood by personality: stoic nods, proud one slams a door, a rookie goes pale. A teammate may console him.
- Fallout (all rule driven, none scripted): author mood and grievance drop in proportion to how far it got, how often his ideas were scrapped, and his own confidence. Department head cohesion dips. A rookie's trust in you takes a larger hit. A staff member whose last three ideas were scrapped becomes poachable. Press heat only moves if the project was public (test footage seen, leak).

Money feedback everywhere
- Any spend plays a ticker: cash number rolls down, the cap bar slides, coin sprites fly from the account to the thing bought. Income does the reverse. Over budget flashes the bar and the finance head speaks up.
- The garage and factory scenes show consequences of money: more crates and cranes when funded, empty bays and a single light on when starved.

## 11. A world that feels alive (ambient layer, always on)
- Factory floor: staff sprites idle, walk, argue by the whiteboard, carry parts. What they do reflects state (designer asleep at desk during crunch, mechanic polishing the new part, empty desks after departures).
- Overheard lines: small speech bubbles with real content (who is annoyed at whom, whose part is late). They come from the same mood and ledger fields, so they never lie.
- The paddock between sessions: drivers and engineers walking to the garage, a fan outside holding a sign about your last result, media pen filling when something is brewing.
- Weather, time of day and season in the office windows.
- The car itself shows what you built: parts you fitted appear on the sprite; a held part appears as a crate by the wall.
- Memory: people refer back to earlier decisions ("last spring you binned my floor").
- Sound: office hum, paper, tools, coins; each scene has its own bed and short stings.

## 12. Edge cases to settle during build
- Two people claim the same idea (a rookie and a head): split credit, both want the lead.
- A part fits but flops: the author blames the tunnel data staff or the lab; blame lands according to who really gave the bad number (traceable in the ledger).
- Delegated mode: the same verdict logic runs automatically and the inbox shows a one-line summary of what happened to the people.
- Multiplayer: crates, scenes and ledger are private per team; the paddock scenes are shared.

## 13. Status after the first build
Built and verified (tests plus real browser): decision ledger and per-person record, pitches from real staff with rookie pitches, briefing, verdict with track tests and fit/hold/scrap scenes and reactions, money ticker, notices, development crisis, landing consequences, press questions, press conference scene, pre-season test scene, Lab bay animations, living office strip, staff profile history, online per-manager privacy, two-player browser run.
Changed from the plan: a held part can still be track tested (the crate costs patience and value, not the ability to test). Fit has no cash cost of its own, the money moves when an idea is backed (cap room ticker) and when a test is run.
Built in the second pass: the pre-season test is now a real programme choice (mileage, aero mapping, race simulation, trainee laps, press show) with different consequences; the race engineer's animated replay in the debrief (playhead, key moments, his face reacts); lab shapes can be sent to the drawing office and arrive as pitches with the instrument's own range; a rookie story thread (a trainee's part works, rivals circle, he stays or leaves by how he was treated, no dice); scene sounds (stamp, paper, shutter).
Still not built: a calendar event for in-season test days (only the pre-season one exists, because the rules in this game have no others), per-person body sprites beyond face reactions, and a looping ambient office sound bed.

## Status: fluid stories and playtest fixes
- Stories are chance-driven and evolving. The rookie thread rolls whether he stays (odds shift with promote / credit / quiet word and the mood and record with him), then can branch into a bolder idea, a demand for a bigger role, or settling in. No ending is a formula.
- Ideas put in a batch and not taken are shelved for good (the tradeoff the plan wanted); scrapping from any screen plays the bin scene with the author's reaction; sessions have a DASHBOARD button; livery colours reach the sim cars.

## Done: per-set tyres, shared set picker, test fields
See README "Tyre sets". Open: scrub bonus, online start-set sync.

## Done: development revamp (briefs and approaches)
Research notes: interesting decisions need consequences, rough predictability and no dominant option (Meier, via Game Developer); F1 2017's R&D tied upgrades to trade-offs across paths and planning for later seasons. Applied: one problem per brief, three structurally different approaches, a certain side cost on the gamble, race-by-race fit, landing time, slot scarcity. Open: this-year vs next-year on the same board; AI teams on the same flow.

## Done: development revamp round 2 (boosts, dials, banked research, crises)
Approved by the user as items 2 to 6 of the research proposal (the Rushed/Normal/Intense dial was left out). See README.
