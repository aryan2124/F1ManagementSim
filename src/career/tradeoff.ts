/** The five meters every decision is shown on, so a choice reads as a picture and not a paragraph. */
export type MeterId = "car" | "cash" | "mood" | "fans" | "next";
export const METERS: { id: MeterId; label: string }[] = [
  { id: "car", label: "CAR" },
  { id: "cash", label: "CASH" },
  { id: "mood", label: "PEOPLE" },
  { id: "fans", label: "FANS+PRESS" },
  { id: "next", label: "BOARD" },
];
/** What one option does to each meter: a size from -1 (much worse) to +1 (much better), plus the plain-words figure. */
export type Fx = Partial<Record<MeterId, { v: number; say: string }>>;

export interface Mix { car: number; drivers: number; money: number }

/** What a full week of one kind of effort gives. A blend gives the same share of each. */
export const FULL = {
  car: { tunnel: 6, campaign: 6, morale: -0.02, cash: -0.2 },
  drivers: { morale: 0.05, trust: 0.015, cash: -0.2 },
  money: { cash: 0.5, fans: -0.3 },
};

export function parseMix(option: string): Mix | null {
  if (!option.startsWith("mix:")) return null;
  const p = option.slice(4).split(",").map(Number);
  if (p.length !== 3 || p.some((n) => !isFinite(n) || n < 0)) return null;
  const t = p[0] + p[1] + p[2];
  if (t <= 0) return null;
  return { car: p[0] / t, drivers: p[1] / t, money: p[2] / t };
}

export function mixId(m: Mix): string {
  return `mix:${m.car.toFixed(2)},${m.drivers.toFixed(2)},${m.money.toFixed(2)}`;
}

/** The net effect of a blend, in real units. */
export function mixEffect(m: Mix) {
  return {
    tunnel: FULL.car.tunnel * m.car,
    campaign: FULL.car.campaign * m.car,
    morale: FULL.car.morale * m.car + FULL.drivers.morale * m.drivers,
    trust: FULL.drivers.trust * m.drivers,
    cash: FULL.car.cash * m.car + FULL.drivers.cash * m.drivers + FULL.money.cash * m.money,
    fans: FULL.money.fans * m.money,
  };
}

const sgn = (n: number, f: (x: number) => string) => (n > 0 ? "+" : n < 0 ? "-" : "") + f(Math.abs(n));

export function mixFx(m: Mix): Fx {
  const e = mixEffect(m);
  return {
    car: { v: e.tunnel / 6, say: sgn(e.tunnel, (x) => `${x.toFixed(1)}h tunnel`) },
    cash: { v: e.cash / 0.5, say: sgn(e.cash, (x) => `$${x.toFixed(2)}m`) },
    mood: { v: e.morale / 0.05, say: sgn(e.morale * 100, (x) => `${x.toFixed(1)}%`) },
    fans: { v: e.fans / 0.3, say: sgn(e.fans, (x) => x.toFixed(2)) },
  };
}

export function dominant(m: Mix): "car" | "drivers" | "money" {
  return m.car >= m.drivers && m.car >= m.money ? "car" : m.drivers >= m.money ? "drivers" : "money";
}

// ---------------------------------------------------------------- plain words to meters

const NEG = /\b(cost|costs|spend|spent|pay|pays|fee|outlay|down|drop|drops|worse|angry|sulk|sulks|grumble|grumbles|lose|lost|loses|risk|risky|slow|slower|upset|unhappy|ignored|drift|drifts|less|tighter|winces|harm|damage|leaves|deepens|cooler|cools|coin toss|neglect|gamble)\b|-\s?\d|-\$/i;
const POS = /\b(gain|gains|save|saves|saved|better|happier|delighted|cheer|cheers|recover|recovers|pleased|love|loves|approves|respect|respects|boost|bonus|up|heard|eases|ease|steadies|protected|kept|sharper|learn|learned|safe|stronger)\b|\+\s?\d|\+\$/i;
const TOPIC: [MeterId, RegExp][] = [
  ["cash", /\$|money|cash|budget|wages|cap room|fee|retainer|bonus/i],
  ["car", /tunnel|\bcar\b|pace|a lap|per lap|upgrade|part|parts|cooling|reliab|grip|aero|concept|idea|ideas|engine|learn|campaign|progress|develop/i],
  ["mood", /morale|mood|trust|happier|happy|angry|sulk|heard|staff|drivers?\b|feud|tension|office|team|grievance|confidence|garage|prospect/i],
  ["fans", /fans?\b|press|crowd|paddock|media|supporters/i],
  ["next", /board/i],
];

function size(clause: string): number {
  const m$ = clause.match(/\$\s?([\d.]+)\s*m/i) ?? clause.match(/([\d.]+)\s*m\b/i);
  if (m$) return Math.min(1, Number(m$[1]) / 1.5);
  const pc = clause.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)/i);
  if (pc) return Math.min(1, Number(pc[1]) / 12);
  const pt = clause.match(/(?:board|trust|morale|mood)\s*[+-]\s?(\d+)/i) ?? clause.match(/[+-]\s?(\d+)\b/);
  if (pt) return Math.min(1, Number(pt[1]) / 8);
  if (/sharply|big|huge|most|a lot|hugely|everything/i.test(clause)) return 0.9;
  if (/good way|solid|well|fair amount/i.test(clause)) return 0.6;
  if (/a little|a touch|slightly|small|light|barely|quietly/i.test(clause)) return 0.25;
  return 0.45;
}

/** Reads the plain-words facts on an option and turns them into the five meters, so no decision needs a paragraph. */
export function deriveFx(texts: string[]): Fx | undefined {
  const fx: Fx = {};
  for (const clause of texts.join(". ").split(/\.(?=\s|$)|[;,]|\bbut\b|\band\b/i).map((c) => c.trim()).filter(Boolean)) {
    const neg = NEG.test(clause), pos = POS.test(clause);
    if (!neg && !pos) continue;
    // a cost in dollars is always a loss unless it clearly brings money in
    for (const [id, re] of TOPIC) {
      if (!re.test(clause)) continue;
      let sign = /\b(cost|costs)\b.*\b(less|cheaper)\b|\bcheaper\b/i.test(clause) ? 1 : pos && !neg ? 1 : neg && !pos ? -1 : (clause.search(NEG) < clause.search(POS) ? -1 : 1);
      if (id === "cash" && /\$/.test(clause) && !/save|saves|bonus|income|brings|retainer|earn|\+\$/i.test(clause)) sign = -1;
      const v = sign * size(clause);
      const cur = fx[id]?.v ?? 0;
      const nv = Math.max(-1, Math.min(1, cur + v));
      fx[id] = { v: nv, say: "" };
      break;
    }
  }
  const ids = Object.keys(fx) as MeterId[];
  if (!ids.length) return undefined;
  for (const id of ids) {
    const v = fx[id]!.v;
    fx[id]!.say = v > 0.6 ? "much better" : v > 0.3 ? "better" : v > 0 ? "a little better" : v < -0.6 ? "much worse" : v < -0.3 ? "worse" : "a little worse";
  }
  return fx;
}
