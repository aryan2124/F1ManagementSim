import { CIRCUIT_GEO } from "./circuitGeo.generated";
import { buildTrack, type TrackModel } from "../sim/track";

/** How the world around a circuit is drawn. Purely visual. */
export type ThemeId =
  | "park"
  | "plain"
  | "pine"
  | "alpine"
  | "dry"
  | "desert"
  | "desertNight"
  | "city"
  | "cityNight"
  | "tropical"
  | "dunes";

export interface CircuitMeta {
  /** Stable key used in saves and the calendar. */
  id: string;
  /** Key into CIRCUIT_GEO (the dataset's own id). */
  geoId: string;
  /** Short name shown in menus. */
  short: string;
  gp: string;
  country: string;
  /** Track width in metres (street circuits are narrower). */
  width: number;
  /**
   * Grip multiplier, calibrated so a solo qualifying lap matches the real pole time (tests/calibration.test.ts).
   * It absorbs everything a 2D model cannot see: elevation, camber, surface, layout detail.
   */
  gripScale: number;
  /** Top speed cap, m/s. */
  vmax: number;
  /** Incident risk multiplier: walls close to the track mean crashes are likelier (1 = normal). */
  risk?: number;
  /** 1 = average tyre wear. Higher is harsher. */
  tyreSeverity: number;
  /** Rough real-world pole time in seconds, used only to calibrate the physics (tests). */
  poleRef?: number;
  theme: ThemeId;
  /** Draw a lake in the infield (Albert Park). */
  lake?: boolean;
  /** Draw the sea along one compass side of the circuit. */
  sea?: "W" | "E" | "N" | "S";
  /** 2026 calendar position (1 based) when it is on the calendar. */
  round?: number;
  sprint?: boolean;
  /** Date label, 2026. */
  date?: string;
  /** True for classic and historic circuits that are not on the 2026 calendar. */
  classic?: boolean;
}

/** Circuits where mistakes are punished by walls. */
const RISK: Record<string, number> = { monaco: 1.8, baku: 1.7, "marina-bay": 1.7, jeddah: 1.6, montreal: 1.3, "las-vegas": 1.2, melbourne: 1.1, "albert-park": 1.15 };

const C = (m: Partial<CircuitMeta> & Pick<CircuitMeta, "id" | "geoId" | "short" | "gp" | "country" | "theme">): CircuitMeta => ({
  width: 13,
  gripScale: 1.06, // circuits without a calibrated pole time use the typical value
  vmax: 92,
  tyreSeverity: 1,
  ...m,
});

/**
 * Every circuit the game ships with. The 2026 calendar entries carry their round number.
 * Layouts are real GPS centrelines (see scripts/import-circuits.mjs).
 */
