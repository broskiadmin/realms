import { createNoise3D } from 'simplex-noise';
import * as THREE from 'three';
import { mulberry32 } from '../game/noise';
import { normalMap } from './textures';

/**
 * Procedural hides for the animals, laid out for sphere UVs (u wraps around the
 * body, v runs along it). Patterns sample 3D noise on a cylinder so the u seam is invisible.
 */

const W = 512;
const H = 256;
const noise3 = createNoise3D(mulberry32(777));

function fbm3(x: number, y: number, z: number, oct: number): number {
  let a = 1;
  let f = 1;
  let s = 0;
  let n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * noise3(x * f, y * f, z * f);
    n += a;
    a *= 0.5;
    f *= 2.1;
  }
  return s / n;
}

/** Fill a canvas pixel-by-pixel from a colour function of seamless cylinder coordinates. */
function paint(fn: (cx: number, cy: number, cz: number, u: number, v: number) => [number, number, number]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const v = y / H;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const a = u * Math.PI * 2;
      const [r, gg, b] = fn(Math.cos(a), v * 3.2, Math.sin(a), u, v);
      const i = (y * W + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = gg;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

function tex(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Fine directional fur/feather bump, shared by every animal. */
const furHeight = paint((cx, cy, cz) => {
  const n = 0.5 + 0.5 * fbm3(cx * 9, cy * 26, cz * 9, 3);
  const v = Math.round(n * 255);
  return [v, v, v];
});
export const furNormal = normalMap(furHeight, 2.2);

/** Holstein-style black patches on off-white, with soft fur shading. */
export const cowHide = tex(
  paint((cx, cy, cz) => {
    const patch = fbm3(cx * 1.4 + 3, cy * 1.6, cz * 1.4, 4);
    const fur = 0.92 + 0.08 * fbm3(cx * 12, cy * 30, cz * 12, 2);
    const edge = THREE.MathUtils.smoothstep(patch, 0.12, 0.2);
    const r = THREE.MathUtils.lerp(240, 32, edge) * fur;
    const g = THREE.MathUtils.lerp(236, 29, edge) * fur;
    const b = THREE.MathUtils.lerp(226, 31, edge) * fur;
    return [r, g, b];
  }),
);

/** Pink skin with blotchy mottling and a little dirt. */
export const pigSkin = tex(
  paint((cx, cy, cz, _u, v) => {
    const mottle = 0.5 + 0.5 * fbm3(cx * 3, cy * 4, cz * 3, 4);
    const dirt = THREE.MathUtils.smoothstep(fbm3(cx * 2 + 9, cy * 2.5, cz * 2, 3), 0.25, 0.55) * (0.4 + 0.6 * v);
    const r = (226 + mottle * 22) * (1 - dirt * 0.35);
    const g = (160 + mottle * 20) * (1 - dirt * 0.42);
    const b = (152 + mottle * 18) * (1 - dirt * 0.5);
    return [r, g, b];
  }),
);

/** Layered white feathers: scalloped rows with soft grey edges. */
export const featherCoat = tex(
  paint((cx, cy, cz, u, v) => {
    const row = (v * 22) % 1;
    const col = (u * 40 + Math.floor(v * 22) * 0.5) % 1;
    const scallop = Math.sqrt((col - 0.5) ** 2 * 1.6 + row * row);
    const edge = THREE.MathUtils.smoothstep(scallop, 0.42, 0.55);
    const tint = 0.95 + 0.05 * fbm3(cx * 6, cy * 10, cz * 6, 2);
    const base = 246 * tint - edge * 34;
    return [base, base - 3, base - 10];
  }),
);
