import { boardMove } from "./board";
import type { Rng } from "../sim/rng";
import { standingsRank } from "./car";
import { news, pushCard, recap, ticker } from "./cards";
import { driversOf } from "./finance";
import { huntResult, type HuntMode } from "./mail";
import { logSpend } from "./log";
import { injectIdea } from "./rnd";
import { weakestArea } from "./rndplan";
import { tempo } from "./storyteller";
import { socialOf, stormAbout, teamPost } from "./social";
import { clamp, fmtMoney, rngFor, round2 } from "./util";
import type { CardOption, CareerState } from "./types";
import { multiply } from "./factors";

/**
 * Dynamic stories. Small, odd things that happen to a team principal: a dog in the garage, an envelope under the door,
 * a billionaire who wants a go. They are for fun, not realism. Each has two or three answers, an outcome that depends on
 * the answer (and sometimes on luck), and some have a follow-up weeks later. Nothing here ever needs the player.
 */

type D = Record<string, number | string | boolean>;
interface Built {
  title: string;
  body: string;
  options: CardOption[];
  data?: D;
}
interface Story {
  id: string;
  cooldown: number;
  weight: (s: CareerState) => number;
  build: (s: CareerState, rng: Rng) => Built | null;
  /** Returns the line shown in the recap. */
  resolve: (s: CareerState, option: string, data: D, rng: Rng) => string;
}

const me = (s: CareerState) => s.teams[s.teamId];
const rank = (s: CareerState) => Math.max(1, standingsRank(s).indexOf(s.teamId) + 1);
const pay = (s: CareerState, m: number, why: string) => {
  me(s).cash = round2(me(s).cash + m);
  if (m < 0) me(s).ledger.costs += -m;
  logSpend(s, why, { cash: m });
};
const mood = (s: CareerState, v: number) => {
  for (const d of driversOf(s, s.teamId)) d.morale = clamp(d.morale + v, 0, 1);
};
const fans = (s: CareerState, v: number) => {
  // a story lands harder on a team whose name carries weight
  const m = multiply(s, s.teamId, ["reputation"]).value;
  s.brand.fans = clamp(s.brand.fans + (v > 0 ? v * m : v / m), 0, 100);
};
const board = (s: CareerState, v: number) => boardMove(s, me(s), v, "A story");
const later = (s: CareerState, days: number, id: string, data: D = {}) => (s.story.queue ??= []).push({ day: s.day + days, id, data });
const opt = (id: string, label: string, detail?: string, lines?: string[]): CardOption => ({ id, label, detail, lines });
const dname = (s: CareerState) => driversOf(s, s.teamId)[0]?.spec.name ?? "Your driver";
const dname2 = (s: CareerState) => driversOf(s, s.teamId)[1]?.spec.name ?? "his team mate";

