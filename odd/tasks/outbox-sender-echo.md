# Feature: outbox-sender-echo (bug)

## Objective
After reconnecting, a text that the sender queued offline must appear in the sender's own chat view, not only on the receiver's side.

## Problem / Evidence (2026-10-06)
- Spec `frontend/e2e/offline-send.e2e.ts:64` ("los textos se encolan, sobreviven a una recarga y se entregan una sola vez al reconectar") failed **2 of 4** runs on `main` + ui-themes (`54237e9`, stack rebuilt). It passed in the two runs just before and after, so it is intermittent.
- Failing assertion: `offline-send.e2e.ts:106` `expect(messageText(ana.page, chatText)).toHaveCount(1)` gets `0` right after `pending(ana.page, chatText)` became `0`. So the outbox entry was acked and removed, but Ana's open 1:1 chat never shows the message.
- The message **was delivered**: Luis's screenshot shows it (07:39 PM), and his sidebar preview has the text. Ana's sidebar preview still shows the previous message ("✨ Sticker"), so her client did not apply the echo or the reloaded history.
- Flow in the spec: Ana goes offline, queues one group text and one 1:1 text, reloads offline (the shell comes from the SW and the outbox persists in IndexedDB), reconnects, opens the group (OK), then opens the 1:1 chat with Luis (fails).
- Not caused by ui-themes: the same spec passed in the full e2e run of `d4923af` and in the HEAD verification of `bec86e1`; the themes diff is CSS and class names only.

## Suspects (to verify)
- The outbox flush happens while the group chat is open: the ack/echo for the 1:1 message arrives for a chat that is not selected, and neither the message store nor the sidebar preview is updated (`frontend/src/features/outbox/useOutbox.ts`, `outboxQueue.ts` `ack`, `DashboardContext` WS handlers for `message`/ack).
- Opening the 1:1 chat afterwards loads history from a stale in-memory window or skips the fetch, so the server copy of the message is not shown (`focusedWindow`, `mergeMessages`, pagination cache).
- `reconcile(knownClientIDs)` dropping the pending entry before the echo is rendered.

## Scope / Authorized
Investigation and fix only after the user authorizes it (registered on request: "si encuentras un error registra el feature y después se arregla"). Branch from `main`.

## Tasks
- [x] OE1 Reproduce deterministically (Vitest around `useOutbox`/`DashboardContext`: ack for a non-selected chat, then select it), identify the root cause. Done: `mergeMessages.test.ts` RED (25 tests, 1 failed, echo 101 dropped) + `DashboardContext.outboxEcho.test.tsx` RED (echo applied live, wiped by stale /chats). Root cause: `mergeLatestWindow(prev, fresh, false)` drops prev ids >= freshOldestId; short /chats windows infer hasMore=false (len<200). Route: delegated direct (explorer + writer, mapping trigger). Commit id in Engram mirror + git log.
- [x] OE2 Fix with a RED test first; the sender's chat and sidebar preview reflect the delivered message in every order of events. Done: `mergeLatestWindow` keeps prev entries newer than fresh window (numeric id > newest + time fallback); in-window stays server truth, non-contiguous still fresh-only. GREEN 28/28 (2 files) + lib regression 241/241. Route: delegated direct (writer trigger, 2 files). RDD slice 94d03d3..HEAD: medium, under_budget (267 lines), pending.
- [x] OE3 Run `offline-send.e2e.ts` 5 times (65 s apart) and the full e2e suite once; docs + mirror. First cycle (pre-OE4): offline-send 4/5 (run 2 fails at :106, in-scope) → OE4. Second cycle (7536e24): offline-send 4/5 — runs 1-4 PASS incl. :106 (4/4 post-OE4), run 5 fails at :84 setup (offline placeholder race, OUT of scope → `offline-placeholder-race.md`, not fixed). Final cycle (7536e24, Docker restarted): offline-send 3/3 FULL passes (:106 reached+passed every run) + full suite 45 passed/1 skipped (VAPID-gated push)/0 failed. Total post-OE4: :106 7/7. CLOSED.
- [x] OE4 Harden replayed-ack + non-contiguous newer-keep (in-scope residual of :106). Done: replayed branch appends echo if absent (dedupe-protected) before fetch; newer-keep hoisted but gated on prev holding no older page (OE1 gap `[1,2,3,12]`+`[10,11]`→`[10,11]` preserved). GREEN 30/30 + lib 242/242 + context 141/141. Route: delegated direct. Then re-run offline-send 5x.

## Progress
- OE1: RED observed 2026-10-07, both levels fail as intended; no source fix. Commit id in Engram mirror + git log.
- OE2 (943dd1d): GREEN 28/28 + lib 241/241, 2026-10-07. Sidebar preview derives from messagesByChat so it inherits the fix; ChatWindow refetch guard unchanged. Gap: server hasMore signal for short windows (out of scope).
- OE4 (7536e24): GREEN 30/30 + lib 242/242 + context 141/141. Replayed append-if-absent; newer-keep gated on no older page.
- OE3-close: 3/3 offline-send FULL + suite 45/1/0 on 7536e24 (2026-10-07). :106 7/7 post-OE4. Out-of-scope :84 race → offline-placeholder-race.md + ROADMAP (not fixed).

## Review (RDD)
- Assess `94d03d3 --committed-only`: medium, 379 lines, `under_budget` (review_due false); closing review run anyway per instruction.
- Outcome: **unavailable** — lineage `review-e76cefbdd222b6c7` (base-ref `49afc1a`, committed-only) granted consent and froze, but the single lens `review-reliability` cannot be relayed in this runtime: no `review-reliability` Task agent exists (only explore/general), `capture-result` without `--input` is refused, `--agent=review-reliability` is not a runtime, and `--agent=opencode` has no compiled in-process adapter (`opencode_provider_injected` needs the live host transport). No verdict authored, no acknowledgement burned, no authority created. Verification of record: writer GREEN reports + parent spot checks + e2e/suite evidence above.
- Independent (non-authoritative) read-only analysis noted one theoretical HIGH worth a future decision, NOT observed in any run: a server-deleted replayed echo could be resurrected by newer-keep when the reload window is non-empty (requires deletion between save and retry-fetch). Tradeoff is inherent to length-inferred `hasMore`; needs explicit live-marker/short-window-only design if ever pursued. Group replayed path (`handleGroupChatMessage`) still fetch-only (same latent class, unobserved).
- **Verdict 2026-10-09 (killed as wontfix-by-design):** unkillable without protocol support. Even authoritative per-chat `hasMore` cannot distinguish a stale full snapshot from a deletion: `/chats` returns last-200 windows (`chatListMessagesPerChat = 200`) with no count signal, and the wire has no tombstones or version watermarks (verified in serviceChat.go). The ghost needs save, lost echo frame, server-side delete inside the retry gap, and a quiet chat afterwards. Never observed in ~15 e2e runs plus full suites. Newer-keep stays (it fixes the real reproduced clobber). Reopen only on observed evidence.

## Related flake
- `frontend/e2e/stickers-full.e2e.ts:168` ("favoritos: un sticker integrado marcado persiste tras recargar") failed once in the same full run and passed alone; later FIXED on fix/stickers-flake-168 (wait favorites PUT before reload), see stickers-full.mded when rerun alone. Not investigated; track here if it recurs.
