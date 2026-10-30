import { useEffect, useState } from 'react';
import { goToWorld, MP_WORLD, playerName, setPlayerName } from '../game/mode';

interface ServerInfo {
  id: string;
  name: string;
  players: number;
  max: number;
}

const API = `${import.meta.env.BASE_URL}mp/servers`;

/** Multiplayer server browser: pick a name, join a live world or create one. */
export function ServerList({ onBack }: { onBack: () => void }) {
  const [servers, setServers] = useState<ServerInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(playerName());
  const [newWorld, setNewWorld] = useState('');

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(API, { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        if (alive) {
          setServers((await res.json()) as ServerInfo[]);
          setError(null);
        }
      } catch {
        if (alive) setError("Couldn't reach the game server.");
      }
    };
    void load();
    const id = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const join = (id: string) => {
    setPlayerName(name);
    goToWorld(id);
  };

  const create = async () => {
    const n = newWorld.trim();
    if (!n) return;
    try {
      const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n }) });
      const s = (await res.json()) as ServerInfo;
      join(s.id);
    } catch {
      setError("Couldn't create the world.");
    }
  };

  return (
    <div className="servers">
      <h2 className="servers__title">Multiplayer</h2>
      <label className="servers__name">
        Your name
        <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} onBlur={() => setPlayerName(name)} />
      </label>
      <div className="servers__list">
        {servers === null && !error && <div className="servers__empty">Looking for worlds…</div>}
        {error && <div className="servers__error">{error}</div>}
        {servers?.map((s) => (
          <div key={s.id} className={`server ${s.id === MP_WORLD ? 'server--here' : ''}`}>
            <div>
              <div className="server__name">{s.name}</div>
              <div className="server__meta">
                <span className={`server__dot ${s.players > 0 ? 'server__dot--live' : ''}`} />
                {s.players}/{s.max} online
              </div>
            </div>
            <button className="recipe__btn" disabled={s.id === MP_WORLD || s.players >= s.max} onClick={() => join(s.id)}>
              {s.id === MP_WORLD ? 'Playing' : 'Join'}
            </button>
          </div>
        ))}
      </div>
      <div className="servers__create">
        <input placeholder="New world name" value={newWorld} maxLength={40} onChange={(e) => setNewWorld(e.target.value)} />
        <button className="recipe__btn" disabled={!newWorld.trim()} onClick={() => void create()}>
          Create
        </button>
      </div>
      <div className="menu__row">
        {MP_WORLD && (
          <button className="ghost-btn" onClick={() => goToWorld(null)}>
            Back to singleplayer
          </button>
        )}
        <button className="ghost-btn" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}
