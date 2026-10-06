# Feature: stickers-full

## Objective
Build on `stickers-basic` to add the complete sticker experience: custom stickers made from the user's own images (cropped square and converted to WebP 512x512), a per-user server-side library ("Mis stickers", "Favoritos", "Recientes"), animated stickers, multiple built-in packs with a tab bar, search by tag, saving a received sticker, and deleting from "Mis stickers". Custom stickers are stored in MinIO under a `stickers/` prefix, validated by type, dimensions and size, and deduplicated by content hash.

## Problem / Why
After `stickers-basic`, users can only send the fixed built-in pack. They cannot make their own, keep favorites, find a sticker by keyword, or reuse a sticker someone sent them. Recents are not shared across devices.

Relevant current code (verified on `feat/security-hardening`; re-check line numbers after `stickers-basic` lands):
- Upload pipeline: `POST /api/v1/upload` (`backend/routers/api/api.go:106`) -> `HandlerUploadMedia` (`backend/handlers/handlerMedia.go:24-60`, body cap `maxUploadBody` 110 MB, `:11`) -> `ServiceMedia.UploadMedia` (`backend/services/serviceMedia.go:96-171`). The MIME allowlist `allowedTypes` (`serviceMedia.go:23-42`) already includes `image/webp` (10 MB, folder `images`). The magic-byte check `verifyContent` (`:220-237`) uses `http.DetectContentType` and rejects HTML/XML/SVG. The object key is `<folder>/<yyyy-mm>/<xid><ext>` (`:130-132`). The URL is `/storage/<bucket>/<key>` or `MEDIA_PUBLIC_BASE_URL/<key>` (`:145-149`).
- URL safety: `utils.IsSafeMediaURL` (`backend/utils/validationMedia.go:31-43`). `stickers-basic` adds `IsBuiltinStickerURL` plus a `sticker` branch in `validateMessageContent` (`backend/services/validation.go:31-46`).
- Media GC for disappearing messages: `RepoExpiry.ExpireBatch` (`backend/repos/expiryData.go:210-230`) enqueues keys from `ServiceMedia.ObjectKeyFromURL` (`serviceMedia.go:183-197`). Before deleting, the GC checks `MediaKeyReferenced` / `mediaReferencedSQL` (`expiryData.go:312-336`), which covers messages, group_messages, statuses, user/contact wallpapers, user avatar and group avatar. **A custom sticker object referenced only by a `user_stickers` row would be deleted when a disappearing message using it expires**, unless the new table is added to `mediaReferencedSQL`.
- Rate limiting: in-memory per-IP `middleware.NewRateLimiter(limit, window)` (`backend/middleware/rateLimit.go:27`), used for bug reports (`backend/routers/central.go:46`) and auth (`backend/routers/log/log.go:35-36`). The upload route has no limiter today.
- Migrations: GORM `AutoMigrate` (`backend/database/postgres.go:109`) plus raw SQL (`execMigration`) for constraints and partial indexes (the pattern used by `pwa` PW8 for `client_id`).
- Frontend send path: identical to `stickers-basic` (`useMessaging.handleSend`/`useGroupMessaging.handleSend` media branch, online-only). The sticker panel (`frontend/src/features/stickers/StickerPanel.tsx`) and the manifest (`frontend/src/features/stickers/builtinPack.ts`) come from `stickers-basic`.

## Scope / Authorized
Authorized implementation from `feat/stickers-basic` (HEAD 754916b) on branch `feat/stickers-full`. User authorized SF1→SF8 with TDD, one commit per task, RDD per slice, and consent grant for reviews (confirmed by user instruction; revocable at any time).
Scope: sticker upload endpoint plus validation and dedupe, `user_stickers` (+ favorites, recents) persistence and owner-only endpoints, GC integration, a client-side creator (pick image, crop square, WebP 512x512, size cap), panel v2 (tabs, search, favorites, delete, save received), animated WebP stickers, more built-in packs, tests, docs.
Out of scope: background removal (unless the open question below picks a cheap option), Lottie/TGS animation (default), sticker pack sharing/marketplace, server-side moderation, offline queueing of stickers.

