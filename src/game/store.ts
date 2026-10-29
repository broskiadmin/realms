import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ItemId =
  | 'wood' | 'stone' | 'coal' | 'copper' | 'sunstone' | 'skyglass'
  | 'meat' | 'leather' | 'feather' | 'egg' | 'duskshard' | 'stew' | 'coin';

export const ITEMS: Record<ItemId, { name: string; color: string }> = {
  wood: { name: 'Wood', color: '#c98b4a' },
  stone: { name: 'Stone', color: '#a7adb5' },
  coal: { name: 'Coal', color: '#3a3a44' },
  copper: { name: 'Copper', color: '#ff8a3d' },
  sunstone: { name: 'Sunstone', color: '#ffd23f' },
  skyglass: { name: 'Skyglass', color: '#4ff0ff' },
  meat: { name: 'Meat', color: '#e86a6a' },
  leather: { name: 'Leather', color: '#a0613a' },
  feather: { name: 'Feather', color: '#f4f1ea' },
  egg: { name: 'Egg', color: '#f7e6c4' },
  duskshard: { name: 'Duskshard', color: '#b48cff' },
  stew: { name: 'Hearty Stew', color: '#d9823b' },
  coin: { name: 'Coins', color: '#ffcf33' },
};

export interface Quest {
  npc: string;
  kind: 'deliver' | 'slay' | 'visit';
  item?: ItemId;
  island?: number;
  count: number;
  reward: number;
  status: 'offered' | 'active';
  /** worldTime when accepted (visit tasks only count arrivals after this). */
  acceptedAt: number;
  /** wispKills when accepted (slay tasks count kills after this). */
  baseline: number;
}

export interface TradeOffer {
  item: ItemId;
  qty: number;
  price: number;
  stock: number;
}

export interface Trader {
  island: number;
  x: number;
  y: number;
  z: number;
  /** worldTime when the cart leaves. */
  until: number;
  offers: TradeOffer[];
}

export type Dialog = { type: 'npc'; id: string } | { type: 'trader' } | null;

export const FOOD: Partial<Record<ItemId, number>> = { stew: 65, meat: 35, egg: 15 };

/** A placed crafting table. */
export interface Bench {
  id: string;
  x: number;
  y: number;
  z: number;
  rot: number;
}

export const PICK_TIERS = [
  { name: 'Starter Pickaxe', color: '#7c6cff', glow: 0 },
  { name: 'Copper Pickaxe', color: '#ff8a3d', glow: 0.1 },
  { name: 'Sunstone Pickaxe', color: '#ffd23f', glow: 0.5 },
  { name: 'Skyglass Pickaxe', color: '#4ff0ff', glow: 1.2 },
];
export const MAX_HEALTH = 100;
export const MAX_HUNGER = 100;

export type PieceType = 'floor' | 'wall' | 'ramp';
export type Mat = 'wood' | 'stone' | 'copper';
export type Tool = 'pickaxe' | PieceType;
export const TOOLS: Tool[] = ['pickaxe', 'floor', 'wall', 'ramp'];
export const MATS: Mat[] = ['wood', 'stone', 'copper'];

/**
 * Per-material build cost (of the same-named item) and how many Gloomwisp
 * strikes a piece survives. Copper is unlocked by crafting Copper Plating.
 */
export const MAT_INFO: Record<Mat, { label: string; cost: number; toughness: number; color: string }> = {
  wood: { label: 'Wooden', cost: 10, toughness: 6, color: '#c98b4a' },
  stone: { label: 'Stone', cost: 10, toughness: 15, color: '#b9bcc4' },
  copper: { label: 'Copper', cost: 5, toughness: 40, color: '#ff8a3d' },
};

/**
 * A placed build piece on the world grid.
 * - wall: rot 0 = runs along x on the cell's min-z edge, 1 = runs along z on the min-x edge.
 * - ramp: rot = rising direction, 0 +x, 1 +z, 2 -x, 3 -z.
 */
export interface Piece {
  id: string;
  type: PieceType;
  mat: Mat;
  ix: number;
  iy: number;
  iz: number;
  rot: number;
}

export function pieceKey(p: Pick<Piece, 'type' | 'ix' | 'iy' | 'iz' | 'rot'>): string {
  return p.type === 'wall' ? `w:${p.ix},${p.iy},${p.iz},${p.rot}` : `${p.type[0]}:${p.ix},${p.iy},${p.iz}`;
}

