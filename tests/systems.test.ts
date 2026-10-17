import { describe, expect, it } from "vitest";
import { loadCircuit } from "../src/game/circuits";
import { buildEntries } from "../src/game/data";
import { RaceSim } from "../src/sim/engine";
import { Weather, targetWetness, wetLoss } from "../src/sim/weather";
import { TeamRadar, makeProfile } from "../src/sim/radar";
import { runQualifying } from "../src/sim/qualifying";
import { buildVenue, drawText, textWidth } from "../src/render/venueArt";
import { Graphics } from "pixi.js";

const { track } = loadCircuit("spa");
const entries = buildEntries("none");

function race(seed: number, extra: Record<string, unknown> = {}, laps = 6) {
  const cfg = { seed, laps, track, entries, weather: { seed: seed * 3, mode: "random" as const, session: "race" as const }, ...extra };
  const { rows } = runQualifying({ seed, track, entries });
  return new RaceSim({ ...cfg, grid: rows.map((q) => q.carId) } as never);
}
function run(sim: RaceSim) {
  for (let i = 0; i < 60000 && sim.phase !== "finished"; i++) sim.step();
  return sim;
}
const sig = (s: RaceSim) => s.cars.map((c) => `${c.id}:${c.lap}:${c.status}:${c.s.toFixed(2)}`).join("|");

describe("weather", () => {
  it("is deterministic and never touches the race rng", () => {
    const a = new Weather(11, 3000);
    const b = new Weather(11, 3000);
    expect(Array.from(a.rainLine)).toEqual(Array.from(b.rainLine));
  });
  it("rain makes the right tyre change: slicks lose in the wet, wets lose in the dry", () => {
    expect(wetLoss("M", 0.8)).toBeGreaterThan(wetLoss("W", 0.8));
    expect(wetLoss("W", 0)).toBeGreaterThan(wetLoss("M", 0));
    expect(targetWetness(0.9)).toBeGreaterThan(targetWetness(0.1));
  });
  it("team radars disagree about the future but agree on the past", () => {
    let seed = 1;
    for (; seed < 200; seed++) {
      const probe = new Weather(seed, 3000);
      let peak = 0;
      for (let t = 0; t <= 1800; t += 60) peak = Math.max(peak, probe.rainAt(t));
      if (peak > 0.4) break;
    }
    const w = new Weather(seed, 3000);
    const a = new TeamRadar(w, makeProfile("mcl", 0.9, seed));
    const b = new TeamRadar(w, makeProfile("cad", 0.55, seed));
    expect(a.rain(1000, -60)).toBe(b.rain(1000, -60));
    let differ = 0;
    for (let lead = 300; lead <= 1800; lead += 300) if (Math.abs(a.rain(0, lead) - b.rain(0, lead)) > 0.001) differ++;
    expect(differ).toBeGreaterThan(0);
  });
});

describe("races with weather, crashes and radio", () => {
  it("replays identically from the same seed", () => {
    expect(sig(run(race(21)))).toBe(sig(run(race(21))));
  });
  it("radio chatter does not change the physics", () => {
    const on = run(race(33));
    const off = run(race(33, { noRadio: true }));
    expect(sig(on)).toBe(sig(off));
  });
  it("finishes with sane results across several seeds", () => {
    for (const seed of [1, 2, 3, 4]) {
      const sim = run(race(seed));
      expect(sim.phase).toBe("finished");
      const res = sim.results();
      expect(res.filter((r) => r.status === "FIN").length).toBeGreaterThan(8);
    }
  });
});

describe("venue art", () => {
  it("measures and draws pixel text", () => {
    expect(textWidth("ROLEX")).toBe(19);
    expect(() => drawText(new Graphics(), "QATAR AIRWAYS 26", 0, 0, 0xffffff)).not.toThrow();
  });
  it("builds a venue for every circuit with stands, boards and marshals", async () => {
    const { Rng } = await import("../src/sim/rng");
    for (const id of ["silverstone", "monaco", "monza", "suzuka", "marina-bay"]) {
      const t = loadCircuit(id).track;
      const v = buildVenue(t, id, new Rng(3), () => Infinity, false);
      expect(v.children.length).toBeGreaterThan(3);
    }
  });
});

describe("climate", () => {
  it("rain follows each circuit's real tendencies, and differs between circuits on the same seed", async () => {
    const { raceWeather } = await import("../src/game/setup");
    const { makeWeather } = await import("../src/sim/weather");
    const share = (id: string) => {
      let wet = 0;
      for (let seed = 1; seed <= 150; seed++) {
        const w = makeWeather(raceWeather({ seed, circuitId: id } as never), 6000);
        let peak = 0;
        for (let t = 0; t <= 5400; t += 60) peak = Math.max(peak, w.rainAt(t));
        if (peak > 0.1) wet++;
      }
      return wet / 150;
    };
    const spa = share("spa");
    const bahrain = share("bahrain");
    expect(bahrain).toBeLessThan(0.1);
    expect(spa).toBeGreaterThan(0.3);
    expect(spa).toBeLessThan(0.75);
    // the same seed gives different weather at different circuits (most seeds are dry at both, so look across several)
    let differs = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const a = makeWeather(raceWeather({ seed, circuitId: "silverstone" } as never), 6000);
      const b = makeWeather(raceWeather({ seed, circuitId: "spa" } as never), 6000);
      if (JSON.stringify(Array.from(a.rainLine)) !== JSON.stringify(Array.from(b.rainLine))) differs++;
    }
    expect(differs).toBeGreaterThan(5);
  });
});
