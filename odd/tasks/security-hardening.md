# Feature: security-hardening

## Objective
Port the hardening from the stale remote branch `origin/ph2-data-integrity` (diverged from main at `6309ce91`, 2026-03-03) that is still a real behavioral gap in current main, re-implemented on main's current design. Not a git merge: main was rewritten since (230 files differ).

## Problem / Why
Behavior-level gap analysis (2026-10-04, read-only, every claim checked against main) found three real gaps:
1. **Refresh token replay race.** `RefreshSession` (`backend/services/servicesUser.go:418-426`) does `GetRefreshTokenOwner` (GET) then `DeleteRefreshToken`, which swallows `redis.Nil` (`backend/cache/cacheUser.go:71-73`). Two concurrent `/refresh` calls with the same cookie both mint new sessions, so a stolen refresh token can be forked and the rotation does not detect replay.
2. **Missing security headers.** nginx sets only `nosniff` and `Referrer-Policy` at server level (`docker/nginx.conf:38-39`), and every location with its own `add_header` (`/`, `/assets/`, `/sw.js`, `/manifest.webmanifest`) drops them (nginx inheritance). No `X-Frame-Options`/`frame-ancestors` anywhere: the app can be framed (clickjacking).
3. **Internal error text reaches clients.** 500/default branches return raw repo errors (gorm/pg text wrapped with `%w`), e.g. `serviceGroup.go:236` -> `handlerGroup.go:153`, `serviceStatus.go:238-248` -> `handlerStatus.go:101`, `handlerSearch.go:53,67`, WS `sendError` in `websocket/message_handlers.go`.

## Not ported (verified unnecessary or conflicting)
- ParseUnverified fallback removal: main never parses unverified JWTs (`backend/utils/token.go:59`).
- Redis rate-limit fail-closed breaker: main's limiter is in-memory (`backend/middleware/rateLimit.go`).
- Contact FKs: main drops them on purpose (`backend/database/postgres.go:144-153`); uniqueness held by partial index `idx_user_contact_active`.
- User-id cache invalidation on username change: main caches only telephon -> id.
- WS requires Origin header: low value (browsers always send it; foreign origins already rejected).
- Mock/test fixes, statuses, audit refactor, group file sending: superseded by main.
- Group calls: missing product feature, not hardening (separate decision).
- 409 for duplicate contacts: cosmetic (400 today, integrity already enforced).

## Scope / Authorized
Authorized 2026-10-04 (user: "if it is a necessary implementation that improves the code, do it"). Branch `feat/security-hardening` from `main` @ `e82d270`.

## Tasks
- [x] SH1 Atomic refresh consume: consume the refresh token with a single atomic `GETDEL` that returns the owner; a missing key (already consumed / expired) fails the refresh. Keep the per-user set cleanup. Concurrent test: N parallel refreshes with one token -> exactly one succeeds. Route: delegated.
- [x] SH2 nginx security headers: `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'` (conservative: no `script-src` so ZegoCloud/Google Fonts keep working), `X-Content-Type-Options: nosniff`, `Referrer-Policy` on every response including locations with their own `add_header` (shared include or repeated). HSTS out of scope here (TLS terminates at Cloudflare; HSTS over plain HTTP is ignored). Check via Go e2e or Playwright. Route: delegated.
- [x] SH3 Error sanitization: 500/default paths log the raw error with the request id and return a generic message; hand-written 4xx messages unchanged; WS `sendError` likewise for internal errors. Register flow: log the real cause of `CreateUser` failures, map unique violations to "Username/Email/Telefono ya existe", and replace the bind-failure "Complete todos los campos" with the specific invalid field (email / phone format). Tests pin that DB error text is not returned. Route: delegated.

## Acceptance criteria
- Replayed/concurrent refresh with one token yields exactly one new session.
- Every nginx response (SPA, assets, sw.js, manifest, API, storage) carries the security headers.
- No gorm/pg error text in any HTTP/WS error body; 4xx messages unchanged.
- `go vet`, `go test ./...`, `make test-integration`, frontend checks and e2e green.

## Assumptions
- Conservative CSP (no `script-src`) to avoid breaking ZegoCloud calls; a full CSP is a later step.

