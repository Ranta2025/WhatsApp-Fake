# Roadmap (ODD feature index)

Index of every feature in this repo, its branch, status, and feature document. Each document is self-contained: an agent (Claude, opencode, another model) can implement a pending feature from its document without re-exploring the codebase.

## Branch chain (all local, NOT pushed)
Branches are chained: each is created from the previous one. Push, PR and merge are the user's decisions.

`main` -> `feat/status-stories` -> `feat/typescript-migration` -> `feat/group-media` -> `feat/message-pagination` -> `feat/e2e-ci` -> `feat/group-read-receipts` -> `feat/message-search` -> `feat/observability` -> `feat/group-admin-permissions` -> `feat/reactions` -> (pending features, in the recommended order below)

Before creating a branch: `git branch --show-current`, `git status`, and branch from the LATEST feature branch in the chain (never from `main` while earlier branches are unmerged).

## Features
| Feature | Branch | Status | Document |
|---|---|---|---|
| status-stories | `feat/status-stories` | done | [status-stories.md](status-stories.md) |
| typescript-migration | `feat/typescript-migration` | done | [typescript-migration.md](typescript-migration.md) |
| group-media | `feat/group-media` | done | [group-media.md](group-media.md) |
| message-pagination | `feat/message-pagination` | done | [message-pagination.md](message-pagination.md) |
| e2e-ci | `feat/e2e-ci` | done (workflow only runs on GitHub after a push) | [e2e-ci.md](e2e-ci.md) |
| group-read-receipts | `feat/group-read-receipts` | done | [group-read-receipts.md](group-read-receipts.md) |
| message-search | `feat/message-search` | done | [message-search.md](message-search.md) |
| observability | `feat/observability` | done | [observability.md](observability.md) |
| group-admin-permissions | `feat/group-admin-permissions` | done | [group-admin-permissions.md](group-admin-permissions.md) |
| reactions | `feat/reactions` | done | [reactions.md](reactions.md) |
| disappearing-messages | `feat/disappearing-messages` | done | [disappearing-messages.md](disappearing-messages.md) |
| pwa | `feat/pwa` | pending | [pwa.md](pwa.md) |
| web-push | `feat/web-push` | pending | [web-push.md](web-push.md) |
| api-casing | `feat/api-casing` | pending | [api-casing.md](api-casing.md) |

## Recommended order for the pending features
1. **observability** - backend-only, independent, low blast radius, and gives metrics/request ids to debug everything after it.
2. **group-admin-permissions** - user-requested WhatsApp-style group roles/settings; introduces the persisted system-message discriminator (`Kind`) and typed permission errors on group paths, so reactions (no reactions on system messages) and disappearing-messages (expire/clean them) are designed against it instead of retrofitted; independent of both otherwise.
3. **reactions** - touches the message schemas and history paths while the contract is still small; the disappearing-messages job must later clean reactions, so reactions first.
4. **disappearing-messages** - builds on the search and reactions changes (read-path filtering, reaction cleanup); introduces the first hard-delete and MinIO cleanup.
5. **pwa** - decides how the single service worker is built; must precede web-push.
6. **web-push** - adds the `push` handler and click routing to the worker that `pwa` produced (iOS support also needs the installable PWA).
7. **api-casing** - LAST: it renames the contract across backend, frontend and tests, so doing it before the others would force rebases of every branch and rewrite new features twice; the negotiated compatibility window also covers cached PWA bundles.

Cross-feature rules until api-casing lands: fields added inside an existing PascalCase schema stay PascalCase; brand-new endpoints/events are camelCase.

