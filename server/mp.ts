import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import type { Plugin } from 'vite';
import { WebSocket, WebSocketServer } from 'ws';

/**
 * Realms multiplayer server, hosted inside the Vite dev server so it rides the
 * same /app/realms/ origin (and fraigent's WebSocket-capable proxy).
 *
 *   GET  {base}mp/servers           → [{ id, name, players, max }]
 *   POST {base}mp/servers {name}    → create a world
 *   WS   {base}mp/ws?world=ID&name= → join a world
 *
 * Shared world state: build pieces, crafting tables, harvested nodes, world clock.
 * Persisted to server-data/<id>.json (gitignored).
 */

const MAX_PLAYERS = 12;
const SAVE_DEBOUNCE_MS = 2000;

interface WorldState {
  id: string;
  name: string;
  pieces: Record<string, unknown>[];
  benches: Record<string, unknown>[];
  depleted: Record<string, number>;
  worldTime: number;
}

interface PlayerConn {
  id: string;
  name: string;
  ws: WebSocket;
  pose: { x: number; y: number; z: number; yaw: number } | null;
}

interface World {
  state: WorldState;
  players: Map<string, PlayerConn>;
  saveTimer: NodeJS.Timeout | null;
}

const ID_RE = /^[a-z0-9-]{1,40}$/;

