import test from 'node:test';
import assert from 'node:assert/strict';
import { SOUNDS, renderSound, listSoundJobs } from '../src/audio/sounds.js';
import { SR } from '../src/audio/dsp.js';
import { VoicePool } from '../src/audio/VoicePool.js';
import { MATERIALS } from '../src/data/materials.js';

function stats(buf) {
  let peak = 0, sumsq = 0;
  for (const v of buf) {
    if (!Number.isFinite(v)) return { bad: true };
    peak = Math.max(peak, Math.abs(v));
    sumsq += v * v;
  }
  return { peak, rms: Math.sqrt(sumsq / buf.length), bad: false };
}

test('every sound variant renders: finite, audible, not clipping', () => {
  const t0 = performance.now();
  const jobs = listSoundJobs();
  let samples = 0;
  for (const { name, variant } of jobs) {
    const buf = renderSound(name, variant);
    samples += buf.length;
    const s = stats(buf);
    assert.equal(s.bad, false, `${name}#${variant} has NaN/Infinity`);
    assert.ok(s.peak > 0.2, `${name}#${variant} is too quiet (peak ${s.peak})`);
    assert.ok(s.peak <= 1.0001, `${name}#${variant} clips (peak ${s.peak})`);
    assert.ok(buf.length / SR < 11, `${name} unreasonably long`);
  }
  const ms = performance.now() - t0;
  console.log(`  rendered ${jobs.length} sound buffers (${(samples / SR).toFixed(1)} s of audio) in ${ms.toFixed(0)} ms`);
  assert.ok(ms < 6000);
});

test('rendering is deterministic', () => {
  const a = renderSound('break_stone', 1);
  const b = renderSound('break_stone', 1);
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i += 97) assert.equal(a[i], b[i]);
});

test('every material has its own hit and break sounds', () => {
  const rms = new Map();
  for (const m of MATERIALS) {
    assert.ok(SOUNDS[`hit_${m.sound}`], `hit_${m.sound} exists`);
    assert.ok(SOUNDS[`break_${m.sound}`], `break_${m.sound} exists`);
    const hit = renderSound(`hit_${m.sound}`, 0);
    const brk = renderSound(`break_${m.sound}`, 0);
    assert.ok(brk.length >= hit.length, `${m.key}: break is at least as long as a hit`);
    rms.set(m.sound, stats(hit).rms.toFixed(4));
  }
  // distinct waveforms: no two materials may render identical hit buffers
  const sigs = new Set();
  for (const m of MATERIALS) {
    const b = renderSound(`hit_${m.sound}`, 0);
    sigs.add(Array.from(b.slice(200, 260)).map((v) => v.toFixed(3)).join(','));
  }
  assert.equal(sigs.size, MATERIALS.length);
});

test('breaking is more satisfying than hitting (longer, louder energy)', () => {
  for (const key of ['dirt', 'stone', 'iron', 'diamond', 'void']) {
    const hit = renderSound(`hit_${key}`, 0);
    const brk = renderSound(`break_${key}`, 0);
    assert.ok(brk.length > hit.length * 1.2, `${key} break is longer`);
    const energy = (b) => b.reduce((a, v) => a + v * v, 0);
    assert.ok(energy(brk) > energy(hit), `${key} break has more energy`);
  }
});

test('drill / laser loops are seamless', () => {
  for (const name of ['loop_drill', 'loop_plasma', 'loop_quantum', 'loop_void', 'loop_ultimate']) {
    assert.equal(SOUNDS[name].loop, true);
    const b = renderSound(name, 0);
    // The jump across the loop point must be no bigger than the largest jump between
    // neighbouring samples elsewhere in the buffer (i.e. the seam is inaudible).
    let maxStep = 0;
    for (let i = 1; i < b.length; i++) maxStep = Math.max(maxStep, Math.abs(b[i] - b[i - 1]));
    const seam = Math.abs(b[0] - b[b.length - 1]);
    assert.ok(seam <= maxStep * 1.01 + 1e-6, `${name} seam jump ${seam.toFixed(3)} vs max step ${maxStep.toFixed(3)}`);
    assert.ok(b.length / SR > 0.4);
  }
});

