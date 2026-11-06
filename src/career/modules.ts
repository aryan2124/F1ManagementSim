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
  /** Open cooling: cooling R&D is worth more and a good cooling package buys reliability. */
  openCooling?: number;
  /** Fixed attack zones: boost only on marked stretches. */
  attackZones?: boolean;
  /** Every weekend is a sprint weekend. */
  allSprints?: boolean;
  /** Cost audits: yearly R&D spend above this ($m) is fined. */
  auditor?: number;
  reverseSprint?: boolean;
  bestCarOnly?: boolean;
  playoffCut?: boolean;
  lapLed?: boolean;
  /** Fixed pit stop time, seconds. */
  fixedStop?: number;
  /** Two drivers a car: at the first stop the car hands over to its teammate's driver. */
  relay?: boolean;
  /** Drivers belong to the league: expiring drivers go into a pool and teams pick in reverse standings order. */
  draft?: boolean;
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
const round1 = (x: number) => Math.round(x * 10) / 10;

export const MODULES: ModuleDef[] = [
  M({
    id: "openCooling", name: "Open cooling", category: "Aero", kind: "numbers", live: "career",
    rule: "Cooling layouts are free: no homologated inlet sizes.",
    change: "Cooling becomes a place to win, and a good package buys reliability.",
    headline: ["power", "spectacle"], support: ["power", "aero"], intent: "Reward clever packaging",
    unknowns: ["How much cooling is worth", "Drag price of big inlets"], scale: "How much cooling work is worth",
    flags: (k) => ({ openCooling: round1(0.4 + 0.8 * k), areaMult: { cooling: 1.2 + 0.4 * k } }),
  }),
  M({
    id: "attackZones", name: "Attack zones", category: "Race format", kind: "setting", live: "sim",
    rule: "Boost can only be spent on marked stretches of each circuit.",
    change: "Overtaking is steered to the zones and defence has to guess where.",
    headline: ["spectacle"], support: ["spectacle", "power"], intent: "Overtaking in the right places",
    unknowns: ["Which zones favour the attacker", "Cost of being passed there"], scale: "Tokens per race",
    conflicts: ["pushToPass"],
    flags: (k) => ({ pushToPass: Math.round(6 - 3 * k), attackZones: true }),
  }),
  M({
    id: "twoRaceWeekend", name: "Two-race weekend", category: "Race format", kind: "setting", live: "career",
    rule: "Every weekend is a sprint weekend: a short race and a full one.",
    change: "More points to fight for and more tyre and parts wear every weekend.",
    headline: ["spectacle"], support: ["spectacle"], intent: "Twice the racing for the same travel",
    unknowns: ["Tyre sets needed", "How teams split their setup"], scale: "n/a",
    conflicts: ["reverseGrid"],
    flags: () => ({ allSprints: true }),
  }),
  M({
    id: "auditor", name: "Cost auditor", category: "Financial", kind: "numbers", live: "career",
    rule: "An auditor checks R&D spend against a cap each month.",
    change: "Overspending is fined, and the cap is a hidden number until the first fine.",
    headline: ["equaliser"], support: ["equaliser", "safety"], intent: "Keep spending honest",
    unknowns: ["Where the cap really sits", "How creative accounting is read"], scale: "How tight the cap is",
    flags: (k) => ({ auditor: Math.round(26 - 10 * k) }),
  }),
  M({
    id: "sixWheels", name: "Six wheels", category: "Chassis", kind: "setting", live: "career",
    rule: "Wheel count is free within the tyre allocation.",
    change: "A new layout choice changes tyres, wear and the pit crew.",
    headline: ["spectacle"], support: ["spectacle", "power"], intent: "A different car, not a faster one",
    unknowns: ["Wear on small tyres", "Pit stop time with more wheels"], scale: "n/a",
    flags: () => ({ areaMult: { tyres: 1.3, chassis: 1.15 }, tyreSev: 0.9 }),
  }),
  M({
    id: "computerCars", name: "Computer cars", category: "Chassis", kind: "setting", live: "career",
    rule: "Active suspension, traction and launch control are allowed.",
    change: "Software becomes a weekly job and driver skill matters less.",
    headline: ["power", "equaliser"], support: ["power"], intent: "Let the engineers loose",
    unknowns: ["How much the driver still matters", "Who can read your telemetry"], scale: "How much driver skill is cut",
    flags: () => ({ driverWeight: 0.75, tyreSev: 0.95, areaMult: { chassis: 1.2 } }),
  }),
  M({
    id: "fuelIsMoney", name: "Fuel is money", category: "Pit lane", kind: "setting", live: "career",
    rule: "Refuelling returns and fuel is bought from a budget.",
    change: "A light car qualifies and a heavy one starts; pit crews matter more.",
    headline: ["spectacle"], support: ["spectacle"], intent: "Strategy with a pump",
    unknowns: ["Value of a light start", "Fire risk"], scale: "Fuel price",
    flags: () => ({ refuelling: true, tyreSev: 0.93 }),
  }),
  M({
    id: "grenadeEra", name: "Grenade era", category: "Power", kind: "setting", live: "career",
    rule: "Engines may run modes that destroy them, from a fixed pool for the year.",
    change: "The pool is a currency: peak output against runs left.",
    headline: ["power"], support: ["power", "spectacle"], intent: "Peak power for a price",
    unknowns: ["Cost of a failure cascade", "Value of the last engine"], scale: "n/a",
    flags: () => ({ enginePackages: true, areaMult: { power: 1.25 } }),
  }),
  M({
    id: "freedomAuction", name: "Freedom auction", category: "Financial", kind: "setting", live: "career",
    rule: "Every part is standard except three zones, won by sealed bid.",
    change: "Only a few upgrade slots exist and the bid is the poker move.",
    headline: ["equaliser"], support: ["equaliser"], intent: "Three places to be different",
    unknowns: ["What rivals will bid", "Value of a zone"], scale: "Slots",
    flags: () => ({ upgradeQuota: 3 }),
  }),
  M({
    id: "rainOnDemand", name: "Rain on demand", category: "Race format", kind: "setting", live: "career",
    rule: "Promoters may switch sprinklers on, by lottery, with a lap of notice.",
    change: "The forecast is replaced by odds.",
    headline: ["spectacle"], support: ["spectacle"], intent: "Weather by lottery",
    unknowns: ["Odds at each venue", "Value of wet aero"], scale: "n/a",
    flags: () => ({ weatherCard: true }),
  }),
  M({
    id: "theDraft", name: "The draft", category: "People", kind: "setting", live: "career",
    rule: "Drivers belong to the league; the worst teams pick first each year.",
    change: "The academy becomes a main tree and contracts are short.",
    headline: ["equaliser"], support: ["equaliser"], intent: "Talent by order of misery",
    unknowns: ["Value of a pick", "What a franchise tag costs"], scale: "n/a",
    flags: () => ({ rookieRule: true, talentCap: 30, draft: true }),
  }),
  M({
    id: "energyAuction", name: "Energy auction", category: "Power", kind: "setting", live: "career",
    rule: "Before each race teams bid in secret for units of electrical energy.",
    change: "The same bid buys a different race for different cars.",
    headline: ["power"], support: ["power"], intent: "Buy your battery",
    unknowns: ["The price of a unit", "Value of carried-over energy"], scale: "n/a",
    flags: () => ({ batterySwap: true, areaMult: { power: 1.15, cooling: 1.1 } }),
  }),
  M({
    id: "twinChassis", name: "Twin chassis", category: "Chassis", kind: "setting", live: "career",
    rule: "Each team may bring two chassis and pick after practice.",
    change: "Two trees at a higher cost, built toward different tracks.",
    headline: ["aero", "equaliser"], support: ["aero"], intent: "A sprinter and a marathoner",
    unknowns: ["How different the spare may be", "Cost of two trees"], scale: "n/a",
    flags: () => ({ tunnelBank: true, areaMult: { chassis: 1.25 } }),
  }),
  M({
    id: "kitLibrary", name: "Kit library", category: "Aero", kind: "setting", live: "career",
    rule: "Aero kits are the only aero allowed; each team owns five for the season.",
    change: "Five slots, each a branch; you pick which to take where.",
    headline: ["aero"], support: ["aero", "equaliser"], intent: "Kits for courses",
    unknowns: ["Which kit suits which track", "Cost of a spare"], scale: "Kits owned",
    flags: () => ({ upgradeQuota: 5, areaMult: { aero: 1.1 } }),
  }),
  M({
    id: "transparentPaddock", name: "Transparent paddock", category: "Financial", kind: "setting", live: "career",
    rule: "Every third race each team must publish one design dial.",
    change: "Publish true or misleading dials and copy what rivals disclosed.",
    headline: ["equaliser", "safety"], support: ["equaliser"], intent: "Show your hand",
    unknowns: ["Which dial rivals publish", "How noisy a copy is"], scale: "n/a",
    flags: () => ({ openBooks: true }),
  }),
  M({
    id: "relayEra", name: "Relay era", category: "People", kind: "setting", live: "career",
    rule: "Two drivers per car, swapping at the mandatory stop; points are shared.",
    change: "A cockpit tree and driver pairing become decisions.",
    headline: ["spectacle"], support: ["spectacle"], intent: "Two drivers one car",
    unknowns: ["Cost of a slow swap", "Which pair fits"], scale: "Swap time",
    flags: () => ({ fixedStop: 3.4, relay: true }),
  }),
  M({
    id: "tyreWars", name: "Tyre wars", category: "Tyres", kind: "setting", live: "career",
    rule: "Two suppliers compete and each team picks one for the season.",
    change: "Each supplier favours different concepts.",
    headline: ["spectacle", "aero"], support: ["spectacle"], intent: "Choose your rubber",
    unknowns: ["Which concepts a supplier favours", "Supplier development"], scale: "n/a",
    flags: () => ({ tyrePool: true, areaMult: { tyres: 1.25 } }),
  }),
  M({
    id: "wingsBanned", name: "Wings banned", category: "Aero", kind: "setting", live: "career",
    rule: "Wings are banned; downforce comes from the floor and mechanical grip.",
    change: "A mechanical tree and tow tactics replace wings.",
    headline: ["aero", "spectacle"], support: ["aero"], intent: "Ground effect only",
    unknowns: ["Value of the tow", "What counts as a wing"], scale: "n/a",
    flags: () => ({ areaMult: { aero: 0.75, chassis: 1.35 } }),
  }),
];

export const MODULE_BY_ID: Record<string, ModuleDef> = Object.fromEntries(MODULES.map((m) => [m.id, m]));

export function describeIntensity(m: ModuleDef, k: number): string {
  return `${m.scale}: ${lvl(k, "mild", "medium", "brutal")}`;
}
