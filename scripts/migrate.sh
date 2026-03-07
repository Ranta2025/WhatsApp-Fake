#!/usr/bin/env bash
# =============================================================================
# scripts/migrate.sh
#
# Runs database migrations against the configured PostgreSQL instance.
# Works in both local dev (reads .env) and CI/CD (env vars already exported).
#
# Usage:
#   ./scripts/migrate.sh               # auto-detect .env from project root
#   ./scripts/migrate.sh /path/to/.env  # explicit .env path
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${1:-$PROJECT_ROOT/.env}"

# ── Load .env if present (never overwrite existing env vars) ─────────────────
if [[ -f "$ENV_FILE" ]]; then
  echo "[migrate] Loading environment from $ENV_FILE"
  set -o allexport
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +o allexport
else
  echo "[migrate] No .env file found at $ENV_FILE – relying on exported env vars."
fi

# ── Validate required variables ───────────────────────────────────────────────
required_vars=(POSTGRES_HOST POSTGRES_PORT POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB)
missing=()

for var in "${required_vars[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    missing+=("$var")
  fi
done

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "[migrate] ERROR: Missing required environment variables: ${missing[*]}" >&2
  exit 1
fi

# ── Build & run the migrate binary ────────────────────────────────────────────
echo "[migrate] Building migrate binary..."
go build -o "$PROJECT_ROOT/bin/migrate" "$PROJECT_ROOT/cmd/migrate"

echo "[migrate] Running migrations..."
"$PROJECT_ROOT/bin/migrate"

echo "[migrate] Done."