export function realmsMultiplayer(dataDir: string): Plugin {
  const worlds = new Map<string, World>();
  fs.mkdirSync(dataDir, { recursive: true });

  const file = (id: string) => path.join(dataDir, `${id}.json`);

  function load() {
    for (const f of fs.readdirSync(dataDir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const state = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8')) as WorldState;
        if (ID_RE.test(state.id)) worlds.set(state.id, { state, players: new Map(), saveTimer: null });
      } catch {
        // Skip a corrupt save rather than refusing to start.
      }
    }
    if (worlds.size === 0) create('Skyhaven');
  }

  function create(name: string): World {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'world';
    let id = base;
    for (let i = 2; worlds.has(id); i++) id = `${base}-${i}`;
    const w: World = {
      state: { id, name: name.slice(0, 40), pieces: [], benches: [], depleted: {}, worldTime: 0 },
      players: new Map(),
      saveTimer: null,
    };
    worlds.set(id, w);
    save(w, true);
    return w;
  }

  function save(w: World, now = false) {
    if (w.saveTimer) clearTimeout(w.saveTimer);
    const write = () => {
      w.saveTimer = null;
      fs.writeFileSync(file(w.state.id), JSON.stringify(w.state));
    };
    if (now) write();
    else w.saveTimer = setTimeout(write, SAVE_DEBOUNCE_MS);
  }

  function send(ws: WebSocket, msg: unknown) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  function broadcast(w: World, msg: unknown, except?: string) {
    const data = JSON.stringify(msg);
    for (const p of w.players.values()) if (p.id !== except && p.ws.readyState === WebSocket.OPEN) p.ws.send(data);
  }

  function list() {
    return [...worlds.values()].map((w) => ({ id: w.state.id, name: w.state.name, players: w.players.size, max: MAX_PLAYERS }));
  }

  // The world clock advances in real time while anyone is online.
  setInterval(() => {
    for (const w of worlds.values()) {
      if (w.players.size === 0) continue;
      w.state.worldTime += 1;
      const now = Date.now();
      for (const [k, until] of Object.entries(w.state.depleted)) if (until <= now) delete w.state.depleted[k];
      if (w.state.worldTime % 5 === 0) {
        broadcast(w, { t: 'time', worldTime: w.state.worldTime });
        save(w);
      }
    }
  }, 1000);

  function handle(w: World, p: PlayerConn, raw: string) {
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    const s = w.state;
    switch (m.t) {
      case 'pose': {
        const { x, y, z, yaw } = m as { x: number; y: number; z: number; yaw: number };
        if (![x, y, z, yaw].every(Number.isFinite)) return;
        p.pose = { x, y, z, yaw };
        broadcast(w, { t: 'pose', id: p.id, x, y, z, yaw }, p.id);
        return;
      }
      case 'piece+': {
        const piece = m.piece as Record<string, unknown> | undefined;
        if (!piece || typeof piece.id !== 'string' || s.pieces.some((q) => q.id === piece.id)) return;
        s.pieces.push(piece);
        broadcast(w, { t: 'piece+', piece }, p.id);
        break;
      }
      case 'piece-': {
        if (typeof m.id !== 'string') return;
        s.pieces = s.pieces.filter((q) => q.id !== m.id);
        broadcast(w, { t: 'piece-', id: m.id }, p.id);
        break;
      }
      case 'bench+': {
        const bench = m.bench as Record<string, unknown> | undefined;
        if (!bench || typeof bench.id !== 'string' || s.benches.some((b) => b.id === bench.id)) return;
        s.benches.push(bench);
        broadcast(w, { t: 'bench+', bench }, p.id);
        break;
      }
      case 'bench-': {
        if (typeof m.id !== 'string') return;
        s.benches = s.benches.filter((b) => b.id !== m.id);
        broadcast(w, { t: 'bench-', id: m.id }, p.id);
        break;
      }
      case 'deplete': {
        if (typeof m.node !== 'string' || typeof m.until !== 'number') return;
        s.depleted[m.node] = m.until;
        broadcast(w, { t: 'deplete', node: m.node, until: m.until }, p.id);
        break;
      }
      case 'chat': {
        if (typeof m.text !== 'string') return;
        broadcast(w, { t: 'chat', name: p.name, text: m.text.slice(0, 400) }, p.id);
        return;
      }
      default:
        return;
    }
    save(w);
  }

  function upgrade(wss: WebSocketServer, req: IncomingMessage, socket: Duplex, head: Buffer) {
    const url = new URL(req.url ?? '', 'http://x');
    const w = worlds.get(url.searchParams.get('world') ?? '');
    if (!w || w.players.size >= MAX_PLAYERS) {
      socket.destroy();
      return;
    }
    const name = (url.searchParams.get('name') ?? 'Player').replace(/[^\w \-]/g, '').slice(0, 20) || 'Player';
    wss.handleUpgrade(req, socket, head, (ws) => {
      const p: PlayerConn = { id: Math.random().toString(36).slice(2, 10), name, ws, pose: null };
      w.players.set(p.id, p);
      send(ws, {
        t: 'welcome',
        you: p.id,
        world: w.state,
        players: [...w.players.values()].filter((q) => q.id !== p.id).map((q) => ({ id: q.id, name: q.name, pose: q.pose })),
      });
      broadcast(w, { t: 'join', id: p.id, name: p.name }, p.id);
      ws.on('message', (data) => handle(w, p, data.toString()));
      ws.on('close', () => {
        w.players.delete(p.id);
        broadcast(w, { t: 'leave', id: p.id });
      });
    });
  }

  return {
    name: 'realms-multiplayer',
    configureServer(server) {
      load();
      const base = server.config.base;
      const wss = new WebSocketServer({ noServer: true });
      server.httpServer?.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        // Vite's own HMR socket uses the base path itself; only claim ours.
        if ((req.url ?? '').startsWith(`${base}mp/ws`)) upgrade(wss, req, socket, head);
      });
      server.middlewares.use(`${base}mp/servers`, (req: IncomingMessage, res: ServerResponse) => {
        res.setHeader('Content-Type', 'application/json');
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (c: Buffer) => {
            body += c.toString();
            if (body.length > 2000) req.destroy();
          });
          req.on('end', () => {
            let name = 'New World';
            try {
              name = String((JSON.parse(body) as { name?: unknown }).name ?? name).trim() || name;
            } catch {
              // fall back to default name
            }
            const w = create(name);
            res.end(JSON.stringify({ id: w.state.id, name: w.state.name, players: 0, max: MAX_PLAYERS }));
          });
          return;
        }
        res.end(JSON.stringify(list()));
      });
    },
  };
}
