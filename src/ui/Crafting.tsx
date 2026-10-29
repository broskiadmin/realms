import { useEffect, useState } from 'react';
import { blockedBy, craft, nearBench, RECIPES, type CraftBlock } from '../game/crafting';
import { IS_TOUCH } from '../game/fx';
import { ITEMS, PICK_TIERS, useGame, type ItemId } from '../game/store';
import { releaseMouse, resumeGame } from './panel';

/** Open the crafting menu (releases the mouse on desktop so recipes are clickable). */
export function openCrafting() {
  useGame.getState().setCraftOpen(true);
  releaseMouse();
}

/** Close the menu and jump straight back into the game. Must run inside a click handler. */
function resume() {
  useGame.getState().setCraftOpen(false);
  resumeGame();
}

const BLOCK_TEXT: Record<Exclude<CraftBlock, null>, string> = {
  bench: 'Needs a Crafting Table nearby',
  tier: 'Craft the previous pickaxe first',
  owned: 'Owned',
  cost: 'Missing materials',
};

export function Crafting() {
  const open = useGame((s) => s.craftOpen);
  const inv = useGame((s) => s.inventory);
  const tier = useGame((s) => s.pickTier);
  useGame((s) => s.benches);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMsg(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'KeyC') useGame.getState().setCraftOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;
  const near = nearBench();
  return (
    <div className="craft">
      <div className="craft__card">
        <div className="craft__head">
          <h2>Crafting</h2>
          <span className={`craft__bench ${near ? 'craft__bench--on' : ''}`}>{near ? 'At a Crafting Table' : 'No Crafting Table nearby'}</span>
        </div>
        <div className="craft__tool">
          Current tool: <b style={{ color: PICK_TIERS[tier].color }}>{PICK_TIERS[tier].name}</b> · hits ×{tier + 1}
        </div>
        <div className="craft__list">
          {RECIPES.map((r) => {
            const block = blockedBy(r);
            return (
              <div key={r.id} className={`recipe ${block === 'owned' ? 'recipe--owned' : ''}`}>
                <div className="recipe__info">
                  <div className="recipe__name">{r.name}</div>
                  <div className="recipe__desc">{r.desc}</div>
                  <div className="recipe__cost">
                    {(Object.entries(r.cost) as [ItemId, number][]).map(([k, v]) => (
                      <span key={k} className={`cost ${(inv[k] ?? 0) >= v ? '' : 'cost--short'}`}>
                        <span className="gem" style={{ background: ITEMS[k].color }} />
                        {inv[k] ?? 0}/{v} {ITEMS[k].name}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  className="recipe__btn"
                  disabled={block !== null}
                  title={block ? BLOCK_TEXT[block] : undefined}
                  onClick={() => setMsg(craft(r))}
                >
                  {block === 'owned' ? 'Owned' : 'Craft'}
                </button>
                {block && block !== 'owned' && block !== 'cost' && <div className="recipe__why">{BLOCK_TEXT[block]}</div>}
              </div>
            );
          })}
        </div>
        {msg && <div className="craft__msg">{msg}</div>}
        <button className="play craft__back" onClick={resume}>
          Back to game
        </button>
        {!IS_TOUCH && <div className="fine">C or Esc closes</div>}
      </div>
    </div>
  );
}
