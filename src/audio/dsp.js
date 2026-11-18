// Tiny offline synthesis toolkit. Everything renders into plain Float32Arrays,
// so sounds are generated once at startup (and are unit-testable in Node), then
// uploaded to the Web Audio API as AudioBuffers.

export const SR = 44100;
const TAU = Math.PI * 2;

/** Deterministic PRNG (mulberry32) returning floats in [0, 1). */
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createBuffer(seconds) {
  return new Float32Array(Math.max(1, Math.round(seconds * SR)));
}

function wave(type, ph) {
  switch (type) {
    case 'square': return ph % TAU < Math.PI ? 1 : -1;
    case 'saw': return 2 * ((ph / TAU) % 1) - 1;
    case 'tri': return 4 * Math.abs(((ph / TAU) % 1) - 0.5) - 1;
    default: return Math.sin(ph);
  }
}

/**
 * Add a (possibly gliding) oscillator.
 * o: start, dur, freq, endFreq, type, gain, attack, decay (exp time constant), release,
 *    vibHz, vibDepth (fraction of freq), fmRatio, fmIndex
 */
export function addTone(out, o) {
  const start = o.start || 0;
  const n0 = Math.floor(start * SR);
  const n = Math.min(Math.floor(o.dur * SR), out.length - n0);
  if (n <= 0) return;
  const f0 = o.freq;
  const f1 = o.endFreq || f0;
  const gain = o.gain === undefined ? 1 : o.gain;
  const attack = Math.max(0.0005, o.attack === undefined ? 0.003 : o.attack);
  const decay = o.decay || Infinity;
  const rel = Math.min(o.release === undefined ? 0.008 : o.release, o.dur * 0.5);
  const vibHz = o.vibHz || 0;
  const vibDepth = o.vibDepth || 0;
  const fmR = o.fmRatio || 0;
  const fmI = o.fmIndex || 0;
  const type = o.type || 'sine';
  const ratio = f1 / f0;
  let phase = 0;
  let modPhase = 0;

  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let f = ratio === 1 ? f0 : f0 * Math.pow(ratio, t / o.dur);
    if (vibHz) f *= 1 + vibDepth * Math.sin(TAU * vibHz * t);
    phase += (TAU * f) / SR;
    let s;
    if (fmR) {
      modPhase += (TAU * f * fmR) / SR;
      s = Math.sin(phase + fmI * Math.exp(-t / (decay === Infinity ? 1 : decay)) * Math.sin(modPhase));
    } else {
      s = wave(type, phase);
    }
    let a = t < attack ? t / attack : 1;
    if (decay !== Infinity) a *= Math.exp(-t / decay);
    const tail = o.dur - t;
    if (tail < rel) a *= tail / rel;
    out[n0 + i] += s * gain * a;
  }
}

/**
 * Add filtered noise. lp/lpEnd: low-pass cutoff glide (Hz); hp: high-pass cutoff (Hz).
 */
export function addNoise(out, rng, o) {
  const start = o.start || 0;
  const n0 = Math.floor(start * SR);
  const n = Math.min(Math.floor(o.dur * SR), out.length - n0);
  if (n <= 0) return;
  const gain = o.gain === undefined ? 1 : o.gain;
  const attack = Math.max(0.0005, o.attack === undefined ? 0.001 : o.attack);
  const decay = o.decay || Infinity;
  const lp0 = o.lp || 20000;
  const lp1 = o.lpEnd || lp0;
  const hp = o.hp || 0;
  const rel = Math.min(o.release === undefined ? 0.006 : o.release, o.dur * 0.5);
  const hpA = hp ? 1 - Math.exp((-TAU * hp) / SR) : 0;
  let lpState = 0;
  let hpState = 0;

  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const fc = lp1 === lp0 ? lp0 : lp0 * Math.pow(lp1 / lp0, t / o.dur);
    const a1 = 1 - Math.exp((-TAU * Math.min(fc, SR * 0.45)) / SR);
    lpState += a1 * (rng() * 2 - 1 - lpState);
    let s = lpState;
    if (hp) {
      hpState += hpA * (s - hpState);
      s -= hpState;
    }
    let a = t < attack ? t / attack : 1;
    if (decay !== Infinity) a *= Math.exp(-t / decay);
    const tail = o.dur - t;
    if (tail < rel) a *= tail / rel;
    out[n0 + i] += s * gain * a;
  }
}

/**
 * Inharmonic partial stack (bells, metal, glass). Higher partials decay faster.
 * o: start, dur, f0, ratios[], gains[], decay, slope, gain, attack
 */
export function addPartials(out, o) {
  const ratios = o.ratios;
  for (let i = 0; i < ratios.length; i++) {
    addTone(out, {
      start: o.start,
      dur: o.dur,
      freq: o.f0 * ratios[i],
      gain: (o.gain === undefined ? 1 : o.gain) * (o.gains ? o.gains[i] : 1 / (i + 1)),
      attack: o.attack === undefined ? 0.001 : o.attack,
      decay: o.decay / (1 + (o.slope === undefined ? 0.6 : o.slope) * i),
      release: o.release,
    });
  }
}

export function reverse(buf) {
  buf.reverse();
  return buf;
}

/** Scale so the loudest sample hits `peak`. */
export function normalize(buf, peak = 0.9) {
  let max = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = Math.abs(buf[i]);
    if (v > max) max = v;
  }
  if (max > 0) {
    const k = peak / max;
    for (let i = 0; i < buf.length; i++) buf[i] *= k;
  }
  return buf;
}

/** Gentle saturation to tame stacked layers. */
export function softClip(buf, drive = 1) {
  for (let i = 0; i < buf.length; i++) buf[i] = Math.tanh(buf[i] * drive);
  return buf;
}

/** Remove clicks at both ends. */
export function declick(buf, ms = 3) {
  const n = Math.min(Math.floor((ms / 1000) * SR), buf.length >> 1);
  for (let i = 0; i < n; i++) {
    const k = i / n;
    buf[i] *= k;
    buf[buf.length - 1 - i] *= k;
  }
  return buf;
}

/** Make a seamlessly loopable buffer by crossfading its tail into its head. */
export function makeLoop(buf, fadeSeconds = 0.06) {
  const fade = Math.min(Math.floor(fadeSeconds * SR), buf.length >> 2);
  const len = buf.length - fade;
  const out = new Float32Array(len);
  out.set(buf.subarray(0, len));
  for (let i = 0; i < fade; i++) {
    const w = i / fade;
    out[i] = buf[i] * w + buf[len + i] * (1 - w);
  }
  return out;
}

/** Add `src` into `dst` at a time offset (seconds). */
export function mixInto(dst, src, offset = 0, gain = 1) {
  const n0 = Math.floor(offset * SR);
  const n = Math.min(src.length, dst.length - n0);
  for (let i = 0; i < n; i++) dst[n0 + i] += src[i] * gain;
}

export const semitone = (n) => Math.pow(2, n / 12);
