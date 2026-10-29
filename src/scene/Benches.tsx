import { memo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { hitTimes } from '../game/fx';
import { useGame, type Bench } from '../game/store';
import { geo, pieceMaterials, toon } from './materials';

const BenchMesh = memo(function BenchMesh({ b }: { b: Bench }) {
  const ref = useRef<THREE.Group>(null);
  const born = useRef(performance.now());
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const now = performance.now();
    const k = Math.min(1, (now - born.current) / 250);
    let s = 0.6 + 0.4 * (1 - Math.pow(1 - k, 3));
    const hit = hitTimes.get(b.id);
    if (hit !== undefined && now - hit < 300) s *= 1 + Math.sin((now - hit) / 20) * 0.04;
    g.scale.setScalar(s);
  });
  const ud = { kind: 'bench', id: b.id };
  const leg = toon('#6b3f1c');
  const metal = toon('#9aa3ad');
  const handle = toon('#c0392b');
  return (
    <group ref={ref} position={[b.x, b.y, b.z]} rotation={[0, b.rot, 0]}>
      {/* Tabletop with a plank texture and a darker rim */}
      <mesh geometry={geo.box} material={pieceMaterials.wood} position={[0, 0.95, 0]} scale={[1.5, 0.16, 1]} castShadow receiveShadow userData={ud} />
      <mesh geometry={geo.box} material={leg} position={[0, 0.84, 0]} scale={[1.56, 0.08, 1.06]} castShadow userData={ud} />
      {[[-0.62, -0.38], [0.62, -0.38], [-0.62, 0.38], [0.62, 0.38]].map(([x, z], i) => (
        <mesh key={i} geometry={geo.box} material={leg} position={[x, 0.42, z]} scale={[0.14, 0.84, 0.14]} castShadow userData={ud} />
      ))}
      {/* Lower shelf */}
      <mesh geometry={geo.box} material={pieceMaterials.wood} position={[0, 0.25, 0]} scale={[1.3, 0.06, 0.8]} userData={ud} />
      {/* Tools resting on top: a hammer and a saw */}
      <group position={[-0.3, 1.06, 0.1]} rotation={[0, 0.5, 0]}>
        <mesh geometry={geo.box} material={handle} scale={[0.5, 0.06, 0.06]} userData={ud} />
        <mesh geometry={geo.box} material={metal} position={[0.27, 0.02, 0]} scale={[0.1, 0.1, 0.22]} userData={ud} />
      </group>
      <group position={[0.35, 1.05, -0.15]} rotation={[0, -0.3, 0]}>
        <mesh geometry={geo.box} material={metal} scale={[0.55, 0.02, 0.18]} userData={ud} />
        <mesh geometry={geo.box} material={leg} position={[-0.32, 0.02, 0]} scale={[0.12, 0.06, 0.16]} userData={ud} />
      </group>
    </group>
  );
});

export function Benches() {
  const benches = useGame((s) => s.benches);
  return (
    <>
      {benches.map((b) => (
        <BenchMesh key={b.id} b={b} />
      ))}
    </>
  );
}
