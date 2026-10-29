import { fbm, mulberry32, noise2, smoothstep } from './noise';

/** Build grid: horizontal cell size and vertical level height, in metres. */
export const CELL = 3;
export const LEVEL = 3;

export type Biome = 'meadow' | 'forest' | 'quarry' | 'highland' | 'crystal' | 'islet';
export type OreType = 'coal' | 'copper' | 'sunstone' | 'skyglass';
export type MobType = 'cow' | 'pig' | 'chicken';

export interface IslandDef {
  id: number;
  name: string;
  tagline: string;
  biome: Biome;
  cx: number;
  cz: number;
  /** Grid level the island's surface sits on (multiple of LEVEL). */
  baseY: number;
  radius: number;
  depth: number;
  hills: number;
  seed: number;
  trees: number;
  rocks: number;
  ores: Partial<Record<OreType, number>>;
  mobs: Partial<Record<MobType, number>>;
  grassDensity: number;
}

export const ISLANDS: IslandDef[] = [
  {
    id: 0, name: 'Hearthmeadow', tagline: 'Where every realm begins', biome: 'meadow',
    cx: 0, cz: 0, baseY: 0, radius: 26, depth: 16, hills: 1.4, seed: 1,
    trees: 18, rocks: 9, ores: { coal: 3, copper: 2 }, mobs: { cow: 2, pig: 2, chicken: 3 },
    grassDensity: 1.5,
  },
  {
    id: 1, name: 'Whisperwood', tagline: 'Timber as far as the eye can see', biome: 'forest',
    cx: 52, cz: -6, baseY: 0, radius: 18, depth: 13, hills: 1.2, seed: 2,
    trees: 26, rocks: 3, ores: { coal: 2 }, mobs: { pig: 3 },
    grassDensity: 1.1,
  },
  {
    id: 2, name: 'Rumblestone Quarry', tagline: 'Stone, coal and copper aplenty', biome: 'quarry',
    cx: -8, cz: -56, baseY: 3, radius: 17, depth: 15, hills: 2.2, seed: 3,
    trees: 4, rocks: 12, ores: { coal: 5, copper: 5 }, mobs: { cow: 3 },
    grassDensity: 0.45,
  },
  {
    id: 3, name: 'Sunpeak Highlands', tagline: 'Sunstone glitters in the hills', biome: 'highland',
    cx: -55, cz: 12, baseY: 6, radius: 16, depth: 14, hills: 1.8, seed: 4,
    trees: 9, rocks: 6, ores: { sunstone: 5, copper: 2 }, mobs: { chicken: 4 },
    grassDensity: 1.3,
  },
  {
    id: 4, name: 'Skyglass Spire', tagline: 'The rarest crystal in the sky', biome: 'crystal',
    cx: 40, cz: -58, baseY: 12, radius: 12, depth: 20, hills: 1.0, seed: 5,
    trees: 6, rocks: 3, ores: { skyglass: 6, sunstone: 1 }, mobs: {},
    grassDensity: 0.9,
  },
  {
    id: 5, name: 'Cluckling Isle', tagline: 'Small, sunny and very noisy', biome: 'islet',
    cx: 22, cz: 40, baseY: 3, radius: 8, depth: 9, hills: 0.8, seed: 6,
    trees: 3, rocks: 1, ores: { copper: 1 }, mobs: { chicken: 3 },
    grassDensity: 1.6,
  },
];

export interface BiomePalette {
  grass: [string, string];
  foliage: [string, string];
  rock: [string, string];
  dirt: string;
  /** Probability that a tree is a spirepine rather than a puffwood. */
  pineChance: number;
  flowers: boolean;
}

