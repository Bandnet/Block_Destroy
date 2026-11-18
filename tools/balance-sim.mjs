// Balance simulator: plays the whole game with a sensible "average player" and
// reports how long every level takes. Uses the real data tables, the real stats
// calculator and blocks sampled from the real world generator.
//
//   node tools/balance-sim.mjs [--skill 0.8] [--verbose]

import { World } from '../src/world/World.js';
import { WorldGenerator } from '../src/world/WorldGenerator.js';
import { LEVELS } from '../src/data/levels.js';
import { TOOLS, getTool } from '../src/data/tools.js';
import { UPGRADES, upgradeCost, getUpgrade } from '../src/data/upgrades.js';
import { MATERIAL_TABLE } from '../src/data/materials.js';
import { computeStats } from '../src/systems/Stats.js';
import { createProfile } from '../src/systems/Profile.js';
import { sphereOffsets, columnOffsets } from '../src/mining/offsets.js';

const SAMPLE_DEPTH = 8; // layers a player realistically digs through

/** Material fractions of the blocks a player actually mines in a level. */
export function sampleLevel(level) {
  const gen = new WorldGenerator(level.terrain);
  const world = new World({ generator: gen });
  const spawn = gen.spawnPoint();
  world.preload(spawn.x, spawn.z, 6);
  if (level.terrain.shape === 'monolith') world.preload(level.terrain.towerX, level.terrain.towerZ, 2);

  const counts = {};
  let total = 0;
  const sampleColumn = (x, z, weight) => {
    const col = gen.columnRange(x, z);
    if (col.top < col.bottom) return;
    for (let d = 0; d < SAMPLE_DEPTH; d++) {
      const y = col.top - d;
      if (y < col.bottom) break;
      const id = world.getBlock(x, y, z);
      if (id) {
        counts[id] = (counts[id] || 0) + weight;
        total += weight;
      }
    }
  };
  for (let x = -40; x <= 56; x += 3) for (let z = -40; z <= 56; z += 3) sampleColumn(x, z, 1);
  if (level.terrain.shape === 'monolith') {
    // half of the digging happens in the tower
    const t = level.terrain;
    for (let x = t.towerX - t.towerHalf; x <= t.towerX + t.towerHalf; x += 2) {
      for (let z = t.towerZ - t.towerHalf; z <= t.towerZ + t.towerHalf; z += 2) sampleColumn(x, z, 2.5);
    }
  }
  const fractions = {};
  let avgHP = 0, avgReward = 0;
  for (const [id, c] of Object.entries(counts)) {
    const f = c / total;
    fractions[id] = f;
    avgHP += f * MATERIAL_TABLE[id].maxHealth;
    avgReward += f * MATERIAL_TABLE[id].reward;
  }
  return { fractions, avgHP, avgReward };
}

const sphereCount = (r) => (r > 0 ? sphereOffsets(r).length / 3 : 1);
const columnCount = (r, d) => (r > 0 && d > 0 ? columnOffsets(r, d).length / 3 : 0);

/** Expected blocks/s and resources/s for given stats on a sampled level. */
export function rates(stats, level, skill = 0.8) {
  const cf = 1 + stats.critChance * (stats.critMult - 1);
  const D = stats.damage * cf;
  const kA = stats.areaRadius > 0 ? 0.35 * (sphereCount(stats.areaRadius) - 1) : 0;
  const kC = stats.columnRadius > 0 ? 0.5 * Math.max(0, columnCount(stats.columnRadius, stats.columnDepth) - 1) : 0;
  const luck = 1 + stats.luckChance * (stats.luckMult - 1) + stats.jackpotChance * (stats.jackpotMult - 1);

  let perHitBlocks = 0, perHitRevenue = 0;
  let autoBlocks = 0, autoRevenue = 0;
  for (const [id, f] of Object.entries(level.sample.fractions)) {
    const m = MATERIAL_TABLE[id];
    const b = (d) => Math.min(1, d / m.maxHealth) + kA * Math.min(1, (d * stats.areaFraction) / m.maxHealth) + kC * Math.min(1, (d * stats.columnFraction) / m.maxHealth);
    perHitBlocks += f * b(D);
    perHitRevenue += f * b(D) * m.reward;
    if (stats.autoRate > 0) {
      const da = D * stats.autoFraction;
      const ba = Math.min(1, da / m.maxHealth); // drones never splash
      autoBlocks += f * ba;
      autoRevenue += f * ba * m.reward;
    }
  }
  const blocks = stats.hitsPerSecond * perHitBlocks * skill + stats.autoRate * autoBlocks;
  const revenue = (stats.hitsPerSecond * perHitRevenue * skill + stats.autoRate * autoRevenue) * stats.rewardMul * luck;
  return { blocks, revenue };
}

function nextToolOf(profile) {
  const idx = TOOLS.findIndex((t) => t.id === profile.equippedTool);
  return TOOLS[idx + 1] || null;
}

export function upgradeAvailable(profile, up, highestLevel = 10) {
  const lvl = profile.upgrades[up.id] || 0;
  if (lvl >= up.max) return false;
  if (up.minLevel > highestLevel) return false;
  return up.requires.every((r) => (profile.upgrades[r.id] || 0) >= r.level);
}

/**
 * Greedy shopper: buys whatever raises income the most per resource spent; if
 * nothing raises income, buys the cheapest available node so the tree keeps opening.
 */
