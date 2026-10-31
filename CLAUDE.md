# realms — Steward Agent

You are the dedicated agent for the **realms** fraigent app. Your job is to oversee its development, maintenance, and operation.

This file was generated when the app was provisioned. Edit freely — it is not regenerated.

## Layout

Repo root: `/home/balaa/fraigent-apps/realms`

Services:
- `realms` — vite-react-ts, port 5207, cwd `/home/balaa/fraigent-apps/realms`

## Daily ops

Restart services:
- `curl -X POST http://localhost:3001/api/apps/realms/restart`

Tail logs:
- `tmux attach -t fraigent-app-realms`

This app's records live in `~/.config/fraigent-apps/apps.json` under `app: "realms"`. The frontend renders embeddable services as iframes; the backend (if any) appears as a service row with a refresh button.

## Hard rules

- **Preserve user work.** Inspect `git status --short` before edits; never revert/stash/clean unrelated changes without explicit instruction.
- Frontend (Vite) hot-reloads. Backend changes need a restart: `curl -X POST http://localhost:3001/api/apps/<name>/restart` (or the sidebar refresh button). **Runtime is tmux, not systemd** — `systemctl --user restart <unit>` does nothing despite the `unit` name.
- TypeScript strict on both frontend and backend templates.

## Restart reports "spawned," not "healthy" — always verify

The restart call returns `{ok:true}` the instant the tmux session is created. It
does **not** confirm your process survived. A `ts-node` backend that crashes on
a type error still returns `{ok:true}`, then its session dies and the port
silently never opens. So:

1. **Before restarting**, typecheck — a type error is a *fatal boot crash*, not
   a warning: `npx tsc --noEmit` (run in each of `frontend/` and `backend/`).
   Must be clean.
2. **After restarting**, confirm the session lived and the port answers:
   ```sh
   sleep 3
   tmux has-session -t <unit> && echo alive || echo DEAD
   curl -s http://127.0.0.1:<port>/health     # for a backend
   ```
3. If DEAD, capture the crash **now** — once the pane is gone the stderr is gone
   too (no log file). Reproduce in the foreground: `PORT=<port> npx ts-node src/index.ts`.

## Template gotchas that cost the most time

- **`req.params.<x>` is typed `string | string[]`** (Express 5 + `@types/express@5`,
  strict) → reading a route param fails `tsc` (`TS2345`). Coerce at the
  boundary: `const id = String(req.params.id)`.
- **`import.meta.env` needs a type reference.** If you read env vars, add
  `src/vite-env.d.ts` containing `/// <reference types="vite/client" />`, else
  typecheck fails.
- **Calling your own backend (fullstack):** don't fetch the injected
  `VITE_API_URL` (raw `localhost:<port>`) directly — it bypasses the proxy and
  breaks under the iframe and on phones. Add a `server.proxy` in `vite.config.ts`
  forwarding `${base}api` → the backend port (stripping the base), and build
  frontend URLs from `${import.meta.env.BASE_URL}api`. Full snippet in
  `docs/FEATURE_FRAIGENT_APPS.md` → "Calling your own backend".

## Broader system

Provisioning, the registry, and the templates that scaffolded this app live in the **apps-backend**:

- Code: `~/workspace-gemini/fraigent-dev/amux/apps-backend/` (dev worktree — never edit prod).
- Project guardrails: `~/workspace-gemini/fraigent-dev/amux/CLAUDE.md`.
- Apps roadmap & deferred work: `~/fraigent-apps/CLAUDE.md`.

Keep changes scoped to this app's repo unless the user explicitly asks for cross-cutting work.

## Game: Realms (sky-island builder)

First-person 3D builder: explore floating islands, gather wood/stone/ores, hunt
cows/pigs/chickens, and snap-build floors/walls/ramps to bridge between islands.
Direction chosen by the operator via ask-api card `realms-style-direction-v1`
(sky-island builder + ores + farm animals; no wave/glide modes).

Stack: three + @react-three/fiber v8 + drei + postprocessing, zustand (persisted
to localStorage key `realms-save-v1`). No physics engine — custom kinematic
controller.

- `src/game/world.ts` — island defs, terrain height functions, deterministic resource nodes.
- `src/game/pieces.ts` — build grid (CELL=LEVEL=3m), piece transforms, placement snapping.
- `src/game/physics.ts` — support height / push-out / ceiling against terrain, pieces, trees.
- `src/game/mobs.ts` — mob AI + hits; `src/game/fx.ts` — per-frame mutable shared state.
- `src/scene/*` — R3F components; `src/ui/*` — DOM HUD + menu.
- `src/game/hostiles.ts` — Gloomwisps: night-only flyers that chase the player and collide with build pieces (shelters work).
- Survival (card `realms-survival-level-v1` → full survival): health/hunger in the store, eat with E,
  fall damage, the cloud sea = knockout (lose half of items, respawn at spawn). Day/night = 600 s cycle (`fx.ts` clock).
- Mobile: `IS_TOUCH` in `fx.ts` switches off pointer lock; `src/ui/TouchControls.tsx` writes `touchInput`
  (floating joystick left, drag-look right, action buttons). Phone layout lives in `index.css` media queries.
