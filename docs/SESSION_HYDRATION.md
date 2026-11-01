# Realms: Session Hydration Overview

> **Purpose.** Read this first in any new session working on Realms. It captures the game's intent, its
> architecture, every major system, the working conventions, and the gotchas we have hit, so future
> sessions can keep evolving the game without re-reading the code or the old conversation.
> It was last updated on 2026-10-31, at commit `491746b`. If you change something load-bearing, update this file too.

---

## 1. What Realms is

Realms is a **first-person 3D survival builder that runs in the browser**. The world is a set of floating sky islands. You gather wood, stone and ores, snap-build floors, walls and ramps to bridge between islands, and survive the nights. Animals give food, villagers give tasks and coins, a wandering trader sells goods, and night creatures attack. It runs as a **fraigent app**: a Vite + React-TS service on port 5207, embedded at `/app/realms/` behind the fraigent-command proxy on `:3001`. The public URL is `https://app.fraigent.com/app/realms/`.

### 1.1 Design decisions and who made them

The operator steered the design through ask-api cards and in-game chat. Treat these decisions as settled.

| Decision | Source |
|---|---|
| A first-person, original game with a bright Fortnite-like look rather than voxels. Not a copy of any existing game. | Initial brief |
| **Sky-island builder** + **ores** + **farm animals** (cows, pigs, chickens). No wave-survival or glide modes, now or later. | Card `realms-style-direction-v1` |
| **Full survival**: health and hunger, day and night, hostile night creatures, and shelters that matter. | Card `realms-survival-level-v1` |
| Ores drive **tool upgrades** and **stronger building materials**. | Card `realms-ore-purpose-v1` |
| A crafting table, NPC tasks for coins, and a wandering trader with a cart. | In-game chat requests |
| **Real multiplayer** with a server list. | AskUserQuestion |
| A **Realistic** graphics mode that looks "like real life" and can push an RTX 5070, but isn't too laggy. | Repeated user requests |
| Mobile support: touch controls and phone layouts. | User request |
| Sound. | User request |

### 1.2 About the user and operator

- The user is new to game design and programming, so explanations should be gentle. They often dictate by voice, so terminal replies should be **short**.
- They test on a **Mac running Chrome** with an **RTX-5070-class GPU** elsewhere, usually in **Realistic** mode, and often in the multiplayer world `skyhaven`.
- Their feedback is terse and visual: "too dark", "too foggy", "grass looks buggy", "mobs are too OP". Always confirm the problem with a screenshot before tuning (see §5.2).
- They talk to the steward through **in-game chat** (see §4.11) and expect replies there too.

---

## 2. Tech stack

- **three r169**, **@react-three/fiber v8**, **@react-three/drei v9**, and **@react-three/postprocessing v2** (on `postprocessing` 6.x).
- **zustand v4** with `persist` for state, saved to localStorage.
- **React 18**, **TypeScript strict** (both `tsconfig.json` and `tsconfig.node.json`), and **Vite 5**.
- `simplex-noise` for noise; `ws` for the multiplayer server; `playwright-core` (dev only) for headless screenshots.
- There is no physics engine. Movement is a custom kinematic controller.
- There are no 3D model files and no audio files. Everything is procedural, except the CC0 Poly Haven photo textures and HDRI, which are fetched on demand.

---

## 3. Repo map

