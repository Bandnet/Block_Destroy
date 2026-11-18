import { formatNumber, formatInt, formatTime } from '../util/format.js';

const $ = (root, sel) => root.querySelector(sel);

/**
 * In-game heads-up display. DOM built once; updates skip writes when a value is
 * unchanged. Also owns floating "+N" resource popups, toasts and banners.
 */
export class HUD {
  constructor(root, toastRoot) {
    this.root = root;
    this.toastRoot = toastRoot;
    root.innerHTML = `
      <div id="crosshair"></div>

      <div class="hud-panel" id="hud-main">
        <div class="hud-level"><span id="hud-level-index">1</span><span id="hud-level-name">The Beginning</span></div>
        <div class="hud-resources"><span class="gem"></span><span id="hud-resources">0</span></div>
        <div class="hud-row"><span class="label">Level progress</span><span id="hud-blocks">0 / 0</span></div>
        <div class="bar"><div id="hud-progress-fill"></div></div>
        <div class="hud-row"><span class="label">Tool</span><span id="hud-tool"></span></div>
        <div class="hud-row"><span class="label">Damage / hit</span><span id="hud-damage"></span></div>
        <div class="hud-row"><span class="label">Hits / sec</span><span id="hud-hps"></span></div>
      </div>

      <div id="hud-timer-box">
        <div id="hud-timer">0:00.00</div>
        <div id="hud-best"></div>
        <div id="hud-run" class="hidden"></div>
      </div>

      <div id="target-panel" class="hidden">
        <div id="target-name"></div>
        <div id="target-hp-text"></div>
        <div class="bar"><div id="target-bar-fill"></div></div>
      </div>

      <div id="popups"></div>
      <div id="crit-flash" class="hidden">CRITICAL!</div>
      <div id="banner" class="hidden"><div id="banner-title"></div><div id="banner-sub"></div></div>
      <div id="hud-hints">U Upgrades · T Tools · Esc Menu · F3 Debug</div>
      <div id="debug" class="hidden"></div>
    `;

    const q = (s) => $(root, s);
    this.el = {
      levelIndex: q('#hud-level-index'),
      levelName: q('#hud-level-name'),
      resources: q('#hud-resources'),
      blocks: q('#hud-blocks'),
      progressFill: q('#hud-progress-fill'),
      tool: q('#hud-tool'),
      damage: q('#hud-damage'),
      hps: q('#hud-hps'),
      timer: q('#hud-timer'),
      best: q('#hud-best'),
      run: q('#hud-run'),
      targetPanel: q('#target-panel'),
      targetName: q('#target-name'),
      targetHp: q('#target-hp-text'),
      targetFill: q('#target-bar-fill'),
      popups: q('#popups'),
      crit: q('#crit-flash'),
      banner: q('#banner'),
      bannerTitle: q('#banner-title'),
      bannerSub: q('#banner-sub'),
      debug: q('#debug'),
    };

    this._cache = {};
    this._pendingGain = 0;
    this._gainTimer = 0;
    this._popupIndex = 0;
    this._critTimer = 0;
    this._bannerTimer = 0;
    this.debugVisible = false;
    this.displayedResources = 0;
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  _set(key, el, value) {
    if (this._cache[key] === value) return;
    this._cache[key] = value;
    el.textContent = value;
  }

  toggleDebug() {
    this.debugVisible = !this.debugVisible;
    this.el.debug.classList.toggle('hidden', !this.debugVisible);
  }

  /** Accumulate gains; one popup per ~0.25 s however many blocks broke. */
  gain(amount) {
    this._pendingGain += amount;
  }

  critFlash() {
    this.el.crit.classList.remove('hidden');
    this.el.crit.classList.remove('pop');
    void this.el.crit.offsetWidth; // restart the CSS animation
    this.el.crit.classList.add('pop');
    this._critTimer = 0.5;
  }

  banner(title, sub = '', seconds = 3) {
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub;
    this.el.banner.classList.remove('hidden');
    this._bannerTimer = seconds;
  }

  toast(title, text = '', kind = 'info') {
    const el = document.createElement('div');
    el.className = `toast toast-${kind}`;
    el.innerHTML = `<div class="toast-title"></div><div class="toast-text"></div>`;
    el.firstChild.textContent = title;
    el.lastChild.textContent = text;
    this.toastRoot.appendChild(el);
    setTimeout(() => el.classList.add('out'), 4200);
    setTimeout(() => el.remove(), 4800);
    while (this.toastRoot.children.length > 4) this.toastRoot.firstChild.remove();
  }

  update(dt, s) {
    const e = this.el;

    // Smoothly count the resource display toward the real value
    const target = s.resources;
    if (this.displayedResources !== target) {
      const diff = target - this.displayedResources;
      this.displayedResources = Math.abs(diff) < Math.max(1, target * 0.002) ? target : this.displayedResources + diff * Math.min(1, dt * 14);
    }
    this._set('res', e.resources, formatNumber(Math.floor(this.displayedResources)));

    this._set('lvlI', e.levelIndex, String(s.levelIndex));
    this._set('lvlN', e.levelName, s.levelName);
    this._set('blocks', e.blocks, `${formatInt(s.blocksDone)} / ${formatInt(s.blocksTarget)}`);
    const frac = s.blocksTarget > 0 ? Math.min(1, s.blocksDone / s.blocksTarget) : 0;
    e.progressFill.style.width = `${(frac * 100).toFixed(1)}%`;
    this._set('tool', e.tool, s.toolName);
    this._set('dmg', e.damage, formatNumber(s.damage));
    this._set('hps', e.hps, formatNumber(Math.round(s.hps * 10) / 10));

    this._set('timer', e.timer, formatTime(s.timerMs));
    this._set('best', e.best, s.bestMs != null ? `Best ${formatTime(s.bestMs)}` : 'No record yet');
    if (s.runMs != null) {
      e.run.classList.remove('hidden');
      this._set('run', e.run, `Speedrun ${formatTime(s.runMs)}`);
    } else {
      e.run.classList.add('hidden');
    }

    if (s.target) {
      e.targetPanel.classList.remove('hidden');
      this._set('tname', e.targetName, s.target.name);
      const hp = Math.max(0, s.target.maxHealth - s.target.damage);
      this._set('thp', e.targetHp, `${formatNumber(Math.ceil(hp))} / ${formatNumber(s.target.maxHealth)} HP`);
      e.targetFill.style.width = `${(s.target.progress * 100).toFixed(1)}%`;
    } else {
      e.targetPanel.classList.add('hidden');
    }

    // Gain popups
    this._gainTimer -= dt;
    if (this._pendingGain > 0 && this._gainTimer <= 0) {
      this._spawnPopup(this._pendingGain);
      this._pendingGain = 0;
      this._gainTimer = 0.25;
    }

    if (this._critTimer > 0) {
      this._critTimer -= dt;
      if (this._critTimer <= 0) e.crit.classList.add('hidden');
    }
    if (this._bannerTimer > 0) {
      this._bannerTimer -= dt;
      if (this._bannerTimer <= 0) e.banner.classList.add('hidden');
    }

    if (this.debugVisible && s.debug) e.debug.textContent = s.debug;
  }

  _spawnPopup(amount) {
    const el = document.createElement('div');
    el.className = 'popup';
    el.textContent = `+${formatNumber(amount)}`;
    el.style.left = `${46 + (this._popupIndex++ % 3) * 4}%`;
    this.el.popups.appendChild(el);
    setTimeout(() => el.remove(), 1100);
    while (this.el.popups.children.length > 8) this.el.popups.firstChild.remove();
  }
}
