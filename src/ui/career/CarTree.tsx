import { useState } from "react";
import { AREAS, AREA_LABEL, TRAITS, type Area, type Idea, type Phil, type Trait } from "../../career/types";
import { KEYSTONES, SLOTS, SWAP_HOURS, activePairs, keystoneOf, type Keystone } from "../../career/keystones";
import { TRAIT_NAME } from "../../career/traits";
import { KIND_LABEL } from "../../career/rndplan";
import { fmtDay, fmtMoney, lapDelta } from "../../career/util";
import { ideaFacts } from "../../career/ideas";
import type { Props } from "./common";

type Pick = { k: "key"; id: string } | { k: "idea"; id: number } | { k: "proj"; id: number } | { k: "trunk" } | null;

const AXES: { k: keyof Phil; lo: string; hi: string }[] = [
  { k: "df", lo: "LOW DRAG", hi: "DOWNFORCE" },
  { k: "risk", lo: "PROVEN", hi: "RADICAL" },
  { k: "innov", lo: "REFINE", hi: "INVENT" },
];
const KIND_SHAPE: Record<string, string> = { safe: "sq", gamble: "dia", enabler: "tri" };

/** Bars that slide left (worse) or right (better) for each trait a choice touches. */
function TraitBars({ fx }: { fx: Partial<Record<Trait, number>> }) {
  const rows = TRAITS.filter((t) => (fx[t] ?? 0) !== 0);
  if (!rows.length) return <p className="dim small">No effect on the car's traits.</p>;
  return (
    <div className="tf-meters">
      {rows.map((t) => {
        const v = Math.max(-1, Math.min(1, (fx[t] ?? 0) / 0.16));
        return (
          <div className="tf-row" key={t}>
            <span className="tf-name">{TRAIT_NAME[t].toUpperCase()}</span>
            <div className="tf-track">
              <i className="tf-mid" />
              <b className={`tf-bar ${v >= 0 ? "up" : "down"}`} style={{ left: v >= 0 ? "50%" : `${50 + v * 50}%`, width: `${Math.abs(v) * 50}%` }} />
            </div>
            <span className={`tf-say ${v > 0 ? "up" : "down"}`}>{v > 0 ? "better" : "worse"}</span>
          </div>
        );
      })}
    </div>
  );
}

/** How wide the staff's guess is, on a line from "faster" to "slower". A gamble is a long bar, a sure thing a short one. */
function RangeBar({ lo, hi }: { lo: number; hi: number }) {
  const pos = (v: number) => Math.max(0, Math.min(100, 50 + (v / 0.6) * 50));
  const a = pos(Math.min(lo, hi)), b = pos(Math.max(lo, hi));
  return (
    <div className="tf-range" aria-label={`about ${lapDelta(lo)} to ${lapDelta(hi)} seconds a lap`}>
      <div className="tf-track"><i className="tf-mid" /><b className={`tf-bar ${hi <= 0 ? "up" : lo >= 0 ? "down" : "mix"}`} style={{ left: `${a}%`, width: `${Math.max(2, b - a)}%` }} /></div>
      <div className="tf-ends"><span>FASTER</span><span>{lapDelta(lo)} to {lapDelta(hi)} s</span><span>SLOWER</span></div>
    </div>
  );
}

