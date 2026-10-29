import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { registerBurst } from '../game/fx';
import { surface } from './materials';

const MAX = 240;

/** Pooled chunky debris that pops out of anything you hit. */
export function Particles() {
  const { mesh, data } = useMemo(() => {
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.14, 0.14, 0.14),
      surface({}),
      MAX,
    );
    mesh.frustumCulled = false;
    const data = Array.from({ length: MAX }, () => ({
      p: new THREE.Vector3(),
      v: new THREE.Vector3(),
      r: new THREE.Euler(),
      life: 0,
      max: 1,
    }));
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX; i++) {
      mesh.setMatrixAt(i, zero);
      mesh.setColorAt(i, new THREE.Color('#ffffff'));
    }
    return { mesh, data };
  }, []);

  useEffect(() => {
    let cursor = 0;
    const c = new THREE.Color();
    registerBurst((pos, color, count, power = 1) => {
      c.set(color);
      for (let n = 0; n < count; n++) {
        const i = cursor;
        cursor = (cursor + 1) % MAX;
        const d = data[i];
        d.p.copy(pos);
        d.v.set((Math.random() - 0.5) * 5, 2 + Math.random() * 4, (Math.random() - 0.5) * 5).multiplyScalar(power);
        d.r.set(Math.random() * 6, Math.random() * 6, 0);
        d.max = d.life = 0.6 + Math.random() * 0.5;
        mesh.setColorAt(i, c.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.15));
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }, [data, mesh]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    let any = false;
    for (let i = 0; i < MAX; i++) {
      const d = data[i];
      if (d.life <= 0) continue;
      any = true;
      d.life -= dt;
      d.v.y -= 18 * dt;
      d.p.addScaledVector(d.v, dt);
      d.r.x += dt * 8;
      d.r.y += dt * 6;
      q.setFromEuler(d.r);
      s.setScalar(Math.max(0, d.life / d.max));
      m.compose(d.p, q, s);
      mesh.setMatrixAt(i, m);
    }
    if (any) mesh.instanceMatrix.needsUpdate = true;
  });

  return <primitive object={mesh} />;
}
