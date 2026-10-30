import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Cloud, Clouds, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { Sky as SkyImpl } from 'three/examples/jsm/objects/Sky.js';
import { mulberry32 } from '../game/noise';
import { SUN_DIR } from './Environment';

/** Seconds between image-based-lighting refreshes as the sun moves. */
const ENV_REFRESH = 4;

function makeSky(): SkyImpl {
  const s = new SkyImpl();
  s.scale.setScalar(1000);
  s.frustumCulled = false;
  const u = s.material.uniforms;
  u.turbidity.value = 4.5;
  u.rayleigh.value = 1.4;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.82;
  return s;
}

/**
 * Physically based atmospheric sky (Preetham scattering) that also lights the
 * world: a copy is rendered into a PMREM environment map every few seconds, so
 * PBR materials pick up real sky colour and reflections as the day turns.
 */
export function RealisticSky() {
  const { gl, scene } = useThree();
  const sky = useMemo(makeSky, []);
  const env = useMemo(() => {
    const envScene = new THREE.Scene();
    const copy = makeSky();
    copy.material = sky.material;
    envScene.add(copy);
    return { envScene, pmrem: new THREE.PMREMGenerator(gl) };
  }, [gl, sky]);
  const target = useRef<THREE.WebGLRenderTarget | null>(null);
  const hdri = useRef<THREE.WebGLRenderTarget | null>(null);
  const timer = useRef(ENV_REFRESH);
  const stars = useRef<THREE.Points>(null);

  // A real captured sky (Poly Haven HDRI) gives far richer daylight than the analytic model;
  // falls back to the analytic sky's environment if the file hasn't been fetched.
  useEffect(() => {
    let alive = true;
    new RGBELoader()
      .loadAsync(`${import.meta.env.BASE_URL}assets/ph/sky.hdr`)
      .then((tex) => {
        tex.mapping = THREE.EquirectangularReflectionMapping;
        const rt = env.pmrem.fromEquirectangular(tex);
        tex.dispose();
        if (alive) hdri.current = rt;
        else rt.dispose();
      })
      .catch(() => console.warn('[realms] sky.hdr unavailable — run scripts/fetch-assets.sh'));
    return () => {
      alive = false;
    };
  }, [env]);

  useEffect(
    () => () => {
      target.current?.dispose();
      hdri.current?.dispose();
      env.pmrem.dispose();
      scene.environment = null;
    },
    [env, scene],
  );

  useFrame((state, dt) => {
    sky.position.copy(state.camera.position);
    (sky.material.uniforms.sunPosition.value as THREE.Vector3).copy(SUN_DIR);
    if (stars.current) stars.current.visible = SUN_DIR.y < -0.02;
    if (hdri.current) {
      // Daylight from the captured sky, fading to almost nothing at night.
      scene.environment = hdri.current.texture;
      scene.environmentIntensity = THREE.MathUtils.clamp(SUN_DIR.y * 2.2 + 0.2, 0.04, 1);
      return;
    }
    timer.current += dt;
    if (timer.current >= ENV_REFRESH) {
      timer.current = 0;
      const next = env.pmrem.fromScene(env.envScene, 0, 0.1, 2000);
      target.current?.dispose();
      target.current = next;
      scene.environment = next.texture;
      scene.environmentIntensity = THREE.MathUtils.clamp(SUN_DIR.y * 3 + 0.25, 0.08, 0.9);
    }
  });

  return (
    <>
      <primitive object={sky} />
      <Stars ref={stars} radius={420} depth={60} count={5000} factor={5} saturation={0} fade speed={0.3} />
    </>
  );
}

/** Soft, wispy sprite for the volumetric cloud billboards, drawn once on a canvas. */
const cloudSprite = (() => {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const rnd = mulberry32(99);
  for (let i = 0; i < 26; i++) {
    const x = s / 2 + (rnd() - 0.5) * s * 0.45;
    const y = s / 2 + (rnd() - 0.5) * s * 0.35;
    const r = s * (0.12 + rnd() * 0.18);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  }
  return c.toDataURL('image/png');
})();

// HDR "brighter than white": the exposure pass scales the frame by ~0.6, so unlit clouds need >1 to read as white.
const CLOUD_WHITE = new THREE.Color('#ffffff').multiplyScalar(1.7);
const CLOUD_SEA = new THREE.Color('#eef3f8').multiplyScalar(1.6);

const CLOUD_BANKS = (() => {
  const rnd = mulberry32(4242);
  return Array.from({ length: 14 }, (_, i) => {
    const a = rnd() * Math.PI * 2;
    const r = 90 + rnd() * 160;
    return { seed: i + 1, pos: [Math.cos(a) * r, 18 + rnd() * 40, Math.sin(a) * r] as [number, number, number], size: 18 + rnd() * 22 };
  });
})();

/** Lit volumetric cloud banks around the islands plus a thick cloud sea far below. */
export function RealisticClouds() {
  return (
    <Suspense fallback={null}>
      {/* Unlit: Lambert-lit billboards picked up the brown hemisphere ground colour and looked muddy. */}
      <Clouds texture={cloudSprite} material={THREE.MeshBasicMaterial} limit={900} frustumCulled={false}>
        {CLOUD_BANKS.map((c) => (
          <Cloud
            key={c.seed}
            seed={c.seed}
            position={c.pos}
            bounds={[c.size, c.size * 0.25, c.size * 0.6]}
            segments={40}
            volume={c.size * 1.1}
            smallestVolume={0.3}
            growth={4}
            speed={0.04}
            fade={150}
            opacity={1}
            color={CLOUD_WHITE}
          />
        ))}
        {[0, 1, 2, 3].map((i) => (
          <Cloud
            key={`sea${i}`}
            seed={100 + i}
            position={[(i % 2 ? 1 : -1) * 120, -42, (i < 2 ? 1 : -1) * 120]}
            bounds={[200, 6, 200]}
            segments={110}
            volume={70}
            growth={6}
            speed={0.02}
            fade={300}
            opacity={0.95}
            color={CLOUD_SEA}
          />
        ))}
      </Clouds>
    </Suspense>
  );
}