## Dependencies / ordering
- **Requires `stickers-basic`** (rendering, panel, manifest, backend `sticker` URL rule).
- Roadmap order: `web-push` -> `stickers-basic` -> **`stickers-full`** -> `api-casing` (last; it renames the contract). All endpoints and JSON fields here are **brand-new, so they use camelCase** (`id`, `url`, `sha256`, `animated`, `favorite`, `tags`, `createdAt`, `lastUsedAt`). Message payloads keep their existing PascalCase (`MediaType`, `MediaUrl`). No new fields are added to existing schemas.
- Branch: `feat/stickers-full` from `feat/stickers-basic` (or the latest chain branch) at implementation time.

## Decisions (recommended defaults)
- **Dedicated endpoint, not `/api/v1/upload`.** `POST /api/v1/stickers` (multipart `file`, optional `tags` CSV) with its own body cap (1 MB) and rule set. Reusing `/upload` would apply the 10 MB image limit, the dated xid keys (no dedupe) and the `image` media type.
  - Validation: sniffed type must be `image/webp` (static or animated), or optionally `image/png` as a fallback (see the Safari note below). Decode the header to read dimensions. `golang.org/x/image/webp` `DecodeConfig` is not in `go.mod` today and must be added (to verify that it reads the VP8X canvas size of animated WebP; if not, parse the RIFF/VP8X header by hand, which is ~40 lines with tests). Dimensions must be exactly **512x512** (the client always produces that). Size caps: **static <= 300 KB, animated <= 1 MB** (WhatsApp uses roughly 100 KB / 500 KB; to verify; ours is more lenient because the canvas WebP encoder is less efficient). Animated = VP8X flag `ANIM` set. Reject HTML/XML/SVG as `verifyContent` does.
  - Dedupe: SHA-256 of the bytes. Object key is **`stickers/<sha256>.webp`** (content-addressed, so identical bytes are stored once across all users). Upload with `PutObject` only if `StatObject` says the key is missing. URL is `/storage/<bucket>/stickers/<sha256>.webp`. Tradeoff: global dedupe saves storage, but a user who uploads exact bytes learns those bytes already exist (negligible for stickers). Alternative: a per-user prefix `stickers/<userID>/<sha>.webp` (no cross-user leak, less dedupe). See the open question.
  - Rate limit: `NewRateLimiter(30, time.Hour)` on `POST /stickers` (per IP; the existing limiter is in-memory and single-instance). Per-user cap of **200** custom stickers (`409`/`400` with a clear Spanish message).
- **Persistence (new tables, AutoMigrate + raw SQL indexes):**
  - `user_stickers`: `id`, `owner_telephon` (or user id, following how `messages.id_user` references users; to verify), `sha256 char(64)`, `url varchar(500)`, `animated bool`, `tags text` (lowercased, comma-joined, max 5 tags x 20 chars), `favorite bool`, `created_at`, `deleted_at` (soft delete, like other models). Unique `(owner, sha256) WHERE deleted_at IS NULL`, so a duplicate upload returns the existing row (200) instead of creating a new one (201).
  - Favorites also apply to built-in stickers, so use a separate `sticker_favorites (owner, url, created_at)` unique `(owner, url)` with the url validated by `IsBuiltinStickerURL || owned custom sticker url`. Alternative: only custom stickers can be favorites (simpler, but a worse UX).
  - `sticker_recents (owner, url, last_used_at)` unique `(owner, url)`, capped at 30 per owner (delete the oldest on upsert). **Recorded server-side on a successful sticker send** in `serviceChat` (`:109` area) and `serviceGroup` (`:343` area) after persistence. This avoids an extra client request and works across devices. A recents failure must never fail the send (log only).
