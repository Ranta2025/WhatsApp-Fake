# Feature: api-casing

## Objective
Unify the JSON contract (REST bodies/responses and WebSocket payloads) on **camelCase**, with a temporary compatibility window so nothing breaks while the frontend, cached old bundles, tests and tooling move over. End state: one casing, no shim, contract guarded by tests.

## Problem / Why
The wire format mixes three casings, documented (as a known wart) at the top of `frontend/src/types/api.ts:1-6` and `frontend/src/types/ws.ts`:
- **PascalCase** (Go fields without a json tag or with a PascalCase tag): chat, group, status and user schemas.
- **camelCase**: call logs, search, group receipts, request bodies of newer endpoints, `hasMore*`, most WS payload keys.
- **snake_case**: `avatar_url`, `wallpaper_url`, `last_seen`, `contact_name`, `user_email`, `screen_size`, `old_username`, `new_username`.
The mix costs every new feature a "which casing?" decision and forces hand-written normalizers/guards in the frontend.

## Scope / Authorized
Approved roadmap item, plan only (NOT authorized to implement yet). Casing only: **no field renames beyond casing, no value changes, no new fields, no behavior changes**. Any semantic rename (for example `Gmail` vs request `email`, `Number` vs `telephon`) is out of scope and listed as an open question. Untouched: URL paths, query params, header names (`X-Has-More*`), DB columns and `gorm` tags, cookies, third-party payloads (GitHub issue body in `models/bugReport.go:15-19`, ZegoCloud tokens).

## Dependencies / ordering (READ FIRST)
- **Recommendation: do it LAST**, after all other pending features (web-push, pwa, reactions, disappearing-messages, observability) and preferably after the feature branches have been merged to `main`. Why:
  1. It touches every schema, handler, WS payload, frontend type, ~30 frontend source files plus ~27 test files, the e2e support code and 7 Go integration test files (counts below). Doing it first would force every later feature branch (chained, unpushed) to rebase over renamed fields, and new features would have to be written against a moving contract.
  2. Later features add fields to existing schemas. Rule until this lands: fields added INSIDE an existing PascalCase schema stay PascalCase (precedent: `JoinedMessageID`, `LastReadMessageID` in `backend/schemas/schemaGroup.go`), brand-new endpoints/events are camelCase. The inventory test below (AC0) reflects over the schemas, so those late additions are picked up automatically.
  3. `pwa` makes the compatibility window mandatory: a service-worker-cached old bundle keeps speaking the legacy casing after a deploy (`odd/tasks/pwa.md`). The window length should cover at least the SW update cycle.
- Alternative (do first): only worthwhile if the user wants a clean contract before adding features; costs are the rebases above.
- Blast radius is LARGE: **one reviewed commit per domain** (below), never one big-bang commit. Each domain commit contains backend enablement + frontend rename + tests + e2e helper updates for that domain only.
- Branch: `feat/api-casing` from the latest feature branch (or from `main` if the chain is merged). Branches are chained and unpushed; check `git branch --show-current` first.

