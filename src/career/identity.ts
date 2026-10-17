import { TEAMS } from "../game/data";
import type { CareerState } from "./types";

/**
 * What a team is called and what colour its car wears, for anyone in the league. A person's own livery and title sponsor
 * are published here (see publishIdentity) so every screen, the race sim, the podium and the unveiling read one place.
 */
export function identityOf(s: CareerState, id: string = s.teamId): { name: string; base: string; color: number; prefix: string | null; changed: boolean } {
  const t = TEAMS.find((x) => x.id === id);
  const base = t?.name ?? id;
  const mine = id === s.teamId ? s.brand : undefined;
  const rec = s.identity?.[id] ?? (mine ? { prefix: mine.prefix, color: mine.color } : undefined);
  const prefix = rec?.prefix ?? null;
  const color = rec?.color ?? t?.color ?? 0xff3b3b;
  return { name: prefix ? `${prefix} ${base}` : base, base, color, prefix, changed: !!prefix || rec?.color != null };
}

/** Copy the current person's livery and name into the shared league record. Safe to call any time. */
export function publishIdentity(s: CareerState) {
  if (!s.brand) return;
  (s.identity ??= {})[s.teamId] = { prefix: s.brand.prefix, color: s.brand.color };
}
