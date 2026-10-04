# Feature: web-push

## Objective
Real push notifications (Web Push, VAPID) so a user who has no open tab or no live WebSocket still gets notified of new 1:1 and group messages. Clicking the notification opens the app on that chat.

## Problem / Why
Today notifications only exist while a tab is open:
- `frontend/src/utils/notifications.ts:244` `showNativeNotification` is called only from the WS `chat` handler in `DashboardContext.tsx:810-838`, and only for 1:1 messages received while that chat is not open. Group messages never notify (`handleGroupChatMessage`, `DashboardContext.tsx:956-965`, has no notification call).
- `frontend/public/sw.js` already exists (registered from `main.tsx:8` through `registerServiceWorker`, `notifications.ts:165`). It only reacts to a page `postMessage` (`SHOW_NOTIFICATION`) and to `notificationclick` (`sw.js:103-125`). It has no `push` listener and there is no push subscription anywhere (`rg pushManager` = nothing).
- The backend has no notion of a device or subscription. The hub knows online state (`Hub.IsOnline`, `backend/websocket/hub.go:149`; `rooms`, `hub.go:18`) but nothing acts on "offline".

## Scope / Authorized
Approved roadmap item (one of the remaining features the user asked to have documented for later implementation). NOT yet authorized to implement; this document is the plan. Scope: backend (model, repo, service, REST, dispatch on new messages), frontend (subscribe/unsubscribe, SW `push` handler, click routing for groups), nginx/compose config, tests. Out of scope: notification actions/reply-from-notification, badges, quiet hours, per-chat mute (see Follow-ups).

## Dependencies / ordering
- **Shares ONE service worker with `odd/tasks/pwa.md`.** Recommended order: implement `pwa` first (it decides how `sw.js` is built), then `web-push` adds the `push` handler to that same worker. If web-push must go first, extend the existing hand-written `frontend/public/sw.js` and let `pwa` migrate it later (task PU-merge in pwa.md).
- iOS/iPadOS only delivers Web Push to an installed PWA (Home Screen). Installability comes from `pwa.md`. To verify against current Apple docs before promising iOS support.
- Independent from reactions, disappearing-messages, observability. If `disappearing-messages` ships first, expired messages must not push (no interaction: push is sent at message creation only).
- `api-casing` (last) will rename fields in message payloads; the push payload defined here is a NEW camelCase contract and is not affected.
- Branch: `feat/web-push`, created from the latest feature branch in the chain (branches are chained and unpushed; check `git branch --show-current` and the ROADMAP order before branching).

