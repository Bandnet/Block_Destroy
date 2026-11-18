import * as THREE from 'three';
import { EventBus } from './EventBus.js';
import { RunClock } from './Clock.js';
import { World } from '../world/World.js';
import { WorldGenerator } from '../world/WorldGenerator.js';
import { WorldRenderer } from '../world/WorldRenderer.js';
import { createAtlasTexture } from '../world/TextureAtlas.js';
import { raycastVoxels } from '../world/Raycaster.js';
import { PlayerBody } from '../player/PlayerBody.js';
import { PlayerController } from '../player/PlayerController.js';
import { ToolViewmodel } from '../player/ToolViewmodel.js';
import { MiningSystem } from '../mining/MiningSystem.js';
import { BlockHighlight } from '../mining/BlockHighlight.js';
import { ParticlePool } from '../mining/ParticlePool.js';
import { LootSystem } from '../mining/LootSystem.js';
import { BreakEffects } from '../mining/BreakEffects.js';
import { getMaterial } from '../data/materials.js';
import { Economy } from '../systems/Economy.js';
import { ToolSystem } from '../systems/ToolSystem.js';
import { UpgradeSystem } from '../systems/UpgradeSystem.js';
import { computeStats } from '../systems/Stats.js';
import { getTool } from '../data/tools.js';
import { LevelSystem } from '../systems/LevelSystem.js';
import { AmbientFX } from '../world/AmbientFX.js';
import { getLevel } from '../data/levels.js';
import { AchievementSystem } from '../systems/AchievementSystem.js';
import { createProfile } from '../systems/Profile.js';
import { rewardText } from '../data/achievements.js';
import { buildSpeedrunResult } from '../ui/screens/SpeedrunResult.js';
import { buildCompletionScreen } from '../ui/screens/CompletionScreen.js';
import { MusicEngine, MENU_TRACK, ENDING_TRACK } from '../audio/Music.js';
import { EndingSequence } from './Ending.js';
import { buildLevelComplete } from '../ui/screens/LevelComplete.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import { AudioEngine } from '../audio/AudioEngine.js';
import { AudioDirector } from '../audio/AudioDirector.js';
import { HUD } from '../ui/HUD.js';
import { UI } from '../ui/UI.js';

