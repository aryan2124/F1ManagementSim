import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

/** Audit: every exported function or constant in the game layers is used somewhere else in src. New dead code fails here. */
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) ? [p] : []; });

// exports that are deliberate public surface (tests, dev tools, or kept for saves) and not called by the game itself
const KNOWN = new Set<string>(JSON.parse(readFileSync(join(__dirname, "helpers/knownUnused.json"), "utf8")));

describe("audit: connectedness", () => {
  it("no new exported function or constant is left unused", () => {
    const files = walk("src").filter((f) => !f.includes("generated"));
    const text = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));
    const unused: string[] = [];
    for (const f of files.filter((x) => /src\/(career|sim)\//.test(x))) {
      for (const m of text.get(f)!.matchAll(/^export (?:function|const) (\w+)/gm)) {
        const name = m[1];
        const re = new RegExp(`\\b${name}\\b`, "g");
        // used = referenced anywhere in src besides its own declaration
        let n = 0;
        for (const g of files) n += (text.get(g)!.match(re) ?? []).length;
        const used = n >= 2;
        if (!used) unused.push(`${f.replace("src/", "")}:${name}`);
      }
    }
    const fresh = unused.filter((u) => !KNOWN.has(u));
    expect(fresh, `unused exports (use them, remove them, or list them in tests/helpers/knownUnused.json):\n${fresh.join("\n")}`).toEqual([]);
  });
});
