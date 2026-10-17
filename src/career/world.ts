import { initDesigns } from "./design";
import { initRecords } from "./records";
import { initRoles } from "./status";
import { newBrand } from "./brand";
import { newPress, newRift } from "./dressing";
import { DRIVERS, TEAMS } from "../game/data";
import { fillTier, realPeople, type Person } from "../game/people";
import { Rng, hashSeed } from "../sim/rng";
import { CFG } from "./config";
import { buildCalendar } from "./calendar";
import { epochDay, clamp, round2 } from "./util";
import { initEras, newEraState } from "./eras";
import { initAcademy, newAcademy } from "./academy";
import { defaultBudgets } from "./finance";
import { makeOwner } from "./people";
import { makeManagers } from "./talks";
import { makeCapability } from "./capability";
import { initKnow } from "./know";
import { carFromDna, makeDna, newRegW } from "./traits";
import { AREAS, type Area, type CareerState, type DriverState, type Guidance, type JuniorState, type Sponsor, type Staff, type StaffRole, type TeamState } from "./types";

/**
 * Starting contracts. These are the game's own estimates for an invented career, not real contract data:
 * [salary in $m, last season of the deal].
 */
export const START_CONTRACTS: Record<string, [number, number]> = {
  "f1-rus": [26, 2027], "f1-ant": [5, 2030],
  "f1-lec": [38, 2029], "f1-ham": [40, 2026],
  "f1-nor": [35, 2028], "f1-pia": [25, 2028],
  "f1-ver": [55, 2028], "f1-had": [3, 2027],
  "f1-alb": [10, 2027], "f1-sai": [15, 2027],
  "f1-gas": [10, 2028], "f1-col": [2.5, 2026],
  "f1-oco": [8, 2026], "f1-bea": [3, 2027],
  "f1-law": [4, 2026], "f1-lin": [1.5, 2027],
  "f1-hul": [7, 2026], "f1-bor": [2, 2027],
  "f1-alo": [20, 2026], "f1-str": [8, 2026],
  "f1-per": [8, 2026], "f1-bot": [5, 2026],
};

const FIRST = ["James", "Peter", "Marco", "Andrea", "Luca", "Tom", "Ben", "Hugo", "Pierre", "Jonas", "Felix", "Stefan", "Carlos", "Diego", "Rafael", "Kenji", "Taro", "Arun", "Ravi", "Sam", "Dan", "Ollie", "Mateo", "Nico", "Paul", "Adrian", "Ian", "Rob", "Gary", "Tim"];
const LAST = ["Whitaker", "Hartley", "Moretti", "Ferrante", "Lindgren", "Okafor", "Brandt", "Delacroix", "Navarro", "Takeda", "Mehra", "Costa", "Bellamy", "Kowalski", "Ashby", "Rennick", "Vasquez", "Haldane", "Strauss", "Okonkwo", "Maddox", "Larkin", "Quinn", "Hollis", "Soler", "Ibsen", "Marchetti", "Penrose", "Cavendish", "Faraday"];
const NATS = ["GBR", "ITA", "FRA", "GER", "ESP", "NED", "JPN", "AUS", "USA", "BRA", "IND", "AUT"];
const SCOUT_TRAITS = ["overrates wet pace", "underrates late bloomers"];
const TRAITS = ["cautious", "innovator", "data-driven", "ex-rival", "motivator", "hothead", "veteran", "perfectionist", "pragmatic", "loyal"];

export const TRAIT_NOTE: Record<string, string> = {
  cautious: "Narrow ranges, but rarely wrong. Skips bold ideas.",
  innovator: "Brings bold ideas with wide, optimistic ranges.",
  "data-driven": "Predictions line up better with what the track shows.",
  "ex-rival": "Knows a rival's habits. Gets restless if you lose to them.",
  motivator: "Lifts the mood of the people around them.",
  hothead: "Strong results, but short fuse after bad weekends.",
  veteran: "You learn how good they are quickly.",
  perfectionist: "Slower projects, fewer failures.",
  pragmatic: "Steady, with no surprises either way.",
  loyal: "Hard to poach, easy to keep.",
  "overrates wet pace": "Scout blind spot: reads drivers who shine in the rain as faster than they are.",
  "underrates late bloomers": "Scout blind spot: marks slow starters too low, so late bloomers look weak.",
};

export function teamStrength(teamId: string): number {
  const t = TEAMS.find((x) => x.id === teamId)!;
  return (t.aero + t.power) / 2;
}
/** Teams ordered from strongest to weakest by their starting car. */
export const TIER_ORDER: string[] = [...TEAMS].sort((a, b) => teamStrength(b.id) - teamStrength(a.id)).map((t) => t.id);
export const tierOf = (teamId: string) => TIER_ORDER.indexOf(teamId);

