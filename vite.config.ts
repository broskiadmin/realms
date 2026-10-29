import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Run under fraigent-command's `/app/<name>/` reverse proxy when the
// apps-backend launcher sets FRAIGENT_PARENT_PORT (it does, by default).
//
// `base` makes Vite emit asset URLs prefixed with /app/<name>/ so root-
// absolute paths in the iframe HTML resolve back through the proxy
// instead of leaking to the parent origin.
//
// `hmr.clientPort: 0` tells the in-iframe HMR client to open its
// WebSocket to the SAME origin/port the page was loaded from — i.e.
// whatever host:port the browser used to reach fraigent-command — and
// let the `/app/<name>/` proxy carry the WS through to this child.
// Mechanism: Vite resolves `clientPort || port || null`, so 0 → null,
// and `@vite/client` then builds the socket host as
// `importMetaUrl.hostname:importMetaUrl.port` (the proxied origin of
// @vite/client itself). Result: HMR follows the browser's real origin
// on :5174 (dev frontend), :3001 (single-port backend), a LAN IP, or an
// https tunnel — every access pattern — instead of one hardcoded port.
//
// DO NOT hardcode `clientPort` to a literal port (e.g. 5174). The iframe
// src is relative (`/app/<name>/`), so the page inherits whatever port
// the operator browses on; a hardcoded port the browser can't reach
// means HTTP loads fine but HMR silently never connects. (A hardcoded
// port pointing at a port with NO working proxy is worse — it fires
// bogus WS upgrades that fill the browser's per-origin WS limit and
// stall UNRELATED traffic like /tty/<id>/ws for minutes. See
// ~/workspace-gemini/fraigent-dev/amux/amux/docs/LEARNINGS_APP_PROXY_HMR.md.)
//
// Do NOT set `hmr.path` here — Vite already prefixes the HMR socket path
// with `base`, so with `base: '/app/<name>/'` and an UNSET `hmr.path` the
// emitted client URL is already `/app/<name>/?token=…`, which the /app
// proxy (ws:true) forwards. Setting `hmr.path` to BASE double-prefixes to
// `/app/<name>/app/<name>/` and breaks HMR.
//
// Gated on FRAIGENT_PARENT_PORT so the file is safe to run standalone
// (env unset → Vite defaults; HMR connects to this app's own port).
const APP_NAME = process.env.FRAIGENT_APP_NAME;
const PARENT_PORT = process.env.FRAIGENT_PARENT_PORT
  ? Number(process.env.FRAIGENT_PARENT_PORT)
  : null;
const BASE = PARENT_PORT && APP_NAME ? `/app/${APP_NAME}/` : '/';

export default defineConfig({
  base: BASE,
  plugins: [react()],
  server: PARENT_PORT
    ? {
        hmr: {
          // 0 → follow the page's own origin/port through the proxy.
          // See the block comment above; never hardcode a literal port.
          clientPort: 0,
        },
      }
    : undefined,
});
