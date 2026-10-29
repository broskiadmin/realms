import { clock, isNight, player } from './fx';
import { supportHeight } from './physics';
import { ITEMS, useGame, type ItemId, type Quest, type TradeOffer, type Trader } from './store';
import { ISLANDS, NPC_SPOTS, islandHeight, randomSpot, terrainAt } from './world';

export type HatStyle = 'straw' | 'flannel' | 'helmet' | 'wizard' | 'hood';

export interface NpcLook {
  skin: string;
  shirt: string;
  pants: string;
  hat: HatStyle;
  hatColor: string;
  beard?: string;
}

interface TaskTemplate {
  kind: Quest['kind'];
  item?: ItemId;
  island?: number;
  /** Inclusive count range. */
  min: number;
  max: number;
  /** Coins per unit (visit tasks: flat). */
  rate: number;
}

export interface NpcDef {
  id: string;
  name: string;
  role: string;
  look: NpcLook;
  greet: string[];
  thanks: string;
  tasks: TaskTemplate[];
}

export const NPCS: NpcDef[] = [
  {
    id: 'bramble',
    name: 'Bramble',
    role: 'Farmer',
    look: { skin: '#f2c49b', shirt: '#6fbf4a', pants: '#3d6fb5', hat: 'straw', hatColor: '#f2d27a' },
    greet: ['Howdy, sky-walker! The critters keep me busy.', "Fine day for it, eh? Could use a hand, if you're free."],
    thanks: 'Much obliged! That\'ll keep the larder full.',
    tasks: [
      { kind: 'deliver', item: 'meat', min: 2, max: 4, rate: 2 },
      { kind: 'deliver', item: 'feather', min: 3, max: 6, rate: 1 },
      { kind: 'deliver', item: 'egg', min: 2, max: 3, rate: 2 },
      { kind: 'deliver', item: 'wood', min: 15, max: 30, rate: 0.25 },
    ],
  },
  {
    id: 'tamsin',
    name: 'Old Tamsin',
    role: 'Woodcutter',
    look: { skin: '#e0ac85', shirt: '#c0392b', pants: '#4a3b2a', hat: 'flannel', hatColor: '#7a2a20', beard: '#e8e2d6' },
    greet: ["Hrm. You've the look of someone who swings a pickaxe.", 'These old arms ain\'t what they were. Fetch me something?'],
    thanks: 'Good work. Here — you earned it.',
    tasks: [
      { kind: 'deliver', item: 'wood', min: 25, max: 45, rate: 0.25 },
      { kind: 'visit', island: 2, min: 1, max: 1, rate: 8 },
      { kind: 'visit', island: 5, min: 1, max: 1, rate: 7 },
      { kind: 'visit', island: 3, min: 1, max: 1, rate: 10 },
    ],
  },
  {
    id: 'gritt',
    name: 'Gritt',
    role: 'Miner',
    look: { skin: '#c98e66', shirt: '#7f8c8d', pants: '#34495e', hat: 'helmet', hatColor: '#f1c40f' },
    greet: ['Oi! Mind the rubble.', 'Rock, coal, copper — the quarry gives, if you dig.'],
    thanks: 'Ha! Solid haul. Pleasure doing business.',
    tasks: [
      { kind: 'deliver', item: 'stone', min: 15, max: 30, rate: 0.3 },
      { kind: 'deliver', item: 'coal', min: 4, max: 8, rate: 1 },
      { kind: 'deliver', item: 'copper', min: 4, max: 8, rate: 1.5 },
    ],
  },
  {
    id: 'seraphine',
    name: 'Seraphine',
    role: 'Stargazer',
    look: { skin: '#f5d0b5', shirt: '#6c4bd1', pants: '#2c2350', hat: 'wizard', hatColor: '#4a2fa8' },
    greet: ['The stars whisper of things in the dark…', 'Ah, a visitor. Do you see how the sunstone sings?'],
    thanks: 'Wonderful. The heavens thank you, as do I.',
    tasks: [
      { kind: 'deliver', item: 'sunstone', min: 2, max: 4, rate: 3 },
      { kind: 'deliver', item: 'skyglass', min: 1, max: 3, rate: 5 },
      { kind: 'deliver', item: 'duskshard', min: 2, max: 4, rate: 3 },
      { kind: 'slay', min: 2, max: 4, rate: 4 },
    ],
  },
];

