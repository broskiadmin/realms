import * as THREE from 'three';
import type { MobType } from '../game/world';
import { ellipsoid, mirrorX, polygonize, roundCone, unionAll, type SDF } from './sdf';

/**
 * Realistic-mode farm animals. Each body and head is one seamless surface
 * sculpted from blended anatomical shapes (barrel, shoulders, haunches, thighs,
 * skull, muzzle) and polygonised once. Hides are painted in 3D by a fur shader
 * (Holstein patches, mottled/muddy pig skin, layered feathers) with velvet sheen.
 * Lower legs, tails, ears and wings stay separate so they can animate.
 */

// ---------------------------------------------------------------------------
// Geometry (built lazily once per species)

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
type P3 = [number, number, number];

function sculpt(parts: SDF[], k: number, min: THREE.Vector3, max: THREE.Vector3, res: number) {
  return polygonize(unionAll(parts, k), min, max, res);
}

function lowerLeg(len: number, r0: number, r1: number): THREE.BufferGeometry {
  return sculpt(
    [
      roundCone([0, 0.02, 0], [0, -len * 0.62, 0], r0, r1),
      ellipsoid(0, -len * 0.66, 0.008, r1 * 1.25, r1 * 1.15, r1 * 1.25),
      roundCone([0, -len * 0.68, 0.008], [0, -len * 0.86, 0.025], r1 * 1.05, r1 * 0.95),
    ],
    0.03,
    V(-0.12, -len, -0.12),
    V(0.12, 0.1, 0.14),
    44,
  );
}

let built: ReturnType<typeof build> | null = null;

function build() {
  const cowBody = sculpt(
    [
      ellipsoid(0, 1.08, -0.05, 0.37, 0.42, 0.9),
      ellipsoid(0, 1.1, 0.5, 0.33, 0.43, 0.45),
      ellipsoid(0, 1.16, -0.72, 0.33, 0.35, 0.36),
      mirrorX(ellipsoid(0.2, 1.36, -0.86, 0.1, 0.09, 0.1)),
      mirrorX(ellipsoid(0.24, 1.33, -0.5, 0.1, 0.08, 0.1)),
      roundCone([0, 1.4, 0.55], [0, 1.42, -0.85], 0.11, 0.1),
      ellipsoid(0, 0.84, 0, 0.33, 0.26, 0.6),
      mirrorX(ellipsoid(0.17, 1.12, 0.55, 0.17, 0.3, 0.22)),
      mirrorX(roundCone([0.19, 0.98, 0.6], [0.19, 0.56, 0.64], 0.13, 0.075)),
      mirrorX(roundCone([0.19, 1.12, -0.72], [0.2, 0.58, -0.82], 0.19, 0.08)),
      ellipsoid(0, 0.72, -0.42, 0.17, 0.13, 0.21),
      roundCone([0, 1.22, 0.75], [0, 1.36, 1.12], 0.28, 0.19),
      ellipsoid(0, 1.0, 0.92, 0.09, 0.2, 0.2),
    ],
    0.12,
    V(-0.55, 0.45, -1.2),
    V(0.55, 1.62, 1.38),
    96,
  );
  const cowHead = sculpt(
    [
      ellipsoid(0, 0.04, 0.12, 0.14, 0.16, 0.2),
      ellipsoid(0, 0.16, 0.02, 0.12, 0.07, 0.08),
      roundCone([0, 0.02, 0.18], [0, -0.14, 0.46], 0.12, 0.1),
      ellipsoid(0, -0.17, 0.5, 0.12, 0.09, 0.09),
      ellipsoid(0, -0.09, 0.25, 0.11, 0.08, 0.2),
      mirrorX(ellipsoid(0.08, -0.02, 0.2, 0.07, 0.08, 0.1)),
    ],
    0.06,
    V(-0.26, -0.32, -0.14),
    V(0.26, 0.3, 0.66),
    64,
  );
  const pigBody = sculpt(
    [
      ellipsoid(0, 0.55, 0, 0.3, 0.29, 0.55),
      ellipsoid(0, 0.56, 0.32, 0.29, 0.3, 0.3),
      mirrorX(ellipsoid(0.13, 0.55, -0.38, 0.17, 0.25, 0.22)),
      ellipsoid(0, 0.42, 0.02, 0.27, 0.18, 0.46),
      roundCone([0, 0.78, 0.3], [0, 0.78, -0.4], 0.1, 0.1),
      mirrorX(roundCone([0.15, 0.45, 0.36], [0.15, 0.29, 0.38], 0.09, 0.06)),
      mirrorX(roundCone([0.15, 0.48, -0.38], [0.15, 0.29, -0.4], 0.12, 0.065)),
      ellipsoid(0, 0.55, 0.55, 0.22, 0.22, 0.18),
    ],
    0.08,
    V(-0.42, 0.2, -0.78),
    V(0.42, 0.95, 0.82),
    80,
  );
  const pigHead = sculpt(
    [
      ellipsoid(0, 0.02, 0.1, 0.17, 0.17, 0.17),
      roundCone([0, -0.02, 0.18], [0, -0.05, 0.38], 0.12, 0.085),
      mirrorX(ellipsoid(0.09, -0.08, 0.12, 0.09, 0.09, 0.12)),
    ],
    0.05,
    V(-0.26, -0.24, -0.1),
    V(0.26, 0.22, 0.48),
    56,
  );
  const chickenBody = sculpt(
    [
      ellipsoid(0, 0.38, 0, 0.14, 0.15, 0.2),
      ellipsoid(0, 0.37, 0.1, 0.13, 0.15, 0.13),
      roundCone([0, 0.42, -0.12], [0, 0.58, -0.24], 0.09, 0.04),
      roundCone([0, 0.45, 0.12], [0, 0.6, 0.16], 0.07, 0.05),
      mirrorX(ellipsoid(0.06, 0.27, 0, 0.05, 0.07, 0.06)),
    ],
    0.05,
    V(-0.2, 0.17, -0.32),
    V(0.2, 0.68, 0.3),
    60,
  );
  const chickenHead = sculpt(
    [ellipsoid(0, 0.02, 0.02, 0.05, 0.055, 0.06), ellipsoid(0, -0.01, 0.06, 0.035, 0.035, 0.04)],
    0.02,
    V(-0.08, -0.07, -0.06),
    V(0.08, 0.09, 0.12),
    40,
  );
  return {
    cowBody,
    cowHead,
    cowLeg: lowerLeg(0.56, 0.075, 0.045),
    pigBody,
    pigHead,
    pigLeg: lowerLeg(0.3, 0.055, 0.038),
    chickenBody,
    chickenHead,
  };
}

