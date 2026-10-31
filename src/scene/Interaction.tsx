import { useEffect, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { burst, damage, ghost, hitTimes, IS_TOUCH, player, swing, touchInput, wear } from '../game/fx';
import { NPC_BY_ID } from '../game/npcs';
import { openCrafting } from '../ui/Crafting';
import { openDialog } from '../ui/Dialog';
import { hitWisp, WISP_HP, WISPS } from '../game/hostiles';
import { hitMob, MOB_INFO, MOBS } from '../game/mobs';
import { hitPredator, PREDATOR_INFO, PREDATORS } from '../game/predators';
import { computePlacement } from '../game/pieces';
import { ITEMS, MAT_INFO, pieceKey, useGame, type ItemId, type TargetInfo } from '../game/store';
import { BIOMES, ISLANDS, NODE_BY_ID, NODE_HP, ORE_INFO, RESPAWN_MS, nodeName, type ResourceNode } from '../game/world';

const PICK_REACH = 4.6;
const BUILD_REACH = 7;
const SWING_COOLDOWN = 0.36;
const PIECE_HP = 3;

interface Hit {
  kind: 'node' | 'mob' | 'wisp' | 'predator' | 'piece' | 'bench' | 'npc' | 'trader' | 'island';
  id: string | number;
  point: THREE.Vector3;
  distance: number;
}

function findTagged(o: THREE.Object3D | null): THREE.Object3D | null {
  while (o) {
    if (o.userData?.kind) return o;
    o = o.parent;
  }
  return null;
}

function nodeColor(n: ResourceNode): string {
  if (n.kind === 'tree') return BIOMES[ISLANDS[n.island].biome].foliage[0];
  if (n.kind === 'ore') return ORE_INFO[n.ore ?? 'coal'].color;
  return BIOMES[ISLANDS[n.island].biome].rock[0];
}

function nodeYield(n: ResourceNode, final: boolean): Partial<Record<ItemId, number>> {
  if (n.kind === 'tree') return { wood: final ? 8 : 3 };
  if (n.kind === 'rock') return { stone: final ? 8 : 3 };
  return { stone: 1, [n.ore ?? 'coal']: final ? 3 : 1 };
}

export function Interaction({ world }: { world: RefObject<THREE.Group> }) {
  const camera = useThree((s) => s.camera);
  const raycaster = useRef(new THREE.Raycaster());
  const mouseDown = useRef(false);
  const cooldown = useRef(0);
  const lastPlaced = useRef<string | null>(null);
  const wasTouching = useRef(false);
  const wasPressing = useRef(false);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!useGame.getState().locked || useGame.getState().chatOpen) return;
      if (e.button === 0) mouseDown.current = true;
      if (e.button === 2) useGame.getState().toggleBuild();
    };
    const onUp = (e: MouseEvent) => {
      if (e.button === 0) {
        mouseDown.current = false;
        lastPlaced.current = null;
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (useGame.getState().locked) useGame.getState().cycleTool(e.deltaY > 0 ? 1 : -1);
    };
    const onKey = (e: KeyboardEvent) => {
      const g = useGame.getState();
      if (!g.locked || g.chatOpen) return;
      if (e.code === 'KeyT' || e.code === 'Enter') {
        e.preventDefault();
        mouseDown.current = false;
        g.setChatOpen(true);
        return;
      }
      if (e.code === 'Digit1') g.setTool('pickaxe');
      if (e.code === 'Digit2') g.setTool('floor');
      if (e.code === 'Digit3') g.setTool('wall');
      if (e.code === 'Digit4') g.setTool('ramp');
      if (e.code === 'KeyQ') g.toggleBuild();
      if (e.code === 'KeyR') g.rotateRamp();
      if (e.code === 'KeyF') g.toggleMat();
      if (e.code === 'KeyE') g.eat();
      if (e.code === 'KeyC') openCrafting();
    };
    const noMenu = (e: MouseEvent) => e.preventDefault();
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', onKey);
    window.addEventListener('contextmenu', noMenu);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('contextmenu', noMenu);
    };
  }, []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    cooldown.current -= dt;
    const g = useGame.getState();
    const root = world.current;
    if (!root) return;
    const touching = touchInput.action;
    if (wasTouching.current && !touching) lastPlaced.current = null;
    wasTouching.current = touching;
    const pressing = (mouseDown.current || touching) && g.locked && g.koUntil === 0;
    const freshPress = pressing && !wasPressing.current;
    wasPressing.current = pressing;

    const rc = raycaster.current;
    rc.setFromCamera(new THREE.Vector2(0, 0), camera);
    rc.far = BUILD_REACH;
    let hit: Hit | null = null;
    for (const i of rc.intersectObject(root, true)) {
      const tagged = findTagged(i.object);
      if (!tagged) continue;
      const { kind, id } = tagged.userData as { kind: Hit['kind']; id: string | number };
      if (kind === 'mob' && MOBS[id as number]?.dead) continue;
      if (kind === 'wisp' && !WISPS[id as number]?.alive) continue;
      if (kind === 'predator' && !PREDATORS[id as number]?.alive) continue;
      hit = { kind, id, point: i.point, distance: i.distance };
      break;
    }

    if (g.tool === 'pickaxe') {
      ghost.placement = null;
      const inReach = hit && hit.distance <= PICK_REACH ? hit : null;
      g.setTarget(describe(inReach));
      if (inReach && (inReach.kind === 'npc' || inReach.kind === 'trader')) {
        // People are talked to, not hit. Only a fresh press opens the dialog.
        if (freshPress) {
          mouseDown.current = false;
          touchInput.action = false;
          openDialog(inReach.kind === 'npc' ? { type: 'npc', id: inReach.id as string } : { type: 'trader' });
        }
        return;
      }
      if (pressing && cooldown.current <= 0) {
        cooldown.current = SWING_COOLDOWN;
        swing.t = 0;
        if (inReach) strike(inReach);
      }
      return;
    }

    // Build mode.
    g.setTarget(null);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const placement = computePlacement(g.tool, hit ? hit.point : null, camera.position, dir, g.rampRot);
    const key = pieceKey(placement);
    const occupied = g.pieces.some((p) => pieceKey(p) === key);
    ghost.placement = placement;
    const cost = MAT_INFO[g.mat].cost;
    ghost.valid = !occupied && g.inventory[g.mat] >= cost;
    if (pressing && ghost.valid && key !== lastPlaced.current && cooldown.current <= 0) {
      if (g.placePiece({ ...placement, mat: g.mat })) {
        lastPlaced.current = key;
        cooldown.current = 0.12;
      }
    } else if (pressing && !ghost.valid && !occupied && cooldown.current <= 0) {
      cooldown.current = 1;
      g.toast('need', `Need ${cost} ${ITEMS[g.mat].name}`, '#ff8a8a', 1);
    }
  });

  function describe(h: Hit | null): TargetInfo | null {
    if (!h) return null;
    if (h.kind === 'node') {
      const n = NODE_BY_ID.get(h.id as string);
      if (!n) return null;
      const max = NODE_HP[n.kind];
      return { key: n.id, label: nodeName(n), hp: max - (damage.get(n.id) ?? 0), max };
    }
    if (h.kind === 'mob') {
      const m = MOBS[h.id as number];
      return { key: `m${m.id}`, label: MOB_INFO[m.type].name, hp: m.hp, max: MOB_INFO[m.type].hp };
    }
    if (h.kind === 'wisp') {
      const w = WISPS[h.id as number];
      return { key: `w${w.id}`, label: 'Gloomwisp', hp: w.hp, max: WISP_HP };
    }
    if (h.kind === 'predator') {
      const p = PREDATORS[h.id as number];
      const info = PREDATOR_INFO[p.kind];
      return { key: `pr${p.id}`, label: info.name, hp: Math.ceil(p.hp), max: info.hp };
    }
    if (h.kind === 'piece') {
      const p = useGame.getState().pieces.find((q) => q.id === h.id);
      if (!p) return null;
      const worn = Math.round((100 * (wear.get(p.id) ?? 0)) / MAT_INFO[p.mat].toughness);
      const label = `${MAT_INFO[p.mat].label} ${p.type[0].toUpperCase()}${p.type.slice(1)}${worn ? ` · ${worn}% worn` : ''}`;
      return { key: p.id, label, hp: PIECE_HP - (damage.get(p.id) ?? 0), max: PIECE_HP };
    }
    if (h.kind === 'npc' || h.kind === 'trader') {
      const name = h.kind === 'npc' ? (NPC_BY_ID.get(h.id as string)?.name ?? 'Villager') : 'Wandering Trader';
      return { key: `t-${h.id}`, label: `${name} — ${IS_TOUCH ? 'tap Swing' : 'click'} to talk`, hp: 1, max: 1 };
    }
    if (h.kind === 'bench') {
      const id = h.id as string;
      return { key: id, label: IS_TOUCH ? 'Crafting Table — tap Craft' : 'Crafting Table — press C', hp: PIECE_HP - (damage.get(id) ?? 0), max: PIECE_HP };
    }
    return null;
  }

  function strike(h: Hit) {
    const g = useGame.getState();
    const power = g.pickTier + 1;
    if (h.kind === 'node') {
      const n = NODE_BY_ID.get(h.id as string);
      if (!n) return;
      // Better pickaxes land several hits' worth per swing (same total yield, less time).
      const before = damage.get(n.id) ?? 0;
      const taken = Math.min(NODE_HP[n.kind], before + power);
      const final = taken >= NODE_HP[n.kind];
      hitTimes.set(n.id, performance.now());
      burst(h.point, nodeColor(n), final ? 22 : 7, final ? 1.6 : 1);
      const total: Partial<Record<ItemId, number>> = {};
      for (let i = before + 1; i <= taken; i++) {
        for (const [k, v] of Object.entries(nodeYield(n, i === NODE_HP[n.kind])) as [ItemId, number][]) total[k] = (total[k] ?? 0) + v;
      }
      g.addItems(total);
      if (final) {
        damage.delete(n.id);
        g.deplete(n.id, Date.now() + RESPAWN_MS[n.kind]);
      } else {
        damage.set(n.id, taken);
      }
    } else if (h.kind === 'mob') {
      const m = MOBS[h.id as number];
      const drops = hitMob(m, player.pos, power);
      burst(h.point, '#ffffff', drops ? 26 : 6, drops ? 1.8 : 0.8);
      if (drops) g.addItems(drops);
    } else if (h.kind === 'wisp') {
      const drops = hitWisp(WISPS[h.id as number], player.pos, power);
      burst(h.point, '#b48cff', drops ? 26 : 8, drops ? 1.8 : 1);
      if (drops) {
        g.addItems(drops);
        g.addWispKill();
      }
    } else if (h.kind === 'predator') {
      const p = PREDATORS[h.id as number];
      const drops = hitPredator(p, player.pos, power);
      burst(h.point, p.kind === 'duskwolf' ? '#3a3a44' : '#4ff0ff', drops ? 28 : 8, drops ? 1.8 : 1);
      if (drops) {
        g.addItems(drops);
        g.addWispKill();
      }
    } else if (h.kind === 'piece') {
      const id = h.id as string;
      const taken = (damage.get(id) ?? 0) + 1;
      hitTimes.set(id, performance.now());
      const p = g.pieces.find((q) => q.id === id);
      burst(h.point, MAT_INFO[p?.mat ?? 'wood'].color, taken >= PIECE_HP ? 20 : 6);
      if (taken >= PIECE_HP) {
        damage.delete(id);
        g.removePiece(id);
      } else {
        damage.set(id, taken);
      }
    } else if (h.kind === 'bench') {
      const id = h.id as string;
      const taken = (damage.get(id) ?? 0) + 1;
      hitTimes.set(id, performance.now());
      burst(h.point, '#c98b4a', taken >= PIECE_HP ? 20 : 6);
      if (taken >= PIECE_HP) {
        damage.delete(id);
        g.removeBench(id);
        g.addItems({ wood: 10 });
      } else {
        damage.set(id, taken);
      }
    } else {
      burst(h.point, '#a8713f', 4, 0.6);
    }
  }

  return null;
}
