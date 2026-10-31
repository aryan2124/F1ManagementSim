import type { Psyche } from "../sim/types";

/**
 * Radio lines. All of them are invented for the game; none is a quote from a real driver or engineer.
 * The six voices are broad ways of talking, assigned to each real driver in personalities.ts.
 *
 * Tokens: {eng} engineer name as the driver says it, {turn} corner, {comp} tyre name, {gap} seconds,
 * {mate} team-mate code, {sec} sector number, {n} a number of laps or minutes.
 */

export type Voice = Psyche["voice"];

type Bank = Record<Voice, string[]>;

/** Driver to pit wall, unprompted. */
export const SAY = {
  /** Too many calls in a short time. The driver is busy. */
  fatigue: {
    blunt: ["Stop talking. I am driving.", "Too many calls. Leave me alone.", "I heard you. Quiet please."],
    fire: ["Enough! I cannot concentrate with all this talking, {eng}!", "Every lap another call! Let me drive!", "Stop! Stop talking to me!"],
    sunny: ["Ha, you are chatty today, {eng}. I have got it, honestly!", "Message received, many times over, mate.", "Easy, easy. One thing at a time!"],
    analyst: ["The calls are coming too often. I need clear air on the radio.", "Please limit the messages to what changes the race.", "I have the information. No more updates unless it is urgent."],
    elder: ["I know what I am doing, {eng}. Let me get on with it.", "Quieter, please. I will ask if I need you.", "Too much noise on this channel."],
    anxious: ["Sorry, it is a lot to take in. Can I just drive?", "I am trying to listen but I am losing the car. Sorry.", "Please, one message at a time, I am struggling."],
  } satisfies Bank,

  tyresGone: {
    blunt: ["Tyres are gone. Box.", "These are finished. Come on.", "No grip at all. I need new tyres."],
    fire: ["The tyres are dead, {eng}! I cannot push, I need to stop!", "Nothing left on the rears, nothing! Box me!", "I am sliding everywhere, this is too much, new tyres!"],
    sunny: ["Hey {eng}, tyres are really struggling now, shall we stop?", "I think these are done, mate. What do you think?", "Getting pretty tough out here on these, just so you know."],
    analyst: ["Rear degradation has stepped up in the last two laps. The window is open.", "Lap time is dropping about a tenth a lap now. Suggest we look at the stop.", "The rears are past their peak. I would box within a couple of laps."],
    elder: ["Right, these have had it. Let me know when you want me in.", "I have been nursing them for a while. They are done, {eng}.", "I can drive around it, but it is costing us. Your call."],
    anxious: ["Sorry, sorry, the tyres are really going. Should I come in?", "I am losing a lot of time here, is it time to stop?", "I do not want to ruin the race, but these are very bad."],
  } satisfies Bank,

  wetOnSlicks: {
    blunt: ["It is raining. Get me inters.", "Wet in {sec}. This is not driveable on slicks.", "I am going to crash. Inters."],
    fire: ["It is slippery, {eng}, very slippery! I need inters, now!", "I cannot hold the car! Rain everywhere in sector {sec}!", "Box me, box me, I am a passenger out here!"],
    sunny: ["Bit of rain coming down here, {eng}. Feels slippery out there!", "It is getting properly wet in sector {sec}, might be time for inters?", "Tricky, mate! Sliding around a fair bit on these."],
    analyst: ["Sector {sec} is wet and the grip is falling fast. Crossover is close.", "Rain intensity is increasing in {sec}. I think slicks are done.", "Standing water on the racing line in {sec}. My read is inters."],
    elder: ["It has started to come down. I will keep it on the black stuff, but I will not enjoy it.", "Wet now, {eng}. You know where I am, say when.", "I have seen worse, but this will bite soon. Think about the tyres."],
    anxious: ["It is getting really slippery, I am scared to lift and brake. What should I do?", "Rain in {sec}! Do we stop? Please tell me.", "I nearly lost it just now. Is it time for inters?"],
  } satisfies Bank,

  dryingOnWets: {
    blunt: ["Track is drying. These wets are cooked.", "Dry line everywhere. Get me slicks, or inters at least.", "Waste of time on these. It is drying."],
    fire: ["The wets are destroyed, {eng}! The line is dry, I am wasting everything!", "Everyone is flying on the dry line and I am cooking these, come on!", "Get me off these tyres, now!"],
    sunny: ["Lots of dry line out here now, {eng}, might be time to switch!", "Sun is peeking out, track is coming back nicely.", "I think we can come in, the line is basically dry."],
    analyst: ["Dry line is established through most of the lap. Wets are overheating.", "Surface temperature is rising. Crossover to inters has passed.", "My read is that the track is drying faster than forecast."],
    elder: ["The line has dried. You can see it from here.", "I could do with something less wet, {eng}.", "Cooking these. You should look at the stop."],
    anxious: ["The line is dry, I am scared I am wrecking the tyres. Should I come in?", "Is it too early to change? I am struggling on these.", "I think it is drying but I do not want to make the wrong call."],
  } satisfies Bank,

  damage: {
    blunt: ["I have damage. Front wing.", "Something is broken. Car is not right.", "Floor is damaged, I can feel it."],
    fire: ["I have damage, {eng}! The car is not the same, it is pulling!", "I felt that hit! Something is wrong, wrong!", "The front is broken, I cannot attack like this!"],
    sunny: ["Think I picked something up there, {eng}. Feels a bit odd.", "Car feels strange after that. Nothing dramatic, but not right.", "Ooh, that was a big one. Can you check the damage?"],
    analyst: ["Aero balance has shifted. I think there is front wing damage.", "Understeer has increased significantly. Suspect floor damage.", "Car is losing downforce on the front axle, about two tenths a lap."],
    elder: ["Right. I have damage. Not good, not terrible.", "I felt it go. Get the team ready.", "She is pulling to the left. Have a look."],
    anxious: ["Sorry, I think I hit something. The car feels wrong. What do I do?", "Is the wing OK? It feels bad, I am so sorry.", "I think I broke something. Please tell me what to do."],
  } satisfies Bank,

  letMeBy: {
    blunt: ["I am faster than {mate}. Let me through.", "Tell {mate} to move. I am quicker.", "This is slow. Let me by or we lose the race."],
    fire: ["I am much quicker than {mate}, {eng}! Why am I stuck here?!", "Let me through, I am wasting my race behind him!", "Tell him to move over! I can win this race!"],
    sunny: ["Hey {eng}, I think I have more pace than {mate}, can we think about a swap?", "I am a bit quicker, if you want to let me have a go.", "Just flagging that I am catching him a lot in the corners."],
    analyst: ["I am gaining {gap} seconds a lap on {mate}. A swap makes sense for the team.", "Data says I am faster. Recommend a position change.", "We are both losing time. The sensible call is to let me by."],
    elder: ["I am quicker than {mate} here. You know how this ends, {eng}.", "Let me have a go, and we will both finish higher.", "I am stuck. Make the call, you know what is right."],
    anxious: ["I do not want to cause trouble, but I think I am faster than {mate}. Is that OK?", "Sorry to ask, could I try to pass him? I am catching him.", "I feel like I am holding him up. Or he is holding me up."],
  } satisfies Bank,

  favouritism: {
    blunt: ["Why is {mate} on a better strategy? Explain.", "Seems like {mate} gets everything. Not good enough.", "I want an answer. Why is it always his call?"],
    fire: ["Why does {mate} always get the good call, {eng}?! Why?!", "This is not fair! He is getting everything and I am getting nothing!", "I am not stupid. I see what you are doing!"],
    sunny: ["Not to be that guy, {eng}, but {mate} seems to be getting the better end of this one.", "I thought we were equal here? It does not feel that way.", "Just want to be sure we are treated the same, mate."],
    analyst: ["{mate} has had a strategic advantage this race. I would like to understand the reasoning.", "The decisions have not been symmetrical. Please explain.", "My data shows I was given the worse call. Can we discuss?"],
    elder: ["I have been in this game a long time, {eng}. This one does not feel balanced.", "Is {mate} getting the first call every time? Just asking.", "Fair is fair. I want the same shot."],
    anxious: ["Is it because I made a mistake earlier? {mate} is getting better calls.", "Are you not happy with me? It feels like {mate} gets more help.", "I am trying my best, but it seems he gets the better strategy."],
  } satisfies Bank,

  stuckBehind: {
    blunt: ["I am stuck behind this car. Do something.", "Too slow ahead. Overcut or undercut, make a choice.", "This is a waste of time."],
    fire: ["This guy is ridiculous, {eng}, I am losing everything behind him!", "I cannot get past, I am stuck, find me a gap!", "I am stuck in dirty air, do something!"],
    sunny: ["Stuck in a train, {eng}, it is a bit hard to get by.", "Can we try something different? This is not going anywhere!", "Tricky to follow, he is just so quick in the corners."],
    analyst: ["Following loss is high. Tyres are overheating in his wake.", "Undercut window is open. Suggest we use it.", "We are losing about half a second a lap in this traffic."],
    elder: ["I am just following here. We need a different plan.", "Stuck, {eng}. You know the options.", "No point sitting here. Let me know what we can try."],
    anxious: ["I am stuck and I do not know how to get past, any ideas?", "Should I try something or just stay behind? I do not want to risk it.", "Is there something we can change? I cannot get close enough."],
  } satisfies Bank,

  askSafetyCar: {
    blunt: ["Safety car. Do we box or not?", "Safety car out. Tell me what we do.", "SC. Stay or pit?"],
    fire: ["Safety car, {eng}! Are we stopping? Are we staying out?!", "Tell me fast, safety car, what is the plan?", "Everyone will pit, I know it! What do we do?!"],
    sunny: ["Safety car, {eng}, do we want to take the free stop?", "Looks like a good chance to stop, what do you think?", "Safety car deployed, what is the call?"],
    analyst: ["Safety car. A stop now loses roughly half the usual time. Recommend we box.", "Tyre age says box. Track position says stay. Your call.", "I will follow the plan. Confirm which one it is."],
    elder: ["Safety car. You will want to stop, I imagine.", "Free stop, if you ask me, but it is your call.", "Tell me what you want. I am ready for either."],
    anxious: ["Safety car! Do we box? I need to know before the pit entry!", "I do not want to guess, what do we do?", "Please tell me quickly, are we stopping?"],
  } satisfies Bank,

  askRedFlag: {
    blunt: ["Red flag. What tyres?", "Red flag. Fresh set, which one?", "OK. Red flag. Tyre choice, now."],
    fire: ["Red flag! What are we putting on, {eng}?", "A fresh start! Tell me the tyre!", "Come on, which tyre, what is the plan?"],
    sunny: ["Red flag, {eng}! Good chance to reset. What are we fitting?", "Free tyre change, nice! What do you want?", "Looks like a standing restart, what do you think?"],
    analyst: ["Red flag. Choice of tyre depends on the weather outlook. What does the radar say?", "I recommend we look at the forecast before choosing.", "Free change. Check the radar before we commit."],
    elder: ["Red flag. Time to think. What does the radar say?", "Plenty of time, {eng}. Let us get this right.", "We get one go at this. Pick well."],
    anxious: ["Red flag! Which tyre do I use? I do not want to get it wrong.", "Is the weather going to change? I need to know what to ask for.", "Please tell me what we are doing before they start the engines."],
  } satisfies Bank,

  spun: {
    blunt: ["Spun. Going.", "My mistake. Sorry.", "Lost the rear. Carry on."],
    fire: ["Aaargh! I spun! I am sorry, I am sorry!", "I lost it, the rear just went! Sorry, {eng}!", "I do not believe it! Why?!"],
    sunny: ["Whoops! Spun it. That was my bad!", "Got a bit greedy there, apologies!", "Ha, well, that was exciting. Back on it."],
    analyst: ["Lost the rear on entry. Apologies. Checking the tyres.", "Oversteer on turn in. I was too aggressive.", "That was a snap. Flat spots likely."],
    elder: ["Spun. I will get going again, {eng}.", "Right. Not the best moment. Let me turn around.", "Too much throttle. Sorry."],
    anxious: ["I am so sorry, I spun! Is the car OK?", "I am sorry. I should not have pushed so hard.", "That was my fault. Can I carry on?"],
  } satisfies Bank,

  lockup: {
    blunt: ["Locked up.", "Locked the front. Flat spot.", "Lock up. It will be OK."],
    fire: ["Ahh, big lock up, {eng}! I have a flat spot!", "Blocked the front, there is a vibration now!", "I locked up, so close to the wall!"],
    sunny: ["Whoa! Big lock up, {eng}. Not ideal!", "Squeaky bum moment there!", "Little lock up, we are fine."],
    analyst: ["Front left lock up. I have a flat spot, mild vibration.", "Lock up at the end of the straight. Brake bias too far forward.", "Flat spot. Monitor the vibration."],
    elder: ["Lock up. I have a flat spot.", "Misjudged that. We will see how the tyre is.", "A slip. It will not cost us too much."],
    anxious: ["Sorry, I locked up and I think there is a flat spot.", "That scared me, I am so sorry.", "Locked the brakes. Can you see if it is OK?"],
  } satisfies Bank,

  puncture: {
    blunt: ["Puncture. Box.", "Tyre is gone. Boxing.", "Rear left is flat."],
    fire: ["I have a puncture, {eng}! Rear left, it is gone!", "Tyre is flat, flat, flat! I have to box!", "I felt something! The tyre is destroyed!"],
    sunny: ["Think I have a puncture, {eng}! Heading in!", "Ouch, the tyre is gone. Coming in slowly.", "Flat tyre, mate. Box, box!"],
    analyst: ["Rapid pressure loss, rear left. Boxing now.", "I have a puncture. Slow lap to the pits.", "Right rear is down. Coming in."],
    elder: ["Puncture. I am coming in.", "Tyre is gone. Make sure they are ready.", "Rear is flat. Back to the pits."],
    anxious: ["I have a puncture! Is that bad? I am coming in!", "The tyre is gone. Am I OK to drive back?", "Sorry, I think I picked up debris. I am boxing."],
  } satisfies Bank,

  praise: {
    blunt: ["Good job. Keep it going.", "Fine. Now keep that up.", "Decent call."],
    fire: ["Yes, {eng}! Great call, great call! We are flying!", "Forza! That is what I wanted!", "This is it! This is our day!"],
    sunny: ["Brilliant, {eng}! Loving this!", "That was a cracking call, mate. Thanks!", "Everyone is doing a great job, keep it up!"],
    analyst: ["That call has worked well. Pace is strong.", "Strategy has been well executed. Well done.", "Good. The numbers look good."],
    elder: ["Good work, {eng}. That is how it is done.", "Nice. I will take that.", "Smart. Keep doing that."],
    anxious: ["Thank you so much, I am really enjoying this.", "That was a good call, I think. Thank you.", "I hope I am doing what you want. Thanks for the support."],
  } satisfies Bank,

  banter: {
    blunt: ["Radio check.", "Copy.", "OK, understood."],
    fire: ["I am feeling the car, {eng}, it is good, it is really good!", "We are doing this! We are all in!", "I love this track!"],
    sunny: ["Lovely day for it, {eng}!", "Sorry, I had to say it, this is a good one!", "How is the coffee in the garage? Mine is cold."],
    analyst: ["Tyre temps look balanced.", "Brake temperatures are fine at the front.", "I am happy with the balance."],
    elder: ["Seen this before. We will be OK.", "Take your time, {eng}. No rush.", "Funny how it is always the last third of the race."],
    anxious: ["How are we looking? I hope I am not making mistakes.", "Is everything OK with the car?", "I am trying to stay calm out here."],
  } satisfies Bank,
};

