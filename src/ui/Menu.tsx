import { useEffect, useMemo, useRef, useState } from "react";
import { TEAMS, DRIVERS } from "../game/data";
import { CALENDAR_2026, CIRCUITS, circuitMeta, scheduledLaps } from "../game/circuits";
import { CIRCUIT_GEO } from "../game/circuitGeo.generated";
import { DISTANCES, type WeekendSettings } from "../game/setup";
import { fillTier, TIER_LABEL, TIER_SEATS, type Tier } from "../game/people";
import { LeaguePanel } from "./LeaguePanel";

const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
const pct = (v: number) => Math.round(Math.max(0, Math.min(1, (v - 0.94) / 0.06)) * 100);

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <div className="bar">
        <i style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

/** The circuit's real outline, drawn from its GPS centreline. */
function Outline({ circuitId }: { circuitId: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const geo = CIRCUIT_GEO[circuitMeta(circuitId).geoId];
    const W = canvas.width;
    const H = canvas.height;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of geo.pts) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const pad = 14;
    const k = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxY - minY));
    const ox = (W - (maxX - minX) * k) / 2 - minX * k;
    const oy = (H - (maxY - minY) * k) / 2 - minY * k;
    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const draw = (w: number, col: string) => {
      ctx.beginPath();
      geo.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * k + ox, y * k + oy) : ctx.moveTo(x * k + ox, y * k + oy)));
      ctx.closePath();
      ctx.lineWidth = w;
      ctx.strokeStyle = col;
      ctx.stroke();
    };
    draw(9, "#0b0814");
    draw(5, "#8a7fb8");
    draw(1.5, "#f4e9d0");
    const [sx, sy] = geo.pts[0];
    ctx.fillStyle = "#ff3b5c";
    ctx.fillRect(Math.round(sx * k + ox) - 3, Math.round(sy * k + oy) - 3, 7, 7);
  }, [circuitId]);
  return <canvas className="outline" ref={ref} width={300} height={170} />;
}

