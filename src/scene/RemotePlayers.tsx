import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type * as THREE from 'three';
import type { NpcLook } from '../game/npcs';
import { net, remotes, type RemotePlayer } from '../game/net';
import { Humanoid } from './Npcs';

const SHIRTS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e84393', '#fdcb6e'];
const HATS: NpcLook['hat'][] = ['straw', 'helmet', 'wizard', 'hood', 'flannel'];

function lookFor(id: string): NpcLook {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return {
    skin: ['#f2c49b', '#e0ac85', '#c98e66', '#8d5a3b', '#f5d0b5'][h % 5],
    shirt: SHIRTS[h % SHIRTS.length],
    pants: '#34495e',
    hat: HATS[(h >> 3) % HATS.length],
    hatColor: SHIRTS[(h >> 5) % SHIRTS.length],
  };
}

function Avatar({ r }: { r: RemotePlayer }) {
  const ref = useRef<THREE.Group>(null);
  const look = useMemo(() => lookFor(r.id), [r.id]);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    // Ease toward the latest network pose so 10 Hz updates look smooth.
    const k = Math.min(1, dt * 12);
    r.x += (r.tx - r.x) * k;
    r.y += (r.ty - r.y) * k;
    r.z += (r.tz - r.z) * k;
    const dyaw = ((r.tyaw - r.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    r.yaw += dyaw * k;
    g.visible = r.seen;
    g.position.set(r.x, r.y, r.z);
    // Camera yaw 0 looks toward -z; the avatar model faces +z.
    g.rotation.y = r.yaw + Math.PI;
  });
  return (
    <group ref={ref}>
      <Humanoid look={look} ud={{ kind: 'player', id: r.id }} />
      <Html position={[0, 2.75, 0]} center distanceFactor={12} zIndexRange={[1, 0]}>
        <div className="nametag">{r.name}</div>
      </Html>
    </group>
  );
}

export function RemotePlayers() {
  const [version, setVersion] = useState(net.version);
  useFrame(() => {
    if (net.version !== version) setVersion(net.version);
  });
  return (
    <>
      {[...remotes.values()].map((r) => (
        <Avatar key={r.id} r={r} />
      ))}
    </>
  );
}
