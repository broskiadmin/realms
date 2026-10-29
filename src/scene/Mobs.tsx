import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { player } from '../game/fx';
import { MOBS, updateMobs, type Mob } from '../game/mobs';
import { surface } from './materials';

type Part = {
  size: [number, number, number];
  pos: [number, number, number];
  color: string;
  leg?: 0 | 1 | 2 | 3;
  wing?: -1 | 1;
  round?: number;
};

const COW: Part[] = [
  { size: [0.9, 0.8, 1.4], pos: [0, 0.95, 0], color: '#f7f4ee', round: 0.18 },
  { size: [0.5, 0.35, 0.5], pos: [0.46, 1.05, 0.1], color: '#2d2a2e', round: 0.08 },
  { size: [0.4, 0.3, 0.45], pos: [-0.46, 0.95, -0.3], color: '#2d2a2e', round: 0.08 },
  { size: [0.6, 0.55, 0.55], pos: [0, 1.25, 0.85], color: '#f7f4ee', round: 0.14 },
  { size: [0.5, 0.25, 0.2], pos: [0, 1.08, 1.15], color: '#ffb3c1', round: 0.08 },
  { size: [0.1, 0.22, 0.1], pos: [0.22, 1.6, 0.8], color: '#f2e2b8' },
  { size: [0.1, 0.22, 0.1], pos: [-0.22, 1.6, 0.8], color: '#f2e2b8' },
  { size: [0.09, 0.09, 0.02], pos: [0.15, 1.35, 1.13], color: '#1b1b1f' },
  { size: [0.09, 0.09, 0.02], pos: [-0.15, 1.35, 1.13], color: '#1b1b1f' },
  { size: [0.22, 0.6, 0.22], pos: [0.28, 0.3, 0.5], color: '#f7f4ee', leg: 0 },
  { size: [0.22, 0.6, 0.22], pos: [-0.28, 0.3, 0.5], color: '#f7f4ee', leg: 1 },
  { size: [0.22, 0.6, 0.22], pos: [0.28, 0.3, -0.5], color: '#f7f4ee', leg: 2 },
  { size: [0.22, 0.6, 0.22], pos: [-0.28, 0.3, -0.5], color: '#f7f4ee', leg: 3 },
];

const PIG: Part[] = [
  { size: [0.75, 0.65, 1.05], pos: [0, 0.65, 0], color: '#ffb0c4', round: 0.2 },
  { size: [0.55, 0.5, 0.45], pos: [0, 0.82, 0.62], color: '#ffb0c4', round: 0.15 },
  { size: [0.3, 0.22, 0.12], pos: [0, 0.75, 0.88], color: '#ff8aa8', round: 0.05 },
  { size: [0.16, 0.16, 0.06], pos: [0.18, 1.1, 0.6], color: '#ff8aa8' },
  { size: [0.16, 0.16, 0.06], pos: [-0.18, 1.1, 0.6], color: '#ff8aa8' },
  { size: [0.08, 0.08, 0.02], pos: [0.13, 0.92, 0.85], color: '#1b1b1f' },
  { size: [0.08, 0.08, 0.02], pos: [-0.13, 0.92, 0.85], color: '#1b1b1f' },
  { size: [0.18, 0.35, 0.18], pos: [0.22, 0.18, 0.3], color: '#ff9eb6', leg: 0 },
  { size: [0.18, 0.35, 0.18], pos: [-0.22, 0.18, 0.3], color: '#ff9eb6', leg: 1 },
  { size: [0.18, 0.35, 0.18], pos: [0.22, 0.18, -0.3], color: '#ff9eb6', leg: 2 },
  { size: [0.18, 0.35, 0.18], pos: [-0.22, 0.18, -0.3], color: '#ff9eb6', leg: 3 },
];

