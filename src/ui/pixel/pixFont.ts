/** Tiny 3x5 bitmap font so canvas signs and banners stay crisp pixel art with no font loading. */
const GLYPHS: Record<string, string> = {
  A: "010101111101101",
  B: "110101110101110",
  C: "011100100100011",
  D: "110101101101110",
  E: "111100110100111",
  F: "111100110100100",
  G: "011100101101011",
  H: "101101111101101",
  I: "111010010010111",
  J: "001001001101010",
  K: "101101110101101",
  L: "100100100100111",
  M: "101111111101101",
  N: "110101101101101",
  O: "010101101101010",
  P: "110101110100100",
  Q: "010101101111011",
  R: "110101110101101",
  S: "011100010001110",
  T: "111010010010010",
  U: "101101101101111",
  V: "101101101101010",
  W: "101101111111101",
  X: "101101010101101",
  Y: "101101010010010",
  Z: "111001010100111",
  "0": "111101101101111",
  "1": "010110010010111",
  "2": "110001010100111",
  "3": "110001010001110",
  "4": "101101111001001",
  "5": "111100110001110",
  "6": "011100111101111",
  "7": "111001010010010",
  "8": "111101111101111",
  "9": "111101111001110",
  "?": "110001010000010",
  "!": "010010010000010",
  "-": "000000111000000",
  ".": "000000000000010",
  "%": "101001010100101",
  ":": "000010000010000",
};

export function textWidth(s: string, scale = 1): number {
  return Math.max(0, s.length * 4 * scale - scale);
}

export function drawText(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, scale = 1): void {
  ctx.fillStyle = color;
  let cx = Math.round(x);
  for (const raw of s.toUpperCase()) {
    const g = GLYPHS[raw];
    if (g) {
      for (let i = 0; i < 15; i++) {
        if (g[i] === "1") ctx.fillRect(cx + (i % 3) * scale, Math.round(y) + Math.floor(i / 3) * scale, scale, scale);
      }
    }
    cx += 4 * scale;
  }
}
