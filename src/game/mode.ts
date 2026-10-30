/**
 * Singleplayer vs multiplayer is chosen by the URL: `?world=<id>` joins that
 * server world; no param is the local singleplayer world. Kept import-free so
 * the store can read it while it's being created.
 */
export const MP_WORLD: string | null = (() => {
  const w = new URLSearchParams(window.location.search).get('world');
  return w && /^[a-z0-9-]{1,40}$/.test(w) ? w : null;
})();

const NAME_KEY = 'realms-name';

export function playerName(): string {
  return localStorage.getItem(NAME_KEY) || 'Player';
}

export function setPlayerName(n: string) {
  localStorage.setItem(NAME_KEY, n.replace(/[^\w \-]/g, '').slice(0, 20) || 'Player');
}

/** Navigate to a world (null = singleplayer). Reloads so the store picks the right save slot. */
export function goToWorld(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('world', id);
  else url.searchParams.delete('world');
  window.location.href = url.toString();
}
