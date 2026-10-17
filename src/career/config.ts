/**
 * Every tunable number of the career layer, in one place. Money is in millions of dollars (game units, not real accounts).
 * Anything marked "design" is the game's own choice and not real F1 data.
 */
export const CFG = {
  /** The career starts on this day of the first season (inside the winter shutdown). */
  start: { month: 1, day: 4 },
  firstYear: 2026,

  // ---- calendar (real: 14 day summer closure and a Christmas closure; the winter length is a design choice)
  summerShutdown: { month: 8, day: 3, days: 14 },
  winterShutdown: { month: 12, day: 24, days: 14 },
  /** Car launch and pre-season test, design dates. */
  launchDay: { month: 2, day: 4 },
  testDay: { month: 2, day: 11 },

  // ---- the car
  /** How many lap-time seconds in the area ratings turn into each spec point of the existing simulator. */
  specPerSecAero: 0.045,
  specPerSecPower: 0.05,
  tyreMgmtPerSec: 0.2,
  /** The grid is pulled this share of the way to its own average each January, so no team runs away for good. */
  yearlyCompression: 0.1,
  /** Managed parity: the grid is only pulled together when its spread (standard deviation of car worth, seconds) is wider than this band. */
  paritySpread: 0.3,
  /** Below this spread the January swing is widened so a bunched grid is shaken up. */
  spreadFloor: 0.16,
  /** Each January the grid's average figure falls back toward this level by this share of the way, so a decade of progress never runs the clock into its limits. */
  baselineAt: 0.25,
  baselineReset: 0.85,
  /** The most the grid is ever pulled together in a January. */
  parityMax: 0.3,
  /** Even in a tight year the field is pulled this share (the cost cap's slow squeeze). */
  parityFloor: 0.03,
  /** Size of the random new-car swing each January, seconds. */
  launchSwing: 0.22,

  // ---- money (design)
  cap: 215,
  /** Yearly interest on borrowed money. */
  debtRate: 0.12,
  /** The most a team can owe the bank, $m. */
  debtMax: 80,
  /** The cost of just building and running the car: the base programme that always uses cap room. */
  capBaseProgramme: 158,
  /** A part the head of R&D started alone, without the player's brief, keeps this share of its gain. */
  unbriefedFactor: 0.72,
  prize: [150, 134, 120, 107, 96, 86, 77, 69, 62, 56, 50],
  /** Share of each prize paid after every race from the current standing. */
  racePayShare: 0.8,
  travelPerRace: 0.9,
  startCash: [210, 190, 170, 150, 130, 115, 100, 90, 80, 70, 60],
  capBreachFineBase: 5,
  capBreachCapCut: 0.8,

  // ---- research
  tunnelBaseHours: 400,
  sizes: {
    S: { cost: 3.5, days: 9, hours: 40, lo: 0.025, hi: 0.07 },
    M: { cost: 8, days: 20, hours: 110, lo: 0.07, hi: 0.17 },
    L: { cost: 16, days: 38, hours: 240, lo: 0.15, hi: 0.34 },
  },
  /** An area with a lot of progress gives smaller gains, so the order cannot run off. */
  diminishAt: 1.2,
  ideaEveryDays: 7,
  maxIdeasPerArea: 3,
  ideaLife: 28,

  // ---- weekend
  runsPerPractice: 6,
  sprintRunsPerPractice: 5,
  setupAxes: ["balance", "downforce", "gearing", "brakes"] as const,

  // ---- people
  retireAge: 41,
  /** Ageing, spec points of pace per year. */
  youngGrow: 0.0016,
  oldDecline: 0.0014,
} as const;

export type SetupAxis = (typeof CFG.setupAxes)[number];
