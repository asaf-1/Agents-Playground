---
name: qa-run
description: Run any test suite in this project by name. Use when the user wants to run tests, validate a change, or check regression.
allowed-tools: Bash Read
---

Run the requested test suite for this Playwright project at C:\Users\asafn\Desktop\GenAI+AgenticAI-Demo.

The user passed: $ARGUMENTS

Map the argument to the correct test path:

- "sanity" or "smoke" → tests/e2e/sanity/
- "functional" or "func" → tests/e2e/functional/
- "contracts" or "contract" → tests/e2e/contracts/
- "scenarios" or "scenario" or "agentic" → tests/e2e/scenarios/
- "non-functional" or "nonfunctional" or "perf" → tests/e2e/non-functional/
- "all" or no argument → run all tests

Steps:

1. Check server is running: curl -s http://localhost:4173/api/health
   If not: node server.js & then wait 2 seconds.
2. Run: npx playwright test <path> --reporter=list
3. Report: passed count, failed count, any failure names and errors.
4. If failures exist, classify using framework/agents/diagnosis/FailureClassifier.ts categories and suggest next step.