```
CLAUDE.md                 steward instructions (summary + daily ops); points here
docs/SESSION_HYDRATION.md this file
vite.config.ts            fraigent base-path/HMR config + realmsMultiplayer() plugin
server/mp.ts              multiplayer game server (a Vite plugin: HTTP server list + WS worlds)
scripts/
  chat-reply "msg"        send a chat line into the running game (appends public/chat.jsonl)
  chat-cmd <cmd>          send a game command (e.g. summonTrader) into the running game
  fetch-assets.sh         download Poly Haven textures + sky HDRI → public/assets/ph (gitignored)
  shot.mjs                headless screenshot + per-frame draw stats (see §5.2)
src/main.tsx              entry: CrashGuard first, dev hook window.__realms
src/App.tsx               Canvas, quality state, overlays (HUD, Chat, Crafting, Dialog, Menu, FPS)
src/game/   (pure logic, no React)
  world.ts                islands, terrain height fns, resource nodes, NPC spots, constants
  store.ts                zustand store (persisted + session state), items, materials, quests…
  fx.ts                   per-frame mutable shared state: player, clock/day-night, touchInput, debug
  physics.ts              ground support, push-out, ceilings, getBoxes, pushOutCircle
  pieces.ts               build grid, piece transforms, placement snapping
  mobs.ts                 farm-animal AI
  hostiles.ts             Gloomwisp AI (stalk → windup → dive → recover)
  predators.ts            Duskwolf + Shardback AI (ground predators)
  gnaw.ts                 shared "night creature damages a build piece" logic
  crafting.ts             recipes, crafting table proximity, craft()
  npcs.ts                 villagers, task generation/progress, wandering trader + shop
  chat.ts                 bridge to the steward session (send-keys out, chat.jsonl in)
  net.ts / mode.ts        multiplayer client / singleplayer-vs-world selection
  sound.ts                procedural Web Audio sfx + wind bed
  noise.ts                PRNG, simplex, fbm, smoothstep
src/scene/  (R3F components)
  Game.tsx                scene composition, Ticker, effects stacks, PerformanceMonitor
  Player.tsx              controller, vitals tick, fall/void damage, discovery, saves
  Interaction.tsx         crosshair raycast, harvesting, combat, building, talking
  Islands.tsx             island meshes (triplanar terrain shader) + grass/flowers
  Resources.tsx           trees/rocks/ores (toon) – delegates to RealisticFlora when realistic
  Mobs.tsx / Predators.tsx / Wisps.tsx / Npcs.tsx / RemotePlayers.tsx / Benches.tsx / Pieces.tsx
  Environment.tsx         stylised sky, lights + day/night, stylised clouds
  RealisticSky.tsx        Preetham sky, HDRI/PMREM env, stars, volumetric clouds
  RealisticFlora.tsx      leaf-card trees, needle pines, noise boulders
  RealisticAnimals.tsx    SDF-sculpted animals + patternMaterial fur shader (shared helpers)
  sdf.ts                  SDF primitives + marching-cubes polygonizer
  materials.ts            surface() factory, toon(), pieceMaterials, shared geos
  quality.ts              Fast / High / Realistic presets, natural() palette muting
  textures.ts / animalTextures.ts / photoTextures.ts   procedural + photo textures
  Viewmodel.tsx / Particles.tsx / SoundSystem.tsx
src/ui/     DOM overlays: HUD, Menu, Chat, Crafting, Dialog (NPC/trader), ServerList,
            TouchControls, CrashGuard, FpsMeter, panel.ts (pointer-lock helpers)
```

---

## 4. Systems

### 4.1 World and terrain (`game/world.ts`, `scene/Islands.tsx`)

- There are six islands in `ISLANDS`: Hearthmeadow (home), Whisperwood, Rumblestone Quarry, Sunpeak Highlands, Skyglass Spire and Cluckling Isle. Each has a biome palette, `baseY` (always a multiple of the 3 m grid level), resource counts, mobs and grass density.
- **The same height function drives both rendering and collision.** `topAt` and `islandHeight` and `terrainAt` are used by the mesh builder and by physics alike. Never change one without the other.
- Island meshes are radial: a grassy top, then a rocky underside that tapers to a point. The palette lives in vertex colours, and a **triplanar detail shader** adds texture with no UVs.
- **Resource nodes** (`NODES`) are generated deterministically from per-island seeds. Ids like `t0-3` are stable across reloads, which is what lets saves and multiplayer reference them. Placement avoids the spawn point and `NPC_SPOTS`.

### 4.2 State (`game/store.ts`) and per-frame state (`game/fx.ts`)

- **zustand + persist.**
  - Singleplayer saves to localStorage under `realms-save-v1`.
  - Each multiplayer world saves to `realms-mp-<worldId>`.
  - `partialize` lists the persisted keys explicitly. **Add new persisted fields there.**
