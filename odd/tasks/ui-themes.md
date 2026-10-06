# Feature: ui-themes

## Objective
Let each user pick the UI theme. The current UI is dark only. Offer: **Oscuro** (current look, default), **Claro**, five pastel light themes (**Rosa**, **Menta**, **Lavanda**, **Durazno**, **Cielo**), and **Automático**, which follows the OS `prefers-color-scheme` (Oscuro/Claro).

## Problem / Why
Users asked for a lighter interface; today the dark palette is hardcoded across the app.
- Tailwind 4, CSS-first (`frontend/src/index.css:10-82` `@theme`). The palette names are already used as semantic roles: `indigo-*` is overridden to WhatsApp green (accent, own bubble), `slate-*` to a blue-grey (backgrounds, panels, text), and `purple-*` to cyan. `body` is `bg-slate-950 text-slate-100`.
- About 900 slate/indigo utilities in about 50 files. About 290 white/black alpha overlays (`bg-white/10`, `border-white/10`, `text-white`, `bg-black/20`, ...) only work on a dark background.
- Hardcoded rgb/hex values: `index.css` (`::selection`, scrollbars, `--shadow-glow`), `ToastContainer.tsx:155,160`, `DashboardFeature.tsx:236`, `utils/notifications.ts`.
- `emojiPickerLoader.ts:14` forces `picker.classList.add('dark')`.
- PWA: `index.html:8` `theme-color #0a1015`, `pwa/manifest.ts:14-15` (static manifest stays dark; runtime `<meta name="theme-color">` follows the theme).
- No theme mechanism, `dark:` variant or `prefers-color-scheme` usage today.
- Settings entry point: Sidebar "Ajustes" (`Sidebar.tsx:266`) opens `ProfileModal.tsx`, which already has "Fondo Global de Chats" (`:200`).

## Scope / Authorized
User request 2026-10-06: add a feature to choose the UI theme (light, pastel, several alternatives). Branch `feat/ui-themes` from `main` after the roadmap merge.
Out of scope: syncing the theme across devices through the backend (possible follow-up: `theme` column on users), per-chat theme, custom user-defined colors, changing the static PWA manifest colors.

## Decisions (defaults)
- **CSS variables per theme, not `dark:` variants.** `@theme` maps `--color-slate-*`, `--color-indigo-*`, `--color-purple-*` to `var(--t-*)` tokens defined on `:root[data-theme="<id>"]`. Light themes invert the slate scale (950 = lightest background, 100 = darkest text), so existing classes keep their role. Rejected: `dark:` twins on about 900 utilities, which scale to only 2 themes.
- **Semantic tokens for overlays:** add `--color-fg`, `--color-fg-muted`, `--color-on-accent`, `--color-overlay` (hover/fill), `--color-overlay-strong`, `--color-border-subtle`, `--color-scrim`, per theme. Migrate `white/*`, `black/*` and `text-white` to them. Keep `text-white` only on accent-filled surfaces through `text-on-accent`.
- **Persistence:** `localStorage` key `whatsapp-fake:theme`, per device. An inline script in `index.html` applies `data-theme` before React mounts (no flash). Unknown or absent value -> `dark`. `auto` resolves through `matchMedia('(prefers-color-scheme: light)')` and listens for changes.
- **ThemeProvider + useTheme** (`frontend/src/features/theme/`): registry `themes.ts` (id, label, swatches, scheme light|dark, metaColor), sets `documentElement.dataset.theme`, `style.colorScheme`, `<meta name="theme-color">`, and the emoji picker `dark`/`light` class.
- **Picker UI:** a "Tema" section in `ProfileModal.tsx` before "Fondo Global de Chats": a `role="radiogroup"` of swatch buttons (`role="radio"`, `aria-checked`, label), applied instantly.
- **User content keeps its colors:** status `BG_COLORS`, chat wallpapers, sticker art and avatars.
- **Contrast:** each theme must give >= 4.5:1 for body text on background and panel, and for bubble text on both bubbles; this is enforced by a unit test over the registry token values.
- **Tests decoupled from palette classes:** bubbles get `data-own="true|false"`; the sticker unit tests, `Sidebar.system.test.tsx:64` and `e2e/stickers.e2e.ts` stop matching `bg-indigo-`/`bg-slate-` names.

## Constraints
- TS strict, no `any`. UI copy in Spanish; code, comments and tests in English.
- Conventional Commits, no AI attribution, explicit pathspecs. One commit per task.
- `POSTGRES_PUBLIC_PORT=55432` on every docker compose; wait ~65s between Playwright runs (login rate limit).
- The dark theme must look the same as before (no visual regression for current users).

## TDD
Runners: `cd frontend && npm run test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:e2e`.
RED examples: registry test (every theme defines every token; contrast >= 4.5); `useTheme` sets `data-theme`, persists, falls back to dark on garbage, resolves `auto` via mocked `matchMedia`; ProfileModal radio selection calls `setTheme`; e2e: choose "Rosa", `html[data-theme="rosa"]`, survives reload, login page keeps it.

