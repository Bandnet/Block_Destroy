import { h } from '../UI.js';
import { TOOLS, describeTool } from '../../data/tools.js';
import { formatNumber } from '../../util/format.js';

/** Small SVG pictogram of a tool, drawn from its model colours. */
function pictogram(tool) {
  const m = tool.model;
  const glow = m.glow ? `filter="url(#g)"` : '';
  let body;
  switch (m.shape) {
    case 'drill':
      body = `<rect x="27" y="34" width="10" height="26" rx="2" fill="${m.handle}"/><rect x="24" y="22" width="16" height="14" rx="2" fill="${m.head}"/>
              <polygon points="32,2 38,22 26,22" fill="${m.glow || m.head}" ${glow}/>`;
      break;
    case 'rings':
      body = `<rect x="30" y="30" width="4" height="30" fill="${m.handle}"/>
              <ellipse cx="32" cy="24" rx="12" ry="4" fill="none" stroke="${m.head}" stroke-width="2" ${glow}/>
              <ellipse cx="32" cy="16" rx="9" ry="3" fill="none" stroke="${m.head}" stroke-width="2" ${glow}/>
              <circle cx="32" cy="20" r="4" fill="${m.glow}" ${glow}/>`;
      break;
    case 'cannon':
      body = `<rect x="26" y="34" width="12" height="24" rx="2" fill="${m.handle}"/><rect x="28" y="12" width="8" height="24" fill="${m.head}"/>
              <circle cx="32" cy="10" r="7" fill="${m.glow || m.head}" ${glow}/>`;
      break;
    default:
      body = `<rect x="30" y="14" width="4" height="46" fill="${m.handle}"/>
              <path d="M8 22 Q32 2 56 22 L56 28 Q32 10 8 28 Z" fill="${m.head}" ${glow}/>`;
  }
  return `<svg viewBox="0 0 64 64" class="tool-pic"><defs><filter id="g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>${body}</svg>`;
}

export const ToolsTab = {
  id: 'tools',
  label: 'Tools',
  order: 30,
  render(container, ui) {
    const g = ui.game;
    const ts = g.toolSystem;
    const root = h(`<div class="view tools"><h2>Tools</h2>
      <p class="muted">Each tool hits dramatically harder than the last. ${g.inLevel ? 'Press <kbd>T</kbd> to close.' : ''}</p>
      <div class="tool-grid"></div></div>`);
    const grid = root.querySelector('.tool-grid');

    const cards = TOOLS.map((tool) => {
      const el = h(`
        <div class="tool-card">
          <div class="tool-top">${pictogram(tool)}<div><div class="tool-name"></div><div class="tool-blurb muted"></div></div></div>
          <div class="tool-stats">
            <div><span class="muted">Damage</span><b>${formatNumber(tool.damage)}</b></div>
            <div><span class="muted">Hits / sec</span><b>${tool.hps}</b></div>
          </div>
          <ul class="tool-perks"></ul>
          <div class="tool-action"><button class="btn"></button><div class="tool-reason muted"></div></div>
        </div>`);
      el.querySelector('.tool-name').textContent = tool.name;
      el.querySelector('.tool-blurb').textContent = tool.blurb;
      const ul = el.querySelector('.tool-perks');
      for (const line of describeTool(tool)) {
        const li = document.createElement('li');
        li.textContent = line;
        ul.appendChild(li);
      }
      el.querySelector('button').addEventListener('click', () => {
        const st = ts.status(tool.id);
        if (st.owned) ts.equip(tool.id);
        else if (st.canBuy) ts.buy(tool.id);
        else g.audio.play('ui_error');
        view.update();
      });
      grid.appendChild(el);
      return { tool, el, btn: el.querySelector('button'), reason: el.querySelector('.tool-reason') };
    });

    const view = {
      update() {
        for (const c of cards) {
          const st = ts.status(c.tool.id);
          c.el.classList.toggle('equipped', st.equipped);
          c.el.classList.toggle('owned', st.owned);
          c.el.classList.toggle('locked', !st.owned && !st.canBuy);
          if (st.equipped) { c.btn.textContent = 'Equipped'; c.btn.disabled = true; }
          else if (st.owned) { c.btn.textContent = 'Equip'; c.btn.disabled = false; }
          else {
            c.btn.textContent = `Buy · ${formatNumber(c.tool.cost)}`;
            c.btn.disabled = !st.canBuy;
          }
          c.reason.textContent = !st.owned && st.reason ? st.reason : '';
        }
      },
    };
    view.update();
    container.append(root);
    return view;
  },
};
