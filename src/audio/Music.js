// Generative background music. Each level supplies { root, scale, tempo, mood } (data/levels.js);
// the engine plans one bar at a time (chord pad, bass, a gentle melody and optional
// percussion) and schedules it ahead of time with the Web Audio clock.

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
};

// prog: chord roots as scale degrees (one per bar); density: chance a melody step plays;
// perc: percussion style; lead/pad: oscillator types; cutoff: pad brightness (Hz); level: loudness
export const MOODS = {
  bright:     { prog: [0, 3, 4, 3], density: 0.55, perc: 'none', lead: 'triangle', pad: 'sawtooth', cutoff: 1800, level: 1 },
  dark:       { prog: [0, 5, 3, 4], density: 0.3, perc: 'none', lead: 'sine', pad: 'sawtooth', cutoff: 700, level: 1 },
  industrial: { prog: [0, 0, 3, 4], density: 0.45, perc: 'kick', lead: 'square', pad: 'sawtooth', cutoff: 900, level: 0.9 },
  warm:       { prog: [0, 4, 5, 3], density: 0.55, perc: 'soft', lead: 'triangle', pad: 'triangle', cutoff: 1600, level: 1 },
  glassy:     { prog: [0, 2, 4, 1], density: 0.6, perc: 'none', lead: 'sine', pad: 'triangle', cutoff: 2600, level: 1 },
  ominous:    { prog: [0, 1, 0, 4], density: 0.25, perc: 'kick', lead: 'sine', pad: 'sawtooth', cutoff: 500, level: 1 },
  void:       { prog: [0, 5, 2, 5], density: 0.2, perc: 'none', lead: 'sine', pad: 'sine', cutoff: 900, level: 1.1 },
  machine:    { prog: [0, 0, 5, 4], density: 0.5, perc: 'kick', lead: 'square', pad: 'sawtooth', cutoff: 1000, level: 0.85 },
  cosmic:     { prog: [0, 3, 1, 4], density: 0.5, perc: 'none', lead: 'triangle', pad: 'sine', cutoff: 2200, level: 1 },
  triumph:    { prog: [0, 4, 5, 3], density: 0.7, perc: 'soft', lead: 'triangle', pad: 'sawtooth', cutoff: 2400, level: 1 },
  menu:       { prog: [0, 3, 4, 0], density: 0.4, perc: 'none', lead: 'triangle', pad: 'triangle', cutoff: 1500, level: 0.9 },
  // The soundtrack of the ending: rising, resolved, bigger.
  ending:     { prog: [0, 3, 4, 0, 5, 3, 4, 0], density: 0.8, perc: 'soft', lead: 'triangle', pad: 'sawtooth', cutoff: 3200, level: 1.1 },
};

export const MENU_TRACK = { root: 57, scale: 'major', tempo: 66, mood: 'menu' };
export const ENDING_TRACK = { root: 60, scale: 'major', tempo: 84, mood: 'ending' };

export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** MIDI note for a scale degree (can be negative or beyond one octave). */
export function scaleNote(root, scaleName, degree) {
  const sc = SCALES[scaleName] || SCALES.major;
  const oct = Math.floor(degree / sc.length);
  const idx = ((degree % sc.length) + sc.length) % sc.length;
  return root + oct * 12 + sc[idx];
}

/** Small seeded PRNG so plans are reproducible in tests. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Plan one 4-beat bar. Returns
 *  { chord: midi[], bass: midi, melody: [{ beat, midi, dur }], perc: [{ beat, kind }] }
 */
export function planBar(track, barIndex, rng) {
  const mood = MOODS[track.mood] || MOODS.menu;
  const deg = mood.prog[barIndex % mood.prog.length];
  const chord = [0, 2, 4].map((o) => scaleNote(track.root, track.scale, deg + o));
  const bass = scaleNote(track.root - 12, track.scale, deg);

  const melody = [];
  let cur = deg + 7 + Math.floor(rng() * 3); // start near the chord, an octave up
  for (let step = 0; step < 8; step++) {
    if (rng() > mood.density) continue;
    const move = [-2, -1, -1, 0, 1, 1, 2][Math.floor(rng() * 7)];
    cur = Math.max(deg + 2, Math.min(deg + 12, cur + move));
    melody.push({ beat: step * 0.5, midi: scaleNote(track.root, track.scale, cur), dur: 0.5 + (rng() < 0.3 ? 0.5 : 0) });
  }

  const perc = [];
  if (mood.perc === 'kick') {
    perc.push({ beat: 0, kind: 'kick' }, { beat: 2, kind: 'kick' });
    for (let b = 0.5; b < 4; b += 1) perc.push({ beat: b, kind: 'hat' });
  } else if (mood.perc === 'soft') {
    perc.push({ beat: 0, kind: 'soft' }, { beat: 2, kind: 'soft' });
    perc.push({ beat: 1, kind: 'hat' }, { beat: 3, kind: 'hat' });
  }
  return { chord, bass, melody, perc };
}

/**
 * Plays tracks on the AudioEngine's music bus. Only one track at a time; changing
 * track crossfades. Costs almost nothing when music is muted (nothing is scheduled).
 */
