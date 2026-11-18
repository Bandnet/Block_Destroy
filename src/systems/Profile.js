/**
 * The progression state that Economy, tools and upgrades operate on.
 * A speedrun uses its own fresh profile, so it never touches the main save.
 */
export function createProfile() {
  return {
    resources: 0,
    totalResources: 0, // lifetime resources collected
    blocksDestroyed: 0, // lifetime
    crits: 0,
    upgrades: {}, // upgrade id -> level
    ownedTools: ['wooden'],
    equippedTool: 'wooden',
    upgradesBought: 0,
    completedBranches: [], // branch ids whose every node is maxed
    highestLevel: 1, // furthest level unlocked (level select + upgrade/tool gating)
  };
}

export function cloneProfile(p) {
  return JSON.parse(JSON.stringify(p));
}

/** Fill in any fields a profile from an older save is missing. */
export function normalizeProfile(raw) {
  const base = createProfile();
  const p = { ...base, ...(raw || {}) };
  p.upgrades = { ...(raw && raw.upgrades) };
  p.ownedTools = Array.isArray(p.ownedTools) && p.ownedTools.length ? p.ownedTools : ['wooden'];
  p.completedBranches = Array.isArray(p.completedBranches) ? p.completedBranches : [];
  p.highestLevel = Math.max(1, Math.min(10, Math.floor(p.highestLevel) || 1));
  for (const k of ['resources', 'totalResources', 'blocksDestroyed', 'crits', 'upgradesBought']) {
    if (!Number.isFinite(p[k]) || p[k] < 0) p[k] = 0;
  }
  return p;
}
