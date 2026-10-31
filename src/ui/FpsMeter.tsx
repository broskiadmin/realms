import { useEffect, useState } from 'react';

const KEY = 'realms-fps';

/** F3 toggles a small frame-rate readout (remembered per browser). */
export function FpsMeter() {
  const [on, setOn] = useState(() => localStorage.getItem(KEY) === '1');
  const [stats, setStats] = useState({ fps: 0, ms: 0, low: 0 });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'F3') return;
      e.preventDefault();
      setOn((v) => {
        localStorage.setItem(KEY, v ? '0' : '1');
        return !v;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!on) return;
    let raf = 0;
    let last = performance.now();
    let frames = 0;
    let worst = 0;
    let windowStart = last;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      frames++;
      worst = Math.max(worst, dt);
      if (now - windowStart >= 500) {
        const elapsed = now - windowStart;
        setStats({ fps: Math.round((frames * 1000) / elapsed), ms: +(elapsed / frames).toFixed(1), low: Math.round(1000 / worst) });
        frames = 0;
        worst = 0;
        windowStart = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on]);

  if (!on) return null;
  const color = stats.fps >= 55 ? '#6bff8f' : stats.fps >= 35 ? '#ffd23f' : '#ff6b6b';
  return (
    <div className="fps" style={{ color }}>
      {stats.fps} FPS · {stats.ms} ms · low {stats.low}
    </div>
  );
}
