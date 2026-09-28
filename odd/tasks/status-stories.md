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
- Frontend: no test runner configured → checks are `npm run lint` + `npm run build` (disclosed gap).

## Delivery
- Branch: `feat/status-stories`. Strategy: ask-on-risk. Forecast > 400 lines → slices per task.
- RDD: on (global). Assess each work-unit commit.

## Tasks
- [x] T1 Tick icon redesign — route: inline (1 mechanical file) — commit 0d7d908; eslint ok; RDD assess: medium, under_budget (pending in slice)
- [ ] T2 Backend status feature (TDD) — route: delegated writer (2+ non-trivial files)
- [ ] T3 Frontend status feature — route: delegated writer (2+ non-trivial files)
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
T2 in progress (delegated backend writer).