export function CarTree({ s, d }: Props) {
  const me = s.teams[s.teamId];
  const [pick, setPick] = useState<Pick>(null);
  const [draft, setDraft] = useState<Phil>(me.concept);
  const [msg, setMsg] = useState("");
  const fittedIds = me.keystones ?? [];
  const active = me.projects.filter((p) => p.status === "building" || p.status === "ready");
  const pairs = activePairs(fittedIds);
  const locked = me.conceptDay !== undefined && s.day - me.conceptDay < 28;
  const banned = s.amend?.banned ?? [];
  const batch = s.cards.find((c) => c.kind === "ideaBatch" && !c.notice);
  const offered = new Set(String(batch?.data?.offered ?? "").split(",").filter(Boolean).map(Number));

  const ideaIn = (a: Area) => me.ideas.filter((i) => i.area === a);
  const projIn = (a: Area) => active.filter((p) => p.area === a);

  const selKey = pick?.k === "key" ? keystoneOf(pick.id) : undefined;
  const selIdea = pick?.k === "idea" ? me.ideas.find((i) => i.id === pick.id) : undefined;
  const selProj = pick?.k === "proj" ? active.find((p) => p.id === pick.id) : undefined;

  const fitKey = (k: Keystone, slot: number) => setMsg(d({ type: "setKeystone", slot, id: k.id }).message);
  const dropKey = (slot: number) => setMsg(d({ type: "setKeystone", slot, id: null }).message);

  return (
    <div className="ct" data-testid="car-tree">
      <div className="ct-main">
      {batch && (
        <div className="ct-banner">
          <b>PICK ONE GLOWING IDEA.</b> The others are shelved for good.
          <button className="tiny" onClick={() => d({ type: "card", id: batch.id, option: "none" })}>SHELVE ALL</button>
        </div>
      )}
      <div className="ct-branches">
        {AREAS.map((a) => (
          <div className="ct-branch" key={a}>
            <div className="ct-leaves">
              {projIn(a).map((p) => (
                <button key={`p${p.id}`} className={`ct-leaf building ${pick?.k === "proj" && pick.id === p.id ? "on" : ""}`} onClick={() => setPick({ k: "proj", id: p.id })} title={p.name}>
                  <span className="ct-ring" style={{ ["--p" as string]: `${Math.min(100, Math.round((p.progress / p.days) * 100))}%` }} />
                  <b>{p.name}</b>
                  <small>{p.status === "ready" ? "READY" : `${Math.round((p.progress / p.days) * 100)}%`}</small>
                </button>
              ))}
              {ideaIn(a).map((i) => (
                <button key={`i${i.id}`} className={`ct-leaf idea ${offered.has(i.id) ? "offer" : ""} ${KIND_SHAPE[i.kind ?? "safe"]} ${pick?.k === "idea" && pick.id === i.id ? "on" : ""}`} onClick={() => setPick({ k: "idea", id: i.id })} title={i.name}>
                  <i className="ct-shape" />
                  <b>{i.name}</b>
                  <small className={(i.predLo + i.predHi) / 2 <= 0 ? "up" : "down"}>{lapDelta((i.predLo + i.predHi) / 2)}s</small>
                </button>
              ))}
              {ideaIn(a).length + projIn(a).length === 0 && <span className="ct-empty">no ideas yet</span>}
            </div>
            <div className="ct-stem" />
            <div className="ct-keys">
              {KEYSTONES.filter((k) => k.area === a).map((k) => {
                const on = fittedIds.includes(k.id);
                const bad = banned.includes(k.id);
                return (
                  <button key={k.id} className={`ct-key ${on ? "fit" : ""} ${bad ? "ban" : ""} ${pick?.k === "key" && pick.id === k.id ? "on" : ""}`} onClick={() => setPick({ k: "key", id: k.id })} title={k.name}>
                    <i className="ct-gem" />
                    <span>{k.name}</span>
                  </button>
                );
              })}
            </div>
            <div className={`ct-node area ${a}`}>
              <b>{AREA_LABEL[a].toUpperCase()}</b>
              <small className={me.believed[a] <= 0 ? "up" : "down"}>{lapDelta(me.believed[a])}s</small>
            </div>
          </div>
        ))}
      </div>
      <button className={`ct-trunk ${pick?.k === "trunk" ? "on" : ""}`} onClick={() => setPick({ k: "trunk" })}>
        <b>CONCEPT</b>
        <span>{AXES.map((ax) => (me.concept[ax.k] > 0.15 ? ax.hi : me.concept[ax.k] < -0.15 ? ax.lo : "BALANCED")).join(" / ")}</span>
      </button>
      </div>

      <section className="panel ct-detail" aria-live="polite">
        {!pick && <p className="dim">Tap a node. Leaves are ideas and builds, gems are the big choices that define the car, the trunk is the concept.</p>}
        {selKey && (
          <>
            <h4>{selKey.name}</h4>
            <p className="small">{selKey.blurb}</p>
            <TraitBars fx={selKey.fx} />
            {pairs.filter((p) => p.a === selKey.id || p.b === selKey.id).map((p) => <p key={p.a + p.b} className="small up">Works with another gem you fitted.</p>)}
            <div className="ct-slots">
              {Array.from({ length: SLOTS }, (_, i) => {
                const occ = fittedIds[i] ? keystoneOf(fittedIds[i])?.name : null;
                const here = fittedIds[i] === selKey.id;
                return (
                  <button key={i} className={`btn ${here ? "primary" : ""}`} disabled={banned.includes(selKey.id) || (here && true)} onClick={() => fitKey(selKey, i)}>
                    {here ? `IN SLOT ${i + 1}` : `SLOT ${i + 1}: ${occ ?? "EMPTY"}`}
                  </button>
                );
              })}
              {fittedIds.includes(selKey.id) && <button className="tiny" onClick={() => dropKey(fittedIds.indexOf(selKey.id))}>TAKE OFF</button>}
            </div>
            <p className="dim small">{me.keystonesSet ? `A swap costs ${SWAP_HOURS} tunnel hours.` : "The first fit is free."}</p>
          </>
        )}
        {selIdea && <IdeaDetail s={s} d={d} i={selIdea} batchId={batch && offered.has(selIdea.id) ? batch.id : null} onDone={() => setPick(null)} />}
        {selProj && (
          <>
            <h4>{selProj.name}</h4>
            <RangeBar lo={selProj.predLo} hi={selProj.predHi} />
            <p className="small">{selProj.status === "ready" ? (selProj.hold ? "Held back in the garage." : "Ready. It goes on at the next race.") : `${Math.max(0, Math.ceil(selProj.days - selProj.progress))} days to go.`}</p>
            <div className="ct-slots">
              {selProj.status === "ready" && <button className="btn" onClick={() => d({ type: "holdPart", id: selProj.id, hold: !selProj.hold })}>{selProj.hold ? "FIT AT NEXT RACE" : "HOLD BACK TO TEST"}</button>}
            </div>
          </>
        )}
        {pick?.k === "trunk" && (
          <>
            <h4>CONCEPT</h4>
            {AXES.map((ax) => (
              <div className="c-axis" key={ax.k}>
                <div className="c-line"><span className="dim small">{ax.lo}</span><span className="dim small">{ax.hi}</span></div>
                <input type="range" min={-1} max={1} step={0.05} value={draft[ax.k]} onChange={(e) => setDraft({ ...draft, [ax.k]: Number(e.target.value) })} />
              </div>
            ))}
            <button className="btn" disabled={locked || (draft.df === me.concept.df && draft.risk === me.concept.risk && draft.innov === me.concept.innov)} onClick={() => d({ type: "setConcept", phil: draft })}>SET CONCEPT</button>
            {locked && <p className="dim small">Settling until {fmtDay((me.conceptDay ?? 0) + 28)}.</p>}
          </>
        )}
        {msg && <p className="c-msg">{msg}</p>}
      </section>
    </div>
  );
}

function IdeaDetail({ s, d, i, batchId, onDone }: { s: Props["s"]; d: Props["d"]; i: Idea; batchId: number | null; onDone: () => void }) {
  const f = ideaFacts(s, i);
  return (
    <>
      <h4>{i.name}</h4>
      <p className="small">{i.kind ? KIND_LABEL[i.kind] : ""}</p>
      <RangeBar lo={i.predLo} hi={i.predHi} />
      <div className="ct-chips">
        <span className="chip-cost">{fmtMoney(i.cost)}</span>
        <span className="chip-cost">{i.days} days</span>
        <span className="chip-cost">{i.tunnelHours ? `${i.tunnelHours}h tunnel` : "no tunnel"}</span>
      </div>
      {f.warn && <p className="warn small">{f.warn}</p>}
      <button className="btn primary" onClick={() => { if (batchId !== null) d({ type: "card", id: batchId, option: `idea:${i.id}` }); else d({ type: "startProject", ideaId: i.id }); onDone(); }}>{batchId !== null ? "BUILD THIS ONE" : "START"}</button>
    </>
  );
}