- **Persisted** state includes: inventory, pieces, depleted nodes, discovered islands, player pose, health, hunger, worldTime, pickTier, benches, copperUnlocked, quests, wispKills, visits, trader, and nextTraderAt.
- **Session** state includes: tool, mat, rampRot, locked, started, target, toasts, banner, chat, chatOpen, craftOpen, dialog, koUntil and hurtId.
- **Hot 60 fps values never go through React or zustand.** They live in `fx.ts`: `player` (pos, vel, onGround, speed, yaw), `clock.total` with `dayPhase()` and `isNight()`, `touchInput`, `ghost`, `swing`, `hitTimes`, `damage`, `wear` and `debug`.
- Items, materials (`MAT_INFO`: cost and toughness), `PICK_TIERS`, `FOOD` and quest/trader types all live in `store.ts`.

### 4.3 Player and physics (`scene/Player.tsx`, `game/physics.ts`)

- The controller is kinematic:
  - **Speeds:** walk 5.2, sprint 8.4. Gravity is 26, jump is 9, and the player is 1.75 m tall with radius 0.35.
  - **Collision:** `supportHeight` finds the highest walkable surface within `STEP` (0.75 m), counting terrain, piece tops and ramps. `resolveHorizontal` pushes the player out of walls, trees, rocks, benches, NPCs and the trader's cart.
  - **Low edges are stepped onto, not walls.** A box whose top is within `STEP` of the feet doesn't block. This fixed the bug where the player stalled at the top of a ramp.
- **Collision shapes are cached** and rebuilt only when the store's `pieces`, `depleted`, `benches` or `trader` reference changes.
- **Damage:** a fall of more than 5 m hurts. Falling below y = −45 into the cloud sea knocks you out: you lose half of every item and respawn at Hearthmeadow.

### 4.4 Building (`game/pieces.ts`)

- The grid is `CELL` = `LEVEL` = 3 m. There are three piece types:
  - **floor:** a cell.
  - **wall:** `rot` 0 is the min-z edge and 1 is the min-x edge. This dedupes shared edges.
  - **ramp:** `rot` is the rising direction.
- `computePlacement()` snaps from the crosshair hit, or from a point about one cell ahead when the ray hits nothing, which is what makes bridges extend naturally.
- Holding click places rapidly ("spam-build").
- **Materials:** wood (10 wood) and stone (10 stone) are always available. Copper (5 copper) is unlocked by crafting Copper Plating.
- **Toughness** (Gloomwisp strikes before a piece breaks): wood 6, stone 15, copper 40. The player's own pickaxe breaks any piece in 3 hits and refunds half its cost.

### 4.5 Survival and day/night

- A day/night cycle lasts `DAY_LENGTH` = 600 s. Night is `dayPhase` 0.52–0.98.
- Hunger drains over time, faster when sprinting. At zero hunger you take damage; above 70 you regenerate.
- E eats food, preferring the best: stew restores 65 hunger, meat 35, egg 15.
- Survival numbers live in `store.ts` (`tickVitals`, `hurt`, `eat`).

### 4.6 Crafting (`game/crafting.ts`, `ui/Crafting.tsx`)

- **Opening:** C (or the touch Craft button) opens the menu.
- **The Crafting Table** costs 20 wood and is placed 2 m ahead. Every other recipe requires standing within 5 m of a table.
- **Pickaxe tiers** are Starter, Copper, Sunstone and Skyglass. Each tier multiplies hit power: same total yield per node, fewer swings.
- **Other recipes:** Copper Plating and Hearty Stew.

### 4.7 Creatures

