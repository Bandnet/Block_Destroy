import test from 'node:test';
import assert from 'node:assert/strict';
import { planBar, mulberry32, scaleNote, MOODS, SCALES, midiToFreq } from '../src/audio/Music.js';
import { LEVELS } from '../src/data/levels.js';

test('every level has a valid music definition', () => {
  for (const l of LEVELS) {
    assert.ok(MOODS[l.music.mood], `${l.name}: mood ${l.music.mood}`);
    assert.ok(SCALES[l.music.scale], `${l.name}: scale ${l.music.scale}`);
    assert.ok(l.music.tempo >= 40 && l.music.tempo <= 140);
  }
});

test('scaleNote handles octaves and negative degrees', () => {
  assert.equal(scaleNote(60, 'major', 0), 60);
  assert.equal(scaleNote(60, 'major', 7), 72);
  assert.equal(scaleNote(60, 'major', -1), 59);
  assert.ok(Math.abs(midiToFreq(69) - 440) < 1e-9);
});

test('planBar is deterministic and stays in a sane range', () => {
  const track = LEVELS[4].music;
  const a = planBar(track, 2, mulberry32(7));
  const b = planBar(track, 2, mulberry32(7));
  assert.deepEqual(a, b);
  for (const bar of [0, 1, 2, 3]) {
    const p = planBar(track, bar, mulberry32(bar));
    for (const n of p.melody) {
      assert.ok(n.midi > 40 && n.midi < 110);
      assert.ok(n.beat >= 0 && n.beat < 4);
    }
    assert.equal(p.chord.length, 3);
  }
});
