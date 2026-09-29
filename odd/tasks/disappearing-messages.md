# Feature: disappearing-messages

## Objective
Per-chat and per-group disappearing messages, WhatsApp style:
- Timer options: off, 24 hours, 7 days, 90 days. Applies to messages sent AFTER it is set.
- 1:1: either participant can change it. Groups: admins can change it (see open question).
- A system message ("X activated disappearing messages: 24 hours") appears in the chat when it changes.
- Expired messages are deleted on the server (content really gone, including uploaded media) and vanish live from every open client.

## Problem / Why
Messages live forever. Existing deletes are all **soft** (`gorm.Model` `DeletedAt`, `backend/models/message.go`, `models/group.go`): `DeleteMessageForSender` uses plain `Delete` (`backend/repos/contactData.go:697-716`), `DeleteGroupMessage` too (`backend/repos/groupData.go:382-397`), and "delete for me" only flips `deleted_by_sender/receiver` (`contactData.go:718-745`), so message text remains in the DB. The only expiry mechanism today is for statuses: `statusCleanupLoop` (`backend/app/app.go:201-220`, 10-minute ticker via `statusCleanupInterval` `:152`, started in `buildDeps` `:179-180`, cancelled in `Run` `:252-254`), which hard-deletes with `Unscoped()` (`repos/statusData.go:187-201`). There is no per-chat settings concept, no system-message concept, and **no code anywhere removes objects from MinIO** (`rg RemoveObject backend` = nothing; the only MinIO call is `PutObject`, `services/serviceMedia.go:130`), so even expired statuses leave their media behind.

## Scope / Authorized
Approved roadmap item, plan only (not yet authorized to implement). Scope: settings storage, timer stamping on new messages, system messages, expiry job with media cleanup and reply-preview scrubbing, WS event, read-path filtering, frontend UI/state, tests. Out of scope: "view once" media, per-message timers, default timer for new chats, retroactive expiry of old messages, backups/exports.

## Dependencies / ordering
- After `message-search` (the search predicates, `backend/repos/searchData.go:23` `searchVisibleText` and `:29` `groupMembership`, must learn about `expires_at` and `kind`) and preferably after `reactions` (expiry must delete reactions; see reactions.md) — recommended order: reactions -> disappearing-messages.
- Shares no code with `pwa` / `web-push`. Push is sent at creation, so expired messages cause no interaction. `observability` (if done earlier) should get a counter `messages_expired_total`.
- `api-casing` (last) renames the new PascalCase additions in existing schemas (`ExpiresAt`, `Kind`, `DisappearSeconds`); new endpoints/events here are camelCase.
- Branch: `feat/disappearing-messages` from the latest feature branch in the chain (branches are chained and unpushed).

## Decisions (recommended defaults)
- **Storage of the setting.**
  - Groups: column `disappear_seconds int not null default 0` on `groups` (`models.Group`, AutoMigrate list `backend/database/postgres.go:109-122`); exposed in `schemas.GroupResponse` as `DisappearSeconds` (PascalCase, omitempty) so group list/detail carry it.
  - 1:1: there is no chat entity (a chat can exist without a contact row, see `ChatGroup.IsContact` in `schemas/schemaMessage.go`, and `ContactDataBase` is per direction). New table `chat_settings(id, user_low_id, user_high_id, disappear_seconds, updated_by_id, updated_at)` with `UNIQUE (user_low_id, user_high_id)` (ids ordered low/high so both directions share one row), created via AutoMigrate + `execMigration` unique index (`postgres.go:18`). Expose `DisappearSeconds` on `schemas.ChatGroup` (chats list) and via `GET /api/v1/chat/:contact/settings` -> `{disappearSeconds}` for the open chat.
  - Allowed values enforced in the service: `0, 86400, 604800, 7776000` (constants, `ErrInvalidDisappearDuration`).
