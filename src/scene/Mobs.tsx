import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { player } from '../game/fx';
import { MOBS, updateMobs, type Mob } from '../game/mobs';
import type { MobType } from '../game/world';
import { cowHide, featherCoat, furNormal, pigSkin } from './animalTextures';
import { surface, type Surface } from './materials';
import { REALISTIC } from './quality';
import { RealChicken, RealCow, RealPig, realMats, type RealMats } from './RealisticAnimals';

// ---------------------------------------------------------------------------
// Geometry helpers (shared by every instance of a species)

type Profile = (t: number) => [number, number, number];

/**
 * A sphere stretched along +z whose cross-section is shaped per slice:
 * profile(t) → [x scale, y scale, y offset], t = 0 at the back, 1 at the front.
 * Gives organic torsos, necks and heads with sphere UVs for the hide textures.
 */
function organic(len: number, rx: number, ry: number, profile: Profile = () => [1, 1, 0], seg = 32): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7));
  g.rotateX(Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    const [fx, fy, dy] = profile((z + 1) / 2);
    p.setXYZ(i, p.getX(i) * rx * fx, p.getY(i) * ry * fy + dy, (z * len) / 2);
  }
  g.computeVertexNormals();
  return g;
}

/** Tapered limb segment hanging down from its pivot (top at y = 0, length 1). */
const limb = new THREE.CylinderGeometry(1, 0.72, 1, 12).translate(0, -0.5, 0);
const pad = new THREE.CylinderGeometry(1, 1.1, 1, 12).translate(0, -0.5, 0);
const ball = new THREE.SphereGeometry(1, 20, 14);
const cone = new THREE.ConeGeometry(1, 1, 12);
const disc = new THREE.CylinderGeometry(1, 1, 1, 18).rotateX(Math.PI / 2);
const curl = new THREE.TorusGeometry(0.05, 0.014, 8, 16, Math.PI * 1.7);

const bulge = (t: number) => Math.sin(Math.PI * t);

const G = {
  cow: {
    torso: organic(1.95, 0.38, 0.44, (t) => [0.9 + 0.22 * t, 0.92 + 0.14 * t, -0.05 * bulge(t)]),
    neck: organic(0.72, 0.2, 0.26, (t) => [1.15 - 0.35 * t, 1.1 - 0.3 * t, 0]),
    head: organic(0.62, 0.17, 0.2, (t) => [1.05 - 0.35 * t, 1.05 - 0.3 * t, -0.04 * t]),
  },
  pig: {
    torso: organic(1.25, 0.34, 0.33, (t) => [0.95 + 0.1 * t, 0.97 + 0.06 * t, -0.03 * bulge(t)]),
    head: organic(0.5, 0.23, 0.22, (t) => [1.05 - 0.28 * t, 1 - 0.22 * t, -0.02 * t]),
  },
  chicken: {
    body: organic(0.44, 0.155, 0.17, (t) => [1, 1.08 - 0.2 * (1 - t), 0.03 * (1 - t)]),
    neck: organic(0.22, 0.062, 0.062),
  },
};

// ---------------------------------------------------------------------------
// Rig: animated joints collected from the model via callback refs.

interface LegRig {
  hip: THREE.Object3D | null;
  knee: THREE.Object3D | null;
  phase: number;
}

interface Rig {
  body: THREE.Object3D | null;
  head: THREE.Object3D | null;
  headBase: number;
  tail: THREE.Object3D | null;
  legs: LegRig[];
  wings: (THREE.Object3D | null)[];
}

type Mats = Record<string, Surface>;

function makeMats(type: MobType): Mats {
  const eye = surface({ color: '#0b0a0c', roughness: 0.08 });
  if (type === 'cow') {
    return {
      hide: surface({ map: cowHide, normalMap: furNormal, normalScale: 0.6, roughness: 0.88 }),
      nose: surface({ color: '#dc9b90', roughness: 0.45 }),
      hoof: surface({ color: '#2a2320', roughness: 0.55 }),
      horn: surface({ color: '#e6dabd', roughness: 0.45 }),
      dark: surface({ color: '#1e1b1d', roughness: 0.9 }),
      eye,
    };
  }
  if (type === 'pig') {
    return {
      skin: surface({ map: pigSkin, normalMap: furNormal, normalScale: 0.25, roughness: 0.7 }),
      snout: surface({ color: '#e08a8a', roughness: 0.5 }),
      hoof: surface({ color: '#5a3d33', roughness: 0.55 }),
      dark: surface({ color: '#3a2626', roughness: 0.8 }),
      eye,
    };
  }
  return {
    feathers: surface({ map: featherCoat, normalMap: furNormal, normalScale: 0.5, roughness: 0.92 }),
    comb: surface({ color: '#d4232a', roughness: 0.55 }),
    beak: surface({ color: '#eea52e', roughness: 0.5 }),
    legs: surface({ color: '#efb13c', roughness: 0.6 }),
    eye,
  };
}

