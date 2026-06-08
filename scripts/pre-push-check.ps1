$ErrorActionPreference = "Stop"

Write-Host "[pre-push] Running local Playwright suite..."
npm.cmd run test:e2e
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

if ($env:PREPUSH_SKIP_DOCKER -eq "1" -or $env:PREPUSH_SKIP_DOCKER -eq "true") {
  Write-Host "[pre-push] PREPUSH_SKIP_DOCKER set - SKIPPING local Docker build (Playwright suite still ran)."
} else {
  Write-Host "[pre-push] Running local Docker build..."
  docker build -t ai-agentic-project-prepush .
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

Write-Host "[pre-push] Local validation passed. Push may continue."
Write-Host "[pre-push] Reminder: confirm the advisory pre-push PR review is complete before this push reaches main. The post-merge canary runs after the push."
