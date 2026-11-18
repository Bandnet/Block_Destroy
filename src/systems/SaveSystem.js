import { createProfile, normalizeProfile } from './Profile.js';
import { DEFAULT_AUDIO_SETTINGS } from '../audio/AudioEngine.js';

export const SAVE_KEY = 'blockgrinder.save.v1';
export const SAVE_VERSION = 1;

export function defaultSettings() {
  return {
    audio: { ...DEFAULT_AUDIO_SETTINGS },
    renderDistance: 6,
    fov: 75,
    sensitivity: 1,
  };
}

export function defaultSave() {
  return {
    version: SAVE_VERSION,
    profile: createProfile(),
    levels: { unlocked: 1, completed: {}, best: {} }, // best: level id -> ms
    achievements: {}, // id -> unix ms when earned
    speedrun: { best: null, bestSplits: null, attempts: 0, completions: 0 },
    stats: { playtimeMs: 0, gameCompleted: false, completedAt: null },
    settings: defaultSettings(),
  };
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Merge an arbitrary parsed object onto the defaults, dropping anything malformed. */
export function normalizeSave(raw) {
  const d = defaultSave();
  if (!isObj(raw)) return d;
  const s = d;

  s.profile = normalizeProfile(raw.profile);

  if (isObj(raw.levels)) {
    const unlocked = Number(raw.levels.unlocked);
    s.levels.unlocked = Number.isFinite(unlocked) ? Math.max(1, Math.min(10, Math.floor(unlocked))) : 1;
    if (isObj(raw.levels.completed)) s.levels.completed = { ...raw.levels.completed };
    if (isObj(raw.levels.best)) {
      for (const [k, v] of Object.entries(raw.levels.best)) if (Number.isFinite(v) && v > 0) s.levels.best[k] = v;
    }
  }
  if (isObj(raw.achievements)) s.achievements = { ...raw.achievements };
  if (isObj(raw.speedrun)) {
    const r = raw.speedrun;
    s.speedrun.best = Number.isFinite(r.best) && r.best > 0 ? r.best : null;
    s.speedrun.bestSplits = Array.isArray(r.bestSplits) ? r.bestSplits.filter(Number.isFinite) : null;
    s.speedrun.attempts = Number.isFinite(r.attempts) ? r.attempts : 0;
    s.speedrun.completions = Number.isFinite(r.completions) ? r.completions : 0;
  }
  if (isObj(raw.stats)) {
    if (Number.isFinite(raw.stats.playtimeMs)) s.stats.playtimeMs = raw.stats.playtimeMs;
    s.stats.gameCompleted = !!raw.stats.gameCompleted;
    if (Number.isFinite(raw.stats.completedAt)) s.stats.completedAt = raw.stats.completedAt;
  }
  if (isObj(raw.settings)) {
    const st = raw.settings;
    if (isObj(st.audio)) s.settings.audio = { ...s.settings.audio, ...st.audio };
    if (Number.isFinite(st.renderDistance)) s.settings.renderDistance = Math.max(3, Math.min(10, st.renderDistance));
    if (Number.isFinite(st.fov)) s.settings.fov = Math.max(50, Math.min(110, st.fov));
    if (Number.isFinite(st.sensitivity)) s.settings.sensitivity = Math.max(0.2, Math.min(3, st.sensitivity));
  }
  return s;
}

function browserStorage() {
  try {
    const s = window.localStorage;
    const probe = '__bg_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/** localStorage persistence with an in-memory fallback (e.g. private browsing). */
export class SaveSystem {
  constructor(storage = browserStorage()) {
    this.storage = storage;
    this.memory = null;
    this.persistent = storage !== null;
  }

  load() {
    let text = null;
    try {
      text = this.storage ? this.storage.getItem(SAVE_KEY) : this.memory;
    } catch {
      text = null;
    }
    if (!text) return defaultSave();
    try {
      return normalizeSave(JSON.parse(text));
    } catch {
      return defaultSave();
    }
  }

  save(data) {
    const text = JSON.stringify(data);
    try {
      if (this.storage) this.storage.setItem(SAVE_KEY, text);
      else this.memory = text;
      return true;
    } catch {
      this.memory = text;
      return false;
    }
  }

  reset() {
    try {
      if (this.storage) this.storage.removeItem(SAVE_KEY);
    } catch { /* ignore */ }
    this.memory = null;
  }

  exportText(data) {
    return JSON.stringify(data, null, 2);
  }

  /** Returns a normalized save, or null if the text is not a valid save. */
  parseImport(text) {
    try {
      const raw = JSON.parse(text);
      if (!isObj(raw) || !isObj(raw.profile)) return null;
      return normalizeSave(raw);
    } catch {
      return null;
    }
  }
}