interface PartProps {
  rig: Rig;
  m: Mats;
  ud: Record<string, unknown>;
}

function Leg({
  rig, i, phase, at, upper, lower, foot, r, mat, footMat, ud,
}: {
  rig: Rig; i: number; phase: number; at: [number, number, number];
  upper: number; lower: number; foot: number; r: [number, number, number];
  mat: Surface; footMat: Surface; ud: Record<string, unknown>;
}) {
  const slot = () => (rig.legs[i] ??= { hip: null, knee: null, phase });
  return (
    <group position={at} ref={(o) => void (slot().hip = o)}>
      <mesh geometry={limb} material={mat} scale={[r[0], upper, r[0]]} castShadow userData={ud} />
      <group position={[0, -upper, 0]} ref={(o) => void (slot().knee = o)}>
        <mesh geometry={limb} material={mat} scale={[r[1], lower, r[1]]} castShadow userData={ud} />
        <mesh geometry={pad} material={footMat} position={[0, -lower, 0]} scale={[r[2], foot, r[2]]} castShadow userData={ud} />
      </group>
    </group>
  );
}

function Cow({ rig, m, ud }: PartProps) {
  rig.headBase = 0.45;
  const legs: [number, number, number, number][] = [
    [0.22, 0.62, 0, 0], [-0.22, 0.62, Math.PI, 1], [0.22, -0.68, Math.PI, 2], [-0.22, -0.68, 0, 3],
  ];
  return (
    <>
      <group ref={(o) => void (rig.body = o)}>
        <mesh geometry={G.cow.torso} material={m.hide} position={[0, 1.08, -0.05]} castShadow receiveShadow userData={ud} />
        <mesh geometry={ball} material={m.nose} position={[0, 0.7, -0.42]} scale={[0.16, 0.1, 0.2]} userData={ud} />
        <mesh geometry={G.cow.neck} material={m.hide} position={[0, 1.28, 0.9]} rotation={[-0.75, 0, 0]} castShadow userData={ud} />
        <group ref={(o) => void (rig.head = o)} position={[0, 1.42, 1.12]} rotation={[0.45, 0, 0]}>
          <mesh geometry={G.cow.head} material={m.hide} position={[0, 0, 0.26]} castShadow userData={ud} />
          <mesh geometry={ball} material={m.nose} position={[0, -0.05, 0.55]} scale={[0.15, 0.12, 0.13]} userData={ud} />
          {[-1, 1].map((s) => (
            <group key={s}>
              <mesh geometry={ball} material={m.dark} position={[s * 0.05, -0.03, 0.665]} scale={0.024} userData={ud} />
              <mesh geometry={ball} material={m.eye} position={[s * 0.145, 0.07, 0.3]} scale={0.038} userData={ud} />
              <mesh geometry={ball} material={m.hide} position={[s * 0.23, 0.09, 0.12]} rotation={[0, 0, s * 0.35]} scale={[0.13, 0.035, 0.07]} userData={ud} />
              <mesh geometry={cone} material={m.horn} position={[s * 0.13, 0.2, 0.1]} rotation={[0, 0, -s * 0.9]} scale={[0.032, 0.15, 0.032]} userData={ud} />
            </group>
          ))}
        </group>
        <group ref={(o) => void (rig.tail = o)} position={[0, 1.34, -1]}>
          <mesh geometry={limb} material={m.hide} rotation={[0.25, 0, 0]} scale={[0.025, 0.75, 0.025]} userData={ud} />
          <mesh geometry={ball} material={m.dark} position={[0, -0.74, -0.19]} scale={[0.05, 0.11, 0.05]} userData={ud} />
        </group>
      </group>
      {legs.map(([x, z, phase, i]) => (
        <Leg key={i} rig={rig} i={i} phase={phase} at={[x, 0.9, z]} upper={0.42} lower={0.4} foot={0.08}
          r={[0.11, 0.068, 0.06]} mat={m.hide} footMat={m.hoof} ud={ud} />
      ))}
    </>
  );
}

