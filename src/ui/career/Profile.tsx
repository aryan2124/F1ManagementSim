import { createContext, useContext, useState, type ReactNode } from "react";
import type { CareerState, DriverState } from "../../career/types";
import { driversOf } from "../../career/finance";
import { ageOf } from "../../career/contracts";
import { achievementsFor, REAL_WCC } from "../../career/records";
import { statureOf, ensureStatus, expectedRole, ROLE_WORD } from "../../career/status";
import { CAUSE_LABEL, G_STAGE } from "../../career/people";
import { TEAMS } from "../../game/data";
import { fmtDay, fmtMoney } from "../../career/util";
import { DriverPortrait } from "../pixel/portraits";
import { Bar, hex, paceWord, teamOf, type Dispatch } from "./common";
import { CrewPanel } from "./Crew";
import { teamColour, teamLabel } from "../../career/brand";
import { teamStaff } from "../../career/car";
import { cvOf } from "../../career/cv";
import { STAFF_LABEL } from "../../career/types";
import { ATTRS, ATTR_LABEL as PATTR_LABEL, reportOf } from "../../career/academy";
import { ATTR_GROUPS, ATTR_LABEL, ATTR_TIP, attributesOf, readAttr } from "../../career/attributes";
import { iqWord, raceIQ } from "../../sim/iq";

/**
 * Profiles. Click any driver or team name in a table and this opens: the trophy cabinet, the numbers, and what you know
 * about the person. Your own drivers are an open book. Anyone else is half hidden until you send scouts (RESEARCH).
 */

type Kind = "driver" | "team" | "staff" | "prospect";
interface Ctx {
  open: (kind: Kind, id: string) => void;
}
const ProfileCtx = createContext<Ctx>({ open: () => {} });

export function ProfileHost({ s, d, children }: { s: CareerState; d: Dispatch; children: ReactNode }) {
  const [at, setAt] = useState<{ kind: Kind; id: string }[]>([]);
  const top = at[at.length - 1];
  return (
    <ProfileCtx.Provider value={{ open: (kind, id) => setAt((a) => [...a, { kind, id }]) }}>
      {children}
      {top && (
        <div className="prof-back" onClick={() => setAt([])} role="presentation">
          <div className="prof" role="dialog" aria-modal="true" aria-label="Profile" onClick={(e) => e.stopPropagation()}>
            <div className="prof-bar">
              {at.length > 1 && <button className="tiny" onClick={() => setAt((a) => a.slice(0, -1))}>{"< BACK"}</button>}
              <span className="grow" />
              <button className="tiny" onClick={() => setAt([])}>CLOSE</button>
            </div>
            {top.kind === "driver" ? <DriverProfile s={s} d={d} id={top.id} /> : top.kind === "staff" ? <StaffProfile s={s} id={top.id} /> : top.kind === "prospect" ? <ProspectProfile s={s} id={top.id} /> : <TeamProfile s={s} d={d} id={top.id} />}
          </div>
        </div>
      )}
    </ProfileCtx.Provider>
  );
}

/** A name that opens its profile. */
export function PLink({ kind, id, children, className }: { kind: Kind; id: string; children: ReactNode; className?: string }) {
  const c = useContext(ProfileCtx);
  return (
    <button type="button" className={`plink ${className ?? ""}`} onClick={(e) => { e.stopPropagation(); c.open(kind, id); }}>
      {children}
    </button>
  );
}

/** Turns the names of real people and teams in a line of text into profile links. */
export function Linked({ s, text }: { s: CareerState; text: string }) {
  const names = new Map<string, { kind: Kind; id: string }>();
  for (const d of Object.values(s.drivers)) if (d.spec.name.length > 4) names.set(d.spec.name, { kind: "driver", id: d.id });
  for (const st of Object.values(s.staff)) if (st.name.length > 4 && !names.has(st.name)) names.set(st.name, { kind: "staff", id: st.id });
  for (const pr of Object.values(s.academy.prospects)) if (pr.status !== "gone" && pr.name.length > 4 && !names.has(pr.name)) names.set(pr.name, { kind: "prospect", id: pr.id });
  for (const tm of TEAMS) if (tm.name.length > 4) names.set(tm.name, { kind: "team", id: tm.id });
  const keys = [...names.keys()].sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!keys.length) return <>{text}</>;
  const parts = text.split(new RegExp(`(${keys.join("|")})`));
  return (
    <>
      {parts.map((p, i) => {
        const hit = names.get(p);
        return hit ? <PLink key={i} kind={hit.kind} id={hit.id}>{p}</PLink> : <span key={i}>{p}</span>;
      })}
    </>
  );
}

