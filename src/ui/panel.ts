import { IS_TOUCH } from '../game/fx';
import { useGame } from '../game/store';

/** Free the mouse so an overlay panel is clickable (desktop only; touch has no pointer lock). */
export function releaseMouse() {
  if (!IS_TOUCH) document.exitPointerLock();
}

/** Jump back into play after closing a panel. Must run inside a click handler on desktop. */
export function resumeGame() {
  if (IS_TOUCH) useGame.getState().setLocked(true);
  else document.querySelector('canvas')?.requestPointerLock();
}
