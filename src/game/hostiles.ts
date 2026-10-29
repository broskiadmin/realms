import { Vector3 } from 'three';
import { burst } from './fx';
import { getBoxes } from './physics';
import type { ItemId } from './store';
import { terrainAt } from './world';

/**
 * Gloomwisps: night-only flying creatures. They drift straight at the player
 * and collide with build pieces, so a sealed shelter keeps them out.
 */
export interface Wisp {
  id: number;
  pos: Vector3;
  vel: Vector3;
  hp: number;
  alive: boolean;
  /** Seconds left in the fade-out when dawn breaks (0 = not fading). */
  fading: number;
  flash: number;
  cooldown: number;
  phase: number;
}

export const WISP_HP = 3;
const RADIUS = 0.45;
const SPEED = 2.4;
export const WISP_DAMAGE = 7;
const MAX_ALIVE = 3;
const ATTACK_COOLDOWN = 2.2;

export const WISPS: Wisp[] = Array.from({ length: MAX_ALIVE }, (_, id) => ({
  id,
  pos: new Vector3(0, -999, 0),
  vel: new Vector3(),
  hp: WISP_HP,
  alive: false,
  fading: 0,
  flash: 0,
  cooldown: 0,
  phase: Math.random() * 10,
}));

let spawnTimer = 4;
const tmp = new Vector3();

/** Push the wisp out of pieces and terrain; returns the id of a piece it bumped into, if any. */
function collide(p: Vector3): string | null {
  let blocker: string | null = null;
  for (const b of getBoxes()) {
    const cx = Math.max(b.minX, Math.min(p.x, b.maxX));
    const cy = Math.max(b.minY, Math.min(p.y, b.maxY));
    const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
    tmp.set(p.x - cx, p.y - cy, p.z - cz);
    const d2 = tmp.lengthSq();
    if (d2 >= RADIUS * RADIUS) continue;
    blocker = b.id ?? blocker;
    if (d2 > 1e-8) {
      p.addScaledVector(tmp, RADIUS / Math.sqrt(d2) - 1);
    } else {
      // Centre inside a slab: pop out upward rather than tunnelling through.
      p.y = b.maxY + RADIUS;
    }
  }
  const t = terrainAt(p.x, p.z);
  if (t && p.y < t.h + 0.7 && p.y > t.h - 4) p.y = t.h + 0.7;
  return blocker;
}

export interface WispEvents {
  onHitPlayer: (dir: Vector3) => void;
  /** A wisp blocked by a build piece strikes it instead. */
  onHitPiece: (pieceId: string, at: Vector3) => void;
}

export function updateWisps(dt: number, playerPos: Vector3, night: boolean, ev: WispEvents) {
  const chest = tmp.set(playerPos.x, playerPos.y + 1.1, playerPos.z).clone();
  if (night) {
    spawnTimer -= dt;
    const free = WISPS.find((w) => !w.alive);
    if (spawnTimer <= 0 && free) {
      spawnTimer = 14 + Math.random() * 10;
      const a = Math.random() * Math.PI * 2;
      const r = 20 + Math.random() * 8;
      free.pos.set(playerPos.x + Math.cos(a) * r, playerPos.y + 3 + Math.random() * 4, playerPos.z + Math.sin(a) * r);
      free.vel.set(0, 0, 0);
      free.hp = WISP_HP;
      free.alive = true;
      free.fading = 0;
      free.cooldown = 1;
    }
  }
  for (const w of WISPS) {
    if (!w.alive) continue;
    w.phase += dt;
    w.flash = Math.max(0, w.flash - dt);
    w.cooldown -= dt;
    if (!night && w.fading === 0) w.fading = 0.8;
    if (w.fading > 0) {
      w.fading -= dt;
      if (w.fading <= 0) {
        w.alive = false;
        burst(w.pos, '#b48cff', 14, 0.8);
      }
      continue;
    }
    const toPlayer = chest.clone().sub(w.pos);
    const dist = toPlayer.length();
    const desired = toPlayer.normalize().multiplyScalar(SPEED);
    desired.y += Math.sin(w.phase * 2.3) * 0.8;
    w.vel.lerp(desired, 1 - Math.exp(-dt * 2.5));
    w.pos.addScaledVector(w.vel, dt);
    const blocker = collide(w.pos);
    if (dist < 1.1 && w.cooldown <= 0) {
      w.cooldown = ATTACK_COOLDOWN;
      const dir = chest.clone().sub(w.pos).setY(0).normalize();
      ev.onHitPlayer(dir);
      w.vel.copy(dir).multiplyScalar(-6);
    } else if (blocker && dist < 12 && w.cooldown <= 0) {
      // Something is in the way of its prey: gnaw at it.
      w.cooldown = ATTACK_COOLDOWN;
      ev.onHitPiece(blocker, w.pos);
      w.vel.multiplyScalar(-1.5);
    }
    // Despawn stragglers that lost the player far behind.
    if (dist > 70) w.alive = false;
  }
}

/** Pickaxe hit. Returns drops when the wisp is destroyed. */
export function hitWisp(w: Wisp, from: Vector3, power = 1): Partial<Record<ItemId, number>> | null {
  if (!w.alive || w.fading > 0) return null;
  w.hp -= power;
  w.flash = 0.25;
  w.vel.copy(w.pos).sub(from).normalize().multiplyScalar(9);
  w.cooldown = Math.max(w.cooldown, 0.6);
  if (w.hp > 0) return null;
  w.alive = false;
  return { duskshard: 1 + Math.floor(Math.random() * 2) };
}
