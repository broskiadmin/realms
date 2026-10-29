import type { Vector3 } from 'three';
import type { ItemId } from './store';
import { edgeT, islandHeight, ISLANDS, randomSpot, type MobType } from './world';

export interface Mob {
  id: number;
  type: MobType;
  island: number;
  x: number;
  y: number;
  z: number;
  /** Facing angle; 0 faces +z. */
  heading: number;
  state: 'idle' | 'walk' | 'flee';
  timer: number;
  hp: number;
  /** Seconds of red hit-flash remaining. */
  flash: number;
  dead: boolean;
  respawnAt: number;
  kx: number;
  kz: number;
  hop: number;
  vy: number;
  phase: number;
}

export const MOB_INFO: Record<MobType, { name: string; hp: number; speed: number; drops: Partial<Record<ItemId, number>> }> = {
  cow: { name: 'Cow', hp: 4, speed: 1.2, drops: { meat: 2, leather: 1 } },
  pig: { name: 'Pig', hp: 3, speed: 1.4, drops: { meat: 2 } },
  chicken: { name: 'Chicken', hp: 2, speed: 1.7, drops: { feather: 2, egg: 1 } },
};

const RESPAWN_MS = 40_000;

export const MOBS: Mob[] = [];

function placeMob(m: Mob) {
  const isl = ISLANDS[m.island];
  const p = randomSpot(isl, Math.random, 0.7);
  m.x = p.x;
  m.z = p.z;
  m.y = islandHeight(isl, p.x, p.z) ?? isl.baseY;
  m.heading = Math.random() * Math.PI * 2;
  m.hp = MOB_INFO[m.type].hp;
  m.dead = false;
  m.state = 'idle';
  m.timer = Math.random() * 3;
}

(function init() {
  let id = 0;
  for (const isl of ISLANDS) {
    for (const [type, count] of Object.entries(isl.mobs) as [MobType, number][]) {
      for (let i = 0; i < count; i++) {
        const m: Mob = {
          id: id++, type, island: isl.id, x: 0, y: 0, z: 0, heading: 0, state: 'idle', timer: 0, hp: 1,
          flash: 0, dead: false, respawnAt: 0, kx: 0, kz: 0, hop: 0, vy: 0, phase: Math.random() * 10,
        };
        placeMob(m);
        MOBS.push(m);
      }
    }
  }
})();

export function updateMobs(dt: number, now: number, player: Vector3) {
  for (const m of MOBS) {
    if (m.dead) {
      if (now >= m.respawnAt) placeMob(m);
      continue;
    }
    const info = MOB_INFO[m.type];
    m.timer -= dt;
    m.flash = Math.max(0, m.flash - dt);
    if (m.timer <= 0) {
      if (m.state === 'walk' || m.state === 'flee') {
        m.state = 'idle';
        m.timer = 1 + Math.random() * 3;
      } else {
        m.state = 'walk';
        m.heading += (Math.random() - 0.5) * 2.4;
        m.timer = 2 + Math.random() * 3;
      }
    }
    if (m.state === 'flee') {
      const away = Math.atan2(m.x - player.x, m.z - player.z);
      m.heading += (((away - m.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 5);
    }
    const speed = m.state === 'walk' ? info.speed : m.state === 'flee' ? info.speed * 2.6 : 0;
    const isl = ISLANDS[m.island];
    if (speed > 0 || Math.abs(m.kx) + Math.abs(m.kz) > 0.01) {
      const nx = m.x + (Math.sin(m.heading) * speed + m.kx) * dt;
      const nz = m.z + (Math.cos(m.heading) * speed + m.kz) * dt;
      if (edgeT(isl, nx, nz) < 0.86) {
        m.x = nx;
        m.z = nz;
      } else {
        // Turn back toward the island centre instead of walking off the edge.
        m.heading = Math.atan2(isl.cx - m.x, isl.cz - m.z) + (Math.random() - 0.5);
        m.kx = 0;
        m.kz = 0;
      }
      m.phase += dt * (speed + 1) * 3.2;
    }
    const decay = Math.exp(-dt * 6);
    m.kx *= decay;
    m.kz *= decay;
    const ground = islandHeight(isl, m.x, m.z) ?? m.y;
    m.vy -= 22 * dt;
    m.hop = Math.max(0, m.hop + m.vy * dt);
    if (m.hop === 0) {
      m.vy = 0;
      // Chickens hop now and then for a bit of life.
      if (m.type === 'chicken' && m.state !== 'idle' && Math.random() < dt * 0.8) m.vy = 4;
    }
    m.y = ground;
  }
}

/** Apply a pickaxe hit. Returns the drops if the mob was defeated. */
export function hitMob(m: Mob, from: Vector3, power = 1): Partial<Record<ItemId, number>> | null {
  if (m.dead) return null;
  m.hp -= power;
  m.flash = 0.25;
  const dx = m.x - from.x;
  const dz = m.z - from.z;
  const d = Math.hypot(dx, dz) || 1;
  m.kx = (dx / d) * 6;
  m.kz = (dz / d) * 6;
  m.vy = 5;
  m.state = 'flee';
  m.timer = 3;
  if (m.hp <= 0) {
    m.dead = true;
    m.respawnAt = performance.now() + RESPAWN_MS;
    return MOB_INFO[m.type].drops;
  }
  return null;
}
