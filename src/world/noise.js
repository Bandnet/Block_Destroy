// Small, fast, deterministic integer hash + value noise (no dependencies).

/** Hash three integers + seed to a float in [0, 1). */
export function hash01(x, y, z, seed) {
  let h = seed | 0;
  h ^= Math.imul(x | 0, 0x27d4eb2d);
  h ^= Math.imul(y | 0, 0x165667b1);
  h ^= Math.imul(z | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

/** 2D value noise in [0, 1). */
export function noise2(x, z, seed) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = smooth(x - x0);
  const fz = smooth(z - z0);
  const a = hash01(x0, 0, z0, seed);
  const b = hash01(x0 + 1, 0, z0, seed);
  const c = hash01(x0, 0, z0 + 1, seed);
  const d = hash01(x0 + 1, 0, z0 + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

/** Fractal noise (3 octaves) in [0, 1). */
export function fbm2(x, z, seed) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < 3; o++) {
    sum += noise2(x * freq, z * freq, seed + o * 131) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}
