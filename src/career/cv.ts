import { hashSeed } from "../sim/rng";
import { TEAMS } from "../game/data";
import type { CareerState, Staff } from "./types";

/**
 * A person's background, read from who they are rather than stored: where they started, the jobs they held, what they
 * are known for. It is stable for a person (it comes from their id) and it grows with their age and tenure, so the
 * hiring screen, the profile and the story engine all quote the same CV.
 */
export interface CvLine {
  from: number;
  to: number | null;
  team: string;
  role: string;
}
export interface Cv {
  origin: string;
  started: number;
  lines: CvLine[];
  known: string[];
  noise: number;
}

const ORIGINS = ["a university engineering degree", "an apprenticeship at a small race shop", "motorsport engineering at a technical college", "years in the road car industry", "a stint in aerospace", "karting mechanic work as a teenager", "a defence contractor's test department", "the junior single-seater paddock"];
const KNOWN_FOR: Record<string, string[]> = {
  td: ["building cars around a clear concept", "calm leadership in a crisis", "cost discipline under the cap"],
  designer: ["clever packaging", "radical ideas that sometimes work", "clean, reliable layouts"],
  aero: ["finding downforce in the floor", "trusting the tunnel over the screen", "keen correlation work"],
  power: ["power unit reliability", "energy recovery tuning", "squeezing cooling margins"],
  data: ["making sense of messy numbers", "spotting a sensor lie", "fast simulation turnaround"],
  strategy: ["bold calls from the pit wall", "tyre modelling", "reading the weather early"],
  mechanic: ["fast hands under pressure", "keeping a crew calm", "tidy, repeatable stops"],
  engineer: ["a good feel for drivers' language", "turning feedback into setup changes", "level headed radio"],
  scout: ["an eye for raw talent", "patience with late bloomers"],
  coach: ["building confidence in young drivers", "fitness and mental routines"],
};

export function cvOf(s: CareerState, st: Staff): Cv {
  const h = hashSeed(`cv:${st.id}`);
  const pick = <T,>(arr: T[], k: number) => arr[(h >>> k) % arr.length]!;
  const started = s.year - Math.max(1, st.age - 22 - (h % 3));
  const others = TEAMS.filter((t) => t.id !== st.teamId);
  const spells = Math.min(4, Math.max(0, Math.floor((st.age - 24) / 6)));
  const lines: CvLine[] = [];
  let at = started;
  for (let i = 0; i < spells; i++) {
    const len = 2 + ((h >>> (i * 3)) % 5);
    const t = others[(h >>> (i * 5 + 1)) % others.length]!;
    lines.push({ from: at, to: Math.min(at + len, s.year - Math.max(0, st.tenure)), team: t.name, role: i === 0 ? "junior " + st.role : st.role });
    at += len;
    if (at >= s.year - st.tenure) break;
  }
  if (st.teamId) lines.push({ from: s.year - st.tenure, to: null, team: TEAMS.find((t) => t.id === st.teamId)?.name ?? st.teamId, role: st.role });
  const pool = KNOWN_FOR[st.role] ?? KNOWN_FOR.engineer!;
  const known = [pick(pool, 3), pool[(h >>> 6) % pool.length]!].filter((x, i, a) => a.indexOf(x) === i);
  return { origin: pick(ORIGINS, 2), started, lines, known, noise: ((h % 1000) / 1000 - 0.5) * 0.4 };
}