/** How a driver answers a decision. tone: accept, grumble, refuse. */
export const REPLY = {
  accept: {
    blunt: ["OK.", "Understood.", "Fine. Copy.", "Right."],
    fire: ["Yes, yes, OK, I understand, let us go!", "OK {eng}, if that is what you need!", "Understood, I trust you!", "OK, OK, copy!"],
    sunny: ["No problem, {eng}, thanks!", "You got it, mate!", "Sure thing, sounds good!", "Cheers, on it!"],
    analyst: ["Understood. I will execute.", "Copy. That is logical.", "Agreed, I will manage it.", "Confirmed. Doing it now."],
    elder: ["All right, {eng}. I will do it.", "Fair enough. Understood.", "Sure. You have the full picture.", "I hear you. I will do it."],
    anxious: ["OK, thank you, I will do my best!", "Right, got it. I hope I get it right.", "Thank you. I will try!", "OK, understood, thanks for telling me!"],
  } satisfies Bank,
  grumble: {
    blunt: ["Fine. I do not like it.", "I disagree, but OK.", "Copy. Noted. Not happy.", "OK. Do not expect me to like it."],
    fire: ["Are you serious, {eng}?! Fine, I will do it. I will remember.", "I do not agree at all! But OK!", "OK, OK, but this is wrong. I am telling you.", "This is not what I wanted! Copy!"],
    sunny: ["Ah, OK, if you say so, but I am not thrilled.", "Not gonna lie, mate, that stings. But fine.", "Hmm. OK. Did not expect that.", "Sure, if you must."],
    analyst: ["I disagree with the reasoning. I will comply.", "I do not think that is optimal. I will comply.", "Noted. For the record, I would have chosen otherwise.", "Understood. I will follow it."],
    elder: ["I have been here before, {eng}, and I do not like where this goes. OK.", "I will do it, but I am not happy.", "Fine. You are the boss.", "All right. We will see who was right."],
    anxious: ["OK, I will do it, but I am a bit upset.", "Right, OK. I hope that is the right call.", "I will do it. I do not feel great about it.", "If you really think so, OK."],
  } satisfies Bank,
  refuse: {
    blunt: ["No. I am not doing that.", "I will race him. Not moving.", "No chance. I will do it my way.", "Negative. Not happening."],
    fire: ["No! No way, {eng}! I am staying where I am!", "I will not move! I am racing!", "Absolutely not! I will do what I think is right!", "No! You cannot ask me this!"],
    sunny: ["Sorry, mate, I just cannot do that one.", "I hear you, but I am going to race him.", "Ha, no. I am not doing that.", "Respectfully, nope!"],
    analyst: ["I cannot accept this. The data does not support it.", "Negative. This costs the team more than it gains.", "I will not comply with that. I am sorry.", "I am not comfortable with that call. I will not do it."],
    elder: ["No, {eng}. I have earned the right to race.", "Not this time. You know me better than that.", "I will not do that. Not today.", "I will do what I think is right out here."],
    anxious: ["I am sorry, I just cannot. It does not feel right.", "I cannot do it. I am sorry. Please do not be angry.", "I am really sorry, but I cannot.", "Please do not make me do this. I cannot."],
  } satisfies Bank,
};

