import { h } from '../UI.js';
import { formatNumber, formatTime } from '../../util/format.js';
import { LEVEL_COUNT } from '../../data/levels.js';

/** Full-screen "level complete" card. */
export function buildLevelComplete(game, info, run) {
  const { level, ms, previousBest, newBest } = info;
  const par = level.parTime;
  const nextId = level.id + 1;
  const nextLock = level.id < LEVEL_COUNT ? game.lockReason(nextId) : 'last';
  const diffPrev = previousBest === null ? null : ms - previousBest;
  const sr = game.speedrun && game.run;
  const runMs = game.speedrunMs;
  const el = h(`
    <div class="overlay complete">
      <div class="oc-card">
        <div class="oc-kicker">${sr ? 'SPEEDRUN · ' : ''}LEVEL ${level.id} COMPLETE</div>
        <h1></h1>
        ${newBest && !sr ? `<div class="oc-badge">${previousBest === null ? 'FIRST CLEAR' : 'NEW PERSONAL BEST'}</div>` : ''}
        <div class="oc-time">${formatTime(ms)}</div>
        <div class="oc-grid">
          ${sr ? `<div><span>Run time</span><b>${formatTime(runMs)}</b></div>
          <div><span>Speedrun</span><b>${level.id} / ${LEVEL_COUNT}</b></div>` : `<div><span>Previous best</span><b>${previousBest === null ? '—' : formatTime(previousBest)}</b></div>
          <div><span>Difference</span><b class="${diffPrev !== null && diffPrev < 0 ? 'good' : ''}">${diffPrev === null ? '—' : (diffPrev < 0 ? '−' : '+') + formatTime(Math.abs(diffPrev))}</b></div>`}
          <div><span>Par time</span><b class="${ms <= par ? 'good' : ''}">${formatTime(par, { centis: false })}${ms <= par ? ' ✓' : ''}</b></div>
          <div><span>Blocks destroyed</span><b>${formatNumber(run.blocks)}</b></div>
          <div><span>Resources earned</span><b>${formatNumber(Math.floor(run.earned))}</b></div>
          <div><span>Total resources</span><b>${formatNumber(Math.floor(game.economy.resources))}</b></div>
        </div>
        ${info.unlockedNext ? `<div class="oc-unlock">🔓 Level ${nextId} unlocked</div>` : ''}
        ${nextLock && nextLock !== 'last' ? `<div class="oc-lock muted">Next level: ${nextLock}</div>` : ''}
        <div class="oc-actions">
          ${nextLock === null ? `<button class="btn big" data-act="next">Next level ▶</button>` : ''}
          <button class="btn" data-act="upgrades">Upgrades</button>
          <button class="btn" data-act="tools">Tools</button>
          ${sr ? '' : '<button class="btn ghost" data-act="replay">Replay</button>'}
          <button class="btn ghost" data-act="menu">${sr ? 'Run menu' : 'Main menu'}</button>
        </div>
      </div>
    </div>`);
  el.querySelector('h1').textContent = level.name;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    game.sfxClick();
    const act = b.dataset.act;
    if (act === 'next') game.startLevel(nextId);
    else if (act === 'replay') game.startLevel(level.id);
    else if (act === 'upgrades') game.goMenu('upgrades');
    else if (act === 'tools') game.goMenu('tools');
    else game.goMenu(sr ? 'speedrun' : 'play');
  });
  return el;
}
