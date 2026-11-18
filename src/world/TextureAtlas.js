import * as THREE from 'three';
import { ATLAS_TILE, ATLAS_COLS, ATLAS_ROWS } from './constants.js';
import { MATERIALS } from '../data/materials.js';
import { hash01 } from './noise.js';

/**
 * Procedural texture atlas: one 16x16 tile per material, generated at startup,
 * so the game ships with zero image assets. Single texture + single material
 * for the whole world.
 */

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const clamp255 = (v) => Math.max(0, Math.min(255, v));
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (c, f) => [c[0] * f, c[1] * f, c[2] * f];

function tilePixel(mat, x, y) {
  const T = ATLAS_TILE;
  const seed = mat.id * 7919;
  const base = hexToRgb(mat.color);
  const accent = hexToRgb(mat.accent);
  const n = hash01(x, y, 0, seed); // per-pixel noise
  const jitter = 0.9 + n * 0.2;

  switch (mat.pattern) {
    case 'speckle':
      return n > 0.88 ? scale(accent, 0.95 + n * 0.1) : scale(base, jitter);

    case 'stone': {
      const crack = hash01(x >> 1, y >> 1, 3, seed) > 0.86;
      return crack ? scale(accent, jitter) : scale(base, 0.92 + n * 0.14);
    }

    case 'ore': {
      // grey stone with a few ore clusters
      let inOre = false;
      for (let i = 0; i < 5; i++) {
        const cx = 2 + hash01(i, 1, 0, seed) * (T - 4);
        const cy = 2 + hash01(i, 2, 0, seed) * (T - 4);
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= 3.2) { inOre = true; break; }
      }
      if (inOre) return scale(accent, 0.85 + n * 0.3);
      return scale(base, 0.9 + n * 0.16);
    }

    case 'facets': {
      const t = (x + y) / (2 * T);
      const c = mix(base, accent, t * 0.8);
      const line = (x + y) % 8 === 0 || Math.abs(x - y) % 9 === 0;
      return line ? mix(c, [255, 255, 255], 0.35) : scale(c, jitter);
    }

    case 'swirl': {
      const w = Math.sin((x + y * 0.7) * 0.75 + hash01(0, 0, 1, seed) * 6) * 0.5 + 0.5;
      return scale(mix(base, accent, w * 0.7), jitter);
    }

    case 'void': {
      const edge = x === 0 || y === 0 || x === T - 1 || y === T - 1;
      if (n > 0.93) return scale(accent, 1.1);
      if (edge) return scale(accent, 0.35);
      return scale(base, 1 + n * 3);
    }

    case 'core': {
      const d = Math.hypot(x - 7.5, y - 7.5);
      const rings = Math.sin(d * 1.3) * 0.5 + 0.5;
      const edge = x === 0 || y === 0 || x === T - 1 || y === T - 1;
      if (edge) return [255, 255, 255];
      return mix(base, accent, rings * 0.65 + n * 0.12);
    }

    case 'ultimate': {
      const t = (Math.sin((x - y) * 0.6) * 0.5 + 0.5) * 0.6 + n * 0.4;
      if (n > 0.93) return [255, 255, 255];
      return mix(base, [255, 190, 60], t * 0.7);
    }

    default:
      return scale(base, jitter);
  }
}

export function createAtlasTexture() {
  const width = ATLAS_COLS * ATLAS_TILE;
  const height = ATLAS_ROWS * ATLAS_TILE;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(width, height);

  for (const mat of MATERIALS) {
    const tile = mat.id - 1;
    const tx = (tile % ATLAS_COLS) * ATLAS_TILE;
    const ty = Math.floor(tile / ATLAS_COLS) * ATLAS_TILE;
    for (let y = 0; y < ATLAS_TILE; y++) {
      for (let x = 0; x < ATLAS_TILE; x++) {
        const [r, g, b] = tilePixel(mat, x, y);
        const o = ((ty + y) * width + (tx + x)) * 4;
        img.data[o] = clamp255(r);
        img.data[o + 1] = clamp255(g);
        img.data[o + 2] = clamp255(b);
        img.data[o + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