const CHICKEN: Part[] = [
  { size: [0.42, 0.42, 0.5], pos: [0, 0.5, 0], color: '#fffdf7', round: 0.14 },
  { size: [0.3, 0.32, 0.28], pos: [0, 0.82, 0.2], color: '#fffdf7', round: 0.1 },
  { size: [0.1, 0.14, 0.14], pos: [0, 1.02, 0.2], color: '#ff4d4d' },
  { size: [0.12, 0.08, 0.14], pos: [0, 0.8, 0.4], color: '#ffb224' },
  { size: [0.08, 0.12, 0.06], pos: [0, 0.68, 0.36], color: '#ff4d4d' },
  { size: [0.06, 0.06, 0.02], pos: [0.1, 0.88, 0.34], color: '#1b1b1f' },
  { size: [0.06, 0.06, 0.02], pos: [-0.1, 0.88, 0.34], color: '#1b1b1f' },
  { size: [0.06, 0.3, 0.32], pos: [0.24, 0.52, -0.02], color: '#f1ece0', wing: 1 },
  { size: [0.06, 0.3, 0.32], pos: [-0.24, 0.52, -0.02], color: '#f1ece0', wing: -1 },
  { size: [0.06, 0.3, 0.06], pos: [0.1, 0.15, 0], color: '#ffb224', leg: 0 },
  { size: [0.06, 0.3, 0.06], pos: [-0.1, 0.15, 0], color: '#ffb224', leg: 1 },
];

const PARTS = { cow: COW, pig: PIG, chicken: CHICKEN };
const unitBox = new THREE.BoxGeometry(1, 1, 1);

function MobView({ mob }: { mob: Mob }) {
  const group = useRef<THREE.Group>(null);
  const parts = PARTS[mob.type];
  const mats = useMemo(
    () => parts.map((p) => surface({ color: p.color, emissive: '#ff2a2a', emissiveIntensity: 0, roughness: 0.9 })),
    [parts],
  );
  const refs = useRef<(THREE.Object3D | null)[]>([]);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    g.visible = !mob.dead;
    if (mob.dead) return;
    g.position.set(mob.x, mob.y + mob.hop, mob.z);
    g.rotation.y = mob.heading;
    const swingAmt = mob.state === 'idle' ? 0 : 0.7;
    parts.forEach((p, i) => {
      const o = refs.current[i];
      if (!o) return;
      if (p.leg !== undefined) {
        const s = p.leg === 0 || p.leg === 3 ? 1 : -1;
        o.rotation.x = Math.sin(mob.phase) * swingAmt * s;
      } else if (p.wing !== undefined) {
        o.rotation.z = (mob.state === 'flee' || mob.hop > 0 ? Math.sin(mob.phase * 4) * 0.8 : 0.05) * p.wing;
      }
    });
    const f = mob.flash > 0 ? 0.8 : 0;
    for (const m of mats) m.emissiveIntensity = f;
  });

  return (
    <group ref={group}>
      {parts.map((p, i) => {
        const ud = { kind: 'mob', id: mob.id };
        const pivotY = p.leg !== undefined ? p.pos[1] + p.size[1] / 2 : p.pos[1];
        const inner: [number, number, number] = p.leg !== undefined ? [0, -p.size[1] / 2, 0] : [0, 0, 0];
        return (
          <group key={i} ref={(o) => (refs.current[i] = o)} position={[p.pos[0], pivotY, p.pos[2]]}>
            {p.round ? (
              <RoundedBox args={p.size} radius={p.round} smoothness={3} material={mats[i]} position={inner} castShadow userData={ud} />
            ) : (
              <mesh geometry={unitBox} scale={p.size} material={mats[i]} position={inner} castShadow userData={ud} />
            )}
          </group>
        );
      })}
    </group>
  );
}

export function Mobs() {
  useFrame((_, dt) => updateMobs(Math.min(dt, 0.05), performance.now(), player.pos));
  return (
    <>
      {MOBS.map((m) => (
        <MobView key={m.id} mob={m} />
      ))}
    </>
  );
}
