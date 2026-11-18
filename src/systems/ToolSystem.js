import { TOOLS, getTool, toolIndex } from '../data/tools.js';

/**
 * Buying and equipping tools. Tools are bought in order; each needs the previous
 * one, enough resources and (for later tools) a high enough unlocked level.
 * Emits 'toolBought' (tool) and 'toolEquipped' (tool).
 */
export class ToolSystem {
  constructor({ events, economy, getHighestLevel = () => 10 }) {
    this.events = events;
    this.economy = economy;
    this.getHighestLevel = getHighestLevel;
  }

  get profile() {
    return this.economy.profile;
  }

  owns(id) {
    return this.profile.ownedTools.includes(id);
  }

  isEquipped(id) {
    return this.profile.equippedTool === id;
  }

  /** { owned, equipped, canBuy, reason } */
  status(id) {
    const tool = getTool(id);
    const owned = this.owns(id);
    const equipped = this.isEquipped(id);
    let reason = null;
    if (!owned) {
      const idx = toolIndex(id);
      const prev = TOOLS[idx - 1];
      if (prev && !this.owns(prev.id)) reason = `Requires the ${prev.name}`;
      else if (tool.minLevel > this.getHighestLevel()) reason = `Reach level ${tool.minLevel}`;
      else if (!this.economy.canAfford(tool.cost)) reason = 'Not enough resources';
    }
    return { owned, equipped, canBuy: !owned && reason === null, reason };
  }

  buy(id) {
    const tool = getTool(id);
    if (!this.status(id).canBuy) return false;
    if (!this.economy.spend(tool.cost)) return false;
    this.profile.ownedTools.push(id);
    this.profile.equippedTool = id;
    this.events.emit('toolBought', tool);
    this.events.emit('toolEquipped', tool);
    this.events.emit('statsDirty');
    return true;
  }

  equip(id) {
    if (!this.owns(id) || this.isEquipped(id)) return false;
    this.profile.equippedTool = id;
    this.events.emit('toolEquipped', getTool(id));
    this.events.emit('statsDirty');
    return true;
  }
}
