import { UPGRADES, BRANCHES, getUpgrade, upgradeCost, branchNodes } from '../data/upgrades.js';

/**
 * Buying upgrade levels. Emits 'upgradeBought' ({ up, level }), 'branchCompleted'
 * (branch) and 'statsDirty'.
 */
export class UpgradeSystem {
  constructor({ events, economy, getHighestLevel = () => 10 }) {
    this.events = events;
    this.economy = economy;
    this.getHighestLevel = getHighestLevel;
  }

  get profile() {
    return this.economy.profile;
  }

  level(id) {
    return this.profile.upgrades[id] || 0;
  }

  /** Unmet requirements as readable strings (empty = unlocked). */
  lockReasons(up) {
    const out = [];
    for (const r of up.requires) {
      if (this.level(r.id) < r.level) out.push(`${getUpgrade(r.id).name} level ${r.level}`);
    }
    if (up.minLevel > this.getHighestLevel()) out.push(`Reach level ${up.minLevel}`);
    return out;
  }

  status(id) {
    const up = getUpgrade(id);
    const level = this.level(id);
    const maxed = level >= up.max;
    const reasons = this.lockReasons(up);
    const cost = maxed ? 0 : upgradeCost(up, level);
    return {
      up, level, maxed, cost,
      locked: reasons.length > 0,
      reasons,
      affordable: !maxed && this.economy.canAfford(cost),
      canBuy: !maxed && reasons.length === 0 && this.economy.canAfford(cost),
    };
  }

  buy(id) {
    const st = this.status(id);
    if (!st.canBuy) return false;
    if (!this.economy.spend(st.cost)) return false;
    const p = this.profile;
    p.upgrades[id] = st.level + 1;
    p.upgradesBought++;
    this.events.emit('upgradeBought', { up: st.up, level: st.level + 1 });
    this._checkBranch(st.up.branch);
    this.events.emit('statsDirty');
    return true;
  }

  /** Buy as many levels as affordable; returns how many. */
  buyMax(id) {
    let n = 0;
    while (n < 500 && this.buy(id)) n++;
    return n;
  }

  _checkBranch(branchId) {
    const p = this.profile;
    if (p.completedBranches.includes(branchId)) return;
    if (branchNodes(branchId).every((u) => this.level(u.id) >= u.max)) {
      p.completedBranches.push(branchId);
      this.events.emit('branchCompleted', BRANCHES.find((b) => b.id === branchId));
    }
  }

  branchProgress(branchId) {
    const nodes = branchNodes(branchId);
    let done = 0, total = 0;
    for (const u of nodes) { done += Math.min(u.max, this.level(u.id)); total += u.max; }
    return { done, total };
  }
}