## Inventory (verified against the code; file:line)
### Backend response shapes
- **auth/user** — `schemas.UserGet` (`backend/schemas/schemauser.go`): `Username`, `Telephon`, `Gmail` (no json tags -> PascalCase), `avatar_url`, `wallpaper_url` (snake). Returned by `GET /api/v1/user` (`handlers/handlerContact.go:47`). Other user responses: `PUT user` `{message: user}` (`:94`), `PUT profile/avatar` `{message, avatar_url}` (`:209`), `PUT profile/wallpaper` `{message, wallpaper_url}` (`:238`), `PUT contact/wallpaper` (`:268`). Auth endpoints (`handlers/HandlerUser.go`) return only `message` (+ `username` at `:222`, already fine). Request bodies: `models/user.go:11-13,18` (`username`, `email`, `numero`, `password`), `models/json.go:4-9,51-69` (`username`, `password`, `code`, `email`).
- **contacts** — `models.ContactChat` (`backend/models/contact.go:21-29`): `Username`, `Number`, `Status`, `ContactName` (untagged -> PascalCase) + `last_seen`, `avatar_url`, `wallpaper_url` (snake). Returned by `GET contact` (`handlerContact.go:152`), and wrapped as `{contact: ...}` by `POST contact` (`:125`) / `PUT contact` (`:180`). Request bodies `contact_name` (`models/json.go:14,74`).
- **chat 1:1** — `schemas.Message`, `schemas.ChatGroup` (`schemas/schemaMessage.go`), all explicit PascalCase tags (`MessageID`, `SenderTelephon`, `Receptor`, `Message`, `Status`, `Time`, `Edited`, `MediaUrl`, `MediaType`, `ReplyTo*`; `ContactTelephon`, `ContactUsername`, `ContactName`, `ContactAvatarUrl`, `IsContact`, `Messages`). Endpoints: `GET chat/:contact` (`handlers/handlerChat.go:82,93,122`, array body), `GET chats` (`:195`), `PUT chat/edit` (`:259`), `DELETE message/:id/me` (`:300`), `POST chat` `{message}` (`:50`). `SearchPage` is already camelCase (`schemaSearch.go`).
- **groups** — `schemas.GroupResponse`, `GroupMemberResponse`, `GroupMessageResponse`, `GroupDetail` (`schemas/schemaGroup.go`): PascalCase (`ID`, `Name`, `AvatarUrl`, `CreatorTelephon`, `MemberCount`, `UserRole`, `CreatedAt`, `Members`, `Messages`, `JoinedMessageID`, ...). Already camel: `GroupReceiptUpdate`, `GroupMemberBrief`, `GroupMessageReceipts`. Wrappers: `{group}` (`handlers/handlerGroup.go:107`), `{groups}` (`:129`), `{messages, hasMore, hasMoreOlder, hasMoreNewer}` (`:294-330`, camel), `{message: msg}` (`:258,409`), `{avatarUrl}` (`:478`, camel).
- **status** — `schemas.StatusItem`, `StatusOwnerBrief`, `StatusContactGroup`, `StatusFeed`, `StatusViewer` (`schemas/schemaStatus.go`): PascalCase. Wrappers `{status}` (`handlers/handlerStatus.go:86`), `{viewers}` (`:160`). Request `models/status.go:41-45` camelCase.
- **calls** — `schemas.CallLogResponse` (`schemas/schemaCall.go`) already camelCase; `{calls}` (`handlers/handlerCall.go:78`), `{token, appID, userID}` (`:53`) already camel. Verify only.
- **media/search/bug-report/misc** — upload result camel (`handlers/handlerMedia.go:54`); search camel; bug report request `user_email`, `screen_size` (`models/bugReport.go:9-12`, frontend `types/api.ts:346-356`); `ws-ticket` `{ticket}` (`routers/central.go:80`); errors `{error}` everywhere (single word, keep).
### WebSocket payloads (server -> client)
Envelope `{type, payload}` stays. Payload contents:
- Legacy PascalCase (reuse schemas): `chat`, `edit_message`, `delete_message` (`schemas.Message`, `websocket/message_handlers.go:83-86,145-148,175-178`), `group_chat`, `group_edit_message` (`GroupMessageResponse`, `:322-325,380-383`), `group_delete_message` `{MessageID, GroupID}` (`:412-418`, hand-built PascalCase), `group_added` (`GroupResponse`), `status_new` `{owner, status}` (`handlers/handlerStatus.go:77-81`, inner objects PascalCase).
- Snake: `offline.last_seen` (`websocket/hub.go:281-287`), `avatar_changed.avatar_url` (`:369-373`), `username_changed.old_username/new_username` (`:342-347`).
- camelCase already: `online`, `contacts_online.contacts`, `read.from`, `typing.from`, `message_delivered.receiver` (`handlers/handlerChat.go:221-224`, `websocket/handler.go:81-86`), call events, `group_typing`, `group_member_added`, `group_avatar_update`, `group_member_left`, `group_receipt`, `status_viewed` `{statusId, viewer(Pascal), viewedAt, viewCount}` (`handlerStatus.go:128-134`), `status_deleted` `{ownerTelephon, statusId}` (`:182-186`).
- Inconsistency to normalize in the same pass: `statusId` vs the dominant `...ID` (`messageID`, `groupID`, `roomID`, `replyToMessageID`).
- Client -> server payloads are already camelCase (`chat`, `edit_message`, `group_*`, `call_*` bodies in `models/json.go`); no change except aliases for the snake request bodies above.
### Frontend
- Contract types: `frontend/src/types/api.ts` (whole file), `frontend/src/types/ws.ts`, WS send types in the same file; runtime guards/normalizers `frontend/src/features/dashboard/lib/normalizeResponses.ts` (`normalizeGroupsResponse`, `normalizeGroupMessagesResponse`, `normalizeGroupDetailMessages`, `normalizeChatMessagesResponse` — reads `MessageID`, `normalizeHasMore`, `normalizeGroupReceipts`), `lib/groupReceipts.ts`, `lib/mergeMessages.ts`, `lib/focusedWindow.ts`, `lib/chatSelection.ts`, `lib/normalizeSearch.ts`.
- API wrappers: `frontend/src/api/axios.ts` (instance, refresh interceptor), `api/groupApi.ts`, `api/statusApi.ts`, `api/websocket.ts` (`WsHandlerMap`, ws URL built at `:191` with `?ticket=`).
- Consumers: 29 non-test source files reference the core PascalCase fields (`MessageID|SenderTelephon|Telephon|GroupID|MediaUrl`), about 570 occurrences of the wider PascalCase field set; 27 test files. Biggest: `features/dashboard/context/DashboardContext.tsx`, `MessageList.tsx`, `GroupChatWindow.tsx`, `Sidebar.tsx`, `ProfileModal.tsx`, `usePresence.ts`, `context/authUser.ts`.
- Non-frontend consumers of the legacy shape: Playwright helpers (`frontend/e2e/support/api.ts`, `frontend/e2e/pagination.e2e.ts`, `support/chat.ts`) and 7 Go integration files under `backend/integration/` (`e2e_test.go`, `e2e_group_receipts_test.go`, `e2e_window_test.go`, `e2e_search_api_test.go`, `e2e_search_test.go`, `e2e_status_test.go`, `integration_test.go`), plus handler/service tests and mocks in `backend/handlers`, `backend/services`, `backend/websocket`.