export interface PlayerSave {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

interface Toast {
  id: number;
  key: string;
  text: string;
  color: string;
  count: number;
  at: number;
}

export interface ChatLine {
  id: number;
  from: 'you' | 'claude' | 'system';
  text: string;
  at: number;
}

export interface TargetInfo {
  key: string;
  label: string;
  hp: number;
  max: number;
}

interface GameState {
  // persisted
  inventory: Record<ItemId, number>;
  pieces: Piece[];
  depleted: Record<string, number>;
  discovered: number[];
  player: PlayerSave | null;
  health: number;
  hunger: number;
  /** Total in-game seconds elapsed (drives the day/night cycle). */
  worldTime: number;
  pickTier: number;
  benches: Bench[];
  copperUnlocked: boolean;
  quests: Record<string, Quest>;
  wispKills: number;
  visits: Record<number, number>;
  trader: Trader | null;
  nextTraderAt: number;
  // session-only
  dialog: Dialog;
  craftOpen: boolean;
  /** performance.now() when the current knockout ends, or 0 when conscious. */
  koUntil: number;
  hurtId: number;
  tool: Tool;
  lastBuildTool: PieceType;
  mat: Mat;
  rampRot: number;
  locked: boolean;
  started: boolean;
  target: TargetInfo | null;
  toasts: Toast[];
  banner: { id: number; title: string; sub: string } | null;
  chat: ChatLine[];
  chatOpen: boolean;

