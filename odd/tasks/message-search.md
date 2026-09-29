# Feature: message-search

## Objective
Message search in the style of WhatsApp.
- In-chat: 1:1 and group chats get a search bar with an "n of N" counter and up/down navigation. Navigating jumps to the hit even when it sits in an older page, and highlights it.
- Global: a sidebar search finds messages across all of the user's chats and groups. Results are grouped by chat, and clicking one opens that chat at the message.

## Problem / Why
The sidebar input only filters chat, contact and group names on the client (`Sidebar.tsx:140-192`). There is no message search, and no text index exists.

## Scope / Authorized
The user approved all 10 improvement ideas, including "Búsqueda dentro del chat, y la global por mensajes, con el full-text search de Postgres", and asked for this one explicitly. Scope: DB index, search APIs, around-window API, frontend detached window, in-chat UI, sidebar UI and Playwright.

## Decisions (orchestrator defaults)
- **Matching.** Use `pg_trgm` and `unaccent`. Create them via `execMigration` with `CREATE EXTENSION IF NOT EXISTS`. Add an IMMUTABLE wrapper `norm(text) = lower(unaccent(text))`, plus partial GIN trigram indexes on `norm(message)` over `deleted_at IS NULL AND COALESCE(media_type,'')=''` for both `messages` and `group_messages`.
  - Query shape: `norm(message) LIKE '%'||norm(q)||'%'`, with `%`, `_` and `\` escaped.
  - If the extension or function is missing (managed hosts), fall back to `lower(message) ILIKE`. Detect this once at startup and log it.
  - A tsvector with the `simple` config was rejected: it cannot do substrings or partial words.
- **Query rules.** The query needs at least 2 characters after trimming and at most 100. Media messages (non-empty `media_type`) are excluded.
- **Privacy.**
  - 1:1 uses the existing visibility predicate `(id_user=me AND NOT deleted_by_sender) OR (id_receptor=me AND NOT deleted_by_receiver)`, with no soft-deleted rows.
  - Groups are searched only when the user is an active member (`group_members.deleted_at IS NULL`). History visibility matches `GetGroupMessagesPage`, which applies no JoinedMessageID filter. Groups the user left are not searchable.
- **APIs** (camelCase, as with the other new endpoints). Results are ordered newest first by id and paginated with `before`.
  - `GET /api/v1/chat/:contact/search?q=&before=&limit=` returns `{results:[{messageID, time, snippet, highlights:[[start,end]]}], hasMore}`.
  - `GET /api/v1/group/:groupID/message/search?q=&before=&limit=` returns the same shape. Non-members get 403.
  - `GET /api/v1/search?q=&limit=` is the global search. It returns `{chats:[{kind:'direct'|'group', key (telephon|groupID), name, results:[...], total}]}`, capped per chat (default 3) and over all chats (default 20).
  - Snippets are about 80 characters around the first hit. Highlight offsets are computed in Go on the original text using rune indices, with accent-insensitive matching.
- **Around window.** Both history endpoints get an optional `around=<id>&limit=`, returning a window of about limit/2 messages on each side with `hasMoreOlder`/`hasMoreNewer`. They also get `after=<id>` for loading newer messages. 1:1 keeps the array body, with the hasMore flags sent as `X-Has-More-Older` / `X-Has-More-Newer` headers, and CORS exposes them. Groups add the flags to the JSON. The target must be visible to the user, otherwise 404. Default behavior without params is unchanged.
- **Frontend detached window.**
  - `focusedWindow[chatKey] = {messages, hasMoreOlder, hasMoreNewer, targetId}` lives outside `messagesByChat` and `groupMessages`, so `mergeLatestWindow` never sees it.
  - While detached, live messages go to the normal list only, and a button labelled "Ir a los mensajes recientes" clears the detached state.
  - `useLoadOlderOnScroll` gets a detached mode: no tail-scroll, `loadNewer` at the bottom, and a scroll-to-target with a temporary highlight (`data-message-id` on bubbles).
- **Sidebar search** is debounced at 300 ms and cancels stale requests (AbortController). Message results appear under the name matches in a "Mensajes" section.

## Constraints
- Branch: feat/message-search (from feat/group-read-receipts).
- TS strict with no `any`. Keep the M4b runtime guards.
- Never run `go test -tags integration` against the shared stack.
- Commits: Conventional Commits, no AI attribution, explicit pathspecs (`git reset -q` first).

## TDD
Strict TDD, per session config. Runners:
- `go test ./...`
- `make test-integration` (Go `-tags e2e`)
- `cd frontend && npm run test`
- `npm run test:e2e`

## Tasks
- [x] MS1 DB: extensions, the `norm` wrapper, trigram indexes, fallback detection. Repo search methods (per chat, per group, global) with the privacy predicates, wildcard escaping and media exclusion. Tests: pure helpers (escaping, snippet/highlight rune offsets, accent-insensitive) plus a Go e2e for accents, case, wildcard, per-user delete and non-member. Route: delegated.
- [x] MS2 Search APIs (service, handler, routes) with validation (2–100 chars) and 403 for non-members. Update mocks. Handler/service tests. Route: delegated.
- [x] MS3 Around/after window on both history endpoints plus CORS headers. Tests, including the target not being visible → 404. Route: delegated.
- [x] MS4 Frontend API + detached-window state (`openMessageAt`, `loadNewerFocused`, `loadOlderFocused`, `returnToLatest`) and the `useLoadOlderOnScroll` detached mode with scroll-to-target. Unit tests. Route: delegated.
- [x] MS5 In-chat search UI (1:1 header search button; group header search button beside the kebab): bar, counter, up/down, highlight, Escape to close (escape stack). Component tests. Route: delegated.
- [x] MS6 Sidebar global results: "Mensajes" section, grouped, snippets highlighted, click opens chat at the message. Tests. Route: delegated.
- [x] MS7 Playwright: an in-chat search that finds a message in an older page and jumps to it; a global search across a 1:1 chat and a group; the privacy check. Two green runs, then close with doc + mirror.

## Acceptance criteria
- Accent- and case-insensitive partial search finds messages in 1:1 and group chats, respects deletes and membership, and jumps to old messages without corrupting pagination or live updates.
- Existing endpoints behave the same without the new params.
- All suites are green, with no `any`.

## Progress / Evidence
- MS1 (delegated writer, sonnet): RED = utils search tests failed to compile pre-impl; GREEN `go test ./...`, `go vet ./...`, `make test-integration` ok (new `TestE2EMessageSearch`: accents/case/partial, literal `%`/`_`/`\`, media/soft-delete/per-user delete, pagination, group membership + leave, global grouping/caps, ILIKE fallback clause, planner uses `idx_messages_search_trgm`). Mutations (drop EscapeLike, drop membership check, drop snippet prefix shift) each make tests fail. Helpers in `backend/utils/search.go` (highlight offsets are relative to the returned snippet, which includes "…" when trimmed); repo methods in `backend/repos/searchData.go`; `norm()`+indexes in `database/postgres.go` `setupMessageSearch`; `golang.org/x/text` promoted to a direct dependency. Commit: see git log (`feat(search): ...`).
- MS2: RED = service/handler tests failed to compile before impl; GREEN `go test ./...`, `go vet ./...`, `make test-integration` (new `TestE2ESearchAPI` against rebuilt `app`: shape/highlights, 400 on <2 chars, 403 non-member, global grouped by kind with contact alias/group name, outsider sees nothing). Mutations (drop membership check, map 403->500, drop maxChats cap) each fail tests. New: `GET chat/:contact/search`, `GET group/:groupID/message/search`, `GET search?q&limit&perChat`; `services.ErrInvalidSearchQuery` -> 400, `ErrNotGroupMember` -> 403; global result also carries `avatarUrl`; chats ordered by newest hit time across 1:1+groups.
- MS3: RED = CORS test failed pre-change; service/handler/e2e-repo tests failed to compile / HTTP e2e failed before impl. GREEN `go test ./...`, `go vet ./...`, `make test-integration` (new `TestE2EHistoryWindows` on rebuilt `app`: window centering, edges/flags, hidden-for-me + soft-deleted skipped, foreign/invisible target -> 404, group member/outsider 403, headers via HTTP). Mutations (ignore `around`, 404->400, hasNewer off-by-one) each fail tests. Behavior: 1:1 `?around=`/`?after=` keep the array body + `X-Has-More-Older/Newer` (CORS exposed); groups `?around=`/`?after=` return `{messages, hasMore(=older), hasMoreOlder, hasMoreNewer}` (after: only `hasMoreNewer`). Decision: group window messages are CHRONOLOGICAL (oldest first), unlike the legacy newest-first page; `limit` default 50, max 100, half per side; `around` wins over `after`/`before`; legacy path unchanged without the params.
- MS4: RED = new specs (normalizeSearch, focusedWindow lib, searchApi/historyApi, context detached windows, hook detached mode) failed before impl. GREEN frontend `typecheck`, `lint`, `test` (55 files / 410 tests), `build`, no-`any` grep empty. Mutations killed: epoch guard removed, leave-chat clear removed, WS edit patch removed, hook detached branch off, bottom-trigger without `detached`, `composeFocusedMessages` ignoring `hasMoreNewer`. Design: `features/dashboard/api/{searchApi,historyApi}.ts` (runtime-guarded via `lib/normalizeSearch.ts`), `lib/focusedWindow.ts` (pure window ops + `composeFocusedMessages` appends live tail once the window reached the server tail), context exposes `focusedChat`/`focusedGroup` + `openMessageAt/loadOlderFocused/loadNewerFocused/returnToLatest` (per-key epoch discards stale responses; leaving a chat drops its window; WS edit/delete/read/delivered also patch the window); `useLoadOlderOnScroll` gained `detached/hasMoreNewer/loadingNewer/loadNewer/scrollTarget{id,seq}` (+ exported `FLASH_MS`, `data-search-flash` attr styled in `index.css`); bubbles carry `data-message-id`. Components still render the normal list: MS5 wires the detached rendering + "Ir a los mensajes recientes".
- MS5: RED = specs for ChatSearchBar, HighlightedText, useChatSearch, detached MessageList/GroupMessageList, ChatWindow/GroupChatWindow search wiring and own-message return failed before impl (searchHighlight spec was written together with its impl; covered by a mutation instead). GREEN frontend `typecheck`, `lint`, `test` (63 files / 465 tests), `build`, no-`any` grep empty. Mutations killed: accent folding, older/newer direction, min-length, stale-answer guard, Shift+Enter, return-to-latest button, left-group search button, own-message return-to-latest. UI: search icon in 1:1 header and beside the group kebab -> `ChatSearchBar` under the header (placeholder "Buscar", counter "n de N" / "N+" while more pages exist, "Sin resultados", up = older/anterior, down = newer/siguiente, Enter/Shift+Enter, Escape via escape stack); hits open the detached window, bubbles highlight the term (`<mark>` via accent-insensitive `searchHighlight`), "Ir a los mensajes recientes" button returns to the latest; sending a message while detached returns to latest automatically; closing the bar keeps the current position. Decision: no search button for groups the user left (backend only searches active members).
- MS6: RED = specs for `useGlobalMessageSearch`, `MessageSearchResults` and the Sidebar integration failed before impl. GREEN frontend `typecheck`, `lint`, `test` (66 files / 491 tests), `build`, no-`any` grep empty. Mutations killed: no abort of stale request, showing an older term's results while pending, search outside the Chats tab, not closing the sidebar for group hits, dropping the "+N más" note. Behavior: on the Chats tab, terms >= 2 chars (trimmed) trigger `GET /api/v1/search?limit=20&perChat=3` after 300 ms (the existing 200 ms name filter is untouched and stays above); a "Mensajes" section lists hits grouped by chat (contact alias/username, "Grupo" tag, snippets highlighted from the server offsets, time, "+N más" when the chat has more); clicking a hit (or the chat header = newest hit) selects the chat/group and calls `openMessageAt`; unknown group -> error toast; "Sin resultados" / "Buscando mensajes…" / error notes. The search is only active on the Chats tab (placeholder text unchanged to keep existing selectors).
- MS7: new `frontend/e2e/search.e2e.ts` (+ `support/api.ts`): (1) in-chat search finds a 1:1 message in an older page (210 fillers) with accent/case-insensitive term, "1 de 2"/"2 de 2" navigation, jump + `mark` + flash + viewport, live message (sent by Marta through the UI/WS) does not leak into the detached window and appears after "Ir a los mensajes recientes", Escape closes/clears marks, normal-list pagination still loads the old page; (2) global search groups 1:1 + shared group + private group, click opens chat/group at the message, privacy (Luis sees only the shared group; 403 on private group search/around; 404 on foreign 1:1 around); (3) group in-chat search + "Sin resultados". `npm run test:e2e` twice in a row: 11 passed / 11 passed, no retries. Found by e2e and fixed: sidebar result buttons reused `data-message-id` (renamed `data-result-id`); media (img/audio) loading after the jump shifted the layout so the target ended off-screen -> hook now recenters on `load`/`loadedmetadata` for `SETTLE_MS` (3 s) unless the user scrolls (specs added). Vitest 66 files / 493 tests, typecheck, lint, build ok, no-`any` grep empty. Open product questions: none blocking.
- Closure (2026-09-29, branch `feat/message-search`): MS1–MS7 verified done and reconciled against `git log` (e390135 MS1, c88c052 MS2, e4dac1c MS3, 3aaaf08 MS4, 57d7598 MS5, 192e76e MS6, 1e50c6d MS7, 6e6b073 roadmap docs); worktree clean (`git status --short --branch`). Closure suites re-run after the docs: `go test ./...`: ok (exit 0); `go vet ./...`: ok (exit 0); `cd frontend && npm run typecheck`: ok; `npm run lint`: ok; `npm run test`: 66 files / 493 tests passed; `npm run build`: ok; no-`any` grep over `frontend/src`: empty. `make test-integration` and `npm run test:e2e` NOT re-run this closure: MS7 already recorded the double-green e2e run (11 passed / 11 passed) and the docs change cannot affect them. Feature closed.

## Next step
Closed on 2026-09-29. Next feature in the roadmap: observability (`feat/observability`).

## Follow-up fixes (post-close)
- Norm probe + unknown contact (branch `feat/observability`): `norm()` detection now caches only a definitive result (probe success or SQLSTATE 42883) with a 3 s timeout ctx, and retries transient errors on later calls (RED: `normDetector` tests failed to compile; GREEN `repos` tests; mutation "cache on transient error" fails 5 assertions). Unknown `:contact` telephone: repo returns `models.ErrUserNotFound` (real DB errors stay wrapped), `respondSearchError` maps it to 404 (RED: handler tests failed to compile; GREEN handler/service tests + HTTP e2e 404 in `TestE2ESearchAPI`).
