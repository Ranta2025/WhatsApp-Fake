# Exploration: Comprehensive Audit of whatsapp-fake

## Current State

whatsapp-fake is a full-stack WhatsApp clone: Go/Gin/GORM/PostgreSQL/Redis/MinIO backend + React/Vite/Bun/Tailwind frontend. Previous audits documented 72 backend issues (AUDITORIA_BACKEND.md) and 45+ frontend issues (frontend/AUDITORIA.md). This exploration verified findings against current code (2026-08-09) and identified gaps the original audits missed.

### Already Fixed (11 of 72 backend issues resolved)

| # | Issue | Fix Location |
|---|-------|-------------|
| C6 | Graceful shutdown (SIGTERM/SIGINT, 10s timeout) | main.go:75-108 |
| C7 | sslmode now configurable via POSTGRES_SSLMODE env var | postgres.go:25-28 |
| A18 | Connection pooling: SetMaxOpenConns(25), SetMaxIdleConns(10) | postgres.go:52-55 |
| M11 | /healthz endpoint | main.go:115-117 |
| A8 | CORS: .trycloudflare.com removed, explicit whitelist | cors.go:38-71 |
| C10a | GetAllChats N+1: now uses batch GetUserByIDs | serviceChat.go:229 |
| C10b | GetCallHistory N+1: now uses batch GetUserByIDs | serviceCall.go:168 |
| A13 | ClearChat: now uses GORM Transaction() | contactData.go:308-330 |
| A14 | Failed attempts: Redis atomic INCR instead of GET+SET | cacheUser.go:154 |
| A15 | Failed attempts counter reset after successful login | servicesUser.go:170 |
| A16 | Activation codes deleted after use | servicesUser.go:205 |

## Verified -- Still Broken

