import * as THREE from 'three';

const CRACK_STAGES = 10;

/** Procedural crack textures: stage N contains every crack of stage N-1 plus more. */
function createCrackTextures() {
  const SIZE = 16;
  let seed = 90210;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const pixels = new Uint8Array(SIZE * SIZE); // accumulated crack mask
  const textures = [];

  const walk = (len) => {
    let x = Math.floor(rnd() * SIZE);
    let y = Math.floor(rnd() * SIZE);
    for (let s = 0; s < len; s++) {
      pixels[y * SIZE + x] = 1;
      const r = rnd();
      if (r < 0.4) x += rnd() < 0.5 ? -1 : 1;
      else if (r < 0.8) y += rnd() < 0.5 ? -1 : 1;
      else { x += rnd() < 0.5 ? -1 : 1; y += rnd() < 0.5 ? -1 : 1; }
      x = Math.max(0, Math.min(SIZE - 1, x));
      y = Math.max(0, Math.min(SIZE - 1, y));
    }
  };

  for (let stage = 0; stage < CRACK_STAGES; stage++) {
    walk(5 + stage * 2);
    walk(4 + stage);
    const data = new Uint8Array(SIZE * SIZE * 4);
    for (let i = 0; i < SIZE * SIZE; i++) {
      if (pixels[i]) {
        data[i * 4] = 10; data[i * 4 + 1] = 10; data[i * 4 + 2] = 14;
        data[i * 4 + 3] = 215;
      }
    }
    const tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    textures.push(tex);
  }
  return textures;
}

/** Outline around the targeted block, crack overlay that grows with progress, and a hit pulse. */
export class BlockHighlight {
  constructor(scene) {
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
    this.outline = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })
    );
    this.outline.visible = false;

    this.cracks = createCrackTextures();
    this.overlay = new THREE.Mesh(
      new THREE.BoxGeometry(1.012, 1.012, 1.012),
      new THREE.MeshBasicMaterial({
        map: this.cracks[0], transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      })
    );
    this.overlay.visible = false;

    scene.add(this.outline, this.overlay);
    this._pulse = 0;
    this._stage = -1;
  }

  pulse() {
    this._pulse = 1;
  }

  update(target, progress, dt = 1 / 60) {
    this._pulse = Math.max(0, this._pulse - dt * 7);
    if (!target) {
      this.outline.visible = false;
      this.overlay.visible = false;
      return;
    }
    const cx = target.x + 0.5, cy = target.y + 0.5, cz = target.z + 0.5;
    this.outline.position.set(cx, cy, cz);
    this.overlay.position.set(cx, cy, cz);
    this.outline.visible = true;

    const s = 1 + this._pulse * 0.06;
    this.outline.scale.setScalar(s);
    this.overlay.scale.setScalar(s);

    if (progress > 0.001) {
      const stage = Math.min(CRACK_STAGES - 1, Math.floor(progress * CRACK_STAGES));
      if (stage !== this._stage) {
        this._stage = stage;
        this.overlay.material.map = this.cracks[stage];
        this.overlay.material.needsUpdate = true;
      }
      this.overlay.visible = true;
    } else {
      this.overlay.visible = false;
    }
  }
}
