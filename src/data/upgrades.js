import { formatNumber } from '../util/format.js';

// Upgrade tree: 8 branches x 6 tiers = 48 nodes, each with several levels.
//
// effect: { stat, mode: 'mul' | 'add', per }
//   mul: every level multiplies the stat by (1 + per)
//   add: every level adds `per` to the stat
// Costs: baseCost x growth^level. Later tiers cost far more but are far stronger.
// Requirements: the previous tier in the same branch, and from tier 4 on also a
// node from the neighbouring branch, so the tree is genuinely interconnected.

export const STATS_INFO = {
  damageMul:     { label: 'damage',            fmt: 'mul' },
  hitsMul:       { label: 'hit speed',         fmt: 'mul' },
  rewardMul:     { label: 'resources',         fmt: 'mul' },
  critChance:    { label: 'critical chance',   fmt: 'pct' },
  critMult:      { label: 'critical damage',   fmt: 'x' },
  areaRadius:    { label: 'splash radius',     fmt: 'num', unit: ' blocks' },
  areaFraction:  { label: 'splash damage',     fmt: 'pct' },
  magnetRadius:  { label: 'pickup range',      fmt: 'num', unit: ' blocks' },
  magnetSpeed:   { label: 'pickup speed',      fmt: 'num' },
  luckChance:    { label: 'lucky drop chance', fmt: 'pct' },
  luckMult:      { label: 'lucky drop bonus',  fmt: 'x' },
  jackpotChance: { label: 'jackpot chance',    fmt: 'pct' },
  jackpotMult:   { label: 'jackpot bonus',     fmt: 'x' },
  autoRate:      { label: 'drone hits/sec',    fmt: 'num' },
  autoFraction:  { label: 'drone damage',      fmt: 'pct' },
  autoRadius:    { label: 'drone range',       fmt: 'num', unit: ' blocks' },
};

export const BRANCHES = [
  { id: 'damage',     name: 'Damage',            color: '#ff5468', costMul: 1.0, blurb: 'Hit harder.' },
  { id: 'speed',      name: 'Breaking Speed',    color: '#ffd23f', costMul: 1.2, blurb: 'Hit faster.' },
  { id: 'resource',   name: 'Resource Efficiency', color: '#5dff9a', costMul: 1.0, blurb: 'Earn more from every block.' },
  { id: 'crit',       name: 'Critical Hits',     color: '#ff8a3d', costMul: 1.5, blurb: 'Land devastating strikes.' },
  { id: 'multibreak', name: 'Multibreak',        color: '#b48cff', costMul: 5.0, blurb: 'Break whole areas at once.' },
  { id: 'magnet',     name: 'Magnetism',         color: '#4fd1ff', costMul: 0.7, blurb: 'Pull resources in from afar.' },
  { id: 'luck',       name: 'Luck',              color: '#ff7ad9', costMul: 1.3, blurb: 'Fortune favours the grinder.' },
  { id: 'automation', name: 'Automation',        color: '#e8eefc', costMul: 1.6, blurb: 'Let drones do the grinding.' },
];

// A node unlocks once the player has reached this level (tier), shifted later for
// the more powerful branches so power arrives alongside the story.
const TIER_LEVEL = [1, 2, 3, 5, 7, 9];
const BRANCH_LEVEL_OFFSET = { damage: 0, speed: 0, resource: 0, magnet: 0, crit: 1, luck: 1, automation: 2, multibreak: 5 };

// Cost of the first level of a tier-N node, and how fast cost grows per level.
const TIER_BASE = [60, 4e3, 3e5, 2e7, 2e9, 2e11];
const TIER_GROWTH = [1.6, 1.7, 1.8, 1.85, 1.9, 1.95];
const TIER_MAX = [10, 10, 8, 8, 6, 5];

