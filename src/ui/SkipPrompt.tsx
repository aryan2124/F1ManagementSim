import type { QualiSession } from "../game/qsession";
import type { RaceSession } from "../game/session";
import type { QCar } from "../sim/qualifying";

/** What a league screen passes down so the prompt can show and cast the skip vote. */
export interface NetSkip {
  /** Every car run by a person in this session, whoever's it is. */
  allHumanIds: string[];
  /** The league's current ballot on skipping: team to option, plus the settled result if there is one. */
  votes: Record<string, Record<string, string>>;
  myTeam: string;
  cast: (option: "skip" | "watch") => void;
}

type Sess = QualiSession | RaceSession;

function isQuali(s: Sess): s is QualiSession {
  return "startSegment" in (s as object);
}

/** True when every car in the list is out of the session: knocked out of qualifying, or retired from the race. */
export function allOut(session: Sess, ids: string[]): boolean {
  if (!ids.length) return false;
  if (isQuali(session)) {
    if (session.sim.phase === "done") return false;
    return ids.every((id) => (session.sim.car(id) as unknown as QCar).eliminatedIn !== 0);
  }
  if (session.sim.phase === "finished") return false;
  return ids.every((id) => {
    const c = session.sim.car(id);
    return c.status === "dnf" || !!c.removed;
  });
}

/**
 * Shown when all of the player's cars are out. Alone, you can skip straight on. In a league the option only appears once every
 * person's cars are out, and then everyone votes: skip or keep watching, a tie is settled at random by the server.
 */
export function SkipPrompt({ session, net }: { session: Sess; net?: NetSkip }) {
  const quali = isQuali(session);
  if (!allOut(session, net ? net.allHumanIds : session.humanIds)) return null;
  const word = quali ? "SKIP TO THE RACE" : "SKIP TO THE RESULT";
  if (!net) {
    return (
      <div className="skip-prompt">
        <span>{quali ? "Both of your drivers are out." : "Both of your cars are out of the race."}</span>
        <button className="btn primary" onClick={() => session.skipToEnd()}>{word}</button>
      </div>
    );
  }
  const result = net.votes.skipResult?.result;
  if (result) {
    return (
      <div className="skip-prompt">
        <span>{result === "skip" ? "The league voted to skip. Running the rest of the session now." : "The league voted to keep watching."}</span>
      </div>
    );
  }
  const ballots = net.votes.skip ?? {};
  const n = (o: string) => Object.values(ballots).filter((x) => x === o).length;
  const mineVote = ballots[net.myTeam];
  return (
    <div className="skip-prompt">
      <span>Every manager's cars are out. Skip the rest, or keep watching? A tie is settled at random.</span>
      <button className={`btn ${mineVote === "skip" ? "primary" : ""}`} onClick={() => net.cast("skip")}>{word} ({n("skip")})</button>
      <button className={`btn ${mineVote === "watch" ? "primary" : ""}`} onClick={() => net.cast("watch")}>KEEP WATCHING ({n("watch")})</button>
    </div>
  );
}