const STORIES: Story[] = [
  {
    id: "socialStorm",
    cooldown: 60,
    weight: (s) => (stormAbout(s) ? 3 : 0),
    build: (s) => {
      const a = stormAbout(s);
      if (!a) return null;
      const who = a.ids.map((id) => s.drivers[id]?.spec.name ?? "?");
      const what = a.kind === "slump" ? `${who[0]} is being taken apart online after a run of bad weekends` : a.kind === "teamwar" ? `${who.join(" and ")} are the story of the week, and not for good reasons` : `${who[0]}'s future is all anyone is talking about`;
      return {
        title: "The internet has noticed",
        body: `${what}. Latest: ${a.beats.slice(-2).join("; ") || "nothing specific, just noise"}. Your press officer wants to know how to respond.`,
        options: [opt("defend", "Back him in public", "He will feel it, and so will the fans"), opt("statement", "Issue a calm team statement", "Neutral, a little dull"), opt("silence", "Say nothing", "Let it burn out")],
        data: { arc: a.key },
      };
    },
    resolve: (s, o, data) => {
      const a = socialOf(s).arcs[String(data.arc)];
      const ds = (a?.ids ?? []).map((id) => s.drivers[id]).filter((d): d is NonNullable<typeof d> => !!d && d.teamId === s.teamId);
      const d0 = ds[0];
      if (o === "defend") {
        if (d0) {
          d0.morale = clamp(d0.morale + 0.05, 0, 1);
          d0.trust = clamp(d0.trust + 0.04, 0, 1);
          teamPost(s, `${d0.spec.name} has our full backing. Judge us at the end of the season, not after one weekend.`, 0.6, d0.id);
        }
        if (a) a.heat *= 0.5;
        fans(s, a?.kind === "slump" ? -1 : 1);
        return `You backed ${d0?.spec.name ?? "the driver"} in public. He noticed.`;
      }
      if (o === "statement") {
        teamPost(s, "We are focused on the next race and on getting the car where it needs to be. No further comment.", 0, d0?.id);
        if (a) a.heat *= 0.65;
        return "A calm statement went out. The story cooled, a little.";
      }
      if (a) a.heat *= 0.85;
      if (d0) d0.morale = clamp(d0.morale - 0.02, 0, 1);
      return "You said nothing. The story ran on its own.";
    },
  },
  {
    id: "dog",
    cooldown: 400,
    weight: () => 1,
    build: () => ({
      title: "A dog in the garage",
      body: "A scruffy brown dog trotted through the pit lane gate this morning, walked into your garage like he owned it, and fell asleep under the front wing. He has no collar. The mechanics have already named him Downforce.",
      options: [opt("keep", "Let him stay", "The crew love it", ["He eats whatever he likes."]), opt("shelter", "Call the shelter", "Someone will give him a home"), opt("shoo", "Shoo him out", "Nobody is happy")],
    }),
    resolve: (s, o) => {
      if (o === "keep") {
        mood(s, 0.03);
        fans(s, 2);
        later(s, 45, "dogLater");
        return "Downforce is now the garage dog. Morale up, fans charmed.";
      }
      if (o === "shelter") {
        fans(s, 1);
        return "The shelter found Downforce a home, and a photo of the handover did well online.";
      }
      mood(s, -0.02);
      return "The dog was shooed out. The crew will not forget it.";
    },
  },
  {
    id: "dogLater",
    cooldown: 9999,
    weight: () => 0,
    build: () => ({
      title: "Downforce has chewed something",
      body: "The garage dog has found a spool of fibre optic cable and made a meal of it. He is fine. The cable is not.",
      options: [opt("pay", "Replace the cable ($0.3m)", "And buy him a toy"), opt("laugh", "Laugh it off, patch it", "Cheaper, a little slower")],
    }),
    resolve: (s, o) => {
      if (o === "pay") {
        pay(s, -0.3, "Chewed cable");
        return "New cable fitted. Downforce got a chew toy shaped like a front wing.";
      }
      me(s).tunnelLeft = Math.max(0, me(s).tunnelLeft - 12);
      return "The patch held, mostly. You lost a little wind tunnel time.";
    },
  },
  {
    id: "envelope",
    cooldown: 300,
    weight: (s) => (rank(s) > 2 ? 1 : 0.3),
    build: () => ({
      title: "An envelope at reception",
      body: "A plain envelope was left at reception with no name on it. Inside: a stack of photocopied setup notes and a sticky note saying 'you did not get these from me'. The letterhead is a rival team's.",
      options: [opt("read", "Read it", "It could be gold. It could be a trap"), opt("burn", "Shred it, tell nobody", "The honourable thing"), opt("return", "Send it back with a note", "The rival will be embarrassed")],
    }),
    resolve: (s, o, _d, rng) => {
      if (o === "read") {
        if (rng.chance(0.55)) {
          injectIdea(s, s.teamId, weakestArea(s, s.teamId), "safe", { gainMul: 1.3, note: "Inspired by some very interesting notes." });
          later(s, 40, "envelopeFound");
          return "The notes were real. A strong idea is on the table in the Car screen. Someone may ask questions later.";
        }
        injectIdea(s, s.teamId, weakestArea(s, s.teamId), "gamble", { gainMul: 0.4, note: "Built on notes that turned out to be planted." });
        board(s, -2);
        return "It was a plant. The idea you built from it is a dud and the board heard you were reading other people's mail.";
      }
      if (o === "burn") {
        board(s, 1);
        s.story.tone = clamp(s.story.tone + 0.05, -1, 1);
        return "Shredded. Your name for fair play grows a little.";
      }
      fans(s, 2);
      board(s, 1);
      return "You returned it. The rival principal sent a bottle of wine and a very stiff thank-you note.";
    },
  },
  {
    id: "envelopeFound",
    cooldown: 9999,
    weight: () => 0,
    build: () => ({
      title: "The stewards want a word",
      body: "A rival has complained that some of its documents were seen in your factory. Nothing is proven. The stewards would like a friendly chat before it becomes an unfriendly one.",
      options: [opt("admit", "Come clean", "A small fine, then it is over"), opt("deny", "Deny everything", "Risky: it works or it does not")],
    }),
    resolve: (s, o, _d, rng) => {
      if (o === "admit") {
        pay(s, -1, "Stewards' fine");
        board(s, -1);
        return "You paid a $1m fine and the matter was closed.";
      }
      if (rng.chance(0.5)) return "The stewards had nothing. Case closed.";
      pay(s, -3, "Stewards' fine");
      board(s, -4);
      fans(s, -3);
      return "The denial fell apart. $3m fine, the board furious.";
    },
  },
  {
    id: "tourist",
    cooldown: 250,
    weight: (s) => (s.brand.fans > 40 ? 1 : 0.5),
    build: (s) => ({
      title: "A billionaire wants a go",
      body: `A very rich fan in a very loud shirt has offered ${fmtMoney(2.5)} to spend race day in the garage, wear a headset, and 'help with strategy'. He has never been to a race. He says he is sure he would be good at it.`,
      options: [opt("yes", "Take the money", "+$2.5m", [`${dname(s)} will not enjoy the headset.`]), opt("more", "Ask for $5m", "He may say yes. He may leave"), opt("no", "Politely decline", "Keep the garage serious")],
    }),
    resolve: (s, o, _d, rng) => {
      if (o === "no") return "You said no. He bought a box at the track instead and sulked.";
      const amt = o === "more" ? (rng.chance(0.55) ? 5 : 0) : 2.5;
      if (!amt) return "He walked off to find a team with lower prices.";
      pay(s, amt, "Garage guest");
      mood(s, -0.02);
      later(s, 14, "touristFollow", { amt });
      return `He wired ${fmtMoney(amt)} straight away. Race day is going to be interesting.`;
    },
  },
  {
    id: "touristFollow",
    cooldown: 9999,
    weight: () => 0,
    build: () => ({
      title: "The billionaire pressed a button",
      body: "On the radio he said 'what does this one do?' The answer was 'please do not'. He did. Nothing broke, but the strategy screen now plays a ringtone.",
      options: [opt("fine", "Laugh. It cost nothing"), opt("fix", "Have the IT team clean it up ($0.1m)")],
    }),
    resolve: (s, o) => {
      if (o === "fix") {
        pay(s, -0.1, "IT clean-up");
        return "IT fixed it. The ringtone was, honestly, a banger.";
      }
      fans(s, 1);
      return "Fans loved the clip of it.";
    },
  },
  {
    id: "hottub",
    cooldown: 300,
    weight: (s) => (driversOf(s, s.teamId).length ? 1 : 0),
    build: (s) => ({
      title: "The hot tub request",
      body: `${dname(s)} and ${dname2(s)} have come to you together, for the first time ever, with a joint request: a hot tub in the driver's room. They have prepared slides.`,
      options: [opt("yes", "Install it ($0.3m)", "Both drivers delighted"), opt("pool", "Buy an inflatable one ($0.02m)", "A compromise, they say"), opt("no", "Absolutely not", "They go back to hating each other")],
    }),
    resolve: (s, o) => {
      if (o === "yes") {
        pay(s, -0.3, "Hot tub");
        mood(s, 0.06);
        return "The hot tub is installed. The drivers have never been closer.";
      }
      if (o === "pool") {
        pay(s, -0.02, "Inflatable hot tub");
        mood(s, 0.03);
        fans(s, 1);
        return "The inflatable hot tub got a lot of laughs and a small fan reaction.";
      }
      mood(s, -0.02);
      return "Request denied. The slides were pinned to the noticeboard anyway.";
    },
  },
  {
    id: "viral",
    cooldown: 200,
    weight: () => 1,
    build: () => ({
      title: "The pit crew video",
      body: "An intern filmed the pit crew doing an unplanned victory dance during a practice stop. It has a million views before lunch. The crew are mortified and delighted in equal parts.",
      options: [opt("lean", "Lean in, post the sequel", "Fans love it, sponsors smile"), opt("quiet", "Say nothing", "It fades"), opt("ban", "Ban phones in the garage", "The board approves, the crew do not")],
    }),
    resolve: (s, o, _d, rng) => {
      if (o === "lean") {
        fans(s, 4);
        for (const sp of me(s).sponsors) sp.mood = clamp(sp.mood + 0.06, 0, 1);
        if (rng.chance(0.2)) {
          mood(s, -0.02);
          return "The sequel went viral too, but the drivers feel upstaged.";
        }
        return "The sequel was even better. Fans and sponsors are happy.";
      }
      if (o === "ban") {
        board(s, 1);
        mood(s, -0.02);
        return "No more phones. The crew sulk.";
      }
      fans(s, 1);
      return "The clip faded away on its own.";
    },
  },
  {
    id: "prank",
    cooldown: 300,
    weight: (s) => (s.teams ? 1 : 0),
    build: () => ({
      title: "A gift basket from next door",
      body: "A basket of fruit has arrived from the neighbouring garage, with a note: 'thinking of you'. The fruit is arranged to spell something rude. Someone has started a prank war.",
      options: [opt("prank", "Strike back", "Fill their garage with balloons"), opt("thanks", "Send a polite thank-you", "Take the high road"), opt("eat", "Eat the fruit, say nothing", "Good fruit")],
    }),
    resolve: (s, o, _d, rng) => {
      if (o === "prank") {
        fans(s, 3);
        mood(s, 0.03);
        if (rng.chance(0.5)) later(s, 25, "pranked");
        return "The balloons were a triumph. The paddock is talking about it.";
      }
      if (o === "thanks") {
        board(s, 1);
        return "Your thank-you note was so polite it was somehow insulting. They are impressed.";
      }
      mood(s, 0.01);
      return "The fruit was excellent.";
    },
  },
  {
    id: "pranked",
    cooldown: 9999,
    weight: () => 0,
    build: () => ({
      title: "They fought back",
      body: "You arrive to find your whole garage filled with 4,000 rubber ducks, each wearing a tiny team cap. Nobody knows how they got past security.",
      options: [opt("clean", "Clean it up ($0.1m)"), opt("sell", "Sell the ducks to fans", "Merchandise!")],
    }),
    resolve: (s, o) => {
      if (o === "clean") {
        pay(s, -0.1, "Duck removal");
        return "It took the crew a day to clear. They found ducks for weeks.";
      }
      pay(s, 0.4, "Duck merchandise");
      fans(s, 2);
      return "The ducks sold out in an hour. +$0.4m.";
    },
  },
  {
    id: "trophy",
    cooldown: 500,
    weight: () => 1,
    build: () => ({
      title: "Something behind the wall",
      body: "Builders knocking through a wall in the old part of the factory found a dusty cup in a crate. It is a trophy from a long-forgotten race, engraved with this team's name. A collector has already heard about it.",
      options: [opt("display", "Put it in the lobby", "Pride in the building"), opt("sell", "Sell it to the collector", "+$3m, some fans will be cross"), opt("charity", "Auction it for charity", "Fans love it")],
    }),
    resolve: (s, o) => {
      if (o === "display") {
        board(s, 2);
        mood(s, 0.02);
        fans(s, 2);
        return "The cup sits in the lobby. Everybody walks a little taller.";
      }
      if (o === "sell") {
        pay(s, 3, "Sold old trophy");
        fans(s, -2);
        return "Sold for $3m. A few fans cannot believe you did it.";
      }
      fans(s, 5);
      board(s, 1);
      s.story.tone = clamp(s.story.tone + 0.05, -1, 1);
      return "The auction raised a lot for charity and the paddock noticed.";
    },
  },
  {
    id: "kart",
    cooldown: 300,
    weight: (s) => (driversOf(s, s.teamId).length >= 2 ? 1 : 0),
    build: (s) => ({
      title: "A karting grudge",
      body: `${dname(s)} and ${dname2(s)} have been arguing about who is faster in a kart. They want to settle it on Sunday at a rented track. They have already bought matching helmets.`,
      options: [opt("allow", "Let them race", "Winner glows, loser sulks"), opt("join", "Race them yourself", "You will lose, loudly"), opt("ban", "Forbid it", "Insurance would never allow it")],
    }),
    resolve: (s, o, _d, rng) => {
      const ds = driversOf(s, s.teamId);
      if (o === "ban") {
        board(s, 1);
        return "Banned. Both drivers rolled their eyes.";
      }
      if (o === "join") {
        mood(s, 0.04);
        fans(s, 2);
        return "You came last by a very large margin. Both drivers will talk about it for years.";
      }
      const w = rng.chance(0.5) ? 0 : 1;
      if (ds[w]) ds[w].morale = clamp(ds[w].morale + 0.05, 0, 1);
      if (ds[1 - w]) ds[1 - w].morale = clamp(ds[1 - w].morale - 0.04, 0, 1);
      return `${ds[w]?.spec.name ?? "One of them"} won. The other has asked for a rematch.`;
    },
  },
  {
    id: "napkin",
    cooldown: 250,
    weight: () => 1,
    build: () => ({
      title: "An idea on a napkin",
      body: "An intern from the canteen has slid a coffee-stained napkin across your desk. It is a drawing of a sidepod. It is either brilliant or a drawing of a sandwich. She says she watched every race since she was six.",
      options: [opt("back", "Back her, give it to the designers", "A cheap gamble"), opt("thanks", "Thank her, keep it on file", "Nothing happens"), opt("fire", "Remind her where her desk is", "Harsh")],
    }),
    resolve: (s, o, _d, rng) => {
      if (o === "back") {
        const good = rng.chance(0.45);
        injectIdea(s, s.teamId, weakestArea(s, s.teamId), "gamble", { gainMul: good ? 1.5 : 0.5, costMul: 0.6, note: "From a napkin sketch by an intern." });
        s.story.arcs.napkinGood = good ? 1 : 0;
        later(s, 50, "napkinLater");
        return "A cheap gamble idea is on the Car screen. Whether it is brilliant, we will see.";
      }
      if (o === "fire") {
        mood(s, -0.02);
        return "She went back to the canteen. People noticed.";
      }
      return "She was thrilled to be thanked. The napkin is now framed in the canteen.";
    },
  },
  {
    id: "napkinLater",
    cooldown: 9999,
    weight: () => 0,
    build: (s) => ({
      title: "The napkin girl is back",
      body: s.story.arcs.napkinGood ? "She is back with a new drawing, and the last one worked. The designers now ask for her by name." : "She is back with a new drawing. Last time did not go well, but she is undeterred.",
      options: [opt("promote", "Hire her to the design office", "A cheap junior, sharp eyes"), opt("pass", "Wish her luck")],
    }),
    resolve: (s, o) => {
      s.story.arcs.napkinGood = 0;
      if (o === "promote") {
        pay(s, -0.2, "Junior designer");
        injectIdea(s, s.teamId, weakestArea(s, s.teamId), "safe", { gainMul: 1.1, note: "From the new junior designer." });
        return "She joined the design office and brought a decent idea along.";
      }
      return "She took a job at a rival. You will hear from her again.";
    },
  },
  {
    id: "legend",
    cooldown: 400,
    weight: () => 1,
    build: () => ({
      title: "A legend knocks on the door",
      body: "A retired world champion has turned up unannounced and says he is 'in the area'. He offers to mentor your drivers for an afternoon. He is known for brilliance, for terrible jokes and for the odd insult.",
      options: [opt("yes", "Welcome him in", "Drivers learn. Maybe a row"), opt("tour", "Give him a tour and a coffee", "Safe, fans love the photo"), opt("no", "Politely turn him away", "Rude to a legend")],
    }),
    resolve: (s, o, _d, rng) => {
      if (o === "yes") {
        if (rng.chance(0.3)) {
          mood(s, -0.04);
          return "The legend told your drivers exactly what he thought of them. It was accurate and awful.";
        }
        mood(s, 0.05);
        for (const d of driversOf(s, s.teamId)) d.trust = clamp(d.trust + 0.03, 0, 1);
        return "Your drivers hung on his every word. They are visibly sharper.";
      }
      if (o === "tour") {
        fans(s, 3);
        return "The photos of the legend in your garage were everywhere.";
      }
      fans(s, -1);
      return "He left in a huff and told a journalist.";
    },
  },
  {
    id: "blackout",
    cooldown: 300,
    weight: () => 0.8,
    build: () => ({
      title: "Power cut",
      body: "A digger outside has gone through the cable feeding the factory. The wind tunnel is mid-run and about to lose power. A generator could arrive in an hour for a price.",
      options: [opt("gen", "Hire the generator ($0.5m)", "Save the run"), opt("wait", "Wait it out", "You lose some tunnel hours")],
    }),
    resolve: (s, o) => {
      if (o === "gen") {
        pay(s, -0.5, "Emergency generator");
        return "The generator saved the run. Expensive, but the data is good.";
      }
      me(s).tunnelLeft = Math.max(0, me(s).tunnelLeft - 30);
      return "The run was lost. 30 wind tunnel hours gone.";
    },
  },
  {
    id: "scam",
    cooldown: 300,
    weight: (s) => (me(s).cash < 60 ? 1.4 : 0.6),
    build: () => ({
      title: "A prince needs your help",
      body: "An email from 'His Royal Highness Prince Abubakar of Somewhere' says a fortune of $40m is waiting for a trustworthy team principal. He only needs your bank details to release it, and a small fee. The intern says it looks legit.",
      options: [opt("send", "Reply with the details", "What could go wrong?"), opt("law", "Forward to legal", "They will enjoy it"), opt("delete", "Delete it")],
    }),
    resolve: (s, o, _d, rng) => {
      if (o === "send") {
        const loss = round2(0.6 + rng.next() * 1.2);
        pay(s, -loss, "Email scam");
        board(s, -2);
        news(s, "The team lost money to a prince.", { importance: 1, tag: "money" });
        return `Gone: ${fmtMoney(loss)}. The board has heard.`;
      }
      if (o === "law") {
        return "Legal framed the email and put it on the noticeboard. Staff morale is oddly high.";
      }
      return "Deleted. The prince will have to find someone else.";
    },
  },
  {
    id: "tabloid",
    cooldown: 250,
    weight: () => 1,
    build: (s) => ({
      title: "The tabloid offers a deal",
      body: `A tabloid editor offers a glowing front-page profile of the team in exchange for 'access': a week of embedded photographers, including in ${dname(s)}'s motorhome. He will happily print something less glowing if you refuse.`,
      options: [opt("yes", "Give them access", "Fans love it, drivers hate it"), opt("no", "Refuse politely", "A sulky story may follow"), opt("leak", "Feed them a rival's rumour", "Unkind, effective")],
    }),
    resolve: (s, o, _d, rng) => {
      if (o === "yes") {
        fans(s, 3);
        mood(s, -0.04);
        return "The profile ran on the front page. The drivers feel watched.";
      }
      if (o === "leak") {
        fans(s, 1);
        s.story.tone = clamp(s.story.tone - 0.08, -1, 1);
        return "A rival had a bad week in the papers. You are not popular on the other side of the pit lane.";
      }
      if (rng.chance(0.4)) {
        fans(s, -2);
        return "They printed a sour piece about the team's 'chaos'. It will blow over.";
      }
      return "They shrugged and printed nothing.";
    },
  },
  {
    id: "shadyBust",
    cooldown: 9999,
    weight: () => 0,
    build: () => ({
      title: "Sponsor trouble",
      body: `The company behind your sponsor deal has been raided. The papers are not kind. It turns out a few things were not quite what they said.`,
      options: [opt("drop", "Cut ties immediately", "Lose the deal, keep your name"), opt("hold", "Hold your nerve", "Money keeps coming, but for how long?")],
    }),
    resolve: (s, o, d) => {
      const name = String(d.name ?? "");
      const sp = me(s).sponsors.find((x) => x.name === name);
      if (o === "drop") {
        if (sp) me(s).sponsors = me(s).sponsors.filter((x) => x.id !== sp.id);
        fans(s, -1);
        return `${name || "The sponsor"} was dropped. A bad week, but a clean exit.`;
      }
      if (sp) me(s).sponsors = me(s).sponsors.filter((x) => x.id !== sp.id);
      pay(s, -Number(d.retainer ?? 1) * 0.3, "Sponsor collapse");
      fans(s, -5);
      board(s, -4);
      return `${name || "The sponsor"} collapsed owing you money, and the headlines were about the team.`;
    },
  },
  // ---- the downward spiral: only when the team is in a bad way
  {
    id: "sinking",
    cooldown: 120,
    weight: (s) => (rank(s) >= 8 || me(s).board < 30 ? 1.8 : 0),
    build: (s) => ({
      title: "Staff are looking at other jobs",
      body: `Your head of aerodynamics has been seen at a rival's factory 'for lunch'. At the bottom of the table people are polishing CVs and your canteen has gone quiet. ${rank(s) >= 10 ? "Nobody wants to be last again." : ""}`,
      options: [opt("pay", "Raise pay across the factory ($1.5m)", "Staff stay, for now"), opt("talk", "Hold an all-hands speech", "Free, works only if the board believes you"), opt("shrug", "Let them go if they want", "Morale falls")],
    }),
    resolve: (s, o, _d, rng) => {
      if (o === "pay") {
        pay(s, -1.5, "Retention pay");
        mood(s, 0.02);
        return "A pay rise bought some peace, but not a fast car.";
      }
      if (o === "talk") {
        if (me(s).board > 40 && rng.chance(0.6)) {
          mood(s, 0.03);
          return "The speech worked. People stayed.";
        }
        mood(s, -0.02);
        return "The speech fell flat. Two engineers quit that week.";
      }
      mood(s, -0.04);
      board(s, -2);
      return "People started leaving. The car is not going to get faster for it.";
    },
  },
  {
    id: "sponsorSulk",
    cooldown: 150,
    weight: (s) => (rank(s) >= 7 && me(s).sponsors.length ? 1.5 : 0),
    build: (s) => {
      const sp = me(s).sponsors[0];
      return {
        title: `${sp.name} wants a word`,
        body: `${sp.name}'s boss says seeing the logo at the back of the grid 'is not what the brand stands for'. He is thinking of making his budget smaller, and has hinted that a good result would change his mind.`,
        options: [opt("dinner", "Take him to dinner, promise a recovery", "Mood up, a promise to keep"), opt("discount", "Offer a discount on the next deal", "Costs future money"), opt("hold", "Point at the contract")],
        data: { id: sp.id },
      };
    },
    resolve: (s, o, d) => {
      const sp = me(s).sponsors.find((x) => x.id === Number(d.id));
      if (!sp) return "The sponsor had already gone.";
      if (o === "dinner") {
        sp.mood = clamp(sp.mood + 0.15, 0, 1);
        board(s, -1);
        return `${sp.name} calmed down, for now. You have promised results.`;
      }
      if (o === "discount") {
        sp.retainer = round2(sp.retainer * 0.9);
        sp.mood = clamp(sp.mood + 0.2, 0, 1);
        return `${sp.name} stays at a 10 percent discount.`;
      }
      sp.mood = clamp(sp.mood - 0.15, 0, 1);
      return `${sp.name} is unhappy but contracted. Their mood dropped.`;
    },
  },
  {
    id: "bankLetter",
    cooldown: 120,
    weight: (s) => (me(s).cash < 5 ? 2 : 0),
    build: () => ({
      title: "A letter from the bank",
      body: "The bank would like to discuss 'your current arrangements'. The tone is polite in the way a locked door is polite. They can lend you money, at a price.",
      options: [opt("loan", "Take a bridging loan ($10m)", "Cash now, $2.5m interest over time"), opt("cut", "Cut costs hard instead", "Board approves, the factory suffers"), opt("ignore", "Ignore the letter", "It comes back angrier")],
    }),
    resolve: (s, o) => {
      if (o === "loan") {
        pay(s, 10, "Bridging loan");
        later(s, 60, "loanDue");
        return "$10m arrived in the account. The bill is coming.";
      }
      if (o === "cut") {
        pay(s, 3, "Emergency cost cuts");
        board(s, 2);
        mood(s, -0.04);
        return "Costs were slashed: +$3m and a gloomy factory.";
      }
      board(s, -3);
      return "The bank noted your reply, or lack of it. The board noticed.";
    },
  },
  {
    id: "loanDue",
    cooldown: 9999,
    weight: () => 0,
    build: () => ({ title: "The bridging loan is due", body: "The bank would like its $10m back, plus the $2.5m interest.", options: [opt("pay", "Pay it ($12.5m)"), opt("roll", "Roll it over", "$5m more interest")] }),
    resolve: (s, o) => {
      if (o === "pay") {
        pay(s, -12.5, "Loan repaid");
        return "The loan is repaid.";
      }
      pay(s, -5, "Loan interest");
      board(s, -2);
      return "You rolled the loan over for another $5m of interest.";
    },
  },
];

