import { useCallback, useEffect, useRef, useState } from "react";
import { setSwirl } from "../skin/Swirl";
import { reduce, type Result } from "../../career/reducer";
import { saveCareer } from "../../career/save";
import { fmtDay } from "../../career/util";
import type { Action, CareerState } from "../../career/types";
import type { Tab } from "./common";
import { Today, type Clock } from "./Today";
import { Calendar } from "./Calendar";
import { Inbox, unreadCount } from "./Inbox";
import { Car } from "./Car";
import { People } from "./People";
import { Academy } from "./Academy";
import { Money } from "./Money";
import { Rules } from "./Rules";
import { World } from "./World";
import { WeekendFlow } from "./Weekend";
import { ScreenBanner, type BannerTheme } from "../pixel/banners";
import { CarReveal } from "../pixel/CarReveal";
import { useClickSounds } from "../../audio/SoundControls";
import { setSettingsExtras } from "../Settings";
import { HelpPicker } from "./HelpPicker";
import { getPrefs, setPref } from "../prefs";
import { sfx, type SfxName } from "../../audio/sound";
import { music, type TrackName } from "../../audio/music";
import { ambience } from "../../audio/ambience";
import { ProfileHost } from "./Profile";
import { ConvoPanel, CeremonyOverlay } from "./Overlays";
import { DevRoom } from "./DevRoom";
import { teamColour, teamLabel } from "../../career/brand";
import "../pixel/themes.css";
import type { CareerRoom } from "./net";
import { NetWeekend, ReadyDock } from "./NetParts";
import { Coach } from "./Coach";

const SFX_FOR: Partial<Record<Action["type"], SfxName>> = { sign: "signed", extend: "signed", poachStaff: "signed", signStaff: "signed", signProspect: "signed", promote: "signed", promise: "confirm", eraVote: "vote", eraPersuade: "vote", eraTrade: "vote", endSponsor: "coin", startProject: "spend", upgradeFacility: "spend", buyoutProspect: "coin" };
/** One score for every factory screen: moving between tabs must never restart the music. */
export const TRACK_FOR: Record<Tab, TrackName> = { today: "factory", inbox: "factory", calendar: "factory", car: "factory", people: "factory", academy: "factory", money: "factory", rules: "factory", world: "factory" };

const THEME: Partial<Record<Tab, BannerTheme>> = { today: "news", inbox: "news", calendar: "calendar", car: "car", people: "people", academy: "academy", money: "money", rules: "rules", world: "world" };

const TABS: { k: Tab; label: string }[] = [
  { k: "today", label: "TODAY" },
  { k: "inbox", label: "INBOX" },
  { k: "calendar", label: "CALENDAR" },
  { k: "car", label: "CAR & R&D" },
  { k: "people", label: "PEOPLE" },
  { k: "academy", label: "ACADEMY" },
  { k: "money", label: "MONEY" },
  { k: "rules", label: "RULES" },
  { k: "world", label: "WORLD" },
];
export const SLOT = "main";
const MS = { 1: 140, 2: 70, 4: 30 } as const;
const MAX_DAYS = 120;

