import * as THREE from 'three';

export const KIND = { DEBRIS: 0, POP: 1, ORB: 2 };

const GRAVITY = 20;

/**
 * One InstancedMesh holds every particle in the game (one draw call). Particles
 * live in preallocated typed arrays; dead ones are swap-removed so the live ones
 * stay contiguous. Nothing is allocated while playing.
 *
 *  DEBRIS: small tumbling cubes thrown out of a broken block
 *  POP:    the broken block itself shrinking away
 *  ORB:    a resource orb that homes in on the player and credits its value on arrival
 */
export class ParticlePool {
  constructor(scene, capacity = 900) {
    this.capacity = capacity;
    this.count = 0;

    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true }),
      capacity
    );
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
    this.mesh = mesh;

    const f = (n) => new Float32Array(n);
    this.x = f(capacity); this.y = f(capacity); this.z = f(capacity);
    this.vx = f(capacity); this.vy = f(capacity); this.vz = f(capacity);
    this.life = f(capacity); this.maxLife = f(capacity); this.size = f(capacity);
    this.r = f(capacity); this.g = f(capacity); this.b = f(capacity);
    this.kind = new Uint8Array(capacity);
    this.tier = new Uint8Array(capacity);
    this.value = new Float64Array(capacity);

    /** (value, tier) => void, called when an orb reaches the player. */
    this.onOrbArrive = null;
  }

  get free() {
    return this.capacity - this.count;
  }

  _alloc() {
    return this.count < this.capacity ? this.count++ : -1;
  }

  spawnDebris(x, y, z, r, g, b, speed = 1) {
    const i = this._alloc();
    if (i < 0) return false;
    this.kind[i] = KIND.DEBRIS;
    this.x[i] = x + (Math.random() - 0.5) * 0.8;
    this.y[i] = y + (Math.random() - 0.5) * 0.8;
    this.z[i] = z + (Math.random() - 0.5) * 0.8;
    this.vx[i] = (Math.random() - 0.5) * 6 * speed;
    this.vy[i] = (2 + Math.random() * 4) * speed;
    this.vz[i] = (Math.random() - 0.5) * 6 * speed;
    this.maxLife[i] = this.life[i] = 0.55 + Math.random() * 0.45;
    this.size[i] = 0.07 + Math.random() * 0.1;
    this.r[i] = r; this.g[i] = g; this.b[i] = b;
    return true;
  }

  spawnPop(x, y, z, r, g, b) {
    const i = this._alloc();
    if (i < 0) return false;
    this.kind[i] = KIND.POP;
    this.x[i] = x; this.y[i] = y; this.z[i] = z;
    this.vx[i] = this.vy[i] = this.vz[i] = 0;
    this.maxLife[i] = this.life[i] = 0.16;
    this.size[i] = 0.97;
    this.r[i] = r; this.g[i] = g; this.b[i] = b;
    return true;
  }

  spawnOrb(x, y, z, value, tier, r, g, b) {
    const i = this._alloc();
    if (i < 0) return false;
    this.kind[i] = KIND.ORB;
    this.x[i] = x; this.y[i] = y; this.z[i] = z;
    this.vx[i] = (Math.random() - 0.5) * 4;
    this.vy[i] = 2 + Math.random() * 3;
    this.vz[i] = (Math.random() - 0.5) * 4;
    this.maxLife[i] = this.life[i] = 5; // safety net: credited even if it never arrives
    this.size[i] = 0.2;
    this.r[i] = r; this.g[i] = g; this.b[i] = b;
    this.value[i] = value;
    this.tier[i] = tier;
    return true;
  }

  /** Credit every live orb immediately (used when a level ends). */
  flushOrbs() {
    for (let i = 0; i < this.count; i++) {
      if (this.kind[i] === KIND.ORB) {
        this.life[i] = 0;
        this._arrive(i);
        this.value[i] = 0;
      }
    }
  }

  clear() {
    this.count = 0;
    this.mesh.count = 0;
  }

  _arrive(i) {
    if (this.onOrbArrive && this.value[i] > 0) this.onOrbArrive(this.value[i], this.tier[i]);
  }

  /**
   * @param tx,ty,tz  where orbs fly to (player body)
   * @param orbSpeed  base orb speed in blocks/s (magnetism raises it)
   */
  update(dt, tx, ty, tz, orbSpeed = 8) {
    const mat = this.mesh.instanceMatrix.array;
    const col = this.mesh.instanceColor.array;
    let i = 0;

    while (i < this.count) {
      const kind = this.kind[i];
      this.life[i] -= dt;
      let dead = this.life[i] <= 0;
      let scale = this.size[i];

      if (kind === KIND.DEBRIS) {
        this.vy[i] -= GRAVITY * dt;
        this.x[i] += this.vx[i] * dt;
        this.y[i] += this.vy[i] * dt;
        this.z[i] += this.vz[i] * dt;
        const t = this.life[i] / this.maxLife[i];
        if (t < 0.35) scale *= t / 0.35;
      } else if (kind === KIND.POP) {
        const t = 1 - this.life[i] / this.maxLife[i];
        scale = this.size[i] * (1 - t * t);
      } else {
        const age = this.maxLife[i] - this.life[i];
        if (age < 0.28) {
          const drag = Math.exp(-4 * dt);
          this.vx[i] *= drag; this.vy[i] = this.vy[i] * drag - 6 * dt; this.vz[i] *= drag;
        } else {
          const dx = tx - this.x[i], dy = ty - this.y[i], dz = tz - this.z[i];
          const dist = Math.hypot(dx, dy, dz) || 1e-6;
          const speed = orbSpeed * (1 + (age - 0.28) * 2.5);
          const k = 1 - Math.exp(-9 * dt);
          this.vx[i] += (dx / dist * speed - this.vx[i]) * k;
          this.vy[i] += (dy / dist * speed - this.vy[i]) * k;
          this.vz[i] += (dz / dist * speed - this.vz[i]) * k;
          if (dist < 0.8) dead = true;
        }
        this.x[i] += this.vx[i] * dt;
        this.y[i] += this.vy[i] * dt;
        this.z[i] += this.vz[i] * dt;
        scale *= 0.8 + 0.25 * Math.sin(age * 18);
      }

      if (dead) {
        if (kind === KIND.ORB) this._arrive(i);
        const last = --this.count;
        if (i !== last) this._copy(last, i);
        continue; // re-process the particle that was swapped into slot i
      }

      const o = i * 16;
      mat[o] = scale; mat[o + 1] = 0; mat[o + 2] = 0; mat[o + 3] = 0;
      mat[o + 4] = 0; mat[o + 5] = scale; mat[o + 6] = 0; mat[o + 7] = 0;
      mat[o + 8] = 0; mat[o + 9] = 0; mat[o + 10] = scale; mat[o + 11] = 0;
      mat[o + 12] = this.x[i]; mat[o + 13] = this.y[i]; mat[o + 14] = this.z[i]; mat[o + 15] = 1;
      const c = i * 3;
      col[c] = this.r[i]; col[c + 1] = this.g[i]; col[c + 2] = this.b[i];
      i++;
    }

    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }

  _copy(from, to) {
    this.x[to] = this.x[from]; this.y[to] = this.y[from]; this.z[to] = this.z[from];
    this.vx[to] = this.vx[from]; this.vy[to] = this.vy[from]; this.vz[to] = this.vz[from];
    this.life[to] = this.life[from]; this.maxLife[to] = this.maxLife[from]; this.size[to] = this.size[from];
    this.r[to] = this.r[from]; this.g[to] = this.g[from]; this.b[to] = this.b[from];
    this.kind[to] = this.kind[from]; this.tier[to] = this.tier[from]; this.value[to] = this.value[from];
  }
}
