import type { Vector3 } from 'three';
import { debug, isNight } from './fx';
import { pushOutCircle, supportHeight } from './physics';
import type { ItemId } from './store';
import { useGame } from './store';
import { NODES, edgeT, randomSpot, terrainAt } from './world';

/**
 * Ground predators that come out at night.
 * - Duskwolf: fast pack hunter (spawns in pairs), bites, gnaws walls that block it.
 * - Shardback: slow armoured crawler that emerges near ore rocks; heavy slam, lots of HP.
 * They walk on terrain and build pieces (so they follow you over bridges and up ramps)
 * but stop at the island edge rather than walking into the void.
 */

export type PredatorKind = 'duskwolf' | 'shardback';

export interface Predator {
  id: number;
  kind: PredatorKind;
  x: number;
  y: number;
  z: number;
  heading: number;
  alive: boolean;
  hp: number;
  state: 'prowl' | 'chase' | 'leave';
  timer: number;
  cooldown: number;
  flash: number;
  phase: number;
  /** 0..1 strike animation progress (bite lunge / shell slam), -1 when idle. */
  strike: number;
  /** Fade/burrow progress when leaving at dawn (1 → 0). */
  presence: number;
  kx: number;
  kz: number;
}

export const PREDATOR_INFO: Record<
  PredatorKind,
  { name: string; hp: number; speed: number; chase: number; reach: number; damage: number; cooldown: number; radius: number; armor: number }
> = {
  duskwolf: { name: 'Duskwolf', hp: 4, speed: 1.6, chase: 5.6, reach: 1.5, damage: 9, cooldown: 1.6, radius: 0.45, armor: 0 },
  shardback: { name: 'Shardback', hp: 12, speed: 0.8, chase: 1.7, reach: 2.1, damage: 15, cooldown: 2.6, radius: 0.9, armor: 1 },
};

const MAX = { duskwolf: 4, shardback: 2 };

export const PREDATORS: Predator[] = Array.from({ length: MAX.duskwolf + MAX.shardback }, (_, id) => ({
  id,
  kind: id < MAX.duskwolf ? 'duskwolf' : 'shardback',
  x: 0,
  y: -999,
  z: 0,
  heading: 0,
  alive: false,
  hp: 1,
  state: 'prowl',
  timer: 0,
  cooldown: 0,
  flash: 0,
  phase: Math.random() * 10,
  strike: -1,
  presence: 1,
  kx: 0,
  kz: 0,
}));

const timers = { duskwolf: 20, shardback: 35 };

function spawn(p: Predator, x: number, z: number) {
  const t = terrainAt(x, z);
  if (!t) return false;
  p.x = x;
  p.z = z;
  p.y = t.h;
  p.alive = true;
  p.hp = PREDATOR_INFO[p.kind].hp;
  p.state = 'prowl';
  p.timer = 2;
  p.cooldown = 1;
  p.flash = 0;
  p.strike = -1;
  p.presence = 0.01;
  p.heading = Math.random() * Math.PI * 2;
  return true;
}

/** A spot on the player's island, 16–30 m away, not over the edge. */
function spotNear(player: Vector3, minD: number, maxD: number): { x: number; z: number } | null {
  const isl = terrainAt(player.x, player.z)?.island;
  if (!isl) return null;
  for (let i = 0; i < 12; i++) {
    const s = randomSpot(isl, Math.random, 0.8);
    const d = Math.hypot(s.x - player.x, s.z - player.z);
    if (d >= minD && d <= maxD) return s;
  }
  return null;
}

function trySpawns(dt: number, player: Vector3) {
  timers.duskwolf -= dt;
  timers.shardback -= dt;
  if (timers.duskwolf <= 0) {
    timers.duskwolf = 28 + Math.random() * 18;
    const free = PREDATORS.filter((p) => p.kind === 'duskwolf' && !p.alive).slice(0, 2);
    const at = free.length ? spotNear(player, 16, 30) : null;
    if (at) free.forEach((p, i) => spawn(p, at.x + i * 1.4, at.z + i * 0.9));
  }
  if (timers.shardback <= 0) {
    timers.shardback = 40 + Math.random() * 25;
    const free = PREDATORS.find((p) => p.kind === 'shardback' && !p.alive);
    if (!free) return;
    // Shardbacks claw their way out next to ore rocks on the player's island.
    const isl = terrainAt(player.x, player.z)?.island;
    const { depleted } = useGame.getState();
    const ores = NODES.filter(
      (n) => n.kind !== 'tree' && isl && n.island === isl.id && !(n.id in depleted) && Math.hypot(n.x - player.x, n.z - player.z) < 45,
    );
    const o = ores[Math.floor(Math.random() * ores.length)];
    if (o) spawn(free, o.x + 1.6, o.z + 1.2);
  }
}

