import { useEffect, useState } from 'react';
import { clock, DAY_LENGTH, dayNumber, dayPhase, IS_TOUCH, isNight, player } from '../game/fx';
import { NPC_BY_ID, questProgress, questShort } from '../game/npcs';
import { ISLANDS } from '../game/world';
import { ITEMS, MAT_INFO, MATS, TOOLS, useGame, type ItemId, type Tool } from '../game/store';

const TOOL_LABEL: Record<Tool, string> = { pickaxe: 'Pickaxe', floor: 'Floor', wall: 'Wall', ramp: 'Ramp' };

function ToolIcon({ tool }: { tool: Tool }) {
  const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 3, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  return (
    <svg viewBox="0 0 40 40" width="34" height="34">
      {tool === 'pickaxe' && (
        <>
          <path d="M8 13 Q20 3 32 13" {...stroke} strokeWidth={5} />
          <path d="M20 9 L20 35" {...stroke} strokeWidth={4} />
        </>
      )}
      {tool === 'floor' && <path d="M4 26 L20 18 L36 26 L20 34 Z" {...stroke} />}
      {tool === 'wall' && <rect x="9" y="6" width="22" height="28" rx="2" {...stroke} />}
      {tool === 'ramp' && <path d="M5 33 L35 33 L35 9 Z" {...stroke} />}
    </svg>
  );
}