// [name, description, stat, mode, per, maxOverride?]  per branch, tiers 1-6
const DEFS = {
  damage: [
    ['Sharpened Edge',   'A keener edge bites deeper into every block.',          'damageMul', 'mul', 0.15],
    ['Reinforced Head',  'A sturdier head transfers more force.',                 'damageMul', 'mul', 0.18],
    ['Kinetic Amplifier','Stores swing energy and releases it on impact.',        'damageMul', 'mul', 0.20],
    ['Overcharge Core',  'A power core feeds extra energy into each hit.',        'damageMul', 'mul', 0.22],
    ['Titan Force',      'Strikes with the weight of a falling mountain.',        'damageMul', 'mul', 0.25],
    ['Planet Cracker',   'Enough power to split a world.',                        'damageMul', 'mul', 0.30],
  ],
  speed: [
    ['Quick Grip',       'A better grip lets you swing sooner.',                  'hitsMul', 'mul', 0.06],
    ['Ergonomic Handle', 'Less fatigue, faster cycles.',                          'hitsMul', 'mul', 0.06],
    ['Rapid Cycling',    'Tuned mechanisms reset instantly.',                     'hitsMul', 'mul', 0.08],
    ['Overclock',        'Pushes your tool past its safe limits.',                'hitsMul', 'mul', 0.08],
    ['Hyper Drive',      'Hits arrive in a continuous blur.',                     'hitsMul', 'mul', 0.10],
    ['Time Dilation',    'Your tool experiences more time than you do.',          'hitsMul', 'mul', 0.12],
  ],
  resource: [
    ['Efficient Extraction', 'Waste less of every block you break.',              'rewardMul', 'mul', 0.12],
    ['Ore Refining',         'Refine raw material on the spot.',                  'rewardMul', 'mul', 0.15],
    ['Resource Compression', 'Pack more value into every drop.',                  'rewardMul', 'mul', 0.18],
    ['Midas Protocol',       'Everything you mine is worth more.',                'rewardMul', 'mul', 0.20],
    ['Matter Conversion',    'Convert leftover matter into currency.',            'rewardMul', 'mul', 0.25],
    ['Wealth Singularity',   'Value collapses inward and keeps growing.',         'rewardMul', 'mul', 0.30],
  ],
  crit: [
    ['Keen Eye',            'Spot weak points more often.',                       'critChance', 'add', 0.02],
    ['Heavy Blows',         'Critical hits hit even harder.',                     'critMult',   'add', 0.20],
    ['Precision',           'Read the block before you strike.',                  'critChance', 'add', 0.02],
    ['Devastating Strikes', 'Criticals leave nothing standing.',                  'critMult',   'add', 0.35],
    ['Critical Mass',       'Weak points are everywhere.',                        'critChance', 'add', 0.025],
    ['Perfect Strike',      'A flawless hit, over and over.',                     'critMult',   'add', 1.00],
  ],
  multibreak: [
    ['Splash Damage',     'Hits spill over into nearby blocks.',                  'areaRadius',   'add', 0.5, 4],
    ['Shockwave Efficiency','Nearby blocks take more of each hit.',               'areaFraction', 'add', 0.04],
    ['Chain Reaction',    'The shockwave travels farther.',                       'areaRadius',   'add', 0.5, 6],
    ['Resonance Field',   'Neighbours resonate and shatter together.',            'areaFraction', 'add', 0.04],
    ['Demolition Core',   'A blast core widens every impact.',                    'areaRadius',   'add', 0.5, 4],
    ['Cataclysm',         'Each strike becomes an explosion.',                    'areaRadius',   'add', 1.0, 4],
  ],
  magnet: [
    ['Magnetic Pull',    'Resources drift toward you.',                           'magnetRadius', 'add', 1.5],
    ['Faster Collection','Orbs fly to you more quickly.',                         'magnetSpeed',  'add', 2],
    ['Gravity Well',     'A wider field collects instantly.',                     'magnetRadius', 'add', 3],
    ['Tractor Beam',     'Orbs rocket in from afar.',                             'magnetSpeed',  'add', 4],
    ['Singularity Pull', 'Collect from across the whole area.',                   'magnetRadius', 'add', 6],
    ['Event Horizon',    'Nothing escapes your reach.',                           'magnetRadius', 'add', 12],
  ],
  luck: [
    ['Lucky Strike',     'Blocks sometimes drop triple resources.',               'luckChance',   'add', 0.01],
    ['Fortune',          'Lucky drops are worth much more.',                      'luckMult',     'add', 0.5],
    ["Prospector's Eye", 'Lucky drops happen more often.',                        'luckChance',   'add', 0.015],
    ['Treasure Sense',   'Lucky drops become treasure.',                          'luckMult',     'add', 1.0],
    ['Jackpot',          'A rare chance for a gigantic payout.',                  'jackpotChance','add', 0.003],
    ['Cosmic Fortune',   'Jackpots beyond reason.',                               'jackpotMult',  'add', 25],
  ],
  automation: [
    ['Mining Drone',       'A drone mines nearby blocks for you.',                'autoRate',     'add', 0.5, 6],
    ['Drone Calibration',  'Drones hit harder.',                                  'autoFraction', 'add', 0.05],
    ['Auto-Targeting',     'Drones find blocks from farther away.',               'autoRadius',   'add', 0.7],
    ['Drone Overclock',    'Drones work faster.',                                 'autoRate',     'add', 1.0],
    ['Hive Mind',          'The swarm coordinates its strikes.',                  'autoFraction', 'add', 0.10],
    ['Autonomous Grinder', 'The drones need no supervision at all.',              'autoFraction', 'add', 0.25],
  ],
};

