# Feature: group-media

## Objective
Send and render audio (voice notes), photos, video and documents in group chats, matching 1:1 chats.

## Problem / Why
The backend already supports group media end to end: `GroupMessage.MediaUrl/MediaType`, shared `validateMessageContent` + `IsSafeMediaURL`, WS `group_chat` fan-out, and `POST /api/v1/upload`. The group UI is text-only:
- `GroupMessageInput` (`GroupChatWindow.tsx`) has no attach menu or recorder, and its send guards require text.
- `GroupMessageBubble.renderMedia` is a weaker duplicate of the 1:1 renderer (native `<audio>`, no document name).
- The frontend helpers already exist but are unwired: `useGroupMessaging.handleMediaUploadSuccess` and `sendGroupMessage(..., mediaType)`.

## Scope / Authorized
User-approved: "que también se pueda enviar audios fotos videos como en los chats normal". Scope is the backend tests and the frontend. No backend product change beyond an optional early 400 in `MiddlewareGroupMessage`.

## Constraints
- Branch: feat/group-media (from feat/typescript-migration).
- TS strict, no `any`, keep the M4b principle: never drop runtime guards on network/WS data.
- Keep `rel="noopener noreferrer"` on links, and never render unvalidated URLs outside what 1:1 already does.
- 1:1 behavior must stay unchanged (the shared extraction is pinned by tests first).
- Commits: Conventional Commits, no AI attribution, explicit pathspecs (never commit a pre-staged index).

## TDD
Strict TDD enabled (session config). Runners: `go test ./...` (backend), `cd frontend && npm run test` (Vitest). RED → GREEN → REFACTOR, with mutation checks when tests only pin existing behavior.

## Delivery
Strategy: ask-on-risk. Forecast is ~600 authored lines, which is over budget, so there is one reviewed work-unit commit per task. Reviews run per commit via `.git/rdd-state/cycle.zsh`.

## Tasks
- [x] GM1 Backend: group media service tests (`serviceGroup_test.go`: image accepted, `javascript:` URL and bad type rejected) plus a group media e2e next to `integration/e2e_test.go` (`group_chat` with mediaUrl/mediaType round trip). Optional: `MiddlewareGroupMessage` rejects a bad media type or unsafe URL with a 400 early. Route: delegated (writer).
- [ ] GM2 Frontend extraction: `useVoiceRecorder` hook (from `MessageInput.tsx`) and a shared `MediaContent` renderer (from `MessageList.renderMedia`, with `AudioPlayer` and doc name). 1:1 is unchanged, pinned by tests per media type. Route: delegated.
- [ ] GM3 Group render: `GroupMessageBubble` uses `MediaContent`; the text is hidden when it equals the URL. Tests per media type. Route: delegated.
- [ ] GM4 Group send UI: attach button + `MediaUploadMenu` + mic/recording in `GroupMessageInput`, wired to `handleMediaUploadSuccess`. Allow a media send with an empty draft. `UserRole==='left'` still blocks. Tests. Route: delegated.
- [ ] GM5 Close: browser smoke (group send image + voice note), doc + mirror.

## Acceptance criteria
- A group member can send an image, video, document or voice note, and every member sees it rendered as in 1:1.
- Unsafe URLs and types are rejected (the backend tests prove it).
- typecheck, test, lint, build and `go test ./...` are green, with no `any`.

## Progress / Evidence
- GM1 (delegated writer, direct route): `backend/services/serviceGroup_test.go` (mocks + 4 accepted / 6 rejected media cases, empty, non-member, save error). RED: mutation disabling `IsSafeMediaURL` check -> `MediaRejected/javascript:` FAIL; mutation dropping MediaUrl/MediaType from persisted msg -> all 4 `MediaAccepted` FAIL; restored -> GREEN. `go test ./...` green, `go vet ./...` clean. Group media e2e added to `integration/e2e_test.go` (compiles, `go vet -tags e2e` clean) but NOT run: needs POSTGRES_* env (from .env) to create users; stack is up on :80/:8080. Optional middleware early-400 skipped (service already rejects; no duplication).

## Next step
GM1–GM4 via one Sonnet writer, one commit per task.
