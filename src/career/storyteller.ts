import { clamp } from "./util";
import type { CareerState } from "./types";

/**
 * The pacing of the paddock's drama. It looks at how much is already on the player's plate and how long it has been quiet,
 * and tells the story and event systems to ease off or to stir things up. It never picks an outcome, only the tempo.
 */
export function tension(s: CareerState): number {
  const t = s.teams[s.teamId];
  const heavy = s.cards.filter((c) => !c.notice && c.urgency >= 3).length;
  const recent = s.day - Math.max(s.story.bigDay, s.story.last.storyAny ?? -999);
  return clamp(0.25 * heavy + (t.board < 30 ? 0.35 : 0) + (t.cash < 0 ? 0.25 : 0) + (recent < 8 ? 0.3 : 0), 0, 1);
}

/** Multiplier on how often something should happen this week. */
export function tempo(s: CareerState): number {
  const t = tension(s);
  const quiet = s.day - Math.max(s.story.bigDay, s.story.last.storyAny ?? -999, s.story.last.mediaDay ?? -999);
  if (t >= 0.55) return 0.45;
  if (quiet > 40) return 1.7;
  if (quiet > 24) return 1.25;
  return 1;
}
