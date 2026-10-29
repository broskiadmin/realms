import { Vector3 } from 'three';
import type { Placement } from './pieces';

/**
 * Per-frame mutable state shared between scene components.
 * Kept outside React/zustand so 60fps updates never trigger re-renders.
 */
export const player = {
  pos: new Vector3(0, 5, 4),
  vel: new Vector3(),
  onGround: false,
  speed: 0,
  /** Camera yaw in radians (0 looks toward -z). */
  yaw: 0,
};

export const swing = { t: -1 };

/** True on phones/tablets: no pointer lock, on-screen controls instead. */
export const IS_TOUCH =
  typeof window !== 'undefined' && (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window);

/** On-screen control state written by the touch UI and read by the player/interaction loops. */
export const touchInput = {
  /** Joystick vector, x = strafe right, y = forward, each in [-1, 1]. */
  moveX: 0,
  moveY: 0,
  /** Accumulated look-drag pixels, consumed (and zeroed) each frame. */
  lookDX: 0,
  lookDY: 0,
  jump: false,
  action: false,
};

/** Seconds per full day/night cycle. */
export const DAY_LENGTH = 600;
/** World clock: `total` seconds since the world began (persisted via the store). */
export const clock = { total: 0 };
/** 0 = sunrise, 0.25 = noon, 0.5 = sunset, 0.75 = midnight. */
export function dayPhase(total = clock.total): number {
  return (total / DAY_LENGTH + 0.04) % 1;
}
export function dayNumber(total = clock.total): number {
  return Math.floor(total / DAY_LENGTH + 0.04) + 1;
}
export function isNight(total = clock.total): boolean {
  const p = dayPhase(total);
  return p > 0.52 && p < 0.98;
}

export const ghost: { placement: Placement | null; valid: boolean } = { placement: null, valid: false };

/** node/piece id → performance.now() of the last hit, used for wobble animations. */
export const hitTimes = new Map<string, number>();

/** Hits taken so far by nodes and pieces (not persisted; resets on reload). */
export const damage = new Map<string, number>();

/** Gloomwisp strikes absorbed per build piece, compared against MAT_INFO toughness. */
export const wear = new Map<string, number>();

type BurstFn = (pos: Vector3, color: string, count: number, power?: number) => void;
let burstImpl: BurstFn = () => {};
export function registerBurst(fn: BurstFn) {
  burstImpl = fn;
}
export function burst(pos: Vector3, color: string, count: number, power = 1) {
  burstImpl(pos, color, count, power);
}
