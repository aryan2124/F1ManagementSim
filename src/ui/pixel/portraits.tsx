import { Grid, PAL, gridRects, hash, rng, shade } from "./grid";

/** Pixel portraits (24x24 logical). Everything is drawn from a seed so the same person always looks the same. */

export type Mood = "happy" | "ok" | "tense" | "angry" | "gone";

const SKINS = ["#f6d3b3", "#e8b98f", "#c98d5f", "#9b6238", "#6a4026"];
const HAIRS = ["#23160f", "#4a2e18", "#8a5a26", "#c9a24a", "#8d8d96", "#111111", "#7a2a14"];
const VISORS = ["#14111f", "#1b3768", "#5a2a16", "#262a30"];

function grey(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const v = Math.round(0.3 * ((n >> 16) & 255) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255) * 1);
  const x = Math.round(v * 0.75 + 20).toString(16).padStart(2, "0");
  return `#${x}${x}${x}`;
}

function palette(base: Record<string, string>, gone: boolean): Record<string, string> {
  if (!gone) return { ...PAL, ...base };
  const out: Record<string, string> = { ...PAL };
  for (const [k, v] of Object.entries({ ...PAL, ...base })) out[k] = k === "k" ? v : grey(v);
  return out;
}

function Svg({ g, pal, size, label, data }: { g: Grid; pal: Record<string, string>; size: number; label: string; data: Record<string, string> }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} shapeRendering="crispEdges" role="img" aria-label={label} style={{ imageRendering: "pixelated", display: "inline-block", verticalAlign: "middle", flex: "none" }} {...data}>
      <title>{label}</title>
      {gridRects(g.rows(), pal)}
    </svg>
  );
}

export function driverGrid(seed: number, mood: Mood): { g: Grid; look: number } {
  const R = rng(seed);
  const hairStyle = Math.floor(R() * 3); // 0 none, 1 fringe, 2 sideburns
  const facial = Math.floor(R() * 5); // 0 none 1 stubble 2 moustache 3 beard 4 none
  const look = R() < 0.5 ? 0 : 1;
  const g = new Grid(24, 24);
  // suit and shoulders
  g.r(7, 18, 10, 1, "Q").r(4, 19, 16, 1, "Q").r(1, 20, 22, 4, "Q");
  g.r(9, 18, 6, 1, "W");
  g.r(11, 19, 2, 5, "q");
  g.r(2, 21, 2, 3, "W").r(20, 21, 2, 3, "W");
  g.r(5, 21, 3, 2, "W").r(16, 21, 3, 1, "W");
  // helmet
  g.disc(11.5, 9, 10, "T", 8.5);
  g.r(2, 9, 20, 8, "T").r(4, 17, 16, 1, "T");
  g.r(19, 9, 3, 8, "U").r(17, 3, 3, 6, "U").r(16, 17, 4, 1, "U");
  g.r(11, 1, 2, 4, "W").r(3, 9, 1, 5, "W");
  g.p(7, 2, "W").p(6, 3, "W").p(5, 4, "W");
  // visor (pushed up)
  g.r(5, 5, 14, 3, "V").r(7, 5, 4, 1, "X").r(14, 5, 2, 1, "X");
  // face opening
  g.r(6, 8, 12, 8, "S").r(6, 15, 12, 1, "D");
  g.r(6, 8, 1, 1, "D").r(17, 8, 1, 1, "D");
  if (mood === "gone") {
    g.r(6, 8, 12, 8, "V").r(7, 9, 4, 1, "X");
    g.text(10, 10, "?", "d");
    return { g, look };
  }
  // hair
  if (hairStyle === 1) g.r(6, 8, 12, 1, "H");
  if (hairStyle === 2) g.r(6, 8, 1, 4, "H").r(17, 8, 1, 4, "H");
  // nose
  g.r(11, 12, 2, 1, "D");
  // facial hair
  if (facial === 1) for (let x = 8; x < 16; x += 2) g.p(x, 15, "D").p(x + 1, 14, "D");
  if (facial === 2) g.r(9, 13, 6, 1, "H");
  if (facial === 3) g.r(6, 13, 12, 3, "H").r(9, 13, 6, 1, "S").r(11, 12, 2, 1, "D");
  // eyes and brows by mood
  if (mood === "happy") {
    g.p(7, 12, "k").p(8, 11, "k").p(9, 12, "k").p(14, 12, "k").p(15, 11, "k").p(16, 12, "k");
    g.r(7, 9, 3, 1, "H").r(14, 9, 3, 1, "H");
  } else {
    g.r(7, 11, 3, 2, "E").r(14, 11, 3, 2, "E");
    g.r(8 + look, 11, 1, 2, "k").r(15 + look, 11, 1, 2, "k");
    if (mood === "ok") g.r(7, 9, 3, 1, "H").r(14, 9, 3, 1, "H");
    if (mood === "tense") {
      g.p(7, 9, "H").p(8, 9, "H").p(9, 10, "H").p(14, 10, "H").p(15, 9, "H").p(16, 9, "H");
      g.p(17, 10, "l").p(17, 11, "b");
    }
    if (mood === "angry") {
      g.r(7, 11, 3, 1, "D").r(14, 11, 3, 1, "D");
      g.p(7, 8, "H").p(8, 9, "H").p(9, 10, "H").p(10, 10, "H").p(13, 10, "H").p(14, 10, "H").p(15, 9, "H").p(16, 8, "H");
      g.p(8, 8, "H").p(15, 8, "H");
      g.p(16, 10, "r").p(17, 9, "r").p(16, 9, "r");
    }
  }
  // mouth
  if (mood === "happy") g.r(10, 14, 4, 1, "W").p(9, 13, "e").p(14, 13, "e").r(10, 15, 4, 1, "e");
  if (mood === "ok") g.r(10, 14, 4, 1, "e");
  if (mood === "tense") g.r(9, 14, 6, 1, "W").p(11, 14, "e").p(13, 14, "e").r(9, 13, 6, 1, facial >= 2 ? "H" : "S");
  if (mood === "angry") g.r(10, 14, 4, 1, "e").p(9, 15, "e").p(14, 15, "e");
  return { g, look };
}

