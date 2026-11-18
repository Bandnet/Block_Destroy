import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerBody, PLAYER } from '../src/player/PlayerBody.js';
import { makeFlatWorld } from './helpers.mjs';

const idle = { moveX: 0, moveZ: 0, jump: false, sprint: false, yaw: 0 };

function run(body, seconds, input, dt = 1 / 60) {
  for (let t = 0; t < seconds; t += dt) body.update(dt, input);
}

test('player falls and lands on the ground', () => {
  const w = makeFlatWorld(10);
  const b = new PlayerBody(w);
  b.setPosition(8.5, 30, 8.5);
  run(b, 3, idle);
  assert.ok(Math.abs(b.pos.y - 10) < 0.01, `rests on ground, y=${b.pos.y}`);
  assert.equal(b.onGround, true);
  assert.equal(b.vel.y, 0);
});

test('a huge frame time never tunnels through the floor', () => {
  const w = makeFlatWorld(10);
  const b = new PlayerBody(w);
  b.setPosition(8.5, 60, 8.5);
  b.vel.y = -500;
  for (let i = 0; i < 60; i++) b.update(0.1, idle);
  assert.ok(b.pos.y >= 9.99, `stayed above the floor, y=${b.pos.y}`);
});

test('walking forward (yaw 0 = -Z) moves toward -Z at walk speed', () => {
  const w = makeFlatWorld(10);
  const b = new PlayerBody(w);
  b.setPosition(8.5, 10, 8.5);
  run(b, 0.2, idle);
  const z0 = b.pos.z;
  run(b, 1, { ...idle, moveZ: 1 });
  const dist = z0 - b.pos.z;
  assert.ok(dist > PLAYER.WALK_SPEED * 0.85 && dist < PLAYER.WALK_SPEED * 1.05, `travelled ${dist}`);
  assert.ok(Math.abs(b.pos.x - 8.5) < 1e-6, 'no sideways drift');
});

test('sprinting is faster and diagonal movement is not faster than straight', () => {
  const w = makeFlatWorld(10);
  const a = new PlayerBody(w), c = new PlayerBody(w);
  a.setPosition(8.5, 10, 8.5);
  c.setPosition(8.5, 10, 8.5);
  run(a, 1, { ...idle, moveZ: 1, sprint: true });
  run(c, 1, { ...idle, moveZ: 1, moveX: 1 });
  const sprint = 8.5 - a.pos.z;
  const diag = Math.hypot(c.pos.x - 8.5, c.pos.z - 8.5);
  assert.ok(sprint > PLAYER.WALK_SPEED * 1.4);
  assert.ok(diag < PLAYER.WALK_SPEED * 1.05, `diagonal speed ${diag}`);
});

test('a wall stops the player', () => {
  const w = makeFlatWorld(10);
  for (let y = 10; y < 14; y++) for (let z = 0; z < 16; z++) w.setBlock(12, y, z, 3);
  const b = new PlayerBody(w);
  b.setPosition(8.5, 10, 8.5);
  run(b, 3, { ...idle, moveZ: 1, yaw: -Math.PI / 2 }); // yaw -90deg looks toward +X
  assert.ok(b.pos.x < 12 - PLAYER.WIDTH / 2 + 1e-6, `x=${b.pos.x}`);
  assert.ok(b.pos.x > 11.5, `reached the wall, x=${b.pos.x}`);
});

test('jump reaches a sensible height and lands again', () => {
  const w = makeFlatWorld(10);
  const b = new PlayerBody(w);
  b.setPosition(8.5, 10, 8.5);
  run(b, 0.2, idle);
  let peak = 0;
  b.update(1 / 60, { ...idle, jump: true });
  for (let i = 0; i < 120; i++) {
    b.update(1 / 60, idle);
    peak = Math.max(peak, b.pos.y);
  }
  assert.ok(peak > 11.2 && peak < 11.6, `peak ${peak}`);
  assert.ok(Math.abs(b.pos.y - 10) < 0.01);
});

test('player can jump onto a one-block step', () => {
  const w = makeFlatWorld(10);
  for (let z = 0; z < 16; z++) w.setBlock(10, 10, z, 3); // 1 high
  const b = new PlayerBody(w);
  b.setPosition(8.5, 10, 8.5);
  const east = { ...idle, moveZ: 1, yaw: -Math.PI / 2 };
  for (let i = 0; i < 180; i++) b.update(1 / 60, { ...east, jump: true });
  assert.ok(b.pos.x > 11, `got over the step, x=${b.pos.x}`);
});

test('player cannot jump a two-block wall from flat ground', () => {
  const w = makeFlatWorld(10);
  for (let z = 0; z < 16; z++) {
    w.setBlock(13, 10, z, 3);
    w.setBlock(13, 11, z, 3); // 2 high
  }
  const b = new PlayerBody(w);
  b.setPosition(8.5, 10, 8.5);
  const east = { ...idle, moveZ: 1, yaw: -Math.PI / 2 };
  for (let i = 0; i < 240; i++) b.update(1 / 60, { ...east, jump: true });
  assert.ok(b.pos.x < 13 - 0.3 + 1e-6, `blocked by the wall, x=${b.pos.x}`);
});

test('ceiling stops a jump', () => {
  const w = makeFlatWorld(10);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) w.setBlock(x, 12, z, 3);
  const b = new PlayerBody(w);
  b.setPosition(8.5, 10, 8.5);
  run(b, 0.2, idle);
  b.update(1 / 60, { ...idle, jump: true });
  let peak = 0;
  for (let i = 0; i < 60; i++) {
    b.update(1 / 60, idle);
    peak = Math.max(peak, b.pos.y + PLAYER.HEIGHT);
  }
  assert.ok(peak <= 12 + 1e-6, `head stayed below the ceiling, top=${peak}`);
});

test('player cannot walk out into unloaded chunks', () => {
  const w = makeFlatWorld(10);
  const b = new PlayerBody(w);
  b.setPosition(8.5, 10, 8.5);
  run(b, 12, { ...idle, moveZ: 1, yaw: -Math.PI / 2, sprint: true });
  assert.ok(b.pos.x < 48, `stopped at the edge of loaded chunks, x=${b.pos.x}`);
  assert.ok(b.pos.y >= 9.99);
});