| Creature | Logic | Visual | Notes |
|---|---|---|---|
| Cow / Pig / Chicken | `mobs.ts` (wander, flee, hop) | `Mobs.tsx` (toon) / `RealisticAnimals.tsx` (realistic) | Drops: meat, leather, feather, egg. Respawns after 40 s. |
| **Gloomwisp** | `hostiles.ts`: approach → circle → **windup** (tell: eyes flare, body shudders) → **dive** → recover | `Wisps.tsx`: smoke trail; realistic = translucent body + fresnel rim + core + aura | Only the dive hurts (6). A hit interrupts it. Max 3. Blocked by pieces, which it gnaws. |
| **Duskwolf** | `predators.ts` | `Predators.tsx` | Packs of 2. Chase speed 4.3, slower than walking. Bite 5. Follows over pieces but never into the void. Silver-grey fur, self-glow and eye halos so it reads at night. Drops fang + leather. |
| **Shardback** | `predators.ts` | `Predators.tsx` | Max 1. Spawns beside ore rocks. Armoured (−0.5 damage per hit). Slam 9, 8 HP. Drops stone, copper and sometimes sunstone. |

- **Rule: every creature needs a toon AND a realistic version.** Realistic versions use `sculpt()` + `patternMaterial()` from `RealisticAnimals.tsx`.
- Night creatures spawn only at night, after a grace period, and leave at dawn: wolves fade out and Shardbacks burrow.
- Killing any night creature counts toward slay tasks (stored in the `wispKills` counter).
- Mobs, villagers and predators beyond about 140 m are culled.

### 4.8 Villagers, tasks and the trader (`game/npcs.ts`, `scene/Npcs.tsx`, `ui/Dialog.tsx`)

- **Villagers:** Bramble (Hearthmeadow), Old Tamsin (Whisperwood), Gritt (Quarry) and Seraphine (Sunpeak). Clicking one opens a dialog.
- **Tasks:**
  - **Types:** deliver items, slay night creatures, or visit an island.
  - **Rewards:** 4–20 coins.
  - **Limits:** at most 3 active tasks.
  - **Status diamond** over each villager: yellow means a task is on offer, grey means in progress, green means ready to turn in.
- **The trader:**
  - **Schedule:** spawns roughly every 5–10 game-minutes, only in daytime and only on a discovered island. Stays 4 minutes.
  - **Marker:** a golden light beam over the cart.
  - **Shop:** 4 random buy offers (3 stock each) and a fixed sell list that includes leather, feathers, eggs, meat and fangs.

### 4.9 Multiplayer (`server/mp.ts`, `game/net.ts`, `game/mode.ts`)

- **Server:** a Vite plugin running inside the dev server, so it shares the app's origin and fraigent's WebSocket-capable proxy.
  - `GET/POST {base}mp/servers` lists or creates worlds.
  - `WS {base}mp/ws?world=&name=` joins a world.
  - Worlds are saved to `server-data/<id>.json` (gitignored). The default world is **Skyhaven**.
- **Shared** across a world: pieces, benches, depleted nodes, and the world clock (server-authoritative, ticking while anyone is online). **Per-player:** everything else.
- **Not synced:** mobs, night creatures and the trader. Each client simulates its own.
- **The client diffs zustand state.** It subscribes to store changes and sends piece, bench and deplete deltas. Remote changes are applied inside an `applying` flag so they don't echo back. Piece and bench ids carry a random per-tab prefix to avoid collisions.
- **Mode** is chosen by the URL: `?world=<id>` means multiplayer, no parameter means singleplayer. Switching reloads the page.
- **Chat in multiplayer** goes to the other players. Only `@claude …` reaches the steward. Reset World is hidden in multiplayer, because it would wipe the shared builds.

### 4.10 Rendering and graphics presets (`scene/quality.ts`)

`INITIAL_QUALITY` is read from localStorage `realms-quality`. **Switching into or out of Realistic reloads the page**, because materials are chosen at load time.

| Preset | What it is |
|---|---|
| Fast (`low`) | Stylised look with no post-processing and DPR 1. The default on touch devices. |
| High (`high`) | The stylised **toon** look: `MeshToonMaterial` with a 4-band ramp, bloom, SMAA, vignette, NEUTRAL tone mapping. |
| Realistic (`realistic`) | Full PBR; see the list below. |