/** Engineer lines to the driver. Two or three variants each. */
export const ENG = {
  pit: ["{call}, box this lap. {comp} tyres.", "Box, box. {comp} tyres, {call}.", "OK {call}, we are boxing. {comp} tyres ready."],
  earlyStop: ["{rival} boxed on lap {lap}. Looks like {why}, not an undercut. We stay out.", "{rival} is in already, lap {lap}. That is {why}. No threat. Stay out."],
  noThreat: ["{rival} has stopped, but his fresh tyres only gain about {gain} a lap. Not enough to jump you. Stay out.", "{rival} pitted. No threat, the gain is too small. We stay out."],
  standing: ["Standing order: {why}. Box this lap, {comp} tyres.", "{why}, as agreed. Box, box. {comp} tyres."],
  standingCover: ["{rival} has stopped and the threat is real. Standing order, we cover. Box this lap, {comp} tyres.", "Covering {rival} as agreed. Box now, {comp} tyres."],
  stayOut: ["Stay out, stay out. We keep going.", "Copy, we stay out. Keep pushing.", "OK, stay out. We will revisit next lap."],
  hold: ["{call}, hold position please. Do not race {mate}.", "We hold position. No risk with {mate}."],
  letby: ["{call}, let {mate} through at the next opportunity.", "OK, we want {mate} ahead. Let him by."],
  free: ["You are free to race {mate}, but keep it clean.", "Free race. No contact with {mate}."],
  pushNow: ["Push now, {call}. All you have got.", "{call}, we need you to attack. Go."],
  saveTyres: ["Lift and coast a bit, {call}. We need to manage the tyres.", "Manage the tyres please. Look after them."],
  weatherNear: ["{call}, rain expected in about {n} minutes. We are not certain.", "Radar shows a cell coming, around {n} minutes. Low confidence."],
  weatherNow: ["{call}, it is raining at the circuit now. Keep us updated.", "Rain has started. Tell us what you see."],
  weatherClears: ["Radar says it should stop in around {n} minutes, {call}.", "We think the rain eases in around {n} minutes."],
  weatherDry: ["Dry radar for the next half hour, {call}.", "Nothing on the radar for now."],
  gap: ["Gap to car ahead is {gap} seconds.", "You are {gap} seconds behind."],
  yellow: ["Yellow flag in sector {sec}.", "Yellow in sector {sec}. Be careful."],
};