export class MusicEngine {
  constructor(audio) {
    this.audio = audio;
    this.track = null;
    this.trackKey = '';
    this.timer = null;
    this.nextBarTime = 0;
    this.barIndex = 0;
    this.out = null; // per-track gain
    this.rng = Math.random;
    this._noise = null;
    audio.music = this;
  }

  /** Switch to a track ({ root, scale, tempo, mood }) or stop with null. */
  setTrack(track) {
    const key = track ? `${track.mood}|${track.root}|${track.scale}|${track.tempo}` : '';
    if (key === this.trackKey) return;
    this.trackKey = key;
    this.track = track;
    this._fadeOutCurrent();
    if (this.audio.ctx) this._start();
  }

  /** Called once the AudioContext exists (after the first user gesture). */
  onUnlock() {
    if (this.track && !this.timer) this._start();
  }

  stop() {
    this.setTrack(null);
  }

  get audible() {
    const s = this.audio.settings;
    return !s.muteMaster && !s.muteMusic && s.master > 0 && s.music > 0;
  }

  _fadeOutCurrent() {
    const ctx = this.audio.ctx;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.out && ctx) {
      const g = this.out.gain;
      const t = ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0, t + 1.6);
      const old = this.out;
      setTimeout(() => { try { old.disconnect(); } catch { /* already gone */ } }, 2000);
    }
    this.out = null;
  }

  _start() {
    const ctx = this.audio.ctx;
    if (!ctx || !this.track) return;
    this.out = ctx.createGain();
    this.out.gain.setValueAtTime(0, ctx.currentTime);
    this.out.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 2.5);
    this.out.connect(this.audio.nodes.music);
    this.nextBarTime = ctx.currentTime + 0.15;
    this.barIndex = 0;
    this.timer = setInterval(() => this._tick(), 120);
  }

  _tick() {
    const ctx = this.audio.ctx;
    if (!ctx || !this.track || !this.out || ctx.state !== 'running') return;
    if (!this.audible) {
      this.nextBarTime = Math.max(this.nextBarTime, ctx.currentTime + 0.1);
      return;
    }
    const beat = 60 / this.track.tempo;
    while (this.nextBarTime < ctx.currentTime + 0.8) {
      this._scheduleBar(planBar(this.track, this.barIndex, this.rng), this.nextBarTime, beat);
      this.nextBarTime += beat * 4;
      this.barIndex++;
    }
  }

  _scheduleBar(plan, t0, beat) {
    const mood = MOODS[this.track.mood] || MOODS.menu;
    const lvl = mood.level;
    const barLen = beat * 4;
    // pad: two slightly detuned voices per chord tone, through a lowpass
    const filter = this.audio.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = mood.cutoff;
    filter.connect(this.out);
    for (const m of plan.chord) {
      for (const det of [-6, 6]) this._tone(filter, mood.pad, midiToFreq(m), t0, barLen + 0.4, 0.035 * lvl, barLen * 0.45, det);
    }
    setTimeout(() => { try { filter.disconnect(); } catch { /* ok */ } }, (barLen + 3) * 1000 + 1500);
    // bass
    this._tone(this.out, 'sine', midiToFreq(plan.bass), t0, beat * 2 - 0.05, 0.11 * lvl, 0.02);
    this._tone(this.out, 'sine', midiToFreq(plan.bass), t0 + beat * 2, beat * 2 - 0.05, 0.09 * lvl, 0.02);
    // melody
    for (const n of plan.melody) {
      this._tone(this.out, mood.lead, midiToFreq(n.midi), t0 + n.beat * beat, n.dur * beat + 0.25, 0.05 * lvl, 0.015, 0, true);
    }
    // percussion
    for (const p of plan.perc) this._perc(p.kind, t0 + p.beat * beat, lvl);
  }

  _tone(dest, type, freq, t, dur, peak, attack, detune = 0, pluck = false) {
    const ctx = this.audio.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + Math.max(0.005, attack));
    if (pluck) g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    else {
      g.gain.setValueAtTime(peak, t + Math.max(attack, dur - Math.max(0.3, attack)));
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
    }
    osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    osc.onended = () => { try { g.disconnect(); } catch { /* ok */ } };
  }

  _noiseBuffer() {
    if (!this._noise) {
      const ctx = this.audio.ctx;
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this._noise = buf;
    }
    return this._noise;
  }

  _perc(kind, t, lvl) {
    const ctx = this.audio.ctx;
    if (kind === 'kick' || kind === 'soft') {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const peak = (kind === 'kick' ? 0.2 : 0.1) * lvl;
      osc.frequency.setValueAtTime(kind === 'kick' ? 120 : 90, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(g); g.connect(this.out);
      osc.start(t); osc.stop(t + 0.25);
      osc.onended = () => { try { g.disconnect(); } catch { /* ok */ } };
    } else {
      const src = ctx.createBufferSource();
      src.buffer = this._noiseBuffer();
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 6000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.03 * lvl, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      src.connect(hp); hp.connect(g); g.connect(this.out);
      src.start(t); src.stop(t + 0.08);
      src.onended = () => { try { g.disconnect(); hp.disconnect(); } catch { /* ok */ } };
    }
  }
}
