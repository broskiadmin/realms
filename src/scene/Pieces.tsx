import { memo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ghost, hitTimes } from '../game/fx';
import { pieceTransform } from '../game/pieces';
import { useGame, type Piece } from '../game/store';
import { geo, pieceMaterials } from './materials';

const PieceMesh = memo(function PieceMesh({ p }: { p: Piece }) {
  const ref = useRef<THREE.Mesh>(null);
  const born = useRef(performance.now());
  const t = pieceTransform(p);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const now = performance.now();
    const k = Math.min(1, (now - born.current) / 180);
    let s = 0.7 + 0.3 * (1 - Math.pow(1 - k, 3));
    const hit = hitTimes.get(p.id);
    if (hit !== undefined && now - hit < 300) s *= 1 + Math.sin((now - hit) / 20) * 0.03;
    m.scale.set(t.size[0] * s, t.size[1] * s, t.size[2] * s);
  });
  return (
    <mesh
      ref={ref}
      geometry={geo.box}
      material={pieceMaterials[p.mat]}
      position={t.position}
      rotation={t.rotation}
      scale={t.size}
      castShadow
      receiveShadow
      userData={{ kind: 'piece', id: p.id }}
    />
  );
});

export function Pieces() {
  const pieces = useGame((s) => s.pieces);
  return (
    <>
      {pieces.map((p) => (
        <PieceMesh key={p.id} p={p} />
      ))}
    </>
  );
}

const ghostEdges = new THREE.EdgesGeometry(geo.box);
const ghostLineMat = new THREE.LineBasicMaterial({ color: '#5ad1ff', depthWrite: false });
const ghostMat = new THREE.MeshBasicMaterial({ color: '#5ad1ff', transparent: true, opacity: 0.35, depthWrite: false });

/** Translucent preview of where the next build piece will snap. */
export function Ghost() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    const m = ref.current;
    if (!m) return;
    const pl = ghost.placement;
    m.visible = pl !== null;
    if (!pl) return;
    const t = pieceTransform(pl);
    m.position.set(...t.position);
    m.rotation.set(...t.rotation);
    m.scale.set(...t.size);
    const color = ghost.valid ? '#5ad1ff' : '#ff5a6e';
    ghostMat.color.set(color);
    ghostMat.opacity = 0.28 + Math.sin(state.clock.elapsedTime * 6) * 0.07;
    ghostLineMat.color.set(color);
  });
  return (
    <mesh ref={ref} geometry={geo.box} material={ghostMat} visible={false} renderOrder={10}>
      <lineSegments geometry={ghostEdges} material={ghostLineMat} />
    </mesh>
  );
}
