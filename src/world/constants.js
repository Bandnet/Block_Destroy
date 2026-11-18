export const CHUNK_SIZE = 16;
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE;
export const WORLD_HEIGHT_CHUNKS = 4;
export const WORLD_HEIGHT = CHUNK_SIZE * WORLD_HEIGHT_CHUNKS; // 64 blocks

export const AIR = 0;

// Texture atlas layout (tile index = material id - 1)
export const ATLAS_TILE = 16;
export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 4;
