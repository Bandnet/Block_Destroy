import { MATERIAL_IDS as M } from './materials.js';
import { getTool } from './tools.js';

// The ten levels. Everything about a level is data:
//   terrain  - world generation (see world/WorldGenerator.js)
//   env      - sky, fog, light tint and ambient particles
//   target   - blocks that must be destroyed to complete the level
//   parTime  - the time you are expected to beat (ms)
//   requires - what unlocks the level: previous level completed, plus optionally a tool
//   music    - mood for the generative soundtrack (see audio/Music.js)
//
// Material mixes are tuned with tools/balance-sim.mjs so that each level is
// several times tougher than the last.

const mix = (...pairs) => pairs.map(([id, w]) => ({ id, w }));

export const LEVELS = [
  {
    id: 1, name: 'The Beginning', tagline: 'Soft ground and easy blocks. Learn the ropes.',
    target: 100, parTime: 150_000, requiresTool: null,
    terrain: {
      seed: 101, shape: 'hills', baseHeight: 30, amplitude: 9, scale: 48,
      surface: M.GRASS, subsurface: M.DIRT, subsurfaceDepth: 3,
      mix: mix([M.DIRT, 0.55], [M.STONE, 0.45]),
    },
    env: { sky: '#8fc7ff', fog: '#bfe3ff', tint: '#ffffff', ambient: { kind: 'drift', color: '#fff6b0', count: 120, size: 0.07, speed: 0.15 } },
    music: { root: 57, scale: 'major', tempo: 72, mood: 'bright' },
  },
  {
    id: 2, name: 'The Underground', tagline: 'Dark caves where iron glints in the stone.',
    target: 250, parTime: 330_000, requiresTool: null,
    terrain: {
      seed: 202, shape: 'cave', baseHeight: 22, amplitude: 4, scale: 40, ceilGap: 16, ceilVar: 6,
      surface: M.DIRT, subsurface: M.STONE, subsurfaceDepth: 2,
      mix: mix([M.STONE, 0.6], [M.DIRT, 0.2], [M.IRON, 0.2]),
    },
    env: { sky: '#0d0a08', fog: '#17110d', tint: '#c2b2a0', ambient: { kind: 'drift', color: '#b89a7a', count: 160, size: 0.06, speed: 0.1 } },
    music: { root: 50, scale: 'minor', tempo: 60, mood: 'dark' },
  },
  {
    id: 3, name: 'The Quarry', tagline: 'Terraced cliffs of stone and iron.',
    target: 1000, parTime: 300_000, requiresTool: null,
    terrain: {
      seed: 303, shape: 'quarry', baseHeight: 28, amplitude: 10, scale: 55, step: 4,
      surface: M.STONE, subsurface: M.STONE, subsurfaceDepth: 2,
      mix: mix([M.STONE, 0.55], [M.IRON, 0.4], [M.GOLD, 0.05]),
    },
    env: { sky: '#b9c4d0', fog: '#c5ced8', tint: '#e8e4de', ambient: { kind: 'drift', color: '#d8d2c4', count: 140, size: 0.06, speed: 0.12 } },
    music: { root: 52, scale: 'dorian', tempo: 80, mood: 'industrial' },
  },
  {
    id: 4, name: 'The Golden Fields', tagline: 'Rolling fields glittering with gold veins.',
    target: 10000, parTime: 240_000, requiresTool: 'iron',
    terrain: {
      seed: 404, shape: 'hills', baseHeight: 30, amplitude: 6, scale: 70,
      surface: M.GOLD, subsurface: M.IRON, subsurfaceDepth: 2,
      mix: mix([M.IRON, 0.55], [M.GOLD, 0.4], [M.STONE, 0.05]),
    },
    env: { sky: '#ffd88a', fog: '#ffe3a8', tint: '#fff0d0', ambient: { kind: 'rise', color: '#ffd23f', count: 160, size: 0.08, speed: 0.4 } },
    music: { root: 55, scale: 'major', tempo: 84, mood: 'warm' },
  },
  {
    id: 5, name: 'The Crystal World', tagline: 'Glowing ridges of gold, diamond and crystal.',
    target: 25000, parTime: 420_000, requiresTool: 'diamond',
    terrain: {
      seed: 505, shape: 'ridges', baseHeight: 22, amplitude: 20, scale: 36, patch: 4,
      surface: M.DIAMOND, subsurface: M.GOLD, subsurfaceDepth: 2,
      mix: mix([M.GOLD, 0.6], [M.DIAMOND, 0.34], [M.CRYSTAL, 0.06]),
    },
    env: { sky: '#1b0f3a', fog: '#2a1658', tint: '#d8c8ff', ambient: { kind: 'twinkle', color: '#d9a8ff', count: 220, size: 0.09, speed: 0.1 } },
    music: { root: 62, scale: 'lydian', tempo: 66, mood: 'glassy' },
  },
  {
    id: 6, name: 'The Deep Core', tagline: 'Scorching caverns near the planet’s heart.',
    target: 150_000, parTime: 300_000, requiresTool: 'drill',
    terrain: {
      seed: 606, shape: 'cave', baseHeight: 20, amplitude: 5, scale: 38, ceilGap: 18, ceilVar: 8,
      surface: M.DIAMOND, subsurface: M.DIAMOND, subsurfaceDepth: 2,
      mix: mix([M.DIAMOND, 0.7], [M.CRYSTAL, 0.26], [M.OBSIDIAN, 0.04]),
    },
    env: { sky: '#1a0505', fog: '#2a0a06', tint: '#ffb89a', ambient: { kind: 'rise', color: '#ff7a2d', count: 200, size: 0.08, speed: 1.2 } },
    music: { root: 45, scale: 'phrygian', tempo: 70, mood: 'ominous' },
  },
  {
    id: 7, name: 'The Void', tagline: 'Floating islands in endless dark.',
    target: 500_000, parTime: 390_000, requiresTool: 'plasma', voidFloor: true,
    terrain: {
      seed: 707, shape: 'islands', baseHeight: 30, scale: 44, threshold: 0.5, spawnRadius: 34,
      surface: M.CRYSTAL, subsurface: M.CRYSTAL, subsurfaceDepth: 2,
      mix: mix([M.CRYSTAL, 0.6], [M.OBSIDIAN, 0.36], [M.VOID, 0.04]),
    },
    env: { sky: '#02000a', fog: '#07021a', tint: '#c9b8ff', ambient: { kind: 'stars', color: '#ffffff', count: 700, size: 1.4, speed: 0 } },
    music: { root: 48, scale: 'minor', tempo: 52, mood: 'void' },
  },
  {
    id: 8, name: 'The Infinite Mine', tagline: 'Endless shafts of obsidian and void.',
    target: 4_000_000, parTime: 330_000, requiresTool: null,
    terrain: {
      seed: 808, shape: 'shafts', baseHeight: 22, cell: 8,
      surface: M.OBSIDIAN, subsurface: M.OBSIDIAN, subsurfaceDepth: 2,
      mix: mix([M.OBSIDIAN, 0.8], [M.VOID, 0.2]),
    },
    env: { sky: '#06090d', fog: '#0b1118', tint: '#9fc4d8', ambient: { kind: 'drift', color: '#9fc4d8', count: 180, size: 0.06, speed: 0.2 } },
    music: { root: 47, scale: 'dorian', tempo: 90, mood: 'machine' },
  },
  {
    id: 9, name: 'The Final Frontier', tagline: 'A nebula of void and the first Ultimate Material.',
    target: 6_000_000, parTime: 450_000, requiresTool: 'quantum', voidFloor: true,
    terrain: {
      seed: 909, shape: 'islands', baseHeight: 34, scale: 52, threshold: 0.48, spawnRadius: 40,
      surface: M.VOID, subsurface: M.VOID, subsurfaceDepth: 2,
      mix: mix([M.VOID, 0.78], [M.OBSIDIAN, 0.2], [M.ULTIMATE, 0.02]),
    },
    env: { sky: '#07041a', fog: '#150a3a', tint: '#ffd0ff', ambient: { kind: 'stars', color: '#ffc8ff', count: 900, size: 1.6, speed: 0 } },
    music: { root: 59, scale: 'lydian', tempo: 76, mood: 'cosmic' },
  },
  {
    id: 10, name: 'The Ultimate Grind', tagline: 'One monolith. Destroy it all. Then destroy the Core.',
    target: 10_000_000, parTime: 450_000, requiresTool: 'void', finale: true,
    terrain: {
      seed: 1010, shape: 'monolith', baseHeight: 22, towerHeight: 62, towerX: 8, towerZ: -34, towerHalf: 7,
      surface: M.VOID, subsurface: M.VOID, subsurfaceDepth: 3,
      mix: mix([M.VOID, 0.75], [M.ULTIMATE, 0.25]),
      towerMix: mix([M.ULTIMATE, 0.8], [M.VOID, 0.2]),
    },
    env: { sky: '#000000', fog: '#0a0a14', tint: '#fff2c8', ambient: { kind: 'rise', color: '#ffe9a0', count: 260, size: 0.09, speed: 0.6 } },
    music: { root: 52, scale: 'major', tempo: 100, mood: 'triumph' },
  },
];

export const LEVEL_COUNT = LEVELS.length;

export function getLevel(id) {
  return LEVELS[id - 1] || null;
}

/** Why a level is locked, or null if it can be played. `ctx` = { completed: {id: true}, ownedTools: [] } */
export function lockReason(levelId, ctx) {
  const lvl = getLevel(levelId);
  if (!lvl) return 'Unknown level';
  if (levelId > 1 && !ctx.completed[levelId - 1]) return `Complete ${getLevel(levelId - 1).name}`;
  if (lvl.requiresTool && !ctx.ownedTools.includes(lvl.requiresTool)) return `Requires the ${toolName(lvl.requiresTool)}`;
  return null;
}

function toolName(id) {
  return getTool(id).name;
}
