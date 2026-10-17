import type { TrackName } from "./music";
import type { RaceSession } from "../game/session";

/** Which music suits the race right now. The score follows the story: green flag racing, a rainy track, the safety car, the last laps. */
export function raceTrackFor(session: RaceSession): TrackName {
  const sim = session.sim;
  if (sim.phase === "finished") return "results";
  if (sim.inc.red.active) return "raceSC";
  if (sim.neutral.active) return "raceSC";
  const wx = sim.weather;
  // nothing here may depend on which car the camera is on: the score must not change when the view does
  if (wx && [0, 1, 2].some((k) => wx.rainSector(k, wx.t) > 0.25)) return "raceRain";
  const lapsLeft = sim.cfg.laps - (sim.leader()?.lap ?? 0);
  if (sim.chequered || lapsLeft <= 3) return "raceHigh";
  return "race";
}