/** A little pixel cup. */
export function Cup({ tone }: { tone: "gold" | "silver" | "bronze" | "wcc" }) {
  const col = tone === "gold" ? "#f5c542" : tone === "silver" ? "#cfd6e0" : tone === "bronze" ? "#c98a4b" : "#7fe0ff";
  const dk = tone === "gold" ? "#b8861b" : tone === "silver" ? "#8c96a6" : tone === "bronze" ? "#8a5a2b" : "#3a8fb0";
  return (
    <svg width="22" height="24" viewBox="0 0 11 12" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="2" y="0" width="7" height="1" fill={dk} />
      <rect x="2" y="1" width="7" height="4" fill={col} />
      <rect x="0" y="1" width="2" height="1" fill={col} />
      <rect x="0" y="2" width="1" height="2" fill={col} />
      <rect x="1" y="4" width="1" height="1" fill={col} />
      <rect x="9" y="1" width="2" height="1" fill={col} />
      <rect x="10" y="2" width="1" height="2" fill={col} />
      <rect x="9" y="4" width="1" height="1" fill={col} />
      <rect x="3" y="5" width="5" height="1" fill={col} />
      <rect x="4" y="6" width="3" height="3" fill={dk} />
      <rect x="2" y="9" width="7" height="1" fill={col} />
      <rect x="1" y="10" width="9" height="2" fill={dk} />
      <rect x="3" y="2" width="1" height="2" fill="#ffffff" opacity="0.6" />
    </svg>
  );
}

function Shelf({ tone, n, label, years }: { tone: "gold" | "silver" | "bronze" | "wcc"; n: number; label: string; years?: number[] }) {
  const show = Math.min(n, 14);
  return (
    <div className="shelf">
      <div className="shelf-row">
        {n === 0 ? <span className="dim small">None yet</span> : Array.from({ length: show }, (_, i) => <Cup key={i} tone={tone} />)}
        {n > show && <b className="more">+{n - show}</b>}
      </div>
      <div className="shelf-cap"><b>{n}</b> {label}</div>
      {years && years.length > 0 && <div className="shelf-years dim small">{years.join(", ")}</div>}
    </div>
  );
}

const WORD = (v: number) => (v >= 0.8 ? "Excellent" : v >= 0.62 ? "Strong" : v >= 0.45 ? "Solid" : v >= 0.3 ? "Weak" : "Poor");
const SECRET = <span className="dim small">Not researched</span>;

function trait(v: number, lo: string, mid: string, hi: string) {
  return v >= 0.66 ? hi : v <= 0.34 ? lo : mid;
}

export function knowOf(s: CareerState, x: DriverState): number {
  if (x.teamId === s.teamId) return 1;
  return Math.min(1, s.driverKnow?.[x.id] ?? 0.2);
}