export const BIOMES: Record<Biome, BiomePalette> = {
  meadow: { grass: ['#7fdc4f', '#a6ea5a'], foliage: ['#5fd147', '#9be04b'], rock: ['#a9a39b', '#8d877f'], dirt: '#a8713f', pineChance: 0.25, flowers: true },
  forest: { grass: ['#4fbf4a', '#6fd25a'], foliage: ['#2fa84f', '#47c35a'], rock: ['#948d86', '#7b746d'], dirt: '#8b5a34', pineChance: 0.65, flowers: false },
  quarry: { grass: ['#b8c95a', '#d2d871'], foliage: ['#8cbf45', '#a8cf52'], rock: ['#b5aea4', '#968e84'], dirt: '#b37f4a', pineChance: 0.5, flowers: false },
  highland: { grass: ['#93e26b', '#c4ef7a'], foliage: ['#ffb347', '#ff8f3f'], rock: ['#c7b8a3', '#a8987f'], dirt: '#b8794a', pineChance: 0.2, flowers: true },
  crystal: { grass: ['#68dcc0', '#8ff0d2'], foliage: ['#ff8fd8', '#c78bff'], rock: ['#9e9ac4', '#7f7aab'], dirt: '#8a6a9a', pineChance: 0.3, flowers: false },
  islet: { grass: ['#86e05a', '#b6ef6c'], foliage: ['#6fdc52', '#b2ea52'], rock: ['#b0aaa1', '#938d84'], dirt: '#ad7745', pineChance: 0.0, flowers: true },
};

/** Island edge radius as a function of angle, wobbled so islands aren't perfect circles. */
export function radiusAt(isl: IslandDef, a: number): number {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const n1 = noise2(c * 1.4 + isl.seed * 7.1, s * 1.4 - isl.seed * 3.3);
  const n2 = noise2(c * 3.1 + isl.seed * 2.3, s * 3.1 + 50);
  return isl.radius * (1 + 0.13 * n1 + 0.05 * n2);
}

/** Surface height at (x, z) given normalised edge distance t ∈ [0, 1]. */
export function topAt(isl: IslandDef, x: number, z: number, t: number): number {
  const n = fbm(x * 0.035 + isl.seed * 13, z * 0.035 - isl.seed * 7, 3);
  const hill = isl.hills * (0.55 + 0.45 * n);
  const edge = smoothstep(0.62, 1, t);
  const lip = smoothstep(0.86, 1, t);
  return isl.baseY + 0.2 + hill * (1 - edge) - 0.9 * lip;
}

/** Normalised edge distance for a point relative to an island (>1 = off the island). */
export function edgeT(isl: IslandDef, x: number, z: number): number {
  const dx = x - isl.cx;
  const dz = z - isl.cz;
  const d = Math.hypot(dx, dz);
  if (d > isl.radius * 1.3) return Infinity;
  return d / radiusAt(isl, Math.atan2(dz, dx));
}

export function islandHeight(isl: IslandDef, x: number, z: number): number | null {
  const t = edgeT(isl, x, z);
  if (t > 1) return null;
  return topAt(isl, x, z, t);
}

/** Highest terrain surface under (x, z), or null over the void. */
export function terrainAt(x: number, z: number): { h: number; island: IslandDef } | null {
  let best: { h: number; island: IslandDef } | null = null;
  for (const isl of ISLANDS) {
    const h = islandHeight(isl, x, z);
    if (h !== null && (!best || h > best.h)) best = { h, island: isl };
  }
  return best;
}

export function randomSpot(isl: IslandDef, rng: () => number, tMax: number): { x: number; z: number } {
  const a = rng() * Math.PI * 2;
  const t = Math.sqrt(rng()) * tMax;
  const r = radiusAt(isl, a) * t;
  return { x: isl.cx + Math.cos(a) * r, z: isl.cz + Math.sin(a) * r };
}

// ---------------------------------------------------------------------------
// Resource nodes (trees, rocks, ores) — deterministic per island.

export type NodeKind = 'tree' | 'rock' | 'ore';

export interface ResourceNode {
  id: string;
  kind: NodeKind;
  ore?: OreType;
  /** Trees: 0 = puffwood, 1 = spirepine. */
  variant: number;
  x: number;
  y: number;
  z: number;
  scale: number;
  rot: number;
  island: number;
}

export const SPAWN = { x: 0, z: 4 };