## Progress / Evidence
| Task | Route | Commit | RDD |
|------|-------|--------|-----|
| SH1 | delegated (opus: auth/concurrency) | 489a40a | e82d270..489a40a high/high_risk: granted -> 4-lens approved, acknowledged (review-242d5c81b3ec6a58; WARNINGs: GETDEL needs Redis >= 6.2 -> stack runs redis 7.4; Redis error maps to "expired" as before). Boundary -> 489a40a |
| SH2 | delegated (writer: nginx + Dockerfile + e2e) | b15fbb5 + follow-up fix | 489a40a..b15fbb5 high/high_risk: granted -> approved, acknowledged (review-6a06b3f4e595d988; WARNING: `/storage/` headers unproved -> parent check found a duplicated `nosniff` (MinIO + snippet); fixed with `proxy_hide_header X-Content-Type-Options` and `/storage/` added to the e2e, RED -> GREEN). Boundary -> b15fbb5 |
| SH3 | delegated (writer: handler/WS sweep + register) | (this commit) | pending |

Last reviewed boundary at start: branch point `e82d270`.

SH1 evidence: `cache.ConsumeRefreshToken` = single `GETDEL` (missing -> `ErrRefreshTokenNotFound`), best-effort `SREM` from the per-user set; `RefreshSession` consumes once; `GetRefreshTokenOwner` dropped from `UserCacheInterface`. RED: 10 parallel HTTP refreshes with one cookie against the old app gave 6x 200. GREEN: miniredis (`github.com/alicebob/miniredis/v2` v2.39.0, test-only) 10 goroutines -> exactly 1 wins (`-race -count=3` ok); `TestE2E` 3 parallel refreshes -> one 200 + two 401, reuse 401; `go vet`/`go test ./...` ok; `make test-integration` ok (82s).
Note: a user registration attempt during the writer's stack rebuild failed with the generic 400 "error al crear usuario" (INSERT during Postgres restart; cause not logged) -> SH3 adds cause logging, unique-violation mapping and field-specific format errors on register.

SH2 evidence: `docker/nginx/security-headers.conf` (nosniff, Referrer-Policy, `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'`, all `always`) copied by `docker/frontend.Dockerfile` and included at server level and in `/storage/`, `/assets/`, `/sw.js`, `/manifest.webmanifest`, `/`. Go app sets none of them (no duplicates). Permissions-Policy skipped (getUserMedia for calls/voice notes). `TestE2E_SecurityHeaders`: RED 7 subtests -> GREEN on `/`, `/login`, assets, `/sw.js`, manifest, `/healthz`, `/api/v1/user`; Playwright `pwa` + `chat` 6/6.

SH3 evidence: `utils.IsInternalError` (pgconn PgError/ConnectError, net.Error, context deadline/cancel, sql conn errors, io.EOF, gorm infra errors in the `%w` chain); handlers `respondInternal` (logs raw error with `request_id`/method/path, 500 "Ocurrió un error interno, inténtalo de nuevo"), `respondFailure` (keeps 4xx text unless infra), `respondChatError`; all explicit 5xx sites + group/status/search/chat defaults swept. WS `sendFailure`/`sendChatFailure` keep the "Error al enviar mensaje[ al grupo]" prefix and clientID errors (outbox contract) but hide internal causes. Register: `CreateUser` logs hash/BeginTx/CreateUserTx causes; 23505 mapped by constraint (`uni_user_data_bases_{username,gmail,telephon}`) to "... ya existe"; middleware uses `validator.ValidationErrors`: missing -> "Complete todos los campos", invalid email -> "El email no es válido", invalid phone -> "El número de teléfono no es válido (formato internacional, ej: +5355123456)". RED -> GREEN in 5 new test files; `go vet`/`go test ./...` ok; `make test-integration` ok (81s); live curl shows the new register messages. `go mod tidy` promoted pgx/validator to direct deps.
Known limit: text-only (non-wrapped) repo errors on 4xx paths still pass through (they are hand-written messages).
Incident: the branch had been switched back to `main` right after creation, so SH1/SH2 commits landed on local `main` (never pushed); recovered by pointing `feat/security-hardening` at them and resetting local `main` to `origin/main` (`e82d270`).

## Next step
Close + review last slice.