function Pig({ rig, m, ud }: PartProps) {
  rig.headBase = 0.15;
  const legs: [number, number, number, number][] = [
    [0.17, 0.36, 0, 0], [-0.17, 0.36, Math.PI, 1], [0.17, -0.36, Math.PI, 2], [-0.17, -0.36, 0, 3],
  ];
  return (
    <>
      <group ref={(o) => void (rig.body = o)}>
        <mesh geometry={G.pig.torso} material={m.skin} position={[0, 0.6, 0]} castShadow receiveShadow userData={ud} />
        <group ref={(o) => void (rig.head = o)} position={[0, 0.66, 0.58]} rotation={[0.15, 0, 0]}>
          <mesh geometry={G.pig.head} material={m.skin} position={[0, 0, 0.18]} castShadow userData={ud} />
          <mesh geometry={disc} material={m.snout} position={[0, -0.03, 0.43]} scale={[0.1, 0.075, 0.08]} userData={ud} />
          {[-1, 1].map((s) => (
            <group key={s}>
              <mesh geometry={ball} material={m.dark} position={[s * 0.035, -0.03, 0.475]} scale={[0.02, 0.026, 0.01]} userData={ud} />
              <mesh geometry={ball} material={m.eye} position={[s * 0.13, 0.08, 0.27]} scale={0.03} userData={ud} />
              <mesh geometry={cone} material={m.skin} position={[s * 0.13, 0.2, 0.1]} rotation={[0.9, 0, s * 0.4]} scale={[0.09, 0.14, 0.035]} userData={ud} />
            </group>
          ))}
        </group>
        <group ref={(o) => void (rig.tail = o)} position={[0, 0.72, -0.63]}>
          <mesh geometry={curl} material={m.skin} rotation={[0, Math.PI / 2, 0]} userData={ud} />
        </group>
      </group>
      {legs.map(([x, z, phase, i]) => (
        <Leg key={i} rig={rig} i={i} phase={phase} at={[x, 0.37, z]} upper={0.17} lower={0.15} foot={0.05}
          r={[0.075, 0.055, 0.045]} mat={m.skin} footMat={m.hoof} ud={ud} />
      ))}
    </>
  );
}

