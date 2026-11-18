import { CHUNK_SIZE as S, ATLAS_COLS, ATLAS_ROWS, ATLAS_TILE } from './constants.js';

/**
 * Builds one merged mesh per chunk containing only exposed faces, with baked
 * face shading and per-vertex ambient occlusion. Pure data in, typed arrays out,
 * so it runs (and is tested) without WebGL.
 */

const MAX_QUADS = S * S * S * 6;
const positions = new Float32Array(MAX_QUADS * 4 * 3);
const uvs = new Float32Array(MAX_QUADS * 4 * 2);
const colors = new Float32Array(MAX_QUADS * 4 * 3);
const indices = new Uint32Array(MAX_QUADS * 6);

// Corner order is counter-clockwise seen from outside the face (for positive sign).
const CORNER_I = [0, 1, 1, 0];
const CORNER_J = [0, 0, 1, 1];

const AO_BRIGHTNESS = [0.5, 0.68, 0.84, 1.0];

// Directional shade, indexed [axis][sign > 0 ? 1 : 0]
const FACE_SHADE = [
  [0.72, 0.84], // -x, +x
  [0.5, 1.0],   // -y, +y
  [0.66, 0.78], // -z, +z
];

const TILE_INSET = 0.02 / ATLAS_TILE; // keep samples inside the tile

const P = new Int32Array(3); // block being meshed
const F = new Int32Array(3); // cell in front of the current face
const AO = new Int32Array(4);

let vCount = 0;
let iCount = 0;

export function meshChunk(world, chunk) {
  if (chunk.count === 0) return null;

  const blocks = chunk.blocks;
  const ox = chunk.originX;
  const oy = chunk.originY;
  const oz = chunk.originZ;

  const solidAt = (x, y, z) => {
    if (x >= 0 && x < S && y >= 0 && y < S && z >= 0 && z < S) {
      return blocks[(y * S + z) * S + x] !== 0;
    }
    return world.isSolid(ox + x, oy + y, oz + z);
  };

  const solidOffset = (u, v, du, dv) => {
    let x = F[0], y = F[1], z = F[2];
    if (u === 0) x += du; else if (u === 1) y += du; else z += du;
    if (v === 0) x += dv; else if (v === 1) y += dv; else z += dv;
    return solidAt(x, y, z) ? 1 : 0;
  };

  vCount = 0;
  iCount = 0;

  for (let y = 0; y < S; y++) {
    for (let z = 0; z < S; z++) {
      for (let x = 0; x < S; x++) {
        const id = blocks[(y * S + z) * S + x];
        if (id === 0) continue;
        P[0] = x; P[1] = y; P[2] = z;

        for (let axis = 0; axis < 3; axis++) {
          for (let s = 0; s < 2; s++) {
            const sign = s === 1 ? 1 : -1;
            F[0] = x; F[1] = y; F[2] = z;
            F[axis] += sign;
            if (solidAt(F[0], F[1], F[2])) continue;
            emitFace(axis, sign, id, solidOffset);
          }
        }
      }
    }
  }

  if (vCount === 0) return null;
  return {
    positions: positions.slice(0, vCount * 3),
    uvs: uvs.slice(0, vCount * 2),
    colors: colors.slice(0, vCount * 3),
    indices: indices.slice(0, iCount),
    vertexCount: vCount,
    indexCount: iCount,
  };
}

function emitFace(axis, sign, id, solidOffset) {
  const u = (axis + 1) % 3;
  const v = (axis + 2) % 3;
  const plane = P[axis] + (sign > 0 ? 1 : 0);
  const shade = FACE_SHADE[axis][sign > 0 ? 1 : 0];

  // Atlas tile for this material
  const tile = id - 1;
  const col = tile % ATLAS_COLS;
  const row = Math.floor(tile / ATLAS_COLS);
  const u0 = col / ATLAS_COLS + TILE_INSET / ATLAS_COLS;
  const u1 = (col + 1) / ATLAS_COLS - TILE_INSET / ATLAS_COLS;
  const v0 = 1 - (row + 1) / ATLAS_ROWS + TILE_INSET / ATLAS_ROWS;
  const v1 = 1 - row / ATLAS_ROWS - TILE_INSET / ATLAS_ROWS;

  const base = vCount;
  for (let k = 0; k < 4; k++) {
    const i = CORNER_I[k];
    const j = CORNER_J[k];

    const pi = vCount * 3;
    positions[pi + axis] = plane;
    positions[pi + u] = P[u] + i;
    positions[pi + v] = P[v] + j;

    const du = i ? 1 : -1;
    const dv = j ? 1 : -1;
    const s1 = solidOffset(u, v, du, 0);
    const s2 = solidOffset(u, v, 0, dv);
    const c = solidOffset(u, v, du, dv);
    const ao = s1 && s2 ? 0 : 3 - (s1 + s2 + c);
    AO[k] = ao;

    const b = shade * AO_BRIGHTNESS[ao];
    colors[pi] = b;
    colors[pi + 1] = b;
    colors[pi + 2] = b;

    const ui = vCount * 2;
    uvs[ui] = i ? u1 : u0;
    uvs[ui + 1] = j ? v1 : v0;

    vCount++;
  }

  // Split the quad along the diagonal with the brighter corners to avoid AO artefacts.
  const flip = AO[0] + AO[2] <= AO[1] + AO[3];
  const a = base, b1 = base + 1, c1 = base + 2, d = base + 3;
  if (sign > 0) {
    if (!flip) {
      indices[iCount++] = a; indices[iCount++] = b1; indices[iCount++] = c1;
      indices[iCount++] = a; indices[iCount++] = c1; indices[iCount++] = d;
    } else {
      indices[iCount++] = b1; indices[iCount++] = c1; indices[iCount++] = d;
      indices[iCount++] = b1; indices[iCount++] = d; indices[iCount++] = a;
    }
  } else if (!flip) {
    indices[iCount++] = a; indices[iCount++] = c1; indices[iCount++] = b1;
    indices[iCount++] = a; indices[iCount++] = d; indices[iCount++] = c1;
  } else {
    indices[iCount++] = b1; indices[iCount++] = d; indices[iCount++] = c1;
    indices[iCount++] = b1; indices[iCount++] = a; indices[iCount++] = d;
  }
}
