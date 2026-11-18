import { MATERIAL_TABLE } from '../data/materials.js';

/**
 * Maps game events to sounds. All rules about WHEN something plays live here;
 * AudioEngine only knows HOW to play (pooling, variation, buses).
 *
 * A tool definition may carry:  sound: { kind: 'pick' | 'drill' | 'laser', loop?: 'loop_drill', pitch?: 1 }
 */
export class AudioDirector {
  constructor({ events, audio, getTool }) {
    this.audio = audio;
    this.getTool = getTool;
    this._loop = null;

    events.on('strike', (s) => this._onStrike(s));
    events.on('blocksBroken', (b) => this._onBreak(b));
  }

  _toolSound() {
    const t = this.getTool();
    return (t && t.sound) || { kind: 'pick', pitch: 1 };
  }

  _onStrike(s) {
    const mat = MATERIAL_TABLE[s.id];
    if (!mat) return;
    const ts = this._toolSound();
    const vol = s.manual ? 1 : 0.45;
    const pitch = ts.pitch || 1;

    this.audio.play(`hit_${mat.sound}`, { volume: vol, pitch });
    if (s.manual) {
      if (ts.kind === 'pick') this.audio.play('swing', { pitch });
      else if (ts.kind === 'laser') this.audio.play('zap', { pitch });
    }
    if (s.crit) this.audio.play('crit');
  }

  _onBreak(b) {
    const mat = MATERIAL_TABLE[b.maxId];
    if (!mat) return;
    const volume = Math.min(1, 0.6 + 0.07 * Math.log2(b.count + 1));
    this.audio.play(`break_${mat.sound}`, { volume, pitch: b.count > 30 ? 0.85 : 1 });
    if (b.count >= 10) {
      this.audio.play('area_boom', {
        volume: Math.min(1, 0.45 + 0.06 * Math.log2(b.count)),
        pitch: Math.max(0.7, 1.05 - 0.03 * Math.log2(b.count)),
      });
    }
  }

  /** Called every frame: keeps drill / laser loops in step with mining. */
  update(mining) {
    const ts = this._toolSound();
    const wanted = mining && ts.loop ? ts.loop : null;
    if (wanted === this._loop) return;
    if (this._loop) this.audio.stopLoop(this._loop);
    if (wanted) this.audio.startLoop(wanted);
    this._loop = wanted;
  }

  silenceLoops() {
    this.audio.stopAllLoops();
    this._loop = null;
  }
}
