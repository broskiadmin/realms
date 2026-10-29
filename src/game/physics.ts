import type { Vector3 } from 'three';
import { pieceBox, rampHeight, type Box } from './pieces';
import { useGame, type Bench, type Piece, type Trader } from './store';
import { ISLANDS, NODES, NPC_SPOTS, islandHeight, terrainAt } from './world';

export const PLAYER_R = 0.35;
export const PLAYER_H = 1.75;
export const EYE = 1.6;
export const STEP = 0.75;

interface Circle {
  x: number;
  z: number;
  r: number;
  minY: number;
  maxY: number;
}

// Collision shapes are rebuilt only when the underlying store arrays change.
let cachedPieces: Piece[] | null = null;
let boxes: Box[] = [];
let ramps: Piece[] = [];
let cachedDepleted: Record<string, number> | null = null;
let nodeCircles: Circle[] = [];
let cachedBenches: Bench[] | null = null;
let cachedTrader: Trader | null | undefined;
let circles: Circle[] = [];

/** Villagers never move, so their collision circles are computed once. */
const npcCircles: Circle[] = NPC_SPOTS.map((s) => {
  const y = islandHeight(ISLANDS[s.island], s.x, s.z) ?? ISLANDS[s.island].baseY;
  return { x: s.x, z: s.z, r: 0.5, minY: y - 0.5, maxY: y + 2.2 };
});

function refresh() {
  const { pieces, depleted, benches, trader } = useGame.getState();
  if (pieces !== cachedPieces) {
    cachedPieces = pieces;
    boxes = pieces.map(pieceBox).filter((b): b is Box => b !== null);
    ramps = pieces.filter((p) => p.type === 'ramp');
  }
  if (depleted !== cachedDepleted || benches !== cachedBenches || trader !== cachedTrader) {
    if (depleted !== cachedDepleted) {
      nodeCircles = NODES.filter((n) => !(n.id in depleted)).map((n) =>
        n.kind === 'tree'
          ? { x: n.x, z: n.z, r: 0.4 * n.scale, minY: n.y - 1, maxY: n.y + 6 * n.scale }
          : { x: n.x, z: n.z, r: 0.85 * n.scale, minY: n.y - 1, maxY: n.y + 1.3 * n.scale },
      );
    }
    cachedDepleted = depleted;
    cachedBenches = benches;
    cachedTrader = trader;
    circles = [
      ...nodeCircles,
      ...npcCircles,
      ...benches.map((b) => ({ x: b.x, z: b.z, r: 0.75, minY: b.y - 0.5, maxY: b.y + 1.05 })),
      ...(trader ? [{ x: trader.x, z: trader.z, r: 1.4, minY: trader.y - 0.5, maxY: trader.y + 3 }] : []),
    ];
  }
}

/** Highest walkable surface under (x, z) that is no more than STEP above the feet. */
export function supportHeight(x: number, z: number, feetY: number): number {
  refresh();
  let best = -Infinity;
  const reach = feetY + STEP;
  const t = terrainAt(x, z);
  if (t && t.h <= reach) best = t.h;
  const m = PLAYER_R * 0.6;
  for (const b of boxes) {
    if (b.maxY > reach || b.maxY <= best) continue;
    if (x >= b.minX - m && x <= b.maxX + m && z >= b.minZ - m && z <= b.maxZ + m) best = b.maxY;
  }
  for (const r of ramps) {
    const h = rampHeight(r, x, z);
    if (h !== null && h <= reach && h > best) best = h;
  }
  return best;
}

/** Current floor/wall collision boxes (flying creatures collide against these too). */
export function getBoxes(): Box[] {
  refresh();
  return boxes;
}

/** Push the player's xz position out of walls, floor edges, trees and rocks. */
export function resolveHorizontal(pos: Vector3, feetY: number) {
  refresh();
  const head = feetY + PLAYER_H;
  for (const b of boxes) {
    // Tops within STEP are stepped onto by supportHeight rather than blocking.
    if (b.maxY - feetY <= STEP || head <= b.minY) continue;
    const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
    let dx = pos.x - cx;
    let dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= PLAYER_R * PLAYER_R) continue;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      pos.x = cx + (dx / d) * PLAYER_R;
      pos.z = cz + (dz / d) * PLAYER_R;
    } else {
      // Centre is inside the box: leave along the shallowest axis.
      const pen = [pos.x - b.minX, b.maxX - pos.x, pos.z - b.minZ, b.maxZ - pos.z];
      const i = pen.indexOf(Math.min(...pen));
      dx = i === 0 ? -1 : i === 1 ? 1 : 0;
      dz = i === 2 ? -1 : i === 3 ? 1 : 0;
      pos.x += dx * (pen[i] + PLAYER_R);
      pos.z += dz * (pen[i] + PLAYER_R);
    }
  }
  for (const c of circles) {
    if (feetY >= c.maxY || head <= c.minY) continue;
    const dx = pos.x - c.x;
    const dz = pos.z - c.z;
    const min = c.r + PLAYER_R;
    const d2 = dx * dx + dz * dz;
    if (d2 >= min * min || d2 < 1e-8) continue;
    const d = Math.sqrt(d2);
    pos.x = c.x + (dx / d) * min;
    pos.z = c.z + (dz / d) * min;
  }
}

/** If moving up from oldHead to newHead hits the underside of a box, return that underside. */
export function ceilingHit(x: number, z: number, oldHead: number, newHead: number): number | null {
  refresh();
  let hit: number | null = null;
  for (const b of boxes) {
    if (oldHead > b.minY + 0.01 || newHead <= b.minY) continue;
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
    if (hit === null || b.minY < hit) hit = b.minY;
  }
  return hit;
}
