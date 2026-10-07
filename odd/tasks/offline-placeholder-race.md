# Feature: offline-placeholder-race (bug, test-side flake)

## Objective
`frontend/e2e/offline-send.e2e.ts:84` (`openGroup` right after `setOffline(true)`) must not race the WS disconnect detection.

## Problem / Evidence (2026-10-07)
- During OE3 re-verification of `fix/outbox-sender-echo` (HEAD `7536e24`), `offline-send.e2e.ts` failed 1/5 at setup: `e2e/support/chat.ts:22` `getByPlaceholder('Escribe un mensaje en el grupo...')` not found. Screenshot shows the group open with composer placeholder `Sin conexión...` while offline (`ana_demo · Conectando…` + `Sin conexión` banner).
- Root cause (evidence, not fixed): `GroupMessageInput.tsx:230` picks the placeholder from `isConnected` (WS/socket state via `useWebSocket`/`wsManager.isConnected()`), not `navigator.onLine`. The banner flips immediately on `setOffline(true)`, but `isConnected` stays true until the WS detects the dropped socket — so `openGroup` right after going offline passes only if the WS hasn't flipped yet. 1:1 `MessageInput` uses a constant placeholder, so `openDirect`/`sendChatText` are unaffected.
- Out of scope for outbox-sender-echo (different assertion, setup phase, test-side timing). Registered per process rule; not fixed here.

## Suspects (to verify)
- `openGroup` helper (`e2e/support/chat.ts`) asserting the online placeholder unconditionally; spec could wait for offline state (WS down) after `setOffline(true)` or accept either placeholder.
- Whether product placeholder switching on WS state (vs `navigator.onLine`) is intended UX.

## Scope / Authorized
Not authorized. Fix only after the user approves it on its own branch from `main`.

## Tasks
- [ ] OP1 Decide product vs test fix (placeholder source of truth) with user.
- [ ] OP2 Harden spec/helper (wait for WS-down or placeholder-tolerant openGroup) with RED-first proof of the race if product behavior stays.
- [ ] OP3 Run `offline-send.e2e.ts` 5 times + full e2e once.

## Related
- Found while verifying `odd/tasks/outbox-sender-echo.md` (OE3 second cycle, run 5). The `:106` sender-echo assertion passed 4/4 post-OE4; this failure never reached it.
