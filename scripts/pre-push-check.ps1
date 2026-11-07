# Stop on any error, and read whether pipeline.config.json turns on the
# pre-merge Docker build.
$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$pipelinePolicy = Get-Content -Raw -LiteralPath (Join-Path $repoRoot "pipeline.config.json") | ConvertFrom-Json
$dockerEnabled = $pipelinePolicy.preMerge.dockerEnabled -eq $true

# First, the full Playwright suite; a failure stops the push.
Write-Host "[pre-push] Running local Playwright suite..."
npm.cmd run test:e2e
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

# Say why Docker was skipped, or run the build.
if (-not $dockerEnabled) {
  Write-Host "[pre-push] pipeline.config.json disables the pre-merge Docker build; Playwright still ran."
} elseif ($env:PREPUSH_SKIP_DOCKER -eq "1" -or $env:PREPUSH_SKIP_DOCKER -eq "true") {
  Write-Host "[pre-push] PREPUSH_SKIP_DOCKER set - SKIPPING local Docker build (Playwright suite still ran)."
} else {
  Write-Host "[pre-push] Running local Docker build..."
  docker build -t ai-agentic-project-prepush .
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

# All passed: the push goes on.
Write-Host "[pre-push] Local validation passed. Push may continue."
Write-Host "[pre-push] Next: open or update the PR, complete Codex/Claude review for the current head, and merge only after both GitHub gates pass."
