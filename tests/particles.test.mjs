import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ParticlePool, KIND } from '../src/mining/ParticlePool.js';
import { LootSystem, pickupTier } from '../src/mining/LootSystem.js';
import { Economy } from '../src/systems/Economy.js';
import { EventBus } from '../src/core/EventBus.js';

const scene = () => new THREE.Scene();

test('debris particles live, fall and then die', () => {
  const p = new ParticlePool(scene(), 50);
  for (let i = 0; i < 10; i++) assert.ok(p.spawnDebris(0, 10, 0, 1, 0, 0));
  assert.equal(p.count, 10);
  for (let t = 0; t < 2; t += 1 / 60) p.update(1 / 60, 0, 0, 0);
  assert.equal(p.count, 0);
  assert.equal(p.mesh.count, 0);
});

test('capacity is respected (no allocation while playing)', () => {
  const p = new ParticlePool(scene(), 5);
  let ok = 0;
  for (let i = 0; i < 20; i++) if (p.spawnDebris(0, 0, 0, 1, 1, 1)) ok++;
  assert.equal(ok, 5);
  assert.equal(p.free, 0);
});

test('orbs fly to the player and credit their value exactly once', () => {
  const p = new ParticlePool(scene(), 20);
  const got = [];
  p.onOrbArrive = (v, tier) => got.push([v, tier]);
  p.spawnOrb(10, 5, 0, 100, 2, 1, 1, 0);
  p.spawnOrb(-8, 5, 3, 250, 1, 1, 1, 0);
  for (let t = 0; t < 4; t += 1 / 60) p.update(1 / 60, 0, 5, 0, 8);
  assert.equal(got.length, 2);
  assert.deepEqual(got.map((g) => g[0]).sort((a, b) => a - b), [100, 250]);
  assert.equal(p.count, 0);
});

test('swap-remove keeps values of surviving orbs intact', () => {
  const p = new ParticlePool(scene(), 20);
  const got = [];
  p.onOrbArrive = (v) => got.push(v);
  p.spawnDebris(0, 0, 0, 1, 1, 1);
  p.spawnOrb(1, 5, 0, 7, 0, 1, 1, 1);
  p.spawnPop(0, 0, 0, 1, 1, 1);
  p.spawnOrb(2, 5, 0, 9, 0, 1, 1, 1);
  for (let t = 0; t < 4; t += 1 / 60) p.update(1 / 60, 0, 5, 0, 8);
  assert.deepEqual(got.sort(), [7, 9]);
});

test('flushOrbs credits everything in flight immediately', () => {
  const p = new ParticlePool(scene(), 20);
  let total = 0;
  p.onOrbArrive = (v) => { total += v; };
  for (let i = 0; i < 5; i++) p.spawnOrb(50, 5, 50, 10, 0, 1, 1, 1);
  p.flushOrbs();
  assert.equal(total, 50);
  p.update(0.016, 0, 0, 0);
  assert.equal(p.count, 0, 'flushed orbs are removed');
  p.update(0.016, 0, 0, 0);
  assert.equal(total, 50, 'never credited twice');
});

test('pop particles shrink to nothing', () => {
  const p = new ParticlePool(scene(), 5);
  p.spawnPop(0, 0, 0, 1, 1, 1);
  assert.equal(p.kind[0], KIND.POP);
  p.update(0.08, 0, 0, 0);
  const mid = p.mesh.instanceMatrix.array[0];
  assert.ok(mid > 0 && mid < 0.97);
  p.update(0.2, 0, 0, 0);
  assert.equal(p.count, 0);
});

test('pickupTier favours rare materials and lucky drops', () => {
  assert.equal(pickupTier(1, 0, 0), 0);
  assert.equal(pickupTier(4, 0, 0), 1);
  assert.equal(pickupTier(7, 0, 0), 2);
  assert.equal(pickupTier(9, 0, 0), 3);
  assert.equal(pickupTier(2, 3, 0), 1);
  assert.equal(pickupTier(1, 0, 1), 3);
});

function lootSetup(magnetRadius = 3) {
  const events = new EventBus();
  const economy = new Economy(events);
  const particles = new ParticlePool(scene(), 100);
  const picks = [];
  const audio = { playPickup: (tier) => picks.push(tier) };
  const player = { x: 0, y: 2, z: 0 };
  const loot = new LootSystem({
    events, economy, particles, audio,
    getPlayerPos: () => player,
    getStats: () => ({ magnetRadius }),
  });
  const batch = (count, reward, x, y, z, id = 3) => {
    const samples = new Float32Array(24 * 4);
    const n = Math.min(count, 24);
    for (let i = 0; i < n; i++) { samples[i * 4] = x; samples[i * 4 + 1] = y; samples[i * 4 + 2] = z; samples[i * 4 + 3] = id; }
    return { count, reward, samples, sampleCount: n, maxId: id, lucky: 0, jackpots: 0 };
  };
  return { events, economy, particles, picks, loot, batch };
}

test('loot: blocks inside the magnet radius pay out instantly', () => {
  const { events, economy, batch, particles, picks } = lootSetup(3);
  events.emit('blocksBroken', batch(1, 40, 1, 2, 1));
  assert.equal(economy.resources, 40);
  assert.equal(particles.count, 0);
  assert.equal(picks.length, 1);
});

test('loot: distant blocks release a few orbs that pay out on arrival', () => {
  const { events, economy, batch, particles } = lootSetup(3);
  events.emit('blocksBroken', batch(5000, 1_000_000, 30, 2, 0));
  assert.equal(economy.resources, 0, 'not paid yet');
  assert.ok(particles.count >= 1 && particles.count <= 5, `orbs: ${particles.count}`);
  for (let t = 0; t < 6; t += 1 / 60) particles.update(1 / 60, 0, 2, 0, 8);
  assert.ok(Math.abs(economy.resources - 1_000_000) < 1e-6, `paid ${economy.resources}`);
});

test('loot: a larger magnet radius pays the same distance out instantly', () => {
  const { events, economy, batch } = lootSetup(40);
  events.emit('blocksBroken', batch(10, 500, 30, 2, 0));
  assert.equal(economy.resources, 500);
});

test('economy: add, spend and events', () => {
  const events = new EventBus();
  const e = new Economy(events);
  const log = [];
  events.on('resourcesGained', (n) => log.push(['gain', n]));
  events.on('resourcesSpent', (n) => log.push(['spent', n]));
  e.add(100);
  assert.equal(e.spend(150), false);
  assert.equal(e.spend(60), true);
  assert.equal(e.resources, 40);
  assert.equal(e.profile.totalResources, 100, 'spending does not reduce lifetime total');
  assert.deepEqual(log, [['gain', 100], ['spent', 60]]);
  e.add(-5);
  e.add(0);
  assert.equal(e.resources, 40);
});
