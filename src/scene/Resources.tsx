import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { hitTimes } from '../game/fx';
import { useGame } from '../game/store';
import { BIOMES, ISLANDS, NODES, ORE_INFO, type ResourceNode } from '../game/world';
import { geo, toon } from './materials';
import { REALISTIC } from './quality';
import { boulderGeos, RealisticTree } from './RealisticFlora';
import { barkDetail, leafDetail, rockDetail } from './textures';

/** Wobble on hit, pop in on (re)spawn. */
function useNodeAnim(id: string, baseScale: number) {
  const ref = useRef<Group>(null);
  const born = useRef(performance.now());
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const now = performance.now();
    const grow = Math.min(1, (now - born.current) / 400);
    const pop = grow < 1 ? 1 - Math.pow(1 - grow, 3) * 1.0 + Math.sin(grow * Math.PI) * 0.15 : 1;
    const hit = hitTimes.get(id);
    let wob = 0;
    if (hit !== undefined) {
      const dt = (now - hit) / 1000;
      if (dt < 0.45) wob = Math.sin(dt * 40) * (0.45 - dt) * 0.25;
      else hitTimes.delete(id);
    }
    g.scale.setScalar(baseScale * pop * (1 + wob * 0.6));
    g.rotation.z = wob * 0.4;
  });
  return ref;
}

const Tree = memo(function Tree({ n }: { n: ResourceNode }) {
  const ref = useNodeAnim(n.id, n.scale);
  const pal = BIOMES[ISLANDS[n.island].biome];
  const leafA = toon(pal.foliage[0], 0, leafDetail);
  const leafB = toon(pal.foliage[1], 0, leafDetail);
  const bark = toon(n.variant === 1 ? '#7a4b2a' : '#8b5a2b', 0, barkDetail);
  const ud = useMemo(() => ({ kind: 'node', id: n.id }), [n.id]);
  if (REALISTIC) {
    return (
      <group ref={ref} position={[n.x, n.y - 0.05, n.z]} rotation={[0, n.rot, 0]}>
        <RealisticTree n={n} ud={ud} />
      </group>
    );
  }
  return (
    <group ref={ref} position={[n.x, n.y - 0.1, n.z]} rotation={[0, n.rot, 0]}>
      <mesh geometry={geo.trunk} material={bark} position={[0, 1.3, 0]} castShadow userData={ud} />
      {n.variant === 1 ? (
        <>
          <mesh geometry={geo.cone} material={leafA} position={[0, 2.6, 0]} scale={[1.7, 1.2, 1.7]} castShadow userData={ud} />
          <mesh geometry={geo.cone} material={leafB} position={[0, 3.7, 0]} scale={[1.3, 1.1, 1.3]} castShadow userData={ud} />
          <mesh geometry={geo.cone} material={leafA} position={[0, 4.7, 0]} scale={[0.9, 1.0, 0.9]} castShadow userData={ud} />
        </>
      ) : (
        <>
          <mesh geometry={geo.blob} material={leafA} position={[0, 3.3, 0]} scale={1.6} castShadow userData={ud} />
          <mesh geometry={geo.blob} material={leafB} position={[0.9, 2.8, 0.4]} scale={1.1} castShadow userData={ud} />
          <mesh geometry={geo.blob} material={leafB} position={[-0.7, 3.0, -0.6]} scale={1.15} castShadow userData={ud} />
          <mesh geometry={geo.blob} material={leafA} position={[0.1, 4.3, -0.2]} scale={0.95} castShadow userData={ud} />
        </>
      )}
    </group>
  );
});

const Rock = memo(function Rock({ n }: { n: ResourceNode }) {
  const ref = useNodeAnim(n.id, n.scale);
  const pal = BIOMES[ISLANDS[n.island].biome];
  const ud = { kind: 'node', id: n.id };
  // Realistic: smooth noise-sculpted boulders instead of faceted low-poly gems.
  const shape = (i: number) => (REALISTIC ? boulderGeos[i % 3] : geo.rock[i % 3]);
  return (
    <group ref={ref} position={[n.x, n.y, n.z]} rotation={[0, n.rot, 0]}>
      <mesh geometry={shape(n.variant)} material={toon(pal.rock[0], 0, rockDetail)} position={[0, 0.45, 0]} scale={[1.15, 0.85, 1]} castShadow receiveShadow userData={ud} />
      <mesh geometry={shape(n.variant + 1)} material={toon(pal.rock[1], 0, rockDetail)} position={[0.75, 0.25, 0.3]} scale={0.5} castShadow userData={ud} />
    </group>
  );
});

const CRYSTALS: [number, number, number, number, number][] = [
  [0.3, 0.95, 0.1, 0.4, 1.2],
  [-0.45, 0.8, 0.25, -0.5, 1.0],
  [0.05, 1.05, -0.4, 0.2, 0.9],
  [0.55, 0.55, -0.35, 0.9, 0.7],
  [-0.2, 0.6, 0.55, -0.9, 0.75],
];

const Ore = memo(function Ore({ n }: { n: ResourceNode }) {
  const ref = useNodeAnim(n.id, n.scale);
  const info = ORE_INFO[n.ore ?? 'coal'];
  const rockMat = toon(n.ore === 'skyglass' ? '#6d6a99' : '#7d7b80', 0, rockDetail);
  const gem = toon(info.color, info.glow);
  const ud = { kind: 'node', id: n.id };
  return (
    <group ref={ref} position={[n.x, n.y, n.z]} rotation={[0, n.rot, 0]}>
      <mesh geometry={REALISTIC ? boulderGeos[n.variant % 3] : geo.rock[n.variant % 3]} material={rockMat} position={[0, 0.5, 0]} scale={[1.05, 0.8, 0.95]} castShadow receiveShadow userData={ud} />
      {CRYSTALS.map(([x, y, z, tilt, s], i) => (
        <mesh key={i} geometry={geo.crystal} material={gem} position={[x, y, z]} rotation={[tilt * 0.6, i, tilt]} scale={[s * 0.8, s * 1.5, s * 0.8]} castShadow userData={ud} />
      ))}
    </group>
  );
});

export function Resources() {
  const depleted = useGame((s) => s.depleted);
  return (
    <>
      {NODES.map((n) => {
        if (n.id in depleted) return null;
        if (n.kind === 'tree') return <Tree key={n.id} n={n} />;
        if (n.kind === 'rock') return <Rock key={n.id} n={n} />;
        return <Ore key={n.id} n={n} />;
      })}
    </>
  );
}
