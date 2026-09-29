# Feature: group-read-receipts

## Objective
WhatsApp-style receipts for group messages:
- The sender sees ticks: sent (single check), delivered to every current member (double check), and read by every member (blue double check).
- The message menu has an "Info" entry that lists who read the message and who it was delivered to.

## Problem / Why
Group messages have no receipt concept at all. There is no status field and no per-member read or delivered state. Only 1:1 chats have `enviado/entregado/visto`.

## Scope / Authorized
The user approved roadmap item "group-read-receipts". Scope is backend (model, repo, service, WS, REST), frontend (state, ticks, Info UI) and a Playwright spec.

## Decisions (orchestrator defaults)
- **Watermarks per member**, not a per-message receipt table:
  - Add `last_delivered_message_id`, `last_read_message_id`, `last_delivered_at` and `last_read_at` to `group_members`.
  - Add a `joined_message_id` snapshot, the max group message id at join time; `0` for existing rows.
  - Watermarks only advance (`GREATEST`) and are capped at the group's max message id. Ids are global serials, so comparisons are valid only within one group.
- **Derived status per message** `m` sent by S, over current (non-soft-deleted) members other than S with `joined_message_id < m.id`:
  - Delivered = every member has `last_delivered_message_id >= m.id`.
  - Read = every member has `last_read_message_id >= m.id`.
  - A member counts as delivered whenever they count as read.
  - If there are no other eligible members, the message shows as sent.
- **Info UI:** lists "Leído por" and "Entregado a", with no per-message timestamps, because watermarks can't give exact times. Only the message sender can open Info, and the endpoint enforces it (WhatsApp privacy).
- **Triggers** mirror 1:1:
  - Delivered is advanced on WS `initClient`: each of the user's groups goes to its max id.
  - Delivered is also advanced by a client ack `group_delivered {groupID, messageID}` on receiving `group_chat`.
  - Read is `group_read {groupID, upToMessageID}` while the group chat is open and the tab is visible, throttled or debounced on the client.
  - The server checks membership and pushes `group_receipt {groupID, telephon, deliveredUpTo, readUpTo}` to the online members of the group. Clients only use it for their own messages. The payload is small, and sending it only to authors needs a per-message query.
- **Payload compatibility:** existing payloads are unchanged. New fields are optional or `omitempty`. Group detail and member responses carry each member's watermarks, so the frontend derives ticks for any loaded page (works with pagination).

## Constraints
- Branch: feat/group-read-receipts (from feat/e2e-ci).
- TS strict with no `any`, and the M4b runtime-guard principle applies.
- Never run `go test -tags integration` against the shared stack.
- Commits use Conventional Commits with no AI attribution. Use explicit pathspecs (`git reset -q` first).

## TDD
Strict TDD (session config). Runners:
- `go test ./...`
- `cd frontend && npm run test`
- `npm run test:e2e` (Playwright, against the running stack)
- `make test-integration` (Go `-tags e2e`)

## Tasks
- [x] RR1 Backend data + repo/service: add the watermark fields and `joined_message_id` (set on join/create), with AutoMigrate and an index if useful. Add monotonic advance methods (capped) and a receipts query that returns per-message readers/deliverees plus a derived status helper. Unit tests. Route: delegated.
- [x] RR2 WS ingestion: `group_delivered` and `group_read` handlers with a membership check and registration in `cliente.go`, `initClient` bulk delivered-advance, and the `group_receipt` push. Tests: service, plus hub/handler where testable. Route: delegated.
- [x] RR3 REST: sender-only `GET /api/v1/group/:groupID/message/:messageID/receipts` returns `{readBy:[...], deliveredTo:[...], pending:[...]}` with member briefs. Group detail and members include watermarks. Handler and service tests, plus a Go e2e (`-tags e2e`) happy path and a non-sender 403. Route: delegated.
- [x] RR4 Frontend plumbing: WS types and senders, DashboardContext receipt state (`groupReceipts[groupID][telephon]`) fed from detail and `group_receipt`. Send `group_delivered` on incoming `group_chat` and a throttled `group_read` while the group is open and visible. Tests. Route: delegated.
- [x] RR5 Ticks + Info UI: a shared tick component (extracted from `MessageList.getStatusIcon`, 1:1 unchanged and pinned), derived ticks on own group bubbles, and an "Info" menu item (sender only) that opens a list from the receipts endpoint. Component tests. Route: delegated.
- [ ] RR6 Playwright: Ana sends in "Equipo demo" and sees sent/delivered. Luis and Marta open the group, then Ana sees the read ticks, and Info lists both as readers. Two green runs. Route: delegated.
- [ ] RR7 Close: browser smoke via the suite, doc + mirror.

## Acceptance criteria
- Group ticks progress from sent to delivered to read as members receive and open the group, live over WS and after a reload.
- Info shows the correct lists, sender only.
- 1:1 ticks are unchanged.
- `go test ./...`, typecheck, test, lint, build, `make test-integration` and `npm run test:e2e` are green, with no `any`.

