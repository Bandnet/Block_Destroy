import {
  SR, makeRng, createBuffer, addTone, addNoise, addPartials,
  normalize, softClip, declick, reverse, makeLoop, mixInto,
} from './dsp.js';

/**
 * Procedural sound library. Every entry renders to a Float32Array (mono, 44.1 kHz).
 *
 * SOUNDS[name] = { variants, gain, cooldown, maxVoices, priority, loop, render(rng, variant) }
 *
 * Naming: hit_<material>, break_<material>, swing, zap, loop_<tool>, pickup_0..3,
 * crit, area_boom, upgrade_buy, tool_unlock, branch_complete, achievement,
 * level_complete, level_unlock, final_sequence, ui_*, test_tone.
 */
export const SOUNDS = {};

function def(name, opts, render) {
  SOUNDS[name] = {
    name,
    variants: 1,
    gain: 1,
    cooldown: 0.03,
    maxVoices: 4,
    priority: 1,
    loop: false,
    ...opts,
    render,
  };
}

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI note -> Hz
const C4 = 60, D4 = 62, E4 = 64, G4 = 67, B4 = 71, C5 = 72, E5 = 76, G5 = 79, B5 = 83, C6 = 84, D6 = 86, E6 = 88, G6 = 91;

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

const FAMILIES = {
  dirt:     { kind: 'soft',     body: 95,  crunch: 1500, grit: 0.9 },
  grass:    { kind: 'soft',     body: 120, crunch: 3200, grit: 0.5, swish: true },
  stone:    { kind: 'rock',     body: 68,  crunch: 2400 },
  iron:     { kind: 'metal',    f0: 380,   ratios: [1, 2.76, 5.4, 8.93, 13.3], ring: 1 },
  gold:     { kind: 'metal',    f0: 560,   ratios: [1, 2.32, 4.2, 6.9, 10.1],  ring: 1.7 },
  diamond:  { kind: 'glass',    f0: 1650,  ring: 1.2 },
  crystal:  { kind: 'glass',    f0: 1100,  ring: 2.2, shimmer: true },
  obsidian: { kind: 'dark',     body: 52,  f0: 760 },
  void:     { kind: 'void',     body: 36 },
  ultimate: { kind: 'ultimate', f0: 523 },
  core:     { kind: 'ultimate', f0: 196,   deep: true },
};

