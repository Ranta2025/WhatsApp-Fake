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
- [x] GM2 Frontend extraction: `useVoiceRecorder` hook (from `MessageInput.tsx`) and a shared `MediaContent` renderer (from `MessageList.renderMedia`, with `AudioPlayer` and doc name). 1:1 is unchanged, pinned by tests per media type. Route: delegated.
- [x] GM3 Group render: `GroupMessageBubble` uses `MediaContent`; the text is hidden when it equals the URL. Tests per media type. Route: delegated.
- [x] GM4 Group send UI: attach button + `MediaUploadMenu` + mic/recording in `GroupMessageInput`, wired to `handleMediaUploadSuccess`. Allow a media send with an empty draft. `UserRole==='left'` still blocks. Tests. Route: delegated.
- [x] GM5 Close: browser smoke (group send image + voice note), doc + mirror.

## Acceptance criteria
- A group member can send an image, video, document or voice note, and every member sees it rendered as in 1:1.
- Unsafe URLs and types are rejected (the backend tests prove it).
- typecheck, test, lint, build and `go test ./...` are green, with no `any`.

## Progress / Evidence
- GM1 (delegated writer, direct route): `backend/services/serviceGroup_test.go` (mocks + 4 accepted / 6 rejected media cases, empty, non-member, save error). RED: mutation disabling `IsSafeMediaURL` check -> `MediaRejected/javascript:` FAIL; mutation dropping MediaUrl/MediaType from persisted msg -> all 4 `MediaAccepted` FAIL; restored -> GREEN. `go test ./...` green, `go vet ./...` clean. Group media e2e added to `integration/e2e_test.go` (compiles, `go vet -tags e2e` clean) but NOT run: needs POSTGRES_* env (from .env) to create users; stack is up on :80/:8080. Optional middleware early-400 skipped (service already rejects; no duplication).
- GM2: extracted `hooks/useVoiceRecorder.ts` (+`formatRecordingTime`), `components/MediaContent.tsx`, `lib/mediaMessage.ts` (`resolveMedia`, `isMediaUrl`); `MessageList`/`MessageInput` now use them. Pin test `MessageList.media.test.tsx` (9 tests) written and GREEN BEFORE extraction, GREEN after. Hook tests (7) RED (module missing) -> GREEN. Mutation checks: MediaContent audio->native `<audio controls>` / dropped rel -> audio+document tests RED; hook without onUploadError/null guard -> error test RED; `isMediaUrl` without MediaType+URL rules -> image/text-hidden tests RED; all restored -> GREEN. typecheck/lint/build clean, vitest 34 files / 196 tests, no `any`. Doc label stays "Documento" (1:1 unchanged; no file name shown today).
- GM3: `GroupMessageBubble` (now exported) renders `<MediaContent>`; local weak `renderMedia` removed; text rule unchanged (hidden when equals MediaUrl, captions shown). Tests `GroupMessageBubble.media.test.tsx` (7): RED (7/7, bubble not exported) -> GREEN; mutation (always show text) -> image test RED, restored -> GREEN. Behavior change: `MediaType` without `MediaUrl` no longer uses `Message` as URL (safer; text shown instead). typecheck/lint/build clean, vitest 35 files / 203 tests, no `any`.
- GM4: `GroupMessageInput` extracted from `GroupChatWindow.tsx` into `GroupMessageInput.tsx` (diff in the window is a pure removal + import) and extended: attach button + `MediaUploadMenu` -> `handleMediaUploadSuccess` (works with empty draft), mic/recording via `useVoiceRecorder` (mic when draft empty, send when text or editing), attach/mic hidden while editing, disabled when offline, `UserRole==='left'` banner still blocks. Tests `GroupMessageInput.test.tsx` (9): RED (module missing) -> GREEN; mutations (voice note typed as image, attach shown while editing) -> 2 tests RED, restored -> GREEN. typecheck/lint/build clean, vitest 36 files / 212 tests, no `any`.
- Reviews (per commit, all approved + acknowledged): 83434d9, a27eeac, ed03c0a, c2c499b, ab8f788 (GM4b fix for two R3 warnings: recording survives 'left' role; attach menu reopens after edit).
- GM5: Playwright smoke on rebuilt docker web (fake media devices): ana_demo sent an image (attach → file input) and a voice note (mic → stop) in "Equipo demo"; luis_demo sees both (storage img + AudioPlayer). No page errors. FEATURE CLOSED.
- Follow-ups (not fixed): group media e2e not executed (needs POSTGRES_* from .env; user can run it); e2e negative case doesn't assert error content / no fan-out; mic not released if unmounted while getUserMedia is pending; legacy rows with MediaType but URL only in Message now render as text; document label shows "Documento" without file name (product decision, 1:1 too); media sent with a non-empty draft keeps the draft (same as 1:1).

## Next step
Feature closed. Next queued: message-pagination.