function Crosshair() {
  const target = useGame((s) => s.target);
  const tool = useGame((s) => s.tool);
  return (
    <div className="crosshair-wrap">
      <div className={`crosshair ${target ? 'crosshair--hot' : ''} ${tool !== 'pickaxe' ? 'crosshair--build' : ''}`} />
      {target && (
        <div className="target">
          <div className="target__label">{target.label}</div>
          <div className="target__bar">
            <div style={{ width: `${(100 * Math.max(0, target.hp)) / target.max}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

function Hotbar() {
  const tool = useGame((s) => s.tool);
  const mat = useGame((s) => s.mat);
  const inv = useGame((s) => s.inventory);
  const rampRot = useGame((s) => s.rampRot);
  const copper = useGame((s) => s.copperUnlocked);
  return (
    <div className="hotbar-wrap">
      <div className="mat-switch">
        {MATS.filter((m) => m !== 'copper' || copper).map((m) => (
          <div key={m} className={`mat ${mat === m ? 'mat--on' : ''} ${inv[m] < MAT_INFO[m].cost ? 'mat--low' : ''}`}>
            <span className="mat__swatch" style={{ background: ITEMS[m].color }} />
            {ITEMS[m].name} <b>{inv[m]}</b>
          </div>
        ))}
        {!IS_TOUCH && <span className="hint">F to swap</span>}
      </div>
      <div className="hotbar">
        {TOOLS.map((t, i) => (
          <div key={t} className={`slot ${tool === t ? 'slot--on' : ''}`} onPointerDown={() => useGame.getState().setTool(t)}>
            <span className="slot__key">{i + 1}</span>
            <ToolIcon tool={t} />
            <span className="slot__name">{TOOL_LABEL[t]}</span>
          </div>
        ))}
      </div>
      {!IS_TOUCH && tool === 'ramp' && <div className="hint">R to rotate ramp ({['↻ 0°', '↻ 90°', '↻ 180°', '↻ 270°'][rampRot]})</div>}
      {!IS_TOUCH && tool !== 'pickaxe' && <div className="hint">Hold click to spam-build · Q or right-click for pickaxe</div>}
    </div>
  );
}

const SHOWN: ItemId[] = ['coin', 'wood', 'stone', 'coal', 'copper', 'sunstone', 'skyglass', 'meat', 'leather', 'feather', 'egg', 'duskshard'];

function Inventory() {
  const inv = useGame((s) => s.inventory);
  const items = SHOWN.filter((k) => k === 'wood' || k === 'stone' || inv[k] > 0);
  return (
    <div className="inventory">
      {items.map((k) => (
        <div key={k} className="inv-row">
          <span className="gem" style={{ background: ITEMS[k].color }} />
          <span className="inv-name">{ITEMS[k].name}</span>
          <b>{inv[k]}</b>
        </div>
      ))}
    </div>
  );
}

function Toasts() {
  const toasts = useGame((s) => s.toasts);
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 300);
    return () => clearInterval(id);
  }, []);
  const now = performance.now();
  return (
    <div className="toasts">
      {toasts
        .filter((t) => now - t.at < 2400)
        .map((t) => (
          <div key={t.id} className="toast" style={{ borderColor: t.color, opacity: Math.min(1, (2400 - (now - t.at)) / 500) }}>
            {t.key in ITEMS ? (
              <>
                <span className="gem" style={{ background: t.color }} />+{t.count} {t.text}
              </>
            ) : (
              t.text
            )}
          </div>
        ))}
    </div>
  );
}

function Banner() {
  const banner = useGame((s) => s.banner);
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (!banner) return;
    setShown(banner.id);
    const id = setTimeout(() => setShown(null), 3800);
    return () => clearTimeout(id);
  }, [banner]);
  if (!banner || shown !== banner.id) return null;
  return (
    <div className="banner" key={banner.id}>
      <div className="banner__kicker">Island discovered</div>
      <div className="banner__title">{banner.title}</div>
      <div className="banner__sub">{banner.sub}</div>
    </div>
  );
}

function Vitals() {
  const health = useGame((s) => s.health);
  const hunger = useGame((s) => s.hunger);
  const food = useGame((s) => s.inventory.meat + s.inventory.egg);
  return (
    <div className="vitals">
      <div className="vital">
        <span className="vital__icon">♥</span>
        <div className="vital__bar vital__bar--hp">
          <div style={{ width: `${health}%` }} />
        </div>
        <b>{Math.ceil(health)}</b>
      </div>
      <div className="vital">
        <span className="vital__icon vital__icon--food">●</span>
        <div className={`vital__bar vital__bar--food ${hunger < 25 ? 'vital__bar--warn' : ''}`}>
          <div style={{ width: `${hunger}%` }} />
        </div>
        <b>{Math.ceil(hunger)}</b>
      </div>
      {hunger < 85 && food > 0 && !IS_TOUCH && <div className="hint">E to eat ({food} food)</div>}
    </div>
  );
}

function Clock() {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const phase = dayPhase();
  const night = isNight();
  // Seconds until the next sunset (phase 0.52) or sunrise (phase 0.98).
  const target = night ? 0.98 : 0.52;
  const left = Math.round((((target - phase + 1) % 1) * DAY_LENGTH));
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');
  return (
    <div className={`clock ${night ? 'clock--night' : ''}`}>
      <span className="clock__icon">{night ? '☾' : '☀'}</span>
      <div>
        <div className="clock__day">Day {dayNumber()}</div>
        <div className="clock__left">
          {night ? 'Dawn' : 'Nightfall'} in {mm}:{ss}
        </div>
      </div>
    </div>
  );
}

/** Active tasks under the clock, plus where the trader is if one is around. */
function Tasks() {
  const quests = useGame((s) => s.quests);
  const trader = useGame((s) => s.trader);
  useGame((s) => s.inventory);
  useGame((s) => s.wispKills);
  useGame((s) => s.visits);
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const active = Object.values(quests).filter((q) => q.status === 'active');
  if (!active.length && !trader) return null;
  let traderLine: string | null = null;
  if (trader) {
    const dist = Math.round(Math.hypot(trader.x - player.pos.x, trader.z - player.pos.z));
    const left = Math.max(0, Math.round(trader.until - clock.total));
    traderLine = `Trader @ ${ISLANDS[trader.island].name} · ${dist} m · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  }
  return (
    <div className="tasks">
      {active.map((q) => {
        const [have, need] = questProgress(q);
        const done = have >= need;
        return (
          <div key={q.npc} className={`task ${done ? 'task--done' : ''}`}>
            <b>{NPC_BY_ID.get(q.npc)?.name}:</b> {questShort(q)} {q.kind !== 'visit' && `${have}/${need}`} {done && '✓'}
          </div>
        );
      })}
      {traderLine && <div className="task task--trader">{traderLine}</div>}
    </div>
  );
}

function HurtFlash() {
  const hurtId = useGame((s) => s.hurtId);
  if (hurtId === 0) return null;
  return <div key={hurtId} className="hurt" />;
}

function KnockedOut() {
  const ko = useGame((s) => s.koUntil);
  if (!ko) return null;
  return (
    <div className="ko">
      <div className="ko__title">Knocked out!</div>
      <div className="ko__sub">Respawning at Hearthmeadow…</div>
    </div>
  );
}

export function HUD() {
  const locked = useGame((s) => s.locked);
  return (
    <div className={`hud ${locked ? '' : 'hud--dim'} ${IS_TOUCH ? 'hud--touch' : ''}`}>
      <Crosshair />
      <Clock />
      <Tasks />
      <Vitals />
      <Hotbar />
      <Inventory />
      <Toasts />
      <Banner />
      <HurtFlash />
      <KnockedOut />
    </div>
  );
}