/** Where each villager NPC stands (kept clear of trees and rocks). */
export const NPC_SPOTS: { id: string; island: number; x: number; z: number }[] = [
  { id: 'bramble', island: 0, x: -6, z: -2 },
  { id: 'tamsin', island: 1, x: 50, z: -3 },
  { id: 'gritt', island: 2, x: -6, z: -53 },
  { id: 'seraphine', island: 3, x: -53, z: 10 },
];

function generateNodes(): ResourceNode[] {
  const nodes: ResourceNode[] = [];
  for (const isl of ISLANDS) {
    const rng = mulberry32(isl.seed * 9973);
    const pal = BIOMES[isl.biome];
    const placed: { x: number; z: number; r: number }[] = [];
    const tryPlace = (minGap: number, tMax: number): { x: number; z: number } | null => {
      for (let attempt = 0; attempt < 40; attempt++) {
        const p = randomSpot(isl, rng, tMax);
        if (isl.id === 0 && Math.hypot(p.x - SPAWN.x, p.z - SPAWN.z) < 7) continue;
        if (NPC_SPOTS.some((s) => Math.hypot(p.x - s.x, p.z - s.z) < 3.5)) continue;
        if (placed.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < Math.max(o.r, minGap))) continue;
        placed.push({ ...p, r: minGap });
        return p;
      }
      return null;
    };
    const push = (kind: NodeKind, i: number, p: { x: number; z: number }, extra: Partial<ResourceNode>) => {
      nodes.push({
        id: `${kind[0]}${isl.id}-${i}${extra.ore ? `-${extra.ore}` : ''}`,
        kind,
        variant: 0,
        x: p.x,
        z: p.z,
        y: islandHeight(isl, p.x, p.z) ?? isl.baseY,
        scale: 1,
        rot: rng() * Math.PI * 2,
        island: isl.id,
        ...extra,
      });
    };
    for (let i = 0; i < isl.trees; i++) {
      const p = tryPlace(3.4, 0.8);
      if (p) push('tree', i, p, { variant: rng() < pal.pineChance ? 1 : 0, scale: 0.85 + rng() * 0.45 });
    }
    for (let i = 0; i < isl.rocks; i++) {
      const p = tryPlace(2.6, 0.82);
      if (p) push('rock', i, p, { variant: Math.floor(rng() * 3), scale: 0.7 + rng() * 0.6 });
    }
    let oi = 0;
    for (const [ore, count] of Object.entries(isl.ores) as [OreType, number][]) {
      for (let i = 0; i < count; i++) {
        const p = tryPlace(2.6, 0.78);
        if (p) push('ore', oi++, p, { ore, variant: Math.floor(rng() * 3), scale: 0.75 + rng() * 0.35 });
      }
    }
  }
  return nodes;
}

export const NODES: ResourceNode[] = generateNodes();
export const NODE_BY_ID = new Map(NODES.map((n) => [n.id, n]));

export const NODE_HP: Record<NodeKind, number> = { tree: 5, rock: 6, ore: 8 };
export const RESPAWN_MS: Record<NodeKind, number> = { tree: 90_000, rock: 120_000, ore: 240_000 };

export const ORE_INFO: Record<OreType, { name: string; color: string; glow: number }> = {
  coal: { name: 'Coal Seam', color: '#2b2b33', glow: 0 },
  copper: { name: 'Copper Ore', color: '#ff8a3d', glow: 0.15 },
  sunstone: { name: 'Sunstone Ore', color: '#ffd23f', glow: 0.7 },
  skyglass: { name: 'Skyglass Cluster', color: '#4ff0ff', glow: 1.8 },
};

export function nodeName(n: ResourceNode): string {
  if (n.kind === 'tree') return n.variant === 1 ? 'Spirepine' : ISLANDS[n.island].biome === 'crystal' ? 'Glowbloom' : 'Puffwood Tree';
  if (n.kind === 'rock') return 'Boulder';
  return ORE_INFO[n.ore ?? 'coal'].name;
}
