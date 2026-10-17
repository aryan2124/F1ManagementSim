import type { Climate } from "../sim/weather";

/**
 * How often it rains at each circuit, and what the weather is usually like there.
 *
 * Honest note: these numbers are my estimates of how often a race weekend session is affected by
 * rain at each venue (from general knowledge of the climate and of how often races there have been
 * wet), not a sourced statistic. `rain` is the chance that rain falls at some point in a session.
 * The game lifts every value a little (see GAMEPLAY_LIFT) so wet races are not too rare.
 */
const C = (rain: number, air: [number, number], wind: [number, number], intensity: number, cloudy = 0.35): Climate => ({ rain, air, wind, intensity, cloudy });

export const CLIMATES: Record<string, Climate> = {
  "albert-park": C(0.22, [17, 26], [2, 7], 0.3),
  shanghai: C(0.3, [14, 24], [1, 5], 0.4, 0.5),
  suzuka: C(0.33, [15, 25], [1, 6], 0.5, 0.45),
  miami: C(0.2, [24, 32], [2, 6], 0.75),
  montreal: C(0.3, [16, 26], [1, 6], 0.4),
  monaco: C(0.15, [17, 24], [1, 5], 0.3),
  barcelona: C(0.12, [16, 27], [2, 7], 0.3, 0.25),
  "red-bull-ring": C(0.28, [15, 27], [1, 6], 0.55),
  silverstone: C(0.3, [13, 24], [3, 9], 0.35, 0.5),
  spa: C(0.42, [11, 22], [1, 6], 0.5, 0.55),
  hungaroring: C(0.15, [22, 34], [1, 5], 0.55, 0.2),
  zandvoort: C(0.25, [14, 23], [4, 10], 0.3, 0.45),
  monza: C(0.12, [19, 30], [1, 4], 0.5, 0.25),
  madring: C(0.1, [22, 33], [1, 5], 0.4, 0.2),
  baku: C(0.05, [17, 30], [3, 9], 0.3, 0.25),
  sepang: C(0.3, [28, 34], [1, 4], 0.85, 0.45),
  "marina-bay": C(0.2, [27, 32], [0.5, 3], 0.85, 0.4),
  cota: C(0.1, [19, 33], [2, 7], 0.6, 0.25),
  mexico: C(0.08, [17, 26], [1, 4], 0.6, 0.3),
  interlagos: C(0.35, [18, 29], [1, 5], 0.6, 0.45),
  "las-vegas": C(0.02, [10, 19], [1, 5], 0.3, 0.15),
  lusail: C(0.01, [24, 33], [1, 6], 0.3, 0.1),
  "yas-marina": C(0.01, [26, 34], [1, 5], 0.3, 0.1),
  bahrain: C(0.01, [22, 32], [1, 6], 0.3, 0.1),
  jeddah: C(0.02, [25, 33], [1, 6], 0.3, 0.1),
  imola: C(0.28, [14, 26], [1, 5], 0.4),
  "paul-ricard": C(0.08, [20, 32], [2, 8], 0.4, 0.2),
  "magny-cours": C(0.25, [15, 26], [1, 6], 0.4, 0.45),
  hockenheim: C(0.25, [16, 27], [1, 5], 0.4, 0.4),
  nurburgring: C(0.4, [10, 22], [2, 8], 0.4, 0.55),
  istanbul: C(0.15, [16, 28], [1, 6], 0.4, 0.3),
  sochi: C(0.1, [18, 28], [1, 5], 0.4, 0.3),
  portimao: C(0.1, [18, 28], [2, 8], 0.4, 0.25),
  mugello: C(0.12, [20, 31], [1, 5], 0.5, 0.3),
  estoril: C(0.15, [18, 28], [2, 8], 0.4, 0.3),
  jacarepagua: C(0.2, [24, 33], [1, 5], 0.7, 0.4),
  "buenos-aires": C(0.15, [18, 29], [1, 5], 0.6, 0.35),
  kyalami: C(0.15, [14, 27], [1, 5], 0.6, 0.25),
  "watkins-glen": C(0.28, [16, 28], [1, 6], 0.5, 0.4),
};

/** Every chance is lifted a bit so wet races happen often enough to matter. */
export const GAMEPLAY_LIFT = (p: number) => Math.min(0.85, p * 1.3 + 0.02);

export function climateFor(circuitId: string): Climate {
  const c = CLIMATES[circuitId] ?? { rain: 0.2, air: [16, 28], wind: [1, 6], intensity: 0.4, cloudy: 0.35 };
  return { ...c, rain: GAMEPLAY_LIFT(c.rain) };
}

/** A stable number from a circuit id so the same seed gives different weather at different circuits. */
export function circuitHash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) % 100000;
}
