import * as THREE from 'three';
import { edgeTable as ET, triTable as TT } from 'three/examples/jsm/objects/MarchingCubes.js';

// At runtime these are flat Int32Arrays (256 edge masks; 256 rows × 16 triangle indices);
// @types/three declares them as nested arrays.
const edgeTable = ET as unknown as Int32Array;
const triTable = TT as unknown as Int32Array;

/**
 * Tiny signed-distance sculpting kit: describe a shape as smoothly blended
 * primitives, then extract one seamless mesh with marching cubes. Used for the
 * realistic animals so bodies read as a single organic surface, not glued parts.
 */

export type SDF = (x: number, y: number, z: number) => number;

/** Polynomial smooth minimum: blends two surfaces with a fillet of size k. */
export function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export function unionAll(parts: SDF[], k: number): SDF {
  return (x, y, z) => {
    let d = parts[0](x, y, z);
    for (let i = 1; i < parts.length; i++) d = smin(d, parts[i](x, y, z), k);
    return d;
  };
}

/** Approximate ellipsoid distance (iq). */
export function ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number): SDF {
  return (x, y, z) => {
    const px = (x - cx) / rx;
    const py = (y - cy) / ry;
    const pz = (z - cz) / rz;
    const k0 = Math.hypot(px, py, pz);
    const k1 = Math.hypot(px / rx, py / ry, pz / rz);
    return k1 === 0 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
  };
}

/** Capsule whose radius tapers from r1 at a to r2 at b (iq's round cone). */
export function roundCone(a: [number, number, number], b: [number, number, number], r1: number, r2: number): SDF {
  const bax = b[0] - a[0];
  const bay = b[1] - a[1];
  const baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  return (x, y, z) => {
    const pax = x - a[0];
    const pay = y - a[1];
    const paz = z - a[2];
    const yy = pax * bax + pay * bay + paz * baz;
    const zz = yy - l2;
    const cx = pax * l2 - bax * yy;
    const cy = pay * l2 - bay * yy;
    const cz = paz * l2 - baz * yy;
    const x2 = cx * cx + cy * cy + cz * cz;
    const y2 = yy * yy * l2;
    const z2 = zz * zz * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
  };
}

/** Mirror an SDF across x = 0 (bilateral symmetry for paired limbs, ears, shoulders). */
export function mirrorX(f: SDF): SDF {
  return (x, y, z) => f(Math.abs(x), y, z);
}

/**
 * Marching cubes over [min, max] at `res` cells along the longest axis.
 * Normals come from the SDF gradient so the surface shades perfectly smooth.
 */
export function polygonize(sdf: SDF, min: THREE.Vector3, max: THREE.Vector3, res: number): THREE.BufferGeometry {
  const size = new THREE.Vector3().subVectors(max, min);
  const step = Math.max(size.x, size.y, size.z) / res;
  const nx = Math.ceil(size.x / step) + 1;
  const ny = Math.ceil(size.y / step) + 1;
  const nz = Math.ceil(size.z / step) + 1;
  const field = new Float32Array(nx * ny * nz);
  const at = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) field[at(i, j, k)] = sdf(min.x + i * step, min.y + j * step, min.z + k * step);

  const pos: number[] = [];
  const nor: number[] = [];
  const corner = [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
  ];
  const edges = [
    [0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const vals = new Float32Array(8);
  const vert = new Float32Array(36);
  const e = step * 0.5;
  const grad = (x: number, y: number, z: number) => {
    const gx = sdf(x + e, y, z) - sdf(x - e, y, z);
    const gy = sdf(x, y + e, z) - sdf(x, y - e, z);
    const gz = sdf(x, y, z + e) - sdf(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    return [gx / l, gy / l, gz / l];
  };

  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let cube = 0;
        for (let c = 0; c < 8; c++) {
          vals[c] = field[at(i + corner[c][0], j + corner[c][1], k + corner[c][2])];
          // Same convention as three's MarchingCubes: bit set when the corner is outside.
          if (vals[c] > 0) cube |= 1 << c;
        }
        const em = edgeTable[cube];
        if (em === 0) continue;
        for (let ed = 0; ed < 12; ed++) {
          if (!(em & (1 << ed))) continue;
          const [a, b] = edges[ed];
          const t = vals[a] / (vals[a] - vals[b]);
          vert[ed * 3] = min.x + (i + corner[a][0] + (corner[b][0] - corner[a][0]) * t) * step;
          vert[ed * 3 + 1] = min.y + (j + corner[a][1] + (corner[b][1] - corner[a][1]) * t) * step;
          vert[ed * 3 + 2] = min.z + (k + corner[a][2] + (corner[b][2] - corner[a][2]) * t) * step;
        }
        const row = cube * 16;
        for (let t = 0; triTable[row + t] !== -1; t += 3) {
          const p = [0, 1, 2].map((v) => {
            const ed = triTable[row + t + v];
            return [vert[ed * 3], vert[ed * 3 + 1], vert[ed * 3 + 2]];
          });
          const n = p.map(([x, y, z]) => grad(x, y, z));
          // Orient each triangle so its winding agrees with the outward SDF gradient.
          const ux = p[1][0] - p[0][0], uy = p[1][1] - p[0][1], uz = p[1][2] - p[0][2];
          const vx = p[2][0] - p[0][0], vy = p[2][1] - p[0][1], vz = p[2][2] - p[0][2];
          const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
          const order = fx * (n[0][0] + n[1][0] + n[2][0]) + fy * (n[0][1] + n[1][1] + n[2][1]) + fz * (n[0][2] + n[1][2] + n[2][2]) < 0 ? [0, 2, 1] : [0, 1, 2];
          for (const v of order) {
            pos.push(p[v][0], p[v][1], p[v][2]);
            nor.push(n[v][0], n[v][1], n[v][2]);
          }
        }
      }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.computeBoundingSphere();
  return g;
}
