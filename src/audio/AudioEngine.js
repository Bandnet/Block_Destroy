import { SR, SOUNDS, renderSound, listSoundJobs } from './sounds.js';
import { VoicePool } from './VoicePool.js';

const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];

export const DEFAULT_AUDIO_SETTINGS = Object.freeze({
  master: 0.8,
  sfx: 1,
  music: 0.5,
  muteMaster: false,
  muteSfx: false,
  muteMusic: false,
});

/**
 * Web Audio wrapper.
 *
 *  - The AudioContext is created on the first user gesture (autoplay policy).
 *  - Sounds are synthesized to AudioBuffers in small idle slices after unlock,
 *    frequently used ones first, so nothing stalls the main thread.
 *  - Every play() goes through a VoicePool (cooldowns and voice caps) and gets
 *    randomized pitch / volume so repeated sounds never feel identical.
 *  - Buses: sfx and music -> master -> compressor -> output.
 */
export class AudioEngine {
  constructor(settings = {}) {
    this.settings = { ...DEFAULT_AUDIO_SETTINGS, ...settings };
    this.ctx = null;
    this.buffers = new Map(); // "name#variant" -> AudioBuffer
    this.pool = new VoicePool({ maxVoices: 28 });
    this.loops = new Map(); // name -> { src, gain }
    this.nodes = null;

    this._jobs = [];
    this._rendering = false;
    this._pickupCombo = 0;
    this._pickupLast = 0;
    this.played = 0;
    this.music = null; // set by MusicEngine
  }

  get unlocked() {
    return this.ctx !== null;
  }

  /** Call from a user-gesture handler. Safe to call repeatedly. */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return false;
      try {
        this.ctx = new Ctor({ latencyHint: 'interactive' });
      } catch {
        return false;
      }
      this._buildGraph();
      this._queueJobs();
      if (this.music) this.music.onUnlock();
      document.addEventListener('visibilitychange', () => {
        if (!this.ctx) return;
        if (document.hidden) this.ctx.suspend();
        else this.ctx.resume();
      });
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  _buildGraph() {
    const ctx = this.ctx;
    const master = ctx.createGain();
    const sfx = ctx.createGain();
    const music = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 18;
    comp.ratio.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    sfx.connect(master);
    music.connect(master);
    master.connect(comp);
    comp.connect(ctx.destination);
    this.nodes = { master, sfx, music, comp };
    this._applyVolumes(true);
  }

  // ---------- settings ----------

  setSettings(partial) {
    Object.assign(this.settings, partial);
    this._applyVolumes(false);
  }

  _applyVolumes(immediate) {
    if (!this.nodes) return;
    const s = this.settings;
    const t = this.ctx.currentTime;
    const set = (param, v) => {
      if (immediate) param.value = v;
      else param.setTargetAtTime(v, t, 0.015);
    };
    set(this.nodes.master.gain, s.muteMaster ? 0 : s.master);
    set(this.nodes.sfx.gain, s.muteSfx ? 0 : s.sfx);
    set(this.nodes.music.gain, s.muteMusic ? 0 : s.music * 0.6);
  }

  // ---------- buffer rendering ----------

  _queueJobs() {
    const priorityOrder = (n) => {
      if (n.startsWith('hit_') || n.startsWith('pickup') || n === 'swing' || n.startsWith('ui_')) return 0;
      if (n.startsWith('break_') || n === 'crit' || n === 'area_boom') return 1;
      if (n === 'final_sequence' || n === 'level_complete') return 3;
      return 2;
    };
    this._jobs = listSoundJobs().sort((a, b) => priorityOrder(a.name) - priorityOrder(b.name));
    this._renderSlice();
  }

  _renderSlice() {
    if (this._rendering) return;
    this._rendering = true;
    const step = () => {
      const t0 = performance.now();
      while (this._jobs.length && performance.now() - t0 < 10) {
        const job = this._jobs.shift();
        this._ensureBuffer(job.name, job.variant);
      }
      if (this._jobs.length) setTimeout(step, 0);
      else this._rendering = false;
    };
    setTimeout(step, 0);
  }

