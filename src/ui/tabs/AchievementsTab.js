import { h } from '../UI.js';
import { ACHIEVEMENTS, ACHIEVEMENT_CATEGORIES, rewardText } from '../../data/achievements.js';
import { formatNumber } from '../../util/format.js';

export const AchievementsTab = {
  id: 'achievements',
  label: 'Achievements',
  order: 40,
  render(container, ui) {
    const g = ui.game;
    const ach = g.achievements;
    let filter = 'all';
    const root = h(`
      <div class="view achievements">
        <h2>Achievements</h2>
        <div class="ach-summary"></div>
        <div class="ach-filters"></div>
        <div class="ach-list"></div>
      </div>`);
    const summary = root.querySelector('.ach-summary');
    const filters = root.querySelector('.ach-filters');
    const list = root.querySelector('.ach-list');
    const cats = [{ id: 'all', name: 'All' }, ...ACHIEVEMENT_CATEGORIES];
    filters.innerHTML = cats.map((c) => `<button class="chip" data-cat="${c.id}">${c.name}</button>`).join('');
    filters.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      filter = b.dataset.cat;
      view.update();
    });
    const view = {
      update() {
        const b = ach.bonuses();
        summary.innerHTML = `<b>${ach.earnedCount()} / ${ACHIEVEMENTS.length}</b> earned
          <span class="muted"> · permanent bonus: +${Math.round(b.damage * 1000) / 10}% damage, +${Math.round(b.reward * 1000) / 10}% resources, +${Math.round(b.hits * 1000) / 10}% hit speed</span>`;
        for (const btn of filters.children) btn.classList.toggle('active', btn.dataset.cat === filter);
        const counters = ach.counters();
        list.innerHTML = '';
        for (const a of ACHIEVEMENTS) {
          if (filter !== 'all' && a.category !== filter) continue;
          const earned = ach.isEarned(a.id);
          const p = ach.progress(a, counters);
          const el = h(`
            <div class="ach ${earned ? 'earned' : ''}">
              <div class="ach-icon">${earned ? '★' : '☆'}</div>
              <div class="ach-body">
                <div class="ach-name"></div>
                <div class="ach-desc muted"></div>
                <div class="bar"><div style="width:${(p.fraction * 100).toFixed(1)}%"></div></div>
              </div>
              <div class="ach-side">
                <div class="ach-prog">${earned ? 'Unlocked' : a.stat === 'speedrunUnder' ? 'Locked' : `${formatNumber(Math.min(p.value, p.goal))} / ${formatNumber(p.goal)}`}</div>
                <div class="ach-reward">${rewardText(a.reward)}</div>
              </div>
            </div>`);
          el.querySelector('.ach-name').textContent = a.name;
          el.querySelector('.ach-desc').textContent = a.desc;
          list.appendChild(el);
        }
      },
    };
    view.update();
    container.append(root);
    return view;
  },
};