const SKY_COLOR = 0x8fc7ff;
const REACH = 7;
const AUTOSAVE_SECONDS = 10;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.events = new EventBus();

    // ---- persistence ----
    this.saves = new SaveSystem();
    this.save = this.saves.load();
    this.settings = this.save.settings;
    this.profile = this.save.profile;
    this.mainProfile = this.profile; // the real progression; `profile` is swapped during a speedrun
    this.economy = new Economy(this.events, this.profile);
    this.profile.highestLevel = Math.max(this.profile.highestLevel, this.save.levels.unlocked);
    const getHighestLevel = () => this.profile.highestLevel;
    this.achievements = new AchievementSystem({ events: this.events, getSave: () => this.save, getProfile: () => this.mainProfile });
    this.levels = new LevelSystem({ events: this.events, getSave: () => this.save, getProfile: () => this.profile });
    this.toolSystem = new ToolSystem({ events: this.events, economy: this.economy, getHighestLevel });
    this.upgradeSystem = new UpgradeSystem({ events: this.events, economy: this.economy, getHighestLevel });

    // ---- three.js ----
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SKY_COLOR);
    this.scene.fog = new THREE.Fog(SKY_COLOR, 40, 90);
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 1, 0.05, 400);
    this.scene.add(this.camera);

    // ---- world ----
    const R = this.settings.renderDistance;
    this.world = new World({ generator: new WorldGenerator(getLevel(1).terrain), renderDistance: R });
    this.worldRenderer = new WorldRenderer(this.scene, this.world, createAtlasTexture());
    this._applyFog();

    // ---- player ----
    this.body = new PlayerBody(this.world);
    this.controller = new PlayerController({
      camera: this.camera, canvas, body: this.body, sensitivity: 0.0022 * this.settings.sensitivity,
    });
    this.viewmodel = new ToolViewmodel(this.camera);

    // ---- mining + effects ----
    this.mining = new MiningSystem(this.world, this.events);
    this.highlight = new BlockHighlight(this.scene);
    this.ambient = new AmbientFX(this.scene);
    this.particles = new ParticlePool(this.scene);

    // ---- audio ----
    this.audio = new AudioEngine(this.settings.audio);
    this.music = new MusicEngine(this.audio);
    this.music.setTrack(MENU_TRACK);
    this.ending = new EndingSequence(this.scene);
    this.director = new AudioDirector({ events: this.events, audio: this.audio, getTool: () => this.currentTool });

    this.loot = new LootSystem({
      events: this.events,
      economy: this.economy,
      particles: this.particles,
      audio: this.audio,
      getPlayerPos: () => this.camera.position,
      getStats: () => this.stats,
    });
    this.effects = new BreakEffects({ events: this.events, particles: this.particles, highlight: this.highlight });

    // ---- UI ----
    this.hud = new HUD(document.getElementById('hud'), document.getElementById('toasts'));
    this.ui = new UI({ root: document.getElementById('screens'), game: this });

    // ---- run state ----
    this.state = 'menu'; // menu | playing | shop | paused
    this.inLevel = false;
    this.speedrun = false;
    this.speedrunMs = 0;
    this.speedrunClock = new RunClock();
    this.run = null; // { level, splits[] } while a speedrun is active
    this._achCheck = 1;
    this.levelClock = new RunClock();
    this.levelIndex = 1;
    this.level = getLevel(1);
    this.levelName = this.level.name;
    this.levelTarget = this.level.target;
    this.levelBlocks = 0;
    this.levelEarned = 0;
    this.levelDone = false;
    this.coreSpawned = false;
    this._objective = false;
    this._regrow = 1;
    this.currentTool = getTool(this.profile.equippedTool);
    this.stats = computeStats(this.profile, this.bonuses());
    this.mining.setStats(this.stats);
    this.viewmodel.setTool(this.currentTool);
    this.viewmodel.toolId = this.currentTool.id;

    this._pendingTab = null;
    this._shake = 0;
    this._finale = false;
    this._dir = new THREE.Vector3();
    this._last = performance.now();
    this._autosave = AUTOSAVE_SECONDS;
    this._fps = 0;
    this._fpsFrames = 0;
    this._fpsTime = 0;

    this.events.on('blocksBroken', (b) => {
      this.profile.blocksDestroyed += b.count;
      this.levelBlocks += b.count;
      if (this.inLevel && !this.levelDone) {
        if (this.coreSpawned && b.counts[11] > 0) this._finale = true;
        else if (!this.coreSpawned && this.levelBlocks >= this.levelTarget) this._objective = true;
      }
    });
    this.events.on('strike', (s) => { if (s.crit) { this.profile.crits++; this.hud.critFlash(); } });
    this.events.on('resourcesGained', (n) => { this.hud.gain(n); this.levelEarned += n; });
    this.events.on('resourcesChanged', () => this.ui.refresh());
    this.events.on('statsDirty', () => this.refreshStats());
    this.events.on('toolEquipped', () => this.refreshStats());
    this.events.on('upgradeBought', () => { this.audio.play('upgrade_buy', { pitchJitter: 0.04 }); this._dirty = true; });
    this.events.on('toolBought', () => { this.audio.play('tool_unlock'); this.persist(); });
    this.events.on('branchCompleted', (b) => {
      this.audio.play('branch_complete');
      this.hud.toast('Branch complete!', `${b.name} fully upgraded`, 'good');
      this.persist();
    });
    this.events.on('achievementUnlocked', (a) => {
      this.audio.play('achievement');
      this.hud.toast(a.name, rewardText(a.reward), 'achievement');
      this._dirty = true;
    });
    this.events.on('shake', (a) => { this._shake = Math.max(this._shake, a); });

    this._wire();
    this._onResize();
    window.addEventListener('resize', () => this._onResize());

    this.applyEnv(this.level.env);
    this.spawnPlayer();
    this.controller.syncCamera();
  }

  // ---------------------------------------------------------------- setup

  /** Permanent percentage bonuses (achievements, Phase 5). Speedruns return none. */
  bonuses() {
    return this.speedrun ? null : this.achievements.bonuses();
  }

  /** Recompute stats and the equipped tool from the profile. */
  refreshStats() {
    this.currentTool = getTool(this.profile.equippedTool);
    this.stats = computeStats(this.profile, this.bonuses());
    this.mining.setStats(this.stats);
    if (this.viewmodel.toolId !== this.currentTool.id) {
      this.viewmodel.setTool(this.currentTool);
      this.viewmodel.toolId = this.currentTool.id;
    }
    this.ui.refresh();
  }

  registerTabs(tabs) {
    for (const t of tabs) this.ui.registerTab(t);
  }

  _wire() {
    const unlock = () => this.unlockAudio();
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);

    this.controller.onLockChange = (locked) => this._onLockChange(locked);
    this.controller.onLockError = () => {
      this.ui.openMenu(this.ui.activeTab || 'play', { live: false });
    };
    this.controller.onKey = (code) => this._onKey(code);

    document.addEventListener('visibilitychange', () => {
      this.levelClock.suspend();
      this.speedrunClock.suspend();
      if (document.hidden) this.persist();
    });
    window.addEventListener('blur', () => { this.levelClock.suspend(); this.speedrunClock.suspend(); });
    window.addEventListener('beforeunload', () => this.persist());
    window.addEventListener('pagehide', () => this.persist());
  }

  _onKey(code) {
    if (code === 'F3') this.hud.toggleDebug();
    if (code === 'KeyU') this._toggleShop('upgrades');
    else if (code === 'KeyT') this._toggleShop('tools');
    else if (code === 'Escape' && (this.state === 'shop' || this.state === 'paused')) this.resume();
  }

  _toggleShop(tab) {
    if (this.state === 'playing') {
      this._pendingTab = tab;
      document.exitPointerLock();
    } else if (this.state === 'shop') {
      if (this.ui.activeTab === tab) this.resume();
      else this.ui.selectTab(tab);
    }
  }

  _onLockChange(locked) {
    if (locked) {
      this.state = 'playing';
      this.ui.hideAll();
      this.hud.show();
      return;
    }
    if (!this.inLevel) return;
    if (this.state !== 'playing') return;
    if (this._pendingTab) {
      const tab = this._pendingTab;
      this._pendingTab = null;
      this.state = 'shop'; // clock keeps running while shopping
      this.ui.openMenu(tab, { live: true });
    } else {
      this.state = 'paused'; // Esc: everything frozen
      this.director.silenceLoops();
      this.ui.openMenu('play', { live: false });
    }
  }

  // ---------------------------------------------------------------- flow

  unlockAudio() {
    this.audio.unlock();
  }

  sfxClick() {
    this.audio.play('ui_click', { pitchJitter: 0.03 });
  }

  spawnPlayer() {
    const gen = this.world.generator;
    const sp = gen.spawnPoint();
    this.world.preload(sp.x, sp.z, 3);
    const top = gen.columnRange(sp.x, sp.z).top;
    this.body.setPosition(sp.x + 0.5, top + 1, sp.z + 0.5);
    this.controller.yaw = 0;
    this.controller.pitch = -0.1;
    this.controller.syncCamera();
  }

  /** Why a level cannot be started right now (speedrun-aware), or null. */
  lockReason(id) {
    if (this.speedrun && this.run) {
      if (id !== this.run.level) return `Speedrun in progress (level ${this.run.level})`;
      const lvl = getLevel(id);
      if (lvl.requiresTool && !this.profile.ownedTools.includes(lvl.requiresTool)) return `Requires the ${getTool(lvl.requiresTool).name}`;
      return null;
    }
    return this.levels.lockReason(id);
  }

  // ---------------------------------------------------------------- speedrun

  /** Begin a 10-level speedrun with a brand-new profile (the main save is untouched). */
  startSpeedrun() {
    if (this.speedrun) return false;
    this.persist();
    this.save.speedrun.attempts++;
    this.run = { level: 1, splits: [] };
    this.speedrun = true;
    this.profile = createProfile();
    this.economy.setProfile(this.profile);
    this.hud.displayedResources = 0;
    this.speedrunClock.reset();
    this.speedrunMs = 0;
    this.refreshStats();
    return this.startLevel(1);
  }

  /** Leave speedrun mode and restore the main profile. */
  endSpeedrun() {
    if (!this.speedrun) return;
    this.speedrun = false;
    this.run = null;
    this.profile = this.mainProfile;
    this.economy.setProfile(this.profile);
    this.hud.displayedResources = this.profile.resources;
    this.refreshStats();
  }

  abortSpeedrun() {
    this.endSpeedrun();
    this.goMenu('speedrun');
  }

  /** Apply a level's sky, fog, light tint and ambient particles. */
  applyEnv(env) {
    this.scene.background.set(env.sky);
    this.scene.fog.color.set(env.fog);
    this.worldRenderer.material.color.set(env.tint);
    this.ambient.setLevel(env.ambient);
  }

  startLevel(index = 1) {
    const level = getLevel(index);
    if (!level) return false;
    if (this.lockReason(index)) {
      this.audio.play('ui_error');
      return false;
    }
    this.level = level;
    this.levelIndex = index;
    this.levelName = level.name;
    this.levelTarget = level.target;
    this.levelBlocks = 0;
    this.levelEarned = 0;
    this.levelDone = false;
    this.coreSpawned = false;
    this._objective = false;
    this._finale = false;
    this.ending.dispose();
    this.music.setTrack(level.music);
    this.levelClock.reset();
    if (this.speedrun) this.profile.highestLevel = Math.max(this.profile.highestLevel, index);
    this.loot.flush();
    this.director.silenceLoops();

    this.world.setGenerator(new WorldGenerator(level.terrain));
    this.applyEnv(level.env);
    this.spawnPlayer();

    this.inLevel = true;
    this.state = 'paused';
    this.ui.hideAll();
    this.hud.show();
    this.hud.banner(`Level ${index}: ${level.name}`, level.tagline, 4);
    this.controller.requestLock();
    return true;
  }

  /** Back to the main menu (used by the level-complete screen). */
  goMenu(tab = 'play') {
    this.inLevel = false;
    this.state = this.speedrun ? 'between' : 'menu'; // the speedrun clock keeps running between levels
    this.loot.flush();
    this.director.silenceLoops();
    this.music.setTrack(MENU_TRACK);
    this.hud.hide();
    this.persist();
    this.ui.openMenu(tab, { live: this.speedrun });
  }

  respawn(message) {
    this.spawnPlayer();
    if (message) this.hud.toast(message, '', 'info');
  }

  _spawnCore() {
    this.coreSpawned = true;
    const p = this.body.pos;
    const dx = -Math.sin(this.controller.yaw), dz = -Math.cos(this.controller.yaw);
    const x = Math.floor(p.x + dx * 6), z = Math.floor(p.z + dz * 6);
    this.world.preload(x, z, 1);
    const y = this.world.getSurfaceY(x, z) + 1;
    this.world.setBlock(x, y, z, 11);
    this.corePos = { x: x + 0.5, y: y + 0.5, z: z + 0.5 };
    this.hud.banner('THE CORE HAS APPEARED', 'Destroy it to finish the game', 6);
    this.audio.play('level_unlock');
  }

  _completeLevel() {
    this.levelDone = true;
    const ms = this.levelClock.elapsed;
    this.state = 'complete';
    document.exitPointerLock();
    this.loot.flush();
    this.director.silenceLoops();
    this.audio.play('level_complete');

    let info;
    if (this.speedrun) {
      // Speedruns record splits, never personal-best level times.
      info = { level: this.level, ms, previousBest: null, newBest: false, firstTime: false, unlockedNext: false };
      this.run.splits[this.levelIndex - 1] = this.speedrunClock.elapsed;
      this.run.level = Math.min(10, this.levelIndex + 1);
      if (this.levelIndex < 10) info.unlockedNext = true;
    } else {
      info = this.levels.complete(this.levelIndex, ms);
    }
    this.achievements.check();
    this.persist();
    if (this.level.finale) return this._finish(info);
    this.hud.hide();
    const run = { blocks: this.levelBlocks, earned: this.levelEarned };
    this.ui.showOverlay(buildLevelComplete(this, info, run));
    if (info.unlockedNext) setTimeout(() => this.audio.play('level_unlock'), 900);
  }

  /** The last level is done: play the ending, then show the results. */
  _finish(info) {
    this.hud.hide();
    this.state = 'ending';
    this._endInfo = info;
    this.music.setTrack(ENDING_TRACK);
    this.audio.play('final_sequence');
    const c = this.corePos || { x: this.body.pos.x, y: this.body.pos.y + 3, z: this.body.pos.z - 6 };
    this.ending.onBoom = () => {
      this._shake = 0.06;
      const f = document.createElement('div');
      f.className = 'ending-flash';
      document.body.appendChild(f);
      setTimeout(() => f.remove(), 2200);
    };
    this.ending.onDone = () => this._showResults();
    this.ending.start(c.x, c.y, c.z);
  }

  _showResults() {
    const info = this._endInfo;
    const save = this.save;
    this.state = 'complete';
    if (this.speedrun) {
      const total = this.run.splits[9];
      const sr = save.speedrun;
      sr.completions++;
      const newBest = sr.best === null || total < sr.best;
      const previousBest = sr.best;
      const previousSplits = sr.bestSplits;
      if (newBest) { sr.best = Math.round(total); sr.bestSplits = this.run.splits.map(Math.round); }
      const result = { total, newBest, previousBest, previousSplits, splits: this.run.splits.slice() };
      this.endSpeedrun();
      this.achievements.check();
      this.persist();
      this.ui.showOverlay(buildSpeedrunResult(this, result));
    } else {
      if (!save.stats.gameCompleted) { save.stats.gameCompleted = true; save.stats.completedAt = Date.now(); }
      this.achievements.check();
      this.persist();
      const run = { blocks: this.levelBlocks, earned: this.levelEarned };
      this.ui.showOverlay(buildCompletionScreen(this, info, run));
    }
    this.audio.play('achievement');
  }

  resume() {
    if (!this.inLevel) return this.startLevel(this.levelIndex);
    this.ui.hideAll();
    this.controller.requestLock();
  }

  leaveLevel() {
    if (this.speedrun) {
      if (typeof window.confirm === 'function' && !window.confirm('Abort the speedrun? Your run will be lost.')) return;
      return this.abortSpeedrun();
    }
    this.inLevel = false;
    this.state = 'menu';
    this.loot.flush();
    this.director.silenceLoops();
    this.music.setTrack(MENU_TRACK);
    this.hud.hide();
    this.persist();
    this.ui.openMenu('play');
  }

  // ---------------------------------------------------------------- settings

  setAudio(partial) {
    Object.assign(this.settings.audio, partial);
    this.audio.setSettings(partial);
    this._dirty = true;
  }

  setGraphics({ renderDistance, fov, sensitivity }) {
    if (renderDistance !== undefined) {
      this.settings.renderDistance = renderDistance;
      this.world.renderDistance = renderDistance;
      this.world._centerCX = NaN; // force the streaming window to rebuild
      this._applyFog();
    }
    if (fov !== undefined) {
      this.settings.fov = fov;
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    if (sensitivity !== undefined) {
      this.settings.sensitivity = sensitivity;
      this.controller.sensitivity = 0.0022 * sensitivity;
    }
    this._dirty = true;
  }

  _applyFog() {
    const R = this.world.renderDistance;
    this.scene.fog.near = R * 16 * 0.45;
    this.scene.fog.far = (R - 0.7) * 16;
  }

  persist() {
    this.save.profile = this.mainProfile;
    this.save.settings = this.settings;
    this.saves.save(this.save);
    this._dirty = false;
  }

  exportSave() {
    this.persist();
    const blob = new Blob([this.saves.exportText(this.save)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'block-grinder-save.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  importSave(text) {
    const parsed = this.saves.parseImport(text);
    if (!parsed) return false;
    this.saves.save(parsed);
    this.applyLoadedSave(parsed);
    return true;
  }

  resetProgress() {
    this.saves.reset();
    this.applyLoadedSave(this.saves.load());
  }

  /** Swap in a different save object (import / reset). */
  applyLoadedSave(save) {
    if (this.speedrun) { this.speedrun = false; this.run = null; }
    this.save = save;
    this.settings = save.settings;
    this.profile = save.profile;
    this.mainProfile = this.profile;
    this.economy.setProfile(this.profile);
    this.profile.highestLevel = Math.max(this.profile.highestLevel, this.save.levels.unlocked);
    this.refreshStats();
    this.audio.setSettings(this.settings.audio);
    this.setGraphics(this.settings);
    this.hud.displayedResources = this.profile.resources;
    this.ui.refresh();
  }

  // ---------------------------------------------------------------- loop

  start() {
    requestAnimationFrame(this._frame);
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _frame = (now) => {
    requestAnimationFrame(this._frame);
    const dt = Math.min(0.1, (now - this._last) / 1000);
    this._last = now;

    this._update(dt, now);
    this.renderer.render(this.scene, this.camera);

    this._fpsFrames++;
    this._fpsTime += dt;
    if (this._fpsTime >= 0.5) {
      this._fps = this._fpsFrames / this._fpsTime;
      this._fpsFrames = 0;
      this._fpsTime = 0;
    }
  };

  _update(dt, now) {
    const state = this.state;
    const simulate = state === 'playing' || state === 'shop';
    const playing = state === 'playing';

    this.levelClock.tick(now, this.inLevel && simulate);
    this.speedrunClock.tick(now, this.speedrun && (simulate || state === 'complete' || state === 'between'));
    if (this.speedrun) this.speedrunMs = this.speedrunClock.elapsed;
    if (this.inLevel && simulate) this.save.stats.playtimeMs += dt * 1000;
    this._achCheck -= dt;
    if (this._achCheck <= 0) { this._achCheck = 1; this.achievements.check(); }

    if (playing) this.controller.update(dt);
    else this.controller.syncCamera();
    if (state === 'ending') this.ending.update(dt, this.camera);

    let hit = null;
    if (playing) {
      this.camera.getWorldDirection(this._dir);
      const c = this.camera.position;
      hit = raycastVoxels(this.world, c.x, c.y, c.z, this._dir.x, this._dir.y, this._dir.z, REACH);
    }

    if (simulate) {
      this.mining.update(dt, hit, playing && this.controller.mouseDown, this.camera.position);
    } else {
      this.mining.target = null;
    }

    const pos = this.body.pos;
    this.world.update(pos.x, pos.z, 2);
    this.worldRenderer.update(pos.x, pos.y, pos.z, 4);

    this.viewmodel.group.visible = !(state === 'ending' || (state === 'complete' && this.level.finale));
    this.viewmodel.update(dt, this.mining.active, this.stats.hitsPerSecond);
    this.highlight.update(this.mining.target || hit, this.mining.progress, dt);
    this.director.update(this.mining.active);

    if (simulate || this.particles.count) {
      const cam = this.camera.position;
      this.particles.update(simulate || state === 'ending' ? dt : 0, cam.x, cam.y - 0.5, cam.z, this.stats.magnetSpeed);
    }
    this.effects.update();
    this.ambient.update(simulate || state === 'ending' ? dt : 0, pos.x, pos.y, pos.z);

    if (playing || state === 'shop') {
      if (this._objective) {
        this._objective = false;
        if (this.level.finale) this._spawnCore();
        else this._completeLevel();
      } else if (this._finale && !this.levelDone) {
        this._finale = false;
        this._completeLevel(); // Phase 6 replaces this with the full ending sequence
      }
      if (this.level.voidFloor && pos.y < 4) this.respawn('You fell into the void');
      this._regrow -= dt;
      if (this._regrow <= 0) {
        this._regrow = 1;
        this.world.regrow(pos.x, pos.z, performance.now());
      }
    }

    // Camera shake (applied after the raycast so aiming is unaffected)
    if (this._shake > 0.0005) {
      this.camera.rotation.x += (Math.random() - 0.5) * this._shake;
      this.camera.rotation.z += (Math.random() - 0.5) * this._shake;
      this._shake *= Math.exp(-9 * dt);
    }

    const target = this.mining.target;
    const mat = target ? getMaterial(target.id) : hit ? getMaterial(hit.id) : null;
    this.hud.update(dt, {
      resources: this.economy.resources,
      levelIndex: this.levelIndex,
      levelName: this.levelName,
      blocksDone: this.levelBlocks,
      blocksTarget: this.levelTarget,
      toolName: this.currentTool.name,
      damage: this.stats.damage,
      hps: this.stats.hitsPerSecond,
      timerMs: this.levelClock.elapsed,
      bestMs: this.levels.best(this.levelIndex),
      runMs: this.speedrun ? this.speedrunMs : null,
      target: mat
        ? { name: mat.name, maxHealth: mat.maxHealth, damage: target ? this.mining.targetDamage : 0, progress: target ? this.mining.progress : 0 }
        : null,
      debug: this.hud.debugVisible ? this._debugText() : null,
    });

    this._autosave -= dt;
    if (this._autosave <= 0) {
      this._autosave = AUTOSAVE_SECONDS;
      if (this.inLevel) this.persist();
    }
    if (this.ui.open && this.ui.live) this.ui._refreshChrome();
  }

  _debugText() {
    const info = this.renderer.info;
    const p = this.body.pos;
    return [
      `FPS         ${this._fps.toFixed(0)}`,
      `Position    ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`,
      `Chunks      ${this.world.chunks.size} loaded, ${this.worldRenderer.meshCount} meshed`,
      `Mesh queue  ${this.world.dirtyChunks.size}`,
      `Particles   ${this.particles.count}`,
      `Audio       ${this.audio.unlocked ? `${this.audio.bufferCount} buffers, ${this.audio.pool.active} voices` : 'locked'}`,
      `Draw calls  ${info.render.calls}`,
      `Triangles   ${info.render.triangles.toLocaleString('en-US')}`,
    ].join('\n');
  }
}
