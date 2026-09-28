# Feature: Status (stories) + read-receipt icon + frontend render audit

## Objective
Add WhatsApp-style statuses end-to-end, make delivered/read ticks legible, then audit the
whole frontend for render problems (overlays/dropdowns not on top, broken chat layout, etc.).

## Problem / Why
- Double ticks are drawn as two almost-overlapping paths (`MessageList.jsx:111-144`) and read as one.
- No status/stories feature exists (greenfield).
- User reported general render problems: dropdown panels not in the foreground, chats.

## Scope / Authorized
- Frontend tick icon redesign (sent / delivered / read / pending).
- Backend: models, AutoMigrate, repo, service, handler, routes `/api/v1/status`, WS events,
  24h expiry (query filter + periodic cleanup), view tracking.
- Frontend: "Estados" sidebar tab, list (mine + contacts, seen/unseen), composer
  (text with background color, image, video with caption), full-screen viewer with progress
  bars, viewers list for own statuses, delete own status, real-time updates.
- Full frontend render audit and fixes.

## Product decisions (user)
- Visibility: **mutual contacts** only (A sees B's status iff A has B accepted AND B has A accepted), as WhatsApp.
- UI copy in Spanish (existing project language).

## Constraints
- Follow existing layering: models → repos → services → handlers → routers/api; composition in `backend/app/app.go`.
- Media reuses `POST /api/v1/upload` + MinIO (`/storage/...` via nginx).
- Current user id = `ctx.Get("telephon")`.
- ~400 authored lines per task is advisory only.

## TDD
- Mode: strict, enabled (source: user global config "Strict TDD Mode: enabled").
- Backend runner: `go test ./...` (testify + mocks, colocated `*_test.go`).
- Frontend: no test runner until T3b, which added Vitest (`npm run test`) for pure logic (reducers/format); component/DOM-effect behavior still checked via `npm run lint` + `npm run build`.

## Delivery
- Branch: `feat/status-stories`. Strategy: ask-on-risk. Forecast > 400 lines → slices per task.
- RDD: on (global). Assess each work-unit commit.

## Tasks
- [x] T1 Tick icon redesign — route: inline (1 mechanical file) — commit 0d7d908; eslint ok; RDD assess: medium, under_budget (pending in slice)
- [x] T2 Backend status feature (TDD) — route: delegated writer (2+ non-trivial files) — commit 8dc9ad9; go vet/test/build ok (spot-checked); live smoke vs Postgres ok (create, validation, feed, views idempotent, owner-only viewers/delete, non-mutual → hidden + 403). RDD: medium, slice_budget_reached → review granted (lineage review-642e7822c131d198, lens reliability) → APPROVED, acknowledged; boundary now 4af3347.
- [x] T2b Backend hardening from advisory review findings — route: delegated writer. All 8 findings fixed with RED→GREEN TDD:
  - R3-status-auth-error-code-masks-infra-failures / R3-create-status-all-errors-400 (handlerStatus.go): typed sentinels `services.ErrStatusInvalid/ErrStatusForbidden/ErrStatusNotFound` (`statusErr` wrapper preserving `errors.Is` + a specific public message), mapped by new `respondStatusError` (400/403/404/500, infra errors logged server-side and never leaked in the 500 body). Tests: `TestHandlerCreateStatusValidationErrorIs400`, `TestHandlerCreateStatusInfraErrorIs500NotMasked`, `TestHandlerMarkStatusViewed{Forbidden,NotFound,InfraErrorIs500NotMasked}`, `TestHandlerGetStatusViewers{Forbidden,InfraErrorIs500NotMasked}`, `TestHandlerDeleteStatus{NotFound,InfraErrorIs500NotMasked}` — RED (400/403 instead of 500, or stale gorm-based mapping) → GREEN.
  - R3-mark-viewed-error-after-persist (serviceStatus.go): once `CreateStatusView` persists, `GetTelephonByID`/`GetViewCounts`/`GetUsersBasicByIDs` failures are logged and return success (skip WS notify) instead of failing the request. Tests: `TestMarkStatusViewedPostPersistLookupFailureStillSucceeds`, `TestMarkStatusViewedPostPersistViewCountFailureStillSucceeds` — RED (returned the raw error) → GREEN.
  - R3-delete-notfound-mapping-unproved (serviceStatus.go): non-owner/missing delete now explicitly maps repo `gorm.ErrRecordNotFound` → `ErrStatusNotFound` (404, doesn't reveal ownership) via `translateStatusLookupErr`. Tests: `TestDeleteStatusNonOwnerOrMissingMapsToErrStatusNotFound`, `TestDeleteStatusSuccessNotifiesMutualContacts` — RED → GREEN.
  - R3-getfeed-untested (serviceStatus.go): added `TestGetFeedGroupsAndOrdersUnseenFirstThenMostRecent` and `TestGetFeedOrdersMostRecentFirstWithinSameSeenState` covering grouping, AllViewed, LastUpdated, unseen-first/most-recent ordering, Mine ViewCount, ContactName. Both passed against existing logic (no bug found; behavior now regression-proof).
  - R3-mutual-contact-sql-unproved (statusData.go): new `backend/integration/e2e_status_test.go` (`//go:build e2e`), run against the live stack (`docker ps` confirmed app/postgres/redis/nginx healthy) with `POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=5432 ... E2E_BASE_URL=http://localhost go test -tags e2e ./backend/integration/`: `TestE2EStatusMutualVisibility` — mutual contact sees the status; one-directional contact does NOT see it and gets 403 on view; view is idempotent (single viewer entry). All 3 subtests PASS; test users/contacts/statuses cleaned up in `t.Cleanup` (verified 0 rows left in Postgres afterward). Existing `TestE2E` still passes unmodified.
  - R3-cleanup-loop-untested (app.go): `statusCleanupLoop` now runs one cleanup immediately at startup (not just on first tick), via extracted `runStatusCleanup`; interval was already injectable. Test: `TestStatusCleanupLoopRunsAtStartupThenPerTickSurvivesErrorsAndStopsOnCancel` (fake `StatusServicer`, first call errors, verifies immediate call, per-tick call, and no further calls after `cancel()`) — RED (no immediate call) → GREEN.
  - R3-status-id-lenient-parse (middlewareStatus.go): replaced `fmt.Sscanf("%d")` (silently accepted trailing garbage, e.g. "12abc"→12) with `strconv.ParseUint(id, 10, 63)` requiring the whole string to be digits, rejecting 0/invalid/overflow/negative. New `backend/middleware/middlewareStatus_test.go` (7 tests) — RED (trailing-garbage case) → GREEN.
  - Verification: `go vet ./...` clean, `go build ./...` clean, `go test ./...` all green (includes app, handlers, middleware, services, repos, etc.), plus both e2e tests green against the live stack.
- [x] T3 Frontend status feature — route: delegated writer (2+ non-trivial files). Files: api/statusApi.js (new); features/status/context/StatusContext.jsx (new, WS-wired); features/status/components/{StatusRing,StatusList,StatusComposer,StatusViewer}.jsx (new); utils/format.js (+formatStatusTimestamp); dashboard/components/Sidebar.jsx (Estados tab + badge + panel); dashboard/DashboardFeature.jsx (StatusProvider + overlay mounts); eslint.config.js (+useStatus to allowExportNames). `npm run lint` ok (0 errors/warnings), `npm run build` ok. No commit made (writer does not commit); pending work-unit commit by orchestrator. RDD not run by this writer.
- [x] T3b Frontend status fixes from advisory review (lineage review-f7d0021c6a1954b2, APPROVED+acknowledged, boundary fda9605) — route: delegated writer (same writer as T2b). Added Vitest (`vitest` devDependency, `"test": "vitest run"` script); extracted pure logic to `features/status/lib/feed.js` (sortContacts, applyStatusNew, applyStatusDeleted, applyStatusViewedForOwner, nextTarget, contactsByTelephon) and `features/status/lib/viewer.js` (computeVideoProgressPercent, shouldResumeClockAfterDeleteAttempt), both now imported (not duplicated) by StatusContext.jsx/StatusViewer.jsx. All 6 findings fixed:
  - R3-missing-tests: `src/features/status/lib/feed.test.js` (15 tests), `src/features/status/lib/viewer.test.js` (7 tests), `src/utils/format.test.js` (7 tests for `formatStatusTimestamp`, today/yesterday/older boundaries with `vi.useFakeTimers()`/fixed dates). 29/29 passing.
  - R3-goNext-reorder (StatusContext.jsx): `goNext` now navigates via a stable `contactOrderSnapshotRef` (captured in `openContactViewer`, at the order the feed had when the viewer opened) plus a pure `nextTarget(orderSnapshot, contactsByTelephon, currentTelephon)`, instead of searching the live (possibly just-resorted) `feed.Contacts` array. Test `nextTarget` "reproduce el bug real" — RED (found and fixed a related edge case: unknown current-telephon in snapshot incorrectly matched from index 0) → GREEN.
  - R3-video-wallclock (StatusViewer.jsx): video progress now comes from the `<video>` element's real `timeupdate`/`currentTime`/`duration` via `computeVideoProgressPercent`, advances on `ended`, and on `error` skips after a 1.5s delay instead of freezing forever; the wall-clock rAF loop is now skipped entirely for video (`isVideo` guard). Play/pause of the actual video element is now synced with the hold-to-pause / viewers-sheet-open state.
  - R3-delete-timer-race (StatusViewer.jsx): `handleDelete` synchronously cancels the pending rAF and pauses before `window.confirm` (confirm blocks the main thread, so a `setPaused` alone wouldn't stop an already-queued frame); resumes only per `shouldResumeClockAfterDeleteAttempt` (cancelled or failed delete → resume; successful delete → stays paused, avoiding the stale-tick skip after deletion).
  - R3-viewer-stale-pause (StatusViewer.jsx): new effect resets `paused` and `showViewers` on every `isOpen` transition (not only on status-ID change), since the component isn't unmounted when the viewer closes.
  - R3-composer-escape-reset (StatusComposer.jsx): Escape now calls the same `handleClose` (closeComposer + reset) as the close button, instead of just closing without resetting mode/text/file/objectURL; added an unmount-cleanup effect (via a ref tracking the latest preview URL) that revokes any pending object URL.
  - Verification: `npm run test` (29/29 passed), `npm run lint` (0 errors/warnings), `npm run build` (succeeds; pre-existing warnings only — zego-uikit `eval` and a dynamic/static import overlap in `groupApi.js`, both unrelated to this change).
- [ ] T4 Frontend render audit + fixes — route: delegated (mapping 4+ files + writer)

## Acceptance criteria
- Ticks: sent (1 gray), delivered (2 gray), read (2 blue/green) clearly separated at bubble size.
- Statuses: publish text/image/video; mutual contacts see them in real time; unseen ring; viewer
  records views; owner sees viewer list; expire after 24h; owner can delete.
- `go test ./...`, `npm run lint`, `npm run build` green; stack boots with `docker compose up -d --build`.

## Progress / Evidence
- a9c2f4e fix(docker): stop publishing redis on host port 6379 (pre-task, stack fix).
- Baseline: go test ./... ok; lint ok; build ok.

## Next step
T2b and T3b done (both green: go vet/test/build; npm test/lint/build). Next: T4 (frontend render audit).
