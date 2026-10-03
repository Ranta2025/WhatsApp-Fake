# Feature: pwa

## Objective
Make the web app a properly installable PWA: valid manifest with raster icons, an install button, an offline-capable app shell (the UI loads without network and says it is offline), safe update handling, and a single service worker that `web-push` can extend.

## Problem / Why
A partial PWA already exists but it does not actually work offline or meet install criteria reliably:
- `frontend/public/manifest.json` exists (`display: standalone`, `start_url: /`, theme `#0a1015`) but every icon is an **SVG** (`/icons/icon-72x72.svg` ... `maskable-512x512.svg`). `frontend/scripts/generate-icons.mjs:1` says it "genera iconos PNG" but writes only `.svg` files (`writeFileSync(... .svg)`). Chromium install criteria and iOS need PNG icons (192 and 512 at least, 180 for `apple-touch-icon`); to verify against current Chrome/Safari docs.
- `frontend/index.html` links `apple-touch-icon` to `/icons/icon-192x192.svg` (iOS ignores SVG there; to verify) and already has `theme-color`, `apple-mobile-web-app-*` metas.
- `frontend/public/sw.js` (cache `todos-chat-v3`) precaches only `/`, `/todos.svg`, two icons and the manifest. Navigation is network-first with a `caches.match('/')` fallback; static assets are cache-first only for those precached paths and `/icons/`. Vite's hashed bundles under `/assets/*` are **never cached**, so offline the cached `index.html` loads with missing JS/CSS: a blank page. It also calls `self.skipWaiting()` on install and `clients.claim()` on activate (`sw.js:19-21` region), which can swap the worker under an open tab whose lazy chunks (e.g. the ZegoCloud SDK, loaded on demand: `vite.config.ts` `chunkSizeWarningLimit` comment) no longer exist on the server.
- The worker is registered by hand in `main.tsx:8` -> `notifications.ts:165` (`register('/sw.js', {scope:'/'})`), mixing notification display and caching in one file.
- No install prompt handling (`rg beforeinstallprompt frontend/src` = nothing) and no offline indicator.
- nginx already serves `/sw.js` with `Cache-Control: no-cache` (`docker/nginx.conf:77-80`), hashed assets with `immutable` (`:72-75`), and everything else `no-cache` with SPA fallback (`:82-85`); `/manifest.json` falls in the last block.

## Scope / Authorized
Approved roadmap item, plan only (not yet authorized to implement). Scope: icons, manifest, service worker build, install prompt, offline banner, update prompt, tests, optional CI check. Out of scope: offline message sending/queueing, background sync, caching user media or API data.

## Dependencies / ordering
- **Do this BEFORE `web-push`.** `pwa` decides how the single service worker is built; `web-push` then adds `push` + click routing to it. If web-push ships first it edits the hand-written `public/sw.js`, and this feature later migrates that file (task PW3 must then carry the push handlers over; keep `SHOW_NOTIFICATION` and `notificationclick` behavior identical, pinned by tests).
- Independent of reactions, disappearing-messages, observability. `api-casing` is unaffected (no API change).
- Branch: `feat/pwa` from the latest feature branch in the chain (branches are chained and unpushed).

## Decisions (recommended defaults)
- **Tooling: `vite-plugin-pwa` in `injectManifest` mode, with a TypeScript worker at `frontend/src/sw.ts`** (compiled to `/sw.js` at the root so the nginx rule and existing registration path keep working). Compatibility with Vite 7 / current `vite-plugin-pwa` and `workbox-*` versions: **to verify** on npm before installing.
  - Why plugin: the precache list of hashed assets is generated at build time (a hand-written list cannot know `/assets/index-<hash>.js`), it handles revisioning and cleanup of old caches, and gives `virtual:pwa-register` for the update flow.
  - Why `injectManifest` (not `generateSW`): we own custom logic (notifications, `notificationclick`, later `push`), so we keep a real source file and only inject the precache manifest.
  - Tradeoffs: +dev dependency and Workbox runtime (~small), build complexity, SW is bundled by Rollup (TS strict applies, add `WebWorker` lib to a `tsconfig` used only for `sw.ts`, e.g. `tsconfig.sw.json`, and include it in `npm run typecheck`). Hand-written alternative: zero deps and full control, but you must write revisioning yourself (post-build script that walks `dist/assets` and writes a manifest) — more code and more bugs than the plugin. Recommended: plugin.
