/**
 * Accurate pausable stopwatch driven by real timestamps (never by counting frames).
 *
 * Call tick(now, active) once per frame. Time only accrues between two consecutive
 * active ticks, so pausing, a hidden tab or a long hitch outside play never counts.
 */
export class RunClock {
  constructor() {
    this.elapsed = 0; // ms
    this._last = null;
  }

  reset() {
    this.elapsed = 0;
    this._last = null;
  }

  set(ms) {
    this.elapsed = ms;
    this._last = null;
  }

  tick(now, active) {
    if (active) {
      if (this._last !== null) this.elapsed += now - this._last;
      this._last = now;
    } else {
      this._last = null;
    }
  }

  /** Forget the previous timestamp (tab hidden, window blurred...). */
  suspend() {
    this._last = null;
  }
}
