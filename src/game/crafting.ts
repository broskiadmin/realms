import { player } from './fx';
import { supportHeight } from './physics';
import { PICK_TIERS, useGame, type ItemId } from './store';

export const BENCH_RANGE = 5;

export interface Recipe {
  id: string;
  name: string;
  desc: string;
  cost: Partial<Record<ItemId, number>>;
  /** Must be standing near a crafting table. */
  needsBench: boolean;
  /** Pickaxe tier this recipe grants (requires the tier below it). */
  tier?: number;
  /** Item granted, if any. */
  gives?: ItemId;
}

export const RECIPES: Recipe[] = [
  { id: 'bench', name: 'Crafting Table', desc: 'Placed in front of you. Stand near it to craft tools.', cost: { wood: 20 }, needsBench: false },
  { id: 'pick1', name: PICK_TIERS[1].name, desc: 'Hits twice as hard on everything.', cost: { wood: 10, copper: 6, coal: 2 }, needsBench: true, tier: 1 },
  { id: 'pick2', name: PICK_TIERS[2].name, desc: 'Hits three times as hard.', cost: { sunstone: 6, copper: 4 }, needsBench: true, tier: 2 },
  { id: 'pick3', name: PICK_TIERS[3].name, desc: 'Four times as hard — shatters Gloomwisps.', cost: { skyglass: 5, sunstone: 3, duskshard: 3 }, needsBench: true, tier: 3 },
  {
    id: 'plating',
    name: 'Copper Plating',
    desc: 'Unlocks copper building pieces (5 copper each). Gloomwisps need 40 strikes to break one, versus 6 for wood and 15 for stone.',
    cost: { copper: 8, coal: 4 },
    needsBench: true,
  },
  { id: 'stew', name: 'Hearty Stew', desc: 'Restores 65 hunger and 15 health.', cost: { meat: 1, egg: 1, coal: 1 }, needsBench: true, gives: 'stew' },
];

export function nearBench(): boolean {
  return useGame.getState().benches.some((b) => Math.hypot(b.x - player.pos.x, b.z - player.pos.z) < BENCH_RANGE && Math.abs(b.y - player.pos.y) < 3);
}

export type CraftBlock = 'bench' | 'tier' | 'owned' | 'cost' | null;

/** Why a recipe can't be crafted right now, or null if it can. */
export function blockedBy(r: Recipe): CraftBlock {
  const g = useGame.getState();
  if (r.tier !== undefined && g.pickTier >= r.tier) return 'owned';
  if (r.id === 'plating' && g.copperUnlocked) return 'owned';
  if (r.tier !== undefined && g.pickTier < r.tier - 1) return 'tier';
  if (r.needsBench && !nearBench()) return 'bench';
  for (const [k, v] of Object.entries(r.cost) as [ItemId, number][]) if ((g.inventory[k] ?? 0) < v) return 'cost';
  return null;
}

export function craft(r: Recipe): string | null {
  const g = useGame.getState();
  if (blockedBy(r)) return null;
  if (r.id === 'bench') {
    // Two metres ahead of the player, on whatever surface is there.
    const x = player.pos.x - Math.sin(player.yaw) * 2;
    const z = player.pos.z - Math.cos(player.yaw) * 2;
    const y = supportHeight(x, z, player.pos.y + 0.5);
    if (!Number.isFinite(y)) return 'Need solid ground in front of you';
    if (!g.spend(r.cost)) return null;
    g.addBench({ x, y, z, rot: player.yaw });
    return 'Placed a Crafting Table';
  }
  if (!g.spend(r.cost)) return null;
  if (r.tier !== undefined) {
    g.setPickTier(r.tier);
    return `Crafted ${r.name}!`;
  }
  if (r.id === 'plating') {
    g.unlockCopper();
    return 'Copper building unlocked — press F to pick a material';
  }
  if (r.gives) g.addItems({ [r.gives]: 1 });
  return `Crafted ${r.name}`;
}