function geos() {
  return (built ??= build());
}

const ball = new THREE.SphereGeometry(1, 20, 14);
const cone = new THREE.ConeGeometry(1, 1, 12);
const disc = new THREE.CylinderGeometry(1, 1, 1, 20).rotateX(Math.PI / 2);
const strand = new THREE.CylinderGeometry(0.018, 0.012, 1, 6).translate(0, -0.5, 0);
const shank = new THREE.CylinderGeometry(0.011, 0.009, 1, 6).translate(0, -0.5, 0);
const toe = new THREE.CylinderGeometry(0.006, 0.004, 1, 5).rotateX(Math.PI / 2).translate(0, 0, 0.5);

// ---------------------------------------------------------------------------
// Fur / skin / feather shader

const NOISE_GLSL = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

/** Surface pattern painted in object space; GLSL that adjusts `diffuseColor.rgb` using vObj and uSeed. */
const PATTERNS = {
  cowHide: `
    float n = snoise(vObj * 1.5 + uSeed) + 0.5 * snoise(vObj * 3.3 + uSeed * 1.7);
    float spot = smoothstep(0.0, 0.12, n);
    float grain = 0.93 + 0.07 * snoise(vObj * 70.0);
    diffuseColor.rgb = mix(vec3(0.7, 0.68, 0.64), vec3(0.03, 0.028, 0.03), spot) * grain;`,
  cowHead: `
    float n = snoise(vObj * 2.6 + uSeed) + 0.5 * snoise(vObj * 5.0 + uSeed);
    float spot = smoothstep(0.02, 0.14, n);
    vec3 hide = mix(vec3(0.7, 0.68, 0.64), vec3(0.03, 0.028, 0.03), spot);
    float muzzle = smoothstep(0.38, 0.47, vObj.z) * smoothstep(0.02, -0.08, vObj.y);
    diffuseColor.rgb = mix(hide, vec3(0.62, 0.42, 0.4), muzzle);`,
  cowLeg: `
    diffuseColor.rgb = vec3(0.68, 0.66, 0.62) * (0.92 + 0.08 * snoise(vObj * 12.0 + uSeed));`,
  pigSkin: `
    float mott = 0.9 + 0.1 * snoise(vObj * 6.0 + uSeed);
    vec3 skin = vec3(0.78, 0.45, 0.4) * mott;
    float mud = smoothstep(0.42, 0.26, vObj.y) * (0.55 + 0.45 * snoise(vObj * 5.0 + uSeed * 3.0));
    diffuseColor.rgb = mix(skin, vec3(0.26, 0.19, 0.13), clamp(mud, 0.0, 0.85));`,
  pigLeg: `
    float mud = smoothstep(-0.05, -0.25, vObj.y) * (0.6 + 0.4 * snoise(vObj * 8.0 + uSeed));
    diffuseColor.rgb = mix(vec3(0.76, 0.44, 0.39), vec3(0.24, 0.17, 0.11), clamp(mud, 0.0, 0.9));`,
  feathers: `
    float rows = sin(vObj.z * 95.0 + snoise(vObj * 20.0) * 2.0) * sin(vObj.y * 80.0 + vObj.x * 40.0);
    float tint = 0.93 + 0.05 * rows + 0.04 * snoise(vObj * 9.0 + uSeed);
    diffuseColor.rgb = vec3(0.92, 0.9, 0.84) * tint;`,
};