- **Stamping.** New nullable column `expires_at timestamptz` on `messages` and `group_messages`, with a partial index `WHERE expires_at IS NOT NULL` (`execMigration`). Set at creation from the chat/group setting at that instant: in `ServiceChat.ServiceCreatMessageWithStatus` (`services/serviceChat.go:77`) and `ServiceGroup.SendGroupMessage` (`services/serviceGroup.go:264`); expose `ExpiresAt` (omitempty) in `schemas.Message` and `GroupMessageResponse`. Changing the timer never touches existing messages.
- **System messages.** Add `kind varchar(12) not null default ''` to both message tables (`''` = user message, `'system'`); expose `Kind` (omitempty). Body carries a machine code, not localized prose, e.g. `Message = "disappearing:86400"` (0 = off) plus the actor in the existing sender field; the frontend renders "Ana activó los mensajes temporales: 24 horas". Do NOT reuse `MediaType` for this (it drives media rendering and search filters). System messages: never expire, never counted as unread, never pushed (web-push), never returned by search (add `AND kind = ''` to `searchVisibleText` and the group equivalent), excluded from sidebar last-message previews (check the preview code in `Sidebar.tsx`; to verify), and skipped by group read receipts (they still consume an id; watermark comparisons are unaffected).
- **Changing the setting** (service `SetChatDisappearing(actorTelephon, contactTelephon, seconds)` / `SetGroupDisappearing(actor, groupID, seconds)`): validates the value, checks participant/admin, upserts the setting, inserts the system message in the same transaction, then notifies. Endpoints (camelCase): `PUT /api/v1/chat/:contact/disappearing` body `{seconds}`, `PUT /api/v1/group/:groupID/disappearing` body `{seconds}`; routes in `backend/routers/api/api.go` (chat block `:67-77`, group block `:119-139`, using `MiddlewareGroupID`). No-op when the value is unchanged (no system message spam). WS event `disappearing_changed` (camelCase) `{kind:"direct"|"group", key:<telephon|groupID>, seconds, byTelephon, message: <the system message in the normal schema>}`; 1:1 to both users, group to `SendToGroup(groupID, "", ...)` (empty sender so nobody is excluded, `hub.go:207`) plus REST response for the actor. The system message also travels as a normal `chat`/`group_chat` event so existing list-merge code needs no special path (to verify how the frontend renders unknown fields).
- **Expiry job.** New `messageExpiryLoop` next to `statusCleanupLoop` in `backend/app/app.go`, same shape (immediate first run, ticker, ctx cancellation wired into `App.cancelStatusCleanup`-style field; the loop needs the hub so it is built in `buildDeps` after `hub := websocket.NewHub(...)`, `app.go:165`). Interval: **1 minute** (own constant `messageExpiryInterval`), because the 10-minute status interval would leave expired messages visible for up to 10 minutes; the partial index makes the scan cheap. Each pass, in batches of e.g. 500 (loop until fewer than the batch):
  1. `SELECT id, id_user, id_receptor, media_url` (and the group equivalent with `group_id`) `WHERE expires_at <= now()`.
  2. In a transaction: null out `reply_to_message` (and set nothing else) on rows that reply to these ids (**replies store a copy of the original text**, `Message.ReplyToMessage`, `models/message.go`; without this the expired text survives in the reply), delete their reactions (`message_reactions`, if that feature exists), then `Unscoped()` hard delete the messages (soft delete would keep the text).
  3. After commit: delete media objects (below), then notify clients.
