# Feature: message-pagination

## Objective
Cursor-based history pagination with infinite scroll up, for 1:1 chats and group chats.

## Problem / Why
History loads as one block: up to 200 messages per 1:1 chat (`/api/v1/chats`, `GET /chat/:contact`) and 50 per group (`limit/offset`). Older messages are unreachable, and offset paging with a `time`/`created_at` order and no tie-break can duplicate or skip rows that share a timestamp.

## Scope / Authorized
The user approved the roadmap queue item "message-pagination". Scope is the backend endpoints, the frontend state and both message lists. The initial `/api/v1/chats` and `GetGroupDetail` payload sizes are out of scope (unchanged).

## Decisions (orchestrator defaults)
- **Cursor:** message `id`, with `WHERE id < :before ORDER BY id DESC LIMIT limit+1` to derive `hasMore`. This assumes id order equals chronological order. The writer verifies how `Time` is set; if `Time` can diverge from insert order, use a `(time,id)` keyset instead and record why.
- **1:1 `GET /chat/:contact`:** add optional `before` and `limit` (default page 50, max 100). The body stays a bare array, and `hasMore` goes in the `X-Has-More: true|false` header. With no params, behavior stays exactly as today (latest 200).
- **Group `GET /group/:id/message`:** add optional `before`, keep `limit/offset` working, and add a `hasMore` sibling to `{messages}`.
- **Indexes:** add `(group_id, id) WHERE deleted_at IS NULL`, `(id_user, id_receptor, id)` and the reverse, via `execMigration`.
- Per-user delete flags and soft-delete filters stay in the paged queries.

## Constraints
- Branch: feat/message-pagination (from feat/group-media).
- TS strict, no `any`, keep the M4b principle (runtime guards on network data).
- Synthetic `IsSystem` entries are never used as a cursor.
- Reconnect re-sync, `fetchGroupDetail` and `fetchChatMessages` must not clobber pages that are already loaded. Merge with dedupe by `MessageID`.
- Prepending older messages must not jump the scroll. Auto-scroll to the bottom only on a chat change or an appended tail message.
- Commits: Conventional Commits, no AI attribution, explicit pathspecs (`git reset -q` first).

## TDD
Strict TDD (session config). Runners: `cd backend && go test ./...`, `cd frontend && npm run test` (Vitest). RED → GREEN → REFACTOR, with mutation checks when tests only pin existing behavior.

## Delivery
ask-on-risk. There is one reviewed work-unit commit per task. Reviews run per commit via `.git/rdd-state/cycle.zsh`.

## Tasks
- [x] MP1 Backend group cursor: `before` + `hasMore` in the repo, service and handler; add the index; unit tests plus an integration test for the boundary and same-timestamp rows. Route: delegated.
- [x] MP2 Backend 1:1 cursor: `before`/`limit` + the `X-Has-More` header; default behavior unchanged; add the indexes; update the mocks and tests. Route: delegated.
- [ ] MP3 Frontend state: `getGroupMessages({before})`, a 1:1 fetch with `before`, and `loadOlderMessages` / `loadOlderGroupMessages` in DashboardContext (prepend, dedupe, sort, per-chat `hasMore`/`loadingOlder`). Re-sync and detail fetches merge instead of replacing. Tests. Route: delegated.
- [ ] MP4 1:1 MessageList infinite scroll up: a top sentinel triggers `loadOlder`, the scroll anchor is preserved on prepend, and there is a loading indicator. Tests. Route: delegated.
- [ ] MP5 Group list infinite scroll up: same behavior in GroupChatWindow's list. Tests. Route: delegated.
- [ ] MP6 Close: browser smoke (seed more than 60 messages, scroll up, confirm no jump or duplicates), doc + mirror.

## Acceptance criteria
- Scrolling to the top of a long chat or group loads older pages until `hasMore` is false, with no duplicates, gaps or scroll jumps.
- Existing clients and default endpoint behavior are unchanged.
- `go test ./...`, typecheck, test, lint and build are green, with no `any`.

## Progress / Evidence
- Decision check: group `Time` is `time.Now()` at creation (serviceGroup.go:283), so id order == chronological; id cursor kept. Group repo now orders by `id DESC` (tie-break-free) in all paths.
- MP1: RED = services test build failure (`GetGroupMessagesPage` undefined) + handler `hasMore` mutation (`"hasMore": false`) fails `TestHandleGetGroupMessages_DefaultsAndHasMore`; GREEN = `go test ./...` ok, `go vet ./...` ok. Added 3 service tests, 3 handler tests, integration test (build-tagged; compiled with `go vet -tags integration`, NOT run: no Postgres reachable, pg_isready no response).
- Decision check MP2: 1:1 `Time` is `time.Now()` at creation (serviceChat.go:96), id cursor kept; repo orders by `id DESC` then reverses to chronological. Handler: no/invalid params => limit 0 => legacy 200; `before` w/o limit => 50; service clamps to 100; `X-Has-More` always set. Found: CORS `ExposeHeaders` lacked it, so added `X-Has-More` in config/cors.go (cross-origin clients could not read it).
- MP2: RED = services build failure (`ServiceGetMessagesPage`/`maxChatMessagesPage` undefined), handler tests panicked on unexpected mock call, CORS test failed before exposing header; mutation = clamp `limit > 100000` fails `TestServiceGetMessagesPage_LimitRules`; GREEN = `go test ./...` ok, `go vet ./...` ok. Integration test (same-timestamp rows, per-user delete flag, boundary) compiled via `go vet -tags integration`, NOT run (no Postgres). Indexes `idx_messages_conv_cursor(_rev)` added.

## Next step
MP1–MP5 via one Sonnet writer, one commit per task.
