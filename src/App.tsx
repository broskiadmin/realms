import { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { IS_TOUCH } from './game/fx';
import { startNet } from './game/net';
import { Game } from './scene/Game';
import { INITIAL_QUALITY, saveQuality, type Quality } from './scene/quality';
import { Chat } from './ui/Chat';
import { Crafting } from './ui/Crafting';
import { Dialog } from './ui/Dialog';
import { TouchControls } from './ui/TouchControls';
import { HUD } from './ui/HUD';
import { Menu } from './ui/Menu';

export default function App() {
  const [quality, setQualityState] = useState<Quality>(INITIAL_QUALITY);
  useEffect(startNet, []);
  const setQuality = (q: Quality) => {
    saveQuality(q); // reloads when switching into/out of Realistic
    setQualityState(q);
  };
  return (
    <div className="app">
      <Canvas
        shadows={quality === 'realistic' ? 'soft' : true}
        dpr={quality === 'realistic' ? [1, 2] : quality === 'high' ? [1, 1.75] : 1}
        camera={{ fov: 75, near: 0.05, far: 1500 }}
        gl={{ antialias: quality === 'low', toneMapping: THREE.NeutralToneMapping, powerPreference: 'high-performance' }}
      >
        <Game quality={quality} />
      </Canvas>
      {IS_TOUCH && <TouchControls />}
      <HUD />
      <Chat />
      <Crafting />
      <Dialog />
      <Menu quality={quality} setQuality={setQuality} />
    </div>
  );
}
