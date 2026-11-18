import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/core/EventBus.js';
import { Economy } from '../src/systems/Economy.js';
import { createProfile } from '../src/systems/Profile.js';
import { ToolSystem } from '../src/systems/ToolSystem.js';
import { UpgradeSystem } from '../src/systems/UpgradeSystem.js';
import { computeStats } from '../src/systems/Stats.js';
import { UPGRADES, upgradeCost } from '../src/data/upgrades.js';

function setup(highest = 10) {
  const events = new EventBus();
  const economy = new Economy(events, createProfile());
  const getHighestLevel = () => highest;
  return { events, economy, tools: new ToolSystem({ events, economy, getHighestLevel }), ups: new UpgradeSystem({ events, economy, getHighestLevel }) };
}

test('tools: must be bought in order and be affordable', () => {
  const { economy, tools } = setup();
  assert.equal(tools.buy('stone'), false);
  economy.add(150);
  assert.equal(tools.status('iron').reason, 'Requires the Stone Pickaxe');
  assert.equal(tools.buy('stone'), true);
  assert.equal(economy.resources, 0);
  assert.equal(economy.profile.equippedTool, 'stone');
  assert.equal(tools.equip('wooden'), true);
  assert.equal(tools.equip('iron'), false);
});

test('tools: level gating', () => {
  const { economy, tools } = setup(1);
  economy.add(1e6);
  tools.buy('stone');
  assert.match(tools.status('iron').reason, /Reach level 2/);
});

test('upgrades: buy, spend and stats change', () => {
  const { economy, ups } = setup();
  const before = computeStats(economy.profile).damage;
  economy.add(1e6);
  assert.equal(ups.buy('damage_1'), true);
  assert.equal(ups.level('damage_1'), 1);
  assert.ok(computeStats(economy.profile).damage > before);
  assert.equal(economy.resources, 1e6 - upgradeCost(UPGRADES.find((u) => u.id === 'damage_1'), 0));
});

test('upgrades: requirements and level gating block purchases', () => {
  const { economy, ups } = setup(1);
  economy.add(1e15);
  assert.equal(ups.buy('damage_2'), false); // needs damage_1 and level 2
  ups.buyMax('damage_1');
  assert.equal(ups.status('damage_2').reasons.length, 1); // only the level gate remains
});

test('upgrades: branch completion event fires once', () => {
  const { events, economy, ups } = setup();
  let fired = 0;
  events.on('branchCompleted', () => fired++);
  economy.add(1e40);
  for (let pass = 0; pass < 8; pass++) for (const u of UPGRADES) ups.buyMax(u.id);
  assert.equal(fired, 8);
  assert.ok(economy.profile.completedBranches.includes('magnet'));
});
