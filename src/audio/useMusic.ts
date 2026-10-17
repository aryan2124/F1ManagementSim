import { useEffect } from "react";
import { music, type TrackName } from "./music";

/** Play a track while a screen is showing. */
export function useMusic(track: TrackName): void {
  useEffect(() => {
    music.play(track);
  }, [track]);
}
