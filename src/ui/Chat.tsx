import { useEffect, useRef, useState } from 'react';
import { pollReplies, sendToSteward } from '../game/chat';
import { IS_TOUCH } from '../game/fx';
import { summonTraderToPlayer } from '../game/npcs';
import { useGame } from '../game/store';

const FADE_MS = 10_000;

/** Game commands the steward can send via `scripts/chat-cmd <name>`. */
function runCommand(cmd: string): string {
  if (cmd === 'summonTrader') return summonTraderToPlayer();
  return `Unknown command: ${cmd}`;
}

/** Minecraft-style chat: T or Enter opens it, Enter sends, Esc closes. */
export function Chat() {
  const chat = useGame((s) => s.chat);
  const open = useGame((s) => s.chatOpen);
  const [draft, setDraft] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const [, force] = useState(0);

  // Poll for steward replies and commands. Commands wait until the player has
  // pressed Play, so the player's saved position is loaded before they run.
  useEffect(() => {
    const pending: string[] = [];
    const tick = async () => {
      const g = useGame.getState();
      for (const r of await pollReplies()) {
        if (r.text) g.pushChat('claude', r.text);
        if (r.cmd) pending.push(r.cmd);
      }
      while (pending.length && useGame.getState().started) g.pushChat('system', runCommand(pending.shift()!));
    };
    void tick();
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, []);

  // Re-render periodically so closed-chat lines fade out.
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => input.current?.focus(), 0);
    } else {
      input.current?.blur();
    }
  }, [open]);

  const close = () => {
    setDraft('');
    useGame.getState().setChatOpen(false);
  };

  const submit = async () => {
    const text = draft.trim();
    close();
    if (!text) return;
    const g = useGame.getState();
    g.pushChat('you', text);
    if (!(await sendToSteward(text))) g.pushChat('system', "Couldn't reach Claude — is fraigent-command running?");
  };

  const now = performance.now();
  const visible = open ? chat.slice(-14) : chat.filter((l) => now - l.at < FADE_MS).slice(-6);

  return (
    <div className={`chat ${open ? 'chat--open' : ''} ${IS_TOUCH ? 'chat--touch' : ''}`}>
      <div className="chat__log">
        {visible.map((l) => (
          <div
            key={l.id}
            className={`chat__line chat__line--${l.from}`}
            style={open ? undefined : { opacity: Math.min(1, (FADE_MS - (now - l.at)) / 1500) }}
          >
            {l.from === 'claude' && <b>&lt;Claude&gt; </b>}
            {l.from === 'you' && <b>&lt;You&gt; </b>}
            {l.text}
          </div>
        ))}
      </div>
      {open && (
        <input
          ref={input}
          className="chat__input"
          value={draft}
          maxLength={400}
          placeholder="Say something to Claude…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') void submit();
            if (e.key === 'Escape') close();
          }}
          onBlur={() => {
            // On touch the on-screen keyboard closing blurs the field; treat that as cancel.
            if (IS_TOUCH && !draft) close();
          }}
        />
      )}
    </div>
  );
}