export const CIRCUITS: CircuitMeta[] = [
  C({ id: "albert-park", geoId: "au-1953", short: "Albert Park", gp: "Australian Grand Prix", country: "Australia", theme: "park", lake: true, round: 1, date: "8 Mar", gripScale: 1.385, poleRef: 75.1, tyreSeverity: 0.95 }),
  C({ id: "shanghai", geoId: "cn-2004", short: "Shanghai", gp: "Chinese Grand Prix", country: "China", theme: "plain", round: 2, sprint: true, date: "15 Mar", gripScale: 0.989, poleRef: 90.6, tyreSeverity: 1.05 }),
  C({ id: "suzuka", geoId: "jp-1962", short: "Suzuka", gp: "Japanese Grand Prix", country: "Japan", theme: "pine", round: 3, date: "29 Mar", gripScale: 1.089, poleRef: 87.0, tyreSeverity: 1.15 }),
  C({ id: "miami", geoId: "us-2022", short: "Miami", gp: "Miami Grand Prix", country: "United States", theme: "tropical", round: 4, sprint: true, date: "3 May", gripScale: 0.973, poleRef: 86.2 }),
  C({ id: "montreal", geoId: "ca-1978", short: "Montreal", gp: "Canadian Grand Prix", country: "Canada", theme: "park", round: 5, sprint: true, date: "24 May", gripScale: 1.025, poleRef: 70.9, tyreSeverity: 0.9 }),
  C({ id: "monaco", geoId: "mc-1929", short: "Monaco", gp: "Monaco Grand Prix", country: "Monaco", theme: "city", round: 6, date: "7 Jun", gripScale: 0.951, poleRef: 69.9, width: 10, vmax: 84, tyreSeverity: 0.6 }),
  C({ id: "barcelona", geoId: "es-1991", short: "Barcelona", gp: "Barcelona-Catalunya Grand Prix", country: "Spain", theme: "dry", round: 7, date: "14 Jun", gripScale: 1.035, poleRef: 71.5, tyreSeverity: 1.15 }),
  C({ id: "red-bull-ring", geoId: "at-1969", short: "Red Bull Ring", gp: "Austrian Grand Prix", country: "Austria", theme: "alpine", round: 8, date: "28 Jun", gripScale: 1.093, poleRef: 63.9, tyreSeverity: 1.0 }),
  C({ id: "silverstone", geoId: "gb-1948", short: "Silverstone", gp: "British Grand Prix", country: "United Kingdom", theme: "plain", round: 9, sprint: true, date: "5 Jul", gripScale: 1.145, poleRef: 85.8, tyreSeverity: 1.1 }),
  C({ id: "spa", geoId: "be-1925", short: "Spa-Francorchamps", gp: "Belgian Grand Prix", country: "Belgium", theme: "pine", round: 10, date: "19 Jul", gripScale: 1.057, poleRef: 100.5, tyreSeverity: 0.95 }),
  C({ id: "hungaroring", geoId: "hu-1986", short: "Hungaroring", gp: "Hungarian Grand Prix", country: "Hungary", theme: "dry", round: 11, date: "26 Jul", gripScale: 1.069, poleRef: 75.2, tyreSeverity: 0.95 }),
  C({ id: "zandvoort", geoId: "nl-1948", short: "Zandvoort", gp: "Dutch Grand Prix", country: "Netherlands", theme: "dunes", round: 12, sprint: true, date: "23 Aug", gripScale: 1.188, poleRef: 68.7, tyreSeverity: 1.0, width: 12 }),
  C({ id: "monza", geoId: "it-1922", short: "Monza", gp: "Italian Grand Prix", country: "Italy", theme: "park", round: 13, date: "6 Sep", gripScale: 1.081, poleRef: 78.8, vmax: 96, tyreSeverity: 0.8 }),
  C({ id: "madring", geoId: "es-2026", short: "Madring", gp: "Spanish Grand Prix", country: "Spain", theme: "dry", round: 14, date: "13 Sep", width: 12 }),
  C({ id: "baku", geoId: "az-2016", short: "Baku", gp: "Azerbaijan Grand Prix", country: "Azerbaijan", theme: "city", round: 15, date: "26 Sep", gripScale: 0.812, poleRef: 101.1, width: 11, tyreSeverity: 0.85 }),
  C({ id: "sepang", geoId: "my-1999", short: "Sepang", gp: "Bahrain Grand Prix", country: "Malaysia", theme: "tropical", round: 16, date: "4 Oct", gripScale: 0.984, poleRef: 93, tyreSeverity: 1.2 }),
  C({ id: "marina-bay", geoId: "sg-2008", short: "Marina Bay", gp: "Singapore Grand Prix", country: "Singapore", theme: "cityNight", round: 17, sprint: true, date: "11 Oct", gripScale: 1.043, poleRef: 89.2, width: 11, tyreSeverity: 0.9 }),
  C({ id: "cota", geoId: "us-2012", short: "Austin", gp: "United States Grand Prix", country: "United States", theme: "plain", round: 18, date: "25 Oct", gripScale: 1.181, poleRef: 92.6, tyreSeverity: 1.05 }),
  C({ id: "mexico", geoId: "mx-1962", short: "Mexico City", gp: "Mexico City Grand Prix", country: "Mexico", theme: "plain", round: 19, date: "1 Nov", gripScale: 1.007, poleRef: 75.6, tyreSeverity: 0.85 }),
  C({ id: "interlagos", geoId: "br-1940", short: "Interlagos", gp: "Sao Paulo Grand Prix", country: "Brazil", theme: "tropical", round: 20, date: "8 Nov", gripScale: 1.051, poleRef: 69.5, tyreSeverity: 1.0 }),
  C({ id: "las-vegas", geoId: "us-2023", short: "Las Vegas", gp: "Las Vegas Grand Prix", country: "United States", theme: "cityNight", round: 21, date: "21 Nov", gripScale: 0.882, poleRef: 92.3, width: 14, tyreSeverity: 0.8 }),
  C({ id: "lusail", geoId: "qa-2004", short: "Lusail", gp: "Qatar Grand Prix", country: "Qatar", theme: "desertNight", round: 22, date: "29 Nov", gripScale: 1.106, poleRef: 80.9, tyreSeverity: 1.3 }),
  C({ id: "yas-marina", geoId: "ae-2009", short: "Yas Marina", gp: "Abu Dhabi Grand Prix", country: "United Arab Emirates", theme: "desertNight", round: 23, date: "6 Dec", gripScale: 1.140, poleRef: 82.2, tyreSeverity: 0.85 }),

  // Not on the 2026 calendar but part of the world (the Bahrain and Saudi rounds moved or were cancelled).
  C({ id: "bahrain", geoId: "bh-2002", short: "Sakhir", gp: "Bahrain Grand Prix", country: "Bahrain", theme: "desertNight", gripScale: 0.951, poleRef: 89.8, tyreSeverity: 1.25, classic: true }),
  C({ id: "jeddah", geoId: "sa-2021", short: "Jeddah", gp: "Saudi Arabian Grand Prix", country: "Saudi Arabia", theme: "cityNight", sea: "W", gripScale: 1.255, poleRef: 87.3, width: 12, tyreSeverity: 0.8, classic: true }),
  C({ id: "imola", geoId: "it-1953", short: "Imola", gp: "Emilia Romagna Grand Prix", country: "Italy", theme: "park", gripScale: 1.188, poleRef: 74.7, classic: true }),
  C({ id: "paul-ricard", geoId: "fr-1969", short: "Paul Ricard", gp: "French Grand Prix", country: "France", theme: "dry", classic: true }),
  C({ id: "magny-cours", geoId: "fr-1960", short: "Magny-Cours", gp: "French Grand Prix", country: "France", theme: "plain", classic: true }),
  C({ id: "hockenheim", geoId: "de-1932", short: "Hockenheim", gp: "German Grand Prix", country: "Germany", theme: "pine", classic: true }),
  C({ id: "nurburgring", geoId: "de-1927", short: "Nurburgring", gp: "European Grand Prix", country: "Germany", theme: "pine", classic: true }),
  C({ id: "istanbul", geoId: "tr-2005", short: "Istanbul Park", gp: "Turkish Grand Prix", country: "Turkey", theme: "dry", classic: true }),
  C({ id: "sochi", geoId: "ru-2014", short: "Sochi", gp: "Russian Grand Prix", country: "Russia", theme: "plain", classic: true }),
  C({ id: "portimao", geoId: "pt-2008", short: "Portimao", gp: "Portuguese Grand Prix", country: "Portugal", theme: "dry", classic: true }),
  C({ id: "mugello", geoId: "it-1914", short: "Mugello", gp: "Tuscan Grand Prix", country: "Italy", theme: "park", classic: true }),
  C({ id: "estoril", geoId: "pt-1972", short: "Estoril", gp: "Portuguese Grand Prix", country: "Portugal", theme: "dry", classic: true }),
  C({ id: "jacarepagua", geoId: "br-1977", short: "Jacarepagua", gp: "Brazilian Grand Prix", country: "Brazil", theme: "tropical", classic: true }),
  C({ id: "buenos-aires", geoId: "ar-1952", short: "Buenos Aires", gp: "Argentine Grand Prix", country: "Argentina", theme: "plain", classic: true }),
  C({ id: "kyalami", geoId: "za-1961", short: "Kyalami", gp: "South African Grand Prix", country: "South Africa", theme: "dry", classic: true }),
  C({ id: "watkins-glen", geoId: "us-1956", short: "Watkins Glen", gp: "United States Grand Prix", country: "United States", theme: "pine", classic: true }),
];