## Tasks
- [x] UT1 Theme engine: tokens per theme in `index.css` (remap slate/indigo/purple + semantic tokens + selection/scrollbar/glow), `index.html` bootstrap script, `features/theme/` (`themes.ts`, `ThemeProvider`, `useTheme`), emoji picker class, meta theme-color. Tests: registry completeness + contrast, provider behavior. Route: delegated. → Done delegated direct (writer).
- [x] UT2 Picker: "Tema" radiogroup with swatches in `ProfileModal.tsx`; tests. Route: delegated (with UT1 writer if small) or inline. → Done delegated direct (writer): `features/theme/ThemePicker.tsx` (presentational, roving tabindex, arrow keys with wraparound, 4-column grid) used by `ProfileModal` via `useTheme()`.
- [ ] UT3 Overlay migration, dashboard core: `Sidebar`, `ChatWindow`, `MessageList`, `GroupChatWindow`, `MessageInput`, `GroupMessageInput`, sticker panel; `data-own` on bubbles; update color-class tests. Route: delegated.
- [ ] UT4 Overlay migration, modals and secondary surfaces: profile/contact/group modals, status, calls, reactions, toasts, notifications. Route: delegated.
- [ ] UT5 Overlay migration, auth and standalone pages: Welcome, Login, Register, RecoverPassword, UnblockAccount, Activate*. Route: delegated.
- [ ] UT6 E2E + docs + close: `frontend/e2e/themes.e2e.ts` (pick theme, persisted after reload, applied on login page, `auto` follows emulated color scheme), visual check of each theme at phone and desktop width, README section, doc + mirror. Route: delegated.

## Acceptance criteria
- "Ajustes" shows a "Tema" selector with 8 options; choosing one restyles the whole app instantly, including auth pages, and survives reload with no flash.
- Oscuro looks like today. Claro and pastels are legible everywhere (no invisible white-on-light overlays, contrast test green).
- Automático follows the OS setting live.
- typecheck, lint, test, build, full e2e green.

## Risks
- Missed overlays render invisible on light themes: mitigated by per-surface migration tasks, a grep guard test (no `white/` or `black/` alpha utilities outside an allowlist) and the visual pass in UT6.
- Inverting slate for light themes can mis-map a shade used with a different role; fix per call site during migration.

## Progress / Evidence
- UT1 done (commit 55b6bae, review approved/burned, boundary 55b6bae): `@theme` slate/indigo/purple -> `var(--t-*)` + 7 semantic tokens (`fg`, `fg-muted`, `on-accent`, `overlay`, `overlay-strong`, `border-subtle`, `scrim`); 7 theme blocks; `index.html` bootstrap; `features/theme/` (registry, provider via `useSyncExternalStore`, storage sync); emoji picker follows `colorScheme`. Dark tokens verified identical to the previous palette (33/33). typecheck/lint/build green, full Vitest 145 files / 1287 tests. RED observed for the registry/contrast tests (59 failed with old CSS); provider and loader tests were written after the implementation (no RED observed).
- UT2 done: `ThemePicker` + "Tema" section in ProfileModal before "Fondo Global de Chats"; RED observed (ThemePicker import missing, ProfileModal "Tema" group absent) then GREEN; TRF2-TRF4 folded in. typecheck, lint and build green; full Vitest 146 files / 1294 tests.

## Review follow-ups (advisory, slice a9282dc..55b6bae)
Reviewed from Claude Code (lineage review-9b64870a73b1dd0f, medium, reliability, user granted): approved/acknowledged, burned. Boundary now 55b6bae.
- [x] TRF1 (WARNING) `themes.test.ts:8-10` reads CSS/HTML via `process.cwd()`: won't fix, same convention as `src/pwa/manifest.test.ts` and `builtinPack.test.ts`; Vitest always runs from `frontend/`.
- [x] TRF2 (SUGGESTION) `themes.test.ts:165-170`: restore `matchMedia` in `try/finally` and assert the bootstrap `colorScheme`. Fold into UT2. → Done in UT2.
- [x] TRF3 (SUGGESTION) `ThemeProvider.tsx:33-35`: handle `StorageEvent` with `key === null` (another tab cleared storage) and cover a throwing `getItem` at mount. Fold into UT2. → Done in UT2: provider re-reads storage on `key === null`; two new provider tests.
- [x] TRF4 (SUGGESTION) `emojiPickerLoader.ts:15`: picker class is set once at creation; if instances are reused they keep a stale dark/light class. Verify reuse and update the class on theme change. Fold into UT2. → Done, no code: `FullEmojiPicker` creates a fresh picker on every open and removes it on unmount (no cache/reuse), so the class is always read from the current scheme; a theme change while the dialog is open is not reachable from the UI (the theme picker lives in the profile modal).

## Assumptions
- Theme list, `Automático` option and per-device storage chosen as defaults (user asked for "light, pastel, several alternatives"; no further spec).

## Next step
UT2 picker in ProfileModal.
