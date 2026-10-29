import { useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { touchInput } from '../game/fx';
import { useGame } from '../game/store';
import { openCrafting } from './Crafting';

const STICK_R = 56;

/**
 * On-screen controls for phones: a floating joystick on the left half,
 * drag-to-look on the right half, and a thumb cluster of action buttons.
 */
export function TouchControls() {
  const locked = useGame((s) => s.locked);
  const tool = useGame((s) => s.tool);
  const g = useGame.getState;
  const stickId = useRef<number | null>(null);
  const lookId = useRef<number | null>(null);
  const last = useRef({ x: 0, y: 0 });
  const [stick, setStick] = useState<{ bx: number; by: number; kx: number; ky: number } | null>(null);

  if (!locked) return null;

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    if (e.clientX < window.innerWidth * 0.45 && stickId.current === null) {
      stickId.current = e.pointerId;
      setStick({ bx: e.clientX, by: e.clientY, kx: 0, ky: 0 });
    } else if (lookId.current === null) {
      lookId.current = e.pointerId;
      last.current = { x: e.clientX, y: e.clientY };
    }
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerId === stickId.current && stick) {
      let dx = e.clientX - stick.bx;
      let dy = e.clientY - stick.by;
      const d = Math.hypot(dx, dy);
      if (d > STICK_R) {
        dx = (dx / d) * STICK_R;
        dy = (dy / d) * STICK_R;
      }
      touchInput.moveX = dx / STICK_R;
      touchInput.moveY = -dy / STICK_R;
      setStick({ ...stick, kx: dx, ky: dy });
    } else if (e.pointerId === lookId.current) {
      touchInput.lookDX += e.clientX - last.current.x;
      touchInput.lookDY += e.clientY - last.current.y;
      last.current = { x: e.clientX, y: e.clientY };
    }
  };
  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerId === stickId.current) {
      stickId.current = null;
      touchInput.moveX = touchInput.moveY = 0;
      setStick(null);
    } else if (e.pointerId === lookId.current) {
      lookId.current = null;
    }
  };

  /** Hold-style button bound to a touchInput flag. */
  const hold = (key: 'jump' | 'action') => ({
    onPointerDown: (e: RPointerEvent) => {
      e.stopPropagation();
      touchInput[key] = true;
    },
    onPointerUp: () => (touchInput[key] = false),
    onPointerCancel: () => (touchInput[key] = false),
    onPointerLeave: () => (touchInput[key] = false),
  });
  const tap = (fn: () => void) => ({
    onPointerDown: (e: RPointerEvent) => {
      e.stopPropagation();
      fn();
    },
  });

  return (
    <div className="touch-layer" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      {stick && (
        <div className="stick" style={{ left: stick.bx - STICK_R, top: stick.by - STICK_R, width: STICK_R * 2, height: STICK_R * 2 }}>
          <div className="stick__knob" style={{ transform: `translate(${stick.kx}px, ${stick.ky}px)` }} />
        </div>
      )}
      {!stick && <div className="stick-hint">Drag to move</div>}
      <button className="tbtn tbtn--pause" {...tap(() => g().setLocked(false))}>
        ❚❚
      </button>
      <button className="tbtn tbtn--chat" {...tap(() => g().setChatOpen(true))}>
        Chat
      </button>
      <div className="tcluster">
        <button className="tbtn tbtn--action" {...hold('action')}>
          {tool === 'pickaxe' ? 'Swing' : 'Build'}
        </button>
        <button className="tbtn tbtn--jump" {...hold('jump')}>
          Jump
        </button>
        <button className="tbtn tbtn--small tbtn--mode" {...tap(() => g().toggleBuild())}>
          {tool === 'pickaxe' ? 'Build' : 'Pick'}
        </button>
        <button className="tbtn tbtn--small tbtn--eat" {...tap(() => g().eat())}>
          Eat
        </button>
        {tool === 'pickaxe' && (
          <button className="tbtn tbtn--small tbtn--craft" {...tap(openCrafting)}>
            Craft
          </button>
        )}
        {tool !== 'pickaxe' && (
          <button className="tbtn tbtn--small tbtn--mat" {...tap(() => g().toggleMat())}>
            Mat
          </button>
        )}
        {tool === 'ramp' && (
          <button className="tbtn tbtn--small tbtn--rot" {...tap(() => g().rotateRamp())}>
            ↻
          </button>
        )}
      </div>
    </div>
  );
}
