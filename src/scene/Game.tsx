import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerformanceMonitor, PointerLockControls, SoftShadows } from '@react-three/drei';
import { Bloom, EffectComposer, GodRays, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { Effect, ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { IS_TOUCH } from '../game/fx';
import { useGame } from '../game/store';
import { tickTrader } from '../game/npcs';
import { Benches } from './Benches';
import { Npcs, TraderCart } from './Npcs';
import { Wisps } from './Wisps';
import { Predators } from './Predators';
import { SoundSystem } from './SoundSystem';
import { Clouds, Lights, Sky, SKY_HORIZON, SUN_DIR } from './Environment';
import { loadPhotoTextures } from './photoTextures';
import { Interaction } from './Interaction';
import { Grass, Islands } from './Islands';
import { Mobs } from './Mobs';
import { Particles } from './Particles';
import { Ghost, Pieces } from './Pieces';
import { Player } from './Player';
import type { Quality } from './quality';
import { RealisticClouds, RealisticSky } from './RealisticSky';
import { RemotePlayers } from './RemotePlayers';
import { Resources } from './Resources';
import { Viewmodel } from './Viewmodel';

/** Dev-only: expose the renderer so scripts/shot.mjs can report draw calls and triangles. */
function DevRendererHook() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // Count across every pass of a frame (scene, shadows, post-processing), not just the last one.
    gl.info.autoReset = false;
    Object.assign((window as unknown as { __realms?: object }).__realms ?? {}, { gl });
  }, [gl]);
  useFrame(() => {
    if (import.meta.env.DEV) gl.info.reset();
  });
  return null;
}

function Ticker() {
  const acc = useRef(0);
  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current > 1) {
      acc.current = 0;
      useGame.getState().respawnDue(Date.now());
      tickTrader();
    }
  });
  return null;
}

/** Linear exposure scale applied before tone mapping (the HDR sky is far brighter than 1.0). */
class ExposureEffect extends Effect {
  constructor(exposure: number) {
    super(
      'Exposure',
      /* glsl */ `uniform float exposure;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        outputColor = vec4(inputColor.rgb * exposure, inputColor.a);
      }`,
      { uniforms: new Map([['exposure', new THREE.Uniform(exposure)]]) },
    );
  }
}

function RealisticEffects() {
  const exposure = useMemo(() => new ExposureEffect(0.62), []);
  const camera = useThree((s) => s.camera);
  // Light source for the god-ray pass: a disc far along the sun direction (hidden at night).
  const [sun, setSun] = useState<THREE.Mesh | null>(null);
  const ndc = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    if (!sun) return;
    sun.position.copy(camera.position).addScaledVector(SUN_DIR, 900);
    // Only feed the god-ray pass when the sun is on (or just off) screen. With the sun out of view
    // the radial blur smears glare over the whole frame and reads as thick milky fog.
    ndc.copy(sun.position).project(camera);
    const onScreen = ndc.z < 1 && Math.abs(ndc.x) < 1.25 && Math.abs(ndc.y) < 1.25;
    sun.visible = SUN_DIR.y > -0.05 && onScreen;
  });
  return (
    <>
      <mesh ref={setSun} frustumCulled={false}>
        <sphereGeometry args={[28, 16, 12]} />
        <meshBasicMaterial color="#fff4dc" fog={false} toneMapped={false} />
      </mesh>
      <EffectComposer multisampling={0}>
        {/* Half-res AO + 60-sample rays: roughly a third of the cost, nearly identical at play distance. */}
        <N8AO aoRadius={2.4} distanceFalloff={1.2} intensity={2.6} quality="high" halfRes />
        {sun ? <GodRays sun={sun} samples={60} density={0.96} decay={0.93} weight={0.2} exposure={0.34} clampMax={1} blur /> : <></>}
        <Bloom mipmapBlur luminanceThreshold={1.3} luminanceSmoothing={0.3} intensity={0.3} />
        <primitive object={exposure} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <SMAA />
        <Vignette offset={0.35} darkness={0.35} />
      </EffectComposer>
    </>
  );
}

export function Game({ quality }: { quality: Quality }) {
  const world = useRef<THREE.Group>(null);
  const setLocked = useGame((s) => s.setLocked);
  useEffect(() => () => setLocked(false), [setLocked]);
  const realistic = quality === 'realistic';
  const setDpr = useThree((s) => s.setDpr);
  useEffect(() => {
    if (realistic) loadPhotoTextures();
  }, [realistic]);

  return (
    <>
      {/* Contact-hardening soft shadows (PCSS) — patches shaders, so mount before anything compiles. */}
      {realistic && <SoftShadows size={18} samples={12} focus={0.6} />}
      {/* Adaptive resolution: drops pixel ratio when the frame rate dips, raises it when there's headroom. */}
      {quality !== 'low' && (
        <PerformanceMonitor
          factor={0.5}
          flipflops={4}
          onChange={({ factor }) => setDpr(Math.min(window.devicePixelRatio, 0.75 + factor * (realistic ? 1.25 : 1)))}
          onFallback={() => setDpr(0.75)}
        />
      )}
      <color attach="background" args={[SKY_HORIZON]} />
      {/* Realistic: a clear day — light aerial haze far out instead of milky fog. */}
      <fog attach="fog" args={[SKY_HORIZON, realistic ? 240 : 70, realistic ? 1150 : 300]} />
      {realistic ? <RealisticSky /> : <Sky />}
      <Lights />
      <group ref={world}>
        <Islands />
        <Resources />
        <Pieces />
        <Mobs />
        <Wisps />
        <Predators />
        <Benches />
        <Npcs />
        <TraderCart />
      </group>
      <RemotePlayers />
      <Grass />
      {realistic ? <RealisticClouds /> : <Clouds />}
      <Ghost />
      <Particles />
      <Player />
      <Interaction world={world} />
      <Viewmodel />
      <Ticker />
      <SoundSystem />
      <DevRendererHook />
      {!IS_TOUCH && <PointerLockControls selector="#play-btn" onLock={() => setLocked(true)} onUnlock={() => setLocked(false)} />}
      {realistic && <RealisticEffects />}
      {quality === 'high' && (
        <EffectComposer multisampling={0}>
          <SMAA />
          <Bloom mipmapBlur luminanceThreshold={0.9} luminanceSmoothing={0.2} intensity={0.8} />
          <Vignette offset={0.3} darkness={0.4} />
          <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        </EffectComposer>
      )}
    </>
  );
}
