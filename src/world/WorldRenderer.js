import * as THREE from 'three';
import { meshChunk } from './ChunkMesher.js';

/**
 * Owns the three.js meshes for chunks: one mesh per chunk, one shared material.
 * Rebuilds dirty chunks nearest-first under a per-frame time budget.
 */
export class WorldRenderer {
  constructor(scene, world, atlasTexture) {
    this.world = world;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.material = new THREE.MeshBasicMaterial({ map: atlasTexture, vertexColors: true });
    this.meshes = new Map(); // Chunk -> Mesh
    this._sphere = new THREE.Sphere(new THREE.Vector3(8, 8, 8), 14);

    world.onChunkUnload = (chunk) => this._remove(chunk);
  }

  get meshCount() {
    return this.meshes.size;
  }

  update(px, py, pz, budgetMs = 4) {
    const dirty = this.world.dirtyChunks;
    if (dirty.size === 0) return;

    const list = Array.from(dirty);
    if (list.length > 1) {
      const dist = (c) => {
        const dx = c.originX + 8 - px;
        const dy = c.originY + 8 - py;
        const dz = c.originZ + 8 - pz;
        return dx * dx + dy * dy + dz * dz;
      };
      list.sort((a, b) => dist(a) - dist(b));
    }

    const t0 = performance.now();
    for (const chunk of list) {
      this._rebuild(chunk);
      dirty.delete(chunk);
      if (performance.now() - t0 > budgetMs) break;
    }
  }

  _rebuild(chunk) {
    const data = meshChunk(this.world, chunk);
    let mesh = this.meshes.get(chunk);

    if (!data) {
      if (mesh) this._remove(chunk);
      return;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geo.boundingSphere = this._sphere.clone();

    if (mesh) {
      mesh.geometry.dispose();
      mesh.geometry = geo;
    } else {
      mesh = new THREE.Mesh(geo, this.material);
      mesh.position.set(chunk.originX, chunk.originY, chunk.originZ);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.group.add(mesh);
      this.meshes.set(chunk, mesh);
    }
  }

  _remove(chunk) {
    const mesh = this.meshes.get(chunk);
    if (!mesh) return;
    this.group.remove(mesh);
    mesh.geometry.dispose();
    this.meshes.delete(chunk);
  }
}