test('all required progression sounds exist', () => {
  for (const n of [
    'upgrade_buy', 'tool_unlock', 'branch_complete', 'achievement', 'crit', 'area_boom',
    'level_complete', 'level_unlock', 'final_sequence', 'pickup_0', 'pickup_1', 'pickup_2', 'pickup_3',
    'swing', 'zap', 'ui_click', 'ui_error', 'test_tone',
  ]) assert.ok(SOUNDS[n], n);
});

// ------------------------------------------------------------------ VoicePool

function poolWithClock(opts = {}) {
  let t = 0;
  const pool = new VoicePool({ maxVoices: opts.maxVoices || 6, now: () => t });
  return { pool, advance: (dt) => { t += dt; }, set: (v) => { t = v; } };
}

test('VoicePool: per-sound cooldown', () => {
  const { pool, advance } = poolWithClock();
  assert.ok(pool.acquire('hit', { cooldown: 0.05 }));
  assert.equal(pool.acquire('hit', { cooldown: 0.05 }), null);
  advance(0.06);
  assert.ok(pool.acquire('hit', { cooldown: 0.05 }));
  assert.equal(pool.dropped, 1);
});

test('VoicePool: per-sound cap steals the oldest of equal priority, skips lower priority', () => {
  const { pool, advance } = poolWithClock();
  const stopped = [];
  const v = [];
  for (let i = 0; i < 3; i++) {
    const voice = pool.acquire('hit', { cooldown: 0, maxPerSound: 3, duration: 5, priority: 2 });
    voice.stop = () => stopped.push(i);
    v.push(voice);
    advance(0.01);
  }
  const fourth = pool.acquire('hit', { cooldown: 0, maxPerSound: 3, duration: 5, priority: 2 });
  assert.ok(fourth);
  assert.deepEqual(stopped, [0], 'oldest voice stopped');
  assert.equal(pool.acquire('hit', { cooldown: 0, maxPerSound: 3, duration: 5, priority: 1 }), null, 'lower priority is dropped');
});

test('VoicePool: hundreds of identical requests never exceed the caps', () => {
  const { pool, advance } = poolWithClock({ maxVoices: 8 });
  let max = 0;
  for (let i = 0; i < 600; i++) {
    pool.acquire(i % 3 === 0 ? 'a' : i % 3 === 1 ? 'b' : 'c', { cooldown: 0.02, maxPerSound: 3, duration: 0.5, priority: 1 });
    max = Math.max(max, pool.active);
    advance(0.002);
  }
  assert.ok(max <= 8, `active voices peaked at ${max}`);
  // 3 sounds x 1.2 s / 20 ms cooldown = 180 starts at most
  assert.ok(pool.started <= 180, `only ${pool.started} of 600 requests actually started`);
});

test('VoicePool: global cap keeps important sounds and drops unimportant ones', () => {
  const { pool } = poolWithClock({ maxVoices: 3 });
  for (let i = 0; i < 3; i++) pool.acquire(`s${i}`, { cooldown: 0, duration: 5, priority: 5 });
  assert.equal(pool.acquire('low', { cooldown: 0, duration: 5, priority: 1 }), null);
  assert.ok(pool.acquire('high', { cooldown: 0, duration: 5, priority: 9 }));
  assert.equal(pool.active, 3);
});

test('VoicePool: voices expire', () => {
  const { pool, advance } = poolWithClock();
  pool.acquire('x', { duration: 0.2, cooldown: 0 });
  assert.equal(pool.active, 1);
  advance(0.3);
  pool.acquire('y', { duration: 0.2, cooldown: 0 });
  assert.equal(pool.active, 1);
});