/** Driver head and helmet. teamColor colours the helmet and race suit; seed picks skin, hair and facial features. */
export function DriverPortrait({ code, teamColor, seed, mood = "ok", size = 64 }: { code: string; teamColor: string; seed: number | string; mood?: Mood; size?: number }) {
  const sd = hash(`${code}:${seed}`);
  const R = rng(sd ^ 0x9e3779b9);
  const skin = SKINS[Math.floor(R() * SKINS.length)];
  const hair = HAIRS[Math.floor(R() * HAIRS.length)];
  const visor = VISORS[Math.floor(R() * VISORS.length)];
  const stripe = [ "#f4e9d0", "#14111f", "#f9c74f" ][Math.floor(R() * 3)];
  const { g } = driverGrid(sd, mood);
  const gone = mood === "gone";
  const pal = palette(
    {
      T: teamColor,
      U: shade(teamColor, 0.62),
      Q: shade(teamColor, 0.78),
      q: shade(teamColor, 0.55),
      W: stripe,
      V: visor,
      X: shade(visor, 2.2),
      S: skin,
      D: shade(skin, 0.8),
      H: hair,
      E: "#f4e9d0",
    },
    gone,
  );
  return <Svg g={g.outline()} pal={pal} size={size} label={`${code} driver, ${mood}`} data={{ "data-mood": mood, "data-code": code }} />;
}

// ---------- staff ----------

const HEADSET_ROLES = /engineer|strateg|mechanic|race|coach|pit|spotter|radio|crew/i;
const GLASSES_ROLES = /design|aero|analyst|financ|scout|data|science|lawyer|legal/i;
const SUIT_ROLES = /boss|principal|director|financ|sponsor|media|lawyer|legal|commercial|chair|owner/i;

