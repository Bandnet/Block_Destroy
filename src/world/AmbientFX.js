import * as THREE from 'three';

/**
 * A cloud of cheap points around the player that gives each level its mood:
 * drifting dust, rising embers, twinkling crystals or a starfield.
 * One THREE.Points object, positions updated on the CPU (a few hundred points).
 */
export class AmbientFX {
  constructor(scene) {
    this.scene = scene;
    this.points = null;
    this.cfg = null;
    this.time = 0;
    this.box = { x: 44, y: 26, z: 44 };
  }

  setLevel(cfg) {
    if (this.points) {
      this.scene.remove(this.points);
      this.points.geometry.dispose();
      this.points.material.dispose();
      this.points = null;
    }
    this.cfg = cfg;
    if (!cfg || !cfg.count) return;
    const n = cfg.count;
    this.base = new Float32Array(n * 3); // 0..1 within the box
    this.phase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.base[i * 3] = Math.random();
      this.base[i * 3 + 1] = Math.random();
      this.base[i * 3 + 2] = Math.random();
      this.phase[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const stars = cfg.kind === 'stars';
    const mat = new THREE.PointsMaterial({
      color: new THREE.Color(cfg.color),
      size: stars ? cfg.size : cfg.size * 3,
      sizeAttenuation: !stars,
      transparent: true,
      opacity: stars ? 0.9 : 0.75,
      depthWrite: false,
      fog: !stars,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  update(dt, px, py, pz) {
    const p = this.points;
    if (!p) return;
    this.time += dt;
    const { x: bx, y: by, z: bz } = this.box;
    const arr = p.geometry.attributes.position.array;
    const kind = this.cfg.kind;
    const speed = this.cfg.speed || 0;
    const wrap = (v) => v - Math.floor(v);
    for (let i = 0, n = this.cfg.count; i < n; i++) {
      let u = this.base[i * 3], v = this.base[i * 3 + 1], w = this.base[i * 3 + 2];
      if (kind === 'rise') v = wrap(v + this.time * speed / by);
      else if (kind === 'drift') {
        u = wrap(u + Math.sin(this.time * 0.3 + this.phase[i]) * 0.0006 * speed * 20 + this.time * speed * 0.004);
        v = wrap(v - this.time * speed * 0.004);
      }
      // keep the box centred on the player: wrap the offset from the player
      const ox = wrap(u - px / bx) - 0.5;
      const oy = wrap(v - py / by) - 0.5;
      const oz = wrap(w - pz / bz) - 0.5;
      if (kind === 'stars') {
        // a distant sphere that follows the player
        const a = this.phase[i], b = this.base[i * 3 + 1] * 2 - 1;
        const r = Math.sqrt(1 - b * b);
        arr[i * 3] = px + Math.cos(a) * r * 180;
        arr[i * 3 + 1] = py + b * 180;
        arr[i * 3 + 2] = pz + Math.sin(a) * r * 180;
      } else {
        arr[i * 3] = px + ox * bx;
        arr[i * 3 + 1] = py + oy * by;
        arr[i * 3 + 2] = pz + oz * bz;
      }
    }
    if (kind === 'twinkle') p.material.opacity = 0.55 + 0.25 * Math.sin(this.time * 2.2);
    p.geometry.attributes.position.needsUpdate = true;
  }
}