function materialSound(fam, rng, variant, big) {
  const k = big ? 1.7 : 1;
  const v = (variant - 1) * 0.08; // small per-variant pitch offset
  const out = createBuffer(
    big ? (fam.kind === 'ultimate' || fam.kind === 'void' ? 1.3 : fam.kind === 'glass' || fam.kind === 'metal' ? 1.1 : 0.7)
        : (fam.kind === 'ultimate' || fam.kind === 'glass' || fam.kind === 'metal' ? 0.5 : 0.3)
  );

  switch (fam.kind) {
    case 'soft': {
      const f = fam.body * (1 + v);
      addTone(out, { dur: 0.16 * k, freq: f * 1.4, endFreq: f * 0.6, decay: 0.05 * k, gain: 0.9 });
      addNoise(out, rng, { dur: 0.18 * k, lp: fam.crunch, lpEnd: fam.crunch * 0.3, hp: 180, decay: 0.04 * k, gain: 0.8 * fam.grit });
      const grains = big ? 7 : 2;
      for (let g = 0; g < grains; g++) {
        addNoise(out, rng, { start: 0.01 + rng() * 0.14 * k, dur: 0.03, lp: fam.crunch * (0.6 + rng() * 0.8), hp: 300, decay: 0.01, gain: 0.45 });
      }
      if (fam.swish) addNoise(out, rng, { dur: 0.18 * k, lp: 6000, lpEnd: 1500, hp: 2500, attack: 0.02, decay: 0.07, gain: 0.35 });
      break;
    }
    case 'rock': {
      const f = fam.body * (1 + v);
      addTone(out, { dur: 0.26 * k, freq: f * 1.6, endFreq: f * 0.7, decay: 0.07 * k, gain: 1 });
      addNoise(out, rng, { dur: 0.05, lp: 7000, hp: 800, decay: 0.008, gain: 0.9 });
      addNoise(out, rng, { dur: 0.24 * k, lp: fam.crunch, lpEnd: fam.crunch * 0.25, decay: 0.06 * k, gain: 0.7 });
      if (big) {
        addTone(out, { dur: 0.45, freq: f * 0.9, endFreq: f * 0.5, decay: 0.13, gain: 0.8 });
        for (let g = 0; g < 9; g++) {
          addNoise(out, rng, { start: 0.05 + rng() * 0.35, dur: 0.05, lp: 1200 + rng() * 1800, hp: 200, decay: 0.014, gain: 0.4 });
        }
      }
      break;
    }
    case 'metal': {
      addNoise(out, rng, { dur: 0.012, hp: 2500, lp: 9000, decay: 0.003, gain: 0.9 });
      addTone(out, { dur: 0.09, freq: 170, endFreq: 90, decay: 0.03, gain: 0.7 });
      addPartials(out, {
        f0: fam.f0 * (1 + v * 0.4), ratios: fam.ratios, gains: [1, 0.7, 0.5, 0.35, 0.2],
        dur: big ? 1.05 : 0.45, decay: (big ? 0.3 : 0.11) * fam.ring, slope: 0.7, gain: 0.5,
      });
      if (big) {
        addPartials(out, {
          start: 0.07, f0: fam.f0 * 0.75, ratios: fam.ratios, gains: [0.8, 0.5, 0.3, 0.2, 0.1],
          dur: 0.9, decay: 0.22 * fam.ring, slope: 0.8, gain: 0.35,
        });
      }
      break;
    }
    case 'glass': {
      addNoise(out, rng, { dur: 0.012, hp: 5000, decay: 0.002, gain: 1 });
      addNoise(out, rng, { dur: 0.07, hp: 3000, lp: 12000, decay: 0.012, gain: 0.6 });
      addPartials(out, {
        f0: fam.f0 * (1 + v * 0.5), ratios: [1, 1.47, 2.09, 2.76, 3.9, 5.2], gains: [1, 0.8, 0.6, 0.45, 0.3, 0.2],
        dur: big ? 1.0 : 0.45, decay: (big ? 0.42 : 0.15) * fam.ring, slope: 0.5, gain: 0.4,
      });
      if (fam.shimmer) addTone(out, { dur: big ? 1.0 : 0.45, freq: fam.f0 * 2, decay: 0.3 * fam.ring, gain: 0.25, vibHz: 7, vibDepth: 0.01 });
      if (big) {
        for (let g = 0; g < 12; g++) {
          addTone(out, { start: rng() * 0.35, dur: 0.06, freq: 2200 + rng() * 6500, decay: 0.02, gain: 0.18 });
        }
      }
      break;
    }
    case 'dark': {
      const f = fam.body * (1 + v);
      addTone(out, { dur: 0.3 * k, freq: f * 1.7, endFreq: f * 0.7, decay: 0.09 * k, gain: 1 });
      addNoise(out, rng, { dur: 0.2 * k, lp: 1800, lpEnd: 300, decay: 0.05 * k, gain: 0.6 });
      addPartials(out, {
        f0: fam.f0, ratios: [1, 2.1, 3.4, 5.1], gains: [0.6, 0.4, 0.3, 0.2],
        dur: big ? 0.8 : 0.3, decay: big ? 0.25 : 0.09, slope: 0.8, gain: 0.35,
      });
      break;
    }
    case 'void': {
      const f = fam.body * (1 + v * 0.5);
      addTone(out, { dur: big ? 1.2 : 0.4, freq: f * 1.6, endFreq: f * 0.7, decay: big ? 0.3 : 0.12, gain: 1 });
      const swell = createBuffer(big ? 0.7 : 0.3);
      addNoise(swell, rng, { dur: big ? 0.7 : 0.3, lp: 7000, lpEnd: 200, decay: big ? 0.25 : 0.1, gain: 0.5 });
      mixInto(out, reverse(swell), 0, big ? 0.7 : 0.5);
      addTone(out, { start: big ? 0.65 : 0.25, dur: 0.25, freq: 1200, fmRatio: 1.41, fmIndex: 4, decay: 0.1, gain: 0.25 });
      break;
    }
    case 'ultimate': {
      const base = fam.f0;
      const ratios = fam.deep ? [1, 1.5, 2, 3] : [1, 1.25, 1.5, 2, 3];
      for (const r of ratios) {
        addTone(out, { dur: big ? 1.2 : 0.45, freq: base * r * (1 + v * 0.2), decay: big ? 0.45 : 0.16, gain: 0.22, vibHz: 6, vibDepth: 0.004 });
      }
      addTone(out, { dur: big ? 0.7 : 0.25, freq: fam.deep ? 70 : 90, endFreq: 40, decay: big ? 0.2 : 0.08, gain: 0.9 });
      addNoise(out, rng, { dur: big ? 0.5 : 0.2, hp: 6000, decay: big ? 0.15 : 0.05, gain: 0.35 });
      break;
    }
    default:
      break;
  }

  normalize(out, big ? 0.95 : 0.8);
  return declick(out);
}