export interface PredatorEvents {
  onBite: (p: Predator, dir: { x: number; z: number }) => void;
  onGnaw: (pieceId: string, p: Predator) => void;
}

export function updatePredators(dt: number, player: Vector3, ev: PredatorEvents) {
  if (debug.freezeHostiles) {
    for (const p of PREDATORS) if (p.alive) p.phase += dt * 2;
    return;
  }
  const night = isNight();
  if (night) trySpawns(dt, player);
  for (const p of PREDATORS) {
    if (!p.alive) continue;
    const info = PREDATOR_INFO[p.kind];
    p.flash = Math.max(0, p.flash - dt);
    p.cooldown -= dt;
    p.timer -= dt;
    if (p.strike >= 0) {
      p.strike += dt / (p.kind === 'duskwolf' ? 0.35 : 0.6);
      if (p.strike >= 1) p.strike = -1;
    }
    if (!night && p.state !== 'leave') p.state = 'leave';
    if (p.state === 'leave') {
      p.presence -= dt / (p.kind === 'duskwolf' ? 1.5 : 2.5);
      if (p.presence <= 0) p.alive = false;
      continue;
    }
    p.presence = Math.min(1, p.presence + dt * 0.8);

    const dx = player.x - p.x;
    const dz = player.z - p.z;
    const dist = Math.hypot(dx, dz);
    const sameLevel = Math.abs(player.y - p.y) < 3;
    if (dist < 28 && sameLevel) p.state = 'chase';
    else if (p.state === 'chase' && dist > 40) p.state = 'prowl';

    let speed = 0;
    if (p.state === 'chase') {
      const want = Math.atan2(dx, dz);
      p.heading += ((((want - p.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 6));
      speed = dist > info.reach * 0.8 ? info.chase : 0;
    } else {
      if (p.timer <= 0) {
        p.timer = 2 + Math.random() * 3;
        p.heading += (Math.random() - 0.5) * 2;
      }
      speed = info.speed;
    }

    // Ground movement: follow terrain and build pieces, but never step off into the void.
    const step = (speed * dt);
    const nx = p.x + Math.sin(p.heading) * step + p.kx * dt;
    const nz = p.z + Math.cos(p.heading) * step + p.kz * dt;
    const ground = supportHeight(nx, nz, p.y + 0.6);
    const isl = terrainAt(nx, nz)?.island;
    const safe = Number.isFinite(ground) && ground > p.y - 1.6 && (!isl || edgeT(isl, nx, nz) < 0.92 || ground > isl.baseY + 0.5);
    if (safe) {
      const pos = { x: nx, z: nz };
      const blocker = pushOutCircle(pos, info.radius, ground, p.kind === 'duskwolf' ? 0.9 : 1.1);
      p.x = pos.x;
      p.z = pos.z;
      p.y = ground;
      if (blocker && p.state === 'chase' && p.cooldown <= 0) {
        p.cooldown = info.cooldown;
        p.strike = 0;
        ev.onGnaw(blocker, p);
      }
    } else {
      p.heading += Math.PI * (0.6 + Math.random() * 0.4);
    }
    const decay = Math.exp(-dt * 6);
    p.kx *= decay;
    p.kz *= decay;
    p.phase += dt * (speed + 0.6) * (p.kind === 'duskwolf' ? 2.4 : 3);

    if (p.state === 'chase' && dist < info.reach && sameLevel && p.cooldown <= 0) {
      p.cooldown = info.cooldown;
      p.strike = 0;
      ev.onBite(p, { x: dx / (dist || 1), z: dz / (dist || 1) });
    }
  }
}

/** Pickaxe hit; Shardback armour shrugs off one point of damage per swing. Returns drops on kill. */
export function hitPredator(p: Predator, from: Vector3, power: number): Partial<Record<ItemId, number>> | null {
  if (!p.alive || p.state === 'leave') return null;
  const info = PREDATOR_INFO[p.kind];
  p.hp -= Math.max(0.5, power - info.armor * 0.5);
  p.flash = 0.25;
  const dx = p.x - from.x;
  const dz = p.z - from.z;
  const d = Math.hypot(dx, dz) || 1;
  const push = p.kind === 'duskwolf' ? 7 : 2;
  p.kx = (dx / d) * push;
  p.kz = (dz / d) * push;
  p.state = 'chase';
  if (p.hp > 0) return null;
  p.alive = false;
  if (p.kind === 'duskwolf') return { fang: 1 + Math.floor(Math.random() * 2), leather: 1 };
  return Math.random() < 0.35 ? { stone: 6, copper: 2, sunstone: 1 } : { stone: 6, copper: 2 };
}