### CRITICAL (7 remain of 12 original)

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| C1 | Refresh token no rotation: setTokenCookies creates new token via SaveRefreshToken but NEVER deletes old one | HandlerUser.go:324-358, cacheUser.go:28-31 | Stolen refresh token generates access tokens indefinitely |
| C2 | ParseUnverified + WithoutClaimsValidation: decodeTokenIgnoreExpiry falls through to unverified parsing | HandlerUser.go:360-386 | Any JWT-format string extracts claims without signature verification |
| C3 | err.Error() exposed to clients in almost every handler | HandlerUser.go:81,113,167; handlerChat.go; handlerGroup.go | Info disclosure: table names, column types |
| C4 | post_009_status_indexes.sql not idempotent: ALTER TABLE ADD CONSTRAINT lacks IF NOT EXISTS | backend/database/migrations/ | App won't start on re-run |
| C5 | FKs removed in post_003_drop_legacy_fk_constraints.sql: no RI for id_user/id_contact | backend/database/migrations/ | Orphaned records, data integrity risk |
| C8 | Rate limiter fail-open: allow() returns true on Redis error | ratelimit.go:62-63 | DDoS/brute-force if Redis is down |
| C9 | Missing UNIQUE(id_user, id_contact) constraint (transactions mitigate but don't replace DB constraint) | servicesContact.go:92-139 | Duplicate contacts still possible |

### HIGH (14 remain of 18 original)

A1: God Handler HandlerUser (387 lines, 10+ methods)
A2: God Middleware middlewareUser.go (11 middleware functions)
A3: ctx.Abort() inconsistent across handlers
A4: PII in logs: username/telephon plain text (HandlerUser.go:116)
A5: HTTP 400 for DB errors (should be 500)
A6: Business logic in handlers: setTokenCookies generates JWT+cookies (HandlerUser.go:30-53)
A7: Rate limiter TTL read separately from Lua script (ratelimit.go:54-74) -- mitigated by Lua atomicity
A9: WebSocket accepts empty Origin (websocket/handler.go:20-22)
A10: servicesBugReport.go reads os.Getenv directly, not testable
A11: serviceMedia.go depends on concrete *minio.Client
A12: cacheUser.go depends on concrete *repos.RepositoriesUser
A17: AddContact and AddContactByTelephon ~95% identical (shared helper partially deduplicates)
C12: Errors discarded with _ in serviceGroup.go
M9: HandleGroupJoin queries DB in readPump goroutine (websocket/message_handlers.go:539)

### MEDIUM (18 remain of 22 original)

M1: No transaction in multi-statement migrations
M2: No rollback support in migrations
M3: No Close() functions for DB/Redis/MinIO connections
M4: Spanish/English mixed names (Activo, Bloqueado, Telephon)
M5: Inconsistent JSON response format (respondJSON vs respondError vs direct c.JSON)
M6: Inconsistent HTTP codes (magic numbers vs http.Status*)
M7: HandlerLogOut name misleading (actually registers users)
M8: bloqueado cache not invalidated on unblock
M10: No Content-Type validation in middleware
M12: No HTML/XSS sanitization
M13: Mixed log.Println and slog usage
M14: Port 8080 hardcoded (configurable via PORT env var but default hardcoded)
M15: AutoMigrate in production
M16: Go module named "gorm" (confusing with gorm.io/gorm)
M17: Refresh token not bound to user with proper claims
M18: No JWT revocation/blacklist
M19: Minimal JWT claims (missing iat, nbf, jti)
M20: Email validation only accepts @gmail.com
M21: Sender email hardcoded in codigoRandom.go
M22: SMTP without TLS certificate verification

### LOW (20 remain, none fixed)

All 20 low issues from ORIGINAL AUDIT remain active, including: typo Conection, GroupMessage no Status, BugReport no local persistence, Message.Status Spanish values, StatusView.ViewedAt no index, Message max length 400 chars, CallLog.Duration int (should be int64), Password size:100 insufficient, MediaUrl size:500 insufficient, Time column SQL reserved word conflict, missing composite indexes on call_logs, UserDataBase.LastSeen no index, RecoverAccount doesn't return SendEmail error, Scan() instead of First() in userData, WS Send channel buffer fixed at 256, WS init goroutine no timeout, .env parser no quoted value handling, no password reuse validation, login middleware no input length limit, DTO duplication (UserRecoverAndChange = UserForgotPassword)

## Gaps NOT Covered by Original Audits

### Security (NEW -- CRITICAL)

| # | Issue | Detail |
|---|-------|--------|
| G1 | NO security headers anywhere | No Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security headers configured |
| G2 | No rate limiting on WebSocket upgrade endpoint | /ws upgrade has no protection against connection floods |
| G3 | Redis has no password | REDIS_PASSWORD="" in .env.example -- Redis completely open |
| G4 | MinIO default credentials in .env.example | MINIO_ROOT_USER=minioadmin, MINIO_ROOT_PASSWORD=minioadmin |
| G5 | JWT secret uses placeholder in .env.example | SECRETKEY=your_super_secret_key_here_change_this |

### Infrastructure (NEW -- HIGH)

| # | Issue | Detail |
|---|-------|--------|
| G6 | No CI/CD pipeline | .github/workflows/ directory does not exist -- no tests run automatically |
| G7 | Docker compose incomplete | compose.yml only has Redis+MinIO, missing PostgreSQL and app services |
| G8 | No Makefile or build automation | No target for build, test, lint, run, or migration commands |
| G9 | No health checks for Docker services | Only MinIO has healthcheck; Redis and app (if added) don't |
| G10 | WebSocket Client coupled to 4 service interfaces | client.go embeds ChatServicer, ContactServicer, CallServicer, GroupServicer directly |

### Frontend (NEW -- HIGH)

| # | Issue | Detail |
|---|-------|--------|
| G11 | No component tests exist | All 15 test files are backend; zero Jest/Vitest/Testing Library tests for React |
| G12 | No Error Boundary implemented | Any uncaught React error crashes the entire app |
| G13 | No TypeScript migration path | All .jsx files, no tsconfig.json, no migration plan |
| G14 | No E2E tests | No Playwright/Cypress configuration exists |

### Operations (NEW -- MEDIUM)

| # | Issue | Detail |
|---|-------|--------|
| G15 | No structured error handling contract | Some handlers use respondError(), others use c.JSON() directly |
| G16 | No request ID / tracing headers | Impossible to correlate logs across services |
| G17 | No graceful WebSocket shutdown | Hub.Run() loop has no stop channel -- goroutine leaks on Ctrl+C even though HTTP server shuts down |
| G18 | No database migration versioning table | No way to know which migrations have been applied |
| G19 | Service interfaces in same file as implementations | ContactServicer interface in servicesContact.go, not in a separate contracts package |

## WebSocket Architecture Assessment

### Strengths
- Hub uses sync.RWMutex correctly: Register/Remove use Lock, Broadcast/GetClient/GetOnlineContacts use RLock
- Reconnection handling clean: old client Send channel closed, rooms cleaned via leaveAllRoomsLocked
- safeSend non-blocking with recover: prevents dead goroutine from blocking Hub
- Room pattern with reference copy: SendToGroup copies refs under RLock, releases before sending
- Ping/pong heartbeat: 54s interval, 60s timeout, auto-close on timeout
- Message routing via map: O(1) dispatch, extensible

### Weaknesses
- Client directly embeds 4 service interfaces: coupling presentation layer to business logic
- HandleGroupJoin blocks readPump with DB query (M9)
- Hub.Run() has no stop channel: goroutine leak on shutdown
- HandleGroupCallOffer makes 2 DB queries + call log creation inline in readPump
- No backpressure: safeSend drops messages when channel is full (buffer 256)
- No message acknowledgment: if safeSend drops a message, sender never knows
- Origin check accepts empty string (A9): allows non-browser WS clients without restriction
- No message rate limiting per client: a malicious client can flood the Hub

## Cross-Cutting Relationships

### DI Problems --> Testability --> Coverage
A10 (servicesBugReport no DI), A11 (serviceMedia concrete *minio.Client), A12 (cacheUser concrete *RepositoriesUser) all make unit testing impossible without real infrastructure. This directly causes the 59% test coverage and zero integration tests.

### God Components --> Change Risk
A1 (God HandlerUser), A2 (God Middleware), and frontend God components (GroupChatWindow 795loc, DashboardContext 934loc) make every change high-risk because side effects span multiple concerns.

### JWT Architecture --> Multiple Issues
C1 (no rotation), C2 (ParseUnverified), M17 (no sub/jti claims), M18 (no blacklist), M19 (minimal claims) are all interconnected. Fixing one without addressing the JWT architecture would be incomplete.

### Docker/CI/CD Gap --> Deployment Risk
G6 (no CI/CD) + G7 (incomplete compose) + G8 (no Makefile) + G17 (no WS graceful shutdown) means the project cannot be deployed safely in production.

## Dependency Order for Fixing

### Phase 1: Security Foundation (no dependencies, highest impact)

1. C2: Fix ParseUnverified -- remove WithoutClaimsValidation, validate signature always
2. C3: Stop exposing err.Error() -- create sanitized error mapping
3. C1: Implement refresh token rotation -- delete old token on refresh
4. C8: Rate limiter fail-closed or circuit-breaker
5. G1: Add security headers middleware (CSP, HSTS, X-Frame-Options, X-Content-Type)
6. G3: Redis password configuration and enforcement
7. G4: MinIO credential hardening

### Phase 2: Data Integrity (depends on Phase 1 for testing safety)

8. C5: Add foreign keys or application-level integrity checks for contact_data_bases
9. C9: Add UNIQUE(id_user, id_contact) constraint
10. C4: Make post_009_status_indexes.sql idempotent
11. M1: Add transactions to multi-statement migrations
12. M2: Add rollback support for migrations
13. G18: Add migration versioning table

### Phase 3: Architecture Cleanup (depends on Phase 1-2 for stable foundation)

14. A10, A11, A12: Add interfaces for BugReportSender, ObjectStorer, CacheRepo -- enable testing
15. A1: Split HandlerUser into focused handlers
16. A2: Split middlewareUser.go, extract unified password validation
17. A6: Move JWT generation from handlers to services
18. A17: Deduplicate AddContact/AddContactByTelephon
19. M13: Unify logging to slog only
20. M5: Standardize JSON response format

### Phase 4: Infrastructure (depends on Phase 1-3 for code quality)

21. G6: Add GitHub Actions CI/CD (lint, test, build)
22. G7: Complete Docker compose (add PostgreSQL, app, healthchecks)
23. G8: Add Makefile
24. G17: Add stop channel to WebSocket Hub
25. G16: Add request ID middleware

### Phase 5: Frontend & WebSocket (depends on Phase 1-4 for backend stability)

26. M9: Move HandleGroupJoin DB query off readPump goroutine
27. A9: Restrict WebSocket Origin to explicit sources
28. G11: Add frontend component tests
29. G12: Add Error Boundary
30. Frontend god component decomposition

## Quick Wins (low effort, high impact)

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| C2 | Fix ParseUnverified | 1h | Prevents auth bypass |
| C3 | Replace err.Error() with generic messages | 2h | Stops info disclosure |
| G1 | Add security headers middleware | 1h | Defense in depth |
| G3 | Redis password config | 30min | Prevent unauthorized access |
| C8 | Change rate limiter to fail-closed | 30min | Prevent brute-force on Redis failure |
| A9 | Reject empty Origin in WS | 30min | Prevent cross-origin WS attacks |
| G8 | Add basic Makefile | 1h | Developer experience |

## Deep Refactors (high effort, high impact)

| # | Scope | Effort | Impact |
|---|-------|--------|--------|
| A1+A2+A6 | Refactor handlers + middleware | 3-5 days | SRP compliance, testability |
| A10+A11+A12 | Add DI interfaces everywhere | 2-3 days | Full testability, IoC |
| Frontend gods | Decompose GroupChatWindow, DashboardContext, Sidebar | 5-7 days | Maintainability, render perf |
| JWT overhaul | Claims, rotation, blacklist, revocation | 2-3 days | Auth security baseline |
| G6+G7+G8 | CI/CD + Docker + Makefile | 2-3 days | Deployment readiness |

## Frontend Summary

### CRITICAL BUGS (5 -- all confirmed active)
1. BugReportModal badly nested in DOM (Welcome.jsx)
2. stopRecording no-op handler (GroupChatWindow.jsx:279)
3. DashboardContext loading deadlock: dataReady never true on partial fetch failure
4. Touch devices can't access message menu (group-hover/bubble requires hover)
5. Inconsistent AuthLayout prop types (Register.jsx vs Login.jsx)

### Architecture Issues
- 3 God components: GroupChatWindow (1592 lines), DashboardContext (934 lines), Sidebar (531 lines)
- 4 duplicated patterns: audio recorder, media renderer, scroll-to-bottom, wallpapers
- No centralized modal system
- DashboardContext provides 60+ values causing mass re-renders
- useWebSocket ref-counting race condition in StrictMode
- Tailwind v4 config mismatch (tailwind.config.js empty, not used)

### Design/UX (all confirmed)
- Inconsistent border radii: rounded-2xl, rounded-[1.8rem], rounded-[2rem], rounded-[2.5rem], rounded-[26px]
- Mixed shadow approaches
- Inconsistent gray palette (slate/gray/white opacity mix)
- Poor empty states
- Hardcoded font sizes
- Missing aria attributes

## Test Coverage Assessment

### Current State
- 15 Go test files (8 utils, 3 services, 3 handlers, 1 repos)
- Zero integration tests (tests/integration/ directory exists but empty)
- No frontend tests (no Jest/Vitest configuration found)
- Coverage ~59% (backend only)

### Coverage Gaps
- No tests for: WebSocket Hub/Client, Group services, Call services, Status services, Media services, Cache layer, Migration scripts, Bug report service
- No integration tests for: Auth flow, Chat flow, Contact flow (all documented in README as TODOs)
- No E2E tests
- No performance/load tests

## Ready for Proposal

YES. The exploration is comprehensive enough for the orchestrator to proceed with sdd-propose. Recommended scope:

1. **Change name**: whatsapp-audit-fix
2. **Scope**: Fix CRITICAL (7) + HIGH (14) + security gaps (G1-G5) + infrastructure (G6-G8) in a phased approach
3. **Out of scope this change**: LOW issues (20), MEDIUM issues (18), frontend component decomposition (separate change), E2E tests (separate change)
4. **Estimated effort**: 8-12 days for Phases 1-4 (backend critical+high+infra)

The orchestrator should decide whether to tackle all phases in one change or split into: (a) security-hardening, (b) architecture-cleanup, (c) infrastructure-readiness as separate SDD changes.
