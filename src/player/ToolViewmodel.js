import * as THREE from 'three';

/**
 * First-person tool model attached to the camera, built procedurally from a
 * tool's `model` data ({ shape, head, handle, glow }) with a swing animation while mining.
 */
export class ToolViewmodel {
  constructor(camera) {
    this.group = new THREE.Group();
    this.basePos = new THREE.Vector3(0.42, -0.34, -0.7);
    this.group.position.copy(this.basePos);
    this.group.rotation.set(-0.35, -0.35, -0.25);
    camera.add(this.group);

    this.model = null;
    this.glowMats = [];
    this.phase = 0;
    this.swing = 0; // 0..1 blend toward the swinging pose
    this.time = 0;
    this.shape = 'pick';
  }

  /** Replace the displayed model with the one described by `tool.model`. */
  setTool(tool) {
    if (this.model) {
      this.group.remove(this.model);
      this.model.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
    const m = tool.model;
    this.shape = m.shape;
    this.glowMats = [];
    const root = new THREE.Group();
    const mat = (color) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color), depthTest: false });
    const add = (geo, color, x, y, z, glow = false) => {
      const mesh = new THREE.Mesh(geo, mat(color));
      mesh.position.set(x, y, z);
      mesh.renderOrder = 10;
      mesh.frustumCulled = false;
      if (glow) this.glowMats.push(mesh.material);
      root.add(mesh);
      return mesh;
    };
    const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

    switch (m.shape) {
      case 'drill': {
        add(box(0.1, 0.42, 0.1), m.handle, 0, 0.02, 0);
        add(box(0.14, 0.16, 0.14), m.head, 0, 0.3, 0);
        const bit = add(new THREE.ConeGeometry(0.06, 0.26, 8), m.glow || m.head, 0, 0.5, 0, !!m.glow);
        bit.rotation.y = 0;
        break;
      }
      case 'rings': {
        add(box(0.05, 0.4, 0.05), m.handle, 0, 0.02, 0);
        for (let i = 0; i < 3; i++) {
          const ring = add(new THREE.TorusGeometry(0.09 + i * 0.04, 0.012, 6, 20), m.head, 0, 0.3 + i * 0.1, 0, true);
          ring.rotation.x = Math.PI / 2;
        }
        add(new THREE.OctahedronGeometry(0.06), m.glow || m.head, 0, 0.3, 0, true);
        break;
      }
      case 'cannon': {
        add(box(0.12, 0.3, 0.12), m.handle, 0, 0.0, 0);
        add(box(0.09, 0.4, 0.09), m.head, 0, 0.3, 0);
        add(new THREE.SphereGeometry(0.075, 10, 8), m.glow || m.head, 0, 0.55, 0, true);
        break;
      }
      default: { // pick
        add(box(0.06, 0.55, 0.06), m.handle, 0, 0.05, 0);
        add(box(0.4, 0.09, 0.09), m.head, 0, 0.34, 0);
        add(box(0.07, 0.12, 0.09), m.head, -0.2, 0.3, 0);
        add(box(0.07, 0.12, 0.09), m.head, 0.2, 0.3, 0);
        if (m.glow) add(box(0.42, 0.03, 0.1), m.glow, 0, 0.395, 0, true);
      }
    }
    this.model = root;
    this.group.add(root);
  }

  update(dt, mining, hitsPerSecond) {
    this.time += dt;
    this.swing += ((mining ? 1 : 0) - this.swing) * Math.min(1, dt * 14);
    if (mining) this.phase += dt * hitsPerSecond * Math.PI * 2;

    if (this.shape === 'pick') {
      const s = Math.abs(Math.sin(this.phase * 0.5)) * this.swing;
      this.group.rotation.x = -0.35 - s * 1.1;
      this.group.position.y = this.basePos.y + s * 0.05;
      this.group.position.z = this.basePos.z - s * 0.08;
    } else {
      // powered tools point forward and vibrate / pulse while mining
      const s = this.swing;
      this.group.rotation.x = -0.35 - s * 1.0;
      const shake = Math.sin(this.time * 90) * 0.006 * s;
      this.group.position.set(this.basePos.x - s * 0.1 + shake, this.basePos.y + s * 0.06, this.basePos.z - s * 0.12);
    }
  }
}