const BY_ID = Object.fromEntries(STORIES.map((x) => [x.id, x]));

function push(s: CareerState, st: Story, b: Built) {
  pushCard(s, "event", b.title, b.body, b.options, { deadline: s.day + 12, defaultOption: b.options[b.options.length - 1].id, urgency: 2, data: { ...(b.data ?? {}), ev: `story:${st.id}` } });
}

/** Once a week: maybe one story. Roughly one every few weeks. */
export function storiesWeekly(s: CareerState) {
  if (s.weekend) return;
  if (s.cards.filter((c) => !c.notice && c.kind === "event").length >= 3) return;
  const rng = rngFor(s, `stories:${s.day}:${s.teamId}`);
  const live = STORIES.filter((e) => e.weight(s) > 0 && s.day - (s.story.last[`st:${e.id}`] ?? -9999) >= e.cooldown);
  if (!live.length) return;
  const gap = s.day - (s.story.last.storyAny ?? -999);
  const tp = tempo(s);
  if (gap < 9 / tp || !rng.chance(clamp(0.38 * tp, 0, 0.7))) return;
  const total = live.reduce((a, e) => a + e.weight(s), 0);
  let r = rng.next() * total;
  let pick = live[0];
  for (const e of live) {
    r -= e.weight(s);
    if (r <= 0) {
      pick = e;
      break;
    }
  }
  const b = pick.build(s, rng);
  if (!b) return;
  s.story.last[`st:${pick.id}`] = s.day;
  s.story.last.storyAny = s.day;
  push(s, pick, b);
  ticker(s, b.title, 1);
}

