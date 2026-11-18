import test from 'node:test';
import assert from 'node:assert/strict';
import { MiningSystem, BASE_STATS } from '../src/mining/MiningSystem.js';
import { EventBus } from '../src/core/EventBus.js';
import { raycastVoxels } from '../src/world/Raycaster.js';
import { getMaterial, MATERIALS } from '../src/data/materials.js';
import { makeFlatWorld } from './helpers.mjs';

// Flat stone world: stone (100 HP, 40 reward) for y < 10.
function setup(stats = {}) {
  const world = makeFlatWorld(10);
  const events = new EventBus();
  const batches = [];
  const strikes = [];
  events.on('blocksBroken', (b) =>
    batches.push({
      count: b.count, reward: b.reward, crit: b.crit, manual: b.manual, lucky: b.lucky, jackpots: b.jackpots,
      sampleCount: b.sampleCount, maxId: b.maxId, counts: Array.from(b.counts),
      samples: Array.from(b.samples.slice(0, b.sampleCount * 4)),
    })
  );
  events.on('strike', (s) => strikes.push({ ...s }));
  const mining = new MiningSystem(world, events);
  mining.setStats({ ...BASE_STATS, ...stats });
  return { world, mining, batches, strikes, events };
}

const stoneDamage = (world, x, y, z) => {
  const chunk = world.getChunk(x >> 4, y >> 4, z >> 4);
  return (chunk.damage && chunk.damage.get((((y & 15) * 16) + (z & 15)) * 16 + (x & 15))) || 0;
};

test('damage accumulates across strikes, then the block breaks and pays out once', () => {
  const { world, mining, batches } = setup();
  assert.equal(mining.strike(8, 9, 8, 40), false);
  assert.equal(mining.strike(8, 9, 8, 40), false);
  assert.equal(stoneDamage(world, 8, 9, 8), 80);
  assert.equal(batches.length, 0);
  assert.equal(mining.strike(8, 9, 8, 40), true);
  assert.equal(world.getBlock(8, 9, 8), 0);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].count, 1);
  assert.equal(batches[0].reward, 40);
  assert.equal(batches[0].counts[3], 1);
  assert.equal(stoneDamage(world, 8, 9, 8), 0, 'damage record cleared');
});

test('damage persists on a block when you look away and come back', () => {
  const { world, mining } = setup();
  mining.strike(8, 9, 8, 30);
  mining.strike(9, 9, 8, 30);
  mining.strike(8, 9, 8, 30);
  assert.equal(stoneDamage(world, 8, 9, 8), 60);
  assert.equal(stoneDamage(world, 9, 9, 8), 30);
});

test('holding the button strikes at the tool hit rate', () => {
  const { world, mining, strikes } = setup({ damage: 10, hitsPerSecond: 4 });
  const hit = () => raycastVoxels(world, 8.5, 14, 8.5, 0, -1, 0, 10);
  for (let i = 0; i < 10; i++) mining.update(0.1, hit(), true, { x: 8.5, y: 14, z: 8.5 });
  assert.equal(strikes.length, 4, '1 s at 4 hits/s');
  assert.equal(mining.progress, 0.4, 'progress shown for the targeted block');
});

test('not holding the button never damages', () => {
  const { world, mining, strikes } = setup({ damage: 1000 });
  const hit = raycastVoxels(world, 8.5, 14, 8.5, 0, -1, 0, 10);
  for (let i = 0; i < 20; i++) mining.update(0.1, hit, false, { x: 8.5, y: 14, z: 8.5 });
  assert.equal(strikes.length, 0);
});

test('a single huge frame cannot strike more than a handful of times', () => {
  const { world, mining, strikes } = setup({ damage: 1, hitsPerSecond: 20 });
  const hit = raycastVoxels(world, 8.5, 14, 8.5, 0, -1, 0, 10);
  mining.update(100, hit, true, null);
  assert.ok(strikes.length <= 6);
});

test('looking at nothing clears the target and stops mining', () => {
  const { world, mining } = setup();
  const hit = raycastVoxels(world, 8.5, 14, 8.5, 0, -1, 0, 10);
  mining.update(0.1, hit, true, null);
  assert.ok(mining.target);
  mining.update(0.1, null, true, null);
  assert.equal(mining.target, null);
  assert.equal(mining.active, false);
});

test('area strike damages the whole neighbourhood and emits ONE batch', () => {
  const { world, mining, batches } = setup({ areaRadius: 1, areaFraction: 1 });
  mining.strike(8, 9, 8, 100);
  assert.equal(batches.length, 1, 'one batch per strike');
  // centre + 4 side neighbours + the block below (the one above is air)
  assert.equal(batches[0].count, 6);
  assert.equal(world.getBlock(8, 8, 8), 0);
  assert.equal(world.getBlock(9, 9, 8), 0);
  assert.equal(world.getBlock(10, 9, 8), 3, 'outside the radius is untouched');
});

