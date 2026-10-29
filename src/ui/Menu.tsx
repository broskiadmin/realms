import { useState } from 'react';
import { IS_TOUCH } from '../game/fx';
import type { Quality } from '../scene/quality';
import { useGame } from '../game/store';

const CONTROLS: [string, string][] = [
  ['WASD', 'Move'],
  ['Mouse', 'Look'],
  ['Space', 'Jump'],
  ['Shift', 'Sprint'],
  ['Click', 'Swing / build'],
  ['1 – 4', 'Pickaxe, floor, wall, ramp'],
  ['Q / Right-click', 'Pickaxe ⇄ build'],
  ['R', 'Rotate ramp'],
  ['F', 'Wood ⇄ stone'],
  ['E', 'Eat'],
  ['T / Enter', 'Chat with Claude'],
  ['C', 'Crafting'],
  ['Click villager', 'Talk / tasks'],
  ['Esc', 'Pause'],
];

const TOUCH_CONTROLS: [string, string][] = [
  ['Left thumb', 'Move (push far to sprint)'],
  ['Right drag', 'Look'],
  ['Swing / Build', 'Hold to act'],
  ['Jump', 'Jump'],
  ['Build / Pick', 'Switch modes'],
  ['Hotbar', 'Tap a slot'],
  ['Chat', 'Talk to Claude'],
  ['Craft', 'Crafting menu'],
];

/** Touch has no pointer lock: go fullscreen + landscape where the browser allows, then play. */
function startTouch() {
  const el = document.documentElement;
  el.requestFullscreen?.()
    .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
    .catch(() => {});
  useGame.getState().setLocked(true);
}

const NEXT_QUALITY: Record<Quality, Quality> = { low: 'high', high: 'realistic', realistic: 'low' };
const QUALITY_LABEL: Record<Quality, string> = { low: 'Fast', high: 'High', realistic: 'Realistic (heavy)' };

export function Menu({ quality, setQuality }: { quality: Quality; setQuality: (q: Quality) => void }) {
  const locked = useGame((s) => s.locked);
  const started = useGame((s) => s.started);
  const craftOpen = useGame((s) => s.craftOpen);
  const dialog = useGame((s) => s.dialog);
  const resetWorld = useGame((s) => s.resetWorld);
  const [confirm, setConfirm] = useState(false);
  // Stay mounted while playing: PointerLockControls binds its click handler to #play-btn once.
  return (
    <div className={`menu ${locked || craftOpen || dialog ? 'menu--hidden' : ''}`}>
      <div className="menu__card">
        <h1 className="logo">
          <span>R</span>
          <span>E</span>
          <span>A</span>
          <span>L</span>
          <span>M</span>
          <span>S</span>
        </h1>
        <p className="tagline">Gather. Build. Bridge the sky.</p>
        <button id="play-btn" className="play" onClick={IS_TOUCH ? startTouch : undefined}>
          {started ? 'Resume' : 'Play'}
        </button>
        <div className="controls">
          {(IS_TOUCH ? TOUCH_CONTROLS : CONTROLS).map(([k, v]) => (
            <div key={k} className="control">
              <kbd>{k}</kbd>
              <span>{v}</span>
            </div>
          ))}
        </div>
        <div className="menu__row">
          <button className="ghost-btn" onClick={() => setQuality(NEXT_QUALITY[quality])}>
            Graphics: {QUALITY_LABEL[quality]}
          </button>
          {confirm ? (
            <>
              <button
                className="ghost-btn danger"
                onClick={() => {
                  resetWorld();
                  window.location.reload();
                }}
              >
                Really reset?
              </button>
              <button className="ghost-btn" onClick={() => setConfirm(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button className="ghost-btn" onClick={() => setConfirm(true)}>
              Reset world
            </button>
          )}
        </div>
        <p className="fine">Your world saves automatically in this browser.</p>
      </div>
    </div>
  );
}