- **Endpoints (owner-only; the owner comes from the auth context, never from the request):**
  - `POST /api/v1/stickers` (upload/save; 201 new, 200 existing).
  - `POST /api/v1/stickers/save` `{url}`: "Añadir a mis stickers" from a received sticker. Accepted only for `/storage/<bucket>/stickers/<sha256>.webp` URLs (or the public-base equivalent) whose object exists. This creates a `user_stickers` row that references the same object with no copy. Built-in URLs go to favorites instead.
  - `GET /api/v1/stickers` -> `{mine: [...], favorites: [...], recents: [...]}` (one round-trip for the panel). Lists are capped (200/100/30).
  - `PUT /api/v1/stickers/favorites` `{url, favorite: bool}`.
  - `DELETE /api/v1/stickers/:id`: soft-deletes the row (404 if not owned; never 403, so other users' ids are not leaked). **The object is not deleted directly.** If no row references it any more, enqueue the key into the existing media GC queue, and the GC deletes it only when `MediaKeyReferenced` is false. Messages already sent with the sticker therefore keep rendering while any message references it.
- **GC integration:** add `OR EXISTS (SELECT 1 FROM user_stickers WHERE deleted_at IS NULL AND right(url, @n) = @suffix)` (plus `sticker_favorites`/`sticker_recents` url) to `mediaReferencedSQL` (`expiryData.go:317-323`). Add an integration test where an expired disappearing message with a saved custom sticker keeps the object.
- **Message URL rule for stickers:** keep the `stickers-basic` rule (`IsBuiltinStickerURL || IsSafeMediaURL`). Optional tightening: for `sticker`, require builtin or a `.../stickers/<sha256>.(webp|png)` storage URL (`.png` only for the Safari fallback below) (rejects arbitrary external http(s) URLs as stickers). Recommended as part of SF1, with tests.
- **Client creator (no server-side image processing):** pick an image (`<input type=file accept="image/*">`), use a square crop UI (drag/zoom on a canvas; a hand-written ~150-line component, or `react-easy-crop`, to verify weight), draw to a 512x512 canvas (`object-fit: contain` on transparent so non-square content keeps its aspect), then `canvas.toBlob(cb, 'image/webp', q)`. Loop the quality down 0.9 -> 0.5 until the blob is under 300 KB, and fail with a clear message otherwise.
  - **Safari note:** Safari historically does not encode WebP in `toBlob` and silently returns PNG (to verify on the current Safari/iOS). Check `blob.type`. If it is not `image/webp`, either (a) upload PNG and let the backend accept `image/png` 512x512 <= 300 KB for stickers, or (b) block creation on that browser. Default: (a), with the key extension following the type (`stickers/<sha256>.png`); the SF1 URL rule, dedupe key and upload validation must accept both `.webp` and `.png`.
  - **Background removal: out of scope by default.** A cheap option is a "remove flat background" toggle (flood-fill from the corners within a color tolerance, done client-side on the canvas, ~60 lines, which works for screenshots/solid backgrounds). An ML segmentation (e.g. `@imgly/background-removal`, several MB of WASM/model) is rejected for weight. Default: keep the background and offer an optional rounded-corner mask.
- **Animated stickers:** support **animated WebP uploaded as-is** (canvas cannot encode animation, so there is no client re-encode). The user picks an animated `.webp` that is already 512x512 (or the creator rejects it with guidance). GIF -> animated WebP conversion is not done (it would need a WASM encoder, too heavy). Rendering is a plain `<img>`. Animated WebP is supported in Chrome, Edge, Firefox 65+ and Safari 14+ (to verify on caniuse). `prefers-reduced-motion`: show a static first frame by drawing the image to a canvas (`createImageBitmap` gives the first frame), to verify cost. Default: respect it in the panel grid (static thumbnails) and animate in the message list.
  - **Lottie: not in default scope.** `lottie-web` adds ~250 KB min (to verify; the `lottie_light` build is smaller) plus a JSON validation surface. Add it only if the user wants vector animations.
- **Panel v2:** a tab bar of icons: Recientes, Favoritos, Mis stickers (with a "+" create tile), then one tab per built-in pack. Add 1-2 more original packs generated by the `stickers-basic` script. The manifest gains `tags` per sticker (already in the shape). A search input filters across built-in tags plus custom sticker tags, case- and accent-insensitive (`normalize('NFD')`), client-side, since the lists are small. On long-press/right-click of a tile: Favorito, Eliminar (own only). Received sticker message menu: "Añadir a mis stickers" / "Añadir a favoritos". Data via a `useStickerLibrary` hook (fetched on first panel open, cached in memory, invalidated on mutations).
- **Offline:** unchanged from basic. Stickers are online-only media (toast). The library fetch fails gracefully offline: show the built-in packs only, plus a "Sin conexión" hint on the server-backed tabs. `/storage/*` stays uncached by the SW, so custom stickers do not render offline (accepted).

## Constraints
- TS strict, no `any`; M4b runtime guards on all new API responses (guarded parsing like the outbox store). Go `go vet` clean.
- Owner-only authorization on every endpoint. Validate url shapes server-side, and never trust the client's MIME/dimensions.
- Conventional Commits, no AI attribution, explicit pathspecs; one commit per task (or work unit).
- Never `docker compose down -v` unless intended; never `go test -tags integration` against the shared stack. Repo race/integration tests follow the PW8 note (e2e-tagged file).
- New endpoints/fields camelCase until `api-casing`.

## TDD
Strict TDD. Runners: `go test ./...`, `go vet ./...`, `make test-integration` (for the GC/reference SQL), Go e2e `-tags e2e`; `cd frontend && npm run test`, `typecheck`, `lint`, `build`, `test:e2e`.
RED examples: a sticker validator table test (non-512 dimensions, 301 KB static, SVG renamed `.webp`, HTML, an animated WebP over 1 MB) before the validator exists; a repo test where a duplicate `(owner, sha256)` returns the existing row; a GC test where an object referenced only by `user_stickers` is not deleted; a Vitest test where the crop/encode helper outputs a 512x512 blob <= the cap (canvas mocked or `@napi-rs/canvas`-free pure math for the crop rect); a `useStickerLibrary` guard test that drops malformed rows.

## Tasks
- [ ] SF1 Backend sticker validation + storage: `services/serviceSticker.go` (validate type/dims/size/animation flag, SHA-256, content-addressed key, `StatObject` skip), the WebP header parser or the `x/image/webp` dep (to verify), the optional tightened `sticker` URL rule in `validateMessageContent`. Unit tests with fixture bytes (tiny static and animated WebP fixtures under `backend/services/testdata/`). Route: delegated (opus writer: security-sensitive validation).
- [ ] SF2 Persistence + endpoints: models `UserSticker`, `StickerFavorite`, `StickerRecent`; AutoMigrate + partial unique indexes via `execMigration`; repo (idempotent create returns existing, owner-scoped list/delete, favorites upsert/delete, recents upsert + trim to 30); handlers + routes (`POST /stickers`, `POST /stickers/save`, `GET /stickers`, `PUT /stickers/favorites`, `DELETE /stickers/:id`); rate limit on upload; 200-sticker cap. Handler/service tests incl. cross-user access returns 404. Route: delegated (opus writer: migration + authz).
- [ ] SF3 GC + recents integration: `mediaReferencedSQL` += sticker tables; on delete, enqueue the key when unreferenced; record recents on a successful 1:1/group sticker send (failure logged, not surfaced). `make test-integration` cases: an expired message keeps a saved sticker object; deleting the last reference GCs it; a recents trim. Route: delegated.
- [ ] SF4 Frontend API + library hook: `frontend/src/api/stickerApi.ts` (typed, guarded parsing), `useStickerLibrary` (fetch on first open, optimistic favorite toggle with rollback, delete, save-from-message), types in `frontend/src/types/api.ts` (camelCase). Vitest. Route: delegated.
- [ ] SF5 Creator: `StickerCreator` (file pick, square crop, optional rounded mask / flat-background toggle per decision, 512x512 canvas, WebP encode with a quality loop + Safari PNG fallback, size cap message, tags input), upload via `stickerApi`, added to "Mis stickers" and optionally sent right away. Animated `.webp` pick path: client checks the size and 512x512 via `createImageBitmap` and uploads as-is. Vitest for pure helpers (crop rect math, quality loop with a mocked encoder, type fallback). Route: delegated.
- [ ] SF6 Panel v2: tab bar (Recientes, Favoritos, Mis stickers, packs), search by tag (accent-insensitive), tile context menu (Favorito / Eliminar), reduced-motion static thumbnails, offline hint; extra built-in packs via the `stickers-basic` script (append-only manifest). Received sticker menu: "Añadir a mis stickers" / "Añadir a favoritos". Component tests. Route: delegated.
- [ ] SF7 Playwright: Ana creates a custom sticker from a fixture PNG -> sends to Luis -> Luis sees it; Luis saves it to "Mis stickers" (no new object: assert the same URL); Ana favorites a built-in sticker and it appears in Favoritos after reload; recents show the last sent first; Ana deletes her custom sticker and the old message still renders; a duplicate upload returns the same URL; an oversize/non-square upload is rejected with a message; search by tag filters; an animated WebP fixture renders. Go e2e for the endpoints (authz, dedupe race with N goroutines -> one row, one object). Two green runs. Route: delegated.
- [ ] SF8 Docs + close: README section (limits, formats, dedupe, GC behavior, privacy note), feature doc + mirror. Route: inline (docs).

## Acceptance criteria
- A user can create a sticker from an image (square crop, 512x512 WebP or the PNG fallback, <= 300 KB), and it appears in "Mis stickers" on every device/session.
- Uploading the same bytes twice (same or different user) stores one object. The same user gets the existing entry back.
- Favorites (built-in and custom) and recents (last 30, recorded on send) persist server-side and are owner-only. Other users' ids return 404.
- Deleting from "Mis stickers" removes it from the library, but previously sent messages keep rendering. The object is GC'd only when nothing references it. Disappearing-message expiry never deletes a saved sticker.
- Animated 512x512 WebP <= 1 MB uploads and plays. Oversize, wrong dimensions, SVG/HTML or non-image are rejected with clear Spanish errors.
- Tab bar with multiple packs; search by tag finds built-in and custom stickers.
- Upload endpoint rate-limited; per-user cap enforced.
- No `any`; all Go/frontend checks and e2e (twice) green.

## Risks
- **Storage growth:** mitigated by the size caps (300 KB / 1 MB), the per-user cap of 200, content-addressed dedupe, and GC of unreferenced objects. Monitor bucket size (observability feature metrics, if present).
- **Abuse / moderation:** users can turn any image into a sticker and send it, the same as images today, with no moderation pipeline. Saved-from-message reuse spreads content without re-upload. Mitigations in scope: rate limit, caps, owner-only libraries, delete. Out of scope: reporting/moderation and hash blocklists (possible later via the stored `sha256`).
- **Content-addressed keys** reveal that identical bytes exist (low impact). Per-user prefixing is the alternative.
- **Browser encoding differences** (Safari WebP encode, to verify), and the canvas WebP quality/size tradeoff.
- **GC correctness:** missing a referencing table deletes live stickers. Pinned by integration tests.
- **Animated WebP header parsing** edge cases (malformed RIFF chunks). Fuzz/table tests on the parser.
- **In-memory rate limiter** is per instance and per IP (NAT users share it). It is acceptable for the current single-instance deployment.

## Open questions (user decision)
- **Background removal:** recommended default = none (keep background, optional rounded mask). Cheap option = client-side flat-background flood-fill toggle. ML removal rejected (multi-MB).
- **Animation format:** recommended default = animated WebP uploaded as-is (no conversion). Option: add Lottie (`lottie-web`, extra weight) for vector animations.
- **Dedupe scope:** recommended default = global content-addressed `stickers/<sha256>.webp`. Option: per-user `stickers/<user>/<sha256>.webp`.
- **Favorites of built-in stickers:** recommended default = yes (separate `sticker_favorites` keyed by url). Option: custom-only favorites.
- **Limits:** recommended defaults = 512x512 exact, static <= 300 KB, animated <= 1 MB, 200 custom stickers/user, 30 recents, upload 30/hour/IP.
- **Safari WebP encode fallback:** recommended default = accept PNG 512x512 for stickers. Option: block creation on browsers without WebP encoding.

## Progress / Evidence
- 2026-10-06: SF3 done (commit 3a8d8bd, delegated direct, 12 files +847/-19): sticker tables in `mediaReferencedSQL`, delete enqueues key when unreferenced, server-side recents on 1:1/group sticker send, animated sniff on save + sha hardening + favorite reconcile (RF1/RF4/RF5/RF6 closed). Integration `sticker_gc_test.go` (sharedLogin; expired keeps object; last-ref delete GCs; 31→30 trim). RED observed, GREEN `go test ./...` + integration 90.9s. Parent spot check `go build` ok.
- 2026-10-06: SF4 done (commit 1114c86 incl. correction, delegated direct, 6 files +675/-1): `stickerApi.ts` + `useStickerLibrary` + types as above; correction added per-URL rollback, rejection/empty-sha tests. RED observed, GREEN 20 tests + suite 1123 passed, typecheck/lint clean. Parent spot check ok.
- 2026-10-06: SF4 review slice 3a8d8bd..1114c86 (medium, reliability, lineage review-3a7df1a0ce766455): consent granted per standing authorization; lens found R3-001 CRITICAL (stale-snapshot optimistic rollback) + R3-002/003/004 test gaps. Bounded correction 91/120 lines (per-URL functional rollback + interleaved test, rejection tests, empty-sha guard), targeted validation green → **approved/acknowledged, authority burned**. R3-001–004 closed by the correction; no new follow-ups. **Boundary now 1114c86.**
- 2026-10-06: SF3 review slice f5499fa..3a8d8bd (medium, reliability, lineage review-7bf689c32b377226): consent granted per standing authorization; lens admitted with 0 blockers → **approved/acknowledged, authority burned** (no correction). 6 advisories recorded as RF9–RF14 below (non-blocking; receipt stands). **Boundary now 3a8d8bd.**

## Review follow-ups 2 (advisory, slice f5499fa..3a8d8bd)
All backend test-coverage gaps; fold into SF7 (Go endpoint e2e / backend tests). No re-review of 3a8d8bd.
- [ ] RF9 (WARNING) `app.go:227,229`: WithRecents production wiring untested (integration builds its own service). Exercise via HTTP/production wiring in SF7.
- [ ] RF10 (WARNING) `serviceChat.go:219` / `serviceGroup.go:438`: idempotent-replay guard (no recents reorder on duplicate) untested. Add replay tests. → SF7.
- [ ] RF11 (WARNING) `serviceStickerLibrary.go:314,331`: delete log-and-continue branches (favorite-reconcile / MediaKeyReferenced / enqueue errors) untested. Add error-injection cases. → SF7.
- [ ] RF12 (WARNING) `expiryData.go:326`: favorites/recents reference clauses proved only in false branch. Add live-favorite/recent true-branch assertion. → SF7.
- [ ] RF13 (SUGGESTION) `serviceStickerLibrary.go:329`: check-then-enqueue race relies on job re-check; untested. Add enqueue-then-reference survival test if cheap. → SF7.
- [ ] RF14 (SUGGESTION) `serviceStickerLibrary.go:120`: minio→MinioStickerStore production adapter untested. Add wrap/assertion test. → SF7.
- 2026-10-06: branch `feat/stickers-full` created from `feat/stickers-basic` @ 754916b (verified via `git branch --show-current`). Note: instruction cited HEAD 9905a9f, but the live chain had advanced to 754916b (docs + e2e hardening c94dbe8/8965944/754916b); branched from current HEAD to avoid losing work.
- 2026-10-06: SF1 review slice 8965944..6914fc0 (medium, reliability, lineage review-eaf9d48ec86bdab3): consent granted per standing user authorization; lens found R3-001 CRITICAL (absolute-URL alternative accepted any host) + R3-002/003/004 WARNINGs (test gaps). Bounded correction 146/150 lines (relative-only utils regex + services-level public-base pinning via MEDIA_PUBLIC_BASE_URL + regression/boundary/animated-upload tests), targeted validation green → **approved/acknowledged, authority burned**. R3-002/003/004 closed as informational. **Boundary now 6914fc0.**
- 2026-10-06: SF2 review slice 6914fc0..f5499fa (medium, reliability, lineage review-e27e43e77a0e0c58): consent granted per standing authorization; lens admitted with 0 blockers → **approved/acknowledged, authority burned** (no correction). 8 advisory findings recorded as RF1–RF8 below (non-blocking; receipt stands). **Boundary now f5499fa.**

## Review follow-ups (advisory, slice 6914fc0..f5499fa)
Fold into the first task touching each file (same rule as stickers-basic RFs); no re-review of f5499fa.
- [x] RF1 (WARNING) → Done in SF3: SaveSticker derives `animated` from stored bytes (GetObject + SF1 header sniff; read-error → false, no save failure).
- [x] RF4 (WARNING) → Done in SF3: behavioral integration test writes 31 recents vs real Postgres, asserts trim to 30 + newest-first.
- [x] RF5 (SUGGESTION) → Done in SF3: explicit empty-sha/extensionless guards in `stickerKeyFromURL` + malformed-name/NotPanics tests.
- [x] RF6 (SUGGESTION) → Done in SF3: DeleteSticker removes the `sticker_favorites` row before the reference check + delete-while-favorite test (unit + e2e).
- [ ] RF2 (WARNING) `handlerSticker.go:35-41`: upload error mapping (409/400 branches) unexercised at HTTP boundary. Add handler upload-error cases. → SF7 (endpoint e2e/tests).
- [ ] RF3 (WARNING) `serviceStickerLibrary.go:141-148`: service upload failure path (SF1 rejection, IsInternalError branch) untested. Add invalid-file service case. → SF7.
- [x] RF4 (WARNING) → Done in SF3 (see above).
- [x] RF5 (SUGGESTION) → Done in SF3 (see above).
- [x] RF6 (SUGGESTION) → Done in SF3 (see above).
- [ ] RF7 (SUGGESTION) `models/sticker_test.go:12-18`: tautological constant-equality / struct-tag tests prove no contract. Replace with behavioral assertions or drop. → SF7.
- [ ] RF8 (SUGGESTION) `serviceStickerLibrary.go:115-121`: 200-cap is count-then-create (concurrent uploads can exceed it). Harden or document soft + race test. → SF7 (Go e2e already covers dedupe race; extend to cap race).

## Assumptions
- Open questions use documented defaults (no background removal, animated WebP as-is, global `stickers/<sha256>.webp`, favorites incl. built-in, limits 512x512 / 300KB / 1MB / 200 / 30 / 30-per-hour-IP, PNG fallback accepted). No product questions asked (user absent → defaults + noted here).
- Consent `granted` pre-authorized by user (revocable); still confirming it stays in force each time it is used.

## Next step
SF4 review slice, then SF5 (RED: crop-rect math / quality-loop with mocked encoder).
