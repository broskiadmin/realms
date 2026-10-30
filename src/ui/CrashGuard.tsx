import { Component, useEffect, useState, type ReactNode } from 'react';
import { sendToSteward } from '../game/chat';
import { MP_WORLD } from '../game/mode';

/**
 * Crash handling: any uncaught error, React render error, or lost WebGL context
 * shows a recovery screen and is reported once to the steward session via the
 * chat bridge, so crashes on the player's machine can be diagnosed remotely.
 */

type Listener = (msg: string) => void;
const listeners = new Set<Listener>();
let reported = false;

export function reportCrash(kind: string, detail: string) {
  const quality = localStorage.getItem('realms-quality') ?? 'default';
  const msg = `${kind}: ${detail}`.slice(0, 600);
  for (const l of listeners) l(msg);
  if (listeners.size === 0) {
    // Crashed before React mounted (e.g. while a module was loading): plain-DOM fallback.
    const root = document.getElementById('root');
    if (root && !root.hasChildNodes()) {
      root.innerHTML =
        '<div class="crash"><div class="crash__card"><h2>Realms crashed</h2><p class="crash__msg"></p>' +
        '<p class="crash__note">Claude has been sent the details automatically.</p>' +
        '<button class="play" onclick="location.reload()">Reload</button></div></div>';
      root.querySelector('.crash__msg')!.textContent = msg;
    }
  }
  if (reported) return;
  reported = true;
  void sendToSteward(`[crash report] ${msg} | quality=${quality} world=${MP_WORLD ?? 'single'} ua=${navigator.userAgent.slice(0, 120)}`);
}

function describe(e: unknown): string {
  if (e instanceof Error) return `${e.message} @ ${(e.stack ?? '').split('\n').slice(1, 4).map((s) => s.trim()).join(' | ')}`;
  return String(e);
}

window.addEventListener('error', (e) => reportCrash('Error', describe(e.error ?? e.message)));
window.addEventListener('unhandledrejection', (e) => reportCrash('Unhandled rejection', describe(e.reason)));
window.addEventListener(
  'webglcontextlost',
  () => reportCrash('WebGL context lost', 'the GPU reset or ran out of memory (graphics preset too heavy?)'),
  true,
);

function reloadFast() {
  localStorage.setItem('realms-quality', 'low');
  window.location.reload();
}

function CrashScreen({ message }: { message: string }) {
  return (
    <div className="crash">
      <div className="crash__card">
        <h2>Realms crashed</h2>
        <p className="crash__msg">{message}</p>
        <p className="crash__note">Claude has been sent the details automatically.</p>
        <div className="menu__row">
          <button className="play" onClick={() => window.location.reload()}>
            Reload
          </button>
          <button className="ghost-btn" onClick={reloadFast}>
            Reload in Fast graphics
          </button>
        </div>
      </div>
    </div>
  );
}

/** Shows the crash screen for non-React failures (global errors, GPU loss) without unmounting the app. */
export function CrashOverlay() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const l: Listener = (m) => setMsg((cur) => cur ?? m);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return msg ? <CrashScreen message={msg} /> : null;
}

/** React error boundary for render-time crashes. */
export class CrashBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };

  static getDerivedStateFromError(e: unknown) {
    return { error: describe(e) };
  }

  componentDidCatch(e: unknown) {
    reportCrash('Render crash', describe(e));
  }

  render() {
    return this.state.error ? <CrashScreen message={this.state.error} /> : this.props.children;
  }
}
