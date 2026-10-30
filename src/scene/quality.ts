import * as THREE from 'three';
import { IS_TOUCH } from '../game/fx';

/**
 * Graphics presets.
 * - low:       no post-processing, 1x resolution (phones default here).
 * - high:      the stylised cartoon look with bloom.
 * - realistic: physically based materials, atmospheric sky, image-based lighting,
 *              volumetric clouds, ambient occlusion and soft 4K shadows. Heavy.
 *
 * Realistic swaps every material at load time, so changing into or out of it reloads the page.
 */
export type Quality = 'low' | 'high' | 'realistic';

const KEY = 'realms-quality';

function read(): Quality {
  const v = localStorage.getItem(KEY);
  return v === 'low' || v === 'high' || v === 'realistic' ? v : IS_TOUCH ? 'low' : 'high';
}

export const INITIAL_QUALITY: Quality = read();
export const REALISTIC = INITIAL_QUALITY === 'realistic';

export function saveQuality(q: Quality) {
  localStorage.setItem(KEY, q);
  if ((q === 'realistic') !== REALISTIC) window.location.reload();
}

const hsl = { h: 0, s: 0, l: 0 };

/** Pull the saturated cartoon palette toward natural, real-world tones (no-op unless realistic). */
export function natural(c: THREE.Color): THREE.Color {
  if (!REALISTIC) return c;
  c.getHSL(hsl);
  // Greens drift slightly toward olive and keep their brightness (dark grass read as dead);
  // everything loses the candy saturation.
  const greenish = hsl.h > 0.18 && hsl.h < 0.45;
  c.setHSL(greenish ? hsl.h * 0.92 + 0.02 : hsl.h, hsl.s * (greenish ? 0.65 : 0.55), hsl.l * (greenish ? 0.97 : 0.82));
  return c;
}
