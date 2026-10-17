import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* ---------- a minimal AudioContext mock that counts created nodes ---------- */

const clock = { t: 0 };
const made = { nodes: 0, oscillators: 0, sources: 0, contexts: 0 };

class MockParam {
  value = 0;
  setValueAtTime() {
    return this;
  }
  linearRampToValueAtTime() {
    return this;
  }
  exponentialRampToValueAtTime() {
    return this;
  }
  setTargetAtTime() {
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
}

class MockNode {
  constructor() {
    made.nodes++;
  }
  connect() {}
  disconnect() {}
}

class MockGain extends MockNode {
  gain = new MockParam();
}
class MockFilter extends MockNode {
  type = "lowpass";
  frequency = new MockParam();
  Q = new MockParam();
}
class MockOsc extends MockNode {
  type = "sine";
  frequency = new MockParam();
  onended: (() => void) | null = null;
  constructor() {
    super();
    made.oscillators++;
  }
  setPeriodicWave() {}
  start() {}
  stop() {}
}
class MockSource extends MockNode {
  buffer: unknown = null;
  loop = false;
  onended: (() => void) | null = null;
  constructor() {
    super();
    made.sources++;
  }
  start() {}
  stop() {}
}

class MockAudioContext {
  state = "running";
  sampleRate = 8000;
  destination = new MockNode();
  constructor() {
    made.contexts++;
  }
  get currentTime() {
    return clock.t;
  }
  resume() {
    return Promise.resolve();
  }
  createGain() {
    return new MockGain();
  }
  createDynamicsCompressor() {
    const n = new MockNode() as MockNode & Record<string, { value: number }>;
    for (const k of ["threshold", "knee", "ratio", "attack", "release"]) n[k] = { value: 0 };
    return n;
  }
  createBiquadFilter() {
    return new MockFilter();
  }
  createDelay() {
    const n = new MockNode() as MockNode & { delayTime: { value: number } };
    n.delayTime = { value: 0 };
    return n;
  }
  createOscillator() {
    return new MockOsc();
  }
  createBufferSource() {
    return new MockSource();
  }
  createBuffer(_ch: number, len: number) {
    return { getChannelData: () => new Float32Array(len) };
  }
  createPeriodicWave() {
    return {};
  }
}

/* ---------- localStorage stub ---------- */

function installStorage(): Map<string, string> {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  return store;
}

async function fresh() {
  vi.resetModules();
  const snd = await import("../src/audio/sound");
  const mus = await import("../src/audio/music");
  return { ...snd, ...mus };
}

function tickMs(ms: number) {
  clock.t += ms / 1000;
  vi.advanceTimersByTime(ms);
}

beforeEach(() => {
  clock.t = 0;
  made.nodes = made.oscillators = made.sources = made.contexts = 0;
  vi.useFakeTimers();
  vi.stubGlobal("AudioContext", MockAudioContext);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("sfx", () => {
  it("play() never throws for any name, with or without AudioContext", async () => {
    installStorage();
    const { sfx, SFX_NAMES } = await fresh();
    // before unlock: no context, silent no-op
    for (const n of SFX_NAMES) expect(() => sfx.play(n)).not.toThrow();
    expect(made.contexts).toBe(0);
    sfx.unlock();
    expect(made.contexts).toBe(1);
    for (const n of SFX_NAMES) {
      expect(() => sfx.play(n)).not.toThrow();
      vi.advanceTimersByTime(500);
    }
    expect(made.oscillators).toBeGreaterThan(SFX_NAMES.length);
    // unknown name and garbage must not throw either
    expect(() => sfx.play("nope" as never)).not.toThrow();
  });

  it("is a safe no-op when AudioContext does not exist", async () => {
    vi.stubGlobal("AudioContext", undefined);
    installStorage();
    const { sfx, SFX_NAMES } = await fresh();
    sfx.unlock();
    for (const n of SFX_NAMES) expect(() => sfx.play(n)).not.toThrow();
    expect(made.nodes).toBe(0);
  });

  it("survives a context whose constructor throws", async () => {
    installStorage();
    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          throw new Error("blocked");
        }
      },
    );
    const { sfx } = await fresh();
    expect(() => sfx.unlock()).not.toThrow();
    expect(() => sfx.play("click")).not.toThrow();
  });

  it("muted does not create any nodes", async () => {
    installStorage();
    const { sfx, SFX_NAMES } = await fresh();
    sfx.unlock();
    sfx.setMuted(true);
    const before = made.nodes;
    for (const n of SFX_NAMES) sfx.play(n);
    expect(made.nodes).toBe(before);
    sfx.setMuted(false);
    sfx.play("confirm");
    expect(made.nodes).toBeGreaterThan(before);
  });

  it("throttles rapid repeats of the same sound", async () => {
    installStorage();
    const { sfx } = await fresh();
    sfx.unlock();
    sfx.play("day");
    const n = made.nodes;
    sfx.play("day");
    expect(made.nodes).toBe(n);
    vi.advanceTimersByTime(300);
    sfx.play("day");
    expect(made.nodes).toBeGreaterThan(n);
  });
});

