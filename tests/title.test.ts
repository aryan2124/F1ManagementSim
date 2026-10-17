import { describe, expect, it } from "vitest";
import { sessionTitle } from "../src/ui/sessionTitle";

describe("session titles", () => {
  it("a sprint is not a Grand Prix and sprint qualifying is not qualifying", () => {
    expect(sessionTitle("British Grand Prix", "race")).toBe("British Grand Prix");
    expect(sessionTitle("British Grand Prix", "sprint")).toBe("British Sprint");
    expect(sessionTitle("British Grand Prix", "quali")).toBe("British Grand Prix Qualifying");
    expect(sessionTitle("British Grand Prix", "sq")).toBe("British Sprint Qualifying");
    expect(sessionTitle("Monaco GP", "sprint")).toBe("Monaco GP Sprint");
  });
});