export const NPC_BY_ID = new Map(NPCS.map((n) => [n.id, n]));
export const MAX_ACTIVE_QUESTS = 3;

export function npcSpot(id: string): { x: number; y: number; z: number } {
  const s = NPC_SPOTS.find((p) => p.id === id)!;
  return { x: s.x, z: s.z, y: islandHeight(ISLANDS[s.island], s.x, s.z) ?? ISLANDS[s.island].baseY };
}

export function makeQuest(npcId: string): Quest {
  const npc = NPC_BY_ID.get(npcId)!;
  const t = npc.tasks[Math.floor(Math.random() * npc.tasks.length)];
  const count = t.min + Math.floor(Math.random() * (t.max - t.min + 1));
  const reward = Math.max(4, Math.min(20, Math.round(t.kind === 'visit' ? t.rate : count * t.rate)));
  return { npc: npcId, kind: t.kind, item: t.item, island: t.island, count, reward, status: 'offered', acceptedAt: 0, baseline: 0 };
}

export function questText(q: Quest): string {
  if (q.kind === 'deliver') return `Bring me ${q.count} ${ITEMS[q.item ?? 'wood'].name}.`;
  if (q.kind === 'slay') return `Defeat ${q.count} Gloomwisps at night.`;
  return `Travel to ${ISLANDS[q.island ?? 0].name} and come back.`;
}

export function questShort(q: Quest): string {
  if (q.kind === 'deliver') return `${q.count} ${ITEMS[q.item ?? 'wood'].name}`;
  if (q.kind === 'slay') return `Slay ${q.count} Gloomwisps`;
  return `Visit ${ISLANDS[q.island ?? 0].name}`;
}

/** [current, target] — current is capped at target. */
export function questProgress(q: Quest): [number, number] {
  const g = useGame.getState();
  if (q.kind === 'deliver') return [Math.min(q.count, g.inventory[q.item ?? 'wood'] ?? 0), q.count];
  if (q.kind === 'slay') return [Math.min(q.count, g.wispKills - q.baseline), q.count];
  return [(g.visits[q.island ?? 0] ?? -1) > q.acceptedAt ? 1 : 0, 1];
}

export function questDone(q: Quest): boolean {
  const [a, b] = questProgress(q);
  return q.status === 'active' && a >= b;
}

/** The NPC's current quest, offering a fresh one if they have none. */
export function questFor(npcId: string): Quest {
  const g = useGame.getState();
  const existing = g.quests[npcId];
  if (existing) return existing;
  const q = makeQuest(npcId);
  g.setQuest(npcId, q);
  return q;
}

export function activeQuestCount(): number {
  return Object.values(useGame.getState().quests).filter((q) => q.status === 'active').length;
}

export function acceptQuest(npcId: string): string | null {
  const g = useGame.getState();
  const q = g.quests[npcId];
  if (!q || q.status !== 'offered') return null;
  if (activeQuestCount() >= MAX_ACTIVE_QUESTS) return `You can only take ${MAX_ACTIVE_QUESTS} tasks at a time.`;
  g.setQuest(npcId, { ...q, status: 'active', acceptedAt: clock.total, baseline: g.wispKills });
  return null;
}

export function turnInQuest(npcId: string): boolean {
  const g = useGame.getState();
  const q = g.quests[npcId];
  if (!q || !questDone(q)) return false;
  if (q.kind === 'deliver' && !g.spend({ [q.item ?? 'wood']: q.count })) return false;
  g.addItems({ coin: q.reward });
  g.setQuest(npcId, makeQuest(npcId));
  return true;
}

export function abandonQuest(npcId: string) {
  useGame.getState().setQuest(npcId, makeQuest(npcId));
}

// ---------------------------------------------------------------------------
// Wandering trader