  addItems: (items: Partial<Record<ItemId, number>>) => void;
  placePiece: (p: Omit<Piece, 'id'>) => boolean;
  /** Remove a piece; `refund` (default true) returns half its cost. */
  removePiece: (id: string, refund?: boolean) => void;
  deplete: (nodeId: string, until: number) => void;
  respawnDue: (now: number) => void;
  discover: (islandId: number, title: string, sub: string) => void;
  setPlayer: (p: PlayerSave) => void;
  setTool: (t: Tool) => void;
  cycleTool: (dir: number) => void;
  toggleBuild: () => void;
  toggleMat: () => void;
  rotateRamp: () => void;
  setLocked: (l: boolean) => void;
  setTarget: (t: TargetInfo | null) => void;
  toast: (key: string, text: string, color: string, count?: number) => void;
  resetWorld: () => void;
  hurt: (amount: number, cause: string) => void;
  eat: () => void;
  tickVitals: (dt: number, sprinting: boolean) => void;
  revive: () => void;
  setWorldTime: (t: number) => void;
  pushChat: (from: ChatLine['from'], text: string) => void;
  setChatOpen: (open: boolean) => void;
  setCraftOpen: (open: boolean) => void;
  /** Deduct a cost if affordable; returns whether it was paid. */
  spend: (cost: Partial<Record<ItemId, number>>) => boolean;
  setPickTier: (tier: number) => void;
  unlockCopper: () => void;
  setQuest: (npc: string, q: Quest | null) => void;
  addWispKill: () => void;
  visit: (island: number, at: number) => void;
  setTrader: (t: Trader | null, nextAt?: number) => void;
  setDialog: (d: Dialog) => void;
  addBench: (b: Omit<Bench, 'id'>) => void;
  removeBench: (id: string) => void;
}

const START_INVENTORY: Record<ItemId, number> = {
  wood: 30, stone: 0, coal: 0, copper: 0, sunstone: 0, skyglass: 0,
  meat: 0, leather: 0, feather: 0, egg: 0, duskshard: 0, stew: 0, coin: 0,
};

let toastSeq = 1;
let pieceSeq = Date.now();

export const useGame = create<GameState>()(
  persist(
    (set, get) => ({
      inventory: { ...START_INVENTORY },
      pieces: [],
      depleted: {},
      discovered: [],
      player: null,
      health: MAX_HEALTH,
      hunger: MAX_HUNGER,
      worldTime: 0,
      pickTier: 0,
      benches: [],
      copperUnlocked: false,
      quests: {},
      wispKills: 0,
      visits: {},
      trader: null,
      nextTraderAt: 120,
      dialog: null,
      craftOpen: false,
      koUntil: 0,
      hurtId: 0,
      tool: 'pickaxe',
      lastBuildTool: 'floor',
      mat: 'wood',
      rampRot: 0,
      locked: false,
      started: false,
      target: null,
      toasts: [],
      banner: null,
      chat: [],
      chatOpen: false,

      addItems: (items) => {
        const inv = { ...get().inventory };
        for (const [k, v] of Object.entries(items) as [ItemId, number][]) {
          inv[k] = Math.max(0, (inv[k] ?? 0) + v);
          if (v > 0) get().toast(k, ITEMS[k].name, ITEMS[k].color, v);
        }
        set({ inventory: inv });
      },

      placePiece: (p) => {
        const { inventory, pieces } = get();
        const cost = MAT_INFO[p.mat].cost;
        if (inventory[p.mat] < cost) return false;
        const key = pieceKey(p);
        if (pieces.some((q) => pieceKey(q) === key)) return false;
        set({
          inventory: { ...inventory, [p.mat]: inventory[p.mat] - cost },
          pieces: [...pieces, { ...p, id: `p${pieceSeq++}` }],
        });
        return true;
      },

      removePiece: (id, refund = true) => {
        const piece = get().pieces.find((p) => p.id === id);
        if (!piece) return;
        set({ pieces: get().pieces.filter((p) => p.id !== id) });
        if (refund) get().addItems({ [piece.mat]: Math.ceil(MAT_INFO[piece.mat].cost / 2) });
      },

      deplete: (nodeId, until) => set({ depleted: { ...get().depleted, [nodeId]: until } }),

      respawnDue: (now) => {
        const d = get().depleted;
        const due = Object.keys(d).filter((k) => d[k] <= now);
        if (due.length === 0) return;
        const next = { ...d };
        for (const k of due) delete next[k];
        set({ depleted: next });
      },

      discover: (islandId, title, sub) => {
        if (get().discovered.includes(islandId)) return;
        set({ discovered: [...get().discovered, islandId], banner: { id: toastSeq++, title, sub } });
      },

      setPlayer: (p) => set({ player: p }),
      setTool: (t) => set(t === 'pickaxe' ? { tool: t } : { tool: t, lastBuildTool: t }),
      cycleTool: (dir) => {
        const i = TOOLS.indexOf(get().tool);
        get().setTool(TOOLS[(i + dir + TOOLS.length) % TOOLS.length]);
      },
      toggleBuild: () => get().setTool(get().tool === 'pickaxe' ? get().lastBuildTool : 'pickaxe'),
      toggleMat: () => {
        const mats = get().copperUnlocked ? MATS : MATS.filter((m) => m !== 'copper');
        set({ mat: mats[(mats.indexOf(get().mat) + 1) % mats.length] });
      },
      rotateRamp: () => set({ rampRot: (get().rampRot + 1) % 4 }),
      setLocked: (l) => set(l ? { locked: true, started: true } : { locked: false, chatOpen: false }),
      setTarget: (t) => {
        const cur = get().target;
        if (cur === t) return;
        if (cur && t && cur.key === t.key && cur.hp === t.hp) return;
        set({ target: t });
      },

      toast: (key, text, color, count = 1) => {
        const now = performance.now();
        const toasts = get().toasts.filter((t) => now - t.at < 2600);
        const last = toasts[toasts.length - 1];
        if (last && last.key === key && now - last.at < 1500) {
          last.count += count;
          last.at = now;
          set({ toasts: [...toasts] });
        } else {
          set({ toasts: [...toasts, { id: toastSeq++, key, text, color, count, at: now }].slice(-6) });
        }
      },

      resetWorld: () =>
        set({
          inventory: { ...START_INVENTORY },
          pieces: [],
          depleted: {},
          discovered: [],
          player: null,
          health: MAX_HEALTH,
          hunger: MAX_HUNGER,
          worldTime: 0,
          pickTier: 0,
          benches: [],
          copperUnlocked: false,
          quests: {},
          wispKills: 0,
          visits: {},
          trader: null,
          nextTraderAt: 120,
          mat: 'wood',
          tool: 'pickaxe',
        }),

      hurt: (amount, cause) => {
        const s = get();
        if (s.koUntil > 0 || amount <= 0) return;
        const health = Math.max(0, s.health - amount);
        set({ health, hurtId: s.hurtId + 1 });
        if (health > 0) return;
        // Knocked out: lose half of every carried item, respawn after a short beat.
        const inv = { ...s.inventory };
        for (const k of Object.keys(inv) as ItemId[]) inv[k] = Math.ceil(inv[k] / 2);
        set({ inventory: inv, koUntil: performance.now() + 3500 });
        get().toast('ko', `Knocked out by ${cause}! Half your items were lost.`, '#ff6b6b', 1);
      },

      eat: () => {
        const s = get();
        if (s.hunger >= MAX_HUNGER - 1) return get().toast('full', "You're full", '#ffd27a', 1);
        const food = (Object.keys(FOOD) as ItemId[]).find((k) => s.inventory[k] > 0);
        if (!food) return get().toast('nofood', 'No food — hunt cows, pigs or chickens', '#ffd27a', 1);
        set({
          inventory: { ...s.inventory, [food]: s.inventory[food] - 1 },
          hunger: Math.min(MAX_HUNGER, s.hunger + (FOOD[food] ?? 0)),
          health: Math.min(MAX_HEALTH, s.health + (food === 'stew' ? 15 : food === 'meat' ? 5 : 2)),
        });
        get().toast(`ate-${food}`, `Ate ${ITEMS[food].name}`, '#ffd27a', 1);
      },

      tickVitals: (dt, sprinting) => {
        const s = get();
        if (s.koUntil > 0) return;
        const hunger = Math.max(0, s.hunger - dt * (sprinting ? 0.22 : 0.11));
        if (hunger === 0) {
          set({ hunger });
          get().hurt(1.5 * dt, 'hunger');
        } else if (hunger > 70 && s.health < MAX_HEALTH) {
          set({ hunger: hunger - 0.05 * dt, health: Math.min(MAX_HEALTH, s.health + 0.8 * dt) });
        } else {
          set({ hunger });
        }
      },

      revive: () => set({ koUntil: 0, health: MAX_HEALTH, hunger: Math.max(get().hunger, 60) }),
      setWorldTime: (t) => set({ worldTime: t }),
      pushChat: (from, text) =>
        set({ chat: [...get().chat, { id: toastSeq++, from, text, at: performance.now() }].slice(-50) }),
      setChatOpen: (open) => set({ chatOpen: open }),
      setCraftOpen: (open) => set({ craftOpen: open }),
      spend: (cost) => {
        const inv = { ...get().inventory };
        for (const [k, v] of Object.entries(cost) as [ItemId, number][]) {
          if ((inv[k] ?? 0) < v) return false;
          inv[k] -= v;
        }
        set({ inventory: inv });
        return true;
      },
      setPickTier: (tier) => set({ pickTier: tier }),
      unlockCopper: () => set({ copperUnlocked: true, mat: 'copper' }),
      setQuest: (npc, q) => {
        const quests = { ...get().quests };
        if (q) quests[npc] = q;
        else delete quests[npc];
        set({ quests });
      },
      addWispKill: () => set({ wispKills: get().wispKills + 1 }),
      visit: (island, at) => {
        // Throttled: persisting every half-second tick would be wasteful.
        if (at - (get().visits[island] ?? -Infinity) < 30) return;
        set({ visits: { ...get().visits, [island]: at } });
      },
      setTrader: (t, nextAt) => set(nextAt === undefined ? { trader: t } : { trader: t, nextTraderAt: nextAt }),
      setDialog: (d) => set({ dialog: d }),
      addBench: (b) => set({ benches: [...get().benches, { ...b, id: `b${pieceSeq++}` }] }),
      removeBench: (id) => set({ benches: get().benches.filter((b) => b.id !== id) }),
    }),
    {
      name: 'realms-save-v1',
      partialize: (s) => ({
        inventory: s.inventory,
        pieces: s.pieces,
        depleted: s.depleted,
        discovered: s.discovered,
        player: s.player,
        health: s.health,
        hunger: s.hunger,
        worldTime: s.worldTime,
        pickTier: s.pickTier,
        benches: s.benches,
        copperUnlocked: s.copperUnlocked,
        quests: s.quests,
        wispKills: s.wispKills,
        visits: s.visits,
        trader: s.trader,
        nextTraderAt: s.nextTraderAt,
      }),
    },
  ),
);
