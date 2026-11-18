
import { h } from '../UI.js';
import {
  BRANCHES,
  UPGRADES,
  TREE,
  nodePosition,
  effectText,
  perLevelText
} from '../../data/upgrades.js';
import { formatNumber } from '../../util/format.js';

const NS = 'http://www.w3.org/2000/svg';

const svgEl = (name, attrs = {}) => {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) {
    e.setAttribute(k, v);
  }
  return e;
};

const NODE_R = 25;
const DRAG_THRESHOLD = 5;

/** Connected-node upgrade tree: click nodes, drag background to pan, scroll to zoom. */
export const UpgradeTab = {
  id: 'upgrades',
  label: 'Upgrade Tree',
  order: 20,

  render(container, ui) {
    const g = ui.game;
    const us = g.upgradeSystem;

    const root = h(`
      <div class="view tree-view">
        <div class="tree-head">
          <h2>Upgrade Tree</h2>
          <span class="muted">
            Drag empty space to pan · scroll to zoom · click a node
            ${g.inLevel ? '· <kbd>U</kbd> to close' : ''}
          </span>
        </div>

        <div class="tree-body">
          <div class="tree-canvas"></div>
          <aside class="tree-detail"></aside>
        </div>

        <div class="tree-legend"></div>
      </div>
    `);

    const canvas = root.querySelector('.tree-canvas');
    const detail = root.querySelector('.tree-detail');
    const legend = root.querySelector('.tree-legend');

    // Branch legend
    for (const b of BRANCHES) {
      const s = document.createElement('span');
      s.innerHTML = `<i style="background:${b.color}"></i>${b.name}`;
      legend.appendChild(s);
    }

    // SVG setup
    const svg = svgEl('svg', {
      class: 'tree-svg'
    });

    const world = svgEl('g');
    svg.appendChild(world);

    const color = Object.fromEntries(
      BRANCHES.map((b) => [b.id, b.color])
    );

    // Links are drawn behind nodes
    const linkLayer = svgEl('g');
    const nodeLayer = svgEl('g');

    world.append(linkLayer, nodeLayer);

    // Calculate node positions
    const pos = {};

    for (const up of UPGRADES) {
      pos[up.id] = nodePosition(up);
    }

    // Create upgrade connections
    const links = [];

    const addLink = (a, b, id, cross) => {
      const l = svgEl('line', {
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        class: 'tree-link' + (cross ? ' cross' : '')
      });

      linkLayer.appendChild(l);
      links.push({ l, id, cross });
    };

    const hubPos = { x: 0, y: 0 };

    for (const up of UPGRADES) {
      if (up.tier === 1) {
        addLink(hubPos, pos[up.id], up.id, false);
      }

      for (const r of up.requires) {
        addLink(
          pos[r.id],
          pos[up.id],
          up.id,
          !r.id.startsWith(up.branch)
        );
      }
    }

    // Central hub
    nodeLayer.appendChild(
      svgEl('circle', {
        r: TREE.hub * 0.5,
        class: 'tree-hub'
      })
    );

    const hubText = svgEl('text', {
      class: 'tree-hub-text',
      'text-anchor': 'middle',
      y: 5
    });

    hubText.textContent = 'CORE';
    nodeLayer.appendChild(hubText);

    // Create upgrade nodes
    const nodes = {};
    let selected = UPGRADES[0].id;

    for (const up of UPGRADES) {
      const p = pos[up.id];

      const grp = svgEl('g', {
        class: 'tree-node',
        transform: `translate(${p.x},${p.y})`
      });

      grp.style.setProperty('--c', color[up.branch]);

      const ring = svgEl('circle', {
        r: NODE_R,
        class: 'tn-ring'
      });

      grp.appendChild(ring);

      const lv = svgEl('text', {
        class: 'tn-level',
        'text-anchor': 'middle',
        y: 5
      });

      grp.appendChild(lv);

      const tier = svgEl('text', {
        class: 'tn-tier',
        'text-anchor': 'middle',
        y: NODE_R + 14
      });

      tier.textContent =
        up.name.length > 16
          ? up.name.slice(0, 15) + '…'
          : up.name;

      grp.appendChild(tier);

      // Make the complete node group clickable
      grp.style.cursor = 'pointer';
      grp.style.pointerEvents = 'all';

      grp.addEventListener('click', (e) => {
        e.stopPropagation();

        selected = up.id;
        view.update();

        g.sfxClick();
      });

      nodeLayer.appendChild(grp);

      nodes[up.id] = { grp, lv };
    }

    canvas.appendChild(svg);

    // --------------------------------------------------
    // PAN AND ZOOM
    // --------------------------------------------------

    const vb = {
      x: 0,
      y: 0,
      k: 0.85
    };

    const apply = () => {
      const r = svg.getBoundingClientRect();

      world.setAttribute(
        'transform',
        `translate(${r.width / 2 + vb.x},${r.height / 2 + vb.y}) scale(${vb.k})`
      );
    };

    let pointer = null;

    // Only start panning when clicking empty background.
    svg.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;

      // Clicking an upgrade node must select it, not start dragging.
      const target = e.target;

      if (
        target instanceof Element &&
        target.closest('.tree-node')
      ) {
        return;
      }

      pointer = {
        id: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startVX: vb.x,
        startVY: vb.y,
        dragging: false
      };

      svg.setPointerCapture(e.pointerId);
    });

    // Move the tree while dragging the background.
    svg.addEventListener('pointermove', (e) => {
      if (!pointer || pointer.id !== e.pointerId) return;

      const dx = e.clientX - pointer.startX;
      const dy = e.clientY - pointer.startY;

      // Ignore tiny pointer movements.
      if (
        !pointer.dragging &&
        Math.hypot(dx, dy) > DRAG_THRESHOLD
      ) {
        pointer.dragging = true;
      }

      if (pointer.dragging) {
        vb.x = pointer.startVX + dx;
        vb.y = pointer.startVY + dy;

        apply();
      }
    });

    // Finish dragging.
    svg.addEventListener('pointerup', (e) => {
      if (!pointer || pointer.id !== e.pointerId) return;

      pointer = null;

      if (svg.hasPointerCapture(e.pointerId)) {
        svg.releasePointerCapture(e.pointerId);
      }
    });

    // Handle cancelled pointer interactions.
    svg.addEventListener('pointercancel', () => {
      pointer = null;
    });

    // Zoom using mouse wheel.
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();

      const zoomFactor = e.deltaY < 0 ? 1.12 : 1 / 1.12;

      vb.k = Math.max(
        0.35,
        Math.min(2.2, vb.k * zoomFactor)
      );

      apply();
    }, { passive: false });

    // Reposition the tree if the window changes size.
    const onResize = () => apply();

    window.addEventListener('resize', onResize);

    // --------------------------------------------------
    // PURCHASE BUTTONS
    // --------------------------------------------------

    detail.addEventListener('click', (e) => {
      const b = e.target.closest('button');

      if (!b) return;

      const ok =
        b.dataset.buy === 'max'
          ? us.buyMax(selected) > 0
          : us.buy(selected);

      if (!ok) {
        g.audio.play('ui_error');
      }

      view.update();
    });

    // --------------------------------------------------
    // UPDATE TREE AND DETAIL PANEL
    // --------------------------------------------------

    const view = {
      update() {
        // Update every node
        for (const up of UPGRADES) {
          const st = us.status(up.id);
          const n = nodes[up.id];

          n.lv.textContent = st.maxed
            ? 'MAX'
            : st.level;

          n.grp.classList.toggle('locked', st.locked);
          n.grp.classList.toggle('maxed', st.maxed);
          n.grp.classList.toggle(
            'active',
            st.level > 0 && !st.maxed
          );

          n.grp.classList.toggle('buyable', st.canBuy);
          n.grp.classList.toggle(
            'selected',
            up.id === selected
          );
        }

        // Update connection colours
        for (const l of links) {
          const st = us.status(l.id);

          l.l.classList.toggle('on', st.level > 0);
        }

        // Selected upgrade information
        const st = us.status(selected);
        const up = st.up;

        const branch = BRANCHES.find(
          (b) => b.id === up.branch
        );

        const prog = us.branchProgress(up.branch);

        const next = st.maxed
          ? null
          : effectText(up, st.level + 1);

        detail.style.setProperty('--c', branch.color);

        detail.innerHTML = `
          <div class="td-branch">
            ${branch.name} · Tier ${up.tier}
            <span class="muted">
              (${prog.done}/${prog.total})
            </span>
          </div>

          <h3></h3>

          <p class="muted td-desc"></p>

          <div class="td-row">
            <span>Level</span>
            <b>${st.level} / ${up.max}</b>
          </div>

          <div class="td-row">
            <span>Per level</span>
            <b>${perLevelText(up)}</b>
          </div>

          <div class="td-row">
            <span>Current</span>
            <b>${effectText(up, st.level)}</b>
          </div>

          <div class="td-row">
            <span>Next</span>
            <b>${next || 'Maxed'}</b>
          </div>

          <div class="td-row">
            <span>Cost</span>
            <b class="${st.affordable ? 'ok' : 'no'}">
              ${st.maxed ? '—' : formatNumber(st.cost)}
            </b>
          </div>

          ${
            st.locked
              ? `
                <div class="td-req">
                  Requires:
                  <ul>
                    ${st.reasons.map((r) => `<li>${r}</li>`).join('')}
                  </ul>
                </div>
              `
              : ''
          }

          <div class="td-actions">
            <button
              class="btn"
              data-buy="one"
              ${st.canBuy ? '' : 'disabled'}
            >
              ${st.maxed ? 'Maxed' : 'Buy'}
            </button>

            <button
              class="btn ghost"
              data-buy="max"
              ${st.canBuy ? '' : 'disabled'}
            >
              Buy max
            </button>
          </div>
        `;

        detail.querySelector('h3').textContent = up.name;
        detail.querySelector('.td-desc').textContent = up.desc;
      },

      destroy() {
        window.removeEventListener('resize', onResize);
      }
    };

    // Attach the tree to the page.
    container.append(root);

    requestAnimationFrame(apply);

    view.update();

    return view;
  }
};