- Crafting (card `realms-ore-purpose-v1` → tool upgrades + stronger materials): `src/game/crafting.ts`
  recipes, placeable Crafting Table (`benches` in the store), pickaxe tiers multiply hits. Gloomwisps
  gnaw pieces blocking them; `MAT_INFO` in `store.ts` sets per-material cost and toughness (wood 6,
  stone 15, copper 40 strikes). Copper is unlocked by the Copper Plating recipe.
- NPCs + economy: `src/game/npcs.ts` (villager defs, task generation/progress, wandering-trader schedule
  and shop), `src/scene/Npcs.tsx` (models, status diamonds, cart + beam), `src/ui/Dialog.tsx` (talk/shop
  panels). Villager spots are `NPC_SPOTS` in `world.ts`. Coins are the `coin` item. Trader timing runs on
  the world clock (`tickTrader` from the Game ticker); clicking a villager or the trader opens a dialog
  instead of swinging. Overlay panels share `src/ui/panel.ts` (release/re-acquire pointer lock).
- Graphics presets (`src/scene/quality.ts`): Fast / High (stylised) / Realistic. Realistic swaps every
  material to PBR via the `surface()` factory in `materials.ts` (always create materials through it), uses
  `natural()` to mute palettes, and adds `RealisticSky.tsx` (Preetham sky + PMREM env lighting, stars,
  drei volumetric clouds), PCSS soft shadows, 4K shadow map, N8AO + ACES. Switching in/out reloads the page.
  Textures are procedural (`src/scene/textures.ts`). Realistic mode additionally hot-swaps CC0 Poly Haven
  photo textures + a sky HDRI (`src/scene/photoTextures.ts`, HDRI in `RealisticSky.tsx`) from
  `public/assets/ph/` — gitignored, fetch with `bash scripts/fetch-assets.sh` on a fresh clone (missing
  files just fall back to procedural). Realistic also adds god rays (sun disc in `RealisticEffects`).
- **Multiplayer.** `server/mp.ts` is a Vite plugin (registered in `vite.config.ts`) hosting the game server
  inside the dev server: `GET/POST {base}mp/servers` (server list / create world) and `WS {base}mp/ws?world=&name=`.
  Worlds persist to `server-data/<id>.json` (gitignored). Shared: pieces, benches, depleted nodes, world clock.
  Per-player (localStorage key `realms-mp-<world>`): inventory, vitals, tasks. Mobs/wisps/trader are NOT synced.
  Client: `src/game/net.ts` (diffs store changes → server; applies remote ops), `src/game/mode.ts`
  (`?world=<id>` selects multiplayer), `src/scene/RemotePlayers.tsx`, `src/ui/ServerList.tsx`.
  **Changing `server/` or `vite.config.ts` needs an app restart.** In multiplayer, chat goes to players and
  only `@claude …` messages reach this session (prefixed with the player's name).
- Night creatures: Gloomwisps (`src/game/hostiles.ts`, stalk/wind-up/dive state machine) and ground
  predators Duskwolf + Shardback (`src/game/predators.ts`, `src/scene/Predators.tsx`). Every creature has a
  toon AND a realistic version (realistic = `sculpt()` + `patternMaterial()` from `RealisticAnimals.tsx`) —
  keep that parity for any new mob. `shot.mjs ... hostiles` freezes and lines them up for a screenshot.
- Sound: fully procedural Web Audio (`src/game/sound.ts` = `sfx.*` synths + wind bed; `src/scene/SoundSystem.tsx`
  = ambience/footsteps/animal calls/growls). No audio files. M or the menu toggles mute.
- **See before you ship visuals.** `node scripts/shot.mjs <out.png> [quality] [worldTime] [x,y,z,yaw] [waitMs]`
  screenshots the running game with the project-local Chromium in `.browsers/` (gitignored; install with
  `PLAYWRIGHT_BROWSERS_PATH=.browsers node_modules/.bin/playwright-core install chromium`). Save shots under
  `.shots/` and Read them. Realistic-only vegetation lives in `src/scene/RealisticFlora.tsx`.
- **Vite sometimes misses rapid edits** and serves a stale module (seen 3×). After a batch of edits, confirm
  with `curl -s <url>/src/... | grep -c <new symbol>`; if stale, restart the app. Note edits hot-reload into
  the player's live game, so a half-finished multi-file change can crash it. **Edit order: add imports and
  new exports FIRST, then the code that uses them** — every intermediate save must be runnable (this has
  crashed the player's game twice: `mergeGeometries`, `player` not defined).
- **In-game chat ↔ this steward session.** Messages typed in game (T / Enter, or the Chat button on
  touch) arrive in this tmux pane prefixed `[realms chat]` via fraigent-command's send-keys endpoint
  (target `fraigent_steward_realms:0`, see `src/game/chat.ts`). **Reply in-game** with
  `scripts/chat-reply "message"` — it appends to `public/chat.jsonl`, which the game polls every 2 s.
  Keep in-game replies short (one or two lines); put long answers in the terminal.
  **Game commands:** `scripts/chat-cmd <name>` sends a command the game runs once the player has pressed
  Play (`runCommand` in `src/ui/Chat.tsx`). Current: `summonTrader` (cart 4 m in front of the player).
  Add new commands there when the player asks for in-world actions.
- Dev-only debug hook: `window.__realms = { useGame, player, clock, WISPS }`.
