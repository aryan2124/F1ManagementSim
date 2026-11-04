import type { TrackModel } from "./track";

/**
 * The road a car takes into, through and out of the pit lane. The track art draws the entry road
 * (it starts 30 m before the lane and angles in) and the exit road (40 m after the lane); the sim
 * used to ignore both and slide the car across the grass the moment its status changed. One path,
 * read by the sim, qualifying and the tests, so a car is always where the picture says the road is.
 *
 * All distances are along the lap (0 = the line). Offsets are metres from the racing line, signed
 * towards the pit side.
 */

export const PIT_LANE_LAT = 24;
/** The edge of the track, where the entry road leaves it and the exit road rejoins. */
export const PIT_EDGE_LAT = 8;
/** Length of the move from the racing line to the track edge before the entry road. */
export const PIT_APPROACH = 30;
export const PIT_ENTRY_ROAD = 30;
export const PIT_EXIT_ROAD = 40;
/** Length of the merge from the track edge back onto the line after the exit road. */
export const PIT_MERGE = 60;

type Geo = Pick<TrackModel, "length" | "pitIn" | "pitOut" | "pitSide">;

const ease = (t: number) => {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
};

/** Lap position where a car may commit to the pit road (the approach starts here). */
export const pitApproachStart = (T: Geo) => T.length - T.pitIn;
/** Last lap position at which a car may still turn in: after this the entry road has begun. */
export const pitCommitEnd = (T: Geo) => T.length - T.pitIn + PIT_APPROACH - 2;
/** Lap position where the exit merge has finished and the car is back on the racing line. */
export const pitRoadEnd = (T: Geo) => T.pitOut + PIT_EXIT_ROAD + PIT_MERGE;

/** Sideways offset for a car on the pit road at `lapPos`, or null when the road does not reach there. */
export function pitPathLat(T: Geo, lapPos: number): number | null {
  const s = T.pitSide;
  const a0 = T.length - T.pitIn;
  const a1 = a0 + PIT_APPROACH;
  const a2 = a1 + PIT_ENTRY_ROAD;
  if (lapPos >= a0) {
    if (lapPos < a1) return s * PIT_EDGE_LAT * ease((lapPos - a0) / PIT_APPROACH);
    if (lapPos < a2) return s * (PIT_EDGE_LAT + (PIT_LANE_LAT - PIT_EDGE_LAT) * ease((lapPos - a1) / PIT_ENTRY_ROAD));
    return s * PIT_LANE_LAT;
  }
  const b0 = T.pitOut;
  const b1 = b0 + PIT_EXIT_ROAD;
  const b2 = b1 + PIT_MERGE;
  if (lapPos <= b0) return s * PIT_LANE_LAT;
  if (lapPos < b1) return s * (PIT_LANE_LAT - (PIT_LANE_LAT - PIT_EDGE_LAT) * ease((lapPos - b0) / PIT_EXIT_ROAD));
  if (lapPos < b2) return s * PIT_EDGE_LAT * (1 - ease((lapPos - b1) / PIT_MERGE));
  return null;
}

/** The fastest sideways rate the path asks for at a given speed, so a car can follow it without lag. */
export const PIT_SLEW = 70; // m/s sideways: the steepest part of the road at 90 m/s is about 45
