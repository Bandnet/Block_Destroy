import { LEVELS, LEVEL_COUNT, getLevel, lockReason } from '../data/levels.js';

/**
 * Level progression: unlocks, completion and personal-best times.
 * Operates on save.levels = { unlocked, completed: {id: true}, best: {id: ms} }.
 * Emits 'levelCompleted' ({ level, ms, previousBest, newBest, firstTime, unlockedNext }).
 */
export class LevelSystem {
  constructor({ events, getSave, getProfile }) {
    this.events = events;
    this.getSave = getSave;
    this.getProfile = getProfile;
  }

  get state() {
    return this.getSave().levels;
  }

  /** Reason a level cannot be started, or null. */
  lockReason(id) {
    return lockReason(id, { completed: this.state.completed, ownedTools: this.getProfile().ownedTools });
  }

  isCompleted(id) {
    return !!this.state.completed[id];
  }

  best(id) {
    return this.state.best[id] || null;
  }

  completedCount() {
    return LEVELS.filter((l) => this.isCompleted(l.id)).length;
  }

  /** Record a finished level. `ms` is the run-clock time. */
  complete(id, ms) {
    const st = this.state;
    const level = getLevel(id);
    const previousBest = st.best[id] || null;
    const firstTime = !st.completed[id];
    const newBest = previousBest === null || ms < previousBest;
    st.completed[id] = true;
    if (newBest) st.best[id] = Math.round(ms);
    let unlockedNext = false;
    if (id < LEVEL_COUNT && st.unlocked < id + 1) {
      st.unlocked = id + 1;
      unlockedNext = true;
    }
    this.getProfile().highestLevel = st.unlocked;
    const info = { level, ms, previousBest, newBest, firstTime, unlockedNext };
    this.events.emit('levelCompleted', info);
    this.events.emit('statsDirty');
    return info;
  }
}
