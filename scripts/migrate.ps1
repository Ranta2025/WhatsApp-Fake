# =============================================================================
# scripts\migrate.ps1
#
# Runs database migrations against the configured PostgreSQL instance.
# Works in both local dev (reads .env) and CI/CD (env vars already exported).
#
# Usage:
#   .\scripts\migrate.ps1                      # auto-detect .env from project root
#   .\scripts\migrate.ps1 -EnvFile C:\path\.env  # explicit .env path
# =============================================================================

[CmdletBinding()]
param (
    [string]$EnvFile = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

if (-not $EnvFile) {
    $EnvFile = Join-Path $ProjectRoot ".env"
}

# ── Load .env if present (never overwrite existing env vars) ─────────────────
if (Test-Path $EnvFile) {
    Write-Host "[migrate] Loading environment from $EnvFile"
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+?)\s*=\s*(.*)\s*$') {
            $key   = $matches[1].Trim()
            $value = $matches[2].Trim()
            # Only set if not already defined in the session
            if (-not [System.Environment]::GetEnvironmentVariable($key)) {
                [System.Environment]::SetEnvironmentVariable($key, $value)
            }
        }
    }
} else {
    Write-Host "[migrate] No .env file found at $EnvFile – relying on exported env vars."
}

# ── Validate required variables ───────────────────────────────────────────────
$requiredVars = @("POSTGRES_HOST", "POSTGRES_PORT", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB")
$missing      = @()

foreach ($var in $requiredVars) {
    if (-not [System.Environment]::GetEnvironmentVariable($var)) {
        $missing += $var
    }
}

if ($missing.Count -gt 0) {
    Write-Error "[migrate] ERROR: Missing required environment variables: $($missing -join ', ')"
    exit 1
}

# ── Build & run the migrate binary ────────────────────────────────────────────
$binPath = Join-Path $ProjectRoot "bin\migrate.exe"

Write-Host "[migrate] Building migrate binary..."
& go build -o $binPath "$ProjectRoot\cmd\migrate"
if ($LASTEXITCODE -ne 0) {
    Write-Error "[migrate] Build failed."
    exit $LASTEXITCODE
}

Write-Host "[migrate] Running migrations..."
& $binPath
if ($LASTEXITCODE -ne 0) {
    Write-Error "[migrate] Migration failed."
    exit $LASTEXITCODE
}

Write-Host "[migrate] Done."
