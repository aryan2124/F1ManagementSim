import type { Area } from "./types";

/**
 * The regulation module library: 50 rule changes the era engine can pick from.
 * Every number here is the game's own design. Nothing is real-world racing data except where the rule text says so.
 *
 * "live" says what a module really does in this build:
 *   sim    changes how the simulated race is run (tyres, safety car, pit time, points by laps led)
 *   career changes the management game (setup choices, R&D, money, grid and scoring rules)
 *   rules  is announced and scored in the concept routes and the news, but its on-track mechanic is not simulated yet
 */

export type Theme = "spectacle" | "power" | "aero" | "equaliser" | "safety";
export const THEMES: Theme[] = ["spectacle", "power", "aero", "equaliser", "safety"];
export const THEME_LABEL: Record<Theme, string> = {
  spectacle: "Spectacle",
  power: "Power",
  aero: "Aero",
  equaliser: "Equaliser",
  safety: "Safety",
};

export type Category = "Aero" | "Power" | "Tyres" | "Race format" | "Communication" | "Operations" | "Financial" | "Chassis" | "Pit lane" | "Scoring" | "Qualifying" | "People";
export type ModKind = "setting" | "control" | "numbers";
export type Live = "sim" | "career" | "rules";

export interface AxisDef {
  id: string;
  label: string;
  low: string;
  high: string;
  target: "aero" | "power" | "tyre" | "consistency";
}

export interface Flags {
  /** R&D in these areas is blocked while the module is live. */
  freezeAreas?: Area[];
  /** Multiplies the true gain of new R&D ideas in an area. */
  areaMult?: Partial<Record<Area, number>>;
  extraAxes?: AxisDef[];
  removeAxes?: string[];
  /** Setup can only change in the first practice session. */
  setupLockAfterFirst?: boolean;
  extraRuns?: number;
  /** Max parts fitted per season. */
  upgradeQuota?: number;
  tunnelBank?: boolean;
  openBooks?: boolean;
  /** Income per fitted project, share of its cost. */
  customerParts?: number;
  /** Cap on the two drivers' total pay, $m. */
  talentCap?: number;
  /** Success ballast: seconds per lap for the leader, scaled by rank. */
  ballast?: number;
  handicapStart?: boolean;
  reverseSprint?: boolean;
  bestCarOnly?: boolean;
  playoffCut?: boolean;
  lapLed?: boolean;
  /** Fixed pit stop time, seconds. */
  fixedStop?: number;
  scheduledSC?: boolean;
  oneCompound?: boolean;
  tyreLottery?: boolean;
  /** Tyre wear multiplier. */
  tyreSev?: number;
  /** How much of the driver pace spread is left (1 = all). */
  driverWeight?: number;
  /** Race length uncertainty, share. */
  timed?: number;
  weatherCard?: boolean;
  fanVote?: boolean;
  rookieRule?: boolean;
  enginePackages?: boolean;
  /** The module only lasts this many seasons of the era. */
  seasons?: number;
  /** Race-format and qualifying rules (simulated). */
  batterySwap?: boolean;
  twoHeat?: boolean;
  pushToPass?: number;
  openRadio?: boolean;
  radioQuota?: number;
  stopWindow?: boolean;
  defenceTokens?: number;
  standingRestarts?: boolean;
  stageRacing?: boolean;
  checkpointCuts?: boolean;
  formatSplit?: boolean;
  refuelling?: boolean;
  tyrePool?: boolean;
  aggregateQuali?: boolean;
  singleShot?: boolean;
  qualiTyreLock?: boolean;
}

export interface ModuleDef {
  id: string;
  name: string;
  category: Category;
  rule: string;
  change: string;
  kind: ModKind;
  live: Live;
  /** Themes that may pick this module as the headline. */
  headline: Theme[];
  /** Themes that may pick it as a supporting module. */
  support: Theme[];
  intent: string;
  /** The two hidden unknowns this module adds. */
  unknowns: [string, string];
  /** What the intensity means in words. */
  scale: string;
  conflicts?: string[];
  flags: (k: number) => Flags;
}

