import { useState } from "react";
import { MODULES, MODULE_BY_ID, THEME_LABEL, describeIntensity, type Live } from "../../career/modules";
import { planOf, routeEstimate, staffOpinions, PACKAGES } from "../../career/eras";
import { fmtDay } from "../../career/util";
import { Bar, Tip, type Props } from "./common";
import { VOTE_NEEDED, sounding, type Stance } from "../../career/vote";
import { ModuleIcon } from "../pixel/icons";
import { TEAMS } from "../../game/data";
import type { EraDef } from "../../career/eras";
import type { CareerState } from "../../career/types";
import type { Dispatch } from "./common";

const LIVE_LABEL: Record<Live, string> = { sim: "Simulated in races", career: "Changes the management game", rules: "Announced and scored only" };
const LIVE_HELP: Record<Live, string> = {
  sim: "This rule really changes how the simulated race runs.",
  career: "This rule changes your choices (setup, R&D, money, grid or scoring). It does not change the race physics.",
  rules: "This rule is announced, argued about and counted in the concept scores, but its on-track effect is not simulated in this build.",
};
const STAGES = ["Secret design", "Framework published", "Draft rules and lobbying", "Final rules", "Late amendment", "Launched"];

function words(mid: number, hw: number) {
  const lean = mid > 0.25 ? "looks strong" : mid > 0.05 ? "leans good" : mid < -0.25 ? "looks weak" : mid < -0.05 ? "leans poor" : "too close to call";
  return hw > 0.45 ? `${lean}, but we know very little` : hw > 0.25 ? `${lean}, with real doubt` : `${lean}, fairly sure`;
}

const STANCE_COL: Record<Stance, string> = { for: "#5fd36f", against: "#ff5c5c", undecided: "#8a7fd0" };