function Chicken({ rig, m, ud }: PartProps) {
  rig.headBase = 0;
  return (
    <>
      <group ref={(o) => void (rig.body = o)}>
        <mesh geometry={G.chicken.body} material={m.feathers} position={[0, 0.36, 0]} rotation={[-0.2, 0, 0]} castShadow userData={ud} />
        <mesh geometry={G.chicken.neck} material={m.feathers} position={[0, 0.5, 0.14]} rotation={[-1.1, 0, 0]} userData={ud} />
        <group ref={(o) => void (rig.head = o)} position={[0, 0.6, 0.16]}>
          <mesh geometry={ball} material={m.feathers} scale={0.085} castShadow userData={ud} />
          <mesh geometry={cone} material={m.beak} position={[0, -0.01, 0.1]} rotation={[Math.PI / 2, 0, 0]} scale={[0.028, 0.07, 0.028]} userData={ud} />
          {[-0.035, 0, 0.035].map((z, k) => (
            <mesh key={z} geometry={ball} material={m.comb} position={[0, 0.085 + (k === 1 ? 0.012 : 0), z]} scale={0.03} userData={ud} />
          ))}
          <mesh geometry={ball} material={m.comb} position={[0, -0.065, 0.07]} scale={[0.02, 0.035, 0.02]} userData={ud} />
          {[-1, 1].map((s) => (
            <mesh key={s} geometry={ball} material={m.eye} position={[s * 0.07, 0.02, 0.04]} scale={0.016} userData={ud} />
          ))}
        </group>
        {[-1, 1].map((s, k) => (
          <group key={s} position={[s * 0.15, 0.44, 0]} ref={(o) => void (rig.wings[k] = o)}>
            <mesh geometry={ball} material={m.feathers} position={[0, -0.08, -0.02]} scale={[0.035, 0.11, 0.17]} castShadow userData={ud} />
          </group>
        ))}
        {[-0.4, 0, 0.4].map((r) => (
          <mesh key={r} geometry={ball} material={m.feathers} position={[r * 0.05, 0.5, -0.2]} rotation={[-0.6, 0, r]} scale={[0.02, 0.1, 0.06]} userData={ud} />
        ))}
      </group>
      {[-1, 1].map((s, i) => (
        <Leg key={s} rig={rig} i={i} phase={i * Math.PI} at={[s * 0.05, 0.23, 0]} upper={0.08} lower={0.13} foot={0.015}
          r={[0.035, 0.012, 0.035]} mat={m.legs} footMat={m.legs} ud={ud} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------

function MobView({ mob }: { mob: Mob }) {
  const group = useRef<THREE.Group>(null);
  const rig = useRef<Rig>({ body: null, head: null, headBase: 0, tail: null, legs: [], wings: [] });
  const mats = useMemo<Mats>(() => (REALISTIC ? realMats(mob.type, mob.id * 13.7) : makeMats(mob.type)), [mob.type, mob.id]);
  const matList = useMemo(() => Object.values(mats), [mats]);
  const gait = useRef(0);
  const ud = useMemo(() => ({ kind: 'mob', id: mob.id }), [mob.id]);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    // Skip far-away animals entirely (each is 15–30 parts, drawn twice with shadows); haze hides the cut.
    const dx = mob.x - player.pos.x;
    const dz = mob.z - player.pos.z;
    g.visible = !mob.dead && dx * dx + dz * dz < 90 * 90;
    if (!g.visible) return;
    g.position.set(mob.x, mob.y + mob.hop, mob.z);
    g.rotation.y = mob.heading;

    const t = state.clock.elapsedTime + mob.id * 1.7;
    const r = rig.current;
    gait.current += ((mob.state === 'idle' ? 0 : 1) - gait.current) * Math.min(1, dt * 6);
    const w = gait.current;

    for (const leg of r.legs) {
      if (!leg) continue;
      const s = Math.sin(mob.phase + leg.phase);
      if (leg.hip) leg.hip.rotation.x = s * 0.5 * w;
      if (leg.knee) leg.knee.rotation.x = Math.max(0, Math.sin(mob.phase + leg.phase - 0.9)) * 0.75 * w;
    }
    if (r.body) r.body.position.y = Math.abs(Math.sin(mob.phase)) * 0.025 * w;

    if (r.head) {
      // Idle animals graze (cow, pig) or peck (chicken) on and off.
      const grazing = mob.state === 'idle' && (t * 0.25) % 3 < 1.6;
      let target = r.headBase;
      if (grazing) target += mob.type === 'chicken' ? Math.pow(Math.max(0, Math.sin(t * 7)), 6) * 1.1 : 0.85;
      else target += Math.sin(mob.phase * 2) * 0.05 * w;
      r.head.rotation.x += (target - r.head.rotation.x) * Math.min(1, dt * (mob.type === 'chicken' ? 18 : 3));
    }
    if (r.tail) r.tail.rotation.z = Math.sin(t * (mob.type === 'pig' ? 9 : 2.2)) * (mob.type === 'pig' ? 0.35 : 0.28);
    r.wings.forEach((wing, k) => {
      if (!wing) return;
      const flap = mob.state === 'flee' || mob.hop > 0 ? (Math.sin(mob.phase * 4) * 0.5 + 0.5) * 1.1 : 0.04;
      wing.rotation.z = flap * (k === 0 ? -1 : 1);
    });

    const f = mob.flash > 0 ? 0.8 : 0;
    for (const m of matList) {
      m.emissive.set('#ff2a2a');
      m.emissiveIntensity = f;
    }
  });

  const props = { rig: rig.current, m: mats, ud };
  if (REALISTIC) {
    const rp = { rig: rig.current, m: mats as RealMats, ud };
    return (
      <group ref={group}>
        {mob.type === 'cow' ? <RealCow {...rp} /> : mob.type === 'pig' ? <RealPig {...rp} /> : <RealChicken {...rp} />}
      </group>
    );
  }
  return (
    <group ref={group}>
      {mob.type === 'cow' ? <Cow {...props} /> : mob.type === 'pig' ? <Pig {...props} /> : <Chicken {...props} />}
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
