import type { Psyche } from "../sim/types";

/**
 * How each real driver comes across, as a game character.
 *
 * These are the game's own reading of each driver's public image (how they talk to the media, how they race,
 * how they handle team orders). They are NOT facts about the people and the radio lines they produce are invented.
 * Edit freely: every number is 0..1.
 *
 * Order of the numbers: ego, obedience, volatility, patience, humour, selfBelief, loyalty, talkative.
 */

const T = (voice: Psyche["voice"], wet: number, ego: number, obedience: number, volatility: number, patience: number, humour: number, selfBelief: number, loyalty: number, talkative: number) => ({
  voice,
  wet,
  ego,
  obedience,
  volatility,
  patience,
  humour,
  selfBelief,
  loyalty,
  talkative,
});

export const PERSONALITIES: Record<string, ReturnType<typeof T>> = {
  WEX: T("analyst", 0.62, 0.6, 0.65, 0.45, 0.5, 0.5, 0.7, 0.7, 0.7),
  BEL: T("sunny", 0.55, 0.45, 0.75, 0.5, 0.5, 0.6, 0.6, 0.8, 0.6),
  COR: T("fire", 0.6, 0.7, 0.55, 0.8, 0.35, 0.4, 0.65, 0.7, 0.8),
  HAR: T("elder", 0.92, 0.6, 0.6, 0.45, 0.6, 0.45, 0.8, 0.7, 0.6),
  CAR: T("sunny", 0.7, 0.55, 0.6, 0.55, 0.5, 0.85, 0.55, 0.7, 0.8),
  QUI: T("analyst", 0.68, 0.6, 0.55, 0.2, 0.75, 0.4, 0.85, 0.6, 0.4),
  BRO: T("blunt", 0.95, 0.95, 0.3, 0.5, 0.3, 0.5, 0.98, 0.45, 0.6),
  FOU: T("anxious", 0.55, 0.5, 0.7, 0.75, 0.35, 0.4, 0.55, 0.7, 0.6),
  SOR: T("sunny", 0.65, 0.35, 0.8, 0.35, 0.65, 0.7, 0.6, 0.85, 0.6),
  ALA: T("analyst", 0.7, 0.6, 0.55, 0.4, 0.55, 0.45, 0.8, 0.65, 0.65),
  DEL: T("fire", 0.66, 0.6, 0.5, 0.75, 0.35, 0.5, 0.7, 0.6, 0.7),
  PAL: T("sunny", 0.55, 0.5, 0.65, 0.6, 0.45, 0.6, 0.55, 0.7, 0.6),
  VAL: T("blunt", 0.62, 0.65, 0.45, 0.65, 0.35, 0.3, 0.75, 0.5, 0.5),
  ASH: T("sunny", 0.58, 0.5, 0.65, 0.55, 0.5, 0.65, 0.65, 0.7, 0.6),
  RAT: T("fire", 0.6, 0.6, 0.5, 0.7, 0.35, 0.4, 0.65, 0.6, 0.65),
  WHI: T("anxious", 0.5, 0.45, 0.8, 0.55, 0.5, 0.45, 0.5, 0.8, 0.5),
  ALD: T("elder", 0.72, 0.4, 0.75, 0.25, 0.75, 0.8, 0.65, 0.85, 0.55),
  TAV: T("sunny", 0.55, 0.55, 0.6, 0.55, 0.45, 0.6, 0.8, 0.65, 0.65),
  GAR: T("elder", 0.9, 0.85, 0.35, 0.6, 0.35, 0.6, 0.95, 0.5, 0.75),
  BRI: T("anxious", 0.78, 0.5, 0.6, 0.65, 0.4, 0.3, 0.6, 0.6, 0.35),
  CAD: T("elder", 0.6, 0.5, 0.7, 0.45, 0.6, 0.6, 0.65, 0.75, 0.55),
  LAH: T("elder", 0.62, 0.35, 0.8, 0.3, 0.7, 0.85, 0.6, 0.85, 0.5),
};

export const DEFAULT_PSYCHE: Psyche = {
  voice: "analyst",
  ego: 0.5,
  obedience: 0.6,
  volatility: 0.5,
  patience: 0.5,
  humour: 0.5,
  selfBelief: 0.6,
  loyalty: 0.65,
  talkative: 0.55,
};

export function psycheFor(code: string): { psyche: Psyche; wet: number } {
  const p = PERSONALITIES[code];
  if (!p) return { psyche: DEFAULT_PSYCHE, wet: 0.5 };
  const { wet, ...psyche } = p;
  return { psyche, wet };
}

