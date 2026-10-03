# Feature: reactions

## Objective
Emoji reactions on 1:1 and group messages, WhatsApp style:
- Long-press / hover on a bubble (or the existing message menu) offers a row of quick emojis.
- Reactions appear as chips under the bubble with counts; tapping the chip toggles your own reaction; a "who reacted" list shows the users per emoji.
- One reaction per user per message; choosing a different emoji replaces it, choosing the same one removes it. Live over WebSocket and persisted.

## Problem / Why
There is no reaction concept anywhere. Message bubbles offer Reply/Forward/Edit/Delete only (1:1: `frontend/src/features/dashboard/components/MessageList.tsx:224-258`, group: `GroupMessageBubble` in `frontend/src/features/dashboard/components/GroupChatWindow.tsx:53`, Popover at `:113-172`). The two message tables (`messages`, `group_messages`, `backend/models/message.go`, `backend/models/group.go`) have independent serial ids, so a reaction must be keyed by (kind, id).

## Scope / Authorized
Authorized for implementation by the user on 2026-10-03 (branch `feat/reactions` from `feat/group-admin-permissions`). Scope: DB table, service/repo, WS events, REST read endpoint, aggregates embedded in history/window/search-jump responses, frontend state + UI, tests, Playwright. Out of scope: custom/skin-tone emoji picker, reaction notifications (push/toasts), reactions on status stories.

## Dependencies / ordering
- Do after `message-search` (touches the same history/around/after responses and the `focusedWindow` state) and after `group-read-receipts` (closed).
- **`disappearing-messages` interaction:** when that job hard-deletes messages it must also delete their reactions (no FK across two tables). If reactions ship first, add the cleanup hook in the disappearing-messages tasks; if disappearing ships first, reactions must add the delete hook to `DeleteMessageForSender`/expiry paths. Either order works, recommended: reactions first.
- `api-casing` (last) will convert the aggregate field names embedded in the existing PascalCase schemas; use PascalCase for fields added inside existing PascalCase schemas now (same precedent as the group receipt watermarks in `schemaGroup.go`, `JoinedMessageID` etc.) and camelCase for brand-new endpoints/events.
- Branch: `feat/reactions` from the latest feature branch in the chain (branches are chained and unpushed).

## Decisions (recommended defaults)
- **Table `message_reactions`** (model `backend/models/reaction.go`, add to AutoMigrate in `backend/database/postgres.go:109-122`): `id`, `message_kind size:10 not null` (`'direct'|'group'`), `message_id uint not null`, `user_id uint not null`, `emoji size:32 not null`, `created_at`, `updated_at`. No soft delete (removing = delete row). Indexes via `execMigration` (`postgres.go:18`): `UNIQUE (message_kind, message_id, user_id)` (enforces one reaction per user, "replace on change" = upsert `ON CONFLICT (...) DO UPDATE SET emoji, updated_at`) and `INDEX (message_kind, message_id)`. `CHECK (message_kind IN ('direct','group'))` like the existing status CHECK constraints (`postgres.go:141-160` style).
- **Authorization:** 1:1 - the user must be the sender or receptor of the message and it must be visible to them (same predicate as search: `(id_user=me AND NOT deleted_by_sender) OR (id_receptor=me AND NOT deleted_by_receiver)` and not soft-deleted). Group - active member (`group_members.deleted_at IS NULL`), message not soft-deleted. Non-visible target -> 404 (do not leak existence), non-member -> 403 using the shared typed errors (`ErrNotGroupMember`, `ErrGroupMessageNotFound`, `models`/`services`).
- **Emoji validation:** recommended allowlist for v1: `👍 ❤️ 😂 😮 😢 🙏` (server constant, exact string match after NFC normalization; note `❤️` includes U+FE0F). Any-emoji support needs grapheme segmentation (Go stdlib has none; `github.com/rivo/uniseg` is an option, to verify) and abuse limits (max 32 bytes, must be `Extended_Pictographic`). DECIDED (2026-10-03): any single emoji (see Open questions); the 6 above are only the quick-row defaults in the UI.
- **Mutation API (one service, two transports, like group send):**
  - WS client -> server `react` payload `{kind:"direct"|"group", messageID, groupID?, emoji}` where empty `emoji` removes. Registered in the dispatch table `backend/websocket/cliente.go:69-90` (`"react": (*MessageHandler).HandleReaction`), handler in `message_handlers.go` next to `HandleGroupRead` (`:492`).
  - REST mirror for tests/e2e/automation: `PUT /api/v1/chat/message/:id/reaction` body `{emoji}`, `DELETE /api/v1/chat/message/:id/reaction`, `PUT|DELETE /api/v1/group/:groupID/message/:messageID/reaction` (routes in `backend/routers/api/api.go`; mind the existing `DELETE message/:id/me` at `api.go:76` and the group routes at `:120-139`, and use the `MiddlewareGroupID`/`MiddlewareGroupMessageID` middlewares already used for receipts at `:137`).
