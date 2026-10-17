import { initDesigns } from "./design";
import { initRoles } from "./status";
import { initRecords } from "./records";
import { newBrand } from "./brand";
import { newPress, newRift } from "./dressing";
import { initAcademy, newAcademy } from "./academy";
import { initEras, newEraState } from "./eras";
import { defaultBudgets } from "./finance";
import { makeOwner } from "./people";
import { Rng, hashSeed } from "../sim/rng";
import { makeStaff } from "./world";
import { makeManagers } from "./talks";
import type { CareerState } from "./types";

/** Brings a career saved by an earlier build up to the current shape. Safe to run on a current state. */
export function upgradeState(s: CareerState): CareerState {
  for (const t of Object.values(s.teams)) {
    const l = t.ledger as Record<string, number>;
    for (const k of ["academy", "drivers", "staffPay", "rnd"]) if (l[k] === undefined) l[k] = 0;
  }
  for (const d of Object.values(s.drivers)) {
    if (d.grievance === undefined) d.grievance = 0;
    if (d.gStage === undefined) d.gStage = 0;
    if (!d.causes) d.causes = {};
  }
  s.spendLog = s.spendLog ?? [];
  s.promises = s.promises ?? [];
  s.rumours = s.rumours ?? [];
  s.rivalries = s.rivalries ?? [];
  s.records = s.records ?? {};
  s.legacy = s.legacy ?? [];
  s.hall = s.hall ?? [];
  s.lastMonth = s.lastMonth ?? -1;
  s.story = s.story ?? { last: {}, count: {}, bigDay: -99, mediaDay: -99, mediaCount: 0, tone: 0, arcs: {} };
  const rng = new Rng(hashSeed(`mig:${s.seed}`));
  s.owner = s.owner ?? makeOwner(s, rng);
  if (!s.era) {
    s.era = newEraState("natural");
    initEras(s);
  }
  if (!s.academy) {
    s.academy = newAcademy();
    // scouts and coaches for every team so the new roles exist
    let n = Object.keys(s.staff).length + 500;
    for (const id of Object.keys(s.teams)) {
      for (const role of ["scout", "coach"] as const) {
        if (Object.values(s.staff).some((x) => x.teamId === id && x.role === role)) continue;
        const sid = `st-${++n}`;
        s.staff[sid] = makeStaff(rng, sid, role, id, 62 + rng.gauss() * 6, s.year);
      }
    }
    initAcademy(s);
  }
  if (!s.brand) s.brand = newBrand(s);
  if (!s.rift) s.rift = newRift();
  if (!s.press) s.press = newPress();
  if (!s.budgets) s.budgets = defaultBudgets(s);
  s.talks = s.talks ?? [];
  s.convos = s.convos ?? [];
  s.driverKnow = s.driverKnow ?? {};
  initRecords(s);
  if (!s.rolesSeeded) {
    // saves from before roles followed stature: everyone was an equal. Read the roles from the records once.
    const done = initRoles(s, true);
    s.rolesSeeded = true;
    const mine = done.find((x) => x.startsWith(`${s.teamId}:`));
    if (mine) (s.recap ??= []).unshift(`Driver roles set from their records: ${mine.slice(s.teamId.length + 1)}. You can change this in the driver talks.`);
  }
  if (!s.managers) s.managers = makeManagers();
  initDesigns(s);
  return s;
}