export function Menu({
  settings,
  onChange,
  onStart,
  onBack,
}: {
  settings: WeekendSettings;
  onChange: (s: WeekendSettings) => void;
  onStart: (playQuali: boolean) => void;
  onBack: () => void;
}) {
  const [classics, setClassics] = useState(false);
  const [ladder, setLadder] = useState<Tier | null>(null);
  const meta = circuitMeta(settings.circuitId);
  const geo = CIRCUIT_GEO[meta.geoId];
  const list = classics ? CIRCUITS.filter((c) => c.classic) : CALENDAR_2026;
  const tierPeople = useMemo(() => (ladder ? fillTier(ladder, TIER_SEATS[ladder]) : []), [ladder]);

  return (
    <div className="screen menu">
      <header className="hero small">
        <h2>SIMULATE A RACE WEEKEND</h2>
        <p>PICK A TEAM AND A CIRCUIT. ONE WEEKEND, NO CAREER.</p>
        <button className="tiny" onClick={onBack}>{"< BACK"}</button>
      </header>

      <div className="menu-grid">
        <div className="maincol">
          <section className="panel">
            <h3>1. CHOOSE YOUR TEAM</h3>
            <div className="teams">
              {TEAMS.map((t) => (
                <button
                  key={t.id}
                  className={`team-card ${settings.teamId === t.id ? "selected" : ""}`}
                  style={{ ["--team" as string]: hex(t.color) }}
                  onClick={() => onChange({ ...settings, teamId: t.id, field: settings.field ? [...new Set([...settings.field, ...DRIVERS[t.id].map((d) => d.id)])] : undefined })}
                >
                  <div className="stripe" />
                  <div className="tname">{t.name}</div>
                  <div className="tdrivers">{DRIVERS[t.id].map((d) => d.name).join(" / ")}</div>
                  <Stat label="AERO" value={pct(t.aero)} />
                  <Stat label="POWER" value={pct(t.power)} />
                  <Stat label="RELIABLE" value={pct(t.reliability)} />
                  <Stat label="PIT CREW" value={Math.round(t.pitCrew * 100)} />
                </button>
              ))}
            </div>
          </section>

          <section className="panel">
            <h3>TEST FIELD <span className="dim small">(untick teams and drivers to run a smaller weekend)</span></h3>
            {(() => {
              const all = TEAMS.flatMap((t) => DRIVERS[t.id].map((d) => d.id));
              const field = settings.field ?? all;
              const mine = DRIVERS[settings.teamId].map((d) => d.id);
              const set = (f: string[]) => {
                // always at least two cars, and at least one of your own
                const keep = new Set(f);
                if (!mine.some((id) => keep.has(id))) keep.add(mine[0]);
                const next = all.filter((id) => keep.has(id));
                if (next.length < 2) return;
                onChange({ ...settings, field: next.length === all.length ? undefined : next });
              };
              const toggle = (id: string) => set(field.includes(id) ? field.filter((x) => x !== id) : [...field, id]);
              return (
                <>
                  <div className="seg">
                    <button onClick={() => onChange({ ...settings, field: undefined })}>ALL {all.length}</button>
                    <button onClick={() => set(mine)}>ONLY MY TEAM</button>
                    <button onClick={() => set([mine[0], ...all.filter((id) => !mine.includes(id)).slice(0, 1)])}>TWO CARS</button>
                  </div>
                  <div className="fieldlist">
                    {TEAMS.map((t) => {
                      const ids = DRIVERS[t.id].map((d) => d.id);
                      const on = ids.filter((id) => field.includes(id));
                      return (
                        <div key={t.id} className="fieldrow" style={{ ["--team" as string]: hex(t.color) }}>
                          <label className="set-check small">
                            <input type="checkbox" checked={on.length === ids.length} ref={(el) => { if (el) el.indeterminate = on.length > 0 && on.length < ids.length; }} onChange={() => set(on.length === ids.length ? field.filter((id) => !ids.includes(id)) : [...new Set([...field, ...ids])])} />
                            <b>{t.name}</b>
                          </label>
                          {DRIVERS[t.id].map((d) => (
                            <label key={d.id} className="set-check small">
                              <input type="checkbox" checked={field.includes(d.id)} onChange={() => toggle(d.id)} /> {d.name}
                            </label>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                  <p className="small dim">{field.length} car{field.length === 1 ? "" : "s"} on the grid. Qualifying cut-offs scale to the field.</p>
                </>
              );
            })()}
          </section>

          <section className="panel">
            <h3>2. CHOOSE THE GRAND PRIX</h3>
            <div className="seg cal-toggle">
              <button className={!classics ? "on" : ""} onClick={() => setClassics(false)}>
                2026 CALENDAR
              </button>
              <button className={classics ? "on" : ""} onClick={() => setClassics(true)}>
                CLASSIC CIRCUITS
              </button>
            </div>
            <div className="calendar">
              {list.map((c) => (
                <button key={c.id} className={`cal-row ${settings.circuitId === c.id ? "selected" : ""}`} onClick={() => onChange({ ...settings, circuitId: c.id })}>
                  <span className="rd">{c.round ? `R${c.round}` : "--"}</span>
                  <span className="gpn">{c.short}</span>
                  <span className="dt">{c.date ?? c.country}</span>
                  {c.sprint && <em className="tag">SPRINT</em>}
                </button>
              ))}
            </div>
          </section>

          <section className="panel">
            <h3>THE LADDER</h3>
            <p className="dim">Real drivers first at every level. Made-up names only appear once the real entry list runs out.</p>
            <div className="seg tiers">
              {(Object.keys(TIER_LABEL) as Tier[]).map((t) => (
                <button key={t} className={ladder === t ? "on" : ""} onClick={() => setLadder(ladder === t ? null : t)}>
                  {t}
                </button>
              ))}
            </div>
            {ladder && (
              <div className="ladder">
                <h4>{TIER_LABEL[ladder]}</h4>
                <ol>
                  {tierPeople.map((p) => (
                    <li key={p.id} className={p.fictional ? "fake" : ""}>
                      <b>{p.code}</b> {p.name} <span className="dim">{p.nat}{p.fictional ? " | FICTIONAL" : ""}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </section>
        </div>

        <aside className="side">
          <section className="panel">
            <h3>3. RACE WEEKEND</h3>
            <div className="circuit-card">
              <Outline circuitId={settings.circuitId} />
              <b>{meta.gp}</b>
              <span className="dim">
                {geo.name}, {geo.location} | {(geo.length / 1000).toFixed(3)} km | {scheduledLaps(meta)} laps
              </span>
            </div>
            <div className="field">
              <span>RACE DISTANCE</span>
              <div className="seg col">
                {DISTANCES.map((d) => (
                  <button key={d.id} className={settings.distance === d.id ? "on" : ""} onClick={() => onChange({ ...settings, distance: d.id })} title={d.note}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span>WEATHER</span>
              <div className="seg">
                {(["random", "off"] as const).map((m) => (
                  <button key={m} className={(settings.weather ?? "random") === m ? "on" : ""} onClick={() => onChange({ ...settings, weather: m })}>
                    {m === "random" ? "RANDOM" : "ALWAYS DRY"}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span>AI PIT WALLS</span>
              <div className="seg">
                {([0, 1, 2] as const).map((d) => (
                  <button key={d} className={(settings.difficulty ?? 1) === d ? "on" : ""} onClick={() => onChange({ ...settings, difficulty: d })}>
                    {["ROOKIE", "PRO", "LEGEND"][d]}
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              <span>SEED (SAME SEED = SAME WEEKEND)</span>
              <div className="seedrow">
                <input
                  value={settings.seed}
                  inputMode="numeric"
                  onChange={(e) => onChange({ ...settings, seed: Number(e.target.value.replace(/\D/g, "")) || 0 })}
                />
                <button className="tiny" onClick={() => onChange({ ...settings, seed: Math.floor(Math.random() * 99999) })}>
                  RANDOM
                </button>
              </div>
            </label>
            <button className="btn primary big" onClick={() => onStart(true)}>
              GO TO QUALIFYING
            </button>
            <button className="btn" onClick={() => onStart(false)}>
              SKIP TO THE GRID
            </button>
          </section>
          <LeaguePanel />
        </aside>
      </div>
    </div>
  );
}
