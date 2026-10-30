import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { player } from '../game/fx';
import { NPCS, npcSpot, questDone, type NpcLook } from '../game/npcs';
import { useGame } from '../game/store';
import { geo, pieceMaterials, surface, toon } from './materials';
import { REALISTIC } from './quality';

/** Chunky stylised villager built from rounded boxes, with a hat per role. */
const capsule = new THREE.CapsuleGeometry(1, 1, 6, 16);
const sphere = new THREE.SphereGeometry(1, 24, 18);

/** Realistic-mode person: smooth capsule limbs, real head proportions, face, hair, then the role's hat. */
function RealHumanoid({ look, ud }: { look: NpcLook; ud: Record<string, unknown> }) {
  const skin = toon(look.skin);
  const shirt = toon(look.shirt);
  const pants = toon(look.pants);
  const hat = toon(look.hatColor);
  const hair = toon(look.beard ?? '#3b2a1e');
  const shoe = toon('#2a211b');
  const white = toon('#f2efe8');
  const iris = toon('#2b1d14');
  const top = 1.78; // crown of the head
  return (
    <group>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh geometry={capsule} material={pants} position={[s * 0.1, 0.47, 0]} scale={[0.085, 0.33, 0.085]} castShadow userData={ud} />
          <mesh geometry={sphere} material={shoe} position={[s * 0.1, 0.06, 0.05]} scale={[0.07, 0.05, 0.13]} castShadow userData={ud} />
          <mesh geometry={capsule} material={shirt} position={[s * 0.27, 1.12, 0]} rotation={[0, 0, s * 0.1]} scale={[0.068, 0.19, 0.068]} castShadow userData={ud} />
          <mesh geometry={sphere} material={skin} position={[s * 0.295, 0.84, 0.01]} scale={[0.045, 0.06, 0.035]} userData={ud} />
          <mesh geometry={sphere} material={white} position={[s * 0.045, 1.655, 0.1]} scale={0.019} userData={ud} />
          <mesh geometry={sphere} material={iris} position={[s * 0.045, 1.655, 0.115]} scale={0.009} userData={ud} />
          <mesh geometry={sphere} material={skin} position={[s * 0.118, 1.64, 0]} scale={[0.018, 0.03, 0.02]} userData={ud} />
          <mesh geometry={geo.box} material={hair} position={[s * 0.047, 1.69, 0.108]} rotation={[0, 0, s * -0.12]} scale={[0.04, 0.008, 0.01]} userData={ud} />
        </group>
      ))}
      <mesh geometry={capsule} material={shirt} position={[0, 1.15, 0]} scale={[0.215, 0.19, 0.14]} castShadow userData={ud} />
      <mesh geometry={capsule} material={pants} position={[0, 0.86, 0]} scale={[0.19, 0.04, 0.125]} userData={ud} />
      <mesh material={skin} position={[0, 1.48, 0]} userData={ud}>
        <cylinderGeometry args={[0.05, 0.06, 0.12, 12]} />
      </mesh>
      <mesh geometry={sphere} material={skin} position={[0, 1.64, 0]} scale={[0.105, 0.13, 0.115]} castShadow userData={ud} />
      <mesh geometry={cone} material={skin} position={[0, 1.625, 0.118]} rotation={[Math.PI / 2, 0, 0]} scale={[0.017, 0.04, 0.02]} userData={ud} />
      <mesh geometry={sphere} material={hair} position={[0, 1.68, -0.012]} scale={[0.11, 0.105, 0.115]} userData={ud} />
      {look.beard && <mesh geometry={sphere} material={hair} position={[0, 1.555, 0.06]} scale={[0.085, 0.07, 0.07]} userData={ud} />}
      {look.hat === 'straw' && (
        <>
          <mesh material={hat} position={[0, top, 0]} castShadow userData={ud}>
            <cylinderGeometry args={[0.3, 0.3, 0.02, 24]} />
          </mesh>
          <mesh material={hat} position={[0, top + 0.06, 0]} userData={ud}>
            <cylinderGeometry args={[0.11, 0.13, 0.12, 18]} />
          </mesh>
        </>
      )}
      {look.hat === 'flannel' && <mesh geometry={sphere} material={hat} position={[0, top - 0.04, -0.01]} scale={[0.118, 0.06, 0.125]} userData={ud} />}
      {look.hat === 'helmet' && (
        <>
          <mesh material={hat} position={[0, top - 0.06, 0]} castShadow userData={ud}>
            <sphereGeometry args={[0.135, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          <mesh material={toon('#fff6c2', 1.6)} position={[0, top - 0.01, 0.125]} rotation={[Math.PI / 2, 0, 0]} userData={ud}>
            <cylinderGeometry args={[0.03, 0.03, 0.03, 12]} />
          </mesh>
        </>
      )}
      {look.hat === 'wizard' && (
        <>
          <mesh material={hat} position={[0, top - 0.02, 0]} userData={ud}>
            <cylinderGeometry args={[0.24, 0.24, 0.015, 24]} />
          </mesh>
          <mesh material={hat} position={[0, top + 0.2, -0.02]} rotation={[-0.12, 0, 0]} castShadow userData={ud}>
            <coneGeometry args={[0.12, 0.42, 16]} />
          </mesh>
        </>
      )}
      {look.hat === 'hood' && (
        <mesh material={hat} position={[0, 1.66, -0.02]} castShadow userData={ud}>
          <sphereGeometry args={[0.15, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
        </mesh>
      )}
    </group>
  );
}

const cone = new THREE.ConeGeometry(1, 1, 10);

export function Humanoid({ look, ud }: { look: NpcLook; ud: Record<string, unknown> }) {
  if (REALISTIC) return <RealHumanoid look={look} ud={ud} />;
  return <ToonHumanoid look={look} ud={ud} />;
}

function ToonHumanoid({ look, ud }: { look: NpcLook; ud: Record<string, unknown> }) {
  const skin = toon(look.skin);
  const shirt = toon(look.shirt);
  const pants = toon(look.pants);
  const hat = toon(look.hatColor);
  const dark = toon('#1b1b1f');
  return (
    <group>
      <RoundedBox args={[0.32, 0.8, 0.3]} radius={0.08} position={[0.13, 0.4, 0]} material={pants} castShadow userData={ud} />
      <RoundedBox args={[0.32, 0.8, 0.3]} radius={0.08} position={[-0.13, 0.4, 0]} material={pants} castShadow userData={ud} />
      <RoundedBox args={[0.7, 0.75, 0.4]} radius={0.12} position={[0, 1.15, 0]} material={shirt} castShadow userData={ud} />
      <RoundedBox args={[0.2, 0.7, 0.22]} radius={0.07} position={[0.46, 1.12, 0]} rotation={[0, 0, 0.08]} material={shirt} castShadow userData={ud} />
      <RoundedBox args={[0.2, 0.7, 0.22]} radius={0.07} position={[-0.46, 1.12, 0]} rotation={[0, 0, -0.08]} material={shirt} castShadow userData={ud} />
      <RoundedBox args={[0.55, 0.55, 0.5]} radius={0.14} position={[0, 1.82, 0]} material={skin} castShadow userData={ud} />
      <mesh geometry={geo.box} material={dark} position={[0.12, 1.86, 0.26]} scale={[0.07, 0.1, 0.02]} userData={ud} />
      <mesh geometry={geo.box} material={dark} position={[-0.12, 1.86, 0.26]} scale={[0.07, 0.1, 0.02]} userData={ud} />
      {look.beard && <RoundedBox args={[0.5, 0.28, 0.12]} radius={0.05} position={[0, 1.62, 0.22]} material={toon(look.beard)} userData={ud} />}
      {look.hat === 'straw' && (
        <>
          <mesh material={hat} position={[0, 2.1, 0]} castShadow userData={ud}>
            <cylinderGeometry args={[0.6, 0.6, 0.05, 16]} />
          </mesh>
          <mesh material={hat} position={[0, 2.22, 0]} castShadow userData={ud}>
            <cylinderGeometry args={[0.24, 0.3, 0.25, 12]} />
          </mesh>
        </>
      )}
      {look.hat === 'flannel' && <RoundedBox args={[0.6, 0.18, 0.55]} radius={0.06} position={[0, 2.12, 0]} material={hat} userData={ud} />}
      {look.hat === 'helmet' && (
        <>
          <mesh material={hat} position={[0, 2.06, 0]} castShadow userData={ud}>
            <sphereGeometry args={[0.34, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          <mesh material={toon('#fff6c2', 1.6)} position={[0, 2.16, 0.3]} userData={ud}>
            <cylinderGeometry args={[0.07, 0.07, 0.06, 10]} />
          </mesh>
        </>
      )}
      {look.hat === 'wizard' && (
        <>
          <mesh material={hat} position={[0, 2.1, 0]} userData={ud}>
            <cylinderGeometry args={[0.5, 0.5, 0.04, 16]} />
          </mesh>
          <mesh material={hat} position={[0, 2.5, 0]} rotation={[0.15, 0, 0]} castShadow userData={ud}>
            <coneGeometry args={[0.3, 0.8, 12]} />
          </mesh>
        </>
      )}
      {look.hat === 'hood' && (
        <mesh material={hat} position={[0, 1.9, -0.04]} castShadow userData={ud}>
          <sphereGeometry args={[0.38, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
        </mesh>
      )}
    </group>
  );
}

const MARK_COLORS = { offer: '#ffd23f', active: '#9aa3ad', done: '#4dff88' };

function Villager({ id }: { id: string }) {
  const npc = NPCS.find((n) => n.id === id)!;
  const spot = useMemo(() => npcSpot(id), [id]);
  const body = useRef<THREE.Group>(null);
  const mark = useRef<THREE.Mesh>(null);
  const markMat = useMemo(() => new THREE.MeshBasicMaterial({ color: MARK_COLORS.offer, toneMapped: false }), []);
  const ud = { kind: 'npc', id };

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const b = body.current;
    if (b) {
      // Turn to face the player when they come close; breathe gently.
      const dx = player.pos.x - spot.x;
      const dz = player.pos.z - spot.z;
      if (dx * dx + dz * dz < 64) {
        const want = Math.atan2(dx, dz);
        const diff = ((want - b.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        b.rotation.y += diff * 0.1;
      }
      b.scale.y = 1 + Math.sin(t * 2 + spot.x) * 0.015;
    }
    const m = mark.current;
    if (m) {
      const q = useGame.getState().quests[id];
      const state2 = !q || q.status === 'offered' ? 'offer' : questDone(q) ? 'done' : 'active';
      markMat.color.set(MARK_COLORS[state2]).multiplyScalar(state2 === 'active' ? 1 : 1.8);
      m.rotation.y = t * 2;
      m.position.y = (REALISTIC ? 2.3 : 2.95) + Math.sin(t * 3) * 0.08 + (npc.look.hat === 'wizard' ? 0.35 : 0);
    }
  });

  return (
    <group position={[spot.x, spot.y - 0.05, spot.z]}>
      <group ref={body}>
        <Humanoid look={npc.look} ud={ud} />
      </group>
      <mesh ref={mark} material={markMat} scale={REALISTIC ? [0.1, 0.15, 0.1] : [0.22, 0.32, 0.22]}>
        <octahedronGeometry args={[1, 0]} />
      </mesh>
    </group>
  );
}

export function Npcs() {
  return (
    <>
      {NPCS.map((n) => (
        <Villager key={n.id} id={n.id} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Wandering trader + cart

const TRADER_LOOK: NpcLook = { skin: '#d9a07a', shirt: '#16a085', pants: '#5b3a6e', hat: 'hood', hatColor: '#8e44ad' };

const canopyTexture = (() => {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 8;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#fff3dc' : '#e74c3c';
    g.fillRect(i * 16, 0, 16, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const canopyMat = surface({ map: canopyTexture, side: THREE.DoubleSide, roughness: 0.95 });
const beamMat = new THREE.MeshBasicMaterial({
  color: new THREE.Color('#ffd23f').multiplyScalar(1.5),
  transparent: true,
  opacity: 0.35,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
});

export function TraderCart() {
  const trader = useGame((s) => s.trader);
  const beam = useRef<THREE.Mesh>(null);
  const wood = toon('#8b5a2b');
  const wheel = toon('#4a2f1a');
  useFrame((state) => {
    if (beam.current) beamMat.opacity = 0.25 + Math.sin(state.clock.elapsedTime * 2) * 0.08;
  });
  if (!trader) return null;
  const ud = { kind: 'trader', id: 'trader' };
  // Orientation is derived from the position, so it stays stable across re-renders and reloads.
  return (
    <group position={[trader.x, trader.y - 0.05, trader.z]}>
      <group rotation={[0, (trader.x * 7 + trader.z) % (Math.PI * 2), 0]}>
        <mesh geometry={geo.box} material={pieceMaterials.wood} position={[0, 0.9, 0]} scale={[2.4, 0.2, 1.4]} castShadow receiveShadow userData={ud} />
        <mesh geometry={geo.box} material={wood} position={[0, 1.2, 0.65]} scale={[2.4, 0.45, 0.1]} castShadow userData={ud} />
        <mesh geometry={geo.box} material={wood} position={[0, 1.2, -0.65]} scale={[2.4, 0.45, 0.1]} castShadow userData={ud} />
        {[-0.75, 0.75].map((z) => (
          <mesh key={z} material={wheel} position={[0, 0.55, z * 1.05]} rotation={[Math.PI / 2, 0, 0]} castShadow userData={ud}>
            <cylinderGeometry args={[0.55, 0.55, 0.12, 14]} />
          </mesh>
        ))}
        <mesh geometry={geo.box} material={wood} position={[1.7, 0.85, 0.35]} scale={[1.2, 0.08, 0.08]} userData={ud} />
        <mesh geometry={geo.box} material={wood} position={[1.7, 0.85, -0.35]} scale={[1.2, 0.08, 0.08]} userData={ud} />
        {[-1.1, 1.1].map((x) => (
          <mesh key={x} geometry={geo.box} material={wood} position={[x, 1.75, 0]} scale={[0.1, 1.5, 0.1]} userData={ud} />
        ))}
        <mesh material={canopyMat} position={[0, 2.5, 0]} rotation={[0, 0, Math.PI / 2]} castShadow userData={ud}>
          <cylinderGeometry args={[0.8, 0.8, 2.6, 16, 1, true, 0, Math.PI]} />
        </mesh>
        <mesh geometry={geo.box} material={toon('#c98b4a')} position={[-0.5, 1.3, 0.1]} scale={0.5} castShadow userData={ud} />
        <mesh geometry={geo.box} material={toon('#a0613a')} position={[0.3, 1.25, -0.15]} scale={[0.6, 0.4, 0.5]} castShadow userData={ud} />
        <mesh material={toon('#ffcf33', 1.4)} position={[1.1, 2.3, 0.6]} userData={ud}>
          <sphereGeometry args={[0.12, 10, 8]} />
        </mesh>
        <group position={[0.4, 0, 1.4]} rotation={[0, 0.4, 0]}>
          <Humanoid look={TRADER_LOOK} ud={ud} />
        </group>
      </group>
      <mesh ref={beam} material={beamMat} position={[0, 30, 0]}>
        <cylinderGeometry args={[0.6, 1.2, 60, 12, 1, true]} />
      </mesh>
    </group>
  );
}
