import { h } from '../UI.js';
import { formatTime } from '../../util/format.js';
import { LEVELS } from '../../data/levels.js';

/** Results card shown when a full speedrun is finished. */
export function buildSpeedrunResult(game, r) {
  const rows = LEVELS.map((l, i) => {
    const cum = r.splits[i];
    const prev = r.previousSplits ? r.previousSplits[i] : null;
    const seg = cum - (i ? r.splits[i - 1] : 0);
    const d = prev != null && cum != null ? cum - prev : null;
    return `<tr><td>${l.id}. ${l.name}</td><td>${formatTime(seg)}</td><td>${formatTime(cum)}</td>
      <td class="${d !== null && d < 0 ? 'good' : d > 0 ? 'bad' : ''}">${d === null ? '—' : (d < 0 ? '−' : '+') + formatTime(Math.abs(d))}</td></tr>`;
  }).join('');
  const el = h(`
    <div class="overlay complete">
      <div class="oc-card wide">
        <div class="oc-kicker">SPEEDRUN COMPLETE</div>
        <h1>All 10 levels</h1>
        ${r.newBest ? `<div class="oc-badge">${r.previousBest === null ? 'FIRST FINISH' : 'NEW PERSONAL BEST'}</div>` : ''}
        <div class="oc-time">${formatTime(r.total)}</div>
        <div class="muted">${r.previousBest === null ? '' : `Previous best ${formatTime(r.previousBest)}`}</div>
        <table class="splits"><thead><tr><th>Level</th><th>Time</th><th>Split</th><th>vs best</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="oc-actions"><button class="btn big" data-act="menu">Continue</button></div>
      </div>
    </div>`);
  el.addEventListener('click', (e) => {
    if (!e.target.closest('button')) return;
    game.sfxClick();
    game.goMenu('speedrun');
  });
  return el;
}
