import { h } from '../UI.js';
import { LEVELS } from '../../data/levels.js';
import { formatTime } from '../../util/format.js';

export const SpeedrunTab = {
  id: 'speedrun',
  label: 'Speedrun',
  order: 50,
  render(container, ui) {
    const g = ui.game;
    const root = h(`
      <div class="view speedrun">
        <h2>Speedrun</h2>
        <p class="muted">Clear all 10 levels back to back, as fast as you can.</p>
        <div class="sr-rules">
          <div>• Start with <b>no upgrades, tools or resources</b>. Your normal save is untouched.</div>
          <div>• Levels must be played in order; the clock runs between levels while you shop.</div>
          <div>• Achievement bonuses are disabled. Pausing with <kbd>Esc</kbd> stops the clock.</div>
        </div>
        <div class="sr-stats"></div>
        <div class="oc-actions sr-actions"></div>
        <table class="splits"><thead><tr><th>Level</th><th>Best split</th><th>This run</th></tr></thead><tbody></tbody></table>
      </div>`);
    const stats = root.querySelector('.sr-stats');
    const actions = root.querySelector('.sr-actions');
    const tbody = root.querySelector('tbody');
    actions.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      g.sfxClick();
      if (b.dataset.act === 'start') g.startSpeedrun();
      else if (b.dataset.act === 'continue') g.startLevel(g.run.level);
      else if (b.dataset.act === 'abort') { if (!window.confirm || window.confirm('Abort the speedrun?')) g.abortSpeedrun(); }
    });
    const view = {
      update() {
        const sr = g.save.speedrun;
        stats.innerHTML = `
          <div><span>Personal best</span><b>${sr.best ? formatTime(sr.best) : '—'}</b></div>
          <div><span>Attempts</span><b>${sr.attempts}</b></div>
          <div><span>Completions</span><b>${sr.completions}</b></div>
          ${g.speedrun ? `<div><span>Current run</span><b>${formatTime(g.speedrunMs)}</b></div>` : ''}`;
        if (g.speedrun) {
          actions.innerHTML = `${g.inLevel ? '' : `<button class="btn big" data-act="continue">Continue to level ${g.run.level} ▶</button>`}<button class="btn ghost" data-act="abort">Abort run</button>`;
        } else {
          actions.innerHTML = '<button class="btn big" data-act="start">Start speedrun</button>';
        }
        tbody.innerHTML = LEVELS.map((l, i) => {
          const best = sr.bestSplits ? sr.bestSplits[i] : null;
          const cur = g.run ? g.run.splits[i] : null;
          return `<tr><td>${l.id}. ${l.name}</td><td>${best != null ? formatTime(best) : '—'}</td><td>${cur != null ? formatTime(cur) : '—'}</td></tr>`;
        }).join('');
      },
    };
    view.update();
    container.append(root);
    return view;
  },
};
