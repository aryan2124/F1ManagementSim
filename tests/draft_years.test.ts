import { expect, it, vi } from "vitest";
import { newCareer } from "../src/career/world";
import { autoTo } from "../src/career/autoplay";
import { driversOf } from "../src/career/finance";
vi.setConfig({ testTimeout: 900000 });
it("a full season with the draft on ends with a closed draft and two drivers in every team", () => {
  const s = newCareer("fer", 8);
  s.era.current = { ...(s.era.current ?? ({} as never)), modules: [{ id: "theDraft", intensity: 0.6 }] } as never;
  const start = s.year;
  // run to a month into the next year
  let guard = 0;
  while (s.year === start && guard++ < 30) autoTo(s, s.day + 30, 30);
  autoTo(s, s.day + 40, 40);
  expect(s.draft, "a draft was held").toBeTruthy();
  expect(s.draft!.year).toBe(start);
  expect(s.draft!.done).toBe(true);
  for (const id of Object.keys(s.teams)) expect(driversOf(s, id).length, id).toBeGreaterThanOrEqual(2);
});
