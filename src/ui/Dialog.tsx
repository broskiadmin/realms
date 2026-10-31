import { useEffect, useMemo, useState } from 'react';
import { clock } from '../game/fx';
import {
  abandonQuest,
  acceptQuest,
  buyOffer,
  NPC_BY_ID,
  questDone,
  questFor,
  questProgress,
  questText,
  SELL_LIST,
  sellItem,
  turnInQuest,
} from '../game/npcs';
import { ITEMS, useGame, type Dialog as DialogState } from '../game/store';
import { ISLANDS } from '../game/world';
import { releaseMouse, resumeGame } from './panel';
import { sfx } from '../game/sound';

export function openDialog(d: Exclude<DialogState, null>) {
  if (d.type === 'npc') questFor(d.id);
  useGame.getState().setDialog(d);
  releaseMouse();
}

function close() {
  useGame.getState().setDialog(null);
  resumeGame();
}

function NpcPanel({ id }: { id: string }) {
  const npc = NPC_BY_ID.get(id)!;
  const quest = useGame((s) => s.quests[id]);
  useGame((s) => s.inventory);
  useGame((s) => s.wispKills);
  useGame((s) => s.visits);
  const greet = useMemo(() => npc.greet[Math.floor(Math.random() * npc.greet.length)], [npc]);
  const [line, setLine] = useState(greet);
  const [error, setError] = useState<string | null>(null);
  if (!quest) return null;
  const [have, need] = questProgress(quest);
  const done = questDone(quest);

  return (
    <>
      <div className="dlg__head">
        <div>
          <h2>{npc.name}</h2>
          <div className="dlg__role">{npc.role}</div>
        </div>
        <div className="dlg__reward">
          <span className="gem" style={{ background: ITEMS.coin.color }} />
          {quest.reward} coins
        </div>
      </div>
      <p className="dlg__line">“{line}”</p>
      <div className="dlg__task">
        <div className="dlg__task-label">{quest.status === 'active' ? 'Your task' : 'Task offered'}</div>
        <div className="dlg__task-text">{questText(quest)}</div>
        {quest.status === 'active' && (
          <div className="dlg__progress">
            <div className="dlg__bar">
              <div style={{ width: `${(100 * have) / need}%` }} />
            </div>
            <span>
              {have}/{need}
            </span>
          </div>
        )}
      </div>
      {error && <div className="dlg__error">{error}</div>}
      <div className="dlg__actions">
        {quest.status === 'offered' && (
          <button
            className="recipe__btn"
            onClick={() => {
              const err = acceptQuest(id);
              setError(err);
              if (!err) setLine("Splendid. Come find me when it's done.");
            }}
          >
            Accept
          </button>
        )}
        {done && (
          <button
            className="recipe__btn"
            onClick={() => {
              if (turnInQuest(id)) {
                sfx.fanfare();
                setLine(npc.thanks);
                setError(null);
              }
            }}
          >
            Turn in
          </button>
        )}
        {quest.status === 'active' && !done && (
          <button className="ghost-btn" onClick={() => abandonQuest(id)}>
            Abandon
          </button>
        )}
      </div>
    </>
  );
}

function TraderPanel() {
  const trader = useGame((s) => s.trader);
  const inv = useGame((s) => s.inventory);
  const [msg, setMsg] = useState<string | null>(null);
  if (!trader) return <p className="dlg__line">The cart is gone.</p>;
  const left = Math.max(0, Math.round(trader.until - clock.total));
  return (
    <>
      <div className="dlg__head">
        <div>
          <h2>Wandering Trader</h2>
          <div className="dlg__role">
            At {ISLANDS[trader.island].name} · leaves in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
          </div>
        </div>
        <div className="dlg__reward">
          <span className="gem" style={{ background: ITEMS.coin.color }} />
          {inv.coin} coins
        </div>
      </div>
      <p className="dlg__line">“Rare goods from far-off skies! Coins only, friend.”</p>
      <div className="dlg__section">Buy</div>
      <div className="craft__list">
        {trader.offers.map((o, i) => (
          <div key={i} className={`recipe ${o.stock <= 0 ? 'recipe--owned' : ''}`}>
            <div className="recipe__info">
              <div className="recipe__name">
                <span className="gem" style={{ background: ITEMS[o.item].color }} />
                {o.qty} × {ITEMS[o.item].name}
              </div>
              <div className="recipe__desc">{o.stock > 0 ? `${o.stock} left` : 'Sold out'}</div>
            </div>
            <button className="recipe__btn" disabled={o.stock <= 0 || inv.coin < o.price} onClick={() => {
                sfx.coin();
                setMsg(buyOffer(i));
              }}>
              {o.price} coins
            </button>
          </div>
        ))}
      </div>
      <div className="dlg__section">Sell</div>
      <div className="craft__list">
        {SELL_LIST.map((s, i) => (
          <div key={s.item} className="recipe">
            <div className="recipe__info">
              <div className="recipe__name">
                <span className="gem" style={{ background: ITEMS[s.item].color }} />
                {s.qty} × {ITEMS[s.item].name}
              </div>
              <div className="recipe__desc">You have {inv[s.item]}</div>
            </div>
            <button className="recipe__btn" disabled={inv[s.item] < s.qty} onClick={() => {
                sfx.coin();
                setMsg(sellItem(i));
              }}>
              +{s.price} coins
            </button>
          </div>
        ))}
      </div>
      {msg && <div className="craft__msg">{msg}</div>}
    </>
  );
}

export function Dialog() {
  const dialog = useGame((s) => s.dialog);
  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') useGame.getState().setDialog(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog]);
  if (!dialog) return null;
  return (
    <div className="craft">
      <div className={`craft__card dlg ${dialog.type === 'trader' ? 'dlg--trader' : ''}`}>
        {dialog.type === 'npc' ? <NpcPanel id={dialog.id} /> : <TraderPanel />}
        <button className="play craft__back" onClick={close}>
          {dialog.type === 'npc' ? 'Goodbye' : 'Back to game'}
        </button>
      </div>
    </div>
  );
}
