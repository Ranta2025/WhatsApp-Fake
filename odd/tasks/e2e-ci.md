# Feature: e2e-ci

## Objective
A Playwright end-to-end suite (login, 1:1 chat, group incl. media, status, pagination) plus a GitHub Actions CI pipeline that runs the unit tests and the e2e suite against the Docker stack.

## Problem / Why
The repo has no CI (`.github/` only has skills). Browser smokes run by hand from ad-hoc scripts. The Go e2e suite (`-tags e2e`) is never run automatically, and `make test-integration` is broken because `POSTGRES_PORT` is missing, which leaves the DSN with `port=`. It passes when `POSTGRES_PORT=5432` is set (verified 2026-09-29: `ok gorm/backend/integration 7.1s`).

## Scope / Authorized
The user approved roadmap item "e2e-ci". Scope: the Playwright scaffold and specs, the Makefile fix and targets, `.github/workflows/ci.yml`, and a README section. Push, and therefore actually running on GitHub, is the user's decision. The workflow is verified locally only (actionlint if available, plus the same commands run locally).

## Decisions (orchestrator defaults)
- The specs live in `frontend/e2e/` with `frontend/playwright.config.ts`. `@playwright/test` is a devDependency. Exclude `e2e/`, `playwright-report/` and `test-results/` from the web Docker build context (`.dockerignore`) and from Vitest (`vitest` include/exclude) and tsconfig/eslint as appropriate.
- `baseURL` is `http://localhost` (overridable via `E2E_BASE_URL`). Chromium only, `workers: 1`, `retries: 2` on CI, trace/screenshot/video retained on failure, HTML reporter.
- Auth: a global setup logs in ana/luis/marta once and saves `storageState`, because of the rate limit of 20 logins per minute per IP.
- Specs use unique text (timestamp) and never assert absolute counts, since state is shared and the seed runs once per fresh DB. Use Chromium flags `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` for the voice note.
- Selectors to use:
  - tabs: `getByRole('tab', {name})`
  - demo group: "Equipo demo"
  - 1:1 input: placeholder `Escribe un mensaje...`
  - group input: placeholder `Escribe un mensaje en el grupo...`
  - aria-labels: `Adjuntar archivo`, `Grabar nota de voz`, `Detener y enviar nota de voz`
  - Add `data-testid` only where no accessible selector exists.
- CI: job `unit` runs `go test ./...`, then in `frontend` `npm ci`, lint, typecheck, test and build. Job `e2e` (`needs: unit`) runs `docker compose up -d --build --wait`, waits on `/healthz`, runs the Go e2e (`make test-integration`) and then Playwright. It uploads the report and test-results plus `docker compose logs` on failure, and finishes with `down -v`. No secrets. Use a buildx gha cache if simple. Pin `mailpit` if it helps reproducibility (optional).

## Constraints
- Branch feat/e2e-ci (from feat/message-pagination).
- Never run `-tags integration` (it TRUNCATEs tables) against the e2e stack.
- TS strict with no `any`, including in e2e files.
- Commits use Conventional Commits with no AI attribution. Use explicit pathspecs (`git reset -q` first).

## TDD
Strict TDD (session config). For e2e specs, RED means the spec fails meaningfully before it is correct, for example by asserting the wrong text or an absent element. Then GREEN against the running stack. The Makefile fix is RED (the current failure above) then GREEN.

## Tasks
- [x] E1 Makefile: add `POSTGRES_PORT=5432` to `test-integration` and add an `e2e` target (Playwright). RED/GREEN via `make test-integration`. Route: delegated.
- [x] E2 Playwright scaffold: dependency, config, global-setup storageState, `test:e2e` script, and exclusions (dockerignore, vitest, tsconfig, eslint). Route: delegated.
- [x] E3 Specs: login (valid + invalid), chat (Ana → Luis live), group (text with Marta + image + voice note seen by another member), status (Ana posts, Luis sees), pagination (scroll up in a seeded long chat loads older messages without jumping; seed via UI or API inside the spec, with a unique tag). Route: delegated.
- [x] E4 CI workflow `.github/workflows/ci.yml` (unit + e2e jobs) and a README section on running e2e locally. Validate with actionlint if installed, and otherwise with a YAML parse. Route: delegated.
- [ ] E5 Close: full local run of the e2e suite twice (to check it is not flaky), then doc + mirror.

## Acceptance criteria
- `npm run test:e2e` passes against a running stack, twice in a row.
- `make test-integration` passes.
- CI YAML is valid, with jobs mirroring the local commands.
- Unit checks stay green, with no `any`.

## Progress / Evidence
- Pre-check: the Go e2e suite passes with `POSTGRES_PORT=5432`, including the group media e2e (the pending GM1 follow-up).
- E1: RED `make test-integration` failed with DSN `port=` empty; GREEN after adding POSTGRES_PORT=5432: `ok gorm/backend/integration 6.4s`. Added `e2e` target.
- E2: RED smoke spec asserting a missing tab failed (auth via storageState worked); GREEN after restoring. typecheck/lint/test/build/test:e2e green; no `any`. Specs are named `*.e2e.ts` (Playwright testMatch) so Vitest ignores them; `tsconfig.e2e.json` is part of `npm run typecheck`.
- E3: RED on first run (2 real failures: sidebar preview duplicated the message text; wrong assumption on the pagination window, which is 200 not 50; `/user` key is `Telephon`); GREEN 7/7 specs (auth x2, chat, group text, group image+voice, pagination, status), no retries. Pagination seeds 230 msgs ana->marta via REST. typecheck/lint/vitest(274)/build green, no `any`.
- E4: `actionlint` (via `go run github.com/rhysd/actionlint/cmd/actionlint@latest`) clean on ci.yml. Steps mirror local runs: `go test ./...`, npm ci/lint/typecheck/test/build, `make test-integration`, `npx playwright install`, `npm run test:e2e`. Root `.gitignore` had `*.github`, which ignored `.github/`; added `!.github/`. Not exercised locally: `docker compose up --wait` cold start, playwright `--with-deps`, artifact upload.
- E4b (review hardening): specs now prove delivery (group media asserted by the exact upload URL from `POST /api/v1/upload`, no count baselines; status viewer advances a bounded loop to the unique text; voice note waits on the stop button; group text uses a scoped bubble helper; pagination asserts anchor offset within 40px). RED: wrong URL suffix and tolerance -1 both failed (offset 0.125px), restored to GREEN. CI: compose logs on `failure() || cancelled()`, curl `--max-time 5 --connect-timeout 2`, `cancel-in-progress` only on pull_request; README aligned; actionlint clean. typecheck/lint/vitest(274) green; test:e2e twice 7/7, no retries.

## Next step
E1–E4 via one Sonnet writer, one commit per task.