## Decisions (recommended defaults)
- **Naming rules** (document in `docs/API_CONTRACT.md`, new file): lowerCamelCase; acronyms `ID` stay uppercase after the first word (`messageID`, `groupID`, `replyToMessageID`), a lone `ID` becomes `id`; `Url` (not `URL`) as already used (`mediaUrl`, `avatarUrl`); snake_case words split on `_` (`avatar_url` -> `avatarUrl`, `last_seen` -> `lastSeen`, `contact_name` -> `contactName`, `old_username` -> `oldUsername`); `statusId` -> `statusID`. Implement as a single pure function `casing.ToCamel(key)` with an explicit exceptions table, unit-tested against every key in the inventory.
- **Strategy: negotiated shim (one shape per client), not per-field dual-emit.** Dual-emitting both keys doubles payload on the biggest responses (history pages, group detail, search) and does not remove the need for a second cleanup pass. Instead:
  - Client opts in with header `X-API-Casing: camel` on REST and `?casing=camel` on the WS URL (browsers cannot set WS headers; the ticket flow is at `api/websocket.ts:172-191`, upgrade in `routers/central.go:52`). No opt-in = legacy shape, unchanged.
  - **CORS:** the header must be added to `AllowHeaders` in `backend/config/cors.go:99-105` (otherwise cross-origin deployments with a separate frontend, see `frontend/vercel.json`, fail preflight). Add a test in `config/cors_test.go`.
  - **REST:** Gin middleware `casing.Middleware(enabledDomains)` wraps `gin.ResponseWriter`, and for `Content-Type: application/json` responses on routes whose domain is enabled, decodes with `json.Decoder.UseNumber()`, recursively rewrites object keys with `ToCamel`, re-encodes. Applies equally to `JSON` and `IndentedJSON`. Never touches arrays' element values, only object keys; never touches string values. Skips non-2xx? (no: error bodies are `{error}`, unaffected anyway).
  - **WS:** the hub sends pre-marshaled bytes to many clients (`Hub.SendTo`, `SendToGroup`, `sendToMany`, `hub.go:132,207,293`), so transform per recipient in `Client.writePump` (`backend/websocket/cliente.go:146-165`) when `Client.camel` is set and the event `type` belongs to an enabled domain; cache the transformed bytes per (payload pointer, mode) only if profiling shows a need. Client -> server payloads are read through struct tags, so requests need aliases instead: for the few snake request fields (`contact_name`, `user_email`, `screen_size`) add camel aliases via `UnmarshalJSON` on those structs (accept both), while `numero`/`email`/`username`/`password` stay as they are (open question).
  - **Per-domain enablement** is a Go map in `backend/casing/domains.go`: route prefix -> domain and WS event type -> domain. The frontend sends the header from day one; a domain is only transformed once its slice enables it, so slices land independently and each slice atomically flips backend + frontend for that domain.
  - After all domains are enabled and shipped for one full window: flip the default to camel (legacy becomes opt-in via `X-API-Casing: legacy`), then remove the legacy path and rewrite the struct tags natively (final cleanup task), deleting the shim.