export function CareerApp({ initial, onExit, net, tutorial }: { initial: CareerState; onExit: () => void; net?: CareerRoom; tutorial?: () => void }) {
  const [local, setS] = useState<CareerState>(initial);
  // online: the server's view of your team, with your own clicks applied at once until the server answers
  const [opt, setOpt] = useState<CareerState | null>(null);
  const netRev = net?.revs.careerRev;
  useEffect(() => setOpt(null), [netRev]);
  const s: CareerState = net ? (opt ?? (net.view as CareerState | null) ?? local) : local;
  const [msg, setMsg] = useState("");
  const [tab, setTab] = useState<Tab>("today");
  const [inWeekend, setInWeekend] = useState(false);
  const [peek, setPeek] = useState(false);
  const [clock, setClock] = useState<Clock>({ running: false, speed: 2, stopped: "" });
  const [saved, setSaved] = useState("");
  const ref = useRef(s);
  ref.current = s;
  const clockRef = useRef(clock);
  clockRef.current = clock;
  const days = useRef(0);
  const [reveal, setReveal] = useState(false);
  const shownLaunch = useRef<number>(-1);
  useClickSounds();
  useEffect(() => {
    const c = s.cards.find((x) => x.kind === "launch");
    if (c && shownLaunch.current !== c.id) {
      shownLaunch.current = c.id;
      sfx.play("reveal");
      setReveal(true);
    }
  }, [s.cards]);
  // the weekend screens choose their own music; the factory screens follow the tab, and turn grim when the team is in trouble
  const myTeam = s.teams[s.teamId];
  const trouble = !!myTeam && (myTeam.board < 28 || myTeam.cash < 0);
  useEffect(() => {
    if (inWeekend) return;
    music.play(trouble ? "crisis" : TRACK_FOR[tab]);
  }, [tab, inWeekend, trouble]);
  // the building has a sound of its own while you are at your desk; the track screens have theirs
  useEffect(() => {
    if (inWeekend && !peek) { ambience.stop(); return; }
    ambience.play(tab === "car" ? "factory" : tab === "academy" ? "lab" : "office");
  }, [tab, inWeekend, peek]);
  useEffect(() => () => ambience.stop(), []);
  useEffect(() => {
    // practice stays in the garage; quali, the race, the classification and the debrief get the calm purple
    if (inWeekend) setSwirl(s.weekend && s.weekend.stage !== "practice" ? "race" : "garage");
    else setSwirl(trouble ? "crisis" : tab === "today" ? "hq" : tab);
  }, [tab, inWeekend, trouble, s.weekend?.stage]); // eslint-disable-line react-hooks/exhaustive-deps
  const first = useRef(true);
  // a message stays for a few seconds and then goes by itself; a click dismisses it at once
  useEffect(() => {
    if (!msg) return;
    const id = window.setTimeout(() => setMsg(""), Math.min(9000, 3500 + msg.length * 45));
    return () => window.clearTimeout(id);
  }, [msg]);

  const d = useCallback((a: Action): Result => {
    const r = reduce(ref.current, a);
    const fx = SFX_FOR[a.type];
    if (fx) sfx.play(r.ok ? fx : "error");
    if (net) {
      if (r.ok) {
        ref.current = r.state;
        setOpt(r.state);
        void net.act(a as never).then((res) => {
          if (!res.ok) {
            setMsg(res.message);
            setOpt(null);
          }
        });
      }
      setMsg(r.message);
      return r;
    }
    ref.current = r.state;
    setS(r.state);
    setMsg(r.message);
    return r;
  }, [net]);

  // the day animation: one simulated day per tick, so the date visibly counts up
  useEffect(() => {
    if (!clock.running) return;
    const t = window.setTimeout(() => {
      const r = d({ type: "step", first: first.current });
      first.current = false;
      days.current += 1;
      const w = ref.current.weekend;
      if (!r.ok || days.current >= MAX_DAYS || (w && w.stage !== "done")) {
        setClock((c) => ({ ...c, running: false, stopped: r.ok ? (days.current >= MAX_DAYS ? "A long stretch passed" : "") : r.message }));
        setMsg("");
      }
    }, MS[clock.speed]);
    return () => window.clearTimeout(t);
  }, [clock.running, clock.speed, s.day, d]);

  const play = useCallback(() => {
    if (ref.current.weekend && ref.current.weekend.stage !== "done") return;
    days.current = 0;
    first.current = true;
    setClock((c) => ({ ...c, running: true, stopped: "" }));
  }, []);
  const pause = useCallback(() => setClock((c) => ({ ...c, running: false })), []);
  const setSpeed = useCallback((v: 1 | 2 | 4) => setClock((c) => ({ ...c, speed: v })), []);

  // tutorial: only the first decision before the weekend is shown; the team settles the rest so the coach can move on
  const keepCard = useRef<number | null>(null);
  useEffect(() => {
    if (!tutorial || s.weekend) return;
    const pend = s.cards.filter((c) => !c.notice && !c.mail && c.kind !== "launch");
    if (keepCard.current === null && pend.length) keepCard.current = pend[0]!.id;
    for (const c of pend) if (c.id !== keepCard.current && c.options.length) d({ type: "card", id: c.id, option: c.defaultOption ?? c.options[0]!.id });
  }, [s.cards, s.weekend]); // eslint-disable-line react-hooks/exhaustive-deps
  // autosave when the clock is not running
  useEffect(() => {
    if (clock.running || net || tutorial) return;
    void saveCareer(SLOT, s).then(() => setSaved(`Saved ${fmtDay(s.day)}`)).catch(() => setSaved("Could not save"));
  }, [clock.running, s.day, s.cards.length, s.weekend?.stage, s.weekend?.runsLeft, s.round]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!s.weekend || s.weekend.stage === "done") setInWeekend(false);
  }, [s.weekend]);

  // online, a new race weekend opens on its practice screen so nobody skips it by pressing ready from the factory
  const openedFor = useRef(-1);
  useEffect(() => {
    if (net && s.weekend && s.weekend.stage === "practice" && openedFor.current !== s.round) {
      openedFor.current = s.round;
      setMsg("");
      setInWeekend(true);
    }
  }, [net, s.weekend?.stage, s.round]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && ["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName)) return;
      if (inWeekend) return;
      if (e.code === "Space" && tab === "today") {
        if (t && t.tagName === "BUTTON") return;
        e.preventDefault();
        if (clockRef.current.running) pause();
        else play();
      } else if (e.key >= "1" && e.key <= "9" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setTab(TABS[Number(e.key) - 1].k);
      } else if (e.key === "Escape" && clockRef.current.running) pause();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inWeekend, tab, play, pause]);

  const exportFile = () => {
    const blob = new Blob([JSON.stringify(s)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `boxbox-career-${s.year}-${fmtDay(s.day).replace(/\s/g, "")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  // someone who joined a league picked their help level before they had a team: apply it once, then it is theirs to change in Settings
  useEffect(() => {
    if (net && s.guidance === undefined) d({ type: "setGuidance", level: getPrefs().help });
  }, [net, s.guidance, d]);
  useEffect(() => {
    setSettingsExtras(
      <>
        <div className="set-help">
          <b>HELP LEVEL</b>
          <HelpPicker value={s.guidance ?? "off"} onChange={(g) => { d({ type: "setGuidance", level: g }); setPref("help", g); }} />
        </div>
        {!net && <button className="btn" onClick={exportFile}>EXPORT SAVE FILE</button>}
        <p className="dim small">{net ? "The league is saved on the server after every step." : saved}</p>
      </>,
    );
  });
  useEffect(() => () => setSettingsExtras(null), []);

  // the coach stays mounted through the car unveiling, so the tutorial keeps its place
  const coach = tutorial ? <Coach s={s} d={d} tab={tab} go={setTab} inWeekend={inWeekend && !!s.weekend && !peek} running={clock.running} hidden={reveal} onDone={tutorial} /> : null;
  if (reveal) {
    return <><CarReveal teamColor={teamColour(s)} accent={0xffffff} teamName={teamLabel(s)} year={s.year} onDone={() => setReveal(false)} />{coach}</>;
  }
  const toggleDash = (on: boolean) => {
    setPeek(on);
    // alone, the session waits while you are at your desk; in a league it carries on for everyone
    if (!net) window.dispatchEvent(new CustomEvent("boxbox-hold", { detail: on }));
  };
  const weekendLive = inWeekend && !!s.weekend;
  const waiting = s.cards.filter((c) => !c.notice && !c.mail).length + unreadCount(s);


  return (
    <>
    <ProfileHost s={s} d={d}>
    {weekendLive && (
      <div style={{ display: peek ? "none" : "block" }}>
        {net ? <NetWeekend room={net} s={s} d={d} msg={msg} onExit={() => { setPeek(false); setInWeekend(false); }} /> : <WeekendFlow s={s} d={d} msg={msg} onExit={() => { setPeek(false); setInWeekend(false); }} />}
      </div>
    )}
    {weekendLive && (
      <button className="btn n-menu-btn dash-btn" onClick={() => toggleDash(!peek)}>
        {peek ? "BACK TO THE WEEKEND" : `DASHBOARD${waiting > 0 ? ` (${waiting})` : ""}`}
      </button>
    )}
    {(!weekendLive || peek) && <div className={`screen career ${THEME[tab] ? "theme-" + THEME[tab] : ""}`}>
      <header className="topline">
        <button className="tiny" onClick={onExit}>{"< MENU"}</button>
        <nav className="seg c-tabs">
          {TABS.map((t, i) => (
            <button key={t.k} className={tab === t.k ? "on" : ""} title={`Key ${i + 1}`} onClick={() => setTab(t.k)}>
              {t.label}
              {t.k === "today" && s.cards.filter((c) => !c.notice && !c.mail).length > 0 ? ` (${s.cards.filter((c) => !c.notice && !c.mail).length})` : ""}{t.k === "inbox" && unreadCount(s) > 0 ? ` (${unreadCount(s)})` : ""}
            </button>
          ))}
        </nav>
      </header>
      {THEME[tab] && <ScreenBanner theme={tab === "today" ? "hq" : THEME[tab]!} />}
      <div key={tab} className="tab-in">
      {tab === "today" && <Today dock={net ? <ReadyDock room={net} s={s} onWeekend={() => { setMsg(""); setInWeekend(true); if (peek) toggleDash(false); }} /> : undefined} s={s} d={d} msg={msg} go={setTab} clock={clock} play={play} pause={pause} setSpeed={setSpeed} onWeekend={() => { setMsg(""); setInWeekend(true); if (peek) toggleDash(false); }} />}
      {tab === "inbox" && <Inbox s={s} d={d} />}
      {tab === "calendar" && <Calendar s={s} d={d} net={!!net} />}
      {tab === "car" && <Car s={s} d={d} />}
      {tab === "people" && <People s={s} d={d} />}
      {tab === "academy" && <Academy s={s} d={d} />}
      {tab === "money" && <Money s={s} d={d} />}
      {tab === "rules" && <Rules s={s} d={d} />}
      {tab === "world" && <World s={s} d={d} />}
      </div>
      {msg && tab !== "today" && <p className="c-msg floating" role="status" onClick={() => setMsg("")} title="Click to dismiss">{msg}</p>}
    </div>}
    {(!weekendLive || peek) && <ConvoPanel s={s} d={d} />}
    {(!weekendLive || peek) && <DevRoom s={s} d={d} auto={tab === "today"} />}
    <CeremonyOverlay s={s} d={d} />
    </ProfileHost>
    {coach}
    </>
  );
}
