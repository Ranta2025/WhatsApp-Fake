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
- [ ] MS5 In-chat search UI (1:1 header search button; group header search button beside the kebab): bar, counter, up/down, highlight, Escape to close (escape stack). Component tests. Route: delegated.
- [ ] MS6 Sidebar global results: "Mensajes" section, grouped, snippets highlighted, click opens chat at the message. Tests. Route: delegated.
- [ ] MS7 Playwright: an in-chat search that finds a message in an older page and jumps to it; a global search across a 1:1 chat and a group; the privacy check. Two green runs, then close with doc + mirror.

## Acceptance criteria
- Accent- and case-insensitive partial search finds messages in 1:1 and group chats, respects deletes and membership, and jumps to old messages without corrupting pagination or live updates.
- Existing endpoints behave the same without the new params.
- All suites are green, with no `any`.

## Progress / Evidence
- MS1 (delegated writer, sonnet): RED = utils search tests failed to compile pre-impl; GREEN `go test ./...`, `go vet ./...`, `make test-integration` ok (new `TestE2EMessageSearch`: accents/case/partial, literal `%`/`_`/`\`, media/soft-delete/per-user delete, pagination, group membership + leave, global grouping/caps, ILIKE fallback clause, planner uses `idx_messages_search_trgm`). Mutations (drop EscapeLike, drop membership check, drop snippet prefix shift) each make tests fail. Helpers in `backend/utils/search.go` (highlight offsets are relative to the returned snippet, which includes "…" when trimmed); repo methods in `backend/repos/searchData.go`; `norm()`+indexes in `database/postgres.go` `setupMessageSearch`; `golang.org/x/text` promoted to a direct dependency. Commit: see git log (`feat(search): ...`).
- MS2: RED = service/handler tests failed to compile before impl; GREEN `go test ./...`, `go vet ./...`, `make test-integration` (new `TestE2ESearchAPI` against rebuilt `app`: shape/highlights, 400 on <2 chars, 403 non-member, global grouped by kind with contact alias/group name, outsider sees nothing). Mutations (drop membership check, map 403->500, drop maxChats cap) each fail tests. New: `GET chat/:contact/search`, `GET group/:groupID/message/search`, `GET search?q&limit&perChat`; `services.ErrInvalidSearchQuery` -> 400, `ErrNotGroupMember` -> 403; global result also carries `avatarUrl`; chats ordered by newest hit time across 1:1+groups.
- MS3: RED = CORS test failed pre-change; service/handler/e2e-repo tests failed to compile / HTTP e2e failed before impl. GREEN `go test ./...`, `go vet ./...`, `make test-integration` (new `TestE2EHistoryWindows` on rebuilt `app`: window centering, edges/flags, hidden-for-me + soft-deleted skipped, foreign/invisible target -> 404, group member/outsider 403, headers via HTTP). Mutations (ignore `around`, 404->400, hasNewer off-by-one) each fail tests. Behavior: 1:1 `?around=`/`?after=` keep the array body + `X-Has-More-Older/Newer` (CORS exposed); groups `?around=`/`?after=` return `{messages, hasMore(=older), hasMoreOlder, hasMoreNewer}` (after: only `hasMoreNewer`). Decision: group window messages are CHRONOLOGICAL (oldest first), unlike the legacy newest-first page; `limit` default 50, max 100, half per side; `around` wins over `after`/`before`; legacy path unchanged without the params.
- MS4: RED = new specs (normalizeSearch, focusedWindow lib, searchApi/historyApi, context detached windows, hook detached mode) failed before impl. GREEN frontend `typecheck`, `lint`, `test` (55 files / 410 tests), `build`, no-`any` grep empty. Mutations killed: epoch guard removed, leave-chat clear removed, WS edit patch removed, hook detached branch off, bottom-trigger without `detached`, `composeFocusedMessages` ignoring `hasMoreNewer`. Design: `features/dashboard/api/{searchApi,historyApi}.ts` (runtime-guarded via `lib/normalizeSearch.ts`), `lib/focusedWindow.ts` (pure window ops + `composeFocusedMessages` appends live tail once the window reached the server tail), context exposes `focusedChat`/`focusedGroup` + `openMessageAt/loadOlderFocused/loadNewerFocused/returnToLatest` (per-key epoch discards stale responses; leaving a chat drops its window; WS edit/delete/read/delivered also patch the window); `useLoadOlderOnScroll` gained `detached/hasMoreNewer/loadingNewer/loadNewer/scrollTarget{id,seq}` (+ exported `FLASH_MS`, `data-search-flash` attr styled in `index.css`); bubbles carry `data-message-id`. Components still render the normal list: MS5 wires the detached rendering + "Ir a los mensajes recientes".

## Next step
MS1–MS7 via one Sonnet writer, one commit per task.
