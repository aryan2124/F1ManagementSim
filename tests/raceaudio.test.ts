// @ts-nocheck
import { describe, expect, it, vi } from "vitest";

/** A recording fake of the parts of the Web Audio API the race audio uses. */
function fakeContext() {
  const made = { osc: 0, noiseSources: 0, filters: [] as { type: string; frequency: { value: number } }[] };
  const node = () => ({ connect: () => undefined, disconnect: () => undefined, gain: param(), frequency: param(), Q: param(), detune: param(), playbackRate: param() });
  const param = () => ({ value: 0, setTargetAtTime: () => undefined, setValueAtTime: () => undefined, linearRampToValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined, cancelScheduledValues: () => undefined });
  const c = {
    currentTime: 0,
    sampleRate: 8000,
    createGain: node,
    createOscillator: () => {
      made.osc++;
      return { ...node(), type: "sine", start: () => undefined, stop: () => undefined };
    },
    createBiquadFilter: () => {
      const f = { ...node(), type: "lowpass" };
      made.filters.push(f as never);
      return f;
    },
    createBuffer: (_n: number, len: number) => ({ getChannelData: () => new Float32Array(len) }),
    createBufferSource: () => {
      made.noiseSources++;
      return { ...node(), buffer: null, loop: false, start: () => undefined, stop: () => undefined };
    },
  };
  return { c, made };
}

describe("the race audio keeps the engine and has no background drone", () => {
  it("builds the engine from rpm layers, air and rain from soft noise (no crowd), with no hissy filters", async () => {
    const { c, made } = fakeContext();
    vi.resetModules();
    const sound = await import("../src/audio/sound");
    vi.spyOn(sound.audioCore, "context").mockReturnValue(c as never);
    vi.spyOn(sound.audioCore, "sfxInput").mockReturnValue(node() as never);
    function node() { return { connect: () => undefined } as never; }
    const { RaceAudio } = await import("../src/audio/raceAudio");
    const fakeSession = { onEvent: () => () => undefined, followId: "a", speed: 1 };
    const audio = new RaceAudio(fakeSession as never);
    (audio as any).build();
    // one tone only: the thin turbo and motor whine. The engine itself is four looped rpm layers
    expect(made.osc).toBe(1);
    // one engine loop, air and rain: there is no crowd layer
    expect(made.noiseSources).toBe(3);
    // no high-pass anywhere, and every low-pass (the engine tone control tops out at 9.5 kHz) rolls the top off
    expect(made.filters.some((f) => f.type === "highpass")).toBe(false);
    for (const f of made.filters.filter((x) => x.type === "lowpass")) expect(f.frequency.value).toBeLessThanOrEqual(9500);
  });
});
