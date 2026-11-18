import * as THREE from 'three';
import { MATERIAL_TABLE } from '../data/materials.js';

const tmpColor = new THREE.Color();
const hexToRgb = (hex) => {
  tmpColor.set(hex); // converts sRGB -> linear, matching the renderer's colour pipeline
  return [tmpColor.r, tmpColor.g, tmpColor.b];
};

/** Sound tier for a batch: rarer materials and lucky drops get more distinctive pickups. */
export function pickupTier(maxId, lucky, jackpots) {
  if (jackpots > 0) return 3;
  if (maxId >= 9) return 3;
  if (maxId >= 6) return 2;
  if (maxId >= 4 || lucky > 0) return 1;
  return 0;
}

/**
 * Turns broken-block batches into resources.
 *
 * Blocks broken within the magnet radius pay out instantly. Farther ones release a
 * few homing orbs (visual + sound) that credit their share when they reach the player.
 * Every batch produces at most a handful of orbs, however many blocks it destroyed.
 */
export class LootSystem {
  constructor({ events, economy, particles, audio, getPlayerPos, getStats }) {
    this.events = events;
    this.economy = economy;
    this.particles = particles;
    this.audio = audio;
    this.getPlayerPos = getPlayerPos;
    this.getStats = getStats;
    this.enabled = true;

    particles.onOrbArrive = (value, tier) => {
      this.economy.add(value);
      this.audio.playPickup(tier);
    };

    events.on('blocksBroken', (b) => this._onBatch(b));
  }

  _onBatch(b) {
    if (!this.enabled) return;
    const eye = this.getPlayerPos();
    const stats = this.getStats();

    // Average distance of the sampled blocks to the player
    let dist = 0;
    for (let i = 0; i < b.sampleCount; i++) {
      const o = i * 4;
      dist += Math.hypot(b.samples[o] + 0.5 - eye.x, b.samples[o + 1] + 0.5 - eye.y, b.samples[o + 2] + 0.5 - eye.z);
    }
    dist = b.sampleCount ? dist / b.sampleCount : 0;

    const tier = pickupTier(b.maxId, b.lucky, b.jackpots);
    const orbs = Math.min(5, b.sampleCount, Math.max(1, Math.ceil(Math.log2(b.count + 1))));

    if (dist <= stats.magnetRadius || this.particles.free < orbs + 8 || orbs === 0) {
      this.economy.add(b.reward);
      this.audio.playPickup(tier);
      return;
    }

    const share = b.reward / orbs;
    for (let k = 0; k < orbs; k++) {
      const o = Math.floor((k / orbs) * b.sampleCount) * 4;
      const id = b.samples[o + 3];
      const mat = MATERIAL_TABLE[id];
      const [r, g, bl] = hexToRgb(mat ? mat.debris[mat.debris.length - 1] : '#ffffff');
      this.particles.spawnOrb(b.samples[o] + 0.5, b.samples[o + 1] + 0.5, b.samples[o + 2] + 0.5, share, tier, r, g, bl);
    }
  }

  /** Pay out everything still flying (e.g. at level end). */
  flush() {
    this.particles.flushOrbs();
  }
}
