import './styles/main.css';
import { Game } from './core/Game.js';
import { PlayTab } from './ui/tabs/PlayTab.js';
import { UpgradeTab } from './ui/tabs/UpgradeTab.js';
import { ToolsTab } from './ui/tabs/ToolsTab.js';
import { AchievementsTab } from './ui/tabs/AchievementsTab.js';
import { SpeedrunTab } from './ui/tabs/SpeedrunTab.js';
import { SettingsTab } from './ui/tabs/SettingsTab.js';

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const screens = document.getElementById('screens');

if (!webglAvailable()) {
  screens.innerHTML = `
    <div class="menu"><div class="menu-content"><div class="view">
      <h2>WebGL is not available</h2>
      <p class="muted">BLOCK GRINDER needs WebGL to draw its 3D world. Try a current version of Chrome, Edge, Firefox or Safari
      with hardware acceleration enabled.</p>
    </div></div></div>`;
} else {
  const game = new Game(document.getElementById('game'));
  game.registerTabs([PlayTab, UpgradeTab, ToolsTab, AchievementsTab, SpeedrunTab, SettingsTab]);
  game.ui.openMenu('play');
  game.start();
  window.__game = game; // handy for debugging and automated tests
}
