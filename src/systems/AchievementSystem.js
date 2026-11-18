import { ACHIEVEMENTS } from '../data/achievements.js';
import { LEVELS } from '../data/levels.js';
import { TOOLS, toolIndex } from '../data/tools.js';

/**
 * Tracks achievements. Counters come from the MAIN profile and save (never from a
 * speedrun's temporary profile). Emits 'achievementUnlocked' (achievement) and 'statsDirty'.
 */
export class AchievementSystem {
  constructor({ events, getSave, getProfile }) {
    this.events = events;
    this.getSave = getSave;
    this.getProfile = getProfile;
    this._bonus = { damage: 0, reward: 0, hits: 0 };
    this._bonusKey = null;
  }

  get earned() {
    return this.getSave().achievements;
  }

  isEarned(id) {
    return !!this.earned[id];
  }

  /** Current value of every counter an achievement can reference. */
  counters() {
    const p = this.getProfile();
    const save = this.getSave();
    const done = LEVELS.filter((l) => save.levels.completed[l.id]).length;
    const underPar = LEVELS.filter((l) => save.levels.best[l.id] && save.levels.best[l.id] <= l.parTime).length;
    let owned = 0;
    for (const id of p.ownedTools) owned = Math.max(owned, toolIndex(id) + 1);
    const best = save.speedrun.best;
    return {
      blocks: p.blocksDestroyed,
      crits: p.crits,
      resources: p.totalResources,
      upgradesBought: p.upgradesBought,
      branches: p.completedBranches.length,
      toolsOwned: Math.min(owned, TOOLS.length),
      levelsDone: done,
      gameDone: save.stats.gameCompleted ? 1 : 0,
      underPar,
      speedrunDone: save.speedrun.completions > 0 ? 1 : 0,
      speedrunUnder: best ? best / 60000 : Infinity, // minutes, smaller is better
    };
  }

  /** { value, goal, fraction } for an achievement. */
  progress(a, c = this.counters()) {
    if (a.stat === 'speedrunUnder') {
      const ok = c.speedrunUnder < a.goal;
      return { value: ok ? 1 : 0, goal: 1, fraction: ok ? 1 : 0 };
    }
    const value = c[a.stat] || 0;
    return { value, goal: a.goal, fraction: Math.max(0, Math.min(1, value / a.goal)) };
  }

  /** Unlock whatever is newly satisfied. Returns the newly unlocked list. */
  check() {
    const c = this.counters();
    const unlocked = [];
    for (const a of ACHIEVEMENTS) {
      if (this.earned[a.id]) continue;
      if (this.progress(a, c).fraction >= 1) {
        this.earned[a.id] = Date.now();
        unlocked.push(a);
      }
    }
    for (const a of unlocked) this.events.emit('achievementUnlocked', a);
    if (unlocked.length) {
      this._bonusKey = null;
      this.events.emit('statsDirty');
    }
    return unlocked;
  }

  /** Permanent bonuses { damage, reward, hits } from earned achievements. */
  bonuses() {
    const key = Object.keys(this.earned).length;
    if (key !== this._bonusKey) {
      const b = { damage: 0, reward: 0, hits: 0 };
      for (const a of ACHIEVEMENTS) {
        if (!this.earned[a.id]) continue;
        b.damage += a.reward.damage || 0;
        b.reward += a.reward.reward || 0;
        b.hits += a.reward.hits || 0;
      }
      this._bonus = b;
      this._bonusKey = key;
    }
    return this._bonus;
  }

  earnedCount() {
    return ACHIEVEMENTS.filter((a) => this.earned[a.id]).length;
  }
}