function shop(profile, level, highestLevel, skill) {
  let bought = 0;
  for (let guard = 0; guard < 200; guard++) {
    const base = rates(computeStats(profile), level, skill);
    let best = null;

    const tool = nextToolOf(profile);
    if (tool && tool.minLevel <= highestLevel && profile.resources >= tool.cost) {
      const p2 = { ...profile, equippedTool: tool.id };
      const gain = rates(computeStats(p2), level, skill).revenue / Math.max(1e-9, base.revenue) - 1;
      best = { kind: 'tool', tool, score: 1e9 + gain, cost: tool.cost };
    }
    if (!best) {
      let cheapest = null;
      for (const up of UPGRADES) {
        if (!upgradeAvailable(profile, up, highestLevel)) continue;
        const lvl = profile.upgrades[up.id] || 0;
        const cost = upgradeCost(up, lvl);
        if (cost > profile.resources) continue;
        const p2 = { ...profile, upgrades: { ...profile.upgrades, [up.id]: lvl + 1 } };
        const r2 = rates(computeStats(p2), level, skill);
        const gain = r2.revenue / Math.max(1e-9, base.revenue) - 1;
        const score = gain / cost;
        if (!best || score > best.score) best = { kind: 'up', up, score, cost, gain };
        if (!cheapest || cost < cheapest.cost) cheapest = { kind: 'up', up, score: 0, cost, gain };
      }
      if (best && best.gain <= 0 && cheapest) best = cheapest;
    }
    if (!best) break;
    profile.resources -= best.cost;
    if (best.kind === 'tool') {
      profile.equippedTool = best.tool.id;
      profile.ownedTools.push(best.tool.id);
    } else {
      profile.upgrades[best.up.id] = (profile.upgrades[best.up.id] || 0) + 1;
      profile.upgradesBought++;
    }
    bought++;
  }
  return bought;
}

export function simulate({ skill = 0.8, verbose = false, maxSeconds = 4 * 3600 } = {}) {
  const profile = createProfile();
  const samples = LEVELS.map((l) => ({ ...l, sample: sampleLevel(l) }));
  const results = [];
  let clock = 0;
  let highest = 1;
  const dt = 0.5;

  for (const level of samples) {
    let blocks = 0;
    let t = 0;
    let earned = 0;
    let boughtHere = 0;
    const startUp = profile.upgradesBought;
    let completeAt = null;

    // Level 10 also needs the final core
    const coreHP = MATERIAL_TABLE[11].maxHealth;
    let coreLeft = level.finale ? coreHP : 0;

    for (; clock < maxSeconds; clock += dt, t += dt) {
      boughtHere += shop(profile, level, highest, skill);
      const stats = computeStats(profile);
      const r = rates(stats, level, skill);
      const earn = r.revenue * dt;
      profile.resources += earn;
      earned += earn;

      if (completeAt === null) {
        blocks += r.blocks * dt;
        if (blocks >= level.target) completeAt = t;
      } else if (coreLeft > 0) {
        const dps = stats.damage * (1 + stats.critChance * (stats.critMult - 1)) * stats.hitsPerSecond * skill;
        coreLeft -= dps * dt;
      }

      if (completeAt !== null && coreLeft <= 0) {
        // may we move on? next level needs its tool
        const next = LEVELS[level.id]; // level.id is 1-based, so this is the next level
        if (!next || !next.requiresTool || profile.ownedTools.includes(next.requiresTool)) break;
      }
    }

    const done = completeAt !== null;
    results.push({
      level: level.id,
      name: level.name,
      avgHP: level.sample.avgHP,
      blocksPerSec: rates(computeStats(profile), level, skill).blocks,
      completeSec: completeAt,
      stuckSec: done ? t - completeAt : null,
      tool: profile.equippedTool,
      upgradesBought: profile.upgradesBought - startUp,
      earned,
      par: level.parTime / 1000,
      done,
    });
    highest = Math.min(10, level.id + 1);
    if (!done) break;
  }
  return { results, totalSeconds: clock, profile };
}

// ------------------------------------------------------------------- CLI
import { formatNumber, formatTime } from '../src/util/format.js';
import { fileURLToPath } from 'node:url';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const skillIdx = args.indexOf('--skill');
  const skill = skillIdx >= 0 ? Number(args[skillIdx + 1]) : 0.8;
  const { results, totalSeconds, profile } = simulate({ skill });
  console.log(`Balance simulation, player skill ${skill}\n`);
  console.log('Lv  Name                  AvgHP     Blocks/s   Complete    Wait  Tool       Buys  Earned     Par');
  for (const r of results) {
    console.log(
      String(r.level).padEnd(3) +
      r.name.padEnd(22) +
      formatNumber(r.avgHP).padEnd(10) +
      formatNumber(r.blocksPerSec).padEnd(11) +
      (r.completeSec != null ? formatTime(r.completeSec * 1000, { centis: false }) : 'NEVER').padEnd(12) +
      (r.stuckSec != null ? formatTime(r.stuckSec * 1000, { centis: false }) : '-').padEnd(6) +
      r.tool.padEnd(11) +
      String(r.upgradesBought).padEnd(6) +
      formatNumber(r.earned).padEnd(11) +
      formatTime(r.par * 1000, { centis: false })
    );
  }
  console.log(`\nTotal: ${formatTime(totalSeconds * 1000, { centis: false })}   upgrades bought: ${profile.upgradesBought}   final tool: ${profile.equippedTool}`);
}