export function staffGrid(seed: number, role: string): Grid {
  const R = rng(seed);
  const hairStyle = Math.floor(R() * 5); // 0 bald 1 short 2 long 3 parted 4 cap-cut
  const headset = HEADSET_ROLES.test(role);
  const glasses = GLASSES_ROLES.test(role) || R() < 0.25;
  const suit = SUIT_ROLES.test(role);
  const look = R() < 0.5 ? 0 : 1;
  const g = new Grid(24, 24);
  // shoulders
  g.r(8, 18, 8, 1, "Q").r(5, 19, 14, 1, "Q").r(1, 20, 22, 4, "Q");
  g.r(10, 17, 4, 2, "D"); // neck
  if (suit) {
    g.r(9, 18, 6, 1, "E").r(10, 19, 4, 1, "E");
    g.p(11, 19, "R").p(12, 19, "R").r(11, 20, 2, 4, "R");
    g.r(8, 19, 2, 5, "q").r(14, 19, 2, 5, "q");
  } else {
    g.r(9, 18, 6, 1, "q").r(2, 21, 2, 3, "q").r(20, 21, 2, 3, "q");
    g.r(14, 21, 4, 2, "W");
  }
  // head
  g.disc(11.5, 9, 6, "S", 7.5);
  g.r(5, 9, 1, 3, "S").r(18, 9, 1, 3, "S"); // ears
  g.r(5, 10, 1, 2, "D").r(18, 10, 1, 2, "D");
  // hair
  if (hairStyle === 1) g.r(6, 2, 12, 3, "H").r(5, 4, 1, 4, "H").r(18, 4, 1, 4, "H").r(6, 5, 12, 1, "H");
  if (hairStyle === 2) g.r(6, 2, 12, 3, "H").r(4, 4, 2, 12, "H").r(18, 4, 2, 12, "H").r(6, 5, 12, 1, "H");
  if (hairStyle === 3) g.r(6, 2, 12, 3, "H").r(5, 4, 1, 5, "H").r(18, 4, 1, 5, "H").r(6, 5, 7, 1, "H").r(6, 6, 3, 1, "H");
  if (hairStyle === 4) g.r(7, 2, 10, 2, "H").r(6, 4, 2, 2, "H").r(16, 4, 2, 2, "H");
  if (hairStyle === 0) g.r(9, 2, 6, 1, "D");
  // face
  g.r(11, 12, 2, 1, "D");
  g.r(8, 9, 3, 1, "H").r(13, 9, 3, 1, "H");
  g.r(8, 11, 3, 2, "E").r(13, 11, 3, 2, "E");
  g.r(9 + look, 11, 1, 2, "k").r(14 + look, 11, 1, 2, "k");
  g.r(10, 14, 4, 1, "e").p(9, 13, "e").p(14, 13, "e");
  if (glasses) {
    g.r(7, 10, 5, 1, "G").r(7, 13, 5, 1, "G").r(7, 11, 1, 2, "G").r(11, 11, 1, 2, "G");
    g.r(12, 10, 5, 1, "G").r(12, 13, 5, 1, "G").r(12, 11, 1, 2, "G").r(16, 11, 1, 2, "G");
    g.p(11, 11, "G").p(12, 11, "G");
  }
  if (headset) {
    for (let y = 0; y <= 9; y++)
      for (let x = 0; x < 24; x++) {
        const v = ((x - 11.5) / 7.6) ** 2 + ((y - 9) / 8.4) ** 2;
        if (v <= 1.05 && v >= 0.78) g.p(x, y, "d");
      }
    g.r(4, 8, 2, 5, "T").r(18, 8, 2, 5, "T");
    g.r(4, 8, 1, 5, "W");
    g.r(5, 13, 1, 1, "d").r(5, 14, 3, 1, "d").r(8, 15, 3, 1, "d");
    g.r(10, 15, 2, 1, "T");
  }
  return g;
}

const SUITS = ["#2b3a67", "#3a3a48", "#5a2a3a", "#1f4a4a"];
const POLOS = ["#2ec4b6", "#ff7a1a", "#b66cff", "#4a9bf0"];

/** Staff head and shoulders. role steers the outfit (boss and finance in suits, engineers in headsets, designers in glasses). */
export function StaffPortrait({ seed, role = "staff", size = 64 }: { seed: number | string; role?: string; size?: number }) {
  const sd = hash(`${role}:${seed}`);
  const R = rng(sd ^ 0x85ebca6b);
  const skin = SKINS[Math.floor(R() * SKINS.length)];
  const hair = HAIRS[Math.floor(R() * HAIRS.length)];
  const suit = SUIT_ROLES.test(role);
  const body = suit ? SUITS[Math.floor(R() * SUITS.length)] : POLOS[Math.floor(R() * POLOS.length)];
  const g = staffGrid(sd, role);
  const pal = palette(
    { S: skin, D: shade(skin, 0.8), H: hair, Q: body, q: shade(body, 0.7), W: shade(body, 1.5), T: body, E: "#f4e9d0", R: "#e63946", G: "#6a5a8a" },
    false,
  );
  return <Svg g={g.outline()} pal={pal} size={size} label={`${role} staff portrait`} data={{ "data-role": role }} />;
}

export type Pose = "stand" | "crossed" | "slump" | "head" | "hips" | "shrug";

