$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$pipelinePolicy = Get-Content -Raw -LiteralPath (Join-Path $repoRoot "pipeline.config.json") | ConvertFrom-Json
$dockerEnabled = $pipelinePolicy.preMerge.dockerEnabled -eq $true

Write-Host "[pre-push] Running local Playwright suite..."
npm.cmd run test:e2e
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

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

Write-Host "[pre-push] Local validation passed. Push may continue."
Write-Host "[pre-push] Next: open or update the PR, complete Codex/Claude review for the current head, and merge only after both GitHub gates pass."