  _ensureBuffer(name, variant) {
    const key = `${name}#${variant}`;
    let buf = this.buffers.get(key);
    if (buf) return buf;
    const data = renderSound(name, variant);
    buf = this.ctx.createBuffer(1, data.length, SR);
    buf.copyToChannel(data, 0);
    this.buffers.set(key, buf);
    return buf;
  }

  get bufferCount() {
    return this.buffers.size;
  }

  // ---------- playback ----------

  /**
   * Play a one-shot sound.
   * opts: volume, pitch (multiplier), pitchJitter, volJitter, pan, priority override
   */
  play(name, opts = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return false;
    const def = SOUNDS[name];
    if (!def) return false;

    const variant = def.variants > 1 ? Math.floor(Math.random() * def.variants) : 0;
    const buf = this._ensureBuffer(name, variant);

    const pitchJitter = opts.pitchJitter === undefined ? 0.08 : opts.pitchJitter;
    const volJitter = opts.volJitter === undefined ? 0.1 : opts.volJitter;
    const rate = (opts.pitch || 1) * (1 + (Math.random() * 2 - 1) * pitchJitter);
    const vol = (opts.volume === undefined ? 1 : opts.volume) * def.gain * (1 + (Math.random() * 2 - 1) * volJitter);
    if (vol <= 0.001) return false;

    const voice = this.pool.acquire(name, {
      cooldown: opts.cooldown === undefined ? def.cooldown : opts.cooldown,
      maxPerSound: def.maxVoices,
      duration: buf.duration / rate,
      priority: opts.priority === undefined ? def.priority : opts.priority,
    });
    if (!voice) return false;

    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(gain);
    let tail = gain;
    if (opts.pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      gain.connect(p);
      tail = p;
    }
    tail.connect(this.nodes.sfx);

    voice.stop = () => {
      try { gain.gain.setTargetAtTime(0, ctx.currentTime, 0.01); src.stop(ctx.currentTime + 0.05); } catch { /* already stopped */ }
    };
    src.onended = () => {
      this.pool.release(voice);
      try { tail.disconnect(); gain.disconnect(); } catch { /* ignore */ }
    };
    src.start();
    this.played++;
    return true;
  }

  /**
   * Resource pickup with a rising pentatonic combo: quick pickups climb the scale,
   * a pause resets it. tier 0..3 picks a more distinctive timbre for rare loot.
   */
  playPickup(tier = 0, volume = 1) {
    const now = performance.now();
    this._pickupCombo = now - this._pickupLast < 700 ? this._pickupCombo + 1 : 0;
    this._pickupLast = now;
    const semis = PENTATONIC[Math.min(this._pickupCombo, PENTATONIC.length - 1)];
    return this.play(`pickup_${Math.max(0, Math.min(3, tier))}`, {
      pitch: Math.pow(2, semis / 12) * 0.8,
      pitchJitter: 0.01,
      volume,
    });
  }

  // ---------- loops (drills, lasers) ----------

  startLoop(name) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const existing = this.loops.get(name);
    if (existing) {
      existing.wanted = true;
      existing.gain.gain.setTargetAtTime(SOUNDS[name].gain, this.ctx.currentTime, 0.04);
      return;
    }
    const def = SOUNDS[name];
    if (!def) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._ensureBuffer(name, 0);
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(def.gain, ctx.currentTime, 0.04);
    src.connect(gain);
    gain.connect(this.nodes.sfx);
    src.start();
    this.loops.set(name, { src, gain, wanted: true });
  }

  setLoopRate(name, rate) {
    const l = this.loops.get(name);
    if (l && this.ctx) l.src.playbackRate.setTargetAtTime(rate, this.ctx.currentTime, 0.05);
  }

  stopLoop(name) {
    const l = this.loops.get(name);
    if (!l || !this.ctx) return;
    l.wanted = false;
    l.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
  }

  stopAllLoops() {
    for (const name of this.loops.keys()) this.stopLoop(name);
  }
}
