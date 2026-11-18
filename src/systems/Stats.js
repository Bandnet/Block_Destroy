import { BASE_STATS } from '../mining/MiningSystem.js';
import { getTool } from '../data/tools.js';
import { UPGRADES } from '../data/upgrades.js';

export const MAX_HITS_PER_SECOND = 30;
export const MAX_CRIT_CHANCE = 0.75;
export const MAX_AREA_RADIUS = 12;

/**
 * Turns a profile (equipped tool + upgrade levels) into the stats the mining
 * system uses. Pure function: shared by the game, the tests and the balance simulator.
 *
 * bonus: { damage, reward, hits } permanent percentage bonuses from achievements
 *        (fractions, e.g. 0.05 = +5%). Speedruns pass none.
 */
export function computeStats(profile, bonus = null) {
  const tool = getTool(profile.equippedTool);
  const fx = tool.effects;
  const s = { ...BASE_STATS };

  // Gather upgrade effects
  const mul = { damageMul: 1, hitsMul: 1, rewardMul: 1 };
  const add = {};
  for (const up of UPGRADES) {
    const level = profile.upgrades[up.id] || 0;
    if (level <= 0) continue;
    const { stat, mode, per } = up.effect;
    if (mode === 'mul') mul[stat] = (mul[stat] || 1) * Math.pow(1 + per, level);
    else add[stat] = (add[stat] || 0) + per * level;
  }
  const a = (k) => add[k] || 0;

  s.damage = tool.damage * mul.damageMul * (1 + (bonus ? bonus.damage : 0));
  s.hitsPerSecond = Math.min(MAX_HITS_PER_SECOND, tool.hps * mul.hitsMul * (1 + (bonus ? bonus.hits : 0)));
  s.rewardMul = mul.rewardMul * (fx.rewardMul || 1) * (1 + (bonus ? bonus.reward : 0));

  s.critChance = Math.min(MAX_CRIT_CHANCE, (fx.critChance || 0) + a('critChance'));
  s.critMult = BASE_STATS.critMult + a('critMult');

  s.areaRadius = Math.min(MAX_AREA_RADIUS, (fx.areaRadius || 0) + a('areaRadius'));
  s.areaFraction = Math.min(1, (fx.areaFraction || BASE_STATS.areaFraction) + a('areaFraction'));
  s.columnRadius = fx.columnRadius || 0;
  s.columnDepth = fx.columnDepth || 0;
  s.columnFraction = fx.columnFraction || BASE_STATS.columnFraction;

  s.magnetRadius = BASE_STATS.magnetRadius + (fx.magnetRadius || 0) + a('magnetRadius');
  s.magnetSpeed = BASE_STATS.magnetSpeed + (fx.magnetSpeed || 0) + a('magnetSpeed');

  s.luckChance = Math.min(0.9, a('luckChance'));
  s.luckMult = BASE_STATS.luckMult + a('luckMult');
  s.jackpotChance = Math.min(0.5, a('jackpotChance'));
  s.jackpotMult = BASE_STATS.jackpotMult + a('jackpotMult');

  s.autoRate = a('autoRate');
  if (s.autoRate > 0) {
    s.autoFraction = 0.1 + a('autoFraction');
    s.autoRadius = 3 + a('autoRadius');
  } else {
    s.autoFraction = 0;
    s.autoRadius = 0;
  }
  return s;
}