## Progress / Evidence
- RR1 (delegated writer, Sonnet): RED = `go test ./services ./repos` failed to compile (undefined StatusSent / models.GroupReceiptState / etc.) before implementation; GREEN = `go test ./... && go vet ./...` pass. Mutation checks (each made tests fail, then reverted): `<`->`<=` on joined eligibility (3 fails), dropping "read implies delivered" in hasDelivered (3), removing the cap in mergeWatermarks (3), removing read->delivered carry (2). Commit: see git log (`feat(groups): add member receipt watermarks ...`).
  - Decisions/deviations RR1: (a) `DeliveredTo` in the receipts response is delivered-but-not-read (ReadBy / DeliveredTo / Pending partition the eligible members). (b) New REST payload keys are camelCase per this doc (`readBy`, `deliveredTo`, `pending`, member brief `telephon/username/avatarUrl`); WS `group_receipt` also camelCase (matches existing WS `groupID`). Existing PascalCase group schemas are untouched. (c) Watermark advance is a row-locked transaction in Go (`mergeWatermarks`, pure and unit-tested) instead of a single `GREATEST` UPDATE, so "changed" is known and redundant `group_receipt` pushes can be skipped. (d) `joined_message_id` is snapshotted in `AddMembers` (same tx); group creation leaves it 0 (no messages yet). Max id includes soft-deleted messages (ids are serials). (e) Service returns `nil` update when nothing advanced.
- RR2: RED = `go vet ./websocket` failed (HandleGroupRead/HandleGroupDelivered/allGroupMessages undefined) with new `websocket/groupReceipts_test.go`; GREEN = `go test ./... && go vet ./...` pass (new tests: read/delivered push to peers not acker, no push on no-change/error, malformed payloads ignored, initClient bulk delivered per group). Mutations that failed the tests: ack sent to acker too, bulk advance not "all messages", router entry for `group_read` removed (added `TestRouterRegistersGroupReceiptHandlers` after that mutation initially survived), `upToMessageID == 0` guard removed. Membership is enforced in the service (`requireMember`, RR1 tests); handlers only log rejections (automatic acks give no user feedback). `group_receipt` is pushed to online room members except the acker.
- RR3: RED = handler/service tests failed to compile (HandleGetMessageReceipts, ErrGroupMessageNotFound undefined) and new Go e2e `TestE2EGroupReceipts` got 404 against the old stack; GREEN = `go test ./... && go vet ./...` pass, and after `docker compose up -d --build app`, `make test-integration` ok (includes happy path: pending -> delivered -> read, group_receipt over WS, non-sender 403, non-member 403, unknown message 404, non-member `group_read` no-op, detail exposes `LastReadMessageID`). Mutations that failed tests: sender check dropped in handler mapping / service, watermark dropped from member response. Added typed errors (`ErrNotGroupMember`, `ErrGroupMessageNotFound` shared via `models`) so handlers map 403/404/500 without string matching. Member response fields are PascalCase (`JoinedMessageID`, `LastDeliveredMessageID`, `LastReadMessageID`, omitempty) to match the existing group schemas.
- RR4: RED = new specs failed before implementation (`groupReceipts` lib / `useGroupReceiptAcks` unresolved imports, `wsManager.sendGroupDelivered is not a function`, 6/7 context specs failing); GREEN = `npm run typecheck`, `npm run lint`, `npm run test` (44 files / 309 tests), `npm run build` pass; no `any`. Mutations that failed tests: own-message guard removed (delivered), read throttle removed, visibility guard removed, monotonic read merge removed, `group_receipt` handler removed, `left` guard removed. Design: pure lib `features/dashboard/lib/groupReceipts.ts` (marks from detail, monotonic merge, guarded WS parse, member add/remove), hook `useGroupReceiptAcks` (delivered coalesced to highest id per group in 150ms; read leading+trailing throttle 500ms, only while group open, not `left`, tab visible, connected; a send that returns false is retried), state `groupReceipts[groupID][telephon] = {joined, delivered, read}` in DashboardContext. `group_receipt` for unknown group/member is ignored (detail snapshot / `group_member_added` provide them; a member added live gets `joined` = latest known message id).
- RR5: Tick extraction: characterization test `MessageList.ticks.test.tsx` written BEFORE the refactor and green on the old inline `getStatusIcon` (pins exact classes/viewBox/paths/aria for enviado/entregado/visto/fallback, own messages only), still green after extracting `MessageTicks`; mutation checks on the pinned markup (sky-300->sky-400, path geometry, strokeWidth, aria-label, removing the `isMine` guard) each failed it. New behavior RED first (missing modules / `deriveGroupMessageStatus` / `getGroupMessageReceipts` not a function), then GREEN: `npm run typecheck`, `lint`, `test` (49 files / 337 tests), `build` pass, no `any`. Mutations that failed tests: derive `joined >=` boundary, Info shown to non-authors, ticks on others' messages, pending section always shown, list not using groupReceipts. One mutant survived (late response after unmount: React gives no observable effect; the `cancelled` flag is defensive only). UI: `MessageTicks` (shared), `GroupMessageBubble` gets `status` + `onInfo` (Info entry only on own messages), `GroupMessageInfoModal` ("Leído por", "Entregado a", "Sin entregar" only when non-empty), REST `getGroupMessageReceipts` + guarded `normalizeGroupReceipts`, `deriveGroupMessageStatus` mirrors backend.

## Next step
RR1–RR6 via one Sonnet writer, one commit per task.