- **Cache strategy:**
  - Precache: app shell (`index.html`, `/assets/*`, icons, manifest, `todos.svg`).
  - Navigation: precached `index.html` via `NavigationRoute` with denylist `[/^\/api\//, /^\/storage\//, /^\/healthz/, /^\/metrics/]` (also `/ws` is under `/api/v1/ws`).
  - **Never cache** `/api/*` (including the WebSocket upgrade) and `/storage/*` (user media, large, permissioned by URL). Fonts from Google (`index.html` preconnect) may use `StaleWhileRevalidate` with a size-limited runtime cache (optional).
  - Keep a connection-less fallback: if precache is missing, network-first.
- **Update flow:** `registerType: 'prompt'`; remove the unconditional `skipWaiting()`; show a small "Nueva versión disponible - Actualizar" toast that calls `updateSW(true)`. Prevents the lazy-chunk 404 problem above. `clients.claim()` only on first install.
- **Icons:** generate real PNGs. Extend `frontend/scripts/generate-icons.mjs` or add a dev dependency (`sharp`, `@resvg/resvg-js`, or `@vite-pwa/assets-generator`; to verify which is lightest and works in Alpine/CI) to render from the existing SVG source (`generateLogoSVG` in the script) into `icon-192.png`, `icon-512.png`, `maskable-512.png`, `apple-touch-icon-180.png`. Commit the PNGs (they are static assets, like the current SVGs). Keep the SVGs as `any` fallbacks. Update `manifest.json` (or move it into the plugin's `manifest` option and delete the static file: recommended, single source of truth) and the `apple-touch-icon` link.
- **Manifest additions:** `id: "/"`, `scope: "/"`, `lang: "es"`, `shortcuts` optional. Keep `theme_color`/`background_color` `#0a1015`. Add `screenshots` only if wanting the richer Chrome install UI (optional, skip v1).
- **Install prompt:** hook `useInstallPrompt` that captures `beforeinstallprompt` (Chromium/Edge/Android only), exposes `canInstall`, `promptInstall()`, and hides itself on `appinstalled` and when `matchMedia('(display-mode: standalone)')` matches. Button placed in the profile/settings area (exact place to decide; look at `ProfileModal.tsx`). On iOS Safari show static "Compartir > Añadir a pantalla de inicio" instructions (no event exists there; to verify).
- **Offline banner:** hook `useOnlineStatus` (`navigator.onLine` + `online`/`offline` events) combined with the WS connection state (find the existing connection-state source in `frontend/src/api/websocket.ts`; to verify what it exposes). Banner text "Sin conexión. Los mensajes se enviarán cuando vuelvas." must NOT promise queueing unless implemented: v1 text is "Sin conexión" only. Do not block the UI.
- **Worker registration:** replace `registerServiceWorker()` in `notifications.ts:165-186` with the plugin's `registerSW` while keeping `swRegistration` and the `message` listener (`handleSWMessage`, `:324`) that `showNativeNotification` (`:244-265`) and `useNotificationClick` depend on. Add tests that the click path still works.
- **Lighthouse:** Lighthouse removed its dedicated PWA category in v12 (to verify). Prefer Playwright checks: manifest is fetched and valid JSON with required fields, service worker reaches `activated` (`context.serviceWorkers()`), app shell loads with `context.setOffline(true)` after first visit. Optional CI step running `lighthouse` only for performance/best-practices, non-blocking. Mark any PWA-category CI as to verify.

## Constraints
- TS strict with no `any` (including `sw.ts`); M4b runtime guards for messages between page and worker.
- Conventional Commits, no AI attribution, explicit pathspecs (`git reset -q` first). One commit per task.
- Do not break existing e2e: the SW is already registered in tests; keep `serviceWorkers` default and make sure precaching does not serve stale bundles between test runs (the docker stack rebuilds `web` on change).
- Never `docker compose down -v` unless intended; never `go test -tags integration` against the shared stack.

## TDD
Strict TDD (session config). Runners: `cd frontend && npm run test` (Vitest, jsdom), `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:e2e` (Playwright). RED examples: a Vitest spec for `useInstallPrompt` failing before the hook exists; an e2e spec asserting the manifest has PNG icons failing while it only lists SVG.
SW logic is kept in small pure modules (route matching / denylist, message parsing) so it is unit-testable without a real worker.

## Tasks
- [ ] PW1 Icons + manifest: PNG generation (script or assets generator), updated manifest (+ `id`, `scope`, `lang`), fixed `apple-touch-icon`, static-asset test/check that files exist. Verify installability criteria list first (to verify). Route: delegated.
- [ ] PW2 Build tooling: add `vite-plugin-pwa` (after version check), `injectManifest`, `src/sw.ts` + `tsconfig.sw.json` in `typecheck`, output `/sw.js` at root, manifest generated by the plugin, nginx unchanged (verify `docker/nginx.conf:77-80` still matches and `dist/sw.js` exists). Route: delegated.
- [ ] PW3 Worker logic migration: port the current `sw.js` behavior (`SHOW_NOTIFICATION`, `notificationclick`, focus/open) into `sw.ts` with pinned characterization tests written BEFORE the move; precache + navigation fallback with the denylist; runtime rules; remove forced `skipWaiting`. Route: delegated.
- [ ] PW4 Registration + update UX: `registerSW` integration preserving `swRegistration` and the click message path; "Nueva versión" toast. Tests. Route: delegated.
- [ ] PW5 Install button + offline banner: `useInstallPrompt`, `useOnlineStatus`, components, iOS instructions. Component tests. Route: delegated.
- [ ] PW6 Playwright: manifest valid + SW activated + offline reload shows the shell (login page or dashboard skeleton) and the offline banner; API stays uncached (request after `setOffline(false)` hits network). Two green runs. Route: delegated.
- [ ] PW8 Backend idempotency: optional `ClientID` on `MessageGet`/group send payloads (WS `chat`, `group_chat`, REST group send), persisted column + unique partial index (`client_id IS NOT NULL`) on `messages` and `group_messages` per sender, repo upsert-or-return-existing, echoed in responses so the client can reconcile. Service/handler tests (first send inserts, replay returns same ID and does not re-broadcast to receivers twice) + Go e2e. Route: delegated.
- [ ] PW9 Frontend outbox: IndexedDB store (`idb` or hand-written, verify), enqueue when `navigator.onLine` is false or WS not open, optimistic message with `status: 'pending'` + clock icon, flush FIFO on WS open, reconcile by `ClientID`, retry on failure, survive reload (outbox rehydrates into the chat list), clear on logout. Vitest with fake-indexeddb. Route: delegated.
- [ ] PW10 Playwright offline send: Ana goes offline (`context.setOffline(true)`), sends a 1:1 and a group message (clock icon shown), reloads while offline (messages still pending), goes online, messages delivered exactly once to Luis/group. Two green runs. Route: delegated.
- [ ] PW7 CI + docs: README section; optional non-blocking Lighthouse job (to verify); update `.github/workflows/ci.yml` only if a new step is really needed (the e2e job already runs Playwright). Close, doc + mirror.

## Acceptance criteria
- Chrome shows the install option (DevTools > Application > Manifest without errors) and installs the app; installed app opens standalone.
- After one online visit, reloading with the network off shows the app shell and an offline banner, never a blank page.
- `/api/*`, the WebSocket and `/storage/*` are never served from cache.
- A new deploy shows the update toast and does not break an open tab.
- Existing notification behavior (SHOW_NOTIFICATION, click -> open chat) is unchanged and covered by tests.
- No `any`; typecheck, lint, test, build, `test:e2e` (twice) green.

## Risks
- Stale cache after deploys (mitigated by revisioned precache, `no-cache` on `sw.js`, prompt-based update).
- Serving stale JS in e2e after `docker compose up --build web` (SW cache from a previous run): e2e uses fresh browser contexts per run; still watch for it.
- Plugin/Vite 7 compatibility (to verify); Workbox adds weight to the worker.
- iOS quirks (install flow, storage eviction); to verify.

## Open questions (user decision)
- **RESOLVED 2026-10-03 (orchestrator, technical):** `vite-plugin-pwa` with `injectManifest` (single worker that web-push extends later).
- **RESOLVED 2026-10-03 (user):** offline scope = shell AND offline sending. Outgoing text messages (1:1 and group) typed while offline are queued in an IndexedDB outbox with a client-generated `ClientID` (UUID v4), shown in the list with the pending clock icon, and flushed in order on reconnect (WS open). Backend makes sends idempotent on (`sender`, `ClientID`): unique partial index, duplicate send returns the already-saved message instead of inserting. Media offline sending is out of scope (text only). See tasks PW8-PW10.
- **RESOLVED 2026-10-03 (user):** update behavior = prompt ("Nueva versión disponible" toast with "Actualizar" button; no forced `skipWaiting`).

## Progress / Evidence
(not started)

## Next step
Implement before `web-push`. First task: PW1.
