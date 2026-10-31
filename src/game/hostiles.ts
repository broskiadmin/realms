import { Vector3 } from 'three';
import { burst, debug } from './fx';
import { getBoxes } from './physics';
import type { ItemId } from './store';
import { terrainAt } from './world';

/**
 * Gloomwisps: night-only flying hunters. Instead of drifting straight at the
 * player they stalk: approach → circle at a distance → wind up (eyes flare,
 * body shudders — the tell) → dive fast through the player's position →
 * pull back and circle again. Only the dive deals damage, so a well-timed
 * swing or sidestep beats them. They collide with build pieces (and gnaw
 * through what blocks them), so a sealed shelter keeps them out.
 */
export type WispMode = 'approach' | 'circle' | 'windup' | 'dash' | 'recover';

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
  mode: WispMode;
  modeT: number;
  orbit: number;
  /** 0..1 wind-up intensity for visuals (eye flare, shudder, glow). */
  charge: number;
  dashDir: Vector3;
}

export const WISP_HP = 3;
const RADIUS = 0.45;
export const WISP_DAMAGE = 8;
const MAX_ALIVE = 3;
const ORBIT_R = 6;
const DASH_SPEED = 13;

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
  mode: 'approach',
  modeT: 0,
  orbit: 0,
  charge: 0,
  dashDir: new Vector3(),
}));

let spawnTimer = 6;
const tmp = new Vector3();
const want = new Vector3();

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
  /** Fired when a wisp starts its dive (for sound). */
  onDive?: (w: Wisp) => void;
}

function setMode(w: Wisp, mode: WispMode, t: number) {
  w.mode = mode;
  w.modeT = t;
}

export function updateWisps(dt: number, playerPos: Vector3, night: boolean, ev: WispEvents) {
  if (debug.freezeHostiles) {
    for (const w of WISPS) if (w.alive) w.phase += dt;
    return;
  }
  const chest = new Vector3(playerPos.x, playerPos.y + 1.1, playerPos.z);
  if (night) {
    spawnTimer -= dt;
    const free = WISPS.find((w) => !w.alive);
    if (spawnTimer <= 0 && free) {
      spawnTimer = 14 + Math.random() * 10;
      const a = Math.random() * Math.PI * 2;
      const r = 22 + Math.random() * 8;
      free.pos.set(playerPos.x + Math.cos(a) * r, playerPos.y + 4 + Math.random() * 4, playerPos.z + Math.sin(a) * r);
      free.vel.set(0, 0, 0);
      free.hp = WISP_HP;
      free.alive = true;
      free.fading = 0;
      free.cooldown = 0;
      free.orbit = a;
      free.charge = 0;
      setMode(free, 'approach', 0);
    }
  }
  for (const w of WISPS) {
    if (!w.alive) continue;
    w.phase += dt;
    w.flash = Math.max(0, w.flash - dt);
    w.cooldown -= dt;
    w.modeT -= dt;
    if (!night && w.fading === 0) w.fading = 0.8;
    if (w.fading > 0) {
      w.fading -= dt;
      w.charge = Math.max(0, w.charge - dt * 3);
      if (w.fading <= 0) {
        w.alive = false;
        burst(w.pos, '#b48cff', 14, 0.8);
      }
      continue;
    }

    const dist = w.pos.distanceTo(chest);
    let accel = 2.5;
    switch (w.mode) {
      case 'approach':
      case 'circle':
      case 'recover': {
        // Orbit a ring around the player, bobbing; the ring tightens while circling.
        w.orbit += dt * (w.mode === 'circle' ? 0.9 : 0.4);
        const r = w.mode === 'recover' ? ORBIT_R + 3 : ORBIT_R;
        want.set(playerPos.x + Math.cos(w.orbit) * r, playerPos.y + 2.6 + Math.sin(w.phase * 1.7) * 0.6, playerPos.z + Math.sin(w.orbit) * r);
        want.sub(w.pos);
        const speed = w.mode === 'approach' ? 4.2 : 3.2;
        want.setLength(Math.min(speed, want.length() * 1.5));
        w.charge = Math.max(0, w.charge - dt * 2);
        if (w.mode === 'approach' && dist < ORBIT_R + 2.5) setMode(w, 'circle', 1.6 + Math.random() * 1.6);
        else if (w.mode === 'circle' && w.modeT <= 0) setMode(w, 'windup', 0.65);
        else if (w.mode === 'recover' && w.modeT <= 0) setMode(w, 'circle', 1.2 + Math.random() * 1.4);
        break;
      }
      case 'windup': {
        // Hover in place and shudder: the tell. Lock the dive direction at the end.
        want.set(0, 0, 0);
        accel = 6;
        w.charge = Math.min(1, w.charge + dt / 0.65);
        if (w.modeT <= 0) {
          w.dashDir.copy(chest).sub(w.pos).normalize();
          setMode(w, 'dash', 0.75);
          ev.onDive?.(w);
        }
        break;
      }
      case 'dash': {
        want.copy(w.dashDir).multiplyScalar(DASH_SPEED);
        accel = 14;
        w.charge = 1;
        if (dist < 1.2 && w.cooldown <= 0) {
          w.cooldown = 1.5;
          ev.onHitPlayer(tmp.copy(w.dashDir).setY(0).normalize().clone());
          setMode(w, 'recover', 1.4);
          w.vel.copy(w.dashDir).multiplyScalar(-4).setY(3);
        } else if (w.modeT <= 0) {
          setMode(w, 'recover', 1.2);
        }
        break;
      }
    }
    w.vel.lerp(want, 1 - Math.exp(-dt * accel));
    w.pos.addScaledVector(w.vel, dt);
    const blocker = collide(w.pos);
    if (blocker && w.cooldown <= 0 && (w.mode === 'dash' || w.mode === 'approach')) {
      // Something is in the way of its prey: gnaw at it.
      w.cooldown = 1.8;
      ev.onHitPiece(blocker, w.pos);
      w.vel.multiplyScalar(-1.5);
      setMode(w, 'recover', 1);
    }
    // Despawn stragglers that lost the player far behind.
    if (dist > 70) w.alive = false;
  }
}

/** Pickaxe hit. Interrupts a wind-up or dive. Returns drops when the wisp is destroyed. */
export function hitWisp(w: Wisp, from: Vector3, power = 1): Partial<Record<ItemId, number>> | null {
  if (!w.alive || w.fading > 0) return null;
  w.hp -= power;
  w.flash = 0.25;
  w.vel.copy(w.pos).sub(from).normalize().multiplyScalar(9);
  w.cooldown = Math.max(w.cooldown, 0.8);
  setMode(w, 'recover', 1.3);
  if (w.hp > 0) return null;
  w.alive = false;
  return { duskshard: 1 + Math.floor(Math.random() * 2) };
}
