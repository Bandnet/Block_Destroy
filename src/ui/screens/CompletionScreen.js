import { h } from '../UI.js';
import { formatNumber, formatTime } from '../../util/format.js';
import { ACHIEVEMENTS } from '../../data/achievements.js';

/** The "you finished the game" screen. */
export function buildCompletionScreen(game, info, run) {
  const save = game.save;
  const p = game.mainProfile;
  const el = h(`
    <div class="overlay complete ending">
      <div class="oc-card wide">
        <div class="oc-kicker">CONGRATULATIONS</div>
        <h1>The Ultimate Grind is complete</h1>
        <p class="muted">You destroyed the Core and created the Ultimate Prism.</p>
        ${info.newBest ? `<div class="oc-badge">${info.previousBest === null ? 'FIRST CLEAR' : 'NEW PERSONAL BEST'}</div>` : ''}
        <div class="oc-grid">
          <div><span>Total play time</span><b>${formatTime(save.stats.playtimeMs, { centis: false })}</b></div>
          <div><span>Final level time</span><b>${formatTime(info.ms)}</b></div>
          <div><span>Blocks destroyed</span><b>${formatNumber(p.blocksDestroyed)}</b></div>
          <div><span>Resources collected</span><b>${formatNumber(p.totalResources)}</b></div>
          <div><span>Upgrades bought</span><b>${formatNumber(p.upgradesBought)}</b></div>
          <div><span>Achievements</span><b>${game.achievements.earnedCount()} / ${ACHIEVEMENTS.length}</b></div>
          <div><span>Speedrun best</span><b>${save.speedrun.best ? formatTime(save.speedrun.best) : '—'}</b></div>
          <div><span>Tools owned</span><b>${p.ownedTools.length} / 10</b></div>
          <div><span>Branches maxed</span><b>${p.completedBranches.length} / 8</b></div>
        </div>
        <div class="oc-actions">
          <button class="btn big" data-act="menu">Continue</button>
          <button class="btn ghost" data-act="speedrun">Try a speedrun</button>
        </div>
      </div>
    </div>`);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    game.sfxClick();
    game.goMenu(b.dataset.act === 'speedrun' ? 'speedrun' : 'play');
  });
  return el;
}