- **Alternative rejected:** big-bang rename of tags (breaks cached bundles/tests at once); pure per-field dual-emit (payload x2, custom `MarshalJSON` on ~25 structs).
- **Frontend rename tooling:** let `tsc` (strict) drive it. Rename interface properties with the TS language server rename (LSP `rename`) per domain, then fix runtime guards and string-key accesses that the compiler cannot see (`normalizeResponses.ts` reads keys by string: `Messages`, `MessageID`; WS handlers in `DashboardContext.tsx`; e2e support code). Search each domain's old keys with `rg` after the rename to prove none remain.

## Constraints
- TS strict with no `any`; keep the M4b runtime-guard principle.
- Casing-only diffs: reject any semantic change in these commits.
- Conventional Commits, no AI attribution, explicit pathspecs (`git reset -q` first). One reviewed commit per domain; each commit exceeds the ~400-line heuristic by nature (mechanical renames): state that in the commit body and split test-only updates if useful; follow the `chained-pr` skill for the PR slices.
- Never `go test -tags integration` against the shared stack. Never `docker compose down -v` unless intended.
- Run the whole matrix (Go tests, typecheck, lint, vitest, build, `make test-integration`, `npm run test:e2e` twice) at the end of EVERY domain slice, not only at the end.

## TDD
Strict TDD (session config). Runners: `go test ./...`, `cd frontend && npm run test`, `npm run typecheck`, `make test-integration`, `cd frontend && npm run test:e2e`.
Contract-test design:
1. **Golden contract tests (backend)**: `backend/casing/contract_test.go` marshals a representative sample of EVERY schema/response/WS payload (fixtures next to it in `testdata/contract/*.legacy.json` and `*.camel.json`) and asserts (a) legacy output equals the current golden (guards against accidental drift during the window) and (b) camel output equals the camel golden. A reflection-based inventory test walks all struct types registered in a list and fails if a field's key is missing from the goldens, so new fields added by later features are forced into the contract.
2. **Middleware tests**: header absent -> byte-identical to today; header present + domain enabled -> camel; header present + domain not enabled -> legacy; non-JSON and streaming untouched; large ids preserved (`UseNumber`); nested arrays/objects.
3. **WS tests**: per-client casing on the same broadcast (one camel client, one legacy client receive different bytes from one `SendToGroup`).
4. **Go e2e (`-tags e2e`)**: each domain endpoint with and without the header.
5. **Frontend**: Vitest for guards/normalizers on camel fixtures; a type-level test file (`tsc`) asserting the types match sample JSON fixtures shared with the backend goldens (copy the golden camel JSON into `frontend/src/test-fixtures/` via a small script or a test that reads `../../backend/casing/testdata/contract`).
6. **Playwright**: existing specs are the regression net; update helpers in `e2e/support/api.ts` per domain.