- **Read-path filtering.** Because the job runs every minute, reads must ALSO hide rows with `expires_at <= now()` so expired content is never returned. Add one reusable predicate/scope (`notExpired`) and apply it to every query that returns messages: 1:1 history/page/around/after (`repos/contactData.go` around the queries used by `HandlerGetChats`, `handlerChat.go:56-125`), chats list (`HandlerGetAllChats`), group page/around/after (`repos/groupData.go:251` `GetGroupMessagesPage` and siblings), group detail preload, and all search queries (`repos/searchData.go`). Enumerate every query site first with `rg "Model\(&models.(Group)?Message\{\}\)" backend/repos`; missing one is the main correctness risk, so cover each with a test.
- **Media cleanup.** Add `Remove(ctx, url string) error` to `MediaServicer` (`services/serviceMedia.go`, wraps `client.RemoveObject`). Derive the object key from the stored URL: strip `/storage/<bucket>/` or the `MEDIA_PUBLIC_BASE_URL` prefix (both built at `serviceMedia.go` step 6, "Construir URL relativa"). **Reference check before deleting:** the same URL can be reused by forwards/resends (to verify how `ForwardMessageModal.tsx` sends media: it resends `MediaUrl`), avatars and statuses; only remove the object when no remaining row in `messages`, `group_messages`, `statuses` (media_url), `user_data_bases` (avatar/wallpaper), `groups.avatar_url` references it. Media removal failures are logged and retried on the next pass is NOT possible once rows are gone, so record failed keys in a small `media_gc` table or accept orphaning with a metric (see open question). Related pre-existing gap: expired statuses also orphan their media; a shared `GCMedia(urls)` helper can serve both.
- **Live removal.** After a batch commits, group ids by chat and send `messages_expired` (camelCase) `{kind, key, messageIDs:[...]}`: 1:1 to both participants (`Hub.SendTo`, `hub.go:132`), groups to the room (`SendToGroup` with empty sender). The client also removes messages locally when `Date.now() >= ExpiresAt` using a single scheduled timeout for the earliest expiry among loaded messages (capped, re-armed on list changes), so the UI is right even if the WS event is late or the tab was asleep; on reconnect the normal history refetch is already filtered server-side.
- **Interaction summary.**
  - Pagination: cursors are message ids, deletions only create gaps; `hasMore` computed from the query stays correct. Detached windows (`focusedWindow`) and `messagesByChat/groupMessages` (`DashboardContext.tsx:242-249`) must drop the ids from `messages_expired` in all three; if the jump target expired, the `around` endpoint returns 404 and the UI shows a toast (to verify current handling of that 404).
  - Search: expired rows are never returned; a stale result whose target vanished must not crash the jump.
  - Receipts: watermarks are by id, unaffected; `GET .../receipts` for an expired message returns 404 (`ErrGroupMessageNotFound`).
  - Reactions: deleted with the message (see reactions.md).
  - Edit/delete-for-everyone on an expiring message: allowed until it expires, `expires_at` unchanged by edits.
  - Unread counters/sidebar previews computed on the client must ignore removed ids.
- **UI.** Chat info panel toggle for 1:1 (`ContactDetails.tsx`) and the existing group side panel ("Info del grupo", `GroupChatWindow.tsx:715-734`, admins only for editing, others read-only) with a 4-option selector; header chip "Mensajes temporales: 24 h" when active; small clock icon next to the time on bubbles that have `ExpiresAt`; centered system-message pill component for `Kind === 'system'`. Accessible labels in Spanish like the rest of the UI.

## Constraints
- TS strict with no `any`; runtime guards for new payloads (`messages_expired`, `disappearing_changed`, `ExpiresAt` parsing).
- Conventional Commits, no AI attribution, explicit pathspecs (`git reset -q` first). One commit per task. Read-path filtering (DE3) is its own commit.
- Never `go test -tags integration` against the shared stack (TRUNCATE). Never `docker compose down -v` unless intended.
- Hard deletes are irreversible: unit-test with mocks/sqlite-free repo tests as elsewhere; integration tests only through `-tags e2e` on unique data.

## TDD
Strict TDD (session config). Runners: `go test ./...`, `cd frontend && npm run test`, `make test-integration`, `cd frontend && npm run test:e2e`. Expiry timing tests must be deterministic: inject a `clock` (`func() time.Time`) into the service/job (no sleeps); e2e sets the smallest allowed value by test-only override (env `DISAPPEAR_TEST_SECONDS`, forbidden in production builds; to decide) or seeds a message with a past `expires_at` through a test-only path. Mutation checks: predicate `<=` vs `<`, reply-scrub removed, reference check removed, admin check dropped, search `kind` filter dropped.

