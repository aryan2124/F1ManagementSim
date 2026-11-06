/**
 * Track character for the season-start track report. Values are 1 (low) to 5 (high). `src` lists the columns that came from a
 * published source (see the project doc box-box-track-data); every other value is a best guess and is shown as an estimate.
 * pit is seconds lost in a green-flag stop.
 */
export type TrackCol = "df" | "pow" | "brk" | "cool" | "pass" | "pit";
export interface TrackRow { df: number; pow: number; brk: number; cool: number; pass: number; pit: number; src: TrackCol[] }
const R = (df: number, pow: number, brk: number, cool: number, pass: number, pit: number, src: TrackCol[] = []): TrackRow => ({ df, pow, brk, cool, pass, pit, src });

export const TRACK_DATA: Record<string, TrackRow> = {
  "albert-park": R(3, 3, 3, 3, 3, 21),
  shanghai: R(4, 3, 4, 3, 4, 23),
  suzuka: R(4, 3, 3, 3, 2, 22),
  miami: R(3, 4, 3, 4, 3, 19.7, ["pit"]),
  montreal: R(2, 4, 5, 2, 3, 18),
  monaco: R(5, 1, 5, 4, 1, 22.0, ["df", "pow", "brk", "pit"]),
  barcelona: R(4, 3, 3, 3, 2, 23.8, ["df", "pit"]),
  "red-bull-ring": R(2, 4, 4, 3, 4, 21.5, ["df", "pow", "pit"]),
  silverstone: R(4, 4, 3, 2, 3, 21.0, ["df", "pow", "pit"]),
  spa: R(2, 5, 3, 2, 4, 18.4, ["df", "pow", "pit"]),
  hungaroring: R(5, 2, 3, 4, 1, 21, ["df", "pow"]),
  zandvoort: R(4, 2, 3, 3, 2, 19),
  monza: R(1, 5, 4, 2, 4, 24, ["df", "pow"]),
  madring: R(4, 3, 3, 4, 3, 21),
  baku: R(2, 5, 4, 2, 4, 21, ["df", "pow"]),
  sepang: R(4, 3, 3, 5, 3, 22),
  "marina-bay": R(5, 2, 4, 5, 2, 27.9, ["df", "pow", "brk", "pit"]),
  cota: R(4, 4, 3, 3, 4, 21, ["pow"]),
  mexico: R(5, 3, 3, 5, 3, 23, ["df"]),
  interlagos: R(3, 4, 3, 3, 4, 20, ["pow"]),
  "las-vegas": R(1, 5, 3, 2, 4, 19),
  lusail: R(4, 3, 3, 4, 3, 27.7, ["pit"]),
  "yas-marina": R(3, 4, 4, 4, 3, 21),
  bahrain: R(3, 4, 4, 4, 4, 22, ["pow"]),
  jeddah: R(2, 5, 3, 3, 3, 21, ["pow"]),
  imola: R(5, 3, 3, 3, 1, 25, ["df"]),
};
export const trackRow = (id: string): TrackRow => TRACK_DATA[id] ?? R(3, 3, 3, 3, 3, 22);
export const COL_LABEL: Record<TrackCol, string> = { df: "DOWNFORCE", pow: "POWER", brk: "BRAKING", cool: "COOLING", pass: "OVERTAKING", pit: "PIT LOSS" };
