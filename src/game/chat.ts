/**
 * In-game chat bridge to the Realms steward Claude session.
 *
 * Outgoing: typed into the steward's tmux pane via fraigent-command's
 * `/api/tmux/sessions/:name/send-keys` (same origin as the game iframe).
 * Incoming: the steward appends JSON lines to `public/chat.jsonl` with
 * `scripts/chat-reply "..."`; the game polls that file.
 */

const STEWARD_SESSION = 'fraigent_steward_realms';
const STEWARD_WINDOW = 0;
export const CHAT_PREFIX = '[realms chat]';
const SEEN_KEY = 'realms-chat-seen';

export interface ChatReply {
  id: string;
  at: number;
  text?: string;
  /** Optional game command from the steward (see runCommand in ui/Chat.tsx). */
  cmd?: string;
}

export async function sendToSteward(text: string): Promise<boolean> {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return false;
  try {
    const res = await fetch(`/api/tmux/sessions/${STEWARD_SESSION}/send-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `${CHAT_PREFIX} ${clean}`, enter: true, windowIndex: STEWARD_WINDOW }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Returns replies newer than the last one shown, and remembers them as seen. */
export async function pollReplies(): Promise<ChatReply[]> {
  let seen = Number(localStorage.getItem(SEEN_KEY));
  if (!seen) {
    // First run: don't replay old history.
    seen = Date.now();
    localStorage.setItem(SEEN_KEY, String(seen));
  }
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}chat.jsonl?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return [];
    const fresh: ChatReply[] = [];
    for (const line of (await res.text()).split('\n')) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line) as ChatReply;
        if (r.at > seen && (typeof r.text === 'string' || typeof r.cmd === 'string')) fresh.push(r);
      } catch {
        // Ignore a partially written line; it'll parse on the next poll.
      }
    }
    if (fresh.length) localStorage.setItem(SEEN_KEY, String(Math.max(...fresh.map((r) => r.at))));
    return fresh;
  } catch {
    return [];
  }
}
