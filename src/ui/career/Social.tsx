import { useState } from "react";
import { ARC_LABEL, arcTitle, liveArcs, postAge, postsAbout, socialOf, type Post } from "../../career/social";
import { PLink } from "./Profile";
import type { CareerState } from "../../career/types";
import { Bar } from "./common";

const PERSONA: Record<Post["persona"], string> = { fan: "FAN", rival: "RIVAL FAN", press: "PRESS", pundit: "PUNDIT", insider: "INSIDER", meme: "MEME", team: "TEAM", driver: "DRIVER" };

/** The paddock's social feed: what people are saying, and the storylines it is built from. */
export function Social({ s }: { s: CareerState }) {
  const [filter, setFilter] = useState<string>("all");
  const arcs = liveArcs(s);
  const all = postsAbout(s, filter).slice(0, 80);
  const byId = new Map(socialOf(s).posts.map((p) => [p.id, p]));
  const top = all.filter((p) => !p.replyTo);
  const replies = (id: number) => all.filter((p) => p.replyTo === id).reverse();
  const mood = socialOf(s).mood;
  return (
    <div className="c-cols social">
      <section className="panel">
        <h3>THE FEED</h3>
        <nav className="sub small">
          {([["all", "ALL"], ["mine", "MY TEAM"], ["storyline", "STORYLINES"]] as const).map(([k, l]) => (
            <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>
          ))}
          {filter !== "all" && filter !== "mine" && filter !== "storyline" && <button className="on" onClick={() => setFilter("all")}>STORY (clear)</button>}
        </nav>
        {top.length === 0 && <p className="dim">Quiet for now. Posts appear after each race and as storylines build.</p>}
        <ul className="feed">
          {top.map((p) => (
            <li key={p.id} className={`post p-${p.persona} ${p.mine ? "mine" : ""}`}>
              <header>
                <b>{p.who}</b> <span className="dim small">{p.handle}</span> <em className="tag">{PERSONA[p.persona]}</em>
                <span className="dim small right">{postAge(s, p)}</span>
              </header>
              <p>{p.text}</p>
              <footer className="dim small">
                {p.driver && s.drivers[p.driver] && <PLink kind="driver" id={p.driver}>{s.drivers[p.driver]!.spec.name}</PLink>}
                <span>{p.likes.toLocaleString()} likes</span>
                <span>{p.shares.toLocaleString()} shares</span>
                {p.arc && <button className="link" onClick={() => setFilter(p.arc!)}>follow the story</button>}
              </footer>
              {replies(p.id).map((r) => (
                <div key={r.id} className={`reply p-${r.persona}`}>
                  <b>{r.who}</b> <span className="dim small">{r.handle}</span>
                  <p>{r.text}</p>
                </div>
              ))}
            </li>
          ))}
        </ul>
        {byId.size === 0 && null}
      </section>
      <section className="panel">
        <h3>STORYLINES</h3>
        <p className="dim small">How the paddock reads the season. Posts are written from what really happened, so these follow the results.</p>
        {arcs.length === 0 && <p className="dim">Nothing is building yet.</p>}
        <ul className="arcs">
          {arcs.map((a) => (
            <li key={a.key}>
              <button className="link" onClick={() => setFilter(a.key)}><b>{arcTitle(s, a)}</b></button> <em className="tag">{ARC_LABEL[a.kind]}</em>
              <Bar v={a.heat} max={1} color={a.heat > 0.6 ? "var(--hot)" : "var(--c-go)"} />
              {a.beats.length > 0 && <span className="dim small">{a.beats[a.beats.length - 1]}</span>}
            </li>
          ))}
        </ul>
        <h3>MOOD TOWARDS YOUR TEAM</h3>
        <Bar v={(mood + 1) / 2} max={1} color={mood < -0.2 ? "var(--red)" : "var(--c-go)"} />
        <p className="dim small">{mood > 0.3 ? "The fans are with you." : mood < -0.3 ? "The mood online is sour. It moves the fans a little and thin-skinned drivers feel it." : "Mixed. It follows the results."}</p>
      </section>
    </div>
  );
}