describe("settings", () => {
  it("persist to localStorage and reload", async () => {
    const store = installStorage();
    const a = await fresh();
    a.sfx.setMuted(true);
    a.sfx.setVolume(0.25);
    a.music.setVolume(0.1);
    expect(JSON.parse(store.get("boxbox.sound.v1")!)).toEqual({ muted: true, sfxVolume: 0.25, musicVolume: 0.1 });
    const b = await fresh();
    expect(b.sfx.isMuted()).toBe(true);
    expect(b.sfx.getVolume()).toBeCloseTo(0.25);
    expect(b.music.getVolume()).toBeCloseTo(0.1);
  });

  it("clamps volumes and ignores corrupt stored data", async () => {
    const store = installStorage();
    store.set("boxbox.sound.v1", "{not json");
    const a = await fresh();
    expect(a.sfx.isMuted()).toBe(false);
    a.sfx.setVolume(9);
    expect(a.sfx.getVolume()).toBe(1);
    a.sfx.setVolume(-3);
    expect(a.sfx.getVolume()).toBe(0);
    a.sfx.setVolume(Number.NaN);
    expect(a.sfx.getVolume()).toBe(0);
  });

  it("works when localStorage throws on every call", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    });
    const a = await fresh();
    expect(() => a.sfx.setMuted(true)).not.toThrow();
    expect(a.sfx.isMuted()).toBe(true);
    expect(() => a.sfx.setVolume(0.4)).not.toThrow();
    expect(a.sfx.getVolume()).toBeCloseTo(0.4);
    a.sfx.unlock();
    a.sfx.setMuted(false);
    expect(() => a.sfx.play("click")).not.toThrow();
  });

  it("works when localStorage does not exist at all", async () => {
    vi.stubGlobal("localStorage", undefined);
    const a = await fresh();
    expect(() => a.sfx.setVolume(0.5)).not.toThrow();
    expect(a.sfx.getVolume()).toBe(0.5);
  });

  it("notifies subscribers with a new settings object", async () => {
    installStorage();
    const { sfx, audioCore } = await fresh();
    const fn = vi.fn();
    const off = audioCore.subscribe(fn);
    const s1 = audioCore.getSettings();
    sfx.setMuted(true);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(audioCore.getSettings()).not.toBe(s1);
    sfx.setMuted(true); // unchanged: no notification
    expect(fn).toHaveBeenCalledTimes(1);
    off();
  });
});

describe("music", () => {
  it("every track compiles and its melody bars parse", async () => {
    installStorage();
    const { music, parseMelodyBar } = await fresh();
    expect(parseMelodyBar("A5 - . B5")).toEqual([
      [0, 81, 8],
      [12, 83, 4],
    ]);
    for (const t of music.tracks) {
      expect(() => music.play(t)).not.toThrow();
    }
  });

  it("waits for a user gesture, then starts and loops with the lookahead scheduler", async () => {
    installStorage();
    const { music, sfx } = await fresh();
    music.play("menu");
    expect(music.current()).toBe("menu");
    expect(music.isPlaying()).toBe(false); // no gesture yet
    expect(made.contexts).toBe(0);
    sfx.unlock();
    expect(music.isPlaying()).toBe(true);
    const osc0 = made.oscillators;
    expect(osc0).toBeGreaterThan(0);
    for (let i = 0; i < 30; i++) tickMs(100);
    expect(made.oscillators).toBeGreaterThan(osc0 + 10);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("switching tracks leaves exactly one scheduler; stop() ends them all", async () => {
    installStorage();
    const { music, sfx } = await fresh();
    sfx.unlock();
    music.play("factory");
    tickMs(200);
    music.play("race");
    expect(music.current()).toBe("race");
    tickMs(3000); // crossfade finishes, old player disposed
    expect(vi.getTimerCount()).toBe(1);
    music.play("race"); // same track: no second scheduler
    tickMs(100);
    expect(vi.getTimerCount()).toBe(1);
    music.stop();
    expect(music.current()).toBeNull();
    expect(music.isPlaying()).toBe(false);
    tickMs(3000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("muting stops the scheduler without creating nodes, unmuting resumes", async () => {
    installStorage();
    const { music, sfx } = await fresh();
    sfx.unlock();
    music.play("results");
    tickMs(300);
    sfx.setMuted(true);
    expect(music.isPlaying()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    const n = made.nodes;
    tickMs(1000);
    music.play("tense");
    expect(made.nodes).toBe(n);
    sfx.setMuted(false);
    expect(music.isPlaying()).toBe(true);
    expect(music.current()).toBe("tense");
  });

  it("never throws without AudioContext", async () => {
    vi.stubGlobal("AudioContext", undefined);
    installStorage();
    const { music, sfx } = await fresh();
    sfx.unlock();
    expect(() => {
      music.play("rules");
      music.setVolume(0.3);
      music.stop();
    }).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });
});