/** Rival teams' radio. honest = real pit calls, hint = true but vague, bluff = fake, noise = filler. */
export const RIVAL = {
  pitCall: {
    blunt: ["Box this lap.", "In. Box, box.", "Pitting now."],
    fire: ["Box, box, we are coming in!", "In this lap! Box!", "Boxing! Boxing!"],
    sunny: ["Box this lap, mate, thanks!", "OK, coming in, box box!", "Alright, in we come!"],
    analyst: ["Confirming box this lap.", "Box, as planned.", "Boxing now, as discussed."],
    elder: ["OK, I am coming in.", "Box. Copy.", "I will come in, then."],
    anxious: ["Am I boxing? OK, boxing!", "Box this lap, got it!", "In, in, I am coming in!"],
  } satisfies Bank,
  bluffCall: {
    blunt: ["Box, box. Wait, stay out.", "Plan B. Box this lap. Cancel, stay out.", "Boxing. No. Staying."],
    fire: ["Are we boxing, {eng}?! Box box, no, stay out, stay out!", "In this lap! No, wait, I stay!", "Box! Cancel!"],
    sunny: ["Box box! Ha, no, kidding, stay out!", "Coming in, I think. Oh, no. Staying out.", "Pit entry! Oh, we stay. OK!"],
    analyst: ["Plan C. Box this lap. Cancel, repeat, stay out.", "We are looking at the stop. Hold. Continue.", "Box confirmed. Cancel. Stay out."],
    elder: ["I will come in. No, stay out. I know what you are doing, {eng}.", "Box. Wait. Not yet.", "In. Forget it, stay out."],
    anxious: ["Do I box?! Oh, wait, no, stay out. Sorry!", "I am boxing? No? OK, staying!", "Box this lap? Sorry, cancel, stay out!"],
  } satisfies Bank,
  hintTyres: {
    blunt: ["The tyres are going. Maybe {n} more laps.", "Rears are almost done.", "These will not last."],
    fire: ["The tyres are finished, {eng}! Maybe {n} laps, no more!", "I am sliding, sliding! Not long!", "Tyres, tyres, tyres!"],
    sunny: ["Tyres are starting to go, {eng}. Maybe a few more laps?", "They are still OK, but not for long.", "Bit worried about the tyres, to be honest."],
    analyst: ["Degradation is up. Expect the stop around lap {n}.", "I have about {n} laps left on these.", "Tyre life is limited."],
    elder: ["The tyres are tired. I can give you {n} laps.", "These will not make it much longer.", "I am managing them, but they are not good."],
    anxious: ["I think the tyres are going, should I stop?", "They feel bad. Maybe {n} more laps?", "The rears are going away fast."],
  } satisfies Bank,
  hintRain: {
    blunt: ["Rain at turn {turn}.", "Spots of rain in {sec}.", "It is raining."],
    fire: ["Rain! Rain in sector {sec}, I can feel it!", "It is wet at turn {turn}, {eng}!", "Water on the screen!"],
    sunny: ["Bit of rain in {sec}, {eng}, just so you know.", "Drops on the visor, mate.", "Starting to spit a bit."],
    analyst: ["Light rain in sector {sec}. Intensity low.", "Rain starting at turn {turn}. Grip is dropping.", "I see rain in {sec}. Track still mostly dry."],
    elder: ["It is starting to spit.", "A few drops at turn {turn}.", "Rain is coming, I can feel it."],
    anxious: ["Rain! I think rain at turn {turn}?", "Is it getting wet? I felt something.", "It is wet in {sec}, I think."],
  } satisfies Bank,
  noiseGap: {
    blunt: ["Gap?", "How far?", "OK."],
    fire: ["What is the gap, {eng}?", "How close am I?", "Where is he?"],
    sunny: ["How are we doing on gap?", "Anything to worry about behind?", "What is happening around me?"],
    analyst: ["Please confirm gap to the car behind.", "Update me on the gaps.", "What are the lap times of the cars ahead?"],
    elder: ["Where is everybody?", "Tell me the gap.", "How are we looking?"],
    anxious: ["How close is he?", "Is he catching me?", "Where is everyone?"],
  } satisfies Bank,
  noiseChat: {
    blunt: ["Radio check.", "Copy.", "Yes."],
    fire: ["I love this track!", "This car is a beast!", "We are on it today!"],
    sunny: ["Lovely race, {eng}!", "Having a blast!", "It is a good one, this."],
    analyst: ["Balance is fine.", "Temps are stable.", "Everything looks normal."],
    elder: ["Take your time.", "It is a long race.", "All good."],
    anxious: ["I hope I am not making mistakes.", "Is everything OK?", "I am trying to stay calm."],
  } satisfies Bank,
};