## Handoff state (2026-10-03)
- **Current tip:** `feat/disappearing-messages` (DE1-DE8 done; full matrix green, see its Progress). Start the next feature with `git switch -c feat/pwa` from `feat/disappearing-messages`.
- **Done and reviewed:** everything up to and including observability was reviewed per commit and acknowledged. group-admin-permissions and reactions commits are recorded in their documents. disappearing-messages slices are acknowledged through `aaec4d8`; the final slice `aaec4d8..d50bd72` (DE7 advisory fix `475e196` + DE8 docs) was `under_budget` and is NOT reviewed: the first review slice of the next feature must use `--base-ref aaec4d8`.
- **Next:** `pwa.md`. Environment note carried from the disappearing-messages sessions: if subagent profiles in `~/.gentle-shell/agent/subagents.json` point at `anthropic/*` and fail instantly with 0 tool calls, swap them to the native opencode mapping (see disappearing-messages.md DE8 session note); leave `~/.pi/gentle-ai/models.json` (native RDD relay) untouched.
- **Checks to run before and after each task:**
  - `go build ./... && go vet ./... && go test ./...`
  - `make test-integration` (tag e2e; wait about 60s between runs because of the login rate limit, 429)
  - `cd frontend && npm run typecheck && npm run lint && npm run test && npm run build`
  - `npm run test:e2e` against the running stack, after `docker compose up -d --build app web`
  - Environment notes (this machine): host PostgreSQL 18 holds `127.0.0.1:5432`, so export `POSTGRES_PUBLIC_PORT=55432` for every `docker compose` call and run `POSTGRES_PUBLIC_PORT=55432 make test-integration` (the Makefile defaults to 5432). If `frontend/node_modules/.bin/*` are 0-byte stubs, the frontend checks pass vacuously: confirm `npx tsc --version` / `npx vitest --version` first and repair with `npm rebuild --ignore-scripts`. Playwright e2e global setup also logs in, so keep ~60s between integration and e2e runs (login limit 20/min, 429).
- **Stack:** `docker compose up -d`. The observability profile is optional: `docker compose --profile observability up -d prometheus grafana`, then Grafana at http://localhost:3000 (admin/admin) and Prometheus at http://127.0.0.1:9090.
- **Known leftovers:** each feature doc has a "Follow-ups (not fixed)" list.
- **Stale review lineage:** `review-d33a5f83f9c32c1a` (message-pagination d3fadb6) is still open. Its CRITICAL finding was fixed forward in 22dcd3f/ae77379. Releasing it needs a maintainer-authorized `gentle-ai review abandon`.

## How to resume a feature
1. Read the feature document top to bottom (Decisions, Constraints, TDD, Tasks, Open questions). Resolve or confirm each "Open question (user decision)" with the user (one question at a time); use the recommended default only if the user agrees.
2. Check the task boxes; find the first unchecked task. Reconcile the document against the code (`git log`, `git status`) and, if available, the Engram mirror `odd/<feature>/tasks` (`mem_context` -> `mem_search` -> `mem_get_observation`).
3. Create/switch to the feature branch from the latest branch in the chain.
4. Implement ONE task at a time with strict TDD (RED observed, then GREEN, then refactor). Run the task's checks plus the applicable full checks before closing it.
5. Close each task with one work-unit commit (Conventional Commits; tests and docs alongside the behavior; explicit pathspecs after `git reset -q`; NO AI attribution or Co-Authored-By lines). Record the commit id and evidence in the document's Progress section and tick the box; update the Engram mirror.
6. At the end run the full matrix: `go test ./...`, `cd frontend && npm run typecheck && npm run lint && npm run test && npm run build`, `make test-integration`, `cd frontend && npm run test:e2e` (twice for feature closure).

Guardrails:
- Never run `go test -tags integration` against the shared stack (it TRUNCATEs tables). `make test-integration` uses `-tags e2e`, which is safe.
- Never `docker compose down -v` (or `make reset`) unless the user intends to wipe local data (Postgres, Redis, MinIO volumes).
- Rebuild the affected services before e2e: `docker compose up -d --build app web`.
- TS strict, no `any`; keep the runtime-guard principle for network data.
- Do not read or commit `.env*` files or secrets (VAPID keys, tokens).
- Push/PR/merge are the user's decisions. Delivery slices over ~400 authored changed lines follow the `chained-pr` skill; commits follow `work-unit-commits`.

## Review workflow note
When `gentle-ai` is installed and receipt-driven development (RDD) is on (`gentle-ai review mode status`), each work-unit commit is reviewed (assess -> consent -> capture -> acknowledge) before moving on; previous features record the acknowledged commit ids in their Progress sections. The helper `.git/rdd-state/cycle.zsh` used in earlier sessions to capture all review slots concurrently is LOCAL-ONLY (lives under `.git/`, not versioned, may not exist on another machine). Without gentle-ai, skip the review step and rely on the full check matrix; if RDD is disabled, do not start reviews.
