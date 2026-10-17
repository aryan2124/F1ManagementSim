/** Small, fast, seedable PRNG (mulberry32). Same seed => same sequence, on every machine. */
export class Rng {
  private a: number;
  constructor(seed: number) {
    // scramble so that neighbouring seeds (1, 2, 3...) give unrelated streams
    this.a = Math.imul((seed >>> 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
    this.a = Math.imul(this.a ^ (this.a >>> 13), 0xc2b2ae35) >>> 0;
  }
  /** Float in [0, 1). */
  next(): number {
    this.a = (this.a + 0x6d2b79f5) >>> 0;
    let t = this.a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
  /** Approximate normal distribution (sum of uniforms), mean 0, sd 1. */
  gauss(): number {
    return (this.next() + this.next() + this.next() + this.next() - 2) * 1.7320508;
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length) % arr.length];
  }
  get state(): number {
    return this.a;
  }
}

/** Derive a stable 32-bit seed from a string (for naming leagues / seasons). */
export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
