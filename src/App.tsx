import { useEffect, useMemo, useState } from "react";
import { Swirl, setSwirl } from "./ui/skin/Swirl";
import { installJuice } from "./ui/skin/juice";
import { applyLook } from "./ui/prefs";
import { music } from "./audio/music";
import { Menu } from "./ui/Menu";
import { Home } from "./ui/Home";
import { GlobalSettings } from "./ui/Settings";
import { Briefing } from "./ui/Briefing";
import { QualiScreen } from "./ui/QualiScreen";
import { RaceScreen } from "./ui/RaceScreen";
import { CareerApp } from "./ui/career/CareerApp";
import { NetCareerApp, NetJoin } from "./ui/career/NetCareer";
import { NewCareer } from "./ui/career/NewCareer";
import type { CareerState } from "./career/types";
import { tutorialCareer } from "./career/tutorial";
import { Results } from "./ui/Results";
import { createQualiSession, createWeekend, raceConfigFrom, simulateQualifying, type WeekendSettings } from "./game/setup";
import { RaceSession } from "./game/session";
import type { QualiSession } from "./game/qsession";
import type { QualiRow } from "./sim/qualifying";
import type { Compound } from "./sim/types";

type Screen = "tutorial" | "home" | "weekend" | "netjoin" | "net" | "career" | "newcareer" | "menu" | "quali" | "briefing" | "race" | "results";

export default function App() {
  const invited = new URLSearchParams(location.search).get("league");
  const [screen, setScreen] = useState<Screen>(invited ? "netjoin" : "home");
  const [netRoom, setNetRoom] = useState<{ code: string; name: string } | null>(null);
  const [settings, setSettings] = useState<WeekendSettings>({ teamId: "mer", circuitId: "silverstone", distance: "half", seed: 2026 });
  const [weekendKey, setWeekendKey] = useState(0);
  const weekend = useMemo(() => (screen === "home" || screen === "weekend" || screen === "career" || screen === "tutorial" || screen === "newcareer" || screen === "net" || screen === "netjoin" ? null : createWeekend(settings)), [weekendKey, screen === "home" || screen === "weekend" || screen === "career" || screen === "tutorial" || screen === "newcareer" || screen === "net" || screen === "netjoin"]); // eslint-disable-line react-hooks/exhaustive-deps
  const [qsession, setQsession] = useState<QualiSession | null>(null);
  const [quali, setQuali] = useState<QualiRow[] | null>(null);
  const [session, setSession] = useState<RaceSession | null>(null);
  const [career, setCareer] = useState<CareerState | null>(null);
  // the tutorial runs on a practice career; `next` is the real career to open when it ends, if one was waiting
  const [tut, setTut] = useState<{ career: CareerState; next: CareerState | null } | null>(null);
  const startTutorial = (next: CareerState | null) => {
    setTut({ career: tutorialCareer(next?.teamId ?? "wil"), next });
    setScreen("tutorial");
  };
  const endTutorial = () => {
    const next = tut?.next ?? null;
    setTut(null);
    if (next) { setCareer(next); setScreen("career"); } else setScreen("home");
  };

  // the menus are silent: no music, and the click sounds only run inside the game screens
  useEffect(() => {
    if (screen === "home" || screen === "weekend" || screen === "newcareer" || screen === "netjoin") music.stop();
  }, [screen]);

  useEffect(() => {
    applyLook();
    return installJuice();
  }, []);
  useEffect(() => {
    if (screen === "home" || screen === "newcareer" || screen === "netjoin" || screen === "weekend") setSwirl("home");
    else if (screen === "quali" || screen === "briefing" || screen === "race" || screen === "results") setSwirl("race");
  }, [screen]);

  const enter = (playQuali: boolean) => {
    setWeekendKey((k) => k + 1);
    const w = createWeekend(settings);
    setQuali(null);
    if (playQuali) {
      const q = createQualiSession(w);
      q.speed = 8;
      setQsession(q);
      setScreen("quali");
    } else {
      setQsession(null);
      setQuali(simulateQualifying(w));
      setScreen("briefing");
    }
  };

  const begin = (tyres: Record<string, Compound>) => {
    if (!weekend || !quali) return;
    setSession(new RaceSession(raceConfigFrom(weekend, quali, tyres), weekend.humanIds));
    setScreen("race");
  };

  const again = () => {
    setSettings({ ...settings, seed: Math.floor(Math.random() * 99999) });
    setScreen("weekend");
  };

  return (
    <div className="app">
      <Swirl />
      {screen === "home" && <Home onNew={() => setScreen("newcareer")} onLoad={(c) => { setCareer(c); setScreen("career"); }} onOnline={() => setScreen("netjoin")} onWeekend={() => setScreen("weekend")} onTutorial={() => startTutorial(null)} />}
      {screen === "weekend" && <Menu settings={settings} onChange={setSettings} onStart={enter} onBack={() => setScreen("home")} />}
      {screen === "netjoin" && <NetJoin code0={invited ?? undefined} onBack={() => setScreen("home")} onJoin={(code, name) => { setNetRoom({ code, name }); setScreen("net"); }} />}
      {screen === "net" && netRoom && <NetCareerApp code={netRoom.code} name={netRoom.name} onExit={() => setScreen("home")} />}
      {screen === "newcareer" && <NewCareer onBack={() => setScreen("home")} onStart={(c) => { setCareer(c); setScreen("career"); }} onTutorial={(c) => startTutorial(c)} />}
      {screen === "tutorial" && tut && <CareerApp key={`tut${tut.career.seed}`} initial={tut.career} tutorial={endTutorial} onExit={endTutorial} />}
      {screen === "career" && career && <CareerApp key={career.seed} initial={career} onExit={() => setScreen("home")} />}
      {screen === "quali" && qsession && weekend && (
        <QualiScreen
          session={qsession}
          meta={weekend.meta}
          onDone={() => {
            setQuali(qsession.sim.results());
            setScreen("briefing");
          }}
        />
      )}
      {screen === "briefing" && weekend && quali && <Briefing weekend={weekend} quali={quali} onBack={() => setScreen("weekend")} onStart={begin} />}
      {screen === "race" && session && weekend && <RaceScreen session={session} meta={weekend.meta} onFinish={() => setScreen("results")} />}
      {screen === "results" && session && weekend && <Results session={session} gp={weekend.meta.gp} onMenu={() => setScreen("home")} onAgain={again} />}
      <GlobalSettings />
      <div className="crt-global" />
    </div>
  );
}
