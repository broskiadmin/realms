import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { PointerLockControls, SoftShadows } from '@react-three/drei';
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { Effect, ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { IS_TOUCH } from '../game/fx';
import { useGame } from '../game/store';
import { tickTrader } from '../game/npcs';
import { Benches } from './Benches';
import { Npcs, TraderCart } from './Npcs';
import { Wisps } from './Wisps';
import { Clouds, Lights, Sky, SKY_HORIZON } from './Environment';
import { Interaction } from './Interaction';
import { Grass, Islands } from './Islands';
import { Mobs } from './Mobs';
import { Particles } from './Particles';
import { Ghost, Pieces } from './Pieces';
import { Player } from './Player';
import type { Quality } from './quality';
import { RealisticClouds, RealisticSky } from './RealisticSky';
import { Resources } from './Resources';
import { Viewmodel } from './Viewmodel';

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
  return (
    <EffectComposer multisampling={0}>
      <N8AO aoRadius={2.2} distanceFalloff={1.2} intensity={2.4} quality="high" halfRes={false} />
      <Bloom mipmapBlur luminanceThreshold={1.1} luminanceSmoothing={0.3} intensity={0.45} />
      <primitive object={exposure} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <SMAA />
      <Vignette offset={0.35} darkness={0.35} />
    </EffectComposer>
  );
}

export function Game({ quality }: { quality: Quality }) {
  const world = useRef<THREE.Group>(null);
  const setLocked = useGame((s) => s.setLocked);
  useEffect(() => () => setLocked(false), [setLocked]);
  const realistic = quality === 'realistic';

  return (
    <>
      {/* Contact-hardening soft shadows (PCSS) — patches shaders, so mount before anything compiles. */}
      {realistic && <SoftShadows size={18} samples={14} focus={0.6} />}
      <color attach="background" args={[SKY_HORIZON]} />
      <fog attach="fog" args={[SKY_HORIZON, realistic ? 110 : 70, realistic ? 480 : 300]} />
      {realistic ? <RealisticSky /> : <Sky />}
      <Lights />
      <group ref={world}>
        <Islands />
        <Resources />
        <Pieces />
        <Mobs />
        <Wisps />
        <Benches />
        <Npcs />
        <TraderCart />
      </group>
      <Grass />
      {realistic ? <RealisticClouds /> : <Clouds />}
      <Ghost />
      <Particles />
      <Player />
      <Interaction world={world} />
      <Viewmodel />
      <Ticker />
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
