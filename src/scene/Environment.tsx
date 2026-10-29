import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { dayPhase, isNight, player } from '../game/fx';
import { useGame } from '../game/store';
import { mulberry32 } from '../game/noise';
import { windUniform } from './Islands';
import { surface } from './materials';
import { REALISTIC } from './quality';

const hazeColor = new THREE.Color();

export const SKY_TOP = '#2f86ff';
export const SKY_HORIZON = '#bfe7ff';
export const SKY_BOTTOM = '#f2f8ff';
/** Updated every frame from the world clock. */
export const SUN_DIR = new THREE.Vector3(0.55, 0.62, 0.35).normalize();

const DAY = { top: new THREE.Color(SKY_TOP), horizon: new THREE.Color(SKY_HORIZON), bottom: new THREE.Color(SKY_BOTTOM) };
const NIGHT = { top: new THREE.Color('#070b26'), horizon: new THREE.Color('#25306a'), bottom: new THREE.Color('#353f7a') };
const SUNSET = new THREE.Color('#ff9a5c');

const skyMaterial = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  uniforms: {
    top: { value: new THREE.Color(SKY_TOP) },
    horizon: { value: new THREE.Color(SKY_HORIZON) },
    bottom: { value: new THREE.Color(SKY_BOTTOM) },
    sunDir: { value: SUN_DIR },
    night: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform float night;
    varying vec3 vDir;
    float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
    void main() {
      vec3 d = normalize(vDir);
      float h = d.y;
      vec3 col = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, bottom, pow(-h, 0.4));
      float s = max(dot(d, sunDir), 0.0);
      col += vec3(1.0, 0.93, 0.75) * (smoothstep(0.9975, 0.9985, s) * 4.0 + pow(s, 16.0) * 0.35) * (1.0 - night);
      float m = max(dot(d, -sunDir), 0.0);
      col += vec3(0.85, 0.9, 1.0) * (smoothstep(0.9988, 0.9993, m) * 2.5 + pow(m, 40.0) * 0.15) * night;
      vec3 cell = floor(d * 180.0);
      float star = step(0.9965, hash(cell)) * smoothstep(0.0, 0.25, h);
      col += vec3(star) * night * 1.6;
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});

export function Sky() {
  const ref = useRef<THREE.Mesh>(null);
  const camera = useThree((s) => s.camera);
  useFrame(() => ref.current?.position.copy(camera.position));
  return (
    <mesh ref={ref} material={skyMaterial} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[600, 32, 16]} />
    </mesh>
  );
}

export const cloudMaterial = surface({ color: '#ffffff', emissive: '#b8d4f0', emissiveIntensity: 0.35 });

/** Realistic-mode haze colours (fog + background) — the atmospheric sky itself is drawn by RealisticSky. */
const REAL_HAZE = { day: new THREE.Color('#b4c8d8'), night: new THREE.Color('#070b16'), sunset: new THREE.Color('#d99a6c') };

