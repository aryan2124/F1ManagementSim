import { fitMap } from "./fitmap";
import { fitted, keystoneTraits } from "./keystones";
import { TRAIT_NAME } from "./traits";
import { hashSeed } from "../sim/rng";
import { TRAITS, type CareerState, type Trait } from "./types";
import { circuitMeta } from "../game/circuits";

/**
 * A car's identity, written from what it is: a name for its philosophy, a signature trait, the tracks it is famous for.
 * Compare cars shows what you have inferred about a rival, never the truth: a range that narrows with races run.
 */
const ADJ: Record<Trait, string[]> = {
  downforce: ["Glued", "Planted", "Sealed"], efficiency: ["Slippery", "Lean", "Needle"], grip: ["Sticky", "Bitey", "Hooked"], platform: ["Steady", "Rigid", "Calm"],
  output: ["Roaring", "Raw", "Charged"], drive: ["Smooth", "Supple", "Tractable"], capacity: ["Cool", "Breathing", "Open"], packaging: ["Tight", "Wrapped", "Compact"],
  wear: ["Gentle", "Patient", "Kind"], warmup: ["Eager", "Quick", "Hot"],
};

export interface CarIdentity {
  name: string;
  signature: Trait;
  signatureWord: string;
  famous: string[];
  keystones: string[];
}

export function carIdentity(s: CareerState, teamId: string): CarIdentity {
  const t = s.teams[teamId];
  const kt = keystoneTraits(t);
  const ks = fitted(t);
  const signature = [...TRAITS].sort((a, b) => (kt[b] + t.dna[b]) - (kt[a] + t.dna[a]) || (a < b ? -1 : 1))[0];
  const h = hashSeed(`ident:${s.seed}:${teamId}:${ks.map((k) => k.id).join(",")}`);
  const adj = ADJ[signature][h % 3];
  const noun = ks[0] ? ks[0].name.split(" ").slice(-1)[0] : "car";
  // famous where its choices pay most: the edge with the keystones against the same car without them
  const without = fitMap(s, teamId, []);
  const rows = fitMap(s, teamId).map((r, i) => ({ ...r, gain: r.edge - without[i].edge })).sort((a, b) => b.gain - a.gain || (a.circuitId < b.circuitId ? -1 : 1)).slice(0, 3);
  return { name: `The ${adj} ${noun[0].toUpperCase()}${noun.slice(1)}`, signature, signatureWord: TRAIT_NAME[signature], famous: rows.map((r) => circuitMeta(r.circuitId).gp), keystones: ks.map((k) => k.name) };
}

export interface RivalGuess {
  trait: Trait;
  name: string;
  /** Inferred gap in seconds against your car (positive: they are ahead). */
  gap: number;
  range: number;
}

/** What you can infer about a rival: the true gap blurred by a range that shrinks as races are run. */
export function compareCars(s: CareerState, rivalId: string): RivalGuess[] {
  const me = s.teams[s.teamId];
  const them = s.teams[rivalId];
  const run = Math.max(0, Math.min(s.round, s.calendar.length));
  const range = Math.round((0.12 / (1 + 0.2 * run)) * 1000) / 1000;
  const a = keystoneTraits(me);
  const b = keystoneTraits(them);
  return TRAITS.map((tr) => {
    const truth = them.dna[tr] + b[tr] - (me.dna[tr] + a[tr]);
    const jitter = (((hashSeed(`infer:${s.seed}:${s.year}:${rivalId}:${tr}`) % 2001) / 1000) - 1) * range;
    return { trait: tr, name: TRAIT_NAME[tr], gap: Math.round((truth + jitter) * 100) / 100, range };
  });
}

/** Distance between two careers: how different their Fit Maps are (mean absolute seconds a lap). */
export function fitDistance(a: CareerState, b: CareerState): number {
  const x = fitMap(a, a.teamId);
  const y = fitMap(b, b.teamId);
  return x.reduce((acc, r, i) => acc + Math.abs(r.edge - y[i].edge), 0) / Math.max(1, x.length);
}