type PatternName = keyof typeof PATTERNS;

function furMaterial(pattern: PatternName, seed: number, opts: { roughness?: number; sheen?: number; sheenColor?: string } = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    roughness: opts.roughness ?? 0.85,
    metalness: 0,
    sheen: opts.sheen ?? 0.35,
    sheenRoughness: 0.75,
    sheenColor: new THREE.Color(opts.sheenColor ?? '#ffffff'),
    emissive: '#ff2a2a',
    emissiveIntensity: 0,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSeed = { value: seed };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vObj;\nuniform float uSeed;\n${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${PATTERNS[pattern]}`);
  };
  // Distinct program per pattern (onBeforeCompile bodies differ only in the injected string).
  m.customProgramCacheKey = () => `fur-${pattern}`;
  return m;
}

function plain(color: string, roughness: number, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}) {
  return new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 0, emissive: '#ff2a2a', emissiveIntensity: 0, ...extra });
}

export type RealMats = Record<string, THREE.MeshPhysicalMaterial>;

export function realMats(type: MobType, seed: number): RealMats {
  const eye = plain('#120c0a', 0.05, { clearcoat: 1, clearcoatRoughness: 0.02 });
  if (type === 'cow') {
    return {
      body: furMaterial('cowHide', seed),
      head: furMaterial('cowHead', seed),
      leg: furMaterial('cowLeg', seed),
      hoof: plain('#1e1a17', 0.45),
      horn: plain('#d9cdb2', 0.38, { clearcoat: 0.4 }),
      dark: plain('#141214', 0.9),
      nose: plain('#5a3734', 0.3, { clearcoat: 0.6 }),
      eye,
    };
  }
  if (type === 'pig') {
    return {
      body: furMaterial('pigSkin', seed, { roughness: 0.62, sheen: 0.15, sheenColor: '#ffd9cc' }),
      head: furMaterial('pigSkin', seed, { roughness: 0.62, sheen: 0.15, sheenColor: '#ffd9cc' }),
      leg: furMaterial('pigLeg', seed, { roughness: 0.65, sheen: 0.2 }),
      snout: plain('#c98476', 0.4, { clearcoat: 0.5 }),
      hoof: plain('#3e2e26', 0.5),
      dark: plain('#2a1a18', 0.7),
      eye,
    };
  }
  return {
    body: furMaterial('feathers', seed, { roughness: 0.9, sheen: 1, sheenColor: '#fffaf0' }),
    head: furMaterial('feathers', seed, { roughness: 0.9, sheen: 1 }),
    comb: plain('#b3141c', 0.42, { clearcoat: 0.3 }),
    beak: plain('#d89a3a', 0.4),
    legs: plain('#d9a43a', 0.5),
    eye,
  };
}

// ---------------------------------------------------------------------------
// Components (rig contract matches Mobs.tsx)

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
interface Props {
  rig: Rig;
  m: RealMats;
  ud: Record<string, unknown>;
}

function LegAt({ rig, i, phase, at, geo, mat, hoof, hoofAt, hoofScale, ud }: {
  rig: Rig; i: number; phase: number; at: P3; geo: THREE.BufferGeometry; mat: THREE.Material;
  hoof: THREE.Material; hoofAt: P3; hoofScale: P3; ud: Record<string, unknown>;
}) {
  const slot = () => (rig.legs[i] ??= { hip: null, knee: null, phase });
  return (
    <group position={at} ref={(o) => void (slot().hip = o)}>
      <group ref={(o) => void (slot().knee = o)}>
        <mesh geometry={geo} material={mat} castShadow userData={ud} />
        <mesh geometry={ball} material={hoof} position={hoofAt} scale={hoofScale} castShadow userData={ud} />
      </group>
    </group>
  );
}

export function RealCow({ rig, m, ud }: Props) {
  const g = geos();
  rig.headBase = 0.2;
  const legs: [number, number, number, number][] = [
    [0.19, 0.64, 0, 0], [-0.19, 0.64, Math.PI, 1], [0.2, -0.82, Math.PI, 2], [-0.2, -0.82, 0, 3],
  ];
  return (
    <>
      <group ref={(o) => void (rig.body = o)}>
        <mesh geometry={g.cowBody} material={m.body} castShadow receiveShadow userData={ud} />
        <group ref={(o) => void (rig.head = o)} position={[0, 1.36, 1.12]}>
          <mesh geometry={g.cowHead} material={m.head} castShadow userData={ud} />
          {[-1, 1].map((s) => (
            <group key={s}>
              <mesh geometry={ball} material={m.nose} position={[s * 0.045, -0.2, 0.585]} scale={[0.02, 0.026, 0.012]} userData={ud} />
              <mesh geometry={ball} material={m.eye} position={[s * 0.125, 0.05, 0.2]} scale={0.03} userData={ud} />
              <mesh geometry={ball} material={m.head} position={[s * 0.21, 0.1, 0.06]} rotation={[0.2, 0, s * 0.45]} scale={[0.11, 0.028, 0.06]} castShadow userData={ud} />
              <mesh geometry={cone} material={m.horn} position={[s * 0.1, 0.22, 0.04]} rotation={[0.3, 0, -s * 0.85]} scale={[0.026, 0.12, 0.026]} userData={ud} />
            </group>
          ))}
        </group>
        <group ref={(o) => void (rig.tail = o)} position={[0, 1.4, -0.96]}>
          <mesh geometry={strand} material={m.body} rotation={[0.12, 0, 0]} scale={[1, 0.8, 1]} userData={ud} />
          <mesh geometry={ball} material={m.dark} position={[0, -0.82, -0.1]} scale={[0.045, 0.13, 0.045]} userData={ud} />
        </group>
      </group>
      {legs.map(([x, z, phase, i]) => (
        <LegAt key={i} rig={rig} i={i} phase={phase} at={[x, 0.58, z]} geo={g.cowLeg} mat={m.leg} hoof={m.hoof}
          hoofAt={[0, -0.53, 0.03]} hoofScale={[0.058, 0.04, 0.072]} ud={ud} />
      ))}
    </>
  );
}

export function RealPig({ rig, m, ud }: Props) {
  const g = geos();
  rig.headBase = 0.1;
  const legs: [number, number, number, number][] = [
    [0.15, 0.38, 0, 0], [-0.15, 0.38, Math.PI, 1], [0.15, -0.4, Math.PI, 2], [-0.15, -0.4, 0, 3],
  ];
  return (
    <>
      <group ref={(o) => void (rig.body = o)}>
        <mesh geometry={g.pigBody} material={m.body} castShadow receiveShadow userData={ud} />
        <group ref={(o) => void (rig.head = o)} position={[0, 0.6, 0.62]}>
          <mesh geometry={g.pigHead} material={m.head} castShadow userData={ud} />
          <mesh geometry={disc} material={m.snout} position={[0, -0.05, 0.42]} scale={[0.085, 0.07, 0.03]} userData={ud} />
          {[-1, 1].map((s) => (
            <group key={s}>
              <mesh geometry={ball} material={m.dark} position={[s * 0.03, -0.05, 0.437]} scale={[0.014, 0.02, 0.008]} userData={ud} />
              <mesh geometry={ball} material={m.eye} position={[s * 0.1, 0.06, 0.2]} scale={0.022} userData={ud} />
              <mesh geometry={cone} material={m.head} position={[s * 0.12, 0.17, 0.08]} rotation={[1.0, 0, s * 0.35]} scale={[0.08, 0.13, 0.02]} castShadow userData={ud} />
            </group>
          ))}
        </group>
        <group ref={(o) => void (rig.tail = o)} position={[0, 0.72, -0.72]}>
          <mesh material={m.body} rotation={[0, Math.PI / 2, 0]} userData={ud}>
            <torusGeometry args={[0.04, 0.011, 8, 16, Math.PI * 1.7]} />
          </mesh>
        </group>
      </group>
      {legs.map(([x, z, phase, i]) => (
        <LegAt key={i} rig={rig} i={i} phase={phase} at={[x, 0.3, z]} geo={g.pigLeg} mat={m.leg} hoof={m.hoof}
          hoofAt={[0, -0.285, 0.02]} hoofScale={[0.042, 0.022, 0.05]} ud={ud} />
      ))}
    </>
  );
}

export function RealChicken({ rig, m, ud }: Props) {
  const g = geos();
  rig.headBase = 0;
  return (
    <>
      <group ref={(o) => void (rig.body = o)}>
        <mesh geometry={g.chickenBody} material={m.body} castShadow userData={ud} />
        <group ref={(o) => void (rig.head = o)} position={[0, 0.62, 0.17]}>
          <mesh geometry={g.chickenHead} material={m.head} castShadow userData={ud} />
          <mesh geometry={cone} material={m.beak} position={[0, -0.01, 0.105]} rotation={[Math.PI / 2 + 0.25, 0, 0]} scale={[0.016, 0.045, 0.014]} userData={ud} />
          {[-0.025, 0, 0.025].map((z, k) => (
            <mesh key={z} geometry={ball} material={m.comb} position={[0, 0.075 + (k === 1 ? 0.01 : 0), z + 0.01]} scale={[0.012, 0.022, 0.016]} userData={ud} />
          ))}
          {[-1, 1].map((s) => (
            <group key={s}>
              <mesh geometry={ball} material={m.comb} position={[s * 0.012, -0.05, 0.07]} scale={[0.01, 0.022, 0.012]} userData={ud} />
              <mesh geometry={ball} material={m.eye} position={[s * 0.042, 0.02, 0.045]} scale={0.009} userData={ud} />
            </group>
          ))}
        </group>
        {[-1, 1].map((s, k) => (
          <group key={s} position={[s * 0.13, 0.46, 0.02]} ref={(o) => void (rig.wings[k] = o)}>
            <mesh geometry={ball} material={m.body} position={[0, -0.07, -0.04]} rotation={[0.25, 0, 0]} scale={[0.028, 0.09, 0.16]} castShadow userData={ud} />
          </group>
        ))}
      </group>
      {[-1, 1].map((s, i) => {
        const slot = () => (rig.legs[i] ??= { hip: null, knee: null, phase: i * Math.PI });
        return (
          <group key={s} position={[s * 0.055, 0.22, 0.01]} ref={(o) => void (slot().hip = o)}>
            <group ref={(o) => void (slot().knee = o)}>
              <mesh geometry={shank} material={m.legs} scale={[1, 0.21, 1]} castShadow userData={ud} />
              {[-0.5, 0, 0.5].map((a) => (
                <mesh key={a} geometry={toe} material={m.legs} position={[0, -0.21, 0]} rotation={[0, a, 0]} scale={[1, 1, 0.06]} userData={ud} />
              ))}
            </group>
          </group>
        );
      })}
    </>
  );
}
