// Tool progression. Each tool is a big jump in power (roughly x8 damage per tier).
//
// effects (all optional) are merged into the player's stats by systems/Stats.js:
//   critChance, rewardMul, areaRadius, areaFraction, columnRadius, columnDepth,
//   columnFraction, magnetRadius, magnetSpeed
// model: procedural first-person model (see player/ToolViewmodel.js)
// sound: see audio/AudioDirector.js
// minLevel: the highest unlocked level needed before the tool can be bought.
export const TOOLS = [
  {
    id: 'wooden', name: 'Wooden Pickaxe', blurb: 'Splinters easily, but it gets you started.',
    damage: 4, hps: 2, cost: 0, minLevel: 1, effects: {},
    sound: { kind: 'pick', pitch: 0.85 },
    model: { shape: 'pick', head: '#9a6a3a', handle: '#6b4423', glow: null },
  },
  {
    id: 'stone', name: 'Stone Pickaxe', blurb: 'A heavier head and a steadier swing.',
    damage: 12, hps: 2.2, cost: 150, minLevel: 1, effects: { rewardMul: 1.1 },
    sound: { kind: 'pick', pitch: 0.95 },
    model: { shape: 'pick', head: '#8a8a8f', handle: '#6b4423', glow: null },
  },
  {
    id: 'iron', name: 'Iron Pickaxe', blurb: 'Forged to find weak points.',
    damage: 60, hps: 2.5, cost: 2000, minLevel: 2, effects: { critChance: 0.05 },
    sound: { kind: 'pick', pitch: 1.05 },
    model: { shape: 'pick', head: '#d6d8de', handle: '#5a3b1f', glow: null },
  },
  {
    id: 'golden', name: 'Golden Pickaxe', blurb: 'Everything it touches turns to profit.',
    damage: 300, hps: 3, cost: 25000, minLevel: 3, effects: { rewardMul: 1.25 },
    sound: { kind: 'pick', pitch: 1.2 },
    model: { shape: 'pick', head: '#ffd23f', handle: '#7a4a1e', glow: '#ffd23f' },
  },
  {
    id: 'diamond', name: 'Diamond Pickaxe', blurb: 'Shatters the block and rattles its neighbours.',
    damage: 2500, hps: 3.5, cost: 300000, minLevel: 4, effects: { areaRadius: 1, areaFraction: 0.3 },
    sound: { kind: 'pick', pitch: 1.4 },
    model: { shape: 'pick', head: '#4fe8e4', handle: '#3a3a52', glow: '#4fe8e4' },
  },
  {
    id: 'drill', name: 'Industrial Drill', blurb: 'Hold the trigger and let the motor do the work.',
    damage: 25000, hps: 6, cost: 4_000_000, minLevel: 5, effects: { areaRadius: 1, areaFraction: 0.35 },
    sound: { kind: 'drill', loop: 'loop_drill', pitch: 1 },
    model: { shape: 'drill', head: '#c9ccd4', handle: '#d9772b', glow: null },
  },
  {
    id: 'plasma', name: 'Plasma Drill', blurb: 'A superheated bit that burns a wide crater.',
    damage: 250000, hps: 8, cost: 60_000_000, minLevel: 6, effects: { areaRadius: 1.5, areaFraction: 0.4 },
    sound: { kind: 'laser', loop: 'loop_plasma', pitch: 1 },
    model: { shape: 'drill', head: '#7df0ff', handle: '#2a3550', glow: '#4fd1ff' },
  },
  {
    id: 'quantum', name: 'Quantum Extractor', blurb: 'Pulls resources to you from far across the world.',
    damage: 2_500_000, hps: 10, cost: 1_000_000_000, minLevel: 7,
    effects: { areaRadius: 2, areaFraction: 0.45, magnetRadius: 12, magnetSpeed: 10 },
    sound: { kind: 'laser', loop: 'loop_quantum', pitch: 1.1 },
    model: { shape: 'rings', head: '#b48cff', handle: '#2a2250', glow: '#b48cff' },
  },
  {
    id: 'void', name: 'Void Destroyer', blurb: 'Opens a shaft straight down into the dark.',
    damage: 25_000_000, hps: 12, cost: 30_000_000_000, minLevel: 8,
    effects: { areaRadius: 2.5, areaFraction: 0.5, columnRadius: 1, columnDepth: 10, columnFraction: 0.6 },
    sound: { kind: 'laser', loop: 'loop_void', pitch: 0.8 },
    model: { shape: 'cannon', head: '#9a3dff', handle: '#10081f', glow: '#9a3dff' },
  },
  {
    id: 'ultimate', name: 'Ultimate Matter Disintegrator', blurb: 'Deletes whole regions of reality.',
    damage: 300_000_000, hps: 15, cost: 1_000_000_000_000, minLevel: 9,
    effects: { areaRadius: 5, areaFraction: 0.6 },
    sound: { kind: 'laser', loop: 'loop_ultimate', pitch: 1.3 },
    model: { shape: 'cannon', head: '#fff2c8', handle: '#ffb43a', glow: '#ffe9a0' },
  },
];

const BY_ID = Object.fromEntries(TOOLS.map((t) => [t.id, t]));

export function getTool(id) {
  return BY_ID[id] || TOOLS[0];
}

export function toolIndex(id) {
  return TOOLS.findIndex((t) => t.id === id);
}

/** Human-readable bullet points for a tool's special properties. */
export function describeTool(tool) {
  const e = tool.effects;
  const lines = [];
  if (e.critChance) lines.push(`+${Math.round(e.critChance * 100)}% critical chance`);
  if (e.rewardMul) lines.push(`+${Math.round((e.rewardMul - 1) * 100)}% resources`);
  if (e.areaRadius) lines.push(`Splash radius ${e.areaRadius} (${Math.round((e.areaFraction || 0.25) * 100)}% damage)`);
  if (e.columnRadius) lines.push(`Shaft ${e.columnRadius * 2 + 1} wide, ${e.columnDepth} deep`);
  if (e.magnetRadius) lines.push(`+${e.magnetRadius} pickup range, faster pull`);
  if (tool.sound.kind === 'drill') lines.push('Hold to mine continuously');
  if (!lines.length) lines.push('No special properties');
  return lines;
}
