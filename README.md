# BLOCK GRINDER

A first-person 3D incremental block-breaking game that runs entirely in the browser
(HTML/CSS/JavaScript + Three.js, bundled with Vite). No backend: progress is saved in `localStorage`.

Mine blocks, collect resources, buy tools and upgrades, and grind through 10 levels until the
final Core. Numbers get enormous; the last tool is dramatically stronger than the first.

## Play

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve dist/
npm test           # unit tests + balance regression
node tools/balance-sim.mjs   # print the pacing of all 10 levels
```

`dist/` is fully static (relative asset paths) — open it from any static host.

### Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look |
| Space / Shift | Jump / sprint |
| Left click (hold) | Break blocks |
| U / T | Upgrade tree / Tools (the clock keeps running, drones keep mining) |
| Esc | Pause (everything freezes, timers stop) |
| F3 | Debug overlay |

## Game

* **10 levels** with their own terrain, sky, fog, ambient particles and music.
* **10 materials** and **10 tools** (Wooden Pickaxe … Ultimate Matter Disintegrator).
* **Upgrade tree**: 8 branches x 6 tiers (Damage, Breaking speed, Resource efficiency, Critical hits,
  Multibreak, Magnetism, Luck, Automation), connected nodes with requirements and level gating.
* **45 achievements** giving small permanent bonuses.
* **Timers and personal bests** per level, plus a **10-level speedrun** mode (fresh profile, splits, PB).
* **Ending**: destroy the Core on level 10 for the final sequence and completion screen.
* **Audio**: all sounds and music are synthesised with the Web Audio API (no audio files), with pooling,
  random pitch/volume variation, per-bus volume and mute settings.

## Architecture

```
src/
  core/       Game (integrator), EventBus, RunClock, Ending sequence
  world/      Chunked voxel world: Chunk, World (streaming, regrowth), WorldGenerator,
              ChunkMesher (one merged mesh per chunk), TextureAtlas, raycast, AmbientFX
  player/     PlayerBody (collision), PlayerController, ToolViewmodel
  mining/     MiningSystem, LootSystem, ParticlePool (single InstancedMesh), BreakEffects
  systems/    Economy, Stats, ToolSystem, UpgradeSystem, LevelSystem, AchievementSystem, SaveSystem
  data/       materials, tools, upgrades, levels, achievements (all balancing lives here)
  audio/      dsp, sounds, VoicePool, AudioEngine, AudioDirector, Music
  ui/         HUD, menu shell, tabs (Play, Upgrades, Tools, Achievements, Speedrun, Settings), screens
tools/        balance-sim.mjs
tests/        node:test suites
```

Performance rules followed: no mesh per block; blocks are bytes in 16x16x16 chunks; one mesh and one
material per chunk; dirty chunks are rebuilt nearest-first within a frame budget; every strike emits
one batched event; particles, orbs and sounds are pooled and capped.

## Balancing

All numbers are in `src/data/*`. `tools/balance-sim.mjs` plays the whole game with an average player
and prints how long each level takes; `tests/balance.test.mjs` keeps the pacing within bounds
(about 1 hour for a first playthrough).

## Deploying to GitHub Pages

Push to `main`; `.github/workflows/deploy.yml` runs the tests, builds and publishes `dist/`.
In the repository settings set **Pages → Source → GitHub Actions**.
