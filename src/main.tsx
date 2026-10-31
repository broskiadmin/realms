// CrashGuard first: its global error handlers must be live before anything else loads.
import { CrashBoundary, CrashOverlay } from './ui/CrashGuard';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { clock, debug, player } from './game/fx';
import { PREDATORS } from './game/predators';
import { sfx } from './game/sound';
import { WISPS } from './game/hostiles';
import { MOBS } from './game/mobs';
import { useGame } from './game/store';
import '@fontsource/lilita-one';
import './index.css';

if (import.meta.env.DEV) Object.assign(window, { __realms: { useGame, player, clock, WISPS, MOBS, PREDATORS, debug, sfx } });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CrashBoundary>
      <App />
    </CrashBoundary>
    <CrashOverlay />
  </React.StrictMode>,
);
