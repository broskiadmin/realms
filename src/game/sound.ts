import { player } from './fx';

/**
 * Procedural sound: every effect is synthesised live with the Web Audio API
 * (oscillators + filtered noise), so there are no audio assets. Positional
 * sounds are attenuated by distance and panned by direction relative to where
 * the player is looking.
 */

type Pos = { x: number; y: number; z: number };

const MUTE_KEY = 'realms-muted';
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let muted = localStorage.getItem(MUTE_KEY) === '1';

/** Must be called from a user gesture (browsers block audio until then). */
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.6;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

export function isMuted() {
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.6, ctx.currentTime, 0.05);
}

/** Output node for a sound at `pos` (or centred/full volume when omitted). Returns null if audio is off. */
function out(pos?: Pos, vol = 1, range = 40): { c: AudioContext; dest: AudioNode } | null {
  if (!ctx || !master || muted) return null;
  const g = ctx.createGain();
  let v = vol;
  if (pos) {
    const dx = pos.x - player.pos.x;
    const dz = pos.z - player.pos.z;
    const d = Math.hypot(dx, dz, pos.y - player.pos.y);
    if (d > range) return null;
    v *= Math.max(0, 1 - d / range) ** 1.6;
    const p = ctx.createStereoPanner();
    // Angle of the source relative to the camera's facing (yaw 0 looks toward -z).
    const ang = Math.atan2(dx, -dz) + player.yaw;
    p.pan.value = Math.max(-1, Math.min(1, Math.sin(ang) * 0.85));
    g.connect(p).connect(master);
  } else {
    g.connect(master);
  }
  g.gain.value = v;
  return { c: ctx, dest: g };
}

function env(c: AudioContext, node: AudioNode, dest: AudioNode, a: number, d: number, peak = 1): GainNode {
  const g = c.createGain();
  const t = c.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  node.connect(g).connect(dest);
  return g;
}

function tone(o: { c: AudioContext; dest: AudioNode }, type: OscillatorType, f0: number, f1: number, a: number, d: number, peak = 0.5, delay = 0) {
  const { c, dest } = o;
  const osc = c.createOscillator();
  osc.type = type;
  const t = c.currentTime + delay;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + a + d);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + a + d + 0.05);
}

function hiss(o: { c: AudioContext; dest: AudioNode }, type: BiquadFilterType, f0: number, f1: number, q: number, a: number, d: number, peak = 0.5) {
  const { c, dest } = o;
  const src = c.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = c.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  const t = c.currentTime;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + a + d);
  src.connect(f);
  env(c, f, dest, a, d, peak);
  src.start(t, Math.random());
  src.stop(t + a + d + 0.05);
}

const jitter = (v: number, amt = 0.08) => v * (1 + (Math.random() - 0.5) * 2 * amt);

export type HitKind = 'wood' | 'stone' | 'ore' | 'flesh' | 'wisp' | 'crystal' | 'build';