export const CALENDAR_2026: CircuitMeta[] = CIRCUITS.filter((c) => c.round).sort((a, b) => (a.round ?? 0) - (b.round ?? 0));

export function circuitMeta(id: string): CircuitMeta {
  return CIRCUITS.find((c) => c.id === id) ?? CIRCUITS[0];
}

/** Scheduled race distance: the fewest whole laps that exceed 305 km (260 km at Monaco). */
export function scheduledLaps(meta: CircuitMeta): number {
  const km = meta.id === "monaco" ? 260 : 305;
  return Math.ceil((km * 1000) / CIRCUIT_GEO[meta.geoId].length);
}

/**
 * 1 or -1 as in TrackModel.pitSide. Where the satellite pictures show the pit and paddock roofs clearly on one side of the start straight, that side wins.
 * Spa: the pit and paddock buildings sit on the inside of La Source. Shanghai: the pits sit on the inside (right) of the start straight, under the turn 1 spiral. Everything not listed picks the side with more room.
 */
const PIT_SIDE_REAL: Record<string, 1 | -1> = {
  spa: -1,
  shanghai: -1,
  suzuka: -1,
  silverstone: -1,
  monza: -1,
  bahrain: -1,
  "paul-ricard": 1,
  "magny-cours": -1,
  hockenheim: -1,
  estoril: -1,
  "buenos-aires": -1,
};

