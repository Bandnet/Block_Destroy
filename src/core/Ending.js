import * as THREE from 'three';

const DURATION = 11.5; // seconds, matches the 10 s final_sequence sound plus a short tail
const BOOM = 3.2; // build-up ends here (see audio/sounds.js final_sequence)

const easeOutBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const clamp01 = (x) => Math.max(0, Math.min(1, x));

/**
 * The finale: a camera orbit around the destroyed Core, shards of energy converging,
 * a flash, and then the unique final object (the "Ultimate Prism") rising in a
 * pillar of light. Pure three.js primitives; a handful of meshes only.
 */
export class EndingSequence {
  constructor(scene) {
    this.scene = scene;
    this.group = null;
    this.t = 0;
    this.active = false;
    this.boomed = false;
    this.onBoom = null; // () => void
    this.onDone = null; // () => void
    this.center = new THREE.Vector3();
  }

  start(cx, cy, cz) {
    this.dispose();
    this.center.set(cx, cy, cz);
    this.t = 0;
    this.boomed = false;
    this.active = true;

    const g = new THREE.Group();
    g.position.copy(this.center);
    const mat = (color, extra = {}) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color), fog: false, ...extra });
    const add = { blending: THREE.AdditiveBlending, transparent: true, depthWrite: false };

    this.prism = new THREE.Mesh(new THREE.OctahedronGeometry(1.4, 0), mat('#ffe9a0'));
    this.prism.scale.set(1, 1.7, 1);
    this.wire = new THREE.Mesh(new THREE.OctahedronGeometry(1.45, 0), mat('#ffffff', { wireframe: true }));
    this.wire.scale.copy(this.prism.scale);
    this.halo = new THREE.Mesh(new THREE.SphereGeometry(2.6, 20, 14), mat('#ffd36a', { ...add, opacity: 0.18 }));
    this.rings = [2.6, 3.2, 3.8].map((r, i) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 8, 64), mat(i === 1 ? '#7df0ff' : '#ffd36a', { ...add, opacity: 0.8 }));
      ring.rotation.set(i * 1.0, i * 0.6, 0);
      return ring;
    });
    this.pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.6, 90, 20, 1, true), mat('#ffe9a0', { ...add, opacity: 0, side: THREE.DoubleSide }));
    this.pillar.position.y = 45;
    this.shards = [];
    for (let i = 0; i < 16; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), mat(i % 2 ? '#ffe9a0' : '#7df0ff', { ...add, opacity: 0.9 }));
      s.userData = { a: (i / 16) * Math.PI * 2, y: (Math.random() - 0.5) * 6, speed: 0.6 + Math.random() * 0.6 };
      this.shards.push(s);
      g.add(s);
    }
    this.prism.visible = this.wire.visible = this.halo.visible = false;
    this.rings.forEach((r) => (r.visible = false));
    g.add(this.prism, this.wire, this.halo, this.pillar, ...this.rings);
    this.scene.add(g);
    this.group = g;
  }

  /** Called every frame while active; positions the camera. */
  update(dt, camera) {
    if (!this.group) return;
    if (this.active) this.t += dt;
    const t = this.t;
    const build = clamp01(t / BOOM);
    const after = Math.max(0, t - BOOM);

    // shards: converge during the build-up, then orbit tightly
    for (const s of this.shards) {
      const d = s.userData;
      const radius = t < BOOM ? 16 - 12 * build * build : 4 + Math.sin(after * 2 + d.a) * 0.4;
      const a = d.a + t * d.speed * (t < BOOM ? 0.8 : 1.6);
      s.position.set(Math.cos(a) * radius, d.y * (1 - build * 0.6), Math.sin(a) * radius);
      s.rotation.set(t * 2, t * 1.3, 0);
    }

    if (t >= BOOM) {
      if (!this.boomed) {
        this.boomed = true;
        this.prism.visible = this.wire.visible = this.halo.visible = true;
        this.rings.forEach((r) => (r.visible = true));
        if (this.onBoom) this.onBoom();
      }
      const k = clamp01(after / 1.4);
      const sc = Math.max(0.001, easeOutBack(k));
      this.prism.scale.set(sc, sc * 1.7, sc);
      this.wire.scale.copy(this.prism.scale);
      this.halo.scale.setScalar(sc * (1 + 0.06 * Math.sin(t * 3)));
      this.prism.rotation.y = t * 0.8;
      this.wire.rotation.y = -t * 0.5;
      this.rings.forEach((r, i) => { r.rotation.x += dt * (0.6 + i * 0.35); r.rotation.y += dt * (0.4 - i * 0.2); r.scale.setScalar(sc); });
      this.pillar.material.opacity = 0.35 * clamp01(after / 1.2) * (0.85 + 0.15 * Math.sin(t * 6));
      this.group.position.y = this.center.y + 1.5 + Math.sin(t * 1.4) * 0.25;
    }

    // camera orbit: wide and slow at first, then a rising pull-back
    const R = t < BOOM ? 13 - build * 3 : 10 + clamp01(after / 7) * 4;
    const a = t * 0.35;
    const h = 2 + (t < BOOM ? build * 2 : 4 + clamp01(after / 8) * 5);
    camera.position.set(this.center.x + Math.cos(a) * R, this.center.y + h, this.center.z + Math.sin(a) * R);
    camera.lookAt(this.center.x, this.center.y + 2 + (t >= BOOM ? 1.5 : 0), this.center.z);

    if (this.active && t >= DURATION) {
      this.active = false;
      if (this.onDone) this.onDone();
    }
  }

  dispose() {
    this.active = false;
    if (!this.group) return;
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    this.group = null;
  }
}

export const ENDING_DURATION = DURATION;
