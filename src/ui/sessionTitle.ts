import { createContext, useContext } from "react";

export type SessionLabelKind = "sq" | "sprint" | "quali" | "race";

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
    default:
      return gp;
  }
}

/** "Q" in a normal qualifying, "SQ" in sprint qualifying (SQ1, SQ2, SQ3 are what the sessions are called). */
export const QualiKindCtx = createContext<"quali" | "sq">("quali");
export const useQPrefix = () => (useContext(QualiKindCtx) === "sq" ? "SQ" : "Q");
export const useQualiName = () => (useContext(QualiKindCtx) === "sq" ? "SPRINT QUALIFYING" : "QUALIFYING");
