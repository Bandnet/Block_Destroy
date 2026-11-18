import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/core/EventBus.js';
import { defaultSave } from '../src/systems/SaveSystem.js';
import { AchievementSystem } from '../src/systems/AchievementSystem.js';
import { ACHIEVEMENTS } from '../src/data/achievements.js';

function make() {
  const save = defaultSave();
  const events = new EventBus();
  return { save, events, ach: new AchievementSystem({ events, getSave: () => save, getProfile: () => save.profile }) };
}

test('achievements: about 40+ with unique ids and positive rewards', () => {
  assert.ok(ACHIEVEMENTS.length >= 40);
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length);
  for (const a of ACHIEVEMENTS) assert.ok(Object.values(a.reward).some((v) => v > 0), a.id);
});

test('achievements: unlock once, emit event, grant bonus', () => {
  const { save, events, ach } = make();
  let got = [];
  events.on('achievementUnlocked', (a) => got.push(a.id));
  assert.equal(ach.check().length, 0);
  save.profile.blocksDestroyed = 150;
  assert.deepEqual(ach.check().map((a) => a.id), ['blocks_100']);
  assert.equal(ach.check().length, 0);
  assert.deepEqual(got, ['blocks_100']);
  assert.ok(ach.bonuses().damage > 0);
});

test('achievements: par and speedrun achievements read save data', () => {
  const { save, ach } = make();
  save.levels.completed[1] = true;
  save.levels.best[1] = 100000; // under the 150s par
  const ids = ach.check().map((a) => a.id);
  assert.ok(ids.includes('par_1') && ids.includes('lvl_1'));
  save.speedrun.best = 40 * 60000;
  save.speedrun.completions = 1;
  const ids2 = ach.check().map((a) => a.id);
  assert.ok(['sr_finish', 'sr_90', 'sr_60', 'sr_45'].every((i) => ids2.includes(i)));
});
