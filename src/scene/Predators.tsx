import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { player } from '../game/fx';
import { gnawPiece } from '../game/gnaw';
import { PREDATOR_INFO, PREDATORS, updatePredators, type Predator } from '../game/predators';
import { sfx } from '../game/sound';
import { useGame } from '../game/store';
import { ellipsoid, mirrorX, roundCone } from './sdf';
import { geo, toon } from './materials';
import { REALISTIC } from './quality';
import { lowerLeg, patternMaterial, plain, sculpt } from './RealisticAnimals';

/**
 * Night predators in both art styles. Realistic versions use the same sculpt +
 * pattern-shader pipeline as the farm animals; toon versions use chunky rounded
 * boxes like the rest of the stylised world.
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------
// Realistic geometry (built lazily once)

let built: ReturnType<typeof build> | null = null;
function build() {
  const wolfBody = sculpt(
    [
      ellipsoid(0, 0.62, 0.25, 0.17, 0.22, 0.3),
      ellipsoid(0, 0.62, -0.2, 0.13, 0.15, 0.3),
      ellipsoid(0, 0.64, -0.42, 0.15, 0.17, 0.17),
      mirrorX(ellipsoid(0.1, 0.62, 0.32, 0.09, 0.17, 0.12)),
      mirrorX(roundCone([0.1, 0.62, -0.42], [0.11, 0.36, -0.48], 0.11, 0.05)),
      mirrorX(roundCone([0.1, 0.56, 0.33], [0.1, 0.34, 0.36], 0.07, 0.045)),
      roundCone([0, 0.7, 0.45], [0, 0.82, 0.62], 0.13, 0.1),
      ellipsoid(0, 0.72, 0.5, 0.15, 0.17, 0.13),
    ],
    0.06,
    V(-0.32, 0.26, -0.7),
    V(0.32, 1.0, 0.78),
    72,
  );
  const wolfHead = sculpt(
    [
      ellipsoid(0, 0.02, 0.04, 0.1, 0.09, 0.11),
      roundCone([0, -0.01, 0.08], [0, -0.04, 0.28], 0.07, 0.04),
      ellipsoid(0, -0.06, 0.14, 0.06, 0.035, 0.12),
      mirrorX(ellipsoid(0.06, -0.01, 0.05, 0.05, 0.05, 0.06)),
    ],
    0.035,
    V(-0.17, -0.15, -0.1),
    V(0.17, 0.15, 0.35),
    48,
  );
  const wolfTail = sculpt(
    [roundCone([0, 0, 0], [0, -0.18, -0.34], 0.045, 0.07), ellipsoid(0, -0.2, -0.36, 0.07, 0.08, 0.1)],
    0.04,
    V(-0.12, -0.34, -0.5),
    V(0.12, 0.08, 0.06),
    36,
  );
  const shardBody = sculpt(
    [
      ellipsoid(0, 0.55, 0, 0.7, 0.42, 0.85),
      ellipsoid(0, 0.38, 0, 0.56, 0.24, 0.72),
      ellipsoid(0, 0.36, 0.82, 0.28, 0.2, 0.25),
      roundCone([0, 0.92, 0.55], [0, 0.95, -0.6], 0.12, 0.1),
      mirrorX(roundCone([0.35, 0.82, 0.45], [0.4, 0.8, -0.5], 0.09, 0.08)),
      mirrorX(ellipsoid(0.14, 0.28, 1.02, 0.06, 0.05, 0.12)),
    ],
    0.1,
    V(-0.85, 0.1, -1.0),
    V(0.85, 1.1, 1.2),
    72,
  );
  const shardLeg = sculpt(
    [roundCone([0, 0, 0], [0.22, -0.16, 0], 0.09, 0.07), roundCone([0.22, -0.16, 0], [0.32, -0.42, 0], 0.07, 0.035)],
    0.04,
    V(-0.12, -0.48, -0.12),
    V(0.42, 0.12, 0.12),
    40,
  );
  return { wolfBody, wolfHead, wolfTail, wolfLeg: lowerLeg(0.36, 0.045, 0.028), shardBody, shardLeg };
}
const geos = () => (built ??= build());

const WOLF_FUR = `
  float streak = snoise(vObj * vec3(22.0, 7.0, 22.0) + uSeed) * 0.5 + 0.5;
  float back = smoothstep(0.46, 0.78, vObj.y);
  vec3 c = mix(vec3(0.2, 0.19, 0.18), vec3(0.035, 0.035, 0.04), back);
  diffuseColor.rgb = c * (0.8 + 0.35 * streak);`;
const WOLF_HEAD = `
  float muzzle = smoothstep(0.12, 0.26, vObj.z) * smoothstep(0.0, -0.06, vObj.y);
  vec3 c = mix(vec3(0.05, 0.05, 0.055), vec3(0.2, 0.19, 0.18), muzzle);
  diffuseColor.rgb = c * (0.88 + 0.2 * snoise(vObj * 30.0 + uSeed));`;
const WOLF_LEG = `
  diffuseColor.rgb = vec3(0.05, 0.05, 0.055) * (0.9 + 0.2 * snoise(vObj * 25.0 + uSeed));`;
const SHARD_SHELL = `
  float n = snoise(vObj * 3.2 + uSeed);
  float crack = 1.0 - smoothstep(0.0, 0.06, abs(snoise(vObj * 5.0 + uSeed * 0.5)));
  float vein = 1.0 - smoothstep(0.0, 0.025, abs(snoise(vObj * 2.2 + 7.0)));
  vec3 stone = vec3(0.17, 0.18, 0.22) * (0.85 + 0.25 * n);
  stone = mix(stone, vec3(0.05, 0.05, 0.07), crack * 0.8);
  stone = mix(stone, vec3(0.2, 0.32, 0.18), smoothstep(0.55, 0.8, snoise(vObj * 6.0 + 3.0)) * 0.4);
  diffuseColor.rgb = mix(stone, vec3(0.25, 0.85, 0.95), vein * smoothstep(0.6, 0.8, vObj.y));`;

// ---------------------------------------------------------------------------
// Rig + animation shared by both styles

interface Rig {
  body: THREE.Object3D | null;
  head: THREE.Object3D | null;
  tail: THREE.Object3D | null;
  legs: { pivot: THREE.Object3D | null; phase: number; axis: 'x' | 'y' }[];
}

type Mats = Record<string, THREE.Material & { emissive?: THREE.Color; emissiveIntensity?: number }>;

function eyeMat(color: string) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3), toneMapped: false });
}

function makeMats(p: Predator): Mats {
  const seed = p.id * 17.3;
  if (p.kind === 'duskwolf') {
    return REALISTIC
      ? {
          body: patternMaterial('wolf-fur', WOLF_FUR, seed, { roughness: 0.92, sheen: 0.15, sheenColor: '#8a8a96' }),
          head: patternMaterial('wolf-head', WOLF_HEAD, seed, { roughness: 0.92, sheen: 0.15, sheenColor: '#8a8a96' }),
          leg: patternMaterial('wolf-leg', WOLF_LEG, seed, { roughness: 0.92, sheen: 0.1, sheenColor: '#8a8a96' }),
          dark: plain('#0b0a0b', 0.4),
          eye: eyeMat('#ffb020'),
        }
      : { body: toon('#3a3a44'), head: toon('#3a3a44'), leg: toon('#2a2a32'), dark: toon('#141418'), eye: eyeMat('#ffb020') };
  }
  return REALISTIC
    ? {
        body: patternMaterial('shard-shell', SHARD_SHELL, seed, { roughness: 0.75, sheen: 0 }),
        leg: plain('#1d1c22', 0.6),
        crystal: new THREE.MeshPhysicalMaterial({ color: '#7ff4ff', emissive: '#29d8f0', emissiveIntensity: 2.2, roughness: 0.1, transmission: 0.3, thickness: 0.3 }),
        eye: eyeMat('#59f2ff'),
      }
    : { body: toon('#4a4660'), leg: toon('#2e2c3a'), crystal: toon('#4ff0ff', 1.8), eye: eyeMat('#59f2ff') };
}

function Duskwolf({ rig, m, ud }: { rig: Rig; m: Mats; ud: Record<string, unknown> }) {
  const legPos: [number, number, number, number][] = [
    [0.1, 0.34, 0.36, 0], [-0.1, 0.34, 0.36, Math.PI], [0.11, 0.36, -0.48, Math.PI], [-0.11, 0.36, -0.48, 0],
  ];
  if (REALISTIC) {
    const g = geos();
    return (
      <>
        <group ref={(o) => void (rig.body = o)}>
          <mesh geometry={g.wolfBody} material={m.body} castShadow userData={ud} />
          <group ref={(o) => void (rig.head = o)} position={[0, 0.84, 0.66]}>
            <mesh geometry={g.wolfHead} material={m.head} castShadow userData={ud} />
            <mesh geometry={geo.box} material={m.dark} position={[0, -0.03, 0.29]} scale={0.035} userData={ud} />
            {[-1, 1].map((s) => (
              <group key={s}>
                <mesh material={m.eye} position={[s * 0.055, 0.035, 0.11]} scale={[0.016, 0.011, 0.01]} userData={ud}>
                  <sphereGeometry args={[1, 10, 8]} />
                </mesh>
                <mesh material={m.head} position={[s * 0.06, 0.12, -0.01]} rotation={[-0.15, 0, -s * 0.2]} scale={[0.035, 0.085, 0.022]} castShadow userData={ud}>
                  <coneGeometry args={[1, 1, 8]} />
                </mesh>
              </group>
            ))}
          </group>
          <group ref={(o) => void (rig.tail = o)} position={[0, 0.7, -0.58]}>
            <mesh geometry={g.wolfTail} material={m.body} castShadow userData={ud} />
          </group>
        </group>
        {legPos.map(([x, y, z, ph], i) => (
          <group key={i} position={[x, y, z]} ref={(o) => void (rig.legs[i] = { pivot: o, phase: ph, axis: 'x' })}>
            <mesh geometry={g.wolfLeg} material={m.leg} castShadow userData={ud} />
            <mesh geometry={geo.box} material={m.dark} position={[0, -0.35, 0.02]} scale={[0.05, 0.025, 0.07]} userData={ud} />
          </group>
        ))}
      </>
    );
  }
  return (
    <>
      <group ref={(o) => void (rig.body = o)}>
        <RoundedBox args={[0.34, 0.36, 0.95]} radius={0.12} position={[0, 0.6, 0]} material={m.body} castShadow userData={ud} />
        <group ref={(o) => void (rig.head = o)} position={[0, 0.78, 0.55]}>
          <RoundedBox args={[0.28, 0.26, 0.3]} radius={0.08} material={m.head} castShadow userData={ud} />
          <RoundedBox args={[0.14, 0.12, 0.2]} radius={0.04} position={[0, -0.05, 0.22]} material={m.head} userData={ud} />
          <mesh geometry={geo.box} material={m.dark} position={[0, -0.02, 0.33]} scale={0.05} userData={ud} />
          {[-1, 1].map((s) => (
            <group key={s}>
              <mesh geometry={geo.box} material={m.eye} position={[s * 0.07, 0.04, 0.151]} scale={[0.06, 0.03, 0.01]} userData={ud} />
              <mesh material={m.head} position={[s * 0.08, 0.17, -0.03]} scale={[0.05, 0.1, 0.03]} userData={ud}>
                <coneGeometry args={[1, 1, 4]} />
              </mesh>
            </group>
          ))}
        </group>
        <group ref={(o) => void (rig.tail = o)} position={[0, 0.66, -0.48]}>
          <RoundedBox args={[0.12, 0.12, 0.42]} radius={0.05} position={[0, -0.08, -0.18]} rotation={[0.45, 0, 0]} material={m.body} userData={ud} />
        </group>
      </group>
      {legPos.map(([x, , z, ph], i) => (
        <group key={i} position={[x, 0.42, z]} ref={(o) => void (rig.legs[i] = { pivot: o, phase: ph, axis: 'x' })}>
          <mesh geometry={geo.box} material={m.leg} position={[0, -0.21, 0]} scale={[0.1, 0.42, 0.1]} castShadow userData={ud} />
        </group>
      ))}
    </>
  );
}

const CRYSTALS: [number, number, number, number, number, number][] = [
  [0, 1.0, 0.25, 0.1, 0, 1.2], [0.25, 0.92, -0.1, 0.3, 0.6, 1.0], [-0.28, 0.9, 0.05, -0.35, 0.4, 0.9],
  [0.05, 0.98, -0.45, -0.15, 1.1, 1.1], [-0.12, 0.96, 0.55, 0.2, 2.0, 0.8], [0.38, 0.8, 0.4, 0.5, 0.3, 0.7],
  [-0.4, 0.78, -0.4, -0.55, 1.4, 0.75], [0.15, 0.95, -0.15, 0.05, 2.4, 0.6],
];

function Shardback({ rig, m, ud }: { rig: Rig; m: Mats; ud: Record<string, unknown> }) {
  const legs: [number, number, number][] = [
    [1, 0.42, 0.45], [-1, 0.42, 0.45], [1, 0.42, 0], [-1, 0.42, 0], [1, 0.42, -0.45], [-1, 0.42, -0.45],
  ];
  const g = REALISTIC ? geos() : null;
  return (
    <>
      <group ref={(o) => void (rig.body = o)}>
        {g ? (
          <mesh geometry={g.shardBody} material={m.body} castShadow receiveShadow userData={ud} />
        ) : (
          <>
            <mesh geometry={geo.rock[0]} material={m.body} position={[0, 0.55, 0]} scale={[0.75, 0.45, 0.9]} castShadow userData={ud} />
            <RoundedBox args={[0.5, 0.3, 0.4]} radius={0.1} position={[0, 0.38, 0.82]} material={m.body} userData={ud} />
          </>
        )}
        <group ref={(o) => void (rig.head = o)} position={[0, 0.4, 0.95]}>
          {[-1, 1].map((s) => (
            <mesh key={s} material={m.eye} position={[s * 0.12, 0.04, 0.08]} scale={[0.03, 0.022, 0.015]} userData={ud}>
              <sphereGeometry args={[1, 10, 8]} />
            </mesh>
          ))}
        </group>
        {CRYSTALS.map(([x, y, z, tilt, spin, s], i) => (
          <mesh key={i} geometry={geo.crystal} material={m.crystal} position={[x, y, z]} rotation={[tilt * 0.7, spin, tilt]} scale={[s * 0.55, s * 1.4, s * 0.55]} castShadow userData={ud} />
        ))}
      </group>
      {legs.map(([side, y, z], i) => (
        <group key={i} position={[side * 0.52, y, z]} ref={(o) => void (rig.legs[i] = { pivot: o, phase: (i % 2) * Math.PI + z, axis: 'y' })}>
          {g ? (
            <mesh geometry={g.shardLeg} material={m.leg} scale={[side, 1, 1]} castShadow userData={ud} />
          ) : (
            <mesh geometry={geo.box} material={m.leg} position={[side * 0.16, -0.2, 0]} rotation={[0, 0, side * -0.7]} scale={[0.1, 0.45, 0.1]} castShadow userData={ud} />
          )}
        </group>
      ))}
    </>
  );
}

function PredatorView({ p }: { p: Predator }) {
  const group = useRef<THREE.Group>(null);
  const rig = useRef<Rig>({ body: null, head: null, tail: null, legs: [] });
  const mats = useMemo(() => makeMats(p), [p]);
  const ud = useMemo(() => ({ kind: 'predator', id: p.id }), [p.id]);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    g.visible = p.alive;
    if (!p.alive) return;
    const sink = (1 - p.presence) * (p.kind === 'duskwolf' ? 0.9 : 1.3);
    g.position.set(p.x, p.y - sink, p.z);
    g.rotation.y = p.heading;
    const r = rig.current;
    const moving = p.state === 'chase' ? 1 : 0.55;
    const t = state.clock.elapsedTime + p.id;
    for (const leg of r.legs) {
      if (!leg?.pivot) continue;
      const s = Math.sin(p.phase + leg.phase) * moving;
      if (leg.axis === 'x') leg.pivot.rotation.x = s * 0.6;
      else leg.pivot.rotation.y = s * 0.35;
    }
    const strike = p.strike >= 0 ? Math.sin(p.strike * Math.PI) : 0;
    if (r.body) {
      if (p.kind === 'duskwolf') {
        r.body.position.set(0, Math.abs(Math.sin(p.phase)) * 0.03 * moving, strike * 0.35);
      } else {
        // Shardback rears up then slams down.
        r.body.position.y = strike * 0.35 - (p.strike > 0.7 ? (p.strike - 0.7) * 0.4 : 0);
        r.body.rotation.x = -strike * 0.25;
      }
    }
    if (r.head) r.head.rotation.x = p.kind === 'duskwolf' ? (p.state === 'chase' ? 0.15 : 0.35) - strike * 0.4 + Math.sin(t * 2) * 0.03 : 0;
    if (r.tail) {
      r.tail.rotation.y = Math.sin(t * (p.state === 'chase' ? 6 : 2)) * 0.25;
      r.tail.rotation.x = p.state === 'chase' ? -0.35 : 0;
    }
    const f = p.flash > 0 ? 0.8 : 0;
    for (const mat of Object.values(mats)) {
      if (mat.emissive && mat !== mats.crystal && !(mat instanceof THREE.MeshBasicMaterial)) {
        mat.emissive.set('#ff2a2a');
        mat.emissiveIntensity = f;
      }
    }
  });

  const props = { rig: rig.current, m: mats, ud };
  return <group ref={group}>{p.kind === 'duskwolf' ? <Duskwolf {...props} /> : <Shardback {...props} />}</group>;
}

const hitPos = new THREE.Vector3();

export function Predators() {
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    updatePredators(dt, player.pos, {
      onBite: (p, dir) => {
        if (p.kind === 'duskwolf') sfx.bite({ x: p.x, y: p.y + 0.7, z: p.z });
        else sfx.slam({ x: p.x, y: p.y + 0.5, z: p.z });
        const push = p.kind === 'duskwolf' ? 6 : 9;
        player.vel.x += dir.x * push;
        player.vel.z += dir.z * push;
        player.vel.y = Math.max(player.vel.y, p.kind === 'duskwolf' ? 3 : 5);
        player.onGround = false;
        useGame.getState().hurt(PREDATOR_INFO[p.kind].damage, `a ${PREDATOR_INFO[p.kind].name}`);
      },
      onGnaw: (id, p) => gnawPiece(id, hitPos.set(p.x, p.y + 0.6, p.z), `A ${PREDATOR_INFO[p.kind].name}`),
    });
  });
  return (
    <>
      {PREDATORS.map((p) => (
        <PredatorView key={p.id} p={p} />
      ))}
    </>
  );
}
