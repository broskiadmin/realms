import type { Vector3 } from 'three';
import { burst, hitTimes, wear } from './fx';
import { MAT_INFO, useGame } from './store';

/** A night creature strikes a build piece in its way; breaks it once its material's toughness runs out. */
export function gnawPiece(pieceId: string, at: Vector3 | { x: number; y: number; z: number }, who: string) {
  const g = useGame.getState();
  const piece = g.pieces.find((p) => p.id === pieceId);
  if (!piece) return;
  const taken = (wear.get(pieceId) ?? 0) + 1;
  hitTimes.set(pieceId, performance.now());
  const pos = at as Vector3;
  burst(pos, '#b48cff', 5, 0.6);
  if (taken >= MAT_INFO[piece.mat].toughness) {
    wear.delete(pieceId);
    burst(pos, MAT_INFO[piece.mat].color, 20, 1.4);
    g.removePiece(pieceId, false);
    g.toast('wisp-break', `${who} broke your ${MAT_INFO[piece.mat].label.toLowerCase()} ${piece.type}!`, '#b48cff', 1);
  } else {
    wear.set(pieceId, taken);
  }
}
