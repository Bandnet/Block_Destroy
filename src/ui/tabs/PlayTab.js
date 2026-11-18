import { h } from '../UI.js';
import { LEVELS } from '../../data/levels.js';
import { MATERIALS } from '../../data/materials.js';
import { formatNumber, formatTime } from '../../util/format.js';

export const PlayTab = {
  id: 'play',
  label: 'Play',
  order: 10,
  render(container, ui) {
    const g = ui.game;
    const root = h(`
      <div class="view play">
        <h2>Levels</h2>
        <p class="muted">Destroy enough blocks to clear a level. Later levels need stronger tools.</p>
        <div class="level-grid"></div>
        <div class="controls">
          <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move</div>
          <div><kbd>Mouse</kbd> Look</div>
          <div><kbd>Space</kbd> Jump</div>
          <div><kbd>Shift</kbd> Sprint</div>
          <div><kbd>Left click</kbd> Break (hold)</div>
          <div><kbd>U</kbd> Upgrades</div>
          <div><kbd>T</kbd> Tools</div>
          <div><kbd>Esc</kbd> Pause</div>
        </div>
      </div>`);
    const grid = root.querySelector('.level-grid');
    const cards = LEVELS.map((lvl) => {
      const mats = [...new Set(lvl.terrain.mix.map((m) => m.id))].slice(0, 4);
      const el = h(`
        <div class="level-card">
          <div class="lc-top"><span class="lc-num">${lvl.id}</span><div><div class="lc-name"></div><div class="lc-tag muted"></div></div></div>
          <div class="lc-mats">${mats.map((id) => `<i style="background:${MATERIALS[id].color}" title="${MATERIALS[id].name}"></i>`).join('')}</div>
          <div class="lc-row"><span class="muted">Goal</span><b>${formatNumber(lvl.target)} blocks${lvl.finale ? ' + Core' : ''}</b></div>
          <div class="lc-row"><span class="muted">Par</span><b>${formatTime(lvl.parTime, { centis: false })}</b></div>
          <div class="lc-row"><span class="muted">Best</span><b class="lc-best">—</b></div>
          <button class="btn lc-play">Play</button>
          <div class="lc-reason muted"></div>
        </div>`);
      el.querySelector('.lc-name').textContent = lvl.name;
      el.querySelector('.lc-tag').textContent = lvl.tagline;
      el.querySelector('.lc-play').addEventListener('click', () => {
        if (g.lockReason(lvl.id)) g.audio.play('ui_error');
        else { g.sfxClick(); g.startLevel(lvl.id); }
      });
      grid.appendChild(el);
      return { lvl, el, btn: el.querySelector('.lc-play'), best: el.querySelector('.lc-best'), reason: el.querySelector('.lc-reason') };
    });
    const view = {
      update() {
        for (const c of cards) {
          const reason = g.lockReason(c.lvl.id);
          const done = g.levels.isCompleted(c.lvl.id);
          const best = g.levels.best(c.lvl.id);
          c.el.classList.toggle('locked', !!reason);
          c.el.classList.toggle('done', done);
          c.el.classList.toggle('current', g.inLevel && g.levelIndex === c.lvl.id);
          c.btn.disabled = !!reason;
          c.btn.textContent = reason ? '🔒 Locked' : g.inLevel && g.levelIndex === c.lvl.id ? 'Restart' : done ? 'Replay' : 'Play';
          c.reason.textContent = reason || '';
          c.best.textContent = best ? formatTime(best) : '—';
        }
      },
    };
    view.update();
    container.append(root);
    return view;
  },
};