const cache = new Map<string, { meta: CircuitMeta; track: TrackModel }>();

/** Build the physics model for a circuit without touching the cache (used by calibration tests). */
export function buildCircuit(id: string, override?: { gripScale?: number; vmax?: number }): { meta: CircuitMeta; track: TrackModel } {
  const meta = circuitMeta(id);
  const geo = CIRCUIT_GEO[meta.geoId];
  const def = {
    name: geo.name,
    country: meta.country,
    width: meta.width,
    gripScale: override?.gripScale ?? meta.gripScale,
    vmax: override?.vmax ?? meta.vmax,
    risk: meta.risk ?? RISK[meta.id] ?? 1,
    points: geo.pts.map(([x, y]) => ({ x, y })),
  };
  const track = buildTrack(def);
  // the real pit complex sits on a known side at some circuits (checked against the satellite pictures); elsewhere pick the side with more room
  track.pitSide = PIT_SIDE_REAL[meta.id] ?? choosePitSide(track);
  return { meta, track };
}

/** Build (and cache) the physics model for a circuit. */
export function loadCircuit(id: string): { meta: CircuitMeta; track: TrackModel } {
  const hit = cache.get(id);
  if (hit) return hit;
  const out = buildCircuit(id);
  cache.set(id, out);
  return out;
}

/** The side of the main straight with more room, so the pit lane never crosses another part of the track. */
export function choosePitSide(track: TrackModel): 1 | -1 {
  const L = track.length;
  const clearance = (side: 1 | -1) => {
    let best = Infinity;
    for (let s = -track.pitIn; s <= track.pitOut; s += track.ds * 2) {
      const i = Math.round(s / track.ds);
      const ii = ((i % track.n) + track.n) % track.n;
      const h = track.heading[ii];
      const px = track.x[ii] + Math.sin(h) * 24 * side;
      const py = track.y[ii] - Math.cos(h) * 24 * side;
      for (let j = 0; j < track.n; j += 2) {
        let arc = Math.abs(j - ii) * track.ds;
        arc = Math.min(arc, L - arc);
        if (arc < 220) continue;
        const d = Math.hypot(track.x[j] - px, track.y[j] - py);
        if (d < best) best = d;
      }
    }
    return best;
  };
  const a = clearance(1);
  const b = clearance(-1);
  return b > a + 2 ? -1 : 1;
}