What Realistic adds:
- **Materials:** PBR via the `surface()` factory, which returns `MeshStandardMaterial` and pulls the palette toward natural tones with `natural()`.
- **Sky and lighting:** the Preetham `Sky` (its own gain and alpha), lit by the Poly Haven HDRI through PMREM, over a stylised night sky.
- **Clouds:** drei volumetric clouds built from a canvas sprite.
- **Shadows:** PCSS soft shadows (12 samples) with a 4K shadow map.
- **Effects:** N8AO (half-res), god rays (only when the sun is near the screen), bloom, an `ExposureEffect` with **eye adaptation** (0.62 by day, 1.08 at night), ACES, SMAA.
- **Textures and vegetation:** photo textures, leaf-card trees, thin-blade grass (7× density), SDF animals.
- **Performance:** a `PerformanceMonitor` gives adaptive DPR on High and Realistic.

**Always create materials through `surface()` or `toon()`** (in `materials.ts`), never `new MeshToonMaterial` directly. That is what keeps the two styles in sync.

Supporting pieces:
- **Grass:** jittered-grid placement, 16 m chunks with frustum culling and visibility culling, plus a shader **distance fade**: `FADE_START`…`GRASS_RANGE` (105 m in Realistic).
- **Trees:** realistic trees merge the trunk and branches into one mesh, and their crowns are frustum-culled.
- **Textures:**
  - **Procedural:** `textures.ts` (wood, stone and copper sets, each with a normal map built from a height canvas; grass, rock, leaf and bark detail maps) and `animalTextures.ts`.
  - **Photo** (Realistic only): `photoTextures.ts` hot-swaps the Poly Haven sets into live materials and the terrain shader (`terrainPhoto` uniforms). If the files are missing, the game falls back to procedural textures.
- **Fog:** Realistic fog runs 240–1150 m, with day haze `#9dbbdc` and night haze `#1a2648`.

### 4.11 Steward bridge: chat, commands, crash reports

- **In-game chat to the steward.** The game POSTs to fraigent-command `/api/tmux/sessions/fraigent_steward_realms/send-keys`, prefixed `[realms chat]`. **Reply** with `scripts/chat-reply "…"`. The game polls `public/chat.jsonl` every 2 s. Keep replies to one or two lines.
- **Commands.** `scripts/chat-cmd <name>` sends a command the game runs once the player has pressed Play. Commands are implemented in `runCommand` in `src/ui/Chat.tsx`. The only one so far is `summonTrader`.
- **Crash reports.** `ui/CrashGuard.tsx` catches global errors, unhandled rejections, WebGL context loss and React render errors. It shows a recovery screen (Reload, or Reload in Fast graphics) and sends `[crash report] …` once through the chat bridge. Pointer-lock refusals are filtered out as harmless. `navigator.webdriver` runs (the headless screenshots) don't report.

### 4.12 Sound (`game/sound.ts`, `scene/SoundSystem.tsx`)

- Everything is synthesised live with Web Audio from oscillators and filtered noise. There are no asset files.
- Positional sounds fade with distance and are stereo-panned relative to the player's yaw.
- **Audio starts on the first gesture** (pointerdown or keydown).
- **Muting:** M or the menu button, stored in localStorage as `realms-muted`.
- `SoundSystem` drives the wind bed, birds by day, crickets at night, day/night stings, footsteps and landings, the hurt thud, animal calls and wolf growls.
- Action sounds are called at the point of use: Interaction, Predators, Wisps, Crafting and Dialog.

### 4.13 Mobile (`ui/TouchControls.tsx`)

- `IS_TOUCH` turns off pointer lock.
- **Controls:** a floating joystick on the left half, drag-to-look on the right, and action buttons (Swing/Build, Jump, Build/Pick, Eat, Craft, Mat, Rotate, Chat, Pause). They write into `touchInput`, which Player and Interaction read exactly like keyboard input.
- Phone layouts live in media queries in `index.css`, and safe-area insets are respected.

---

## 5. Workflow: how to work on this repo

### 5.1 Ops