const BUY_POOL: Omit<TradeOffer, 'stock'>[] = [
  { item: 'copper', qty: 5, price: 6 },
  { item: 'coal', qty: 5, price: 3 },
  { item: 'sunstone', qty: 3, price: 10 },
  { item: 'skyglass', qty: 2, price: 15 },
  { item: 'stew', qty: 1, price: 4 },
  { item: 'stone', qty: 20, price: 4 },
  { item: 'wood', qty: 20, price: 3 },
  { item: 'duskshard', qty: 2, price: 12 },
];

/** What the trader pays coins for (unlimited). */
export const SELL_LIST: { item: ItemId; qty: number; price: number }[] = [
  { item: 'leather', qty: 1, price: 3 },
  { item: 'feather', qty: 3, price: 2 },
  { item: 'egg', qty: 2, price: 2 },
  { item: 'meat', qty: 2, price: 3 },
];

const STAY = 240;

function rollOffers(): TradeOffer[] {
  return [...BUY_POOL]
    .sort(() => Math.random() - 0.5)
    .slice(0, 4)
    .map((o) => ({ ...o, stock: 3 }));
}

/** Called about once a second from the game ticker. */
export function tickTrader() {
  const g = useGame.getState();
  const now = clock.total;
  if (g.trader) {
    if (now >= g.trader.until) {
      g.setTrader(null, now + 300 + Math.random() * 300);
      g.toast('trader', 'The trader packed up and moved on.', '#ffcf33', 1);
      if (g.dialog?.type === 'trader') g.setDialog(null);
    }
    return;
  }
  if (now < g.nextTraderAt || isNight()) return;
  const known = g.discovered.length ? g.discovered : [0];
  const isl = ISLANDS[known[Math.floor(Math.random() * known.length)]];
  const p = randomSpot(isl, Math.random, 0.6);
  arrive(isl.id, p.x, islandHeight(isl, p.x, p.z) ?? isl.baseY, p.z);
}

function arrive(island: number, x: number, y: number, z: number) {
  const g = useGame.getState();
  const t: Trader = { island, x, y, z, until: clock.total + STAY, offers: rollOffers() };
  g.setTrader(t);
  g.toast('trader', `A trader's cart has rolled into ${ISLANDS[island].name}!`, '#ffcf33', 1);
  g.pushChat('system', `A trader's cart has rolled into ${ISLANDS[island].name}! Follow the golden beam.`);
}

/** Summon the trader a few metres in front of the player (steward chat command). */
export function summonTraderToPlayer(): string {
  const x = player.pos.x - Math.sin(player.yaw) * 4;
  const z = player.pos.z - Math.cos(player.yaw) * 4;
  const y = supportHeight(x, z, player.pos.y + 1);
  if (!Number.isFinite(y)) return 'No solid ground in front of you for the cart — face open ground and ask again.';
  const here = terrainAt(x, z)?.island;
  const island = here?.id ?? ISLANDS.reduce((a, b) => (Math.hypot(b.cx - x, b.cz - z) < Math.hypot(a.cx - x, a.cz - z) ? b : a)).id;
  arrive(island, x, y, z);
  return 'The trader has arrived right in front of you!';
}

export function buyOffer(index: number): string | null {
  const g = useGame.getState();
  const t = g.trader;
  const o = t?.offers[index];
  if (!t || !o || o.stock <= 0) return null;
  if (!g.spend({ coin: o.price })) return 'Not enough coins.';
  const offers = t.offers.map((x, i) => (i === index ? { ...x, stock: x.stock - 1 } : x));
  g.setTrader({ ...t, offers });
  g.addItems({ [o.item]: o.qty });
  return `Bought ${o.qty} ${ITEMS[o.item].name}`;
}

export function sellItem(index: number): string | null {
  const g = useGame.getState();
  const s = SELL_LIST[index];
  if (!g.spend({ [s.item]: s.qty })) return `You need ${s.qty} ${ITEMS[s.item].name}.`;
  g.addItems({ coin: s.price });
  return `Sold ${s.qty} ${ITEMS[s.item].name}`;
}
