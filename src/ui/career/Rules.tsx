import { liveLoopholes, loopState } from "../../career/loopholes";
import { formatState, liveAuctions, liveFormats } from "../../career/formats";
import { draftOn, draftPool, TAG_COST } from "../../career/draft";
import { driversOf } from "../../career/finance";
import { amendState } from "../../career/amendments";
import { KEYSTONES } from "../../career/keystones";
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
        {liveLoopholes(s).length > 0 && (
          <section className="panel" data-testid="loopholes">
            <h3>GAPS IN THE WORDING</h3>
            <p className="dim small">Every rule can be read two ways. Working a gap makes the car quicker, but the Commission hears about it: at half heat it hints, at full heat it patches the rule and fines everyone who used it.</p>
            {liveLoopholes(s).map((l) => {
              const on = (s.teams[s.teamId].loops ?? []).includes(l.id);
              const heat = loopState(s).heat[l.id] ?? 0;
              return (
                <p key={l.id} className="c-line">
                  <span><b>{l.name}</b> <span className="dim small">{l.text} Heat {Math.round(heat * 100)}%.</span></span>
                  <button className={on ? "on" : ""} onClick={() => setMsg(d({ type: "exploit", id: l.id, on: !on }).message)}>{on ? "STOP WORKING IT" : "WORK IT"}</button>
                </p>
              );
            })}
          </section>
        )}
        {(liveFormats(s).length > 0 || liveAuctions(s).length > 0) && (
          <section className="panel" data-testid="formats">
            <h3>YOUR CHOICES UNDER THESE RULES</h3>
            {liveFormats(s).map((f) => {
              const mine = s.teams[s.teamId].formats?.[f.moduleId];
              return (
                <div key={f.moduleId}>
                  <p className="dim small"><b>{f.title}.</b> {mine ? "Fixed for the season." : "Pick once; it cannot change this season."}</p>
                  <div className="seg">
                    {f.options.map((o) => (
                      <button key={o.id} className={mine === o.id ? "on" : ""} disabled={!!mine && mine !== o.id} title={o.blurb} onClick={() => setMsg(d({ type: "pickFormat", moduleId: f.moduleId, option: o.id }).message)}>{o.name}</button>
                    ))}
                  </div>
                  {mine && <p className="dim small">{f.options.find((o) => o.id === mine)?.blurb}</p>}
                </div>
              );
            })}
            {liveAuctions(s).map((a) => {
              const au = formatState(s).auctions[a.moduleId];
              const mineBid = au?.bids[s.teamId] ?? 0;
              return (
                <p key={a.moduleId} className="c-line">
                  <span><b>{a.title}</b> <span className="dim small">{!au ? "Opens at the next round." : au.done ? `Closed. Won by ${au.winners.map((x) => x.toUpperCase()).join(", ") || "nobody"}.` : `Sealed bids, top ${a.slots} win. Your bid: $${mineBid.toFixed(2)}m.`}</span></span>
                  {au && !au.done && [0, 0.25, 0.5, 1].map((v) => <button key={v} className={`btn ${mineBid === v ? "on" : ""}`} onClick={() => setMsg(d({ type: "bid", moduleId: a.moduleId, amount: v }).message)}>{v ? `$${v}m` : "NO BID"}</button>)}
                </p>
              );
            })}
          </section>
        )}
        {(draftOn(s) || (s.draft && !s.draft.done)) && (
          <section className="panel" data-testid="draft">
            <h3>THE DRAFT</h3>
            <p className="dim small">Drivers belong to the league. When a deal runs out the driver goes into the pool, and the teams pick in reverse order of last season's constructors' table. Picks sign for one season at 65% of the asking price. One franchise tag a year (${TAG_COST}m) keeps an expiring driver out of the pool.</p>
            {draftOn(s) && driversOf(s, s.teamId).filter((x) => x.endYear <= s.year).map((x) => (
              <p key={x.id} className="c-line">
                <span>{x.spec.name} is out of contract this year.</span>
                <button className={`btn ${s.draftTags?.[s.teamId] === x.id ? "on" : ""}`} onClick={() => setMsg(d({ type: "draftTag", driverId: s.draftTags?.[s.teamId] === x.id ? null : x.id }).message)}>{s.draftTags?.[s.teamId] === x.id ? "TAGGED" : `TAG HIM ($${TAG_COST}M)`}</button>
              </p>
            ))}
            {s.draft && !s.draft.done && (
              <>
                <p className="small"><b>Round {s.draft.round}.</b> {s.draft.clock === s.teamId ? "You are on the clock." : s.draft.clock ? `${s.draft.clock.toUpperCase()} is on the clock.` : "The computer teams are picking."} Order: {s.draft.order.map((t) => t.toUpperCase()).join(", ")}.</p>
                {draftPool(s, s.teamId).slice(0, 12).map((id) => {
                  const dd = s.drivers[id];
                  const j = s.pool.find((x) => x.id === id);
                  const name = dd?.spec.name ?? j?.name ?? id;
                  const pace = dd?.spec.pace ?? j?.pace ?? 0;
                  return (
                    <p key={id} className="c-line">
                      <span><b>{name}</b> <span className="dim small">pace {(pace * 100).toFixed(1)}{j ? ", academy graduate" : ""}</span></span>
                      <button className="btn" disabled={s.draft!.clock !== s.teamId} onClick={() => setMsg(d({ type: "draftPick", driverId: id }).message)}>PICK</button>
                    </p>
                  );
                })}
              </>
            )}
            {(s.draft?.picks ?? []).filter((p) => p.driverId).slice(-8).map((p, i) => <p key={i} className="dim small">Round {p.round}: {p.teamId.toUpperCase()} pick {p.name}.</p>)}
          </section>
        )}
        <section className="panel" data-testid="amendments">
          <h3>AMENDMENTS</h3>
          <p className="dim small">Any team can table a change; the teams vote at the next monthly round and a majority passes it. A team that benefits from the thing under attack votes against it. Filing costs $0.20m.</p>
          {amendState(s).open ? (
            <p className="c-line">
              <span><b>On the table:</b> {amendState(s).open!.kind === "patch-gap" ? "close the gap " : "ban the keystone "}{amendState(s).open!.kind === "patch-gap" ? amendState(s).open!.target : KEYSTONES.find((k) => k.id === amendState(s).open!.target)?.name}, tabled by {amendState(s).open!.by.toUpperCase()}.</span>
              <span>
                <button className="btn" onClick={() => setMsg(d({ type: "voteAmendment", yes: true }).message)}>FOR</button>
                <button className="btn" onClick={() => setMsg(d({ type: "voteAmendment", yes: false }).message)}>AGAINST</button>
              </span>
            </p>
          ) : (
            <>
              {liveLoopholes(s).slice(0, 4).map((l) => (
                <p key={l.id} className="c-line"><span>Close the gap: <b>{l.name}</b></span><button className="btn" onClick={() => setMsg(d({ type: "proposeAmendment", kind: "patch-gap", target: l.id }).message)}>TABLE IT</button></p>
              ))}
              {Object.values(s.teams).flatMap((t) => (t.id === s.teamId ? [] : t.keystones ?? [])).filter((k, i, a) => a.indexOf(k) === i).slice(0, 4).map((k) => (
                <p key={k} className="c-line"><span>Ban the keystone: <b>{KEYSTONES.find((x) => x.id === k)?.name ?? k}</b> (a rival runs it)</span><button className="btn" onClick={() => setMsg(d({ type: "proposeAmendment", kind: "ban-keystone", target: k }).message)}>TABLE IT</button></p>
              ))}
            </>
          )}
          {amendState(s).history.slice(-3).map((h, i) => <p key={i} className="dim small">{h.passed ? "Passed" : "Defeated"}: {h.text}.</p>)}
        </section>
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
