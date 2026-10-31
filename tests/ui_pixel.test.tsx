import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MODULES } from "../src/career/modules";
import { CATEGORY_COLOR, DEPT_KINDS, DEPT_MAPS, DeptIcon, FALLBACK_MAP, ICON_MAPS, ModuleIcon, hasIcon } from "../src/ui/pixel/icons";
import { DriverPortrait, StaffPortrait, type Mood } from "../src/ui/pixel/portraits";
import { NewsAnchor } from "../src/ui/pixel/NewsAnchor";
import { BANNER_THEMES, ScreenBanner } from "../src/ui/pixel/banners";

const render = (n: React.ReactElement) => renderToStaticMarkup(n);
// node's fs is loaded dynamically so the file typechecks without @types/node
const modName = "node:fs";
async function raw(name: string): Promise<string> {
  const fs = await import(/* @vite-ignore */ modName);
  return fs.readFileSync(new URL(`../src/ui/pixel/${name}`, import.meta.url), "utf8") as string;
}

describe("module icons", () => {
  it("covers all 50 module ids with a non-fallback icon", () => {
    expect(MODULES.length).toBe(50);
    for (const m of MODULES) {
      expect(hasIcon(m.id), m.id).toBe(true);
      const html = render(<ModuleIcon id={m.id} />);
      expect(html).toContain('data-fallback="0"');
      expect(html).toContain(`data-icon="${m.id}"`);
      expect(html).toContain("<rect");
    }
  });
  it("has no icons for ids that are not modules", () => {
    const ids = new Set(MODULES.map((m) => m.id));
    for (const k of Object.keys(ICON_MAPS)) expect(ids.has(k), k).toBe(true);
  });
  it("every icon is 16x16 and unique", () => {
    const seen = new Map<string, string>();
    for (const [id, rows] of Object.entries(ICON_MAPS)) {
      expect(rows.length).toBe(16);
      for (const r of rows) expect(r.length).toBe(16);
      const key = rows.join("|");
      expect(seen.get(key), `${id} duplicates ${seen.get(key)}`).toBeUndefined();
      seen.set(key, id);
      expect(key).not.toBe(FALLBACK_MAP.join("|"));
      // an icon should actually draw something
      expect(rows.join("").replace(/\./g, "").length).toBeGreaterThan(40);
    }
    for (const kind of DEPT_KINDS) {
      const key = DEPT_MAPS[kind].join("|");
      expect(seen.get(key), `dept ${kind} duplicates ${seen.get(key)}`).toBeUndefined();
      seen.set(key, `dept:${kind}`);
    }
  });
  it("unknown ids fall back to the generic icon", () => {
    const html = render(<ModuleIcon id="notAModule" size={20} />);
    expect(html).toContain('data-fallback="1"');
    expect(html).toContain('width="20"');
  });
  it("has a colour for every category used", () => {
    for (const m of MODULES) expect(CATEGORY_COLOR[m.category], m.category).toMatch(/^#[0-9a-f]{6}$/i);
  });
  it("renders every department icon", () => {
    expect(DEPT_KINDS.length).toBe(14);
    for (const k of ["tunnel", "simulator", "factory", "academy", "cash", "cap", "board", "fans", "sponsor", "media", "calendar", "rules", "people", "car"] as const)
      expect(render(<DeptIcon kind={k} />)).toContain(`data-dept="${k}"`);
  });
});

describe("portraits", () => {
  const moods: Mood[] = ["happy", "ok", "tense", "angry", "gone"];
  it("renders each mood and the moods differ", () => {
    const outs = moods.map((m) => render(<DriverPortrait code="BRO" teamColor="#e63946" seed={5} mood={m} />));
    for (const o of outs) expect(o).toContain("<svg");
    expect(new Set(outs).size).toBe(moods.length);
  });
  it("is deterministic per seed and varies across seeds", () => {
    const a = render(<DriverPortrait code="HAR" teamColor="#2ec4b6" seed={1} />);
    expect(render(<DriverPortrait code="HAR" teamColor="#2ec4b6" seed={1} />)).toBe(a);
    const many = new Set(Array.from({ length: 12 }, (_, i) => render(<DriverPortrait code="HAR" teamColor="#2ec4b6" seed={i} />)));
    expect(many.size).toBeGreaterThan(6);
  });
  it("uses the team colour for the helmet", () => {
    expect(render(<DriverPortrait code="COR" teamColor="#123456" seed={2} />).toLowerCase()).toContain("#123456");
  });
  it("renders staff in every role", () => {
    for (const role of ["boss", "engineer", "strategist", "designer", "finance", "scout", "coach", "media", "unknown role"])
      for (const seed of [0, 1, 2, 99]) expect(render(<StaffPortrait seed={seed} role={role} />)).toContain("<svg");
  });
});

describe("scenes", () => {
  it("renders the news anchor with and without breaking", () => {
    const plain = render(<NewsAnchor />);
    expect(plain).toContain("news-anchor");
    expect(plain).not.toContain("BREAKING");
    const brk = render(<NewsAnchor breaking headline="Team principal sacked" />);
    expect(brk).toContain("BREAKING");
    expect(brk).toContain("Team principal sacked");
  });
  it("renders every banner theme and they differ", () => {
    const outs = BANNER_THEMES.map((t) => render(<ScreenBanner theme={t} />));
    expect(BANNER_THEMES.length).toBe(10);
    expect(new Set(outs).size).toBe(10);
    for (const o of outs) expect(o).toContain("<rect");
  });
  it("themes.css defines a panel rule for every banner theme", async () => {
    const css = await raw("themes.css");
    expect(css.length).toBeGreaterThan(500);
    for (const t of BANNER_THEMES.filter((x) => x !== "hq")) expect(css).toContain(`.theme-${t} .panel`);
  });
  it("uses no em dashes in the pixel files", async () => {
    const dash = String.fromCharCode(8212);
    for (const f of ["grid.tsx", "icons.tsx", "portraits.tsx", "NewsAnchor.tsx", "banners.tsx", "themes.css"]) {
      const text = await raw(f);
      expect(text.length, f).toBeGreaterThan(100);
      expect(text.includes(dash), f).toBe(false);
    }
  });
});
