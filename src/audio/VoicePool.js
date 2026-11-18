/**
 * Limits how many sounds play at once so mass destruction never produces
 * hundreds of identical overlapping voices.
 *
 *  - per-sound cooldown: the same sound cannot retrigger faster than `cooldown`
 *  - per-sound voice cap: at most `maxPerSound` instances of one sound
 *  - global voice cap: at most `maxVoices` sounds in total
 *  - when a cap is hit, the oldest voice of lowest priority is stopped,
 *    unless the new sound is less important, in which case it is skipped
 *
 * Pure logic with an injectable clock (seconds), so it is unit-tested in Node.
 */
export class VoicePool {
  constructor({ maxVoices = 28, now = () => performance.now() / 1000 } = {}) {
    this.maxVoices = maxVoices;
    this.now = now;
    this.voices = [];
    this.lastPlay = new Map();
    this.dropped = 0;
    this.stolen = 0;
    this.started = 0;
  }

  get active() {
    return this.voices.length;
  }

  /**
   * @returns a voice record `{ name, start, end, priority, stop }` to attach a stop()
   *          function to, or null if this sound should be skipped.
   */
  acquire(name, { cooldown = 0.03, maxPerSound = 4, duration = 0.3, priority = 1 } = {}) {
    const t = this.now();
    this._expire(t);

    const last = this.lastPlay.get(name);
    if (last !== undefined && t - last < cooldown) {
      this.dropped++;
      return null;
    }

    let same = 0;
    let oldestSame = null;
    for (const v of this.voices) {
      if (v.name !== name) continue;
      same++;
      if (!oldestSame || v.start < oldestSame.start) oldestSame = v;
    }
    if (same >= maxPerSound) {
      if (oldestSame.priority > priority) {
        this.dropped++;
        return null;
      }
      this._steal(oldestSame);
    }

    if (this.voices.length >= this.maxVoices) {
      let victim = null;
      for (const v of this.voices) {
        if (!victim || v.priority < victim.priority || (v.priority === victim.priority && v.start < victim.start)) victim = v;
      }
      if (victim.priority > priority) {
        this.dropped++;
        return null;
      }
      this._steal(victim);
    }

    const voice = { name, start: t, end: t + duration, priority, stop: null };
    this.voices.push(voice);
    this.lastPlay.set(name, t);
    this.started++;
    return voice;
  }

  release(voice) {
    const i = this.voices.indexOf(voice);
    if (i >= 0) this.voices.splice(i, 1);
  }

  _steal(voice) {
    this.stolen++;
    if (voice.stop) voice.stop();
    this.release(voice);
  }

  _expire(t) {
    const v = this.voices;
    for (let i = v.length - 1; i >= 0; i--) if (v[i].end <= t) v.splice(i, 1);
  }
}
