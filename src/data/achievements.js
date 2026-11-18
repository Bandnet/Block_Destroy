import { LEVELS } from './levels.js';
import { formatNumber } from '../util/format.js';

// Achievements. `stat` picks a counter from the context built in AchievementSystem;
// reaching `goal` unlocks it. `reward` is a small PERMANENT bonus (fraction):
//   damage: +x% damage, reward: +x% resources, hits: +x% hit speed
// Achievement bonuses never apply in speedruns.

export const ACHIEVEMENT_CATEGORIES = [
  { id: 'blocks', name: 'Blocks' },
  { id: 'resources', name: 'Resources' },
  { id: 'upgrades', name: 'Upgrades' },
  { id: 'tools', name: 'Tools' },
  { id: 'levels', name: 'Levels' },
  { id: 'speedrun', name: 'Speedrun' },
];

const ach = [];
const add = (category, id, name, desc, stat, goal, reward) => ach.push({ category, id, name, desc, stat, goal, reward });

// ----- blocks
[
  [100, 'First Hundred', 0.01], [1e3, 'Rubble Maker', 0.01], [1e4, 'Block Buster', 0.02], [1e5, 'Demolition Crew', 0.02],
  [1e6, 'Millionaire Miner', 0.03], [1e7, 'World Eater', 0.03], [1e8, 'Planetary Excavator', 0.05],
].forEach(([n, name, r]) => add('blocks', `blocks_${n}`, name, `Destroy ${n.toLocaleString('en-US')} blocks.`, 'blocks', n, { damage: r }));
add('blocks', 'crits_100', 'Sharp Eye', 'Land 100 critical hits.', 'crits', 100, { damage: 0.01 });
add('blocks', 'crits_10000', 'Critical Mass', 'Land 10,000 critical hits.', 'crits', 1e4, { damage: 0.03 });

// ----- resources
[
  [1e3, 'Pocket Change', 0.01], [1e5, 'Nest Egg', 0.01], [1e7, 'Stacked', 0.02], [1e9, 'Billionaire', 0.02],
  [1e12, 'Trillion Club', 0.03], [1e15, 'Beyond Counting', 0.04], [1e21, 'Economic Singularity', 0.05],
].forEach(([n, name, r]) => add('resources', `res_${n}`, name, `Collect ${formatNumber(n)} resources in total.`, 'resources', n, { reward: r }));

// ----- upgrades
[[1, 'Tinkerer', 0.01], [10, 'Upgrade Habit', 0.01], [25, 'Gearhead', 0.02], [50, 'Engineer', 0.02], [100, 'Master Builder', 0.03], [200, 'Fully Optimised', 0.04]]
  .forEach(([n, name, r]) => add('upgrades', `up_${n}`, name, `Buy ${n} upgrade level${n > 1 ? 's' : ''}.`, 'upgradesBought', n, { reward: r }));
[[1, 'Branch Master', 0.02], [4, 'Halfway There', 0.03], [8, 'Total Mastery', 0.05]]
  .forEach(([n, name, r]) => add('upgrades', `branch_${n}`, name, n === 8 ? 'Max out every upgrade branch.' : `Complete ${n} upgrade branch${n > 1 ? 'es' : ''}.`, 'branches', n, { damage: r }));

// ----- tools
[['iron', 'Ironclad', 3], ['diamond', 'Diamond Hands', 5], ['drill', 'Power Tools', 6], ['plasma', 'Plasma Pioneer', 7], ['quantum', 'Quantum Leap', 8], ['void', 'Into the Void', 9], ['ultimate', 'The Ultimate Tool', 10]]
  .forEach(([id, name, idx]) => add('tools', `tool_${id}`, name, `Own the ${id[0].toUpperCase() + id.slice(1)} tool.`, 'toolsOwned', idx, { hits: 0.01 + idx * 0.002 }));

// ----- levels
[[1, 'Getting Started', 0.01], [3, 'Down the Quarry', 0.02], [5, 'Crystal Clear', 0.02], [8, 'Deep Diver', 0.03], [10, 'Grinder Supreme', 0.05]]
  .forEach(([n, name, r]) => add('levels', `lvl_${n}`, name, n === 10 ? 'Complete all 10 levels.' : `Complete ${n} level${n > 1 ? 's' : ''}.`, 'levelsDone', n, { reward: r }));
add('levels', 'game_done', 'The End?', 'Destroy the Core and finish the game.', 'gameDone', 1, { damage: 0.1, reward: 0.1 });

// ----- speedrun
add('speedrun', 'par_1', 'On Schedule', 'Beat the par time of a level.', 'underPar', 1, { hits: 0.01 });
add('speedrun', 'par_5', 'Ahead of Schedule', 'Beat the par time on 5 levels.', 'underPar', 5, { hits: 0.02 });
add('speedrun', 'par_10', 'Perfectionist', 'Beat the par time on all 10 levels.', 'underPar', LEVELS.length, { hits: 0.04 });
add('speedrun', 'sr_finish', 'Speedrunner', 'Finish a full speedrun.', 'speedrunDone', 1, { hits: 0.02 });
add('speedrun', 'sr_90', 'Sub 90', 'Finish a speedrun in under 90 minutes.', 'speedrunUnder', 90, { hits: 0.02 });
add('speedrun', 'sr_60', 'Sub 60', 'Finish a speedrun in under 60 minutes.', 'speedrunUnder', 60, { hits: 0.03 });
add('speedrun', 'sr_45', 'Sub 45', 'Finish a speedrun in under 45 minutes.', 'speedrunUnder', 45, { hits: 0.05 });

export const ACHIEVEMENTS = ach;
export const ACHIEVEMENT_BY_ID = Object.fromEntries(ach.map((a) => [a.id, a]));

export function rewardText(reward) {
  const parts = [];
  if (reward.damage) parts.push(`+${Math.round(reward.damage * 1000) / 10}% damage`);
  if (reward.reward) parts.push(`+${Math.round(reward.reward * 1000) / 10}% resources`);
  if (reward.hits) parts.push(`+${Math.round(reward.hits * 1000) / 10}% hit speed`);
  return parts.join(', ');
}
