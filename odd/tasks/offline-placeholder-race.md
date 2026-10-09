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
Authorized by user 2026-10-0x ("si hazlo"): product+test fix on branch `fix/offline-placeholder-race` from `main`.

## Review (RDD)
- Assess `c23ebc0 --committed-only`: medium, under_budget (17 lines). Consent granted by user via native question. START froze lineage `review-1aab4940762dea43`.
- Outcome: **unavailable** — single lens `review-reliability` cannot be relayed in this runtime (no reviewer Task agent; capture without `--input` refused with `invalid_request`; `--agent=opencode` has no in-process adapter). No verdict authored, nothing burned. Verification of record: typecheck + GroupMessageInput 23/23 + offline-send 5/5 + full suite (only known flake).

## Tasks
- [x] OP1 Decide product vs test fix (placeholder source of truth) with user. Decided 2026-10-0x: product+test. Test-only tolerance alone cannot save runs (disabled textarea blocks the send); group text already queues via outbox, so composer stays enabled offline for text (media/attach/voice/edit stay online-only).
- [x] OP2 Harden spec/helper + product composer. Done: GroupMessageInput textarea always enabled + Enviar enabled offline for new text (edits still gated); openGroup/sendGroupText accept either placeholder. Typecheck clean, GroupMessageInput 23/23.
- [x] OP3 Run `offline-send.e2e.ts` 5 times + full e2e once. Done: 5/5 green (:84/:85-87/:106); full suite 44/1 skipped/1 failed = known stickers-full:168 flake (teardown close). CLOSED.

## Related
- Found while verifying `odd/tasks/outbox-sender-echo.md` (OE3 second cycle, run 5). The `:106` sender-echo assertion passed 4/4 post-OE4; this failure never reached it.