/** Football Manager style: every racing attribute from 1 to 20, as a range until you know him well. */
function AttributePanel({ x, know }: { x: DriverState; know: number }) {
  const a = attributesOf(x);
  return (
    <section className="panel">
      <h4>ATTRIBUTES {know < 0.95 && <span className="dim small">(ranges narrow as you research him)</span>}</h4>
      <div className="attr-grid">
        {ATTR_GROUPS.map((g) => (
          <div key={g.title} className="attr-col">
            <h5 className="small">{g.title}</h5>
            {g.keys.map((k) => {
              const r = readAttr(a[k], know, x.id, k);
              const col = r.shown >= 15 ? "#4fd08a" : r.shown >= 10 ? "#f5c542" : "#ff7a5a";
              return (
                <div key={k} className="attr-row" title={ATTR_TIP[k]}>
                  <span>{ATTR_LABEL[k]}</span>
                  <i className="attr-bar"><u style={{ width: `${(r.shown / 20) * 100}%`, background: col }} />{r.lo !== r.hi && <s style={{ left: `${((r.lo - 1) / 20) * 100}%`, width: `${((r.hi - r.lo + 1) / 20) * 100}%` }} />}</i>
                  <b>{r.lo === r.hi ? r.shown : `${r.lo}-${r.hi}`}</b>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

export function DriverProfile({ s, d, id }: { s: CareerState; d: Dispatch; id: string }) {
  const x = s.drivers[id];
  if (!x) return <p>Unknown driver.</p>;
  const mine = x.teamId === s.teamId;
  const know = knowOf(s, x);
  const rec = x.rec;
  const team = teamOf(x.teamId);
  const mate = x.teamId ? driversOf(s, x.teamId).find((m) => m.id !== x.id) : undefined;
  const st = ensureStatus(x);
  const ps = (x.spec.psyche ?? {}) as unknown as Record<string, number>;
  const ach = achievementsFor(s, { driverId: id, minTier: 2 }).slice(0, 12);
  const wins = rec?.p1 ?? x.wins;
  const pods = rec ? rec.p1 + rec.p2 + rec.p3 : x.podiums;
  const gp = (k: "pole" | "win" | "podium") => rec?.firsts?.[k];
  const wdc = rec?.wdc ?? [];
  return (
    <div className="prof-body">
      <header className="prof-head" style={{ ["--team" as string]: hex(team?.color ?? 0x888888) }}>
        <DriverPortrait code={x.spec.code} teamColor={hex(team?.color ?? 0x888888)} seed={x.id} size={72} />
        <div>
          <h2>{x.spec.name} <span className="dim">#{x.spec.number}</span></h2>
          <p className="dim">{team ? team.name : x.retired ? "Retired" : "Free agent"}{x.spec.nat ? ` | ${x.spec.nat}` : ""} | age {ageOf(s, x)}</p>
          {x.teamId && <p><em className="tag">{ROLE_WORD[x.role]}</em> {mate && <span className="dim small">next to {mate.spec.name}</span>}</p>}
        </div>
      </header>

      <section className="panel">
        <h4>TROPHY CABINET</h4>
        <div className="cabinet">
          <Shelf tone="gold" n={wdc.length} label="World Championship" years={wdc} />
          <Shelf tone="gold" n={rec?.p1 ?? x.wins} label="wins" />
          <Shelf tone="silver" n={rec?.p2 ?? 0} label="second places" />
          <Shelf tone="bronze" n={rec?.p3 ?? Math.max(0, pods - wins)} label="third places" />
        </div>
        <p className="dim small">Grand Prix podiums only. The sprint, poles and fastest laps are in the numbers below.</p>
      </section>

      <div className="c-cols">
        <section className="panel">
          <h4>CAREER NUMBERS</h4>
          <ul className="statgrid">
            <li><span>Starts</span><b>{x.starts}</b></li>
            <li><span>Wins</span><b>{wins}</b></li>
            <li><span>Podiums</span><b>{pods}</b></li>
            <li><span>Poles</span><b>{rec?.poles ?? 0}</b></li>
            <li><span>Fastest laps</span><b>{rec?.fl ?? 0}</b></li>
            <li><span>Sprint wins</span><b>{rec?.sprintWins ?? 0}</b></li>
            <li><span>Sprint podiums</span><b>{rec?.sprintPodiums ?? 0}</b></li>
            <li><span>Retirements</span><b>{rec?.dnfs ?? 0}</b></li>
            <li><span>Titles</span><b>{wdc.length}</b></li>
            <li><span>Win rate</span><b>{x.starts ? Math.round((wins / x.starts) * 100) : 0}%</b></li>
          </ul>
          {(gp("win") || gp("pole") || gp("podium")) && (
            <p className="dim small">First podium: {gp("podium") ?? "before your career"}. First win: {gp("win") ?? "before your career"}. First pole: {gp("pole") ?? "before your career"}.</p>
          )}
        </section>

        <section className="panel">
          <h4>WHAT YOU KNOW {!mine && <span className="dim small">({Math.round(know * 100)}%)</span>}</h4>
          <dl className="skills">
            <dt>Pace</dt><dd>{know >= 0.3 ? `${paceWord(s, x)}` : SECRET}</dd>
            <dt>Consistency</dt><dd>{know >= 0.45 ? <><Bar v={x.spec.consistency} /> <span className="small">{WORD(x.spec.consistency)}</span></> : SECRET}</dd>
            <dt>Race IQ</dt><dd>{know >= 0.45 ? <><Bar v={raceIQ(x.spec, s.year)} /> <span className="small">{iqWord(raceIQ(x.spec, s.year))}</span></> : SECRET}</dd>
            <dt>Tyre care</dt><dd>{know >= 0.45 ? <><Bar v={x.spec.tyreMgmt} /> <span className="small">{WORD(x.spec.tyreMgmt)}</span></> : SECRET}</dd>
            <dt>Wet weather</dt><dd>{know >= 0.6 ? <><Bar v={x.spec.wet ?? 0.5} /> <span className="small">{WORD(x.spec.wet ?? 0.5)}</span></> : SECRET}</dd>
            <dt>Aggression</dt><dd>{know >= 0.6 ? <><Bar v={x.spec.aggression} /> <span className="small">{trait(x.spec.aggression, "Cautious", "Balanced", "Hard racer")}</span></> : SECRET}</dd>
            <dt>Potential</dt><dd>{know >= 0.85 ? <><Bar v={x.potential} /> <span className="small">{WORD(x.potential)}</span></> : SECRET}</dd>
            <dt>Stature</dt><dd>{know >= 0.3 ? <><Bar v={statureOf(x)} /> <span className="small">{ROLE_WORD[expectedRole(x, mate)].toLowerCase()} material</span></> : SECRET}</dd>
          </dl>
          {!mine && know < 0.95 && (
            <button className="tiny" onClick={() => d({ type: "researchDriver", driverId: id })} title="Costs $0.2m. Scouts watch him, talk to people who know him.">
              RESEARCH ($0.2m)
            </button>
          )}
        </section>
      </div>

      <AttributePanel x={x} know={know} />

      <div className="c-cols">
        <section className="panel">
          <h4>CHARACTER</h4>
          {know >= 0.75 ? (
            <ul className="traits">
              <li>Ego <b>{trait(ps.ego ?? 0.5, "Easy going", "Normal", "Needs to be the leader")}</b></li>
              <li>Obedience <b>{trait(ps.obedience ?? 0.5, "Does his own thing", "Listens", "Does as he is told")}</b></li>
              <li>Temper <b>{trait(ps.volatility ?? 0.5, "Calm", "Even", "Volatile")}</b></li>
              <li>Patience <b>{trait(ps.patience ?? 0.5, "Short", "Fair", "Long")}</b></li>
              <li>Loyalty <b>{trait(ps.loyalty ?? 0.5, "Looks around", "Fair", "Devoted")}</b></li>
              <li>Self belief <b>{trait(ps.selfBelief ?? 0.5, "Doubts himself", "Level", "Total")}</b></li>
              <li>Talk <b>{trait(ps.talkative ?? 0.5, "Quiet", "Normal", "Chatty")}</b></li>
            </ul>
          ) : know >= 0.4 ? (
            <p className="small">{trait(ps.ego ?? 0.5, "Seems easy going.", "Hard to read.", "Clearly wants to be the leader.")} Research him more to see the rest.</p>
          ) : SECRET}
        </section>

        <section className="panel">
          <h4>{mine ? "WHERE HE STANDS WITH YOU" : "CONTRACT"}</h4>
          {mine || know >= 0.5 ? (
            <ul className="traits">
              <li>Salary <b>{fmtMoney(x.salary)}</b></li>
              <li>Contract to <b>{x.endYear}</b></li>
              {mine && (
                <>
                  <li>Morale <b><Bar v={x.morale} /></b></li>
                  <li>Trust in you <b><Bar v={x.trust} /></b></li>
                  <li>Mood <b>{G_STAGE[x.gStage] ?? "Content"}</b></li>
                  <li>Expects to be <b>{ROLE_WORD[st.expects]}</b>{st.expects !== x.role && <em className="tag bad"> you say {ROLE_WORD[x.role]}</em>}</li>
                </>
              )}
            </ul>
          ) : SECRET}
          {mine && (
            <>
              <h5 className="small">What is on his mind</h5>
              {Object.entries(x.causes).filter(([k, v]) => k !== "noResign" && Math.abs(v) >= 0.02).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => (
                <p key={k} className={`small ${v < 0 ? "good" : ""}`}>{v < 0 ? "Helping: " : ""}{CAUSE_LABEL[k] ?? k}</p>
              ))}
              {st.slights.slice(-3).reverse().map((sl, i) => <p key={i} className="small bad">He remembers: {sl.text}</p>)}
              <button className="tiny" onClick={() => d({ type: "meeting", driverId: id })}>TALK TO HIM</button>
            </>
          )}
        </section>
      </div>

      <section className="panel">
        <h4>CAREER HIGHLIGHTS</h4>
        {ach.length ? (
          <ul className="achlist">
            {ach.map((a) => <li key={a.id} className={`t${a.tier}`}><span className="dim">{a.year} R{a.round}</span> {a.text}</li>)}
          </ul>
        ) : <p className="dim small">Nothing recorded since the career began. Real records from before are in the cabinet.</p>}
      </section>
    </div>
  );
}

export function TeamProfile({ s, d, id }: { s: CareerState; d: Dispatch; id: string }) {
  const t = s.teams[id];
  const base = teamOf(id);
  if (!t || !base) return <p>Unknown team.</p>;
  const mine = id === s.teamId;
  const wcc = t.wcc ?? REAL_WCC[id] ?? [];
  const ds = driversOf(s, id);
  const ach = achievementsFor(s, { teamId: id, minTier: 2 }).slice(0, 12);
  const pts = s.standings.teams[id] ?? 0;
  const rank = Object.entries(s.standings.teams).sort((a, b) => b[1] - a[1]).findIndex(([k]) => k === id) + 1;
  const wins = Object.values(s.drivers).reduce((n, x) => n + (x.teamId === id ? 0 : 0), 0);
  void wins;
  return (
    <div className="prof-body">
      <header className="prof-head" style={{ ["--team" as string]: hex(teamColour(s, id)) }}>
        <i className="chip big" style={{ background: hex(teamColour(s, id)) }} />
        <div>
          <h2>{teamLabel(s, id)}</h2>
          <p className="dim">{base.full ?? base.name}{base.engine ? ` | ${base.engine} power` : ""}</p>
          <p className="small">{rank ? `P${rank} in the constructors with ${pts} points` : ""}</p>
        </div>
      </header>
      <section className="panel">
        <h4>TROPHY CABINET</h4>
        <div className="cabinet">
          <Shelf tone="wcc" n={wcc.length} label="Constructors' Championships" years={wcc} />
        </div>
        <p className="dim small">Constructors' titles only. Race wins belong to the drivers.</p>
      </section>
      <section className="panel">
        <h4>DRIVERS</h4>
        <ul className="traits">
          {ds.map((x) => (
            <li key={x.id}><PLink kind="driver" id={x.id}>{x.spec.name}</PLink> <b>{ROLE_WORD[x.role]}</b></li>
          ))}
        </ul>
      </section>
      <section className="panel">
        <h4>KEY PEOPLE</h4>
        <ul className="traits">
          {teamStaff(s, id).filter((x) => ["td", "designer", "aero", "power", "data", "strategy"].includes(x.role)).map((x) => (
            <li key={x.id}><PLink kind="staff" id={x.id}>{x.name}</PLink> <b>{STAFF_LABEL[x.role]}</b></li>
          ))}
        </ul>
      </section>
      {mine && (
        <section className="panel">
          <h4>PIT CREW</h4>
          <CrewPanel s={s} d={d} />
        </section>
      )}
      <section className="panel">
        <h4>HIGHLIGHTS</h4>
        {ach.length ? (
          <ul className="achlist">{ach.map((a) => <li key={a.id} className={`t${a.tier}`}><span className="dim">{a.year} R{a.round}</span> {a.text}</li>)}</ul>
        ) : <p className="dim small">Nothing recorded yet this career.</p>}
      </section>
    </div>
  );
}

/** A staff member's page: CV, what he is known for, and what you know about his skill. */
const SERIES_NAME: Record<string, string> = { f4: "Formula 4", f3: "Formula 3", f2: "Formula 2" };

/** A junior driver: what the scouts have seen so far, shown as ranges that tighten with every look. */
export function ProspectProfile({ s, id }: { s: CareerState; id: string }) {
  const p = s.academy.prospects[id];
  if (!p) return <p>Unknown driver.</p>;
  const mine = p.owner === s.teamId;
  const rep = reportOf(s, p);
  return (
    <div className="prof-body">
      <header className="prof-head">
        <DriverPortrait code={p.code} teamColor="#8899aa" seed={p.id} size={72} />
        <div>
          <h2>{p.name}</h2>
          <p className="dim">{SERIES_NAME[p.series] ?? p.series} | {p.nat} | born {p.born} | {p.status === "academy" ? (mine ? "in your academy" : "in an academy") : p.status === "free" ? "unsigned" : p.status}</p>
        </div>
      </header>
      <div className="c-cols">
        <section className="panel">
          <h4>THIS SEASON</h4>
          <p className="small">{p.pts} points, {p.wins} wins in {SERIES_NAME[p.series] ?? p.series}.</p>
          <p className="small dim">{Math.round(Math.min(1, p.seen) * 100)}% of what the scouts could learn about him is known.</p>
        </section>
        <section className="panel">
          <h4>WHAT THE SCOUTS SEE</h4>
          <ul className="traits">
            {ATTRS.map((k) => {
              const r = rep.attrs[k];
              const lo = Math.round(1 + r.lo * 19), hi = Math.round(1 + r.hi * 19);
              return <li key={k}>{PATTR_LABEL[k]} <b>{lo === hi ? lo : `${lo} to ${hi}`}</b></li>;
            })}
          </ul>
          <p className="small dim">{rep.styleNote}</p>
        </section>
      </div>
    </div>
  );
}

export function StaffProfile({ s, id }: { s: CareerState; id: string }) {
  const st = s.staff[id];
  if (!st) return <p>Unknown person.</p>;
  const mine = st.teamId === s.teamId;
  const team = teamOf(st.teamId);
  const cv = cvOf(s, st);
  const know = mine ? 1 : st.known;
  const lo = Math.max(0, Math.round(st.skill - (1 - know) * 18));
  const hi = Math.min(100, Math.round(st.skill + (1 - know) * 18));
  return (
    <div className="prof-body">
      <header className="prof-head" style={{ ["--team" as string]: hex(team?.color ?? 0x888888) }}>
        <DriverPortrait code={st.name.slice(0, 3).toUpperCase()} teamColor={hex(team?.color ?? 0x888888)} seed={st.id} size={72} />
        <div>
          <h2>{st.name}</h2>
          <p className="dim">{STAFF_LABEL[st.role]}{st.driverId && s.drivers[st.driverId] ? ` for ${s.drivers[st.driverId]!.spec.code}` : ""} | {team ? <PLink kind="team" id={team.id}>{team.name}</PLink> : "no team"} | age {st.age}</p>
        </div>
      </header>
      <div className="c-cols">
        <section className="panel">
          <h4>CV</h4>
          <p className="small">Came into motorsport through {cv.origin}, around {cv.started}.</p>
          <ul className="traits">
            {cv.lines.map((l, i) => <li key={i}>{l.from} to {l.to ?? "now"} <b>{l.team}</b> <span className="dim">{l.role}</span></li>)}
          </ul>
          <p className="small">Known for {cv.known.join(" and ")}.</p>
        </section>
        {mine && (() => {
          const log = (s.teams[s.teamId].dev?.log ?? []).filter((e) => e.staffId === id).slice(-8).reverse();
          const r = s.teams[s.teamId].dev?.rec[id];
          if (!log.length && !r) return null;
          return (
            <section className="panel">
              <h4>UNDER YOUR DIRECTION</h4>
              {r && <p className="small">Backed {r.backed}, overruled {r.overruled}, scrapped {r.scrapped}, heard {r.heard}. Parts landed {r.landed}, missed {r.missed}.{st.intern ? ` Trainee, skill ${Math.round(st.skill)}.` : ""}</p>}
              <ul className="traits">{log.map((e, i) => <li key={i}><span className="dim">{fmtDay(e.day)}</span> {e.text}</li>)}</ul>
            </section>
          );
        })()}
        <section className="panel">
          <h4>WHAT YOU KNOW {!mine && <span className="dim small">({Math.round(know * 100)}%)</span>}</h4>
          <ul className="traits">
            <li>Skill <b>{lo === hi ? lo : `${lo} to ${hi}`}</b></li>
            <li>Mood <b><Bar v={st.mood} /></b></li>
            <li>Contract to <b>{st.endYear}</b></li>
            <li>Salary <b>{fmtMoney(st.salary)}</b></li>
            {st.traits.length > 0 && <li>Traits <b>{st.traits.join(", ")}</b></li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