- The app runs in **tmux session `fraigent-app-realms`** (not systemd). Vite hot-reloads `src/`.
- **Restart** after changing `vite.config.ts` or `server/`, or when Vite serves a stale module: `curl -s -X POST http://localhost:3001/api/apps/realms/restart`. Verify afterwards with `tmux has-session -t fraigent-app-realms` and a curl of the served module.
- **Typecheck after every batch:** `npx tsc --noEmit -p /home/balaa/fraigent-apps/realms`. For the server side, also run `-p …/tsconfig.node.json`.
- **Commit** each feature with a descriptive message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. The author is set repo-locally to `balaa <buddybalaa@gmail.com>`. The remote is `origin` → `https://github.com/broskiadmin/realms` (public; pushed via the `gh` login `broskiadmin`). Push after committing.
- **GitHub Pages:** every push to `main` runs `.github/workflows/pages.yml`, which fetches the Poly Haven assets and builds with `VITE_STATIC=1 PAGES_BASE=/realms/`, publishing to `https://broskiadmin.github.io/realms/`. `STATIC_BUILD` (in `game/mode.ts`) hides Multiplayer and turns off the steward chat bridge, since Pages has no dev server. Anything that needs the dev server must check `STATIC_BUILD`. The multiplayer world-clock timer is `unref()`'d so `vite build` exits.
- **Fresh clone setup:** run `npm install`, then `bash scripts/fetch-assets.sh` (photo textures), then `PLAYWRIGHT_BROWSERS_PATH=.browsers node_modules/.bin/playwright-core install chromium` (screenshots).

### 5.2 Look before you ship visuals

The `node scripts/shot.mjs <out.png> [quality] [worldTime] [x,y,z,yaw] [waitMs] [lineup|hostiles]` script:
- loads the game headless in the project-local Chromium (`.browsers/`),
- seeds a save with the given position, time and quality,
- saves a screenshot, which you then **Read**,
- and prints console errors plus per-frame draw calls and triangle counts.

Useful parameters:
- **Times:** `worldTime` 60 is morning, 90 is midday, 230 is late afternoon, 426 is midnight.
- **Views:** `0,2.2,4,0` is the meadow at spawn; `18,2.5,-2,-1.5708` looks across to Whisperwood; `14,2.5,-14,2.4` is the forest; `-6,2.2,1.2,0` faces Bramble.
- **`lineup`** parks a cow, a pig and a chicken in front of the camera. **`hostiles`** freezes and parks a wolf, a Shardback and a winding-up Gloomwisp (`debug.freezeHostiles`).
- **Realistic mode is slow in software rendering:** allow `waitMs` of 20000 or more and a long tool timeout.
- **Dev hook:** `window.__realms = { useGame, player, clock, WISPS, MOBS, PREDATORS, debug, sfx, gl }`.

**Why this matters:** every time we tuned visuals blind, the result was wrong. Fog that wasn't really fog, invisible cows, pale grass. Always screenshot before and after.

### 5.3 Rules for working in this environment (learned the hard way)

1. **Edit and Write tools for all source changes.** Don't run multi-file patch scripts: they trigger permission prompts in auto mode, and the user stops them.
2. **Bash means single, plain commands.** No `for` loops, no `$(…)`, no heredocs, no long `&&` chains. The read-block setting prompts on anything the parser can't analyse. Split checks into separate parallel calls, and put scripts that need logic in files.
3. **Stay inside the working directory.** No `/tmp`, `~/.npm` or `~/.cache`. Scratch files go in `.shots/` (gitignored).
4. **Every save hot-reloads into the user's live game.** The order of edits matters: imports and declarations first, then the code that uses them. When one file needs changes in several places, use **one Edit spanning all of them**, or Write the whole file. This has crashed the user's game four times (`mergeGeometries`, `player`, `aura`, `setDpr`).
5. **Vite sometimes misses rapid edits** and keeps serving a stale module. After a batch, check with `curl -s <url>/src/… | grep -c <symbol>`. Two traps: esbuild **strips comments** and **reformats numbers** (`2.0` becomes `2`), so grep for code, not comments. If the module is stale, restart.
6. **Outward-facing actions need confirmation:** pushing to a remote, posting to external services, or changing global config.

---

## 6. Gotchas