## Decisions (recommended defaults)
- **Library (to verify):** `github.com/SherClockHolmes/webpush-go` (`webpush.GenerateVAPIDKeys`, `webpush.SendNotification(payload, *webpush.Subscription{Endpoint, Keys{Auth,P256dh}}, *webpush.Options{Subscriber, VAPIDPublicKey, VAPIDPrivateKey, TTL, Urgency})`). Not in `go.mod` today (`rg webpush go.mod` = none). Before adopting, check the latest release, maintenance status, license and the exact API on pkg.go.dev, and that it builds with `go 1.25.5`. Alternative: implement RFC 8291/8292 by hand (rejected: crypto risk).
- **Keys via env, never committed:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` or https URL). Add pass-through lines in `compose.yaml` (`VAPID_PUBLIC_KEY: ${VAPID_PUBLIC_KEY:-}` in the `app` service, same style as `ZEGO_APP_ID`, `compose.yaml` app env block) and document in `.env.example` (do not edit or read `.env`). **If the keys are missing the feature is disabled**: `GET /api/v1/push/config` returns `{enabled:false}`, the UI hides the toggle, dispatch is a no-op. Provide a generator: `make vapid-keys` -> `go run ./backend/cmd/vapidgen` (tiny main that prints a pair; the repo currently has only `main.go` at root, so create the small cmd or a `scripts/` Go file; to verify layout). Open question below covers auto-generation for dev.
- **Table** `push_subscriptions` (model in `backend/models/pushSubscription.go`, added to the `AutoMigrate` list in `backend/database/postgres.go:109-122`): `id`, `user_id uint index not null`, `endpoint text not null`, `p256dh`, `auth`, `user_agent size:300`, `created_at`, `last_success_at *time`, no soft delete (hard delete). Unique index on `endpoint` through `execMigration` (helper at `postgres.go:18`, same idempotent style as the other post-migration indexes at `postgres.go:131-192`). One user can have many rows (multi-device). Re-subscribing the same endpoint under another user re-assigns the row (shared browser).
- **REST** (camelCase, new endpoints; router method `ApiPush` in `backend/routers/api/api.go`, Deps field in `routers/central.go:18-34`, wiring in `app.go:157-198`; note `InitRouterApiMessage` takes positional args, `api.go:30`):
  - `GET /api/v1/push/config` -> `{enabled:bool, publicKey:string}`.
  - `POST /api/v1/push/subscribe` body `{endpoint, keys:{p256dh, auth}}` (exactly the browser `PushSubscription.toJSON()` shape) -> 201/200.
  - `DELETE /api/v1/push/subscribe` body `{endpoint}` -> 204/200 (idempotent).
  - Validation in a middleware like `middleware/middlewareStatus.go`: `https` endpoint only, length caps, base64url keys, max 10 subscriptions per user.
- **SSRF guard (required):** the server will POST to a user-supplied URL. Accept only `https` endpoints whose host matches known push services (FCM `fcm.googleapis.com`, Mozilla `*.push.services.mozilla.com`, Apple `*.push.apple.com`, Windows `*.notify.windows.com`; list to verify) OR at minimum reject hosts resolving to loopback/private ranges. Make the allowlist a function with unit tests.
- **When to send:** only for recipients with no live WS. 1:1: in `HandleChatMessage` (`backend/websocket/message_handlers.go:56-93`) the code already computes `mh.Hub.IsOnline(msgGet.Receptor)` (`:65`); if false, call the notifier after the message is saved. Groups: after `SendGroupMessage` in `HandleGroupChatMessage` (`:306-332`) and the REST twin `HandleSendGroupMessage` (`backend/handlers/handlerGroup.go:232-259`, which broadcasts via `h.notifier.SendToGroup`), notify every member other than the sender who is not in `hub.rooms` (`IsInRoom`, `hub.go:198`, or `IsOnline`). Members list: use the existing group repo membership query (name to verify in `backend/repos/groupData.go`). REST 1:1 `HandlerPostChat` (`handlerChat.go:26-53`) only persists and never touches the hub; to verify whether the frontend ever uses it, otherwise it needs no hook.
- **Structure:** `services.PushNotifier` (interface `PushNotifier{ NotifyDirect(ctx, receiverTelephon string, msg schemas.Message); NotifyGroup(ctx, groupID uint, senderTelephon string, msg schemas.GroupMessageResponse, isOnline func(string) bool) }`) backed by a `PushSender` interface (`Send(ctx, sub models.PushSubscription, payload []byte) error`). The real sender wraps webpush-go; tests inject a fake. Sending runs in a goroutine with a bounded worker pool and a 10 s timeout so it never blocks the WS read pump. Response 404/410 from the push service deletes that subscription; other errors are logged (with counters once `observability` exists) and not retried in v1.
- **Payload (privacy):** JSON `{v:1, kind:"direct"|"group", telephon?, groupID?, messageID, title, body, tag}`; encrypted end to end to the browser by Web Push (the push service cannot read it). Body policy is an open question; recommended default: sender/group name as title, body = message text truncated to 100 chars, `"Foto"/"Audio"/"Video"/"Documento"` for media (same labels as `DashboardContext.tsx:815-822`), and env `PUSH_PREVIEW=off` switches the body to a generic `"Nuevo mensaje"`. `tag` = telephon or `group:<id>` so notifications collapse per chat. Keep payload < 3 KB.
- **TTL/urgency:** `TTL` 24 h, `Urgency: normal`.
- **Service worker:** add a `push` listener that parses the JSON and calls `showNotification` (Chrome requires every push to display a notification, `userVisibleOnly: true`), a `notificationclick` that carries `{telephon}` or `{groupID}`, and keep the existing `SHOW_NOTIFICATION` message path. Optionally suppress when a visible focused client exists (`clients.matchAll`); server already avoids pushing to online users so this is a safety net only.
- **Click routing:** existing chain is `sw.js:103-125` -> `postMessage({type:'NOTIFICATION_CLICK', telephon})` -> `handleSWMessage` (`notifications.ts:324-329`) -> `onNotificationClick` handlers (`:304`) -> `useNotificationClick` (`features/dashboard/hooks/useNotificationClick.ts:15`) -> `DashboardContext.handleNotificationClick` (`DashboardContext.tsx:1176-1182`) + `extractNotificationTelephon` (`features/dashboard/lib/notificationClick.ts`). It only knows `telephon`. Extend the payload type to a union `{telephon} | {groupID}` and select the group in the handler (read `handleNotificationClick` first; to verify how groups are selected). When no window is open, `sw.js:118-120` does `openWindow('/')` and loses the target: change to `openWindow('/?chat=<telephon>')` / `?group=<id>` and read it once on dashboard boot (routing shape to verify in `frontend/src/App.tsx`).
- **Client subscription lifecycle:** after `Notification.permission === 'granted'` (existing `NotificationBanner.tsx` and `requestNotificationPermission`, `DashboardContext.tsx:308-312`) and `push/config.enabled`, call `registration.pushManager.subscribe({userVisibleOnly:true, applicationServerKey})`, POST to `push/subscribe`. Re-sync on every login (endpoints can rotate). **Unsubscribe on logout** (call `DELETE push/subscribe` and `subscription.unsubscribe()` BEFORE the logout request, logout handler at `backend/handlers/HandlerUser.go:154`), otherwise a logged-out shared browser keeps receiving the previous user's messages.
- **nginx/Vite:** `/sw.js` is already served from the web root with `Cache-Control: no-cache` (`docker/nginx.conf:77-80`) and Vite copies `public/sw.js` to `dist/` root, so the worker scope is `/`. No nginx change is needed for push itself. If `pwa.md` moves the worker to `vite-plugin-pwa`, keep the output name `sw.js` at the root so this rule keeps matching. Web Push requires a secure context: `localhost` is fine; real deployments need HTTPS (Cloudflare tunnel profile in `compose.yaml` already gives it).

## Constraints
- TS strict with no `any`; keep the M4b runtime guards (parse push payloads and API bodies with guards, do not cast).
- Conventional Commits, no AI attribution, explicit pathspecs (`git reset -q` first). One commit per task.
- Never `go test -tags integration` against the shared stack (it TRUNCATEs). Never `docker compose down -v` unless intended.
- Never commit VAPID keys or subscriptions; never read `.env*`.
- Existing WS/REST payloads unchanged; new fields optional.

## TDD
Strict TDD (session config). Runners:
- `go test ./...` (backend units; fake `PushSender`, mocked repo like `services/mocks_test.go`)
- `cd frontend && npm run test` (Vitest)
- `make test-integration` (Go `-tags e2e`, needs the stack up)
- `cd frontend && npm run test:e2e` (Playwright)
Playwright cannot receive a real push (headless Chromium has no FCM path; `Notification`/`pushManager` work only partially). E2E therefore covers: permission granted through `context.grantPermissions(['notifications'])`, the toggle visibility driven by `push/config`, and the REST subscribe/unsubscribe contract (fake endpoint). Real delivery is a manual smoke on a device (documented in Progress).

## Tasks
- [x] WP1 Library decision + keys: verify webpush-go (version, API, license, Go 1.25 build), add dependency, `make vapid-keys` generator, compose/`.env.example` pass-through, `PushConfig` loader that returns disabled when keys are missing. Unit tests for the loader. Route: delegated.
- [ ] WP2 Data + REST: `PushSubscription` model, AutoMigrate + unique endpoint index, repo (upsert by endpoint, list by user, delete by endpoint, delete by id), service, middleware validation + SSRF allowlist, handler and routes (`config`, `subscribe`, `unsubscribe`). Handler/service/allowlist tests, plus a Go e2e (`-tags e2e`) for subscribe -> duplicate -> unsubscribe and 401 without cookie. Route: delegated.
- [ ] WP3 Dispatch: `PushSender` interface + webpush-go implementation + fake, `PushNotifier` with `NotifyDirect/NotifyGroup`, bounded goroutine pool, 404/410 cleanup, payload builder with `PUSH_PREVIEW`. Hook into `HandleChatMessage`, `HandleGroupChatMessage`, `HandleSendGroupMessage`. Tests: online recipient -> no send; offline -> exactly one send per subscription; group excludes sender and online members; 410 deletes; media label; long body truncated; disabled config -> no-op. Route: delegated.
- [ ] WP4 Frontend subscription: `frontend/src/utils/push.ts` (`urlBase64ToUint8Array`, `ensurePushSubscription`, `removePushSubscription`), API wrappers with guards, types in `types/api.ts`, toggle in settings/banner, unsubscribe-on-logout hook, re-sync on login. Vitest with a mocked `PushManager`. Route: delegated.
- [ ] WP5 Service worker + click routing: `push` handler, extended `notificationclick` (`telephon`/`groupID`, `openWindow` with query), union type in `notificationClick.ts`, group selection in `handleNotificationClick`, boot-time query consumption. Tests for `extractNotificationTelephon` union and hook wiring (existing `useNotificationClick.test.tsx`, `notificationClick.test.ts` show the style). SW logic kept in small pure helpers so it can be unit-tested. Route: delegated.
- [ ] WP6 Playwright + docs: spec `frontend/e2e/push.e2e.ts` (toggle visible when enabled, REST contract), README section (VAPID setup, HTTPS requirement, iOS caveat, privacy option), manual smoke checklist. Two green runs of `npm run test:e2e`. Route: delegated.
- [ ] WP8 Mute backend: `ChatMute` model + migration, repo/service (set with duration, clear, list for user, `IsMuted(user, chat, now)`), endpoints, `MutedUntil` in contact chat list and `GroupResponse`, `PushNotifier` skips muted + blocked. Unit/handler tests + Go e2e. Route: delegated.
- [ ] WP9 Mute frontend + Playwright: menu option with 3 durations + "Activar notificaciones", 🔇 sidebar icon, in-app sound/notification suppressed when muted (`useNotifications`/notification utils), unread still counts. Vitest + Playwright (mute, receive message: unread badge increments, no in-app notification; unmute restores). Two green runs. Route: delegated.
- [ ] WP7 Close: all checks, doc + mirror update.

## Acceptance criteria
- With keys configured, a subscribed user whose WS is closed receives a system notification for a new 1:1 and a new group message; clicking opens (or focuses) the app on that chat, for both 1:1 and groups, also from a cold start.
- Online users never receive a duplicate push. Logged-out users receive nothing. Expired subscriptions (404/410) are removed.
- Without keys the app behaves exactly as today and shows no push UI.
- No `any`; `go test ./...`, typecheck, lint, test, build, `make test-integration`, `npm run test:e2e` green.

## Risks
- SSRF through the subscription endpoint (mitigated by allowlist + tests).
- Push privacy on shared devices (logout unsubscribe; preview option).
- Browser differences: Safari/iOS need an installed PWA; Firefox and Chrome differ in `userVisibleOnly` handling (to verify).
- Sending in the WS read path: must stay async.
- Duplicate notifications when the same user has the app open on one device and is offline on another: expected and correct (per-device).

## Open questions (user decision)
- **RESOLVED 2026-10-03 (user):** preview = sender + truncated text by default (WhatsApp default), with a PER-USER setting "Mostrar vista previa" (persisted server-side on the user, toggle in settings) that switches that user's pushes to generic "Nuevo mensaje de <name>". `PUSH_PREVIEW=off` stays as a server-wide override. Add to WP2 (field + endpoint), WP3 (payload builder reads it), WP4 (toggle UI). Reaction pushes (from the reactions feature) follow the same setting.
- **RESOLVED 2026-10-03 (orchestrator, technical):** dev keys = feature disabled until `make vapid-keys` output is put in `.env`; no hidden auto-generated state.
- **RESOLVED 2026-10-03 (user):** blocked contacts never trigger pushes (verify the contact `Status` values in `models/contact.go`). Per-chat MUTE is IN SCOPE (WhatsApp style): mute any 1:1 or group for 8 h / 1 week / always (`chat_mutes` table: user, chat kind, peer/group id, `muted_until` nullable = always; unique per user+chat), REST PUT/DELETE + included in chat/group list responses, "Silenciar notificaciones" in chat and group menus, 🔇 icon in the sidebar. A muted chat sends no push and no in-app sound/notification, but still increments unread. Expired mutes are ignored at read time. See WP8-WP9.

## Assumptions
- Session run in a cloud container: Engram and the RDD `assess` tool are not available there, so the Engram mirror is replaced by this section + Progress, and each slice review is a subagent review of `git diff <boundary>..HEAD` (committed only). Boundary for the first slice: 171f69d.
- `feat/security-hardening` was already merged into main (ef542a5, same tree as 5997fd3); `feat/web-push` starts from ef542a5 and is pushed to the session branch `claude/wizardly-sagan-j0p2mi`.
- `pwa` is not implemented yet, so web-push extends the hand-written `frontend/public/sw.js` (PU-merge in pwa.md migrates it later).

## Progress / Evidence
- WP1 done: `github.com/SherClockHolmes/webpush-go` v1.4.0 (latest tag, MIT, API `SendNotificationWithContext(ctx, msg, *Subscription, *Options)` with `Subscriber/TTL/Urgency/VAPIDPublicKey/VAPIDPrivateKey`, builds with go 1.25.5). `config.LoadPushConfig(getenv)` (disabled unless public+private key and a `mailto:`/https subject are set; `PUSH_PREVIEW=off|false|0|no` disables preview server-wide). `make vapid-keys` -> `go run ./backend/cmd/vapidgen`. compose `app` env pass-through + `.env.example` section. Tests: `backend/config/push_test.go`, `backend/cmd/vapidgen/main_test.go`.

## Next step
Implement after `pwa` (shared service worker). First task: WP1 (verify the library before writing code).
