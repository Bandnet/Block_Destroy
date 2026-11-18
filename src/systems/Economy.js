import { createProfile } from './Profile.js';

/**
 * Resource wallet. Operates on a Profile and announces changes on the event bus:
 *   'resourcesChanged'  (no payload)
 *   'resourcesGained'   (amount)
 *   'resourcesSpent'    (amount)
 */
export class Economy {
  constructor(events, profile = createProfile()) {
    this.events = events;
    this.profile = profile;
  }

  setProfile(profile) {
    this.profile = profile;
    this.events.emit('resourcesChanged');
  }

  get resources() {
    return this.profile.resources;
  }

  add(amount) {
    if (!(amount > 0)) return;
    this.profile.resources += amount;
    this.profile.totalResources += amount;
    this.events.emit('resourcesGained', amount);
    this.events.emit('resourcesChanged');
  }

  canAfford(cost) {
    return this.profile.resources >= cost;
  }

  spend(cost) {
    if (!(cost >= 0) || this.profile.resources < cost) return false;
    this.profile.resources -= cost;
    this.events.emit('resourcesSpent', cost);
    this.events.emit('resourcesChanged');
    return true;
  }
}
