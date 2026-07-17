/* oxlint-disable no-bitwise, unicorn/prefer-math-trunc -- mulberry32 and the
   seed hashing below are integer bit-mixing algorithms: `| 0` / `>>> 0` are
   the int32/uint32 wrapping they are built on. Math.trunc is NOT equivalent
   (it neither wraps nor drops the sign bit). */
import sharp from "sharp";

import type { Config } from "./config";

// Renders a seeded, surreal flow-field (domain-warped fractal noise with
// contour bands) into a grayscale PNG for ascii-image-converter to pick up.
// The seed defaults to today's date, so the daily CI run draws a new one.

const mulberry32 = (seed: number) => {
  let state = seed;

  return () => {
    state = (state + 0x6d_2b_79_f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);

    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);

    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const hashSeed = (text: string) => {
  let hash = 9;

  for (const char of text) {
    hash = (Math.imul(hash, 31) + (char.codePointAt(0) ?? 0)) | 0;
  }

  return hash;
};

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const createNoise = (random: () => number) => {
  const size = 64;
  const grid = Array.from({ length: size * size }, random);
  const at = (x: number, y: number) =>
    grid[(((y % size) + size) % size) * size + (((x % size) + size) % size)] ??
    0;

  return (x: number, y: number) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = smooth(x - x0);
    const ty = smooth(y - y0);

    return lerp(
      lerp(at(x0, y0), at(x0 + 1, y0), tx),
      lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), tx),
      ty
    );
  };
};

export const renderArt = async (
  art: Config["art"],
  file: string
): Promise<void> => {
  const seed =
    art.seed === "daily" ? new Date().toISOString().slice(0, 10) : art.seed;
  const noise = createNoise(mulberry32(hashSeed(seed)));
  const fbm = (x: number, y: number) => {
    let value = 0;
    let amplitude = 0.55;
    let fx = x;
    let fy = y;

    for (let octave = 0; octave < art.octaves; octave += 1) {
      value += amplitude * noise(fx, fy);
      fx *= 2.03;
      fy *= 1.97;
      amplitude *= 0.5;
    }

    return value;
  };

  const { height, width } = art;
  const pixels = Buffer.alloc(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = (x / width) * art.scale;
      const ny = (y / height) * art.scale;
      const warped = fbm(
        nx + art.warp * fbm(nx + 5.2, ny + 1.3),
        ny + art.warp * fbm(nx + 9.7, ny + 4.6)
      );
      // Cosine contour bands over the warped field: reads as flowing,
      // topographic streaks once mapped to the ASCII ramp.
      const banded =
        0.5 + 0.5 * Math.cos(2 * Math.PI * (warped * art.bands + nx * 0.35));

      pixels[y * width + x] = Math.round(banded ** art.contrast * 255);
    }
  }

  await sharp(pixels, { raw: { channels: 1, height, width } })
    .png()
    .toFile(file);
};
