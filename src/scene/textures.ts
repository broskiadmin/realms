import * as THREE from 'three';
import { mulberry32 } from '../game/noise';

/**
 * Procedural, tileable textures drawn on canvases at startup — no image assets.
 * Colour maps for build pieces are sRGB; detail maps are greyscale multipliers
 * (linear) that tint the existing vertex/material colours.
 */

type Draw = (g: CanvasRenderingContext2D, s: number, rnd: () => number) => void;

function canvas(size: number, seed: number, draw: Draw): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size, mulberry32(seed));
  return c;
}

/** Draw a shape at all 9 tile offsets so it wraps seamlessly across edges. */
function wrapped(s: number, fn: (ox: number, oy: number) => void) {
  for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) fn(ox, oy);
}

function grey(v: number, a = 1): string {
  const c = Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgba(${c},${c},${c},${a})`;
}

function texture(c: HTMLCanvasElement, srgb: boolean, repeat = 1): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
}

/** Turn a greyscale height canvas into a tangent-space normal map (wraps at edges). */
export function normalMap(height: HTMLCanvasElement, strength: number): THREE.CanvasTexture {
  const w = height.width;
  const hh = height.height;
  const src = height.getContext('2d')!.getImageData(0, 0, w, hh).data;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = hh;
  const og = out.getContext('2d')!;
  const img = og.createImageData(w, hh);
  const h = (x: number, y: number) => src[(((y + hh) % hh) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  og.putImageData(img, 0, 0);
  return texture(out, false);
}

function blur(g: CanvasRenderingContext2D, px: number) {
  // ctx.filter is missing on older Safari; textures still work, just with crisper edges.
  if ('filter' in g) g.filter = px > 0 ? `blur(${px}px)` : 'none';
}

// ---------------------------------------------------------------------------
// Build pieces: colour + height drawn from the same layout.

const P = 512;

function woodLayout(g: CanvasRenderingContext2D, s: number, rnd: () => number, height: boolean) {
  const planks = 4;
  const ph = s / planks;
  const tones = ['#c98b4a', '#d6995a', '#bd7f43', '#cf9253'];
  for (let i = 0; i < planks; i++) {
    const y0 = i * ph;
    g.fillStyle = height ? grey(0.8) : tones[i % tones.length];
    g.fillRect(0, y0, s, ph);
    // Grain: long wavy strokes.
    for (let k = 0; k < 22; k++) {
      const y = y0 + 8 + rnd() * (ph - 16);
      const amp = 2 + rnd() * 4;
      const ph2 = rnd() * 6;
      g.strokeStyle = height ? grey(0.72, 0.6) : `rgba(${110 + rnd() * 30},${60 + rnd() * 20},25,${0.18 + rnd() * 0.22})`;
      g.lineWidth = 1 + rnd() * 2;
      g.beginPath();
      for (let x = 0; x <= s; x += 16) g.lineTo(x, y + Math.sin(x / 70 + ph2) * amp);
      g.stroke();
    }
    // A knot or two.
    for (let k = 0; k < (rnd() < 0.6 ? 1 : 2); k++) {
      const kx = 40 + rnd() * (s - 80);
      const ky = y0 + ph / 2 + (rnd() - 0.5) * ph * 0.4;
      for (let r = 14; r > 2; r -= 3) {
        g.strokeStyle = height ? grey(0.6 + r / 60) : `rgba(95,52,22,${0.5 - r / 40})`;
        g.lineWidth = 2;
        g.beginPath();
        g.ellipse(kx, ky, r * 1.8, r, 0, 0, Math.PI * 2);
        g.stroke();
      }
    }
    // Bevelled plank edges + end seam.
    const bevel = g.createLinearGradient(0, y0, 0, y0 + ph);
    bevel.addColorStop(0, height ? grey(0.35) : 'rgba(255,230,190,0.35)');
    bevel.addColorStop(0.06, 'rgba(0,0,0,0)');
    bevel.addColorStop(0.94, 'rgba(0,0,0,0)');
    bevel.addColorStop(1, height ? grey(0.35) : 'rgba(60,30,10,0.45)');
    g.fillStyle = bevel;
    g.fillRect(0, y0, s, ph);
    g.fillStyle = height ? grey(0.1) : '#5e3518';
    g.fillRect(0, y0, s, 5);
    const seam = Math.floor(60 + rnd() * (s - 120));
    g.fillRect(seam, y0, 5, ph);
    // Nails.
    for (const nx of [14, seam - 14, seam + 19, s - 16]) {
      g.fillStyle = height ? grey(1) : '#6d6f78';
      g.beginPath();
      g.arc(nx, y0 + ph / 2, 5, 0, Math.PI * 2);
      g.fill();
      if (!height) {
        g.fillStyle = '#b8bcc6';
        g.beginPath();
        g.arc(nx - 1.5, y0 + ph / 2 - 1.5, 2, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
}

function stoneLayout(g: CanvasRenderingContext2D, s: number, rnd: () => number, height: boolean) {
  g.fillStyle = height ? grey(0.15) : '#6f727c';
  g.fillRect(0, 0, s, s);
  const rows = 5;
  const rh = s / rows;
  const bw = s / 3;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? bw / 2 : 0;
    for (let c = -1; c < 4; c++) {
      const x = c * bw + off;
      const tone = 0.68 + rnd() * 0.12;
      if (height) {
        blur(g, 3);
        g.fillStyle = grey(0.85 + rnd() * 0.1);
      } else {
        const v = Math.round(tone * 255);
        g.fillStyle = `rgb(${v},${v + 3},${v + 10})`;
      }
      g.beginPath();
      g.roundRect(x + 6, r * rh + 6, bw - 12, rh - 12, 10);
      g.fill();
      blur(g, 0);
      if (!height) {
        // Speckle, top-left highlight, bottom-right shade.
        for (let k = 0; k < 60; k++) {
          g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(40,40,50,0.14)';
          g.fillRect(x + 10 + rnd() * (bw - 20), r * rh + 10 + rnd() * (rh - 20), 2 + rnd() * 3, 2 + rnd() * 3);
        }
        g.fillStyle = 'rgba(255,255,255,0.22)';
        g.fillRect(x + 10, r * rh + 9, bw - 20, 4);
        g.fillStyle = 'rgba(30,30,40,0.25)';
        g.fillRect(x + 10, r * rh + rh - 13, bw - 20, 4);
        // Occasional crack.
        if (rnd() < 0.35) {
          g.strokeStyle = 'rgba(40,40,50,0.45)';
          g.lineWidth = 1.5;
          g.beginPath();
          let cx = x + bw * (0.3 + rnd() * 0.4);
          let cy = r * rh + 12;
          g.moveTo(cx, cy);
          for (let k = 0; k < 4; k++) {
            cx += (rnd() - 0.5) * 22;
            cy += (rh - 24) / 4;
            g.lineTo(cx, cy);
          }
          g.stroke();
        }
      }
    }
  }
}

function copperLayout(g: CanvasRenderingContext2D, s: number, rnd: () => number, height: boolean) {
  const half = s / 2;
  g.fillStyle = height ? grey(0.25) : '#7a3a18';
  g.fillRect(0, 0, s, s);
  for (let i = 0; i < 4; i++) {
    const x = (i % 2) * half;
    const y = Math.floor(i / 2) * half;
    if (height) {
      blur(g, 2);
      g.fillStyle = grey(0.8);
      g.fillRect(x + 8, y + 8, half - 16, half - 16);
      blur(g, 0);
    } else {
      const grad = g.createLinearGradient(x, y, x + half, y + half);
      grad.addColorStop(0, '#ffc08a');
      grad.addColorStop(0.4, ['#e8833f', '#f0954d', '#dc7a3a', '#ee8c46'][i]);
      grad.addColorStop(1, '#a9531f');
      g.fillStyle = grad;
      g.fillRect(x + 8, y + 8, half - 16, half - 16);
      // Brushed streaks.
      for (let k = 0; k < 70; k++) {
        g.fillStyle = rnd() < 0.5 ? 'rgba(255,220,180,0.10)' : 'rgba(120,50,15,0.10)';
        g.fillRect(x + 10, y + 10 + rnd() * (half - 20), half - 20, 1 + rnd() * 1.5);
      }
      // Patina creeping in from the seams.
      for (let k = 0; k < 26; k++) {
        const edge = rnd() < 0.5;
        const px = edge ? x + 10 + rnd() * (half - 20) : x + (rnd() < 0.5 ? 12 : half - 12);
        const py = edge ? y + (rnd() < 0.5 ? 12 : half - 12) : y + 10 + rnd() * (half - 20);
        g.fillStyle = `rgba(70,${170 + rnd() * 40},${150 + rnd() * 30},${0.25 + rnd() * 0.3})`;
        g.beginPath();
        g.arc(px, py, 2 + rnd() * 5, 0, Math.PI * 2);
        g.fill();
      }
    }
    for (const [rx, ry] of [[20, 20], [half - 20, 20], [20, half - 20], [half - 20, half - 20]]) {
      if (height) blur(g, 1.5);
      g.fillStyle = height ? grey(1) : '#ffd6ae';
      g.beginPath();
      g.arc(x + rx, y + ry, 7, 0, Math.PI * 2);
      g.fill();
      blur(g, 0);
      if (!height) {
        g.fillStyle = '#9a4b1e';
        g.beginPath();
        g.arc(x + rx + 2, y + ry + 2, 4, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
}

/** Dark bevelled frame so each piece reads as a distinct panel. */
function frame(g: CanvasRenderingContext2D, s: number, height: boolean, color: string) {
  g.strokeStyle = height ? grey(0.1) : color;
  g.lineWidth = 14;
  g.strokeRect(0, 0, s, s);
  g.strokeStyle = height ? grey(0.45) : 'rgba(255,255,255,0.12)';
  g.lineWidth = 3;
  g.strokeRect(9, 9, s - 18, s - 18);
}

function pieceSet(layout: typeof woodLayout, seed: number, strength: number, frameColor: string) {
  const color = canvas(P, seed, (g, s, r) => {
    layout(g, s, r, false);
    frame(g, s, false, frameColor);
  });
  const height = canvas(P, seed, (g, s, r) => {
    layout(g, s, r, true);
    frame(g, s, true, frameColor);
  });
  return { map: texture(color, true), normalMap: normalMap(height, strength) };
}

export const woodTex = pieceSet(woodLayout, 11, 6, '#5a3216');
export const stoneTex = pieceSet(stoneLayout, 12, 5, '#4e5059');
export const copperTex = pieceSet(copperLayout, 13, 5, '#5e2b10');

// ---------------------------------------------------------------------------
// Detail multipliers for terrain and props.

export const grassDetail = texture(
  canvas(256, 21, (g, s, rnd) => {
    g.fillStyle = grey(0.86);
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 90; i++) {
      const x = rnd() * s;
      const y = rnd() * s;
      const r = 10 + rnd() * 26;
      const v = 0.8 + rnd() * 0.15;
      wrapped(s, (ox, oy) => {
        g.fillStyle = grey(v, 0.35);
        g.beginPath();
        g.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        g.fill();
      });
    }
    for (let i = 0; i < 1400; i++) {
      const x = rnd() * s;
      const y = rnd() * s;
      const len = 4 + rnd() * 7;
      const ang = -Math.PI / 2 + (rnd() - 0.5) * 0.9;
      const v = 0.7 + rnd() * 0.3;
      const lw = 1 + rnd();
      wrapped(s, (ox, oy) => {
        g.strokeStyle = grey(v, 0.8);
        g.lineWidth = lw;
        g.beginPath();
        g.moveTo(x + ox, y + oy);
        g.lineTo(x + ox + Math.cos(ang) * len, y + oy + Math.sin(ang) * len);
        g.stroke();
      });
    }
  }),
  false,
);

export const rockDetail = texture(
  canvas(256, 22, (g, s, rnd) => {
    g.fillStyle = grey(0.85);
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 160; i++) {
      const x = rnd() * s;
      const y = rnd() * s;
      const r = 4 + rnd() * 22;
      const v = 0.7 + rnd() * 0.3;
      const rot = rnd() * 0.3;
      wrapped(s, (ox, oy) => {
        g.fillStyle = grey(v, 0.4);
        g.beginPath();
        g.ellipse(x + ox, y + oy, r * 1.6, r, rot, 0, Math.PI * 2);
        g.fill();
      });
    }
    for (let i = 0; i < 18; i++) {
      let x = rnd() * s;
      let y = rnd() * s;
      const pts: [number, number][] = [[x, y]];
      for (let k = 0; k < 6; k++) {
        x += (rnd() - 0.3) * 24;
        y += (rnd() - 0.5) * 14;
        pts.push([x, y]);
      }
      wrapped(s, (ox, oy) => {
        g.strokeStyle = grey(0.55, 0.55);
        g.lineWidth = 1.2;
        g.beginPath();
        pts.forEach(([px, py], k) => (k ? g.lineTo(px + ox, py + oy) : g.moveTo(px + ox, py + oy)));
        g.stroke();
      });
    }
  }),
  false,
);

export const leafDetail = texture(
  canvas(256, 23, (g, s, rnd) => {
    g.fillStyle = grey(0.7);
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 420; i++) {
      const x = rnd() * s;
      const y = rnd() * s;
      const rot = rnd() * Math.PI;
      const v = 0.72 + rnd() * 0.28;
      wrapped(s, (ox, oy) => {
        g.save();
        g.translate(x + ox, y + oy);
        g.rotate(rot);
        g.fillStyle = grey(v);
        g.beginPath();
        g.ellipse(0, 0, 11, 5, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = grey(v - 0.15, 0.6);
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(-9, 0);
        g.lineTo(9, 0);
        g.stroke();
        g.restore();
      });
    }
  }),
  false,
  2,
);

export const barkDetail = texture(
  canvas(256, 24, (g, s, rnd) => {
    g.fillStyle = grey(0.85);
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 70; i++) {
      const x = rnd() * s;
      const v = 0.55 + rnd() * 0.3;
      const w = 2 + rnd() * 5;
      const ph = rnd() * 6;
      wrapped(s, (ox) => {
        g.strokeStyle = grey(v, 0.7);
        g.lineWidth = w;
        g.beginPath();
        for (let y = -8; y <= s + 8; y += 8) g.lineTo(x + ox + Math.sin(y / 30 + ph) * 4, y);
        g.stroke();
      });
    }
  }),
  false,
  2,
);
