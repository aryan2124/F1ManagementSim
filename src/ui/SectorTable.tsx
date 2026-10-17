import type { LiveSession, LiveSim } from "../game/live";
import { sessionRows } from "./sectorRows";
import type { SessionRow } from "./sectorRows";
import { SECTOR_COLORS } from "./colors";

const fmt3 = (t: number) => (isFinite(t) && t > 0 ? t.toFixed(3) : "--.---");

function lapStr(t: number) {
  if (!isFinite(t) || t <= 0) return "-:--.---";
  const m = Math.floor(t / 60);
  return `${m}:${(t - m * 60).toFixed(3).padStart(6, "0")}`;
}

/**
 * Exact sector times for every driver. Each sector shows the time and the gap to the best sector anyone has set,
 * coloured like the real timing screens: purple is the session best, green a personal best, yellow slower.
 */
export function SectorTable({
  rows,
  best,
  mode,
  onPick,
  followId,
}: {
  rows: SessionRow[];
  best: [number, number, number];
  mode: "last" | "best";
  onPick: (id: string) => void;
  followId: string;
}) {
  const ideal = best.reduce((a, b) => a + b, 0);
  return (
    <div className="sectable">
      <div className="st-head">
        <span>P</span>
        <span>DRIVER</span>
        {[1, 2, 3].map((k) => (
          <span key={k} className="num">
            S{k}
          </span>
        ))}
        <span className="num">LAP</span>
        <span className="num">TO IDEAL</span>
      </div>
      <div className="st-best">
        <span />
        <span>BEST SECTORS</span>
        {best.map((b, k) => (
          <span key={k} className="num purple">
            {fmt3(b)}
          </span>
        ))}
        <span className="num purple">{lapStr(ideal)}</span>
        <span />
      </div>
      {rows.map((r) => {
        const secs = mode === "last" ? r.last : r.bestSecs;
        const lap = mode === "last" ? r.lapLast : r.lapBest;
        const total = secs.every((s) => isFinite(s) && s > 0) ? secs[0] + secs[1] + secs[2] : Infinity;
        return (
          <div key={r.id} className={`st-row ${r.human ? "mine" : ""} ${followId === r.id ? "follow" : ""} ${r.out ? "out" : ""}`} onClick={() => onPick(r.id)} style={{ ["--team" as string]: r.color }}>
            <span className="p">{r.position}</span>
            <span className="who">
              <i className="chip" />
              {r.code}
            </span>
            {[0, 1, 2].map((k) => {
              const t = secs[k];
              const ok = isFinite(t) && t > 0 && isFinite(best[k]);
              const d = ok ? t - best[k] : NaN;
              const col = mode === "last" ? r.colors[k] : t <= best[k] + 1e-6 ? 3 : 2;
              return (
                <span key={k} className="num cell" style={{ color: ok ? SECTOR_COLORS[col] ?? "#fff" : undefined }}>
                  {fmt3(t)}
                  <em>{ok && d > 0.0005 ? `+${d.toFixed(3)}` : ok ? "BEST" : ""}</em>
                </span>
              );
            })}
            <span className="num">{lapStr(lap)}</span>
            <span className="num dim">{isFinite(total) && isFinite(ideal) ? `+${(total - ideal).toFixed(3)}` : ""}</span>
          </div>
        );
      })}
    </div>
  );
}


export function SectorsView({ session, mode }: { session: LiveSession<LiveSim>; mode: "last" | "best" }) {
  const { rows, best } = sessionRows(session.sim);
  return <SectorTable rows={rows} best={best} mode={mode} followId={session.followId} onPick={(id) => (session.followId = id)} />;
}