for (const [key, fam] of Object.entries(FAMILIES)) {
  def(`hit_${key}`, { variants: 3, gain: 0.8, cooldown: 0.045, maxVoices: 3, priority: 1 },
    (rng, v) => materialSound(fam, rng, v, false));
  def(`break_${key}`, { variants: 2, gain: 1, cooldown: 0.05, maxVoices: 5, priority: 3 },
    (rng, v) => materialSound(fam, rng, v, true));
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

def('swing', { variants: 3, gain: 0.35, cooldown: 0.05, maxVoices: 2, priority: 0 }, (rng) => {
  const out = createBuffer(0.14);
  addNoise(out, rng, { dur: 0.14, lp: 5000, lpEnd: 900, hp: 400, attack: 0.03, decay: 0.05, gain: 0.8 });
  return declick(normalize(out, 0.6));
});

def('zap', { variants: 3, gain: 0.45, cooldown: 0.05, maxVoices: 3, priority: 1 }, (rng, v) => {
  const out = createBuffer(0.16);
  addTone(out, { dur: 0.14, freq: 1900 + v * 150, endFreq: 380, type: 'saw', decay: 0.05, gain: 0.5 });
  addTone(out, { dur: 0.14, freq: 900, endFreq: 260, fmRatio: 2.01, fmIndex: 3, decay: 0.06, gain: 0.5 });
  addNoise(out, rng, { dur: 0.05, hp: 4000, decay: 0.01, gain: 0.3 });
  return declick(normalize(out, 0.7));
});

function loopSound(build) {
  return (rng) => {
    const len = 0.56;
    const raw = createBuffer(len);
    build(raw, rng);
    softClip(raw, 1.2);
    return normalize(makeLoop(raw, 0.06), 0.55);
  };
}
// Frequencies below are multiples of 2 Hz so tonal parts are periodic over the 0.5 s loop.
def('loop_drill', { loop: true, gain: 0.5 }, loopSound((o, rng) => {
  addTone(o, { dur: 0.56, freq: 56, type: 'saw', gain: 0.6, vibHz: 24, vibDepth: 0.03, release: 0 });
  addTone(o, { dur: 0.56, freq: 112, type: 'square', gain: 0.25, vibHz: 24, vibDepth: 0.05, release: 0 });
  addNoise(o, rng, { dur: 0.56, lp: 2200, hp: 400, gain: 0.35, release: 0 });
}));
def('loop_plasma', { loop: true, gain: 0.45 }, loopSound((o, rng) => {
  addTone(o, { dur: 0.56, freq: 180, type: 'saw', gain: 0.5, vibHz: 8, vibDepth: 0.04, release: 0 });
  addTone(o, { dur: 0.56, freq: 900, type: 'sine', gain: 0.25, vibHz: 6, vibDepth: 0.05, release: 0 });
  addNoise(o, rng, { dur: 0.56, hp: 3000, lp: 9000, gain: 0.3, release: 0 });
}));
def('loop_quantum', { loop: true, gain: 0.45 }, loopSound((o) => {
  for (const [f, g] of [[220, 0.5], [330, 0.4], [444, 0.3], [666, 0.18]]) {
    addTone(o, { dur: 0.56, freq: f, gain: g, vibHz: 6, vibDepth: 0.01, release: 0 });
  }
}));
def('loop_void', { loop: true, gain: 0.5 }, loopSound((o, rng) => {
  addTone(o, { dur: 0.56, freq: 44, gain: 0.9, vibHz: 4, vibDepth: 0.03, release: 0 });
  addTone(o, { dur: 0.56, freq: 88, type: 'tri', gain: 0.3, release: 0 });
  addNoise(o, rng, { dur: 0.56, lp: 700, gain: 0.5, release: 0 });
}));
def('loop_ultimate', { loop: true, gain: 0.45 }, loopSound((o, rng) => {
  for (const [f, g] of [[48, 0.7], [262, 0.3], [392, 0.25], [524, 0.2], [786, 0.12]]) {
    addTone(o, { dur: 0.56, freq: f, gain: g, vibHz: 6, vibDepth: 0.006, release: 0 });
  }
  addNoise(o, rng, { dur: 0.56, hp: 5000, gain: 0.15, release: 0 });
}));

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

def('pickup_0', { gain: 0.5, cooldown: 0.03, maxVoices: 6, priority: 1 }, () => {
  const out = createBuffer(0.16);
  addTone(out, { dur: 0.14, freq: 880, decay: 0.04, gain: 0.7 });
  addTone(out, { dur: 0.14, freq: 1760, decay: 0.03, gain: 0.25 });
  return declick(normalize(out, 0.7));
});
def('pickup_1', { gain: 0.55, cooldown: 0.03, maxVoices: 6, priority: 1 }, () => {
  const out = createBuffer(0.22);
  addTone(out, { dur: 0.2, freq: 1320, decay: 0.06, gain: 0.7 });
  addTone(out, { dur: 0.2, freq: 2640, decay: 0.04, gain: 0.3 });
  addTone(out, { start: 0.05, dur: 0.15, freq: 1760, decay: 0.05, gain: 0.3 });
  return declick(normalize(out, 0.7));
});
def('pickup_2', { gain: 0.6, cooldown: 0.04, maxVoices: 5, priority: 2 }, () => {
  const out = createBuffer(0.4);
  [1568, 2093, 2637].forEach((f, i) => addTone(out, { start: i * 0.05, dur: 0.25, freq: f, decay: 0.07, gain: 0.5 }));
  return declick(normalize(out, 0.75));
});
def('pickup_3', { gain: 0.7, cooldown: 0.06, maxVoices: 4, priority: 3 }, (rng) => {
  const out = createBuffer(0.7);
  addPartials(out, { f0: 2093, ratios: [1, 2.76, 5.4], gains: [1, 0.5, 0.3], dur: 0.65, decay: 0.2, gain: 0.55 });
  addNoise(out, rng, { dur: 0.3, hp: 7000, decay: 0.08, gain: 0.25 });
  return declick(normalize(out, 0.8));
});

// ---------------------------------------------------------------------------
// Combat feel
// ---------------------------------------------------------------------------

def('crit', { gain: 0.8, cooldown: 0.06, maxVoices: 2, priority: 3 }, (rng) => {
  const out = createBuffer(0.4);
  addNoise(out, rng, { dur: 0.02, hp: 4000, decay: 0.004, gain: 0.9 });
  addTone(out, { dur: 0.15, freq: 1500, endFreq: 650, type: 'saw', decay: 0.05, gain: 0.45 });
  addPartials(out, { f0: 2100, ratios: [1, 2.76, 4.07], gains: [1, 0.5, 0.35], dur: 0.38, decay: 0.12, gain: 0.45 });
  return declick(normalize(out, 0.85));
});

def('area_boom', { variants: 2, gain: 1, cooldown: 0.12, maxVoices: 2, priority: 4 }, (rng, v) => {
  const out = createBuffer(1.1);
  addTone(out, { dur: 0.9, freq: 74 + v * 6, endFreq: 28, decay: 0.28, gain: 1.1 });
  addNoise(out, rng, { dur: 0.8, lp: 3200, lpEnd: 160, decay: 0.26, gain: 0.9 });
  for (let g = 0; g < 14; g++) {
    addNoise(out, rng, { start: 0.04 + rng() * 0.5, dur: 0.06, lp: 900 + rng() * 2500, hp: 150, decay: 0.018, gain: 0.35 });
  }
  return declick(normalize(softClip(out, 1.3), 0.95));
});

// ---------------------------------------------------------------------------
// Progression stingers
// ---------------------------------------------------------------------------

def('upgrade_buy', { gain: 0.8, cooldown: 0.05, maxVoices: 2, priority: 3 }, (rng) => {
  const out = createBuffer(0.5);
  addTone(out, { dur: 0.16, freq: NOTE(E5), decay: 0.07, gain: 0.6 });
  addTone(out, { dur: 0.16, freq: NOTE(E5) * 2, decay: 0.04, gain: 0.2 });
  addTone(out, { start: 0.09, dur: 0.38, freq: NOTE(B5), decay: 0.14, gain: 0.6 });
  addTone(out, { start: 0.09, dur: 0.38, freq: NOTE(B5) * 2, decay: 0.08, gain: 0.2 });
  addNoise(out, rng, { start: 0.09, dur: 0.2, hp: 6000, decay: 0.05, gain: 0.2 });
  return declick(normalize(out, 0.8));
});

def('tool_unlock', { gain: 0.95, cooldown: 0.2, maxVoices: 1, priority: 5 }, (rng) => {
  const out = createBuffer(1.6);
  addTone(out, { dur: 0.4, freq: 180, endFreq: 760, type: 'saw', decay: 0.4, gain: 0.35, attack: 0.02 });
  addNoise(out, rng, { dur: 0.4, lp: 600, lpEnd: 9000, attack: 0.05, gain: 0.35 });
  for (const n of [C5, E5, G5, C6]) {
    addPartials(out, { start: 0.4, f0: NOTE(n), ratios: [1, 2.01, 3.0], gains: [1, 0.3, 0.15], dur: 1.1, decay: 0.45, gain: 0.35 });
  }
  addTone(out, { start: 0.4, dur: 0.6, freq: 65, endFreq: 40, decay: 0.2, gain: 0.8 });
  addNoise(out, rng, { start: 0.4, dur: 0.5, hp: 6000, decay: 0.16, gain: 0.3 });
  return declick(normalize(softClip(out, 1.1), 0.9));
});

def('branch_complete', { gain: 1, cooldown: 0.3, maxVoices: 1, priority: 6 }, (rng) => {
  const out = createBuffer(2.4);
  [C5, E5, G5, C6, E6, G6].forEach((n, i) => {
    addPartials(out, { start: i * 0.1, f0: NOTE(n), ratios: [1, 2, 3.01], gains: [1, 0.3, 0.12], dur: 0.7, decay: 0.2, gain: 0.35 });
  });
  for (const n of [C5, E5, G5, C6]) {
    addPartials(out, { start: 0.7, f0: NOTE(n), ratios: [1, 2.01, 3], gains: [1, 0.35, 0.15], dur: 1.6, decay: 0.7, gain: 0.3 });
    addTone(out, { start: 0.7, dur: 1.4, freq: NOTE(n), type: 'saw', decay: 0.5, gain: 0.07 });
  }
  addTone(out, { start: 0.7, dur: 1.0, freq: 65, endFreq: 33, decay: 0.3, gain: 0.8 });
  addNoise(out, rng, { start: 0.7, dur: 1.2, hp: 5000, decay: 0.4, gain: 0.25 });
  return declick(normalize(softClip(out, 1.2), 0.92));
});

def('achievement', { gain: 0.85, cooldown: 0.3, maxVoices: 2, priority: 4 }, () => {
  const out = createBuffer(1.0);
  [G5, B5, D6, G6].forEach((n, i) => {
    addPartials(out, { start: i * 0.1, f0: NOTE(n), ratios: [1, 2.76, 5.4], gains: [1, 0.25, 0.1], dur: 0.8, decay: i === 3 ? 0.4 : 0.15, gain: 0.5 });
  });
  return declick(normalize(out, 0.8));
});

def('level_complete', { gain: 1, cooldown: 0.5, maxVoices: 1, priority: 6 }, (rng) => {
  const out = createBuffer(2.8);
  [C5, E5, G5, C6].forEach((n, i) => {
    addTone(out, { start: i * 0.13, dur: 0.35, freq: NOTE(n), type: 'saw', decay: 0.12, gain: 0.25 });
    addTone(out, { start: i * 0.13, dur: 0.35, freq: NOTE(n), decay: 0.12, gain: 0.4 });
  });
  for (const n of [C4, E4, G4, C5, E5]) {
    addTone(out, { start: 0.55, dur: 2.0, freq: NOTE(n), type: 'saw', decay: 0.7, gain: 0.12 });
    addPartials(out, { start: 0.55, f0: NOTE(n + 12), ratios: [1, 2.01, 3], gains: [0.8, 0.3, 0.15], dur: 2.0, decay: 0.8, gain: 0.25 });
  }
  addTone(out, { start: 0.55, dur: 0.9, freq: 98, endFreq: 49, decay: 0.3, gain: 0.8 });
  addNoise(out, rng, { start: 0.55, dur: 1.5, hp: 5000, decay: 0.5, gain: 0.2 });
  return declick(normalize(softClip(out, 1.15), 0.92));
});

def('level_unlock', { gain: 0.9, cooldown: 0.3, maxVoices: 1, priority: 5 }, (rng) => {
  const out = createBuffer(1.1);
  addNoise(out, rng, { dur: 0.03, hp: 2000, decay: 0.006, gain: 0.8 });
  addPartials(out, { start: 0.02, f0: 520, ratios: [1, 2.76, 5.4], gains: [1, 0.5, 0.3], dur: 0.2, decay: 0.05, gain: 0.35 });
  addTone(out, { start: 0.22, dur: 0.18, freq: NOTE(G5), decay: 0.08, gain: 0.5 });
  addTone(out, { start: 0.34, dur: 0.7, freq: NOTE(C6), decay: 0.3, gain: 0.55 });
  addTone(out, { start: 0.34, dur: 0.7, freq: NOTE(C6) * 2, decay: 0.2, gain: 0.2, vibHz: 6, vibDepth: 0.01 });
  addNoise(out, rng, { start: 0.34, dur: 0.5, hp: 7000, decay: 0.15, gain: 0.2 });
  return declick(normalize(out, 0.85));
});

def('final_sequence', { gain: 1, cooldown: 1, maxVoices: 1, priority: 9 }, (rng) => {
  const out = createBuffer(10);
  // Build-up (0 - 3.2 s): rising swell, rising saw, tremor
  addNoise(out, rng, { dur: 3.2, lp: 200, lpEnd: 9000, attack: 1.0, decay: 3.0, gain: 0.45 });
  addTone(out, { dur: 3.2, freq: 55, endFreq: 440, type: 'saw', attack: 0.5, decay: 4, gain: 0.3 });
  addTone(out, { dur: 3.2, freq: 110, endFreq: 880, type: 'sine', attack: 0.5, gain: 0.25, vibHz: 9, vibDepth: 0.02 });
  for (let i = 0; i < 16; i++) {
    addTone(out, { start: 1.4 + i * 0.11, dur: 0.1, freq: 70, endFreq: 45, decay: 0.04, gain: 0.35 + i * 0.03 });
  }
  // Silence beat (3.2 - 3.6 s), then the release
  const T = 3.6;
  addTone(out, { start: T, dur: 3.5, freq: 49, endFreq: 33, decay: 1.2, gain: 1.0 });
  addNoise(out, rng, { start: T, dur: 2.5, lp: 6000, lpEnd: 200, decay: 0.7, gain: 0.7 });
  for (const n of [36, 48, 55, 60, 64, 67, 72]) {
    addTone(out, { start: T, dur: 5.5, freq: NOTE(n), type: 'saw', decay: 2.2, gain: 0.1 });
    addPartials(out, { start: T, f0: NOTE(n + 12), ratios: [1, 2.01, 3.0, 4.2], gains: [0.8, 0.35, 0.2, 0.1], dur: 5.5, decay: 2.0, gain: 0.2 });
  }
  // Rising bell cascade
  [72, 76, 79, 84, 88, 91, 96, 100].forEach((n, i) => {
    addPartials(out, { start: T + 0.5 + i * 0.22, f0: NOTE(n), ratios: [1, 2.76, 5.4], gains: [1, 0.3, 0.15], dur: 1.8, decay: 0.6, gain: 0.25 });
  });
  for (let i = 0; i < 26; i++) {
    addTone(out, { start: T + 1 + rng() * 3.5, dur: 0.12, freq: 3000 + rng() * 6000, decay: 0.05, gain: 0.12 });
  }
  addNoise(out, rng, { start: T, dur: 4.0, hp: 5000, decay: 1.2, gain: 0.2 });
  return declick(normalize(softClip(out, 1.1), 0.95), 8);
});

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

def('ui_click', { gain: 0.5, cooldown: 0.02, maxVoices: 3, priority: 2 }, () => {
  const out = createBuffer(0.06);
  addTone(out, { dur: 0.05, freq: 1250, endFreq: 850, decay: 0.014, gain: 0.8 });
  return declick(normalize(out, 0.6), 1);
});
def('ui_error', { gain: 0.5, cooldown: 0.1, maxVoices: 1, priority: 2 }, () => {
  const out = createBuffer(0.2);
  addTone(out, { dur: 0.18, freq: 130, endFreq: 100, type: 'square', decay: 0.1, gain: 0.5 });
  addTone(out, { dur: 0.18, freq: 195, endFreq: 150, type: 'saw', decay: 0.1, gain: 0.3 });
  return declick(normalize(out, 0.6));
});
def('test_tone', { gain: 0.8, cooldown: 0.1, maxVoices: 1, priority: 4 }, () => {
  const out = createBuffer(0.7);
  [C5, E5, G5, C6].forEach((n, i) => {
    addPartials(out, { start: i * 0.1, f0: NOTE(n), ratios: [1, 2.01, 3], gains: [1, 0.3, 0.1], dur: 0.45, decay: 0.15, gain: 0.45 });
  });
  addTone(out, { dur: 0.15, freq: 120, endFreq: 70, decay: 0.05, gain: 0.5 });
  return declick(normalize(out, 0.8));
});

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

function hashName(name) {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Render one variant of a sound to a Float32Array. Deterministic. */
export function renderSound(name, variant = 0) {
  const d = SOUNDS[name];
  if (!d) throw new Error(`Unknown sound: ${name}`);
  const rng = makeRng(hashName(name) + variant * 7919);
  return d.render(rng, variant + 1);
}

export function listSoundJobs() {
  const jobs = [];
  for (const d of Object.values(SOUNDS)) for (let v = 0; v < d.variants; v++) jobs.push({ name: d.name, variant: v });
  return jobs;
}

export { SR };
