import { useEffect, useMemo, useRef } from 'react';
import { createPortal, useFrame, useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import { player, swing } from '../game/fx';
import { PICK_TIERS, useGame } from '../game/store';
import { surface } from './materials';

function overlayMat(color: string, glow = 0, metal = false) {
  return surface({
    color,
    depthTest: false,
    emissive: glow ? color : '#000000',
    emissiveIntensity: glow,
    roughness: metal ? 0.35 : 0.75,
    metalness: metal ? 0.8 : 0,
  });
}

/** First-person pickaxe that bobs with movement and swings on each strike. */
export function Viewmodel() {
  const { camera, scene } = useThree();
  const pivot = useRef<THREE.Group>(null);
  const tool = useGame((s) => s.tool);
  const tier = useGame((s) => s.pickTier);
  const mats = useMemo(
    () => ({
      handle: overlayMat('#8a5a35'),
      grip: overlayMat('#3d2a4f'),
      head: overlayMat('#7c6cff', 0, true),
      edge: overlayMat('#c9f2ff', 0.25, true),
      band: overlayMat('#ffd166', 0.15, true),
    }),
    [],
  );

  useEffect(() => {
    const t = PICK_TIERS[tier];
    mats.head.color.set(t.color);
    mats.head.emissive.set(t.glow ? t.color : '#000000');
    mats.head.emissiveIntensity = t.glow;
  }, [tier, mats]);

  useEffect(() => {
    scene.add(camera);
    return () => {
      scene.remove(camera);
    };
  }, [camera, scene]);

  useFrame((state, dt) => {
    const p = pivot.current;
    if (!p) return;
    const t = state.clock.elapsedTime;
    const moving = Math.min(1, player.speed / 5);
    let rx = 0;
    let rz = 0;
    if (swing.t >= 0) {
      swing.t += dt / 0.3;
      const s = Math.sin(Math.min(1, swing.t) * Math.PI);
      rx = -s * 1.25;
      rz = s * 0.35;
      if (swing.t >= 1) swing.t = -1;
    }
    p.position.set(0.46 + Math.cos(t * 7) * 0.012 * moving, -0.44 + Math.abs(Math.sin(t * 7)) * 0.02 * moving, -0.78);
    p.rotation.set(0.15 + rx, -0.35, 0.1 + rz);
  });

  if (tool !== 'pickaxe') return null;
  return createPortal(
    <group ref={pivot} scale={0.62}>
      <group rotation={[0.1, 0, -0.15]}>
        <mesh material={mats.handle} position={[0, 0.05, 0]} renderOrder={1000}>
          <cylinderGeometry args={[0.035, 0.04, 0.75, 8]} />
        </mesh>
        <mesh material={mats.grip} position={[0, -0.22, 0]} renderOrder={1001}>
          <cylinderGeometry args={[0.045, 0.045, 0.22, 8]} />
        </mesh>
        <mesh material={mats.band} position={[0, 0.36, 0]} renderOrder={1002}>
          <boxGeometry args={[0.11, 0.1, 0.11]} />
        </mesh>
        <mesh material={mats.head} position={[0.15, 0.4, 0]} rotation={[0, 0, -0.35]} renderOrder={1003}>
          <boxGeometry args={[0.32, 0.08, 0.08]} />
        </mesh>
        <mesh material={mats.head} position={[-0.15, 0.4, 0]} rotation={[0, 0, 0.35]} renderOrder={1003}>
          <boxGeometry args={[0.32, 0.08, 0.08]} />
        </mesh>
        <mesh material={mats.edge} position={[0.33, 0.31, 0]} rotation={[0, 0, -0.9]} renderOrder={1004}>
          <coneGeometry args={[0.045, 0.14, 4]} />
        </mesh>
        <mesh material={mats.edge} position={[-0.33, 0.31, 0]} rotation={[0, 0, 0.9]} renderOrder={1004}>
          <coneGeometry args={[0.045, 0.14, 4]} />
        </mesh>
      </group>
    </group>,
    camera,
  );
}
