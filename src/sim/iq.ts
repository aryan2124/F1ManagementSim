import type { DriverSpec } from "./types";

/**
 * Race IQ: how well a driver reads a race. It decides how truthfully he reports his tyres, whether he spots a real
 * undercut or only a plausible one, whether he speaks up when the pit wall is making a poor call, and how calmly he
 * takes being overruled. 0..1, shown as 0..100.
 *
 * A driver can carry a fixed value in `iq` (every made-up driver does). Otherwise it comes from how consistent and
 * tyre-aware he is, plus years in the sport: experience teaches racecraft.
 */
export function raceIQ(d: DriverSpec, year = 2026): number {
  if (typeof d.iq === "number") return clamp01(d.iq);
  const age = d.born ? year - d.born : 27;
  const experience = Math.min(0.15, Math.max(0, (age - 19) * 0.012));
  const raw = 0.4 * d.consistency + 0.25 * d.tyreMgmt + experience;
  return Math.min(0.96, Math.max(0.25, 0.4 + (raw - 0.5) * 2.0));
}

export interface IQFacets {
  /** How accurately he reports tyres, grip and traffic. */
  reading: number;
  /** Whether he understands pit windows, undercuts and covers. */
  strategy: number;
  /** How sensibly he behaves when overruled or when things go wrong. */
  composure: number;
}

export function iqFacets(d: DriverSpec, year = 2026): IQFacets {
  const iq = raceIQ(d, year);
  const p = d.psyche;
  const calm = p ? 0.5 * p.patience + 0.5 * (1 - p.volatility) : 0.5;
  return {
    reading: clamp01(iq * 0.75 + d.consistency * 0.25),
    strategy: clamp01(iq * 0.85 + d.tyreMgmt * 0.15 - 0.05),
    composure: clamp01(iq * 0.5 + calm * 0.5),
  };
}

export function iqWord(iq: number): string {
  return iq >= 0.85 ? "Reads a race like a strategist" : iq >= 0.7 ? "Sharp" : iq >= 0.5 ? "Solid" : iq >= 0.35 ? "Learning" : "Raw";
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** A steady value in -1..1 for a car and a stint, so a driver's misreading holds for a whole stint instead of flickering. */
export function stintBias(carId: string, stint: number): number {
  let h = stint | 0;
  for (let i = 0; i < carId.length; i++) h = Math.imul(h ^ carId.charCodeAt(i), 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return (((h ^ (h >>> 13)) >>> 0) / 4294967296) * 2 - 1;
}