- **GLSL reserved words.** WebGL2 rejects `flat` and `patch` as identifiers. Both broke shaders, including the invisible cows. Watch also for `sample`, `smooth`, `centroid`, `input`, `output`.
- **Exposure and the sky.** The analytic sky is far brighter than the lit scene. Without its own `uSkyGain` it clips to white and reads as fog. Unlit (`MeshBasic`) clouds need HDR colour above 1 to look white, and must dim at night.
- **God rays with the sun off-screen** smear glare over the whole frame. Hide the god-ray source unless the sun projects near the screen.
- **Stacked translucent clouds** form a white wall. Keep banks few, high and thin.
- **Transparent draw order.** A `depthTest: false` viewmodel doesn't write depth, so clouds drew over the pickaxe. The fix was making the viewmodel transparent with a high `renderOrder`.
- **Pointer lock.**
  - **Re-locking:** Chrome refuses to re-lock for about 1 s after the user exits, and returns a rejected promise. Catch it (see `ui/panel.ts`).
  - **The Play button:** `PointerLockControls` binds to `#play-btn` once, so the Menu stays mounted and hides itself with CSS.
- **Marching-cubes tables.** `@types/three` declares `edgeTable` and `triTable` as nested arrays, but at runtime they are flat `Int32Array`s, so cast them. `sdf.ts` orients triangles using the SDF gradient.
- **InstancedMesh culling.** Call `computeBoundingSphere()` after setting instance matrices, otherwise culling uses the single-instance bounds.
- **`renderer.info` counts per render call.** For whole-frame stats, set `autoReset = false` and reset in `useFrame` (the dev hook does this).
- **Program caching.** Materials patched with `onBeforeCompile` that differ only in injected strings need `customProgramCacheKey`.
- **Express 5 is not in use here.** But see the template notes in `CLAUDE.md` if a separate backend is ever added.
- **Wrong spawn yaw.** Camera yaw 0 looks toward −z, and avatars and models face +z, hence `rotation.y = yaw + π` for remote players.

---

## 7. Balance (current numbers)

| | Value |
|---|---|
| Player | 100 HP. Walk 5.2 / sprint 8.4. Fall damage `(fall − 5) × 8`. |
| Gloomwisp | 3 HP, dive 6 damage, max 3, a spawn every 14–24 s at night |
| Duskwolf | 3 HP, bite 5 every 2.4 s, chase 4.3, packs of 2, first spawn after 45 s of night, then every 50–80 s |
| Shardback | 8 HP, armour 1, slam 9 every 3.4 s, max 1, first spawn after 80 s, then every 80–120 s |
| Node HP | tree 5, rock 6, ore 8 hits; respawn after 90, 120 and 240 s |
| Starting inventory | 30 wood |

If the user says something is "OP", "too hard" or "too easy", these numbers are the knobs.

---

## 8. Known limitations and backlog

- **Multiplayer doesn't sync** mobs, night creatures or the trader. There's no authority over inventories, and no anti-cheat.
- **Steward commands** (`chat-cmd`) run on every client in a multiplayer world.
- **Realistic animals** are as far as code-sculpting goes. True photo-realism would need scanned or rigged models.
- **Not yet built:**
  - cooking/campfires
  - more tool types (axe, sword)
  - armour
  - beds and sleeping through the night
  - inventory UI beyond the side list
  - island-specific weather
  - water
- **Sound** has never been heard by the steward (headless runs only check for errors). Ask the user about mix levels.
- **The Fast preset** hasn't been tuned for low-end phones.
- **Untouched open ask-api topics:** none. The cards so far were style, survival level and ore purpose.

---

## 9. How to pick up

1. Read this file and `CLAUDE.md`. Check `git log --oneline | head` for anything newer than the commit noted at the top.
2. Make sure the app is up: `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/app/realms/` should return 200.
3. Before visual work, take a baseline with `scripts/shot.mjs`.
4. Make the change, typecheck, confirm Vite is serving the fresh module, screenshot again, commit, then tell the player in game with `scripts/chat-reply`.
5. Keep toon/realistic parity, keep the balance table in §7 current, and update this file when architecture or conventions change.