- **WS event server -> client** `reaction` (camelCase): `{kind, messageID, groupID?, telephon, emoji}` with `emoji:""` meaning removed. Fan-out: 1:1 -> both participants (`mh.reply` + `Hub.SendTo(other)`, the pattern in `HandleChatMessage`, `message_handlers.go:83-92`); group -> `mh.reply` to the actor plus `Hub.SendToGroup` (`hub.go:207`, which excludes the sender), same as `HandleGroupChatMessage` (`:330-331`). Clients apply idempotently (set/clear the actor's reaction) so a duplicate never double counts. Rate limit: reuse the WS-level pattern if any exists (to verify; otherwise cap 10 reactions/sec/user in the service).
- **Loading: embed aggregates in history responses (recommended), fetch the "who" list on demand.**
  - Add `Reactions []ReactionSummary` (`omitempty`) to `schemas.Message` (`backend/schemas/schemaMessage.go`) and `schemas.GroupMessageResponse` (`schemaGroup.go`) with `ReactionSummary{Emoji string; Count int; Mine bool}` in PascalCase (inside PascalCase schemas). `Mine` is computed for the requesting user, so the same query serves any viewer. History pages, `around`, `after`, group detail `Messages`, WS `chat`/`group_chat` (new messages start with none) and the search jump window all reuse one repo helper `ReactionsForMessages(kind, ids []uint, viewerID uint)` doing ONE query per page (`WHERE message_kind=? AND message_id IN ?`, grouped in Go). This avoids N+1 and keeps pagination/`mergeMessages` working because the field travels with the message.
  - Who reacted: `GET /api/v1/chat/message/:id/reactions` and `GET /api/v1/group/:groupID/message/:messageID/reactions` -> `{reactions:[{emoji, users:[{telephon, username, avatarUrl}]}]}` (camelCase, new endpoint). Any participant/member may read it (unlike receipts, this is not sender-only).
  - Rejected alternative: a separate fetch per visible page (extra round trip + flicker + more state). Rejected: embedding the full user list in every message (payload bloat in big groups).
- **Interaction with existing features:**
  - Edit: reactions kept. Delete for everyone (soft delete): hide (queries filter on visible messages); rows are cleaned when the message is hard-deleted (disappearing-messages) or optionally on soft delete. Delete for me: unaffected.
  - Read receipts/ticks: unaffected (a reaction is not a read). Search: unaffected (text only). Pagination: aggregates ride with each page; the `mergeLatestWindow`/`focusedWindow` code in `frontend/src/features/dashboard/lib/mergeMessages.ts` and `focusedWindow.ts` must preserve `Reactions` when merging a refetched window (server value wins; a stale local optimistic value is replaced).
  - Leaving a group: the user's past reactions stay (like their messages).
  - Contact removal/block: no change (to verify no code path deletes 1:1 history).
- **Frontend state:** no new store; reactions live inside the message objects in `messagesByChat`, `groupMessages` and `focusedWindow` (`DashboardContext.tsx:242-249`, `:161`). A pure reducer `applyReaction(messages, event, myTelephon)` in `features/dashboard/lib/reactions.ts` (unit-tested) is applied to all three containers by a `reaction` WS handler. Optimistic update on send with rollback if the server replies with a WS `error` (`WsError`, `types/ws.ts`).
- **UI:** quick-reaction row rendered at the top of the existing Popover menu (`MessageList.tsx:227`, `GroupChatWindow.tsx:115`) plus a hover smile button next to the "Opciones" trigger (same reveal pattern, `MessageList.tsx:206`); long-press (touch, 400 ms) opens the same menu. Chips under the bubble (`ReactionChips` component, shared by 1:1 and group like `MessageTicks`), own reactions highlighted, tap toggles. Clicking the chip count opens a modal "Reacciones" listing users per emoji (pattern: `GroupMessageInfoModal.tsx`). Accessible names: `aria-label="Reaccionar con 👍"`, chips `aria-pressed`.

## Constraints
- TS strict with no `any`; M4b runtime guards for WS `reaction` payloads and the `Reactions` field (drop malformed entries, do not throw).
- Conventional Commits, no AI attribution, explicit pathspecs (`git reset -q` first). One commit per task with tests and docs.
- Never `go test -tags integration` against the shared stack. Never `docker compose down -v` unless intended.
- New fields are optional/omitempty: old clients and existing tests keep passing.

## TDD
Strict TDD (session config). Runners: `go test ./...`, `cd frontend && npm run test`, `make test-integration` (Go `-tags e2e`, stack up), `cd frontend && npm run test:e2e`. RED first for each task (missing symbols / failing assertion), then GREEN, then mutation checks on the critical rules (unique per user, replace-on-change, visibility predicate, single-emoji validation, fan-out targets).

## Tasks
- [x] RE1 Data + repo + service (no reactions on group system messages, `Kind='system'` -> 404; any single emoji via `uniseg`, max 32 bytes): `MessageReaction` model, AutoMigrate, unique/idx/CHECK migrations, repo (`UpsertReaction`, `DeleteReaction`, `ReactionsForMessages`, `ListReactionUsers`), service with visibility/membership checks and emoji validation, typed errors. Unit tests (mock repo like `services/mocks_test.go`), including replace-on-change and toggle-off. Route: delegated.
- [x] RE2 Aggregates in responses: add `Reactions` to `schemas.Message` and `GroupMessageResponse`, batch helper used by every history/window/detail path (find them: `HandlerGetChats` `handlerChat.go:56-125`, `HandleGetGroupMessages` `handlerGroup.go:262-332`, group detail, search around window). Tests assert one extra query per page and correct `Mine`. Route: delegated.
- [x] RE3 Transport: WS `react` handler + `reaction` event fan-out, REST PUT/DELETE/GET endpoints and routes, handler tests, Go e2e (`-tags e2e`): A reacts, B receives `reaction` over WS, replace, remove, non-member 403, invisible message 404. Route: delegated.
- [x] RE4 Frontend plumbing (includes the author notification: in-app toast "<name> reaccionó <emoji> a: <snippet>" when the viewer is the message author, not the reactor, the emoji is non-empty and that chat is not open): types (`types/api.ts`, `types/ws.ts`, `WsSend*`), guards/normalizers, `applyReaction` reducer, WS sender + listener in `api/websocket.ts`/`DashboardContext`, optimistic update + rollback, merge preservation in `mergeMessages`/`focusedWindow`. Vitest. Route: delegated.
- [x] RE5 UI: `ReactionPicker` (quick row), `ReactionChips`, who-reacted modal, wiring into 1:1 and group bubbles, long-press, aria labels. Component tests. Route: delegated.
- [x] RE6 Playwright: Ana reacts to Luis's message, Luis sees the chip live and after reload; Ana changes and removes the reaction; group variant with Marta; chip counts. Unique text per run, no absolute counts. Two green runs. Route: delegated.
- [ ] RE7 Close: full checks, doc + mirror.

## Acceptance criteria
- A user has at most one reaction per message; changing emoji replaces, repeating removes; state matches on all participants live and after reload, in both chat kinds.
- Invisible/foreign messages cannot be reacted to (404/403).
- Pagination, jump-to-message and search still work and keep reaction chips; no extra per-message queries.
- No `any`; `go test ./...`, typecheck, lint, test, build, `make test-integration`, `npm run test:e2e` green.

## Risks
- Payload/response growth on very large groups (aggregates are compact; user lists are lazy).
- Merge bugs dropping `Reactions` when windows are refetched (covered by RE4 tests).
- Orphan rows when messages are hard-deleted (handled by the disappearing-messages hook, or a periodic cleanup query).
- Touches every message list path: keep RE2 in its own reviewed commit.

## Open questions (user decision)
Resolved with the user on 2026-10-03 ("like WhatsApp"):
- **Emoji set:** quick row with the 6 fixed emojis (👍 ❤️ 😂 😮 😢 🙏) plus a "+" button that opens a full emoji picker. Backend accepts ANY single emoji (one grapheme cluster, validated with `uniseg` + emoji check), not an allowlist. Picker library to be chosen in RE5 after a bundle-size check (lazy-loaded).
- **Notify the author:** yes. The message author (never the reactor) gets a notification when someone reacts to THEIR message: in-app toast/notification "<name> reaccionó <emoji> a: <snippet>" when online and not viewing that chat; web-push hook added later by the `web-push` feature. Removing a reaction sends no notification.
- **Who reacted:** visible to everyone in the chat (1:1 and groups), as WhatsApp does.

## Progress / Evidence
- Delivery strategy: `ask-on-risk`. Forecast ~1500-2000 authored lines across RE1-RE6; RDD per work-unit commit with `--base-ref <last reviewed boundary> --committed-only`. First boundary: `dbb993e` (branch point).
- Route declarations: RE1-RE6 delegated (writer trigger: 2+ non-trivial files each); RE7 inline.
- RE1 (delegated, sonnet): `models/reaction.go`, `repos/reactionData.go` (`RepoReaction`: `DirectMessageTarget`, `GroupMessageTarget`, `IsGroupMember`, `UpsertReaction`, `DeleteReaction`, `ReactionsForMessages` one query, `ListReactionUsers`), `services/serviceReaction.go` (`SetReaction` -> `ReactionChange{AuthorID, OtherUserID, Removed...}`, `ListReactions`; in-service 10/s/user limit since no WS limiter exists), `services/reactionEmoji.go` (NFC + uniseg single grapheme + own Extended_Pictographic table, flags, keycaps; uniseg v0.4.7 has no public ExtPict property). RED: `undefined: models.ReactionTarget`. Mutations caught: membership skip, empty-emoji upsert, inverted `Mine`. `go build/vet/test ./...` green; migrations verified on the dev Postgres (`\d message_reactions`: unique, index, CHECK). Gap: SQL predicates only covered by RE3 e2e (no safe repo DB runner).

- RE1 review: RDD medium, granted, lens reliability approved, acknowledged (lineage `review-468721016b9d2783`). Advisory follow-ups folded into RE3: rate-limit map key never deleted; trailing Extend/ZWJ after the first pictograph accepted; no-op remove still reports a change (fan-out noise); repo SQL proven only by e2e.
- RE2 (delegated, sonnet): `schemas.ReactionSummary` + `Reactions,omitempty` on `Message`/`GroupMessageResponse`; `services/reactionAggregates.go` (`ReactionAggregator`, one call per page, system group messages excluded, nil-safe); optional variadic injection in `InitServiceMessage`/`InitServiceGroup`, wired in `app/app.go`. Covered: `ServiceGetMessagesPage`, `ServiceGetMessagesAround`, `ServiceGetMessagesAfter`, `ServiceGetAllChats` (one call for the flattened ids), `GetGroupMessagesPage`, `GetGroupDetail`, `GetGroupMessagesAround`, `GetGroupMessagesAfter`. Search returns snippets; jump uses the around window. Aggregate failure returns the error (a silent empty would make merged windows drop chips). RED: `too many arguments in call to InitServiceMessage`; mutations caught (skip group attach, per-message calls). `go test ./...` green; `make test-integration` green against the rebuilt app (aggregate SQL runs on every history call).
- RE2 review: RDD medium, granted, lens reliability approved, acknowledged (lineage `review-743d07b0d4afb932`). Advisory: aggregate failure now fails the whole page (deliberate, see `fetchReactions`); `Mine` correctness proven only by e2e (RE3); typed-nil aggregator (fixed in RE3).
- RE3 (delegated, sonnet). Contract consumed by RE4:
  - WS client->server `react` `{kind:"direct"|"group", messageID, groupID?, emoji}` (empty emoji removes).
  - WS server->client `reaction` `{kind, messageID, groupID?, telephon, username, emoji, authorTelephon, preview}` (`emoji:""` removed; `preview` <= 60 runes, media placeholders `📷 Photo`, `🎥 Video`, `🎤 Audio`, `Sticker`, `📎 File`, caption/text wins).
  - WS error `{type:"error", error, context:{action:"react", kind, messageID, groupID?, status}}` (status 400/403/404/429/500) for optimistic rollback.
  - Fan-out: 1:1 actor + other participant; group actor + `SendToGroup`. No-op (same emoji again, removing nothing) does not fan out (`ON CONFLICT ... DO UPDATE ... WHERE emoji <> excluded.emoji`, RowsAffected).
  - REST: `PUT|DELETE /api/v1/chat/message/:id/reaction`, `GET /api/v1/chat/message/:id/reactions`, `PUT|DELETE /api/v1/group/:groupID/message/:messageID/reaction`, `GET .../reactions` -> `{reactions:[{emoji, users:[{telephon, username, avatarUrl}]}]}`; PUT/DELETE -> `{kind, messageID, emoji, changed}` and publish the same WS event. 400/403/404/429 mapping.
  - Wiring: the reaction service travels on the Hub (`hub.SetReactionService`, `rt.hub.Reactions()` in `api.go`) because `routers/central.go`/`Deps` were outside the surface (follow-up: move to `Deps` if preferred).
  - Review follow-ups fixed: rate-limiter idle sweep, emoji tail validation (VS16, skin tones, ZWJ+pictograph, tag sequences, keycap), typed-nil guard in `ReactionsForMessages`.
  - Evidence: RED `undefined: models.ReactionActor` / `HandlerReaction`; mutations caught (drop `SendTo(other)`, drop `SendToGroup`, no-op fan-out). `go test ./...` green; `make test-integration` green with `TestE2EReactions` (WS+REST, replace, remove, no-op, Mine per viewer, 403, 404 incl. system message, error context).
- RE3 review: RDD medium, granted, lens reliability approved, acknowledged (lineage `review-a881284a385522c3`). WARNING fixed inline right after (`fix(reactions)` commit): `reactionRequest` returned ok=false without writing a response on wrong-typed/empty context values (gin answered 200 empty); now 400, test `TestReaction_InvalidContextValuesAreBadRequest` (RED: empty body). Advisory not fixed: a WS-originated reaction reaches only the actor's originating connection, not the actor's other sessions (REST reaches all via `SendTo`).
- RE4 (delegated, sonnet). Contract gap found by the writer (the parent decided option 1): the `reaction` event lacked the actor's previous emoji, so a replace or remove by another user could not be applied from aggregates. Backend now emits `previousEmoji` ("" when none). `UpsertReaction`/`DeleteReaction` return `(previous, changed)`: the upsert is one transaction (INSERT ON CONFLICT DO NOTHING, then SELECT FOR UPDATE + UPDATE; the same emoji is a no-op), and the delete is `DELETE ... RETURNING emoji`. e2e asserts `previousEmoji` on replace and removal.
  - Frontend: types plus `WsSendReact`, `WsErrorContext`; `api/reactionApi.ts` (`getReactions`); `normalizeReactions`/`normalizeReactionUsers`; `lib/reactions.ts`, where `applyReaction` sets state for me (from `Mine`, so echoes and duplicates are idempotent) and applies a delta for others (dec `previousEmoji`, inc `emoji`, never negative), plus `applyOptimisticReaction`, `restoreReactions` and the guards. `adoptServerReactions` in `mergeMessages` (prependOlder/extendOlder/extendNewer) makes the server value win. `DashboardContext` gets a `reaction` listener (1:1, groups, both windows) and `reactToMessage` (toggle + optimistic + send), with rollback on WS `error` where `context.action==="react"` restoring the pre-send snapshot. The author toast is "<name> reaccionó <emoji> a: <preview>" (`info`), shown only when the viewer is the author, is not the reactor, the emoji is non-empty and that chat is not open.
  - Evidence: RED (missing module, "no handler registered for reaction"). Mutations caught: dropping `adoptServerReactions`, the reactor-is-me toast guard, and a corrupt `PreviousEmoji`. Green: Go build/vet/test, `make test-integration` (14.1s), and typecheck, lint, test (74 files / 630 tests) and build.
  - Follow-ups (not fixed): the context calls `wsManager.sendReaction` directly instead of going through `useWebSocket` (changing it ripples into every context test mock). The pending snapshot clears on the first echo, so two rapid taps followed by an error on the second can't be fully rolled back. On the backend, `previousEmoji` assertions were added after the implementation (proven by mutation, no RED run).
- RE4 slice review (3d41f3d + 3228452): RDD medium, granted, lens reliability approved, acknowledged (lineage `review-f382bf773e36f3cd`). Its findings were fixed in a follow-up commit (`fix(reactions)`, delegated sonnet):
  - (W) Pending rollback state is now a per-message FIFO of my sends `{prevMine, at}`. An echo from me shifts one entry; a `react` error shifts one and reverts only my chip via `revertMine`/`setMine`, so other users' concurrent changes survive. Entries older than 15s are dropped.
  - (W) A WS no-op now echoes the `reaction` event to the actor's connection only (`emoji == previousEmoji == current`), never fanned out, so the queue always drains.
  - (S) The `UpsertReaction` insert is retried once when the row vanished between the conflict and `SELECT FOR UPDATE`.
  - (S) Added a test for the group `groupID` zero/wrong-type 400.
  - Evidence: RED for the no-op echo ("got 0"), two-taps/error, rollback-keeps-others, 15s cap. The mutation (whole-key delete on echo) was caught. Go build/vet/test and `make test-integration` are green, and the frontend matrix passes (637 tests).
- RE5 (delegated, sonnet):
  - Components in `components/reactions/`: `ReactionPicker` (quick row + "Más emojis"), `ReactionTrigger` (hover smile "Reaccionar"), `ReactionChips` (aria-pressed = Mine, "Ver reacciones"), `ReactionsModal` ("Reacciones", per-emoji filter, "Tú"), and `FullEmojiPicker` + `emojiPickerLoader`.
  - Hook `useLongPress` (400 ms, cancels on move). Wiring is in `MessageList.tsx` and `GroupChatWindow.tsx`; there is no reactions UI on system or deleted messages.
  - Picker library decided by the parent: `emoji-picker-element` ^1.29.1 + `emoji-picker-element-data` ^1.8.0, lazy `import()` on "+". Spanish i18n, data `es/cldr/data.json?url` served from our own origin (verified `200 application/json` through nginx after rebuilding `web`).
  - Bundle: Dashboard chunk +3.1 kB gzip (67.32 -> 70.41). Lazy loader 14.35 kB gzip; data 66.8 kB gzip.
  - Evidence: RED (unresolved imports, 12 wiring failures). Mutations caught: chip aria-pressed, wrong kind in MessageList, long-press move-cancel. typecheck/lint/test (81 files / 673)/build green.
  - Follow-up: in jsdom, CSS attribute selectors with emoji do not match; Playwright should use getByRole/getByLabel.
- RE5 slice review (64c2422 + b1db80a): RDD medium, granted, lens reliability approved, acknowledged (lineage `review-b412ca976cb4c078`). Follow-ups were fixed in a separate `fix(reactions)` commit (delegated, sonnet):
  - `useLongPress` suppresses the native `contextmenu` and swallows the ghost click after a fired press (RED observed, mutation caught).
  - The WS no-op echo serialization failure is now logged and answered with a `react` error context of status 500.
  - "No reactions UI on deleted messages" needed no change: delete-for-everyone removes the message from state in both lists (verified at `DashboardContext.tsx` handleDeleteMessage/handleGroupDeleteMessage), so there is no tombstone.
  - Not fixed: the `UpsertReaction` retry branch has no deterministic test (covered by e2e only; there is no DB-free repo runner).
- RE6 (delegated, sonnet), `frontend/e2e/reactions.e2e.ts`, with Ana/Luis/Marta and a group per run:
  - 1:1: live chip, the chip after reload, replace 👍 -> ❤️, removal for both.
  - Group: 😂 2 from Luis and Marta, and the "Ver reacciones" modal lists both.
  - Author toast "Luis reaccionó 🙏" while Ana views another chat.
  - Messages are sent through the UI, because a message sent by API is not in the sender's open view.
  - Spec 3/3, then full `npm run test:e2e` 17/17 twice (about 70s apart), after rebuilding app and web.

## Next step
RE7.