export function Lights() {
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const scene = useThree((s) => s.scene);
  const wasNight = useRef<boolean | null>(null);
  useEffect(() => {
    const l = sun.current;
    if (!l) return;
    scene.add(l.target);
    return () => {
      scene.remove(l.target);
    };
  }, [scene]);
  useFrame((state) => {
    windUniform.value = state.clock.elapsedTime;
    const l = sun.current;
    const hl = hemi.current;
    if (!l || !hl) return;

    // Sun arcs overhead through the day; the moon is directly opposite.
    const a = dayPhase() * Math.PI * 2;
    SUN_DIR.set(Math.cos(a) * 0.8, Math.sin(a), 0.35).normalize();
    const day = THREE.MathUtils.smoothstep(SUN_DIR.y, -0.12, 0.18);
    const glow = Math.exp(-SUN_DIR.y * SUN_DIR.y * 40) * 0.7;
    const u = skyMaterial.uniforms;
    (u.top.value as THREE.Color).lerpColors(NIGHT.top, DAY.top, day);
    (u.horizon.value as THREE.Color).lerpColors(NIGHT.horizon, DAY.horizon, day).lerp(SUNSET, glow);
    (u.bottom.value as THREE.Color).lerpColors(NIGHT.bottom, DAY.bottom, day);
    u.night.value = 1 - day;
    const haze = REALISTIC ? hazeColor.lerpColors(REAL_HAZE.night, REAL_HAZE.day, day).lerp(REAL_HAZE.sunset, glow * 0.8) : u.horizon.value;
    if (scene.fog) scene.fog.color.copy(haze);
    if (scene.background instanceof THREE.Color) scene.background.copy(haze);

    const light = day > 0.02 ? SUN_DIR : SUN_DIR.clone().negate();
    if (REALISTIC) {
      // Strong key light + dim sky fill; image-based lighting from RealisticSky does the rest.
      l.intensity = day > 0.02 ? 4.2 * day : 0.35;
      l.color.set(day > 0.02 ? '#fff1de' : '#8ea6e0').lerp(REAL_HAZE.sunset, glow);
      hl.intensity = 0.12 + 0.35 * day;
    } else {
      l.intensity = day > 0.02 ? 2.4 * day : 0.55;
      l.color.set(day > 0.02 ? '#fff3dc' : '#9fb4ff').lerp(SUNSET, glow * 0.6);
      hl.intensity = 0.45 + 0.9 * day;
    }
    hl.color.set('#5a6aa8').lerp(new THREE.Color('#d8f0ff'), day);
    cloudMaterial.emissiveIntensity = 0.05 + 0.3 * day;

    const night = isNight();
    if (wasNight.current !== null && night !== wasNight.current) {
      useGame
        .getState()
        .toast('daynight', night ? 'Night falls — Gloomwisps are coming! Build a shelter.' : 'Dawn breaks — the wisps fade away.', night ? '#b48cff' : '#ffd23f', 1);
    }
    wasNight.current = night;

    // Snap to a coarse grid so shadow texels don't shimmer as the player moves.
    const sx = Math.round(player.pos.x / 4) * 4;
    const sz = Math.round(player.pos.z / 4) * 4;
    l.target.position.set(sx, player.pos.y, sz);
    l.position.set(sx + light.x * 90, player.pos.y + Math.max(0.15, light.y) * 90, sz + light.z * 90);
  });
  return (
    <>
      <hemisphereLight ref={hemi} args={['#d8f0ff', '#8a7a5a', 1.35]} />
      <ambientLight intensity={REALISTIC ? 0.02 : 0.25} />
      <directionalLight
        ref={sun}
        intensity={2.4}
        color="#fff3dc"
        castShadow
        shadow-mapSize={REALISTIC ? [4096, 4096] : [2048, 2048]}
        shadow-camera-left={REALISTIC ? -70 : -55}
        shadow-camera-right={REALISTIC ? 70 : 55}
        shadow-camera-top={REALISTIC ? 70 : 55}
        shadow-camera-bottom={REALISTIC ? -70 : -55}
        shadow-camera-near={10}
        shadow-camera-far={220}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
      />
    </>
  );
}

/** Puffy cloud clusters drifting around the islands plus a cloud sea far below. */
export function Clouds() {
  const drift = useRef<THREE.Group>(null);
  const { high, sea } = useMemo(() => {
    const rng = mulberry32(777);
    const sphere = new THREE.IcosahedronGeometry(1, 2);
    const mat = cloudMaterial;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();

    const highMats: THREE.Matrix4[] = [];
    for (let c = 0; c < 34; c++) {
      const a = rng() * Math.PI * 2;
      const r = 90 + rng() * 140;
      const cx = Math.cos(a) * r;
      const cz = Math.sin(a) * r;
      const cy = 10 + rng() * 45;
      const puffs = 5 + Math.floor(rng() * 6);
      const size = 4 + rng() * 5;
      for (let i = 0; i < puffs; i++) {
        const s = size * (0.55 + rng() * 0.6);
        const off = (i / puffs - 0.5) * size * 3.2;
        m.compose(
          new THREE.Vector3(cx + Math.cos(a + 1.57) * off + (rng() - 0.5) * size, cy + rng() * size * 0.5, cz + Math.sin(a + 1.57) * off + (rng() - 0.5) * size),
          q,
          new THREE.Vector3(s, s * 0.75, s),
        );
        highMats.push(m.clone());
      }
    }
    const seaMats: THREE.Matrix4[] = [];
    for (let i = 0; i < 520; i++) {
      const a = rng() * Math.PI * 2;
      const r = 10 + Math.sqrt(rng()) * 330;
      const s = 9 + rng() * 14;
      m.compose(new THREE.Vector3(Math.cos(a) * r, -42 + rng() * 6, Math.sin(a) * r), q, new THREE.Vector3(s, s * 0.55, s));
      seaMats.push(m.clone());
    }
    const make = (ms: THREE.Matrix4[]) => {
      const im = new THREE.InstancedMesh(sphere, mat, ms.length);
      ms.forEach((x, i) => im.setMatrixAt(i, x));
      im.frustumCulled = false;
      return im;
    };
    return { high: make(highMats), sea: make(seaMats) };
  }, []);
  useFrame((_, dt) => {
    if (drift.current) drift.current.rotation.y += dt * 0.004;
  });
  return (
    <>
      <group ref={drift}>
        <primitive object={high} />
      </group>
      <primitive object={sea} />
    </>
  );
}
