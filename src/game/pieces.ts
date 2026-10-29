import { Vector3 } from 'three';
import { CELL, LEVEL } from './world';
import type { Piece, PieceType } from './store';

export const SLAB = 0.25;
export const RAMP_ANGLE = Math.atan2(LEVEL, CELL);
export const RAMP_LEN = Math.hypot(LEVEL, CELL);

export interface Box {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  /** Id of the build piece this box belongs to. */
  id?: string;
}

export interface PieceTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  size: [number, number, number];
}

export function pieceTransform(p: Pick<Piece, 'type' | 'ix' | 'iy' | 'iz' | 'rot'>): PieceTransform {
  const x0 = p.ix * CELL;
  const z0 = p.iz * CELL;
  const y0 = p.iy * LEVEL;
  if (p.type === 'floor') {
    return { position: [x0 + CELL / 2, y0 - SLAB / 2, z0 + CELL / 2], rotation: [0, 0, 0], size: [CELL, SLAB, CELL] };
  }
  if (p.type === 'wall') {
    return p.rot === 0
      ? { position: [x0 + CELL / 2, y0 + LEVEL / 2, z0], rotation: [0, 0, 0], size: [CELL, LEVEL, SLAB] }
      : { position: [x0, y0 + LEVEL / 2, z0 + CELL / 2], rotation: [0, 0, 0], size: [SLAB, LEVEL, CELL] };
  }
  // Ramp: the slab's top face runs along the diagonal of the cell.
  const drop = SLAB / 2 / Math.cos(RAMP_ANGLE);
  const pos: [number, number, number] = [x0 + CELL / 2, y0 + LEVEL / 2 - drop, z0 + CELL / 2];
  switch (p.rot % 4) {
    case 0: return { position: pos, rotation: [0, 0, RAMP_ANGLE], size: [RAMP_LEN, SLAB, CELL] };
    case 1: return { position: pos, rotation: [-RAMP_ANGLE, 0, 0], size: [CELL, SLAB, RAMP_LEN] };
    case 2: return { position: pos, rotation: [0, 0, -RAMP_ANGLE], size: [RAMP_LEN, SLAB, CELL] };
    default: return { position: pos, rotation: [RAMP_ANGLE, 0, 0], size: [CELL, SLAB, RAMP_LEN] };
  }
}

/** Axis-aligned collision box for floors and walls (ramps use rampHeight). */
export function pieceBox(p: Piece): Box | null {
  if (p.type === 'ramp') return null;
  const t = pieceTransform(p);
  const [cx, cy, cz] = t.position;
  const [w, h, d] = t.size;
  return { minX: cx - w / 2, maxX: cx + w / 2, minY: cy - h / 2, maxY: cy + h / 2, minZ: cz - d / 2, maxZ: cz + d / 2, id: p.id };
}

/** Walking surface height of a ramp at (x, z), or null outside its cell. */
export function rampHeight(p: Piece, x: number, z: number): number | null {
  const lx = x / CELL - p.ix;
  const lz = z / CELL - p.iz;
  if (lx < 0 || lx > 1 || lz < 0 || lz > 1) return null;
  const u = [lx, lz, 1 - lx, 1 - lz][p.rot % 4];
  return p.iy * LEVEL + u * LEVEL;
}

export interface Placement {
  type: PieceType;
  ix: number;
  iy: number;
  iz: number;
  rot: number;
}

/**
 * Snap the player's aim to a grid slot for the given piece type.
 * `hitPoint` is where the crosshair ray hit the world (or null if it hit nothing in reach).
 */
export function computePlacement(
  type: PieceType,
  hitPoint: Vector3 | null,
  origin: Vector3,
  dir: Vector3,
  rampRot: number,
): Placement {
  const hz = Math.hypot(dir.x, dir.z);
  const fx = hz > 1e-4 ? dir.x / hz : 0;
  const fz = hz > 1e-4 ? dir.z / hz : 1;
  let p: Vector3;
  if (hitPoint) {
    p = hitPoint;
  } else {
    // Nothing hit: aim at a point roughly one cell ahead so bridges extend naturally.
    const d = Math.min(6, 2.6 / Math.max(0.25, hz));
    p = origin.clone().addScaledVector(dir, d);
  }
  const py = p.y + 0.05;

  if (type === 'floor') {
    return {
      type,
      ix: Math.floor((p.x + fx * 0.3) / CELL),
      iz: Math.floor((p.z + fz * 0.3) / CELL),
      iy: Math.round(py / LEVEL),
      rot: 0,
    };
  }
  if (type === 'wall') {
    const iy = Math.floor(py / LEVEL);
    if (Math.abs(fx) > Math.abs(fz)) {
      return { type, ix: Math.round((p.x + fx * 0.4) / CELL), iz: Math.floor(p.z / CELL), iy, rot: 1 };
    }
    return { type, ix: Math.floor(p.x / CELL), iz: Math.round((p.z + fz * 0.4) / CELL), iy, rot: 0 };
  }
  const face = Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 0 : 2) : fz > 0 ? 1 : 3;
  return {
    type,
    ix: Math.floor((p.x + fx * 0.6) / CELL),
    iz: Math.floor((p.z + fz * 0.6) / CELL),
    iy: Math.floor(py / LEVEL),
    rot: (face + rampRot) % 4,
  };
}
