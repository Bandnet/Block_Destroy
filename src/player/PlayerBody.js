/**
 * Player physics: an axis-aligned box moving through the voxel grid.
 * No rendering or input code here, so it can be tested in plain Node.
 *
 * pos is the centre of the feet. Input: { moveX, moveZ, jump, sprint, yaw }.
 */

export const PLAYER = {
  WIDTH: 0.6,
  HEIGHT: 1.8,
  EYE: 1.62,
  WALK_SPEED: 5.5,
  SPRINT_SPEED: 9,
  GROUND_ACCEL: 70,
  AIR_ACCEL: 22,
  GRAVITY: 32,
  JUMP_VELOCITY: 9.5,
  MAX_FALL: 55,
};

const EPS = 1e-3;
const MAX_STEP = 1 / 60;

export class PlayerBody {
  constructor(world) {
    this.world = world;
    this.pos = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.onGround = false;
  }

  setPosition(x, y, z) {
    this.pos.x = x;
    this.pos.y = y;
    this.pos.z = z;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.onGround = false;
  }

  update(dt, input) {
    // Sub-step so a long frame can never tunnel through a block.
    const steps = Math.max(1, Math.ceil(dt / MAX_STEP));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) this._step(h, input);
  }

  _step(h, input) {
    const v = this.vel;

    // Horizontal wish direction relative to yaw (camera looks down -Z at yaw 0)
    const sin = Math.sin(input.yaw);
    const cos = Math.cos(input.yaw);
    let wx = -sin * input.moveZ + cos * input.moveX;
    let wz = -cos * input.moveZ - sin * input.moveX;
    const len = Math.hypot(wx, wz);
    if (len > 1) {
      wx /= len;
      wz /= len;
    }
    const speed = input.sprint ? PLAYER.SPRINT_SPEED : PLAYER.WALK_SPEED;
    const accel = (this.onGround ? PLAYER.GROUND_ACCEL : PLAYER.AIR_ACCEL) * h;
    v.x += clamp(wx * speed - v.x, -accel, accel);
    v.z += clamp(wz * speed - v.z, -accel, accel);

    // Vertical
    if (input.jump && this.onGround) {
      v.y = PLAYER.JUMP_VELOCITY;
      this.onGround = false;
    }
    v.y = Math.max(-PLAYER.MAX_FALL, v.y - PLAYER.GRAVITY * h);

    this._move('x', v.x * h);
    this._move('z', v.z * h);
    const wasFalling = v.y <= 0;
    const hitY = this._move('y', v.y * h);
    this.onGround = hitY && wasFalling;
  }

  /** Move along one axis and resolve collisions. Returns true if blocked. */
  _move(axis, d) {
    if (d === 0) return false;
    const p = this.pos;
    p[axis] += d;

    const hw = PLAYER.WIDTH / 2;
    const minX = p.x - hw, maxX = p.x + hw;
    const minY = p.y, maxY = p.y + PLAYER.HEIGHT;
    const minZ = p.z - hw, maxZ = p.z + hw;

    const x0 = Math.floor(minX), x1 = Math.floor(maxX);
    const y0 = Math.floor(minY), y1 = Math.floor(maxY);
    const z0 = Math.floor(minZ), z1 = Math.floor(maxZ);

    let hit = false;
    let limit = d > 0 ? Infinity : -Infinity;
    const lo = axis === 'x' ? x0 : axis === 'y' ? y0 : z0;
    const hi = axis === 'x' ? x1 : axis === 'y' ? y1 : z1;

    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          if (!this.world.isSolid(x, y, z)) continue;
          hit = true;
          const c = axis === 'x' ? x : axis === 'y' ? y : z;
          if (d > 0) limit = Math.min(limit, c);
          else limit = Math.max(limit, c + 1);
        }
      }
    }
    void lo; void hi;

    if (!hit) return false;

    const extent = axis === 'y' ? PLAYER.HEIGHT : hw;
    if (d > 0) p[axis] = limit - extent - EPS;
    else p[axis] = limit + (axis === 'y' ? 0 : hw) + EPS;
    this.vel[axis] = 0;
    return true;
  }
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
