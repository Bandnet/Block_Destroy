// Data-driven material definitions. Add an entry here (and a free atlas slot)
// to introduce a new block type without touching game logic.
//
// id          : block id stored in chunk data (0 is air)
// maxHealth   : damage required to break the block
// reward      : resources granted when the block breaks (before multipliers)
// pattern     : procedural texture style used by TextureAtlas
// sound       : sound family used by the audio engine (see audio/sounds.js)
// debris      : particle colours (hex) used when the block breaks
// unlockLevel : first level in which this material can appear (informational / used by tests)
export const MATERIALS = [
  { id: 1,  key: 'dirt',     name: 'Dirt',              color: '#7a5230', accent: '#5a3b1f', pattern: 'speckle',  maxHealth: 10,        reward: 4,        sound: 'dirt',     debris: ['#7a5230', '#5a3b1f', '#8f6238'], unlockLevel: 1 },
  { id: 2,  key: 'grass',    name: 'Grass',             color: '#4f9d3a', accent: '#3a7a2a', pattern: 'speckle',  maxHealth: 15,        reward: 6,        sound: 'grass',    debris: ['#4f9d3a', '#3a7a2a', '#7a5230'], unlockLevel: 1 },
  { id: 3,  key: 'stone',    name: 'Stone',             color: '#8a8a8f', accent: '#686870', pattern: 'stone',    maxHealth: 100,       reward: 40,       sound: 'stone',    debris: ['#8a8a8f', '#686870', '#a4a4aa'], unlockLevel: 1 },
  { id: 4,  key: 'iron',     name: 'Iron',              color: '#8a8a8f', accent: '#d9b08c', pattern: 'ore',      maxHealth: 600,       reward: 240,      sound: 'iron',     debris: ['#d9b08c', '#8a8a8f', '#e8e8ee'], unlockLevel: 2 },
  { id: 5,  key: 'gold',     name: 'Gold',              color: '#8a8a8f', accent: '#ffd23f', pattern: 'ore',      maxHealth: 3500,      reward: 1400,     sound: 'gold',     debris: ['#ffd23f', '#ffb000', '#fff2a8'], unlockLevel: 4 },
  { id: 6,  key: 'diamond',  name: 'Diamond',           color: '#8a8a8f', accent: '#4fe8e4', pattern: 'ore',      maxHealth: 25000,     reward: 10000,    sound: 'diamond',  debris: ['#4fe8e4', '#b8fffb', '#2fb7c2'], unlockLevel: 5 },
  { id: 7,  key: 'crystal',  name: 'Crystal',           color: '#7b3fe0', accent: '#d9a8ff', pattern: 'facets',   maxHealth: 200000,    reward: 80000,    sound: 'crystal',  debris: ['#d9a8ff', '#7b3fe0', '#ffffff'], unlockLevel: 5 },
  { id: 8,  key: 'obsidian', name: 'Obsidian',          color: '#1c1230', accent: '#5a3a9a', pattern: 'swirl',    maxHealth: 2000000,   reward: 800000,   sound: 'obsidian', debris: ['#1c1230', '#5a3a9a', '#8c5cff'], unlockLevel: 6 },
  { id: 9,  key: 'void',     name: 'Void Material',     color: '#050008', accent: '#9a3dff', pattern: 'void',     maxHealth: 30000000,  reward: 12000000, sound: 'void',     debris: ['#9a3dff', '#050008', '#d9a8ff'], unlockLevel: 7 },
  { id: 10, key: 'ultimate', name: 'Ultimate Material', color: '#ffe9a0', accent: '#ffffff', pattern: 'ultimate', maxHealth: 600000000, reward: 240000000, sound: 'ultimate', debris: ['#ffe9a0', '#ffffff', '#ffb43a'], unlockLevel: 9 },
  // Special: only ever placed by the final level. Its health is set by the level (see levels.js).
  { id: 11, key: 'core',     name: 'The Core',          color: '#ff4fa0', accent: '#ffffff', pattern: 'core',     maxHealth: 40000000000, reward: 0,      sound: 'core',     debris: ['#ff4fa0', '#ffffff', '#ffe9a0'], unlockLevel: 10 },
];

const BY_ID = [];
for (const m of MATERIALS) BY_ID[m.id] = m;

export function getMaterial(id) {
  return BY_ID[id] || null;
}

export const MATERIAL_IDS = Object.freeze(
  Object.fromEntries(MATERIALS.map((m) => [m.key.toUpperCase(), m.id]))
);

/** Lookup table indexed by block id for hot loops (undefined for air). */
export const MATERIAL_TABLE = BY_ID;