export function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : ""));
}

/**
 * Strategy talk: undercuts, covers, stacked stops and pressure. Tokens as above plus {rival} (the other car's code),
 * {gap} (seconds) and {n} (laps).
 */
export const TALK = {
  /** A sharp driver pushes back when the pit wall calls a stop on tyres that are barely used. Tokens: {age} laps old, {wear} percent worn. */
  pushEarly: {
    blunt: ["The tyres are {age} laps old. We are throwing time away. Your call.", "Box now? They are only {wear} percent gone. I disagree, but fine."],
    fire: ["Already?! They are only {age} laps old, I have loads left!", "Why are we boxing, {eng}? The tyres are fine, {wear} percent!"],
    sunny: ["Hmm, the tyres still feel pretty good, {age} laps. Are you sure, {eng}?", "Happy to box, but they are only {wear} percent worn!"],
    analyst: ["Tyres are {age} laps old, about {wear} percent worn. A stop now loses time. I would stay out.", "The data says {wear} percent. Pitting now is a net loss unless something has changed."],
    elder: ["Early. Tyres have plenty in them, {age} laps. Your call, {eng}.", "I would run longer. They are only {wear} percent gone."],
    anxious: ["Are we sure? The tyres feel okay, {age} laps. I do not want to waste a stop.", "They are only {wear} percent worn, I think. Should we really box?"],
  } satisfies Bank,

  undercutWon: {
    blunt: ["Good. Ahead of {rival}.", "Undercut worked. Keep it coming.", "Clear of {rival}. Fine."],
    fire: ["YES! Past {rival} in the pits, brilliant, {eng}!", "That is how you do it! The undercut was perfect!", "Get in! Told you the early stop would work!"],
    sunny: ["Ha, lovely stop, {eng}! Jumped {rival}!", "That undercut was a beauty, thanks team!", "Nice one everyone, we got {rival} in the pits!"],
    analyst: ["Undercut confirmed. Ahead of {rival} on fresher tyres.", "Track position gained through the stop, as modelled.", "Good call. The tyre offset is now in our favour."],
    elder: ["That is the stop doing the work. Good.", "Right, ahead of {rival}. Now keep it that way.", "Well timed, {eng}. Simple as that."],
    anxious: ["Okay, we got {rival}. I think. Is that right?", "Phew, that worked. Do not let me lose it now.", "We are ahead, good, I just need to stay clean."],
  } satisfies Bank,

  undercutLost: {
    blunt: ["{rival} undercut me. We were late.", "We got undercut. I said it was time.", "Lost the place in the pits. Not good enough."],
    fire: ["{rival} jumped me in the pits, {eng}! Why did we wait?!", "We got undercut! That was avoidable!", "I was right there, we should have covered him!"],
    sunny: ["Ah, they got us on the undercut, {eng}. Shame.", "Fair play to {rival}, good stop. We were a lap late.", "Bit unlucky there, mate. Let us get it back."],
    analyst: ["{rival} undercut us. The cover came one lap too late.", "That stop cost a place. The numbers said cover.", "Undercut successful for them. We lose track position."],
    elder: ["They had us on the stop, {eng}. Happens.", "We should have gone when {rival} went.", "Right. They got us. Let us find another way past."],
    anxious: ["We lost the place, sorry, was it me?", "{rival} got ahead in the pits. What went wrong?", "Oh no, undercut. Should we have stopped earlier?"],
  } satisfies Bank,

  teamLost: {
    blunt: ["{mate} came out ahead of me. You kept me out. Remember that.", "My own team-mate undercut me. Explain that.", "Why was he called first? I was ahead."],
    fire: ["{mate} jumped me in the pits?! I was ahead, {eng}, what is this?!", "You left me out and let {mate} undercut me! Unbelievable!", "I want an explanation for that stop, right now!"],
    sunny: ["Hmm, {mate} got me in the pits. Not ideal, {eng}, we should talk.", "I am happy for the team, but I was in front, you know.", "Okay, that one stung a bit. Why did I stay out?"],
    analyst: ["{mate} undercut me through the stops. I was ahead on track. I question the sequence.", "The call favoured {mate}. I want the reasoning after the race.", "That cost me a position to my own team-mate. Noted."],
    elder: ["I have seen this before. The man behind goes first, the man ahead pays. I do not like it.", "{mate} got the benefit there. I hope it was deliberate.", "Fine. But I expect to hear why, {eng}."],
    anxious: ["{mate} is ahead of me now, did I do something wrong?", "Why did I stay out, {eng}? I thought we were equal.", "I am sorry, did I hold up the stop? He got me."],
  } satisfies Bank,

  teamWon: {
    blunt: ["Ahead of {mate}. Good stop.", "That is racing. Tell him it was the team's call.", "Fine. I took the place."],
    fire: ["Got {mate}! The stop was perfect, thank you!", "Ha, that is what an early stop does, tell {mate} to relax!", "Yes! Ahead of {mate}, that is where I belong!"],
    sunny: ["Sorry {mate}, it was the team's call! Great stop, though.", "Ahead of {mate} after the stops, hope he does not mind!", "Nice one, team, though poor {mate} will not be happy."],
    analyst: ["Ahead of {mate} after the stop. I assume that was the intention.", "The undercut worked on {mate}. Please make sure he understands it was strategy.", "Net gain of a place on {mate}. Noted."],
    elder: ["Ahead of {mate}. I did not ask for that. It is the team's job to be fair.", "Well, that is how the stops fell. Look after {mate}, {eng}.", "I will not apologise for a stop, but I will not gloat either."],
    anxious: ["I am ahead of {mate} now. Is that okay? Will he be upset?", "Sorry, sorry, I did not ask for that call.", "That was the team's decision, right? I want to be clear."],
  } satisfies Bank,

  /** Prompt openers. */
  coverWarn: {
    blunt: ["{rival} has stopped. He is coming for me. Do we cover?"],
    fire: ["{rival} just pitted, {eng}! He will jump me! Cover him, now!"],
    sunny: ["Looks like {rival} boxed, {eng}. Shall we cover?"],
    analyst: ["{rival} pitted. Undercut threat: fresh tyres give him a second a lap or more. Cover?"],
    elder: ["{rival} has gone in. He will be on new tyres. Your call, {eng}."],
    anxious: ["{rival} boxed! He is going to undercut me, what do we do?!"],
  } satisfies Bank,

  undercutIdea: {
    blunt: ["Stuck behind {rival}. I cannot pass. Stop me early and I will jump him."],
    fire: ["{rival} is right there and I am quicker, {eng}! Box me early, I can undercut him!"],
    sunny: ["Bit stuck behind {rival}, {eng}. What about an early stop to get him in the pits?"],
    analyst: ["Following {rival} costs me time in dirty air. An early stop gives us the undercut."],
    elder: ["Not getting past {rival} on track, {eng}. A stop now might do it for us."],
    anxious: ["I am stuck behind {rival}, can we try the undercut? Or is it too risky?"],
  } satisfies Bank,

  stackWait: {
    blunt: ["Sat behind {mate}. This is costing me.", "Waiting for {mate}. Tell me when I can go in."],
    fire: ["I am sitting in the pit lane behind {mate}, {eng}! This is a disaster!", "Why are we double stacking?! I am losing seconds here!"],
    sunny: ["Waiting my turn behind {mate}, {eng}. Not ideal!", "Queue in the pit lane! Let me know when he is out."],
    analyst: ["Stacked behind {mate}. The delay is a few seconds. Noted for the review.", "Waiting in the lane. This is the cost of the double stop."],
    elder: ["Behind {mate} in the lane. Should have been spaced out, {eng}.", "Waiting. You know what this costs."],
    anxious: ["I am stuck behind {mate} in the pit lane, is that right?", "Am I waiting for him? How long?"],
  } satisfies Bank,

  stackAfter: {
    blunt: ["That stack cost me. Do not do that again.", "Lost time waiting for {mate}. Your call, not mine."],
    fire: ["The stack lost me a place, {eng}! You cannot do that to me!", "I sat there for ages! Whose idea was that?!"],
    sunny: ["That wait hurt a bit, {eng}. Let us space them out next time?", "Slightly painful, that one. Let us talk about it."],
    analyst: ["The double stack cost about {gap} seconds. I would like to see why we did it.", "Net cost of the stack was significant. Please review."],
    elder: ["Two cars in at once. You can do better than that, {eng}.", "That one is on the wall, not on me."],
    anxious: ["I hope that was not my fault, the waiting?", "That took a long time. Was it the right call?"],
  } satisfies Bank,

  pressure: {
    blunt: ["{rival} is on my gearbox.", "{rival} is all over me. Tell me what you want."],
    fire: ["{rival} is right behind me, {eng}! Tell me to defend or tell me to go!", "He is all over me! I need something, {eng}!"],
    sunny: ["{rival} is right behind, {eng}. I will keep him honest!", "Got {rival} breathing down my neck, mate."],
    analyst: ["{rival} within a second for {n} laps now. My tyres will not take much more of this.", "{rival} has the DRS. I will lose the place without a change."],
    elder: ["{rival} has been behind me a while. I can hold him or I can save the tyres. Which?", "He is close. I have the measure of him, for now."],
    anxious: ["{rival} is really close, should I defend or let him go?", "He is right there, I do not want to make a mistake."],
  } satisfies Bank,
};