test('area damage is partial and accumulates (fraction < 1)', () => {
  const { world, mining, batches } = setup({ areaRadius: 1, areaFraction: 0.5 });
  mining.strike(8, 9, 8, 100);
  assert.equal(batches[0].count, 1, 'only the centre block broke');
  assert.equal(stoneDamage(world, 9, 9, 8), 50);
  // The centre block broke, so strike the block on the other side of the shared neighbour.
  mining.strike(10, 9, 8, 100);
  assert.equal(world.getBlock(9, 9, 8), 0, 'neighbour broke after taking 50 from each side');
});

test('mass break: huge sphere breaks thousands of blocks, one batch, bounded samples', () => {
  const { world, mining, batches } = setup({ areaRadius: 6, areaFraction: 1 });
  const t0 = performance.now();
  mining.strike(8, 9, 8, 1000);
  const ms = performance.now() - t0;
  console.log(`  area strike r=6: ${batches[0].count} blocks in ${ms.toFixed(1)} ms`);
  assert.equal(batches.length, 1);
  assert.ok(batches[0].count > 300);
  assert.equal(batches[0].sampleCount, 24, 'samples are capped');
  assert.equal(batches[0].reward, batches[0].count * 40);
  for (let i = 0; i < 24; i++) {
    const [x, y, z] = batches[0].samples.slice(i * 4, i * 4 + 3);
    assert.equal(world.getBlock(x, y, z), 0, 'sampled position really was broken');
    assert.ok(Math.hypot(x - 8, y - 9, z - 8) <= 6.01);
  }
  assert.ok(ms < 60);
});

test('column attack digs a shaft straight down', () => {
  const { world, mining, batches } = setup({ columnRadius: 0.5, columnDepth: 4, columnFraction: 1 });
  mining.strike(8, 9, 8, 100);
  assert.equal(batches[0].count, 5);
  for (let y = 5; y <= 9; y++) assert.equal(world.getBlock(8, y, 8), 0);
  assert.equal(world.getBlock(8, 4, 8), 3);
});

test('critical hits multiply damage and flag the batch', () => {
  const { world, mining, batches, strikes } = setup({ critChance: 1, critMult: 3 });
  mining.strike(8, 9, 8, 40); // 40 * 3 = 120 >= 100 HP
  assert.equal(world.getBlock(8, 9, 8), 0);
  assert.equal(batches[0].crit, true);
  assert.equal(strikes[0].crit, true);
  assert.equal(strikes[0].damage, 120);
  assert.equal(mining.totalCrits, 1);
});

test('luck and jackpot multiply rewards', () => {
  let r = setup({ luckChance: 1, luckMult: 3 });
  r.mining.strike(8, 9, 8, 100);
  assert.equal(r.batches[0].reward, 120);
  assert.equal(r.batches[0].lucky, 1);
  r = setup({ jackpotChance: 1, jackpotMult: 25 });
  r.mining.strike(8, 9, 8, 100);
  assert.equal(r.batches[0].reward, 1000);
  assert.equal(r.batches[0].jackpots, 1);
  r = setup({ rewardMul: 2.5 });
  r.mining.strike(8, 9, 8, 100);
  assert.equal(r.batches[0].reward, 100);
});

test('auto-mining strikes the nearest blocks without any input', () => {
  const { world, mining, strikes, batches } = setup({ damage: 100, autoFraction: 1, autoRate: 4, autoRadius: 5 });
  const eye = { x: 8.5, y: 12, z: 8.5 };
  for (let i = 0; i < 20; i++) mining.update(0.1, null, false, eye);
  assert.ok(strikes.length >= 6, `auto strikes ${strikes.length}`);
  assert.ok(strikes.every((s) => s.manual === false));
  assert.ok(batches.length >= 6);
  assert.equal(world.getBlock(8, 9, 8), 0, 'nearest block under the player was mined');
});

test('striking air does nothing', () => {
  const { mining, batches, strikes } = setup();
  assert.equal(mining.strike(8, 12, 8, 1000), false);
  assert.equal(batches.length + strikes.length, 0);
});

test('materials are data-driven and strictly escalating', () => {
  const real = MATERIALS.filter((m) => m.key !== 'core');
  assert.equal(real.length, 10);
  for (let i = 1; i < real.length; i++) {
    assert.ok(real[i].maxHealth > real[i - 1].maxHealth, `${real[i].key} harder than previous`);
    assert.ok(real[i].reward > real[i - 1].reward);
  }
  for (const m of MATERIALS) {
    assert.equal(getMaterial(m.id), m);
    assert.ok(m.sound && m.debris.length >= 2, `${m.key} has sound and particle data`);
  }
  assert.equal(getMaterial(0), null);
});