const SPONSOR_NAMES = ["Aurelia Energy", "Northgate Bank", "Kestrel Logistics", "Volta Mobile", "Helix Airlines", "Brightwater", "Orbital Cloud", "Cobalt Watches", "Meridian Insurance", "Pulsar Drinks", "Tessera Systems", "Halcyon Hotels", "Granite Tools", "Zephyr Telecom"];

export function makeSponsor(rng: Rng, id: number, size: number, year: number, taken: Set<string>): Sponsor {
  let name = rng.pick(SPONSOR_NAMES);
  for (let k = 0; k < 20 && taken.has(name); k++) name = rng.pick(SPONSOR_NAMES);
  taken.add(name);
  const kind = rng.pick(["bothPoints", "podiums", "top5"] as const);
  const retainer = round2(size * rng.range(0.85, 1.15));
  const objective = kind === "bothPoints" ? "Both cars in the points" : kind === "podiums" ? "A podium finish" : "A top five finish";
  return {
    id,
    name,
    retainer,
    bonusPerRace: round2((retainer * (kind === "podiums" ? 0.32 : kind === "top5" ? 0.2 : 0.18)) / 10),
    objective,
    objKind: kind,
    mood: 0.6,
    endYear: year + rng.pick([0, 1, 1, 2]),
    demand: kind === "podiums" ? 0.3 : 0.2,
  };
}

export const SALARY_BASE: Record<StaffRole, number> = { td: 3.2, designer: 2.6, aero: 2.2, power: 2.2, data: 1.6, strategy: 1.8, mechanic: 1.0, engineer: 0.9, scout: 0.7, coach: 0.9 };

export function makeStaff(rng: Rng, id: string, role: StaffRole, teamId: string | null, skill: number, year: number, driverId?: string): Staff {
  const traits: string[] = [];
  while (traits.length < 2) {
    const t = rng.pick(TRAITS);
    if (!traits.includes(t)) traits.push(t);
  }
  // scouts carry a blind spot half the time, and the player has to learn which
  if (role === "scout" && rng.next() < 0.5) traits[1] = rng.pick(SCOUT_TRAITS);
  const salaryBase = SALARY_BASE[role];
  const age = Math.round(rng.range(32, 58));
  const cap = makeCapability(role, rng);
  return {
    spec: cap.spec,
    phil: cap.phil,
    id,
    name: `${rng.pick(FIRST)} ${rng.pick(LAST)}`,
    nat: rng.pick(NATS),
    age: age - (year - 2026),
    role,
    driverId,
    skill: Math.round(clamp(skill, 25, 98)),
    known: teamId ? 0.45 : 0.15,
    traits,
    mood: 0.65,
    teamId,
    salary: round2(salaryBase * (0.55 + (skill / 100) * 0.9)),
    endYear: year + rng.pick([0, 1, 1, 2, 3]),
    tenure: teamId ? rng.pick([0, 1, 2, 3, 4]) : 0,
  };
}

export const emptyLedger = () => ({ income: 0, costs: 0, prize: 0, sponsors: 0, salaries: 0, travel: 0, facilities: 0, other: 0, academy: 0, drivers: 0, staffPay: 0, rnd: 0 });
const emptyCar = (): Record<Area, number> => ({ aero: 0, chassis: 0, power: 0, cooling: 0, tyres: 0 });

function makeTeam(id: string, rng: Rng): TeamState {
  const tier = tierOf(id);
  const aiIncome = round2(72 - tier * 3.4);
  const phil = (["early", "balanced", "late", "gamble"] as const)[Math.floor(rng.next() * 4)];
  // each team starts a little different from the baseline in each area, scaled from the existing grid's spread
  const t = TEAMS.find((x) => x.id === id)!;
  const car = emptyCar();
  car.aero = (t.aero - 0.98) / CFG.specPerSecAero / 1.1;
  car.chassis = (t.aero - 0.98) / CFG.specPerSecAero / 1.1 + rng.gauss() * 0.04;
  car.power = (t.power - 0.98) / CFG.specPerSecPower;
  car.cooling = rng.gauss() * 0.03;
  car.tyres = rng.gauss() * 0.05;
  const dna = makeDna(car, rng);
  const lean = rng.gauss() * 0.4;
  const t0: TeamState = {
    id,
    car: carFromDna(dna),
    dna,
    know: {} as TeamState["know"],
    regKnow: {} as TeamState["regKnow"],
    concept: { df: Math.round(clamp(lean, -1, 1) * 100) / 100, risk: Math.round(clamp(rng.gauss() * 0.4, -1, 1) * 100) / 100, innov: Math.round(clamp(rng.gauss() * 0.4, -1, 1) * 100) / 100 },
    believed: { ...car },
    cash: CFG.startCash[tier],
    capSpent: 0,
    capLimit: CFG.cap,
    capBase: 0,
    projects: [],
    ideas: [],
    tunnelLeft: CFG.tunnelBaseHours,
    tunnelTotal: CFG.tunnelBaseHours,
    facilities: { tunnel: tier < 3 ? 4 : 3, sim: tier < 3 ? 4 : 3, factory: tier < 3 ? 4 : 3, academy: 2, building: null },
    sponsors: [],
    philosophy: phil,
    skillBrain: 0,
    board: 55,
    objectives: [],
    delegation: { rnd: "advise", setup: "advise", parts: "advise" },
    overhead: 0,
    aiIncome,
    ledger: emptyLedger(),
    fineOwed: 0,
    breached: false,
  };
  initKnow(t0, rng);
  return t0;
}

