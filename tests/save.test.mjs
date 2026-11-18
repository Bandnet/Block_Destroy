import test from 'node:test';
import assert from 'node:assert/strict';
import { SaveSystem, normalizeSave, defaultSave, SAVE_KEY } from '../src/systems/SaveSystem.js';

class FakeStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, v); }
  removeItem(k) { this.map.delete(k); }
}

test('save round-trips through storage', () => {
  const storage = new FakeStorage();
  const s = new SaveSystem(storage);
  const data = defaultSave();
  data.profile.resources = 12345;
  data.profile.upgrades.damage_1 = 4;
  data.levels.unlocked = 3;
  data.levels.best[1] = 91234;
  data.settings.audio.master = 0.3;
  assert.equal(s.save(data), true);
  const back = s.load();
  assert.equal(back.profile.resources, 12345);
  assert.equal(back.profile.upgrades.damage_1, 4);
  assert.equal(back.levels.unlocked, 3);
  assert.equal(back.levels.best[1], 91234);
  assert.equal(back.settings.audio.master, 0.3);
});

test('corrupt or hostile data falls back to safe defaults', () => {
  const storage = new FakeStorage();
  storage.setItem(SAVE_KEY, '{not json');
  assert.equal(new SaveSystem(storage).load().profile.resources, 0);

  const nasty = normalizeSave({
    profile: { resources: -5, upgrades: 'x', ownedTools: [], blocksDestroyed: 'many' },
    levels: { unlocked: 99, best: { 1: -3, 2: 'fast', 3: 5000 } },
    settings: { fov: 9999, renderDistance: -2, sensitivity: 'a' },
    speedrun: { best: 'x' },
  });
  assert.equal(nasty.profile.resources, 0);
  assert.deepEqual(nasty.profile.ownedTools, ['wooden']);
  assert.equal(nasty.profile.blocksDestroyed, 0);
  assert.equal(nasty.levels.unlocked, 10);
  assert.deepEqual(nasty.levels.best, { 3: 5000 });
  assert.equal(nasty.settings.fov, 110);
  assert.equal(nasty.settings.renderDistance, 3);
  assert.equal(nasty.settings.sensitivity, 1);
  assert.equal(nasty.speedrun.best, null);
  assert.equal(normalizeSave(null).profile.resources, 0);
  assert.equal(normalizeSave([]).levels.unlocked, 1);
});

test('missing storage (private browsing) still works in memory', () => {
  const s = new SaveSystem(null);
  assert.equal(s.persistent, false);
  const data = defaultSave();
  data.profile.resources = 7;
  s.save(data);
  assert.equal(s.load().profile.resources, 7);
});

test('storage that throws never crashes the game', () => {
  const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('x'); } };
  const s = new SaveSystem(bad);
  assert.equal(s.load().levels.unlocked, 1);
  assert.equal(s.save(defaultSave()), false);
  s.reset();
});

test('import validation', () => {
  const s = new SaveSystem(new FakeStorage());
  const data = defaultSave();
  data.profile.resources = 99;
  const text = s.exportText(data);
  assert.equal(s.parseImport(text).profile.resources, 99);
  assert.equal(s.parseImport('nope'), null);
  assert.equal(s.parseImport('{"hello":1}'), null);
  assert.equal(s.parseImport('[1,2]'), null);
});

test('reset clears storage', () => {
  const storage = new FakeStorage();
  const s = new SaveSystem(storage);
  const data = defaultSave();
  data.profile.resources = 5;
  s.save(data);
  s.reset();
  assert.equal(s.load().profile.resources, 0);
});