/** The module's vote: what the paddock says, my vote, persuasion and trades, then the result. */
function VoteRow({ s, d, era, m, say }: { s: CareerState; d: Dispatch; era: EraDef; m: EraDef["modules"][number]; say: (r: { message: string }) => void }) {
  const def = MODULE_BY_ID[m.id];
  const plan = planOf(s, s.teamId);
  const b = s.era.ballot?.[m.id];
  const my = plan.votes?.[m.id] ?? 0;
  const [team, setTeam] = useState("");
  const [theirs, setTheirs] = useState("");
  const others = TEAMS.filter((t) => t.id !== s.teamId);
  const wanted = (id: string) => era.modules.filter((x) => x.id !== m.id && sounding(s, id, x.id) === "for");
  const owed = (plan.pledges ?? []).find((x) => x.theirs === m.id);
  if (!def) return null;
  return (
    <li className="c-vote">
      <div className="c-vhead">
        <span className="c-vico"><ModuleIcon id={m.id} size={36} /></span>
        <div>
          <b>{def.name}</b> <em className={`live ${def.live}`}>{LIVE_LABEL[def.live]}</em> <Tip text={LIVE_HELP[def.live]} />
          <p className="dim small">{def.rule} {describeIntensity(def, m.intensity)}.</p>
          <p className="small">{def.intent}</p>
        </div>
      </div>
      {b ? (
        <div className={`c-result ${b.passed ? "pass" : "fail"}`}>
          <b>{b.passed ? "PASSED" : "FAILED"} {b.yes.length} to {b.no.length}</b>{b.abstain.length ? `, ${b.abstain.length} abstained` : ""}. {b.passed ? "" : "Only a token version goes ahead."} <span className="dim">Needed {b.needed}.</span>
          <div className="c-chips">
            {[...b.yes.map((id) => [id, "for"] as const), ...b.no.map((id) => [id, "against"] as const), ...b.abstain.map((id) => [id, "undecided"] as const)].map(([id, st]) => (
              <span key={id} style={{ borderColor: STANCE_COL[st], color: STANCE_COL[st] }}>{TEAMS.find((t) => t.id === id)?.short ?? id}</span>
            ))}
          </div>
        </div>
      ) : era.stage === 2 ? (
        <>
          <div className="c-chips" aria-label="What the paddock says">
            {others.map((t) => {
              const st = sounding(s, t.id, m.id);
              return <span key={t.id} title={`${t.name}: ${st}`} style={{ borderColor: STANCE_COL[st], color: STANCE_COL[st] }}>{t.short} {st === "for" ? "+" : st === "against" ? "-" : "?"}</span>;
            })}
          </div>
          <div className="c-acts">
            <span className="dim small">YOUR VOTE ({VOTE_NEEDED} of {Object.keys(s.teams).length} needed)</span>
            {([[1, "YES"], [0, "ABSTAIN"], [-1, "NO"]] as const).map(([v, l]) => <button key={l} className={`tiny ${my === v ? "on" : ""}`} disabled={!!owed && v !== 1} onClick={() => say(d({ type: "eraVote", moduleId: m.id, vote: v }))}>{l}</button>)}
            {owed && <span className="dim small">Promised to {TEAMS.find((t) => t.id === owed.team)?.short} in a trade</span>}
          </div>
          <div className="c-acts">
            <select value={team} onChange={(ev) => { setTeam(ev.target.value); setTheirs(""); }}>
              <option value="">Pick a team...</option>
              {others.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button className="tiny" disabled={!team} onClick={() => say(d({ type: "eraPersuade", moduleId: m.id, teamId: team, dir: 1 }))}>PERSUADE: YES (1)</button>
            <button className="tiny" disabled={!team} onClick={() => say(d({ type: "eraPersuade", moduleId: m.id, teamId: team, dir: -1 }))}>PERSUADE: NO (1)</button>
            {team && (
              <>
                <select value={theirs} onChange={(ev) => setTheirs(ev.target.value)}>
                  <option value="">I back their...</option>
                  {wanted(team).map((x) => <option key={x.id} value={x.id}>{MODULE_BY_ID[x.id]?.name}</option>)}
                </select>
                <button className="tiny" disabled={!theirs} onClick={() => say(d({ type: "eraTrade", teamId: team, myModule: m.id, theirModule: theirs }))}>TRADE VOTES</button>
              </>
            )}
          </div>
        </>
      ) : null}
    </li>
  );
}

export function Rules({ s, d }: Props) {
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const e = s.era;
  const cur = e.current;
  const next = e.next;
  const say = (r: { message: string }) => setMsg(r.message);
  const plan = planOf(s, s.teamId);

  return (
    <div className="c-cols">
      <div>
        <section className="panel">
          <h3>REGULATIONS NOW</h3>
          {e.mode === "locked" && <p className="dim">This career uses locked rules. Only the modules you picked at the start are in force.</p>}
          {cur && cur.modules.length > 0 ? (
            <>
              <p>{THEME_LABEL[cur.theme]} era, {cur.startYear} to {cur.startYear + cur.length - 1}. {cur.why.join(" ")}</p>
              <ul className="c-mods">
                {cur.modules.map((m) => {
                  const def = MODULE_BY_ID[m.id];
                  if (!def) return null;
                  return (
                    <li key={m.id}>
                      <b>{def.name}</b> <em className={`live ${def.live}`}>{LIVE_LABEL[def.live]}</em> <Tip text={LIVE_HELP[def.live]} />
                      <p className="dim small">{def.rule} {describeIntensity(def, m.intensity)}.</p>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="dim">The current rules are the standard ones. No special modules are in force.</p>
          )}
        </section>
        {e.past.length > 0 && (
          <section className="panel">
            <h3>PAST ERAS</h3>
            {e.past.map((p) => (
              <div key={p.number}>
                <p className="small"><b>Era {p.number}: {THEME_LABEL[p.theme]}, from {p.startYear}</b></p>
                {p.story.map((x, i) => <p key={i} className="dim small">{x}</p>)}
              </div>
            ))}
          </section>
        )}
      </div>
      <div>
        {msg && <p className="c-msg">{msg}</p>}
        {!next || e.mode === "locked" ? (
          <section className="panel"><h3>NEXT RULES</h3><p className="dim">{e.mode === "locked" ? "The rules are locked for this career." : "Nothing is planned yet."}</p></section>
        ) : (
          <>
            <section className="panel">
              <h3>NEXT RULES: {next.startYear}</h3>
              <ol className="c-stages">
                {STAGES.map((n, i) => (
                  <li key={n} className={i < next.stage ? "done" : i === next.stage ? "now" : ""}>{n}</li>
                ))}
              </ol>
              {next.stage === 0 ? (
                <p className="dim">The governing body is working in secret. New rules are expected in {next.startYear}. Rumours will leak before the framework comes out in the summer break.</p>
              ) : (
                <>
                  <p>Theme: <b>{THEME_LABEL[next.theme]}</b>. {next.why.join(" ")}</p>
                  <p className="dim small">{Math.round(next.fastShare * 100)}% of the planned calendar is on fast circuits.{next.amendment ? ` Late change: ${next.amendment}` : ""}</p>
                  <ul className="c-mods c-votes">
                    {next.modules.map((m) => <VoteRow key={m.id} s={s} d={d} era={next} m={m} say={say} />)}
                  </ul>
                  {next.stage === 2 && <p className="dim small">Influence left: <b>{e.influence}</b>. Each persuasion attempt uses one and works more often on teams that are undecided. A vote trade is free but binding: you must back their module and they back yours. Teams you do not reach vote their own interests.</p>}
                </>
              )}
            </section>
            {next.stage >= 1 && (
              <section className="panel">
                <h3>OUR PLAN</h3>
                <p className="small">Concept routes. Nobody knows which is best, not even the governing body. Our read below comes from what we have learned so far.</p>
                {next.routes.map((r, i) => {
                  const est = routeEstimate(next, plan, r);
                  const chosen = plan.route === i;
                  const hedged = plan.hedge === i;
                  return (
                    <div key={r.id} className={`c-route ${chosen ? "pick" : hedged ? "hedge" : ""}`}>
                      <b>{r.name}</b> <span className="dim">{r.blurb}</span>
                      <p className="small">Our read: {words(est.mid, est.hw)}.</p>
                      {next.stage >= 3 && (
                        <div className="c-acts">
                          <button className="tiny" disabled={chosen} onClick={() => say(d({ type: "eraRoute", route: i, hedge: plan.hedge === i ? null : plan.hedge }))}>{chosen ? "COMMITTED" : "COMMIT"}</button>
                          <button className="tiny" disabled={chosen || hedged || plan.route === null} onClick={() => say(d({ type: "eraRoute", route: plan.route, hedge: i }))}>{hedged ? "HEDGE" : "HEDGE ON THIS"}</button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {next.stage < 3 && <p className="dim small">You can commit to a route once the final rules are published.</p>}
                <h4>Development split <Tip text="How much of your R&D effort goes into the new car instead of this year's car. More on the new car means slower gains on the current one." /></h4>
                <input type="range" min={0} max={0.6} step={0.05} value={plan.split} onChange={(ev) => say(d({ type: "eraSplit", value: Number(ev.target.value) }))} />
                <p className="small">{Math.round(plan.split * 100)}% on the new car. Progress on it: <Bar v={plan.progress} /></p>
                <p className="dim small">Your current car's R&D gains are cut by about {Math.round(plan.split * 70)}% while the split is set.</p>
                <h4>Concept Lab <Tip text="Spend wind tunnel and simulator time on one open question to narrow what we know. It costs tunnel hours." /></h4>
                <div className="c-acts">
                  {next.unknowns.map((u) => {
                    const k = plan.known[u.id] ?? [0, 1];
                    const sure = 1 - (k[1] - k[0]);
                    return (
                      <button key={u.id} className="tiny" onClick={() => say(d({ type: "eraLab", unknown: u.id }))} title={`We are ${Math.round(sure * 100)}% sure`}>
                        {u.label} ({Math.round(sure * 100)}%)
                      </button>
                    );
                  })}
                </div>
                <h4>Engine package</h4>
                <div className="c-acts">
                  {(Object.keys(PACKAGES) as (keyof typeof PACKAGES)[]).map((k) => (
                    <button key={k} className={`tiny ${plan.package === k ? "on" : ""}`} title={PACKAGES[k].blurb} onClick={() => say(d({ type: "eraPackage", pkg: k }))}>{PACKAGES[k].label.toUpperCase()}</button>
                  ))}
                </div>
                {plan.package && <p className="dim small">{PACKAGES[plan.package].blurb}</p>}
              </section>
            )}
            {next.stage >= 1 && (
              <section className="panel">
                <h3>INTEL</h3>
                {staffOpinions(s).map((o) => (
                  <p key={o.who} className="small"><b>{o.who}</b> ({o.role}) would pick <b>{o.pick}</b>, {o.sure}.</p>
                ))}
                {e.rumours.slice(0, 5).map((r, i) => (
                  <p key={i} className="small dim">{fmtDay(r.day)}: {r.text}</p>
                ))}
                <button className="linkish small" onClick={() => setOpen(open ? null : "all")}>{open ? "Hide" : "Show"} how many modules are really simulated</button>
                {open && <p className="dim small">Of the {MODULES.length} modules, {MODULES.filter((m) => m.live === "sim").length} change the race itself and {MODULES.filter((m) => m.live === "career").length} change the management game. {MODULES.filter((m) => m.live === "rules").length === 0 ? "None are scored only: every module does something." : `${MODULES.filter((m) => m.live === "rules").length} are announced and counted in the concept scores only.`}</p>}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
