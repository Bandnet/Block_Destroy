// Cached neighbourhood offset lists for area attacks, sorted nearest first.
// Each list is an Int8Array of [dx, dy, dz] triples.

const sphereCache = new Map();
const columnCache = new Map();

/** All offsets with dx²+dy²+dz² <= r², sorted by distance. Index 0 is always (0,0,0). */
export function sphereOffsets(radius) {
  const key = Math.round(radius * 100);
  let list = sphereCache.get(key);
  if (list) return list;

  const r = Math.min(radius, 14);
  const r2 = r * r + 1e-9;
  const R = Math.floor(r);
  const items = [];
  for (let dx = -R; dx <= R; dx++) {
    for (let dy = -R; dy <= R; dy++) {
      for (let dz = -R; dz <= R; dz++) {
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 <= r2) items.push([dx, dy, dz, d2]);
      }
    }
  }
  items.sort((a, b) => a[3] - b[3]);
  list = new Int8Array(items.length * 3);
  items.forEach((it, i) => {
    list[i * 3] = it[0];
    list[i * 3 + 1] = it[1];
    list[i * 3 + 2] = it[2];
  });
  sphereCache.set(key, list);
  return list;
}

/** A vertical shaft below the target: horizontal radius `radius`, `depth` blocks down. */
export function columnOffsets(radius, depth) {
  const key = `${Math.round(radius * 100)}:${depth}`;
  let list = columnCache.get(key);
  if (list) return list;

  const r2 = radius * radius + 1e-9;
  const R = Math.floor(radius);
  const items = [];
  for (let dy = 0; dy >= -depth; dy--) {
    for (let dx = -R; dx <= R; dx++) {
      for (let dz = -R; dz <= R; dz++) {
        if (dx * dx + dz * dz <= r2) items.push([dx, dy, dz]);
      }
    }
  }
  list = new Int8Array(items.length * 3);
  items.forEach((it, i) => {
    list[i * 3] = it[0];
    list[i * 3 + 1] = it[1];
    list[i * 3 + 2] = it[2];
  });
  columnCache.set(key, list);
  return list;
}
