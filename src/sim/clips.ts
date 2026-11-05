/** Short film of an incident: where every car was on the road, every half second, from 10 s before to 3 s after. */
export interface ClipFrame { tick: number; s: Record<string, number> }
export interface Clip { tick: number; kind: string; text: string; cars: string[]; frames: ClipFrame[] }

const EVERY = 5;
const BEFORE = 100;
const AFTER = 30;
const MAX_CLIPS = 14;

export class ClipRecorder {
  readonly clips: Clip[] = [];
  private ring: ClipFrame[] = [];
  private open: { clip: Clip; until: number }[] = [];

  /** Called once a tick with each car's distance round the lap (metres, running total). */
  frame(tick: number, positions: () => Record<string, number>) {
    if (tick % EVERY !== 0) return;
    const f: ClipFrame = { tick, s: positions() };
    this.ring.push(f);
    if (this.ring.length > BEFORE / EVERY + 1) this.ring.shift();
    for (const o of this.open) o.clip.frames.push(f);
    this.open = this.open.filter((o) => tick < o.until);
  }

  mark(tick: number, kind: string, text: string, cars: string[]) {
    if (this.clips.length >= MAX_CLIPS) return;
    if (this.clips.some((c) => tick - c.tick < 60 && c.cars.some((id) => cars.includes(id)))) return;
    const clip: Clip = { tick, kind, text, cars, frames: [...this.ring] };
    this.clips.push(clip);
    this.open.push({ clip, until: tick + AFTER });
  }
}