function toDriverState(spec: ReturnType<typeof makeSpec>, teamId: string | null, contract: [number, number], potential: number): DriverState {
  return {
    id: spec.id,
    spec,
    teamId,
    salary: contract[0],
    endYear: contract[1],
    role: "equal",
    potential,
    tenure: 1,
    retired: false,
    morale: 0.7,
    trust: 0.7,
    wins: 0,
    podiums: 0,
    titles: 0,
    starts: 0,
    grievance: 0,
    gStage: 0,
    causes: {},
  };
}
const makeSpec = (p: { id: string; code: string; name: string; number: number; nat?: string; born?: number; pace: number; tyreMgmt: number; aggression: number; consistency: number; psyche?: unknown; wet?: number; fictional?: boolean }) => ({ ...p }) as import("../sim/types").DriverSpec;

export function personToJunior(p: Person, year: number, rng: Rng): JuniorState {
  return {
    id: p.id,
    name: p.name,
    code: p.code,
    nat: p.nat,
    born: p.born ?? year - Math.round(rng.range(17, 22)),
    pace: p.pace,
    potential: p.potential,
    tyreMgmt: p.tyreMgmt,
    aggression: p.aggression,
    consistency: p.consistency,
    fictional: p.fictional,
  };
}

/** The staff of every team and a pool of free agents, with skill following the team's tier. */
function buildStaff(s: CareerState, rng: Rng) {
  let n = 0;
  const mk = (role: StaffRole, teamId: string | null, skill: number, driverId?: string) => {
    const id = `st-${++n}`;
    const st = makeStaff(rng, id, role, teamId, skill, s.year, driverId);
    s.staff[id] = st;
    return id;
  };
  for (const team of TEAMS) {
    const tier = tierOf(team.id);
    const base = 84 - tier * 2.6;
    mk("td", team.id, base + rng.gauss() * 5);
    mk("designer", team.id, base + rng.gauss() * 5);
    mk("aero", team.id, base - 1 + rng.gauss() * 6);
    mk("power", team.id, base - 1 + rng.gauss() * 6);
    mk("data", team.id, base - 3 + rng.gauss() * 6);
    mk("strategy", team.id, base + rng.gauss() * 5);
    mk("mechanic", team.id, base + rng.gauss() * 5);
    mk("scout", team.id, base - 4 + rng.gauss() * 6);
    mk("coach", team.id, base - 6 + rng.gauss() * 6);
    for (const d of DRIVERS[team.id]) mk("engineer", team.id, base + rng.gauss() * 6, d.id);
  }
  const roles: StaffRole[] = ["aero", "aero", "power", "power", "data", "data", "td", "designer", "strategy", "mechanic", "engineer", "td", "designer", "strategy", "mechanic", "engineer", "engineer", "strategy", "scout", "scout", "scout", "coach", "coach"];
  for (const r of roles) s.freeStaff.push(mk(r, null, rng.range(48, 82)));
  s.uid = Math.max(s.uid, n);
}