## Tasks
- [ ] DE1 Data model + settings: columns (`expires_at`, `kind`, `groups.disappear_seconds`), `chat_settings` table, migrations/indexes, repo + service (`Set/Get`), allowed durations, permissions (participant / admin), unit tests. Route: delegated.
- [ ] DE2 Stamping + system messages + endpoints + WS `disappearing_changed`: stamp `expires_at` at creation, insert system message in the same tx, PUT endpoints, `GET settings`, `DisappearSeconds` in `GroupResponse`/`ChatGroup`, search excludes `kind='system'`. Handler/service tests + Go e2e (set 24h, message carries `ExpiresAt`, admin-only in groups, invalid value 400). Route: delegated.
- [ ] DE3 Read-path filtering: `notExpired` scope on every message query (list them in the task, one test per site). Route: delegated.
- [ ] DE4 Expiry job: `messageExpiryLoop` (clock-injected), batch delete with reply scrubbing and reaction cleanup, media GC (`MediaServicer.Remove`, reference check), `messages_expired` fan-out, wiring + graceful stop in `app.go`. Tests for each rule, plus job start/stop like `app_test.go` covers the status loop (`backend/app/app_test.go`, to verify). Route: delegated.
- [ ] DE5 Frontend plumbing: types/guards, `messages_expired` + `disappearing_changed` handlers, removal from `messagesByChat`/`groupMessages`/`focusedWindow`, local expiry timer, system-message rendering, unread/preview exclusion. Vitest. Route: delegated.
- [ ] DE6 UI: selector in chat info and group panel, header chip, bubble clock icon, permission gating. Component tests. Route: delegated.
- [ ] DE7 Playwright: Ana sets a timer with Luis, system pill appears for both; a new message shows the clock icon; expiry removes it live for both and after reload (using the test-only short duration or seeded expiry); group variant, non-admin cannot change. Two green runs. Route: delegated.
- [ ] DE8 Close: full checks, doc + mirror.

## Acceptance criteria
- Setting a timer creates a system message visible to all participants; only permitted users can change it; invalid values are rejected.
- Messages sent afterwards carry `ExpiresAt`; at expiry they disappear live for online users and are never returned again; DB rows are hard-deleted; reply previews of them are scrubbed; their media objects are removed when unreferenced.
- Old messages are untouched; search, pagination, jump-to-message, receipts and reactions keep working.
- No `any`; `go test ./...`, typecheck, lint, test, build, `make test-integration`, `npm run test:e2e` green.

## Risks
- **Missed read path** returning expired rows (mitigated by the scope + per-site tests).
- Irreversible data loss bugs in the job (batching, wrong predicate): deletes are by explicit id lists produced in the same pass; dry-run flag `MESSAGE_EXPIRY_DRY_RUN` recommended for first deploy.
- Media deletion racing with a concurrent forward that reuses the URL (reference check inside the same tx window; residual race accepted and documented).
- Message copies outside the server (other clients' local state, notifications, forwarded copies) cannot be recalled: state this in the UI copy.
- Clock skew between app and DB: always compare with DB `now()` in SQL, not Go time, for the job.

## Open questions (user decision)
- **Open question (user decision):** who can change the timer in groups. Recommended: admins only (`UserRole == "admin"`, `schemas.GroupResponse.UserRole`). Alternative: any member.
- **Open question (user decision):** should media objects be deleted from MinIO on expiry. Recommended: yes, with the reference check (this is what "disappearing" implies). Alternative: keep objects and only hide rows (privacy weaker).
- **Open question (user decision):** failed media deletions. Recommended: log + metric, accept rare orphans in v1. Alternative: persistent `media_gc` queue table with retry.
- **Open question (user decision):** expiry precision. Recommended: 1-minute job + read-time filtering.

## Progress / Evidence
(not started)

## Next step
Implement after `reactions`; first task DE1.
