import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { clock, IS_TOUCH, player, touchInput } from '../game/fx';
import { ceilingHit, EYE, PLAYER_H, resolveHorizontal, supportHeight } from '../game/physics';
import { useGame } from '../game/store';
import { ISLANDS, SPAWN, terrainAt } from '../game/world';

const keys = new Set<string>();

const WALK = 5.2;
const SPRINT = 8.4;
const GRAVITY = 26;
const JUMP = 9;

function spawnPoint(): THREE.Vector3 {
  const h = terrainAt(SPAWN.x, SPAWN.z)?.h ?? 1;
  return new THREE.Vector3(SPAWN.x, h + 0.5, SPAWN.z);
}

export function Player() {
  const camera = useThree((s) => s.camera);
  const bob = useRef(0);
  const saveTimer = useRef(0);
  const islandTimer = useRef(0);
  const vitalsTimer = useRef(0);
  const peakY = useRef(0);

  useEffect(() => {
    clock.total = useGame.getState().worldTime;
    const saved = useGame.getState().player;
    if (saved) {
      player.pos.set(saved.x, saved.y + 0.05, saved.z);
      camera.rotation.set(0, saved.yaw, 0, 'YXZ');
    } else {
      player.pos.copy(spawnPoint());
      camera.rotation.set(0, 0, 0, 'YXZ');
    }
    camera.rotation.order = 'YXZ';
    const down = (e: KeyboardEvent) => {
      if (!useGame.getState().chatOpen) keys.add(e.code);
    };
    const up = (e: KeyboardEvent) => keys.delete(e.code);
    const blur = () => keys.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [camera]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const g = useGame.getState();
    const p = player.pos;
    const v = player.vel;
    if (g.koUntil > 0 && performance.now() >= g.koUntil) {
      p.copy(spawnPoint());
      v.set(0, 0, 0);
      g.revive();
    }
    // Typing in chat: drop held movement keys (their keyup goes to the chat input).
    if (g.chatOpen) keys.clear();
    const conscious = g.koUntil === 0;
    const locked = g.locked && conscious;
    if (g.locked) clock.total += dt;

    // Input → desired horizontal velocity relative to camera yaw.
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const wish = new THREE.Vector3();
    let sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
    if (locked) {
      if (keys.has('KeyW') || keys.has('ArrowUp')) wish.add(fwd);
      if (keys.has('KeyS') || keys.has('ArrowDown')) wish.sub(fwd);
      if (keys.has('KeyD') || keys.has('ArrowRight')) wish.add(right);
      if (keys.has('KeyA') || keys.has('ArrowLeft')) wish.sub(right);
      if (IS_TOUCH) {
        // Touch look: drag deltas → yaw/pitch.
        camera.rotation.y -= touchInput.lookDX * 0.0055;
        camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - touchInput.lookDY * 0.0055, -1.5, 1.5);
        const mag = Math.hypot(touchInput.moveX, touchInput.moveY);
        if (mag > 0.08) {
          wish.addScaledVector(fwd, touchInput.moveY).addScaledVector(right, touchInput.moveX);
          sprint = mag > 0.92;
        }
      }
    }
    touchInput.lookDX = 0;
    touchInput.lookDY = 0;
    // Analog joystick keeps partial speed; keyboard input is normalised to full speed.
    const analog = Math.min(1, wish.length());
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar((sprint ? SPRINT : WALK) * (IS_TOUCH ? analog : 1));
    const accel = player.onGround ? 14 : 3.5;
    const k = 1 - Math.exp(-accel * dt);
    v.x += (wish.x - v.x) * k;
    v.z += (wish.z - v.z) * k;

    if (locked && player.onGround && (keys.has('Space') || touchInput.jump)) {
      v.y = JUMP;
      player.onGround = false;
    }
    v.y -= GRAVITY * dt;

    // Horizontal move + push-out.
    p.x += v.x * dt;
    p.z += v.z * dt;
    resolveHorizontal(p, p.y);

    // Vertical move against ceilings and supports.
    const oldY = p.y;
    let newY = p.y + v.y * dt;
    if (v.y > 0) {
      const ceil = ceilingHit(p.x, p.z, oldY + PLAYER_H, newY + PLAYER_H);
      if (ceil !== null) {
        newY = ceil - PLAYER_H - 0.01;
        v.y = 0;
      }
    }
    const ground = supportHeight(p.x, p.z, Math.max(oldY, newY));
    const wasAirborne = !player.onGround;
    if (newY <= ground + 0.001 && v.y <= 0) {
      newY = ground;
      v.y = 0;
      player.onGround = true;
      const fall = peakY.current - ground;
      if (wasAirborne && fall > 5) g.hurt((fall - 5) * 8, 'a long fall');
    } else if (player.onGround && v.y <= 0 && oldY - ground < 0.35 && ground > -Infinity) {
      // Stick to slopes and ramps when walking downhill instead of skipping into the air.
      newY = ground;
      v.y = 0;
    } else {
      player.onGround = false;
    }
    p.y = newY;
    peakY.current = player.onGround ? p.y : Math.max(peakY.current, p.y);

    if (p.y < -45) {
      p.copy(spawnPoint());
      v.set(0, 0, 0);
      peakY.current = p.y;
      g.hurt(1000, 'the cloud sea');
    }

    vitalsTimer.current += dt;
    if (vitalsTimer.current >= 1) {
      if (g.locked) g.tickVitals(vitalsTimer.current, sprint && wish.lengthSq() > 0);
      vitalsTimer.current = 0;
    }

    // Camera follows feet with a light walk bob.
    const hs = Math.hypot(v.x, v.z);
    player.speed = hs;
    if (player.onGround && hs > 0.5) bob.current += dt * hs * 1.6;
    const bobY = player.onGround ? Math.sin(bob.current * 2) * 0.045 * Math.min(1, hs / WALK) : 0;
    camera.position.set(p.x, p.y + EYE + bobY, p.z);
    player.yaw = camera.rotation.y;

    saveTimer.current += dt;
    if (saveTimer.current > 2 && player.onGround) {
      saveTimer.current = 0;
      g.setPlayer({ x: p.x, y: p.y, z: p.z, yaw: camera.rotation.y });
      g.setWorldTime(clock.total);
    }

    islandTimer.current += dt;
    if (islandTimer.current > 0.5) {
      islandTimer.current = 0;
      const t = player.onGround ? terrainAt(p.x, p.z) : null;
      if (t && Math.abs(t.h - p.y) < 1) {
        const isl = ISLANDS[t.island.id];
        useGame.getState().discover(isl.id, isl.name, isl.tagline);
        g.visit(isl.id, clock.total);
      }
    }
  });

  return null;
}
