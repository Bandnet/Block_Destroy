import { h } from '../UI.js';

function sliderRow({ label, min, max, step, value, format, onInput, muted }) {
  const row = h(`
    <div class="set-row">
      <label>${label}</label>
      <input type="range" min="${min}" max="${max}" step="${step}" value="${value}">
      <span class="set-val"></span>
      ${muted === undefined ? '' : `<label class="chk"><input type="checkbox" ${muted ? 'checked' : ''}> Mute</label>`}
    </div>
  `);
  const input = row.querySelector('input[type=range]');
  const out = row.querySelector('.set-val');
  const paint = () => { out.textContent = format(Number(input.value)); };
  paint();
  input.addEventListener('input', () => { paint(); onInput(Number(input.value), null); });
  const mute = row.querySelector('input[type=checkbox]');
  if (mute) mute.addEventListener('change', () => onInput(null, mute.checked));
  return row;
}

export const SettingsTab = {
  id: 'settings',
  label: 'Settings',
  order: 60,
  render(container, ui) {
    const g = ui.game;
    const a = g.settings.audio;
    const pct = (v) => `${Math.round(v * 100)}%`;

    const root = h(`<div class="view settings"><h2>Settings</h2></div>`);

    const audio = h(`<section class="card"><h3>Audio</h3></section>`);
    audio.append(
      sliderRow({
        label: 'Master volume', min: 0, max: 1, step: 0.01, value: a.master, format: pct, muted: a.muteMaster,
        onInput: (v, m) => g.setAudio(v !== null ? { master: v } : { muteMaster: m }),
      }),
      sliderRow({
        label: 'Sound effects', min: 0, max: 1, step: 0.01, value: a.sfx, format: pct, muted: a.muteSfx,
        onInput: (v, m) => g.setAudio(v !== null ? { sfx: v } : { muteSfx: m }),
      }),
      sliderRow({
        label: 'Music', min: 0, max: 1, step: 0.01, value: a.music, format: pct, muted: a.muteMusic,
        onInput: (v, m) => g.setAudio(v !== null ? { music: v } : { muteMusic: m }),
      })
    );
    const test = h(`<div class="set-row"><button class="btn" id="test-sound">▶ Test sound</button><span class="muted" id="audio-state"></span></div>`);
    const state = test.querySelector('#audio-state');
    test.querySelector('#test-sound').addEventListener('click', () => {
      g.unlockAudio();
      const ok = g.audio.play('test_tone', { pitchJitter: 0 });
      state.textContent = ok ? '' : 'Audio is not available yet. Interact with the page first.';
    });
    audio.append(test);

    const gfx = h(`<section class="card"><h3>Graphics and controls</h3></section>`);
    const distNames = { 4: 'Low', 6: 'Medium', 8: 'High' };
    gfx.append(
      sliderRow({
        label: 'Render distance', min: 4, max: 8, step: 2, value: g.settings.renderDistance,
        format: (v) => `${distNames[v] || v} (${v} chunks)`,
        onInput: (v) => g.setGraphics({ renderDistance: v }),
      }),
      sliderRow({
        label: 'Field of view', min: 60, max: 100, step: 1, value: g.settings.fov, format: (v) => `${v}°`,
        onInput: (v) => g.setGraphics({ fov: v }),
      }),
      sliderRow({
        label: 'Mouse sensitivity', min: 0.3, max: 2.5, step: 0.05, value: g.settings.sensitivity, format: (v) => `${v.toFixed(2)}×`,
        onInput: (v) => g.setGraphics({ sensitivity: v }),
      })
    );

    const data = h(`<section class="card"><h3>Save data</h3>
      <p class="muted">Progress is saved automatically in this browser.</p>
      <div class="set-row">
        <button class="btn" id="export">Export save</button>
        <button class="btn" id="import">Import save</button>
        <button class="btn danger" id="reset">Reset all progress</button>
      </div>
      <input type="file" id="import-file" accept=".json,application/json" class="hidden">
      <div class="muted" id="data-msg"></div>
    </section>`);
    const msg = data.querySelector('#data-msg');
    data.querySelector('#export').addEventListener('click', () => {
      g.exportSave();
      msg.textContent = 'Save exported.';
    });
    const file = data.querySelector('#import-file');
    data.querySelector('#import').addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const f = file.files[0];
      if (!f) return;
      const ok = g.importSave(await f.text());
      msg.textContent = ok ? 'Save imported.' : 'That file is not a valid BLOCK GRINDER save.';
    });
    const reset = data.querySelector('#reset');
    let armed = 0;
    reset.addEventListener('click', () => {
      if (!armed) {
        armed = setTimeout(() => { armed = 0; reset.textContent = 'Reset all progress'; }, 4000);
        reset.textContent = 'Click again to confirm';
        return;
      }
      clearTimeout(armed);
      armed = 0;
      g.resetProgress();
      reset.textContent = 'Reset all progress';
      msg.textContent = 'All progress was reset.';
    });

    root.append(audio, gfx, data);
    container.append(root);
    return {};
  },
};
