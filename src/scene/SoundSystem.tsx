import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { isNight, player } from '../game/fx';
import { MOBS } from '../game/mobs';
import { PREDATORS } from '../game/predators';
import { isMuted, setMuted, sfx, unlockAudio, updateAmbient } from '../game/sound';
import { useGame } from '../game/store';
import { terrainAt } from '../game/world';

/**
 * World audio driver: unlocks audio on the first gesture, runs the wind bed,
 * birds by day / crickets by night, day-night stings, footsteps and landings,
 * hurt thuds, occasional animal calls and predator growls. M toggles mute.
 */
export function SoundSystem() {
  const stride = useRef(0);
  const airborne = useRef(0);
  const wasNight = useRef<boolean | null>(null);
  const timers = useRef({ critter: 3, mob: 4, growl: 2 });

  useEffect(() => {
    // Browsers only allow audio after a user gesture; keep resuming on input in case it was suspended.
    const unlock = () => unlockAudio();
    const onKey = (e: KeyboardEvent) => {
      unlockAudio();
      if (e.code === 'KeyM' && !useGame.getState().chatOpen) {
        setMuted(!isMuted());
        useGame.getState().toast('sound', isMuted() ? 'Sound off (M)' : 'Sound on (M)', '#9fd8ff', 1);
      }
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', onKey);
    const unsub = useGame.subscribe((s, prev) => {
      if (s.hurtId !== prev.hurtId) sfx.hurt();
    });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', onKey);
      unsub();
    };
  }, []);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = state.clock.elapsedTime;
    const night = isNight();
    updateAmbient(t, night ? 0.7 : 1);

    if (wasNight.current !== null && night !== wasNight.current) {
      if (night) sfx.nightfall();
      else sfx.dawn();
    }
    wasNight.current = night;

    const tm = timers.current;
    tm.critter -= dt;
    if (tm.critter <= 0) {
      tm.critter = night ? 0.6 + Math.random() * 1.6 : 2 + Math.random() * 5;
      if (night) sfx.cricket();
      else sfx.chirp();
    }

    // Footsteps every ~1.7 m of ground travel; a thud when landing from a real fall or jump.
    if (player.onGround) {
      if (airborne.current > 0.35) sfx.land();
      airborne.current = 0;
      stride.current += player.speed * dt;
      if (stride.current > 1.7) {
        stride.current = 0;
        const ground = terrainAt(player.pos.x, player.pos.z);
        sfx.footstep(ground && Math.abs(ground.h - player.pos.y) < 0.15 ? 'grass' : 'wood');
      }
    } else {
      airborne.current += dt;
    }

    // Now and then, a nearby animal speaks up.
    tm.mob -= dt;
    if (tm.mob <= 0) {
      tm.mob = 2.5 + Math.random() * 4;
      const near = MOBS.filter((m) => !m.dead && Math.hypot(m.x - player.pos.x, m.z - player.pos.z) < 28);
      const m = near[Math.floor(Math.random() * near.length)];
      if (m && Math.random() < 0.6) {
        const pos = { x: m.x, y: m.y + 1, z: m.z };
        if (m.type === 'cow') sfx.moo(pos);
        else if (m.type === 'pig') sfx.oink(pos);
        else sfx.cluck(pos);
      }
    }

    // Hunting wolves growl.
    tm.growl -= dt;
    if (tm.growl <= 0) {
      tm.growl = 2.5 + Math.random() * 3;
      const wolf = PREDATORS.find((p) => p.alive && p.kind === 'duskwolf' && p.state === 'chase');
      if (wolf) sfx.growl({ x: wolf.x, y: wolf.y + 0.7, z: wolf.z });
    }
  });

  return null;
}
