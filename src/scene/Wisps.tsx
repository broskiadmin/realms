import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { burst, hitTimes, isNight, player, wear } from '../game/fx';
import { updateWisps, WISP_DAMAGE, WISPS, type Wisp } from '../game/hostiles';
import { MAT_INFO, useGame } from '../game/store';
import { surface } from './materials';

const bodyGeo = new THREE.IcosahedronGeometry(0.45, 2);
const eyeGeo = new THREE.SphereGeometry(0.09, 10, 8);
const tailGeo = new THREE.ConeGeometry(0.22, 0.6, 7);
const hornGeo = new THREE.ConeGeometry(0.07, 0.22, 5);
const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#9ffcff').multiplyScalar(2.5), toneMapped: false });

function WispView({ w }: { w: Wisp }) {
  const ref = useRef<THREE.Group>(null);
  const body = useMemo(
    () => surface({ color: '#3a1d63', emissive: '#7b3cff', emissiveIntensity: 0.35, transparent: true, roughness: 0.3 }),
    [],
  );
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    g.visible = w.alive;
    if (!w.alive) return;
    g.position.copy(w.pos);
    g.lookAt(player.pos.x, player.pos.y + 1.1, player.pos.z);
    const squash = 1 + Math.sin(w.phase * 6) * 0.08;
    const fade = w.fading > 0 ? w.fading / 0.8 : 1;
    g.scale.set(fade / squash, fade * squash, fade / squash);
    body.opacity = fade;
    body.emissive.set(w.flash > 0 ? '#ffffff' : '#7b3cff');
    body.emissiveIntensity = w.flash > 0 ? 1.2 : 0.35;
  });
  const ud = { kind: 'wisp', id: w.id };
  return (
    <group ref={ref} visible={false}>
      <mesh geometry={bodyGeo} material={body} castShadow userData={ud} />
      <mesh geometry={eyeGeo} material={eyeMat} position={[0.15, 0.08, 0.38]} userData={ud} />
      <mesh geometry={eyeGeo} material={eyeMat} position={[-0.15, 0.08, 0.38]} userData={ud} />
      <mesh geometry={hornGeo} material={body} position={[0.2, 0.42, 0.05]} rotation={[0, 0, -0.4]} userData={ud} />
      <mesh geometry={hornGeo} material={body} position={[-0.2, 0.42, 0.05]} rotation={[0, 0, 0.4]} userData={ud} />
      <mesh geometry={tailGeo} material={body} position={[0, -0.1, -0.5]} rotation={[-Math.PI / 2 - 0.3, 0, 0]} userData={ud} />
    </group>
  );
}

export function Wisps() {
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    updateWisps(dt, player.pos, isNight(), {
      onHitPlayer: (dir) => {
        player.vel.addScaledVector(dir, 7);
        player.vel.y = Math.max(player.vel.y, 4);
        player.onGround = false;
        useGame.getState().hurt(WISP_DAMAGE, 'a Gloomwisp');
      },
      onHitPiece: (id, at) => {
        const g = useGame.getState();
        const piece = g.pieces.find((p) => p.id === id);
        if (!piece) return;
        const taken = (wear.get(id) ?? 0) + 1;
        hitTimes.set(id, performance.now());
        burst(at, '#b48cff', 5, 0.6);
        if (taken >= MAT_INFO[piece.mat].toughness) {
          wear.delete(id);
          burst(at, MAT_INFO[piece.mat].color, 20, 1.4);
          g.removePiece(id, false);
          g.toast('wisp-break', `A Gloomwisp broke your ${MAT_INFO[piece.mat].label.toLowerCase()} ${piece.type}!`, '#b48cff', 1);
        } else {
          wear.set(id, taken);
        }
      },
    });
  });
  return (
    <>
      {WISPS.map((w) => (
        <WispView key={w.id} w={w} />
      ))}
    </>
  );
}