/** The head and shoulders from the portrait, carried down into a whole person: torso, arms in a pose, legs and shoes. */
export function staffBodyGrid(seed: number, role: string, pose: Pose): Grid {
  const top = staffGrid(seed, role);
  const g = new Grid(24, 46);
  for (let y = 0; y < 18; y++) for (let x = 0; x < 24; x++) g.c[y][x] = top.c[y][x];
  const suit = SUIT_ROLES.test(role);
  // torso
  g.r(10, 17, 4, 2, "D");
  g.r(7, 19, 10, 12, "Q").r(6, 19, 1, 4, "Q").r(17, 19, 1, 4, "Q");
  g.r(7, 19, 1, 12, "q").r(16, 19, 1, 12, "q");
  if (suit) { g.r(10, 19, 4, 1, "E").p(11, 20, "R").p(12, 20, "R").r(11, 21, 2, 8, "R"); g.r(9, 19, 1, 8, "q").r(14, 19, 1, 8, "q"); }
  else g.r(9, 19, 6, 1, "q");
  // legs and shoes
  g.r(8, 31, 3, 12, "P").r(13, 31, 3, 12, "P").r(11, 31, 2, 4, "P");
  g.r(7, 43, 4, 2, "B").r(13, 43, 4, 2, "B");
  const L = (x: number, y: number, w: number, h: number, c: string) => g.r(x, y, w, h, c);
  const R = (x: number, y: number, w: number, h: number, c: string) => g.r(24 - x - w, y, w, h, c);
  const both = (f: (put: typeof L) => void) => { f(L); f(R); };
  if (pose === "stand") both((p) => { p(4, 19, 3, 11, "A"); p(4, 30, 3, 2, "S"); });
  if (pose === "slump") both((p) => { p(5, 19, 3, 11, "A"); p(6, 30, 3, 2, "S"); });
  if (pose === "crossed") { both((p) => { p(4, 19, 3, 5, "A"); p(5, 23, 4, 3, "A"); }); g.r(7, 24, 10, 3, "A").r(5, 26, 2, 2, "S").r(17, 26, 2, 2, "S"); }
  if (pose === "hips") both((p) => { p(3, 19, 3, 4, "A"); p(2, 23, 3, 3, "A"); p(4, 26, 2, 2, "S"); });
  if (pose === "head") both((p) => { p(4, 19, 3, 3, "A"); p(2, 11, 3, 10, "A"); p(3, 8, 3, 3, "S"); });
  if (pose === "shrug") both((p) => { p(3, 20, 3, 3, "A"); p(0, 22, 4, 2, "A"); p(0, 20, 2, 2, "S"); });
  return g;
}

const poseFor = (react?: string): Pose => react === "fume" ? "crossed" : react === "stung" || react === "sulk" ? "slump" : react === "pale" ? "head" : react === "grin" || react === "proud" ? "hips" : react === "shrug" ? "shrug" : "stand";
const PANTS = ["#232a45", "#3a3446", "#2a3b3b", "#4a3a2a"];

/** A whole person, standing in a pose that matches how they feel. */
export function StaffBody({ seed, role = "staff", size = 80, react }: { seed: number | string; role?: string; size?: number; react?: string }) {
  const sd = hash(`${role}:${seed}`);
  const R = rng(sd ^ 0x85ebca6b);
  const skin = SKINS[Math.floor(R() * SKINS.length)];
  const hair = HAIRS[Math.floor(R() * HAIRS.length)];
  const suit = SUIT_ROLES.test(role);
  const body = suit ? SUITS[Math.floor(R() * SUITS.length)] : POLOS[Math.floor(R() * POLOS.length)];
  const g = staffBodyGrid(sd, role, poseFor(react));
  const pal = palette({ S: skin, D: shade(skin, 0.8), H: hair, Q: body, A: shade(body, 0.78), q: shade(body, 0.7), W: shade(body, 1.5), T: body, E: "#f4e9d0", R: "#e63946", G: "#6a5a8a", P: PANTS[Math.floor(R() * PANTS.length)], B: suit ? "#14111f" : "#e8e8e8" }, false);
  return (
    <svg viewBox="0 0 24 46" width={size} height={Math.round(size * 46 / 24)} shapeRendering="crispEdges" role="img" aria-label={`${role} staff, full figure`} className="dr-bodysvg" style={{ imageRendering: "pixelated", display: "block" }}>
      <title>{role}</title>
      {gridRects(g.outline().rows(), pal)}
    </svg>
  );
}