export const UPGRADES = [];
export const UPGRADE_BY_ID = {};

BRANCHES.forEach((branch, bi) => {
  DEFS[branch.id].forEach((d, ti) => {
    const tier = ti + 1;
    const [name, desc, stat, mode, per, maxOverride] = d;
    const id = `${branch.id}_${tier}`;
    const requires = [];
    if (tier > 1) requires.push({ id: `${branch.id}_${tier - 1}`, level: tier === 2 ? 2 : 3 });
    if (tier >= 4) {
      const other = BRANCHES[(bi + 1) % BRANCHES.length];
      requires.push({ id: `${other.id}_${tier - 1}`, level: 2 });
    }
    const up = {
      id, branch: branch.id, tier, name, desc,
      effect: { stat, mode, per },
      max: maxOverride || TIER_MAX[ti],
      baseCost: Math.round(TIER_BASE[ti] * branch.costMul),
      growth: TIER_GROWTH[ti],
      requires,
      minLevel: Math.min(10, TIER_LEVEL[ti] + BRANCH_LEVEL_OFFSET[branch.id]),
    };
    UPGRADES.push(up);
    UPGRADE_BY_ID[id] = up;
  });
});

export function getUpgrade(id) {
  return UPGRADE_BY_ID[id] || null;
}

/** Cost of buying the next level when the node is at `level`. */
export function upgradeCost(up, level) {
  return Math.round(up.baseCost * Math.pow(up.growth, level));
}

/** Effect of a node at a given level, as plain text. */
export function effectText(up, level) {
  const info = STATS_INFO[up.effect.stat];
  const { mode, per } = up.effect;
  if (level <= 0) return 'No effect yet';
  if (mode === 'mul') return `×${formatNumber(Math.pow(1 + per, level))} ${info.label}`;
  const v = per * level;
  if (info.fmt === 'pct') return `+${formatNumber(Math.round(v * 1000) / 10)}% ${info.label}`;
  if (info.fmt === 'x') return `+${formatNumber(Math.round(v * 100) / 100)}× ${info.label}`;
  return `+${formatNumber(Math.round(v * 100) / 100)}${info.unit || ''} ${info.label}`;
}

/** Short description of what ONE level adds. */
export function perLevelText(up) {
  const info = STATS_INFO[up.effect.stat];
  const { mode, per } = up.effect;
  if (mode === 'mul') return `+${Math.round(per * 100)}% ${info.label} per level`;
  if (info.fmt === 'pct') return `+${Math.round(per * 1000) / 10}% ${info.label} per level`;
  if (info.fmt === 'x') return `+${per}× ${info.label} per level`;
  return `+${per}${info.unit || ''} ${info.label} per level`;
}

// ---------------------------------------------------------------------------
// Tree layout: 8 spokes around a core hub, tiers moving outward.
// ---------------------------------------------------------------------------

export const TREE = { hub: 62, inner: 120, step: 92 };

export function nodePosition(up) {
  const bi = BRANCHES.findIndex((b) => b.id === up.branch);
  const angle = -Math.PI / 2 + (bi * Math.PI * 2) / BRANCHES.length;
  const r = TREE.inner + (up.tier - 1) * TREE.step;
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r, angle };
}

export function branchNodes(branchId) {
  return UPGRADES.filter((u) => u.branch === branchId);
}