/** Every day: follow-ups come due. */
export function storiesDaily(s: CareerState) {
  const q = s.story.queue;
  if (!q || !q.length) return;
  const due = q.filter((x) => x.day <= s.day);
  if (!due.length) return;
  s.story.queue = q.filter((x) => x.day > s.day);
  for (const f of due) {
    if (f.id.startsWith("hunt:")) {
      huntResult(s, f.id.slice(5) as HuntMode);
      continue;
    }
    const st = BY_ID[f.id];
    if (!st) continue;
    const b = st.build(s, rngFor(s, `fu:${f.id}`));
    if (!b) continue;
    push(s, st, { ...b, data: { ...(b.data ?? {}), ...f.data } });
  }
}

export function resolveStory(s: CareerState, evId: string, option: string, data: D): boolean {
  const id = evId.startsWith("story:") ? evId.slice(6) : null;
  const st = id ? BY_ID[id] : null;
  if (!st) return false;
  const line = st.resolve(s, option, data, rngFor(s, `res:${id}:${option}`));
  recap(s, line);
  news(s, line, { importance: 1, tag: "story" });
  return true;
}

export const STORY_COUNT = STORIES.length;

export const STORY_IDS = STORIES.map((x) => x.id);

/** Puts one story on the table now (used by tests and the debug tools). */
export function forceStory(s: CareerState, id: string): boolean {
  const st = BY_ID[id];
  if (!st) return false;
  const b = st.build(s, rngFor(s, `force:${id}`));
  if (!b) return false;
  push(s, st, b);
  return true;
}
