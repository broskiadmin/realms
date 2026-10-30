import { clock, player } from './fx';
import { MP_WORLD, playerName } from './mode';
import { useGame, type Bench, type Piece } from './store';

/**
 * Multiplayer client. Shared world state (pieces, crafting tables, harvested
 * nodes, world clock) syncs through the realms-multiplayer server in server/mp.ts.
 * Local store changes are diffed and sent; remote changes are applied with
 * `applying` set so they aren't echoed back.
 */

export interface RemotePlayer {
  id: string;
  name: string;
  /** Rendered (interpolated) pose. */
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Latest pose from the network. */
  tx: number;
  ty: number;
  tz: number;
  tyaw: number;
  seen: boolean;
}

export const remotes = new Map<string, RemotePlayer>();

export const net = {
  connected: false,
  worldName: '',
  /** Bumped whenever the remote player set changes, for UI to re-render. */
  version: 0,
};

let ws: WebSocket | null = null;
let applying = false;
let retry = 1000;

function send(msg: unknown) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function upsertRemote(id: string, name: string, pose?: { x: number; y: number; z: number; yaw: number } | null) {
  let r = remotes.get(id);
  if (!r) {
    r = { id, name, x: 0, y: -999, z: 0, yaw: 0, tx: 0, ty: -999, tz: 0, tyaw: 0, seen: false };
    remotes.set(id, r);
    net.version++;
  }
  if (pose) {
    r.tx = pose.x;
    r.ty = pose.y;
    r.tz = pose.z;
    r.tyaw = pose.yaw;
    if (!r.seen) {
      r.x = pose.x;
      r.y = pose.y;
      r.z = pose.z;
      r.yaw = pose.yaw;
      r.seen = true;
    }
  }
}

function applyRemote(fn: () => void) {
  applying = true;
  try {
    fn();
  } finally {
    applying = false;
  }
}

function onMessage(m: Record<string, any>) {
  const g = useGame.getState();
  switch (m.t) {
    case 'welcome':
      applyRemote(() =>
        useGame.setState({ pieces: m.world.pieces as Piece[], benches: m.world.benches as Bench[], depleted: m.world.depleted }),
      );
      clock.total = m.world.worldTime;
      net.connected = true;
      net.worldName = m.world.name;
      retry = 1000;
      remotes.clear();
      for (const p of m.players) upsertRemote(p.id, p.name, p.pose);
      net.version++;
      g.toast('net', `Joined ${m.world.name}`, '#7fd4ff', 1);
      return;
    case 'join':
      upsertRemote(m.id, m.name);
      g.pushChat('system', `${m.name} joined the world`);
      return;
    case 'leave': {
      const r = remotes.get(m.id);
      remotes.delete(m.id);
      net.version++;
      if (r) g.pushChat('system', `${r.name} left the world`);
      return;
    }
    case 'pose': {
      const r = remotes.get(m.id);
      if (r) upsertRemote(m.id, r.name, { x: m.x, y: m.y, z: m.z, yaw: m.yaw });
      return;
    }
    case 'piece+':
      if (!g.pieces.some((p) => p.id === m.piece.id)) applyRemote(() => useGame.setState({ pieces: [...g.pieces, m.piece] }));
      return;
    case 'piece-':
      applyRemote(() => useGame.setState({ pieces: g.pieces.filter((p) => p.id !== m.id) }));
      return;
    case 'bench+':
      if (!g.benches.some((b) => b.id === m.bench.id)) applyRemote(() => useGame.setState({ benches: [...g.benches, m.bench] }));
      return;
    case 'bench-':
      applyRemote(() => useGame.setState({ benches: g.benches.filter((b) => b.id !== m.id) }));
      return;
    case 'deplete':
      applyRemote(() => useGame.setState({ depleted: { ...g.depleted, [m.node]: m.until } }));
      return;
    case 'time':
      // Snap on big drift, otherwise ease toward the server clock.
      clock.total = Math.abs(m.worldTime - clock.total) > 3 ? m.worldTime : clock.total + (m.worldTime - clock.total) * 0.5;
      return;
    case 'chat':
      g.pushChat('player', m.text, m.name);
      return;
  }
}

/** Send local edits to the server by diffing store snapshots. */
function watchStore() {
  useGame.subscribe((s, prev) => {
    if (applying || !net.connected) return;
    if (s.pieces !== prev.pieces) {
      const before = new Set(prev.pieces.map((p) => p.id));
      const after = new Set(s.pieces.map((p) => p.id));
      for (const p of s.pieces) if (!before.has(p.id)) send({ t: 'piece+', piece: p });
      for (const id of before) if (!after.has(id)) send({ t: 'piece-', id });
    }
    if (s.benches !== prev.benches) {
      const before = new Set(prev.benches.map((b) => b.id));
      const after = new Set(s.benches.map((b) => b.id));
      for (const b of s.benches) if (!before.has(b.id)) send({ t: 'bench+', bench: b });
      for (const id of before) if (!after.has(id)) send({ t: 'bench-', id });
    }
    if (s.depleted !== prev.depleted) {
      for (const [node, until] of Object.entries(s.depleted)) if (!(node in prev.depleted)) send({ t: 'deplete', node, until });
    }
  });
}

function connect() {
  if (!MP_WORLD) return;
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${proto}://${window.location.host}${import.meta.env.BASE_URL}mp/ws?world=${encodeURIComponent(MP_WORLD)}&name=${encodeURIComponent(playerName())}`;
  ws = new WebSocket(url);
  ws.onmessage = (e) => {
    try {
      onMessage(JSON.parse(String(e.data)));
    } catch {
      // ignore malformed frames
    }
  };
  ws.onclose = () => {
    const was = net.connected;
    net.connected = false;
    remotes.clear();
    net.version++;
    if (was) useGame.getState().toast('net', 'Lost connection — reconnecting…', '#ff8a8a', 1);
    setTimeout(connect, retry);
    retry = Math.min(retry * 2, 15000);
  };
}

export function sendChat(text: string) {
  send({ t: 'chat', text });
}

let started = false;

/** Start networking once (no-op in singleplayer). */
export function startNet() {
  if (!MP_WORLD || started) return;
  started = true;
  watchStore();
  connect();
  let last = '';
  setInterval(() => {
    if (!net.connected) return;
    const p = player.pos;
    const pose = { t: 'pose', x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), yaw: +player.yaw.toFixed(3) };
    const key = `${pose.x},${pose.y},${pose.z},${pose.yaw}`;
    if (key !== last) {
      last = key;
      send(pose);
    }
  }, 100);
}
