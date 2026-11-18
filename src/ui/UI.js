import { formatNumber, formatTime } from '../util/format.js';

/**
 * Menu shell: left navigation plus a content area. Each tab is registered with
 *   { id, label, order, render(container, ui) -> { update?, destroy? } | void }
 * so features add their own screens without touching this file.
 *
 * The same menu is used as the main menu, the pause menu (Esc) and the in-game
 * shop (U / T). `live` means the game clock keeps running behind it.
 */
export class UI {
  constructor({ root, game }) {
    this.root = root;
    this.game = game;
    this.tabs = new Map();
    this.open = false;
    this.live = false;
    this.activeTab = null;
    this._view = null;
    this._el = null;
    this._overlay = null;
  }

  registerTab(def) {
    this.tabs.set(def.id, { order: 100, ...def });
  }

  get isOpen() {
    return this.open || this._overlay !== null;
  }

  // ---------- menu ----------

  openMenu(tabId = this.activeTab || 'play', { live = false } = {}) {
    this.closeOverlay();
    this.live = live;
    if (!this.open) {
      this.open = true;
      this._build();
    }
    this.selectTab(tabId);
    this.root.classList.remove('hidden');
    this._refreshChrome();
  }

  closeMenu() {
    if (!this.open) return;
    this._destroyView();
    this.open = false;
    this.live = false;
    this.root.innerHTML = '';
    this._el = null;
  }

  selectTab(id) {
    if (!this.tabs.has(id)) id = 'play';
    this.activeTab = id;
    this._destroyView();
    const content = this._el.querySelector('.menu-content');
    content.innerHTML = '';
    const def = this.tabs.get(id);
    this._view = def.render(content, this) || null;
    for (const b of this._el.querySelectorAll('.nav-btn[data-tab]')) {
      b.classList.toggle('active', b.dataset.tab === id);
    }
  }

  /** Called when game state changes (resources, purchases...) so open views can redraw. */
  refresh() {
    if (!this.open) return;
    if (this._view && this._view.update) this._view.update();
    this._refreshChrome();
  }

  _destroyView() {
    if (this._view && this._view.destroy) this._view.destroy();
    this._view = null;
  }

  _build() {
    const g = this.game;
    const el = document.createElement('div');
    el.className = 'menu';
    const tabs = [...this.tabs.values()].sort((a, b) => a.order - b.order);
    el.innerHTML = `
      <div class="menu-nav">
        <div class="brand">BLOCK<span>GRINDER</span></div>
        <button class="nav-btn resume hidden" data-act="resume">▶ Resume</button>
        ${tabs.map((t) => `<button class="nav-btn" data-tab="${t.id}">${t.label}</button>`).join('')}
        <div class="nav-spacer"></div>
        <button class="nav-btn quit hidden" data-act="quit">Leave level</button>
        <div class="nav-footer">
          <div class="nav-res"><span class="gem"></span><span data-bind="resources">0</span></div>
          <div class="nav-timer hidden" data-bind="timer"></div>
        </div>
      </div>
      <div class="menu-content"></div>
    `;
    el.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      g.sfxClick();
      if (btn.dataset.tab) this.selectTab(btn.dataset.tab);
      else if (btn.dataset.act === 'resume') g.resume();
      else if (btn.dataset.act === 'quit') g.leaveLevel();
    });
    this.root.innerHTML = '';
    this.root.appendChild(el);
    this._el = el;
  }

  _refreshChrome() {
    if (!this._el) return;
    const g = this.game;
    const inLevel = g.inLevel;
    this._el.querySelector('[data-act="resume"]').classList.toggle('hidden', !inLevel);
    this._el.querySelector('[data-act="quit"]').classList.toggle('hidden', !inLevel);
    this._el.querySelector('[data-bind="resources"]').textContent = formatNumber(Math.floor(g.economy.resources));
    const timer = this._el.querySelector('[data-bind="timer"]');
    timer.classList.toggle('hidden', !inLevel && !g.speedrun);
    if (inLevel || g.speedrun) timer.textContent = (g.speedrun ? 'Run ' + formatTime(g.speedrunMs) : formatTime(g.levelClock.elapsed)) + (this.live ? '' : ' (paused)');
  }

  // ---------- full-screen overlays (level complete, ending) ----------

  showOverlay(el) {
    this.closeMenu();
    this.closeOverlay();
    this._overlay = el;
    this.root.innerHTML = '';
    this.root.appendChild(el);
    this.root.classList.remove('hidden');
  }

  closeOverlay() {
    if (!this._overlay) return;
    this._overlay.remove();
    this._overlay = null;
    this.root.innerHTML = '';
  }

  hideAll() {
    this.closeMenu();
    this.closeOverlay();
  }
}

/** Small DOM helper used by tabs. */
export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