export const sfx = {
  swing() {
    const o = out(undefined, 0.35);
    if (o) hiss(o, 'bandpass', 600, 2400, 1.2, 0.04, 0.16, 0.6);
  },
  hit(kind: HitKind, pos?: Pos) {
    const o = out(pos, 0.9);
    if (!o) return;
    if (kind === 'wood' || kind === 'build') {
      tone(o, 'triangle', jitter(170), 90, 0.003, 0.12, 0.7);
      hiss(o, 'lowpass', 1800, 400, 0.7, 0.002, 0.09, 0.5);
    } else if (kind === 'stone') {
      tone(o, 'square', jitter(420), 220, 0.002, 0.06, 0.2);
      hiss(o, 'bandpass', 3000, 1200, 1.5, 0.002, 0.12, 0.7);
    } else if (kind === 'ore' || kind === 'crystal') {
      hiss(o, 'bandpass', 3200, 1500, 1.4, 0.002, 0.08, 0.5);
      tone(o, 'sine', jitter(kind === 'crystal' ? 1760 : 1320, 0.04), kind === 'crystal' ? 1700 : 1290, 0.002, 0.5, 0.28);
      tone(o, 'sine', jitter(kind === 'crystal' ? 2640 : 1980, 0.04), 1900, 0.002, 0.35, 0.14);
    } else if (kind === 'flesh') {
      tone(o, 'sine', jitter(110), 60, 0.004, 0.14, 0.8);
      hiss(o, 'lowpass', 900, 200, 0.7, 0.003, 0.08, 0.4);
    } else if (kind === 'wisp') {
      tone(o, 'sawtooth', jitter(300), 120, 0.01, 0.25, 0.18);
      hiss(o, 'highpass', 2500, 5000, 0.7, 0.01, 0.2, 0.3);
    }
  },
  breakNode(kind: 'wood' | 'stone', pos?: Pos) {
    const o = out(pos, 1);
    if (!o) return;
    hiss(o, 'lowpass', kind === 'wood' ? 1200 : 2400, 150, 0.8, 0.005, 0.5, 0.9);
    tone(o, 'triangle', kind === 'wood' ? 120 : 200, 45, 0.005, 0.4, 0.6);
  },
  place(pos?: Pos) {
    const o = out(pos, 0.7);
    if (!o) return;
    tone(o, 'sine', jitter(140), 70, 0.003, 0.18, 0.8);
    hiss(o, 'lowpass', 1400, 300, 0.7, 0.002, 0.1, 0.4);
  },
  pickup() {
    const o = out(undefined, 0.25);
    if (!o) return;
    tone(o, 'sine', 880, 1320, 0.005, 0.12, 0.4);
  },
  coin() {
    const o = out(undefined, 0.35);
    if (!o) return;
    tone(o, 'square', 1320, 1320, 0.003, 0.08, 0.18);
    tone(o, 'square', 1760, 1760, 0.003, 0.25, 0.18, 0.07);
  },
  craft() {
    const o = out(undefined, 0.4);
    if (!o) return;
    [523, 659, 784].forEach((f, i) => tone(o, 'triangle', f, f, 0.01, 0.35, 0.3, i * 0.08));
  },
  fanfare() {
    const o = out(undefined, 0.45);
    if (!o) return;
    [523, 659, 784, 1047].forEach((f, i) => tone(o, 'triangle', f, f, 0.01, i === 3 ? 0.7 : 0.18, 0.35, i * 0.11));
  },
  hurt() {
    const o = out(undefined, 0.8);
    if (!o) return;
    tone(o, 'sine', 160, 55, 0.005, 0.25, 0.9);
    hiss(o, 'lowpass', 800, 200, 0.7, 0.005, 0.15, 0.5);
  },
  footstep(surface: 'grass' | 'wood') {
    const o = out(undefined, surface === 'wood' ? 0.22 : 0.14);
    if (!o) return;
    if (surface === 'wood') tone(o, 'triangle', jitter(130, 0.15), 80, 0.002, 0.07, 0.5);
    hiss(o, surface === 'wood' ? 'lowpass' : 'bandpass', jitter(surface === 'wood' ? 900 : 1600, 0.2), 500, 0.8, 0.005, 0.07, 0.5);
  },
  land() {
    const o = out(undefined, 0.3);
    if (!o) return;
    tone(o, 'sine', 90, 50, 0.003, 0.12, 0.7);
    hiss(o, 'lowpass', 700, 200, 0.7, 0.003, 0.1, 0.4);
  },
  moo(pos: Pos) {
    const o = out(pos, 0.8, 45);
    if (!o) return;
    const f = o.c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    f.connect(o.dest);
    tone({ c: o.c, dest: f }, 'sawtooth', jitter(150), jitter(105), 0.15, 0.9, 0.45);
  },
  oink(pos: Pos) {
    const o = out(pos, 0.7, 35);
    if (!o) return;
    for (let i = 0; i < 2; i++) tone(o, 'square', jitter(320), 200, 0.01, 0.09, 0.2, i * 0.16);
  },
  cluck(pos: Pos) {
    const o = out(pos, 0.6, 30);
    if (!o) return;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) tone(o, 'triangle', jitter(950, 0.12), 600, 0.004, 0.06, 0.3, i * 0.11);
  },
  wispDive(pos: Pos) {
    const o = out(pos, 0.9, 50);
    if (!o) return;
    tone(o, 'sawtooth', 220, 880, 0.35, 0.3, 0.12);
    tone(o, 'sine', 233, 932, 0.35, 0.3, 0.18);
    hiss(o, 'bandpass', 400, 3000, 2, 0.3, 0.35, 0.5);
  },
  growl(pos: Pos) {
    const o = out(pos, 0.9, 40);
    if (!o) return;
    const lfo = o.c.createOscillator();
    const depth = o.c.createGain();
    const amp = o.c.createGain();
    lfo.frequency.value = 26;
    depth.gain.value = 0.35;
    amp.gain.value = 0.55;
    lfo.connect(depth).connect(amp.gain);
    const f = o.c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500;
    amp.connect(f).connect(o.dest);
    tone({ c: o.c, dest: amp }, 'sawtooth', jitter(85), 70, 0.15, 0.8, 0.6);
    lfo.start();
    lfo.stop(o.c.currentTime + 1.1);
  },
  bite(pos: Pos) {
    const o = out(pos, 1, 30);
    if (!o) return;
    hiss(o, 'highpass', 2000, 4000, 0.8, 0.002, 0.05, 0.8);
    tone(o, 'square', 300, 120, 0.002, 0.06, 0.25);
  },
  slam(pos: Pos) {
    const o = out(pos, 1, 50);
    if (!o) return;
    tone(o, 'sine', 70, 35, 0.005, 0.6, 1);
    hiss(o, 'lowpass', 1500, 120, 0.7, 0.005, 0.5, 0.8);
  },
  nightfall() {
    const o = out(undefined, 0.35);
    if (!o) return;
    tone(o, 'sine', 110, 104, 0.6, 2.2, 0.5);
    tone(o, 'sine', 165, 156, 0.6, 2.2, 0.25);
  },
  dawn() {
    const o = out(undefined, 0.3);
    if (!o) return;
    [392, 494, 587].forEach((f, i) => tone(o, 'sine', f, f, 0.2, 1.2, 0.25, i * 0.25));
  },
  chirp() {
    // A distant bird, panned somewhere random.
    const o = out({ x: player.pos.x + (Math.random() - 0.5) * 40, y: player.pos.y + 6, z: player.pos.z + (Math.random() - 0.5) * 40 }, 0.18, 60);
    if (!o) return;
    const base = 2200 + Math.random() * 1600;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) tone(o, 'sine', base, base * (1.2 + Math.random() * 0.3), 0.01, 0.07, 0.25, i * 0.09);
  },
  cricket() {
    const o = out({ x: player.pos.x + (Math.random() - 0.5) * 30, y: player.pos.y, z: player.pos.z + (Math.random() - 0.5) * 30 }, 0.1, 50);
    if (!o) return;
    for (let i = 0; i < 6; i++) tone(o, 'sine', 4200, 4100, 0.004, 0.025, 0.2, i * 0.05);
  },
};

// ---------------------------------------------------------------------------
// Ambient wind bed (continuous, swells and fades slowly)

let wind: { gain: GainNode; filter: BiquadFilterNode } | null = null;

export function updateAmbient(t: number, intensity: number) {
  if (!ctx || !master || !noise) return;
  if (!wind) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    filter.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(master);
    src.start();
    wind = { gain, filter };
  }
  const swell = 0.5 + 0.5 * Math.sin(t * 0.13) * Math.sin(t * 0.07 + 1);
  wind.gain.gain.setTargetAtTime(0.05 + 0.08 * swell * intensity, ctx.currentTime, 0.5);
  wind.filter.frequency.setTargetAtTime(350 + 500 * swell, ctx.currentTime, 0.5);
}
