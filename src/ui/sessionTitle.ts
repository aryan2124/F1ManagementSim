import { createContext, useContext } from "react";

export type SessionLabelKind = "sq" | "sprint" | "quali" | "race" | "fp";

/** The heading of a session: a sprint is not a Grand Prix, and sprint qualifying is not qualifying, so the screens must not say so. */
export function sessionTitle(gp: string, kind?: SessionLabelKind): string {
  const place = gp.replace(/\s*Grand Prix$/i, "");
  switch (kind) {
    case "sprint":
      return `${place} Sprint`;
    case "sq":
      return `${place} Sprint Qualifying`;
    case "quali":
      return `${gp} Qualifying`;
    case "fp":
      return `${gp} Practice`;
    default:
      return gp;
  }
}

/** "Q" in a normal qualifying, "SQ" in sprint qualifying (SQ1, SQ2, SQ3 are what the sessions are called). */
export const QualiKindCtx = createContext<"quali" | "sq" | "fp">("quali");
export const useQPrefix = () => { const k = useContext(QualiKindCtx); return k === "sq" ? "SQ" : k === "fp" ? "FP" : "Q"; };
export const useQualiName = () => { const k = useContext(QualiKindCtx); return k === "sq" ? "SPRINT QUALIFYING" : k === "fp" ? "PRACTICE" : "QUALIFYING"; };
