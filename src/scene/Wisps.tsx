import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { isNight, player } from '../game/fx';
import { gnawPiece } from '../game/gnaw';
import { updateWisps, WISP_DAMAGE, WISPS, type Wisp } from '../game/hostiles';
import { sfx } from '../game/sound';
import { useGame } from '../game/store';
import { surface } from './materials';
import { REALISTIC } from './quality';

/**
 * Gloomwisp visuals in both styles. Shared: a trailing smoke tail, eyes that
 * flare and a body that shudders during the wind-up (the attack tell).
 * Realistic: a dark, slightly translucent body with a glowing violet rim
 * (fresnel) and a pulsing inner core; additive smoke trail.
 */

const TRAIL = 14;
const bodyGeo = new THREE.IcosahedronGeometry(0.45, REALISTIC ? 4 : 2);
const eyeGeo = new THREE.SphereGeometry(1, 12, 10);
const tailGeo = new THREE.ConeGeometry(0.22, 0.6, 9);
const hornGeo = new THREE.ConeGeometry(0.07, 0.22, 6);
const puffGeo = new THREE.SphereGeometry(1, 10, 8);

/** Dark body with a fresnel rim glow whose strength follows the wind-up charge. */
function realisticBody(): THREE.MeshStandardMaterial & { userData: { rim: { value: number } } } {
  // Matte and translucent: smoke, not plastic.
  const m = new THREE.MeshStandardMaterial({ color: '#07020d', roughness: 0.75, metalness: 0, transparent: true, opacity: 0.82, depthWrite: false });
  const rim = { value: 1 };
  m.userData.rim = rim;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = rim;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uRim;')
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
        float fres = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.4);
        totalEmissiveRadiance += vec3(0.55, 0.25, 1.0) * fres * uRim;`,
      );
  };
  m.customProgramCacheKey = () => 'wisp-rim';
  return m as THREE.MeshStandardMaterial & { userData: { rim: { value: number } } };
}

function WispView({ w }: { w: Wisp }) {
  const ref = useRef<THREE.Group>(null);
  const shake = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);
  const aura = useRef<THREE.Mesh>(null);
  const eyes = useRef<THREE.Group>(null);
  const trail = useMemo(() => {
    const mat = REALISTIC
      ? new THREE.MeshBasicMaterial({ color: '#4a2186', transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending })
      : surface({ color: '#3a1d63', emissive: '#7b3cff', emissiveIntensity: 0.3 });
    const im = new THREE.InstancedMesh(puffGeo, mat, TRAIL);
    im.frustumCulled = false;
    return { im, pts: Array.from({ length: TRAIL }, () => new THREE.Vector3(0, -999, 0)), head: 0, acc: 0 };
  }, []);
  const mats = useMemo(() => {
    const body = REALISTIC ? realisticBody() : surface({ color: '#3a1d63', emissive: '#7b3cff', emissiveIntensity: 0.35, transparent: true, roughness: 0.3 });
    const eye = new THREE.MeshBasicMaterial({ color: new THREE.Color('#9ffcff'), toneMapped: false });
    const glow = new THREE.MeshBasicMaterial({ color: '#8a4dff', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    // Soft violet aura around the realistic body (back faces only, so it reads as a halo).
    const aura = new THREE.MeshBasicMaterial({ color: '#3a1470', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide });
    return { body, eye, glow, aura };
  }, []);
  const m4 = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const sv = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, dt) => {
    const g = ref.current;
    if (!g) return;
    g.visible = w.alive;
    trail.im.visible = w.alive;
    if (!w.alive) {
      trail.pts.forEach((p) => p.set(0, -999, 0));
      return;
    }
    g.position.copy(w.pos);
    g.lookAt(player.pos.x, player.pos.y + 1.1, player.pos.z);
    const t = state.clock.elapsedTime + w.id;
    const fade = w.fading > 0 ? w.fading / 0.8 : 1;
    const squash = 1 + Math.sin(w.phase * 6) * 0.08 + w.charge * 0.12 * Math.sin(t * 40);
    g.scale.set((fade * (1 + w.charge * 0.15)) / squash, fade * squash, (fade * (1 + w.charge * 0.15)) / squash);
    // The tell: a violent shudder during the wind-up.
    if (shake.current) shake.current.position.set((Math.random() - 0.5) * 0.08 * w.charge, (Math.random() - 0.5) * 0.08 * w.charge, 0);
    if (eyes.current) eyes.current.scale.setScalar(1 + w.charge * 0.8);
    mats.eye.color.set(w.charge > 0.05 ? '#ffffff' : '#9ffcff').multiplyScalar(2 + w.charge * 4);

    const body = mats.body;
    body.opacity = (REALISTIC ? 0.94 : 1) * fade;
    if (REALISTIC) {
      (body.userData as { rim: { value: number } }).rim.value = w.flash > 0 ? 6 : 1 + w.charge * 3 + Math.sin(t * 3) * 0.2;
      if (core.current) {
        core.current.scale.setScalar(0.22 + w.charge * 0.12 + Math.sin(t * 5) * 0.02);
        mats.glow.opacity = (0.45 + w.charge * 0.4) * fade;
      }
      if (aura.current) {
        aura.current.scale.setScalar(0.68 + Math.sin(t * 2.3) * 0.05 + w.charge * 0.15);
        mats.aura.opacity = (0.2 + w.charge * 0.25) * fade;
      }
    } else {
      body.emissive.set(w.flash > 0 ? '#ffffff' : '#7b3cff');
      body.emissiveIntensity = w.flash > 0 ? 1.2 : 0.35 + w.charge * 0.8;
    }

    // Smoke tail: drop a puff every ~40 ms and draw the history shrinking away.
    trail.acc += dt;
    if (trail.acc > 0.04) {
      trail.acc = 0;
      trail.head = (trail.head + 1) % TRAIL;
      trail.pts[trail.head].copy(w.pos);
    }
    for (let i = 0; i < TRAIL; i++) {
      const age = (trail.head - i + TRAIL) % TRAIL;
      const k = 1 - age / TRAIL;
      sv.setScalar(Math.max(0.001, (REALISTIC ? 0.32 : 0.22) * k * fade * (1 + w.charge * 0.4)));
      m4.compose(trail.pts[i], q, sv);
      trail.im.setMatrixAt(i, m4);
    }
    trail.im.instanceMatrix.needsUpdate = true;
  });

  const ud = { kind: 'wisp', id: w.id };
  return (
    <>
      <primitive object={trail.im} />
      <group ref={ref} visible={false}>
        <group ref={shake}>
          <mesh geometry={bodyGeo} material={mats.body} castShadow userData={ud} />
          {REALISTIC && (
            <>
              <mesh ref={core} geometry={puffGeo} material={mats.glow} scale={0.22} userData={ud} />
              <mesh ref={aura} geometry={puffGeo} material={mats.aura} scale={0.68} />
            </>
          )}
          <group ref={eyes}>
            {[-1, 1].map((s) => (
              <mesh
                key={s}
                geometry={eyeGeo}
                material={mats.eye}
                position={[s * 0.15, 0.08, 0.39]}
                rotation={[0, 0, s * (REALISTIC ? 0.35 : 0)]}
                scale={REALISTIC ? [0.07, 0.026, 0.025] : 0.09}
                userData={ud}
              />
            ))}
          </group>
          <mesh geometry={hornGeo} material={mats.body} position={[0.2, 0.42, 0.05]} rotation={[0, 0, -0.4]} userData={ud} />
          <mesh geometry={hornGeo} material={mats.body} position={[-0.2, 0.42, 0.05]} rotation={[0, 0, 0.4]} userData={ud} />
          {!REALISTIC && <mesh geometry={tailGeo} material={mats.body} position={[0, -0.1, -0.5]} rotation={[-Math.PI / 2 - 0.3, 0, 0]} userData={ud} />}
        </group>
      </group>
    </>
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
      onHitPiece: (id, at) => gnawPiece(id, at, 'A Gloomwisp'),
      onDive: (w) => sfx.wispDive(w.pos),
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