const lvl = (k: number, a: string, b: string, c: string) => (k < 0.4 ? a : k < 0.7 ? b : c);
const M = (m: ModuleDef): ModuleDef => m;

export const MODULES: ModuleDef[] = [
  M({
    id: "activeWings", name: "Active wings", category: "Aero", kind: "setting", live: "career",
    rule: "Wing flaps may switch between two states in zones set per circuit.",
    change: "New setting: a wing zone plan. Unknown: how often the actuators fail under heavy use.",
    headline: ["aero", "spectacle"], support: ["aero", "spectacle"], intent: "More overtaking, lower drag on straights",
    unknowns: ["Actuator failure rate under heavy use", "Lap time the zone plan is worth"], scale: "Number of zones per lap",
    flags: (k) => ({ extraAxes: [{ id: "wingzones", label: "Wing zone plan", low: "Few zones: stable, slower on the straights", high: "Many zones: quick in a straight line, riskier", target: "aero" }], areaMult: { aero: 1 + 0.15 * k } }),
  }),
  M({
    id: "groundEffect", name: "Ground effect revival", category: "Aero", kind: "setting", live: "career",
    rule: "Downforce comes mainly from the floor tunnels.",
    change: "New setting: ride height. Risk of bouncing. Unknown: the stiffness window.",
    headline: ["aero", "spectacle"], support: ["aero"], intent: "Cars follow each other more closely",
    unknowns: ["Width of the stiffness window", "Bouncing sensitivity"], scale: "How much of the downforce comes from the floor",
    conflicts: ["specFloor"],
    flags: (k) => ({ extraAxes: [{ id: "rideheight", label: "Ride height", low: "Low: more downforce, more bouncing", high: "High: safer, less grip", target: "aero" }], areaMult: { chassis: 1 + 0.25 * k } }),
  }),
  M({
    id: "specFloor", name: "Spec floor", category: "Aero", kind: "control", live: "career",
    rule: "Everyone must use a standard floor.",
    change: "Control removed: floor development. Aero gains shrink, so work moves to wings, bodywork and cooling.",
    headline: ["equaliser"], support: ["equaliser", "safety"], intent: "Cheaper, closer racing",
    unknowns: ["How much floor work was worth", "Where the gains move to"], scale: "How hard aero gains are cut",
    conflicts: ["groundEffect"],
    flags: (k) => ({ areaMult: { aero: 1 - 0.5 * k, cooling: 1 + 0.2 * k } }),
  }),
  M({
    id: "shrunkCars", name: "Shrunk cars", category: "Aero", kind: "numbers", live: "sim",
    rule: "Smaller and lighter cars.",
    change: "Lap times and overtaking shift, tyre loads change, tight circuits are favoured.",
    headline: ["spectacle", "safety"], support: ["spectacle", "safety"], intent: "Nimbler cars",
    unknowns: ["Tyre load change", "Effect on tight circuits"], scale: "How much smaller",
    flags: (k) => ({ tyreSev: 1 - 0.14 * k }),
  }),
  M({
    id: "deployMaps", name: "Deployment maps", category: "Power", kind: "setting", live: "career",
    rule: "A much larger electric share of power, programmed by the team.",
    change: "New setting: battery deployment, set for each lap.",
    headline: ["power"], support: ["power", "spectacle"], intent: "Electric power matters more",
    unknowns: ["Battery heating", "Value of end-of-straight deployment"], scale: "Electric share of power",
    flags: () => ({ extraAxes: [{ id: "deploy", label: "Battery deployment", low: "Save it for the end of the straight", high: "Spend it early out of corners", target: "power" }] }),
  }),
  M({
    id: "fuelFlow", name: "Fuel flow budget", category: "Power", kind: "setting", live: "career",
    rule: "A fixed race fuel mass and a flow cap.",
    change: "New setting: a race fuel plan with rich and lean laps.",
    headline: ["power", "equaliser"], support: ["power", "safety"], intent: "Efficiency matters",
    unknowns: ["Fuel needed per lap at this track", "Value of rich laps"], scale: "How much the allowance is cut",
    flags: () => ({ extraAxes: [{ id: "fuelplan", label: "Race fuel plan", low: "Lean early, push late", high: "Rich early, save late", target: "tyre" }] }),
  }),
  M({
    id: "enginePackages", name: "Engine packages", category: "Power", kind: "control", live: "career",
    rule: "Pick one of three engine packages (sprinter, marathoner, balanced) for the whole era.",
    change: "Control removed: you cannot change it later. Which one suits the calendar is the gamble.",
    headline: ["power"], support: ["power", "equaliser"], intent: "A real choice that lasts",
    unknowns: ["How the calendar rewards each package", "Reliability of the sprinter package"], scale: "How far the packages differ",
    flags: () => ({ enginePackages: true }),
  }),
  M({
    id: "batterySwap", name: "Battery swap", category: "Power", kind: "setting", live: "sim",
    rule: "The energy store may be swapped at a stop.",
    change: "New pit decision: swap or not, with a time cost. Not done in real-world racing.",
    headline: ["spectacle", "power"], support: ["spectacle"], intent: "Strategy through energy",
    unknowns: ["Swap time cost", "Value of a full battery"], scale: "Time cost of a swap",
    flags: () => ({ batterySwap: true }),
  }),
  M({
    id: "tyreLottery", name: "Tyre lottery", category: "Tyres", kind: "control", live: "sim",
    rule: "Compounds for each set are drawn from a pool.",
    change: "Control removed: you cannot choose compounds. Strategy adapts to what you draw.",
    headline: ["spectacle"], support: ["spectacle", "equaliser"], intent: "Mix up the order",
    unknowns: ["Spread between compounds", "Value of a good draw"], scale: "How wide the pool is",
    conflicts: ["oneCompound"],
    flags: () => ({ tyreLottery: true }),
  }),
  M({
    id: "oneCompound", name: "One compound", category: "Tyres", kind: "numbers", live: "sim",
    rule: "A single compound with heavy thermal wear.",
    change: "Tyre management dominates and setup matters more.",
    headline: ["spectacle", "equaliser"], support: ["spectacle", "equaliser"], intent: "Close racing through wear",
    unknowns: ["Wear rate in the heat", "Setup sensitivity"], scale: "How fast the tyre wears",
    conflicts: ["tyreLottery"],
    flags: (k) => ({ oneCompound: true, tyreSev: 1.15 + 0.3 * k }),
  }),
  M({
    id: "coldTyres", name: "Cold tyres", category: "Tyres", kind: "setting", live: "career",
    rule: "Tyre warmers are banned.",
    change: "New setting: out lap and warm-up plans, with a risk of early mistakes.",
    headline: ["spectacle", "safety"], support: ["spectacle", "safety"], intent: "Drivers matter more at the start of a stint",
    unknowns: ["Grip lost on cold rubber", "Which tyre warms fastest"], scale: "How cold the tyres start",
    flags: () => ({ extraAxes: [{ id: "warmup", label: "Warm-up plan", low: "Gentle out lap, safe", high: "Hard weaving out lap, risky", target: "consistency" }] }),
  }),
  M({
    id: "twoHeat", name: "Two heat Grand Prix", category: "Race format", kind: "setting", live: "sim",
    rule: "The race is run in two heats with a reshuffled grid.",
    change: "New decision: a mid-race reset and a second strategy.",
    headline: ["spectacle"], support: ["spectacle"], intent: "A new beginning half way",
    unknowns: ["How the reshuffle favours quick qualifiers", "Tyre sets needed"], scale: "How much of the grid is reshuffled",
    flags: () => ({ twoHeat: true }),
  }),
  M({
    id: "reverseGrid", name: "Reverse grid sprint", category: "Race format", kind: "numbers", live: "career",
    rule: "The sprint grid for the top ten is reversed.",
    change: "Sprint strategy flips and qualifying matters less on sprint weekends.",
    headline: ["spectacle", "equaliser"], support: ["spectacle", "equaliser"], intent: "More action in the sprint",
    unknowns: ["Value of a quick sprint start", "Risk of contact at the front"], scale: "How many cars are reversed",
    flags: () => ({ reverseSprint: true }),
  }),
  M({
    id: "pushToPass", name: "Push to pass tokens", category: "Race format", kind: "setting", live: "sim",
    rule: "Each driver gets a fixed number of boost tokens per race.",
    change: "New live setting: when to spend them.",
    headline: ["spectacle", "power"], support: ["spectacle", "power"], intent: "Overtaking by choice",
    unknowns: ["Value of a token", "Defence against boost"], scale: "Tokens per race",
    flags: (k) => ({ pushToPass: Math.round(8 - 5 * k) }),
  }),
  M({
    id: "successBallast", name: "Success ballast", category: "Race format", kind: "numbers", live: "career",
    rule: "Leaders carry extra weight.",
    change: "Anti snowball. Winning costs you pace.",
    headline: ["equaliser"], support: ["equaliser"], intent: "Stop one team running away",
    unknowns: ["Lap time per kilo", "Effect on tyres"], scale: "Kilos for the leader",
    conflicts: ["handicapStart"],
    flags: (k) => ({ ballast: 0.1 + 0.25 * k }),
  }),
  M({
    id: "openRadio", name: "Open radio", category: "Communication", kind: "numbers", live: "sim",
    rule: "All team radio is public in real time.",
    change: "Bluffs and hints change, because everyone listens.",
    headline: ["spectacle"], support: ["spectacle", "safety"], intent: "Fans hear everything",
    unknowns: ["How much teams bluff", "Delay of the feed"], scale: "How much is public",
    flags: () => ({ openRadio: true }),
  }),
  M({
    id: "radioQuota", name: "Radio quota", category: "Communication", kind: "control", live: "sim",
    rule: "A fixed number of radio messages per car per race.",
    change: "Control removed: micromanagement. Driver traits matter more.",
    headline: ["safety", "equaliser"], support: ["safety", "equaliser"], intent: "Less pit wall control",
    unknowns: ["Messages needed per race", "Driver self reliance"], scale: "Messages per race",
    flags: (k) => ({ radioQuota: Math.round(14 - 8 * k) }),
  }),
  M({
    id: "parcFerme", name: "Parc ferme extension", category: "Operations", kind: "control", live: "career",
    rule: "Setup is locked from the first practice session.",
    change: "Control removed: setup changes. Friday decisions carry more risk.",
    headline: ["equaliser", "safety"], support: ["equaliser", "safety"], intent: "Less money into weekend changes",
    unknowns: ["Value of Friday data", "Driver adaptation to a fixed setup"], scale: "How early the lock is",
    flags: () => ({ setupLockAfterFirst: true }),
  }),
  M({
    id: "inSeasonTesting", name: "In season testing", category: "Operations", kind: "setting", live: "career",
    rule: "A few testing days are allowed.",
    change: "Extra practice style sessions and a new budget choice.",
    headline: ["equaliser", "safety"], support: ["equaliser", "safety", "aero"], intent: "More learning, cheaper than the tunnel",
    unknowns: ["Value of a test day", "Wear on the staff"], scale: "Test days",
    flags: (k) => ({ extraRuns: 1 + (k > 0.6 ? 1 : 0) }),
  }),
  M({
    id: "talentCap", name: "Talent cap", category: "Financial", kind: "numbers", live: "career",
    rule: "A cap on total driver pay.",
    change: "Stars cost more of a fixed pool and contracts change.",
    headline: ["equaliser"], support: ["equaliser"], intent: "Keep driver pay in check",
    unknowns: ["How stars react", "Pay driver supply"], scale: "How low the cap is",
    flags: (k) => ({ talentCap: Math.round(34 - 14 * k) }),
  }),
  M({
    id: "tunnelBank", name: "Tunnel hour bank", category: "Financial", kind: "setting", live: "career",
    rule: "Wind tunnel hours can be saved or borrowed across seasons.",
    change: "New setting: a long term development loan.",
    headline: ["aero", "equaliser"], support: ["aero", "equaliser"], intent: "Planning over several seasons",
    unknowns: ["Interest on borrowed hours", "Value of saved hours"], scale: "How much can be carried",
    flags: () => ({ tunnelBank: true }),
  }),
  M({
    id: "openBooks", name: "Open books", category: "Financial", kind: "numbers", live: "career",
    rule: "Fitted upgrades are revealed to every team.",
    change: "Intel gets easier and copying gets faster.",
    headline: ["equaliser", "safety"], support: ["equaliser"], intent: "Sharing development",
    unknowns: ["How fast teams copy", "Value of secrecy"], scale: "How much is revealed",
    flags: () => ({ openBooks: true }),
  }),
  M({
    id: "frozenChassis", name: "Frozen chassis", category: "Chassis", kind: "control", live: "career",
    rule: "The chassis is frozen for two seasons and only reliability and power are free.",
    change: "Control removed: aero and chassis development. Pressure moves to the power unit.",
    headline: ["equaliser", "power"], support: ["equaliser", "power"], intent: "Cheaper, then a fresh start",
    unknowns: ["Power gain available", "Reliability cost of the freeze"], scale: "Strength of the freeze",
    flags: () => ({ freezeAreas: ["aero", "chassis"], areaMult: { power: 1.25, cooling: 1.15 }, seasons: 2 }),
  }),
  M({
    id: "driverAids", name: "Driver aids return", category: "Chassis", kind: "numbers", live: "career",
    rule: "Active suspension returns.",
    change: "A new development focus and less driver influence.",
    headline: ["safety", "spectacle"], support: ["safety"], intent: "Smooth, safe cars",
    unknowns: ["Gain from active systems", "Driver feel left"], scale: "How much the aids help",
    flags: (k) => ({ driverWeight: 1 - 0.4 * k }),
  }),
  // ---- 25 to 50
  M({
    id: "scheduledSC", name: "Scheduled safety car", category: "Race format", kind: "setting", live: "sim",
    rule: "A controlled neutralisation happens at a lap inside a window, announced five laps before.",
    change: "New live decision: pit under it or gamble on staying out. Gaps are reset.",
    headline: ["spectacle"], support: ["spectacle", "safety"], intent: "Close the field up on purpose",
    unknowns: ["Which lap it falls on", "Value of a free stop"], scale: "How many laps it lasts",
    flags: () => ({ scheduledSC: true }),
  }),
  M({
    id: "stopWindow", name: "Mandatory stop window", category: "Race format", kind: "control", live: "sim",
    rule: "Each race has a stop window drawn per circuit, and a stop outside it carries a time penalty.",
    change: "Control removed: free stop timing. The undercut becomes a timing fight.",
    headline: ["spectacle"], support: ["spectacle", "equaliser"], intent: "Predictable strategy windows",
    unknowns: ["Window width", "Penalty for missing it"], scale: "Window width",
    flags: () => ({ stopWindow: true }),
  }),
  M({
    id: "defenceTokens", name: "Defence tokens", category: "Race format", kind: "setting", live: "sim",
    rule: "Each driver may defend hard a fixed number of times per race.",
    change: "New live setting: when to spend defence. Team orders gain a new topic.",
    headline: ["spectacle", "safety"], support: ["spectacle", "safety"], intent: "Fair fights",
    unknowns: ["Tokens needed per race", "Time lost defending"], scale: "Tokens per race",
    flags: (k) => ({ defenceTokens: Math.round(5 - 3 * k) }),
  }),
  M({
    id: "standingRestarts", name: "Standing restarts", category: "Race format", kind: "numbers", live: "sim",
    rule: "Every safety car ends with a standing start.",
    change: "Start skill and tyre warm-up decide restarts.",
    headline: ["spectacle"], support: ["spectacle"], intent: "Restarts as a show",
    unknowns: ["Clutch reliability", "Tyre warm-up loss"], scale: "How many restarts",
    flags: () => ({ standingRestarts: true }),
  }),
  M({
    id: "stageRacing", name: "Stage racing", category: "Race format", kind: "setting", live: "sim",
    rule: "The race is split into three stages with points at the end of each.",
    change: "New decision: pit between stages, or hold track position for stage points.",
    headline: ["spectacle"], support: ["spectacle"], intent: "Action throughout the race",
    unknowns: ["Points per stage", "Value of track position"], scale: "Points per stage",
    flags: () => ({ stageRacing: true }),
  }),
  M({
    id: "timedFinish", name: "Timed finish", category: "Race format", kind: "control", live: "sim",
    rule: "The race ends after a set time, not a set number of laps.",
    change: "Control removed: a known race length. Fuel and tyre plans cover a distance you only estimate.",
    headline: ["spectacle", "safety"], support: ["spectacle", "safety"], intent: "Predictable TV length",
    unknowns: ["How many laps fit in the time", "Effect of safety cars on the count"], scale: "How uncertain the length is",
    flags: (k) => ({ timed: 0.05 + 0.08 * k }),
  }),
  M({
    id: "checkpointCuts", name: "Checkpoint cuts", category: "Race format", kind: "numbers", live: "sim",
    rule: "At one third and two thirds distance, the last three cars take a pit lane penalty.",
    change: "Backmarkers get desperate, midfield cars fight to stay out of the bottom three.",
    headline: ["spectacle", "equaliser"], support: ["spectacle"], intent: "Mid race tension",
    unknowns: ["Penalty size", "Backmarker behaviour"], scale: "Penalty size",
    flags: () => ({ checkpointCuts: true }),
  }),
  M({
    id: "handicapStart", name: "Handicap start", category: "Race format", kind: "numbers", live: "sim",
    rule: "Grid gaps are set by championship position, so the weakest teams start ahead and are released in intervals.",
    change: "Anti snowball. The leader's strategy becomes a recovery drive.",
    headline: ["equaliser"], support: ["equaliser"], intent: "Reward the chase",
    unknowns: ["Overtaking difficulty", "Tyre cost of recovering"], scale: "How big the gaps are",
    conflicts: ["successBallast"],
    flags: () => ({ handicapStart: true }),
  }),
  M({
    id: "weatherCard", name: "Weather card", category: "Race format", kind: "setting", live: "career",
    rule: "The governing body publishes a dry, mixed or wet card on Thursday with a chance range, and the race follows it loosely.",
    change: "New early decision: commit setup and tyres before the forecast is certain.",
    headline: ["spectacle", "safety"], support: ["spectacle", "safety"], intent: "Set expectations early",
    unknowns: ["How reliable the card is", "Setup cost of guessing wrong"], scale: "How reliable the card is",
    flags: () => ({ weatherCard: true }),
  }),
  M({
    id: "fanVote", name: "Fan vote rule", category: "Race format", kind: "setting", live: "career",
    rule: "Fans choose one small rule per weekend from three options on Thursday.",
    change: "A weekly wildcard. Fan base and media mood shape the options offered.",
    headline: ["spectacle"], support: ["spectacle"], intent: "Let the fans in",
    unknowns: ["What fans pick", "Effect on sponsors"], scale: "How big the options are",
    flags: () => ({ fanVote: true }),
  }),
  M({
    id: "formatSplit", name: "Format split", category: "Race format", kind: "numbers", live: "sim",
    rule: "Half the calendar uses one race format and half another, announced per round.",
    change: "Two strategy books to keep. A team built for one half can lose the other.",
    headline: ["spectacle", "equaliser"], support: ["spectacle"], intent: "Variety",
    unknowns: ["Which half suits whom", "Points balance between formats"], scale: "How different the formats are",
    flags: () => ({ formatSplit: true }),
  }),
  M({
    id: "refuelling", name: "Refuelling returns", category: "Pit lane", kind: "setting", live: "sim",
    rule: "Fuel can be added at a stop at a capped flow rate.",
    change: "New decision: fuel load per stint, the old light car trade-off.",
    headline: ["spectacle", "power"], support: ["spectacle"], intent: "Strategy variety",
    unknowns: ["Flow rate", "Weight penalty per kilo"], scale: "Flow rate cap",
    flags: () => ({ refuelling: true }),
  }),
  M({
    id: "fixedStop", name: "Fixed stop time", category: "Pit lane", kind: "control", live: "sim",
    rule: "Every stop takes a minimum time, whatever the crew can do.",
    change: "Control removed: pit crew advantage. Crew spend moves to other areas.",
    headline: ["equaliser", "safety"], support: ["equaliser", "safety"], intent: "Remove pit lane luck",
    unknowns: ["Value of the crew", "Time of the fixed stop"], scale: "How long the fixed stop is",
    flags: (k) => ({ fixedStop: 2.4 + 0.8 * k }),
  }),
  M({
    id: "tyrePool", name: "Team tyre pool", category: "Operations", kind: "numbers", live: "sim",
    rule: "Tyre sets are shared between both cars for the whole weekend.",
    change: "A set used by one car is gone for the other. Strategy becomes a team puzzle.",
    headline: ["equaliser", "safety"], support: ["equaliser"], intent: "Team strategy",
    unknowns: ["Sets needed per car", "Value of a fresh set"], scale: "Sets in the pool",
    flags: () => ({ tyrePool: true }),
  }),
  M({
    id: "upgradeQuota", name: "Upgrade quota", category: "Operations", kind: "control", live: "career",
    rule: "Each team may fit only a fixed number of upgrade packages per season.",
    change: "New decision: which races get the upgrades, and which projects wait.",
    headline: ["equaliser", "aero"], support: ["equaliser", "aero"], intent: "Smaller development race",
    unknowns: ["Value of a late package", "Cost of waiting"], scale: "Packages per season",
    flags: (k) => ({ upgradeQuota: Math.round(8 - 4 * k) }),
  }),
  M({
    id: "lapLed", name: "Lap led points", category: "Scoring", kind: "numbers", live: "sim",
    rule: "Points are earned for each tenth of the race led.",
    change: "Rewards track position. Undercuts that cost lead laps are judged differently.",
    headline: ["spectacle"], support: ["spectacle", "equaliser"], intent: "Reward leading",
    unknowns: ["Points per tenth", "Value of pole"], scale: "Points per tenth",
    flags: () => ({ lapLed: true }),
  }),
  M({
    id: "bestCar", name: "Best car constructors", category: "Scoring", kind: "numbers", live: "career",
    rule: "Only a team's best car scores in the constructors' table.",
    change: "Team orders and number two contracts change. Grievance tied to being the second car gets sharper.",
    headline: ["equaliser"], support: ["equaliser", "spectacle"], intent: "Reward the best car",
    unknowns: ["Value of a second driver", "Pay for number two"], scale: "How much the second car counts",
    flags: () => ({ bestCarOnly: true }),
  }),
  M({
    id: "playoff", name: "Playoff cut", category: "Scoring", kind: "numbers", live: "career",
    rule: "After round twelve, the top ten drivers' points are compressed and the rest are out of the title.",
    change: "A mid-season cliff. Development planning shifts to be ready for that point.",
    headline: ["spectacle", "equaliser"], support: ["spectacle"], intent: "A title fight to the end",
    unknowns: ["How many make the cut", "Compression"], scale: "How hard the points are compressed",
    flags: () => ({ playoffCut: true }),
  }),
  M({
    id: "aggregateQuali", name: "Aggregate qualifying", category: "Qualifying", kind: "numbers", live: "sim",
    rule: "Qualifying time is the sum of two laps.",
    change: "Consistency beats one lucky lap, and rain risk grows.",
    headline: ["spectacle", "safety"], support: ["spectacle"], intent: "Reward consistency",
    unknowns: ["Tyre warm-up between laps", "Effect of rain"], scale: "Weight of the second lap",
    flags: () => ({ aggregateQuali: true }),
  }),
  M({
    id: "singleShot", name: "Single shot qualifying", category: "Qualifying", kind: "control", live: "sim",
    rule: "One flying lap per car, in reverse points order.",
    change: "Control removed: a second attempt. Track evolution decides who benefits.",
    headline: ["spectacle"], support: ["spectacle"], intent: "One lap, all the pressure",
    unknowns: ["Track evolution", "Pressure on drivers"], scale: "How much evolution there is",
    flags: () => ({ singleShot: true }),
  }),
  M({
    id: "qualiTyreLock", name: "Qualifying tyre lock", category: "Qualifying", kind: "numbers", live: "sim",
    rule: "The tyre used for the fastest Q3 lap is the start tyre.",
    change: "New tension: the fastest tyre in qualifying may be wrong for the race.",
    headline: ["spectacle", "safety"], support: ["spectacle"], intent: "Tyre strategy begins on Saturday",
    unknowns: ["Gap between qualifying and race tyre", "Start tyre value"], scale: "Gap between compounds",
    flags: () => ({ qualiTyreLock: true }),
  }),
  M({
    id: "moveableBallast", name: "Moveable ballast", category: "Chassis", kind: "setting", live: "career",
    rule: "A fixed ballast mass can be shifted along the car between sessions.",
    change: "New setting: weight balance, a trade-off between qualifying and race.",
    headline: ["aero", "safety"], support: ["aero", "safety"], intent: "A new tuning tool",
    unknowns: ["Balance shift per kilo", "Tyre effect"], scale: "Ballast mass",
    flags: () => ({ extraAxes: [{ id: "ballastpos", label: "Ballast position", low: "Forward: quicker on turn-in", high: "Rear: better traction and tyres", target: "tyre" }] }),
  }),
  M({
    id: "stdGearbox", name: "Standard gearbox", category: "Chassis", kind: "control", live: "career",
    rule: "Everyone uses one gearbox with fixed ratios.",
    change: "Control removed: ratio setup. Drivers' feel for tyres and engine mode matter more.",
    headline: ["equaliser", "safety"], support: ["equaliser", "safety"], intent: "Cheaper, simpler",
    unknowns: ["Gearbox suitability per track", "Reliability"], scale: "How narrow the ratios are",
    flags: () => ({ removeAxes: ["gearing"], driverWeight: 0.9 }),
  }),
  M({
    id: "fuelCredits", name: "Sustainable fuel credits", category: "Power", kind: "setting", live: "career",
    rule: "Teams choose a fuel blend each race, with richer blends giving more power and costing credits.",
    change: "New decision: spend credits at the right races. Running short means a penalty.",
    headline: ["power", "safety"], support: ["power", "safety"], intent: "Green fuel with a trade-off",
    unknowns: ["Power per credit", "Credits needed per season"], scale: "Credits per season",
    flags: () => ({ extraAxes: [{ id: "fuelblend", label: "Fuel blend", low: "Lean blend: saves credits, less power", high: "Rich blend: more power, costs credits", target: "power" }] }),
  }),
  M({
    id: "rookieRule", name: "Rookie race rule", category: "People", kind: "setting", live: "career",
    rule: "Every team must field a rookie in two races per season.",
    change: "New decision: which two races, and an academy payoff for prospects who are ready.",
    headline: ["spectacle", "equaliser"], support: ["equaliser", "spectacle"], intent: "More young drivers in the top flight",
    unknowns: ["Cost of a weak rookie", "Value of early experience"], scale: "Races per season",
    flags: () => ({ rookieRule: true }),
  }),
  M({
    id: "customerParts", name: "Customer parts market", category: "Financial", kind: "numbers", live: "career",
    rule: "Teams may sell last season's design parts to other teams.",
    change: "A new income line and a strategic risk, because you may arm a rival.",
    headline: ["equaliser"], support: ["equaliser"], intent: "Share old designs for money",
    unknowns: ["Price of old parts", "Pace given to rivals"], scale: "Share of the cost recovered",
    flags: (k) => ({ customerParts: 0.15 + 0.2 * k }),
  }),
];

export const MODULE_BY_ID: Record<string, ModuleDef> = Object.fromEntries(MODULES.map((m) => [m.id, m]));

export function describeIntensity(m: ModuleDef, k: number): string {
  return `${m.scale}: ${lvl(k, "mild", "medium", "brutal")}`;
}