export function newCareer(teamId: string, seed: number, difficulty: 0 | 1 | 2 = 1, raceLength: "full" | "half" | "quick" = "half", opts: { eraMode?: "natural" | "locked"; lockedModules?: string[]; guidance?: Guidance } = {}): CareerState {
  const rng = new Rng(hashSeed(`career:${seed}:${teamId}`));
  const year = CFG.firstYear;
  const s: CareerState = {
    v: 1,
    seed,
    uid: 100,
    difficulty,
    teamId,
    raceLength,
    day: epochDay(year, CFG.start.month, CFG.start.day),
    year,
    round: 0,
    calendar: buildCalendar(year),
    teams: {},
    drivers: {},
    staff: {},
    freeDrivers: [],
    freeStaff: [],
    pool: [],
    standings: { drivers: {}, teams: {}, races: [] },
    history: [],
    cards: [],
    ticker: [],
    news: [],
    recap: [],
    weekend: null,
    fired: false,
    prizePaid: {},
    rngN: 0,
    stopReason: "",
    summerDone: false,
    era: newEraState(opts.eraMode ?? "natural", opts.lockedModules ?? []),
    academy: newAcademy(),
    budgets: { drivers: 0, staff: 0, rnd: 0, facilities: 0, academy: 0 },
    spendLog: [],
    promises: [],
    rumours: [],
    rivalries: [],
    records: {},
    owner: { name: "", trust: 0.6, goal: { kind: "growth", text: "", done: null } },
    story: { last: {}, count: {}, bigDay: -99, mediaDay: -99, mediaCount: 0, tone: 0, arcs: {} },
    legacy: [],
    lastMonth: -1,
    hall: [],
    brand: { fans: 50, color: null, prefix: null, backlashDue: null, by: null, offers: [] },
    rift: newRift(),
    press: newPress(),
    talks: [],
    managers: makeManagers(),
  };
  const takenSponsors = new Set<string>();
  for (const t of TEAMS) {
    const ts = makeTeam(t.id, rng);
    ts.skillBrain = difficulty === 0 ? 0.35 : difficulty === 1 ? 0.6 : 0.85;
    s.teams[t.id] = ts;
    s.standings.teams[t.id] = 0;
    for (const d of DRIVERS[t.id]) {
      const potentialBase = clamp(0.8 + (d.pace - 0.985) * 6, 0.6, 0.97);
      const ds = toDriverState(makeSpec({ ...d }), t.id, START_CONTRACTS[d.id] ?? [3, 2027], potentialBase);
      s.drivers[d.id] = ds;
      s.standings.drivers[d.id] = 0;
    }
  }
  buildStaff(s, rng);
  // reserves and free agents from the real reserve bench
  for (const p of realPeople().byTier.RES) {
    const spec = makeSpec({ id: p.id, code: p.code, name: p.name, number: 90 + s.freeDrivers.length, nat: p.nat, born: p.born, pace: p.pace, tyreMgmt: p.tyreMgmt, aggression: p.aggression, consistency: p.consistency });
    s.drivers[p.id] = toDriverState(spec, null, [1, s.year], p.potential);
    s.freeDrivers.push(p.id);
  }
  // junior pool: F2 and F3 first, real names first
  const juniors = [...fillTier("F2", 22), ...fillTier("F3", 24)];
  s.pool = juniors.map((p) => personToJunior(p, year, rng));

  // money calibration, sponsors, objectives
  for (const t of TEAMS) {
    const ts = s.teams[t.id];
    const tier = tierOf(t.id);
    const salaries = DRIVERS[t.id].reduce((a, d) => a + (START_CONTRACTS[d.id]?.[0] ?? 3), 0) + Object.values(s.staff).filter((x) => x.teamId === t.id).reduce((a, x) => a + x.salary, 0);
    const facilities = 3 * 4 * 1.2;
    const expectedPrize = CFG.prize[tier] * 1;
    const targetNet = 6 - tier * 1.1;
    const travel = CFG.travelPerRace * s.calendar.length;
    ts.overhead = round2(ts.aiIncome + expectedPrize - salaries - facilities - travel - targetNet);
    ts.board = 55;
    const target = Math.max(1, tier + 1 - (tier >= 4 ? 1 : 0) - (tier >= 8 ? 1 : 0));
    ts.objectives = [{ id: "pos", text: target === 1 ? "Win the constructors' title" : target <= 3 ? `Finish in the top ${target}` : `Finish ${ordinal(target)} or better`, kind: "position", target }];
    if (t.id === teamId) {
      const total = ts.aiIncome;
      const parts = [0.5, 0.3, 0.2];
      parts.forEach((p) => ts.sponsors.push(makeSponsor(rng, ++s.uid, total * p, year, takenSponsors)));
    }
  }
  s.brand = newBrand(s);
  s.regW = newRegW(seed, "start", 0.6);
  initEras(s);
  initAcademy(s);
  s.budgets = defaultBudgets(s);
  s.owner = makeOwner(s, rng);
  s.convos = s.convos ?? [];
  s.driverKnow = s.driverKnow ?? {};
  initRecords(s);
  initRoles(s);
  s.rolesSeeded = true;
  s.recap = ["Career started."];
  s.guidance = opts.guidance ?? "off";
  initDesigns(s);
  return s;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export { AREAS };