## Tasks
- [ ] AC0 Freeze current behavior: golden legacy fixtures for every response/WS payload + reflection inventory test; no production code change. Route: delegated.
- [ ] AC1 Shim core: `backend/casing` (`ToCamel`, exceptions table, unit tests), REST middleware with domain enablement, WS per-client transform in `writePump` + `Client.camel` from `?casing=camel` at upgrade, CORS `AllowHeaders`, request alias structs. All domains disabled. Route: delegated.
- [ ] AC2 Frontend plumbing: axios default header `X-API-Casing: camel`, WS URL param, keep everything working (all domains still legacy). Tests for the header/URL. Route: delegated.
- [ ] AC3 Domain user/auth/contacts: enable in backend, rename `UserGet`, `ContactChat`, profile responses, WS `online/offline/username_changed/avatar_changed` payloads, request alias for `contact_name`; frontend types, `authUser.ts`, `ProfileModal.tsx`, `usePresence.ts`, DashboardContext contact/presence code; e2e helpers. Route: delegated. (One commit.)
- [ ] AC4 Domain chat 1:1: `Message`, `ChatGroup`, chat WS events, `normalizeChatMessagesResponse`, `mergeMessages`, `focusedWindow`, `MessageList`, search jump code paths, e2e chat/pagination helpers, Go integration files for chat. Route: delegated. (One commit; largest slice.)
- [ ] AC5 Domain groups: `Group*` schemas, wrappers, `group_*` WS events (`group_delete_message`), `groupReceipts.ts`, `normalizeResponses.ts` group parts, `GroupChatWindow.tsx`, `groupApi.ts`, e2e/integration group files. Route: delegated. (One commit.)
- [ ] AC6 Domain status: `Status*` schemas, `status_*` events (`statusId` -> `statusID`), `statusApi.ts`, status feature components, e2e status. Route: delegated. (One commit.)
- [ ] AC7 Leftovers: bug-report request aliases (`user_email`, `screen_size`), calls/media/search verification, `docs/API_CONTRACT.md` (rules, table old -> new, deprecation dates). Route: delegated.
- [ ] AC8 Flip default to camel + `legacy` opt-out, update goldens; ship and wait the window. Route: inline (small) after the window is agreed.
- [ ] AC9 Remove the shim: struct tags natively camelCase, delete `backend/casing` middleware/transform and the header/param handling, frontend stops sending the header, remove legacy goldens. Only after the window expires. Route: delegated.
- [ ] AC10 Close: full matrix twice, doc + mirror.

## Acceptance criteria
- Every JSON key emitted by the API and WS is camelCase by the end; no snake_case or PascalCase remains (checked by the inventory test).
- During the window: old clients (no header) get byte-identical legacy payloads; new clients get camel; both work concurrently (covered by tests).
- No behavior change: e2e specs pass unchanged apart from key names.
- No `any`; `go test ./...`, typecheck, lint, vitest, build, `make test-integration`, `npm run test:e2e` green after each slice.

## Risks
- **Huge blast radius** across backend, frontend, tests and tooling; mitigated by domain slices, goldens and tsc-driven renames.
- Runtime string-key accesses the compiler cannot catch (normalizers, WS handlers, e2e helpers): covered by the golden/type-fixture tests and a final `rg` for old keys.
- Perf: response rewrite and per-client WS rewrite add JSON re-encoding; history pages are small (<=200 messages) but measure; the shim is temporary.
- Stale cached bundles after deploy (see `pwa`): keep the window at least one SW update cycle.
- Merge conflicts with any feature developed in parallel: do not run in parallel with other feature work.
- Partial enablement mistakes (a domain flipped in backend but not renamed in frontend): the per-domain single-commit rule and full matrix per slice.

## Open questions (user decision)
- **Open question (user decision):** order. Recommended: last (see above). Alternative: first, accepting rebases of all later branches.
- **Open question (user decision):** semantic renames while touching keys (`Gmail` -> `email`, `Number` -> `telephon`, `numero` -> `telephon`). Recommended: NO in this feature; casing only. They can follow as a separate feature with the same shim.
- **Open question (user decision):** compatibility window length. Recommended: at least two weeks after the frontend switch (covers PWA cache); or "until the user says so".
- **Open question (user decision):** negotiation mechanism. Recommended: `X-API-Casing` header + `?casing=camel` for WS. Alternative: URL versioning `/api/v2/`, which is cleaner but duplicates routes.

## Progress / Evidence
(not started)

## Next step
Do not start until the other pending features are merged; first task AC0 (goldens), which is safe to do at any time.
