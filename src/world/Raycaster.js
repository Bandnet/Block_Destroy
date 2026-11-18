/**
 * Voxel raycast (Amanatides & Woo DDA) against the block data directly,
 * not against meshes. Returns the first non-air block hit, or null.
 *
 * Result: { x, y, z, id, nx, ny, nz, dist }  (n* is the face normal that was hit)
 */
export function raycastVoxels(world, ox, oy, oz, dx, dy, dz, maxDist) {
  let x = Math.floor(ox);
  let y = Math.floor(oy);
  let z = Math.floor(oz);

  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;

  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;

  let tMaxX = dx > 0 ? (x + 1 - ox) / dx : dx < 0 ? (ox - x) / -dx : Infinity;
  let tMaxY = dy > 0 ? (y + 1 - oy) / dy : dy < 0 ? (oy - y) / -dy : Infinity;
  let tMaxZ = dz > 0 ? (z + 1 - oz) / dz : dz < 0 ? (oz - z) / -dz : Infinity;

  let t = 0;
  let nx = 0, ny = 0, nz = 0;
  const maxSteps = Math.ceil(maxDist * 3) + 3;

  for (let i = 0; i < maxSteps; i++) {
    const id = world.getBlock(x, y, z);
    if (id !== 0) return { x, y, z, id, nx, ny, nz, dist: t };

    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX; t = tMaxX; tMaxX += tDeltaX;
      nx = -stepX; ny = 0; nz = 0;
    } else if (tMaxY < tMaxZ) {
      y += stepY; t = tMaxY; tMaxY += tDeltaY;
      nx = 0; ny = -stepY; nz = 0;
    } else {
      z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ;
      nx = 0; ny = 0; nz = -stepZ;
    }
    if (t > maxDist) break;
  }
  return null;
}
