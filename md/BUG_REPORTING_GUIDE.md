# Bug Reporting & Documentation Guide — Real Company Environment

This guide covers every way bugs are reported, documented, escalated, and tracked
in a real engineering organization — from the moment a test fails to the moment
a fix is verified and closed.

---

## Table of Contents

1. [The Full Bug Lifecycle](#1-the-full-bug-lifecycle)
2. [Where Bugs Live — Tool Landscape](#2-where-bugs-live--tool-landscape)
3. [What a Good Bug Report Contains](#3-what-a-good-bug-report-contains)
4. [Severity and Priority Classification](#4-severity-and-priority-classification)
5. [Reporting Channel by Failure Type](#5-reporting-channel-by-failure-type)
6. [Automated Bug Creation — Integration Patterns](#6-automated-bug-creation--integration-patterns)
7. [Slack and Teams Alerting](#7-slack-and-teams-alerting)
8. [Email Reports](#8-email-reports)
9. [Dashboard and Monitoring Integration](#9-dashboard-and-monitoring-integration)
10. [On-Call and Incident Management](#10-on-call-and-incident-management)
11. [Regression Reports](#11-regression-reports)
12. [Bug Triage Process](#12-bug-triage-process)
13. [How This Workspace Fits Into All of This](#13-how-this-workspace-fits-into-all-of-this)
14. [What to Build Next in This Repo](#14-what-to-build-next-in-this-repo)
15. [Dedicated BugReportingAgent — Design and Responsibility](#15-dedicated-bugreportingagent--design-and-responsibility)
16. [Dedicated Skill — bug-report](#16-dedicated-skill--bug-report)
17. [Obsidian Vault Memory Updates — Full Integration](#17-obsidian-vault-memory-updates--full-integration)

---

## 1. The Full Bug Lifecycle

Every bug in a real company goes through the same lifecycle regardless of the tool used.

```
Detection
    ↓
Triage (is this real? is this known? how bad?)
    ↓
Documentation (title, steps, evidence, severity, owner)
    ↓
Assignment (who fixes it?)
    ↓
Fix in Development
    ↓
QA Verification (does the fix actually work?)
    ↓
Regression Check (did the fix break anything else?)
    ↓
Closed
```

**Where QA Automation fits:**

- Detection — automated tests catch the failure
- Documentation — agents generate the report
- Verification — automated tests re-run after the fix
- Regression Check — full suite run confirms no side effects

---

## 2. Where Bugs Live — Tool Landscape

Different companies use different tools. The reporting format changes but the content does not.

### Issue Trackers

| Tool                              | Used By                                | Notes                                                                |
| --------------------------------- | -------------------------------------- | -------------------------------------------------------------------- |
| **Jira**                          | Most startups, scale-ups, enterprises  | Industry standard. Supports custom fields, automation, webhooks, API |
| **Azure DevOps / Azure Boards**   | Microsoft shops, .NET teams            | Tight Git and CI integration. Work items = bugs/tasks/stories        |
| **GitHub Issues**                 | Open source, small teams, dev-led orgs | Simple, close to the code. Labels, milestones, projects              |
| **Linear**                        | Modern product startups                | Fast UI, good automation, growing adoption                           |
| **Shortcut (formerly Clubhouse)** | Mid-size product teams                 | Clean workflow, good API                                             |
| **Asana / Monday**                | Non-engineering-heavy teams            | Less code integration, more PM-friendly                              |
| **Notion**                        | Early stage, documentation-heavy teams | Flexible but weak automation                                         |

### Monitoring & Alerting (where production bugs are first seen)

| Tool                     | What It Does                                              |
| ------------------------ | --------------------------------------------------------- |
| **Datadog**              | APM, logs, dashboards, alerting on metrics and traces     |
| **PagerDuty**            | On-call routing, incident escalation, alert deduplication |
| **Sentry**               | Frontend and backend error tracking with stack traces     |
| **New Relic**            | Application performance monitoring                        |
| **Grafana + Prometheus** | Custom dashboards for metrics and thresholds              |
| **Splunk**               | Log aggregation and search at enterprise scale            |

### Communication Channels (where bugs are discussed)

| Tool                | Role in Bug Reporting                              |
| ------------------- | -------------------------------------------------- |
| **Slack**           | Immediate alerts, team notifications, bug channels |
| **Microsoft Teams** | Same as Slack in Microsoft-heavy orgs              |
| **Email**           | Scheduled regression summaries, management reports |

### CI Systems (where test failures are first surfaced)

| Tool                    | How Bugs Surface                                  |
| ----------------------- | ------------------------------------------------- |
| **Jenkins**             | Build page shows failed tests, archived artifacts |
| **GitHub Actions**      | Failed workflow run, test annotations on PR       |
| **GitLab CI**           | Pipeline failure, test report tab on MR           |
| **CircleCI / TeamCity** | Build failure notifications, artifact links       |

---

## 3. What a Good Bug Report Contains

Regardless of tool, a good bug report answers the same questions every time.

### Required Fields

```
Title
  Short, specific, actionable.
  Bad:  "Button broken"
  Good: "[ui-missing-locator] Hero CTA button selector stale after nav redesign — Home page"

Environment
  Where was it found?
  Local | Dev | Staging | Production
  Branch: feature/nav-redesign
  Build: #142 | Commit: a3f91bc

Severity
  How bad is it? (P1 / P2 / P3 / P4 — see Section 4)

Priority
  How urgently should it be fixed? (Blocker / High / Medium / Low)

Component / Area
  Which part of the system is affected?
  e.g. Home Page / Orders API / Auth / Checkout Flow

Steps to Reproduce
  Exact numbered steps to recreate from scratch.
  1. Navigate to /
  2. Click the hero CTA button
  3. Observe: ElementNotFound — selector button:has-text("Sign Up") not found

Expected Behavior
  What should have happened.

Actual Behavior
  What actually happened.

Root Cause (if known)
  What caused the failure.
  e.g. "UI redesign changed button text. Selector was not updated in page object."

Suggested Fix
  Where to look and what to change.
  File: framework/pom/HomePage.ts
  Direction: Update joinNow to use data-testid="join-now"

Evidence
  - Screenshot (what the browser showed)
  - Video or trace (step-by-step replay)
  - Logs (console errors, network failures)
  - API response body (for API bugs)
  - Full test report link

Assignee
  Who owns the fix.

Labels / Tags
  Area, severity, automation flag, regression flag
```

---

## 4. Severity and Priority Classification

These are the two most important fields and the most misused.

### Severity — How Bad Is The Bug?

| Level  | Name     | Meaning                                                     | Example                                                      |
| ------ | -------- | ----------------------------------------------------------- | ------------------------------------------------------------ |
| **S1** | Critical | System down, data loss, security breach, cannot use product | Checkout throws 500 for all users, login broken for everyone |
| **S2** | High     | Core feature broken, major business impact, no workaround   | Orders do not load, report generation fails                  |
| **S3** | Medium   | Feature partially broken, workaround exists                 | Report downloads as wrong format, filter shows wrong results |
| **S4** | Low      | Minor UI issue, edge case, cosmetic                         | Button label typo, tooltip misaligned                        |

### Priority — How Urgently Should It Be Fixed?

| Level          | Meaning                                             |
| -------------- | --------------------------------------------------- |
| **P1 Blocker** | Must fix before release. Blocks QA sign-off.        |
| **P2 High**    | Fix in current sprint. Cannot ship with this known. |
| **P3 Medium**  | Fix in next sprint. Track it.                       |
| **P4 Low**     | Nice to have. Fix when there is capacity.           |

### Common Mistake

Severity and priority are not the same.

- A login bug that only affects 0.001% of users with a very rare browser config:
  **Severity = S1** (login is a core feature)
  **Priority = P3** (almost no one hits it, workaround exists)

- A wrong label on a checkout button on the homepage:
  **Severity = S4** (cosmetic)
  **Priority = P2** (everyone sees it, affects brand trust)

---

## 5. Reporting Channel by Failure Type

Different failures belong in different channels. Sending everything to the same place creates noise.

| Failure Type                         | Primary Channel                             | Secondary Channel       | Who Gets Notified                         |
| ------------------------------------ | ------------------------------------------- | ----------------------- | ----------------------------------------- |
| Production outage                    | PagerDuty → On-call engineer                | Slack #incidents        | On-call, engineering lead, VP Engineering |
| Production error spike               | Sentry / Datadog alert                      | Slack #alerts           | On-call, owning team                      |
| Failed CI build on main              | GitHub Actions / Jenkins notification       | Slack #ci-alerts        | Commit author, QA lead                    |
| Failed PR validation                 | GitHub PR check annotation                  | Slack DM to author      | PR author                                 |
| Regression found in staging          | Jira bug ticket                             | Slack #qa-staging       | QA team, product owner                    |
| Daily regression failure             | Jira bug ticket + regression report         | Slack #qa-daily         | QA team, engineering leads                |
| New bug found in exploratory testing | Jira bug ticket                             | Team standup            | QA, dev team                              |
| Performance degradation              | Datadog monitor alert                       | Jira performance ticket | Backend team, SRE                         |
| Security vulnerability               | Private security ticket (never public Jira) | Direct to security lead | Security, CTO, legal                      |

---

## 6. Automated Bug Creation — Integration Patterns

This is where QA automation adds the most value — removing humans from the ticket creation loop.

### Pattern 1 — CI Failure → Jira Ticket

```
Jenkins / GitHub Actions test run fails
    ↓
Post-failure step reads report.json
    ↓
Check if bug already exists (search by title or label to avoid duplicates)
    ↓
If not exists: create Jira issue via REST API
    ↓
Attach screenshot, trace link, report JSON
    ↓
Assign to owning team based on component label
    ↓
Post link to Slack #qa-alerts
```

**Jira REST API example:**

```
POST https://your-org.atlassian.net/rest/api/3/issue
Authorization: Bearer <token>
Content-Type: application/json

{
  "fields": {
    "project": { "key": "QA" },
    "summary": "[ui-missing-locator] Hero CTA stale selector — Home page",
    "description": "...",
    "issuetype": { "name": "Bug" },
    "priority": { "name": "High" },
    "labels": ["automation", "regression", "ui-locator"],
    "customfield_environment": "Staging",
    "customfield_component": "Home Page"
  }
}
```

**Azure DevOps REST API example:**

```
POST https://dev.azure.com/{org}/{project}/_apis/wit/workitems/$Bug
Authorization: Bearer <token>
Content-Type: application/json-patch+json

[
  { "op": "add", "path": "/fields/System.Title", "value": "Bug title here" },
  { "op": "add", "path": "/fields/Microsoft.VSTS.Common.Priority", "value": 2 },
  { "op": "add", "path": "/fields/System.Description", "value": "..." }
]
```

---

### Pattern 2 — Deduplication

Before creating a ticket, always check if one already exists.

```
Search Jira for: project = QA AND summary ~ "Hero CTA stale selector" AND status != Done
If found → add comment with new evidence and reopen if closed
If not found → create new ticket
```

Without deduplication, a flaky test creates 50 duplicate tickets and everyone ignores them.

---

### Pattern 3 — Auto-Close on Fix Verified

```
PR merged
    ↓
CI runs full suite
    ↓
Previously failed scenario now passes
    ↓
Find linked Jira ticket by ID or label
    ↓
Transition ticket to "Resolved"
    ↓
Add comment: "Auto-verified by QA suite on commit abc123"
```

---

### Pattern 4 — Flaky Test Detection

```
Track pass/fail history per test name across last N runs
    ↓
If test alternates pass/fail more than threshold:
    → Label as flaky in Jira
    → Quarantine from blocking builds
    → Create separate "flaky test" ticket for investigation
    → Alert QA lead in Slack
```

---

## 7. Slack and Teams Alerting

Instant communication is where most teams first learn about a failure.

### Slack Message Format — CI Failure

```
🔴 *QA Alert — Staging Build #142 Failed*

*Scenario:* ui-change-healing
*Failure:* ui-missing-locator — Hero CTA selector stale
*Confidence:* 97%
*Agent Decision:* RecoveryRouter attempted locator-heal — FAILED

*Root Cause:* button:has-text("Sign Up") no longer exists on page
*Suggested Fix:* Update joinNow in HomePage.ts to use data-testid="join-now"

📎 Screenshot | 📋 Full Report | 🎥 Trace | 🐛 Jira QA-441
```

### Slack Message Format — Daily Regression Summary

```
📊 *Daily Regression Report — 2026-04-19*

✅ Passed: 18 / 20 tests
❌ Failed: 2 tests

*Failures:*
  • [S2] Orders dashboard flaky timeout — flaky-network-recovery
  • [S3] Product price NaN on broken state — dynamic-content-validation

*New Bugs Created:* QA-441, QA-442
*Duration:* 4m 32s
*Build:* #142 | Branch: main

📋 Full Report | 🏥 Playwright HTML Report
```

### Slack Message Format — Production Incident

```
🚨 *P1 INCIDENT — Production*

*Time:* 2026-04-19 14:32 UTC
*Impact:* Orders API returning 503 for all users
*Detection:* Datadog monitor — error rate > 5%
*On-Call:* @dana-ops

*Status:* INVESTIGATING

*Timeline:*
14:32 — Alert fired
14:35 — On-call acknowledged
14:40 — Root cause identified: deploy #89 introduced DB connection pool exhaustion

🔗 Incident: INC-0042 | Runbook | Status Page
```

---

## 8. Email Reports

Email is used for scheduled summaries, management reports, and stakeholder communication.

### Types of Email Reports

| Report                   | Audience                             | Frequency            | Content                                                            |
| ------------------------ | ------------------------------------ | -------------------- | ------------------------------------------------------------------ |
| Daily Regression Summary | QA team, engineering leads           | Daily                | Pass/fail counts, new bugs, flaky tests, trends                    |
| Weekly Quality Report    | Engineering manager, product owner   | Weekly               | Bug counts by severity, test coverage trend, open bugs aging       |
| Release Readiness Report | Product owner, VP Engineering        | Before every release | P1/P2 open bugs, test coverage, regression result, sign-off status |
| Incident Post-Mortem     | CTO, engineering leads, stakeholders | After every P1       | Timeline, root cause, impact, fix, prevention plan                 |

### Release Readiness Report Structure

```
Subject: Release Readiness Report — v2.4.1 — 2026-04-19

Overall Status: ✅ READY FOR RELEASE / ❌ BLOCKED

---
Test Coverage
  Total scenarios: 20
  Passed: 19
  Failed: 1 (non-blocking — known flaky test quarantined)

Open Bugs
  P1 Blockers: 0
  P2 High: 1 (QA-438 — dashboard loads in 5.2s, threshold 4s — fix in this release)
  P3 Medium: 3 (tracked, deferred to next sprint)
  P4 Low: 7 (known, no action required)

Regression
  Full suite passed on release candidate commit: abc123
  Docker build passed
  Jenkins pipeline: #142 GREEN

Sign-Off
  QA Lead: ✅ Approved
  Engineering Lead: ✅ Approved
  Product Owner: ⏳ Pending
```

---

## 9. Dashboard and Monitoring Integration

In a real company, bugs are not just in Jira — they also appear on live dashboards that teams watch continuously.

### Types of Dashboards

| Dashboard              | Tool                                         | What It Shows                                         |
| ---------------------- | -------------------------------------------- | ----------------------------------------------------- |
| Test Results Dashboard | Allure Report, ReportPortal, Playwright HTML | Pass/fail per test, trend over time, flaky test list  |
| Error Rate Dashboard   | Datadog, Grafana                             | API error rates, frontend JS errors, response time    |
| Bug Velocity Dashboard | Jira dashboard                               | Bugs opened vs closed per sprint, severity breakdown  |
| SLO Dashboard          | Datadog, Grafana                             | Uptime, latency P99, error budget burn                |
| CI Pipeline Dashboard  | Jenkins, GitHub Actions                      | Build success rate, mean time to fix, flaky test rate |

### Allure Report Integration

Allure is the most common QA-specific dashboard tool. It reads Playwright or JUnit output and produces:

- Test history per test case
- Flaky test detection
- Failure categorization
- Screenshot and trace attachments
- Trend graphs over time

```powershell
# Generate Allure report from Playwright output
npx allure generate allure-results --clean -o allure-report
npx allure open allure-report
```

### ReportPortal Integration

ReportPortal is used in larger organizations that need:

- Central test result storage across multiple projects
- AI-powered failure analysis and deduplication
- Team-level dashboards
- Automatic bug filing to Jira

---

## 10. On-Call and Incident Management

For production bugs, the reporting process is different from QA-found bugs.

### PagerDuty Flow

```
Datadog monitor fires (error rate > threshold)
    ↓
PagerDuty receives alert
    ↓
Routes to on-call engineer based on schedule and escalation policy
    ↓
Engineer acknowledges within SLA (e.g. 5 minutes)
    ↓
Creates incident in PagerDuty (auto-creates Jira ticket)
    ↓
Posts to Slack #incidents
    ↓
Engineer investigates using runbooks, logs, traces
    ↓
Fix deployed
    ↓
Incident resolved in PagerDuty
    ↓
Post-mortem written within 24-48 hours
```

### Incident Severity Tiers

| Tier  | Name     | SLA to Acknowledge | SLA to Resolve    |
| ----- | -------- | ------------------ | ----------------- |
| SEV-1 | Critical | 5 minutes          | 1 hour            |
| SEV-2 | High     | 15 minutes         | 4 hours           |
| SEV-3 | Medium   | 1 hour             | Next business day |
| SEV-4 | Low      | Next business day  | Next sprint       |

### Post-Mortem Structure

```
Incident: INC-0042
Date: 2026-04-19
Duration: 47 minutes
Severity: SEV-2
Impact: Orders API unavailable for 18% of users

---
Timeline
  14:32 — Monitor fired: orders-api error rate > 5%
  14:35 — On-call acknowledged
  14:41 — Root cause identified: connection pool exhaustion
  14:58 — Fix deployed to production
  15:19 — Error rate back to baseline
  15:22 — Incident resolved

Root Cause
  Deploy #89 introduced a new query that held connections open.
  Connection pool exhausted under normal load after 12 minutes.

Contributing Factors
  - No connection pool monitoring alert existed before this incident
  - Load test did not cover sustained query scenarios

Fix
  - Patched query to release connections immediately
  - Added connection pool utilization monitor

Prevention
  - Add connection pool alerts to standard deploy checklist
  - Add sustained load scenario to performance test suite
  - Add DB connection metrics to release readiness gates

Action Items
  QA-444 — Add connection pool alert — @backend-team — Due: 2026-04-26
  QA-445 — Add sustained load test scenario — @qa-team — Due: 2026-04-30
```

---

## 11. Regression Reports

A regression report answers: "Did this change break anything that was working before?"

### When Regression Reports Are Generated

| Trigger                       | Who Reads It                             |
| ----------------------------- | ---------------------------------------- |
| Every PR merge to main        | Dev who merged, QA lead                  |
| Every release candidate build | QA lead, engineering lead, product owner |
| Every nightly scheduled run   | QA team, engineering leads               |
| After a hotfix                | QA lead, product owner, on-call          |

### Regression Report Structure

```
Regression Report — Build #142 — 2026-04-19 02:00 UTC

Branch: main
Commit: abc123 — "Fix orders API connection pool"
Triggered by: Nightly schedule

---
Summary
  Total tests: 20
  Passed: 19 ✅
  Failed: 1 ❌
  New failures (not in previous run): 1
  Recovered (was failing, now passing): 0
  Flaky (alternating): 0

---
New Failures

  ❌ flaky-network-recovery
     Category: ui-loading-or-network
     Confidence: 89%
     Root cause: Orders spinner still visible after 5000ms — recovery timeout too short
     Suggested fix: Increase extend-wait timeout in NetworkRecoveryAgent
     Evidence: report.json | screenshot | trace
     Jira: QA-443 (auto-created)

---
Suite Performance
  Previous run duration: 4m 12s
  This run duration: 4m 38s
  Delta: +26s — within normal variance

---
Artifacts
  Playwright HTML Report: https://ci.internal/builds/142/report
  Full scenario artifacts: https://ci.internal/builds/142/artifacts
```

---

## 12. Bug Triage Process

Triage is the process of reviewing new bugs and deciding what to do with them.

### Triage Meeting Cadence

| Meeting          | Frequency           | Attendees                      | Purpose                                           |
| ---------------- | ------------------- | ------------------------------ | ------------------------------------------------- |
| Daily Bug Review | Daily (15 min)      | QA lead, dev lead              | Review new bugs from last 24 hours, assign owners |
| Sprint Triage    | Per sprint          | QA, dev, product               | Decide which bugs go into the sprint              |
| Release Triage   | Before each release | QA, dev, product, stakeholders | Decide what is a release blocker                  |

### Triage Decision Tree

```
New bug arrives
    ↓
Is it a duplicate?
  Yes → Link to existing ticket, close as duplicate
  No → Continue
    ↓
Is it reproducible?
  No → Label "cannot reproduce", assign back to reporter for more info
  Yes → Continue
    ↓
What severity?
  S1/S2 → Assign immediately, notify engineering lead
  S3/S4 → Add to backlog, schedule in sprint planning
    ↓
Is it a regression?
  Yes → Flag as regression, bump priority
  No → Normal priority flow
    ↓
Who owns it?
  Assign to owning team based on component
```

---

## 13. How This Workspace Fits Into All of This

The agents in this repo already produce the data needed for every report type above.

| What agents produce                               | Where it feeds                            |
| ------------------------------------------------- | ----------------------------------------- |
| `report.json` with `finalStatus`, `agentDecision` | Jira / Azure Boards ticket body           |
| `classification.category` + `confidence`          | Bug severity suggestion, label assignment |
| `patchProposal.likelyFileTargets`                 | "Assigned to" field, component label      |
| `patchProposal.recommendedPermanentFixDirection`  | "Suggested fix" field in ticket           |
| `final.png`                                       | Screenshot attachment in ticket           |
| `trace.zip`                                       | Trace link attachment in ticket           |
| `classification.explanation`                      | Steps to reproduce, actual behavior       |

### What is missing to make this production-ready

| Feature                     | What it does                                                    | Where it fits                                      |
| --------------------------- | --------------------------------------------------------------- | -------------------------------------------------- |
| `BugReportFormatter`        | Converts `report.json` to Jira/Azure Boards ticket format       | `framework/reporting/BugReportFormatter.ts`        |
| `JiraIntegration`           | Posts ticket via Jira REST API, deduplicates, attaches evidence | `framework/integrations/JiraIntegration.ts`        |
| `AzureBoardsIntegration`    | Same for Azure DevOps                                           | `framework/integrations/AzureBoardsIntegration.ts` |
| `SlackNotifier`             | Posts alert to channel with summary and ticket link             | `framework/integrations/SlackNotifier.ts`          |
| `RegressionReportGenerator` | Compares current run to previous run, flags new failures        | `framework/reporting/RegressionReportGenerator.ts` |
| `DuplicateChecker`          | Searches existing tickets before creating a new one             | `framework/integrations/DuplicateChecker.ts`       |
| `AllureReporter`            | Feeds results into Allure for trend dashboards                  | Playwright reporter config                         |

---

## 14. What to Build Next in This Repo

In priority order:

### Priority 1 — Automated Bug Ticket Creation

Build `BugReportFormatter` + `JiraIntegration` / `AzureBoardsIntegration`.

Every scenario that ends with `finalStatus: "failed"` should automatically:

1. Format the report into a structured ticket
2. Check for duplicates
3. Create the ticket with screenshot and trace attached
4. Return the ticket URL and log it in the scenario report

### Priority 2 — Slack Notifier

Post a message to a QA channel on every CI failure with:

- Summary of what failed
- Classification and confidence
- Suggested fix
- Links to screenshot, trace, and ticket

### Priority 3 — Regression Report Generator

Compare the current run result to the previous stored run result and produce:

- New failures (regression)
- Recovered tests (fix verified)
- Consistently failing (known issues)
- Flaky tests (alternating)

### Priority 4 — Allure Integration

Configure Playwright to output Allure-compatible results so the team gets:

- Historical trend per test
- Flaky test detection across builds
- Failure category distribution chart

### Priority 5 — Orchestrator Layer

Build `IncidentRouter`, `AgentRegistry`, `ExecutionPlanner` per `NEXT_PHASE_MULTI_AGENT_ROADMAP.md`
so the framework can handle any failure end to end without per-scenario wiring.

---

---

## 15. Dedicated BugReportingAgent — Design and Responsibility

### What it is

`BugReportingAgent` is a single dedicated agent whose only job is to take the output
of any scenario run and turn it into a complete, formatted, routed bug report.

It sits at the end of the agent pipeline — after classification, recovery, and diagnosis
have already run — and acts as the delivery layer.

### Where it lives

```
framework/agents/reporting/BugReportingAgent.ts
```

### Why it is its own agent and not part of another one

Every other agent in the framework owns one diagnostic or recovery job.
None of them should know about Jira, Slack, Azure Boards, or email.
Mixing reporting into the recovery or diagnosis agents would break the single-responsibility rule
and make the framework harder to maintain.

The `BugReportingAgent` is the only agent that knows:

- how to format a report for human consumption
- which integration to call (Jira, Azure, Slack)
- how to check for duplicates before creating a ticket
- how to attach evidence to the ticket
- how to notify the right channel

### Inputs it receives

```
{
  report:          ScenarioReport         — the full output from the scenario run
  classification:  FailureClassification  — category, confidence, explanation
  patchProposal:   PatchProposal          — file targets, fix direction, eligibility
  screenshotPath:  string                 — path to final.png
  tracePath:       string                 — path to trace.zip
  buildInfo: {
    buildNumber:   string
    branch:        string
    commit:        string
    environment:   "local" | "staging" | "production"
  }
}
```

### What it does — step by step

```
Step 1 — Format the bug report
  Read report.json + classification + patchProposal
  Produce a structured human-readable bug report object:
    - title (category + scenario + one-line summary)
    - environment
    - severity (derived from classification.category and confidence)
    - steps to reproduce (from initialFailure + agentDecision)
    - expected behavior
    - actual behavior
    - root cause (from classification.explanation)
    - suggested fix (from patchProposal.recommendedPermanentFixDirection)
    - file targets (from patchProposal.likelyFileTargets)
    - evidence links (screenshot, trace, report.json)

Step 2 — Check for duplicates
  Search Jira / Azure Boards for an open ticket with the same:
    - scenario name
    - classification category
  If found: add a comment with new evidence and return existing ticket URL
  If not found: continue to Step 3

Step 3 — Create the ticket
  POST to Jira REST API or Azure DevOps REST API
  Attach screenshot
  Add trace link
  Set severity, priority, component, and labels based on classification

Step 4 — Notify the team
  POST to Slack webhook with a formatted summary:
    - what failed
    - classification + confidence
    - suggested fix
    - ticket link

Step 5 — Write the ticket URL back into report.json
  So the artifact record includes the ticket reference

Step 6 — Return the result
  {
    ticketUrl:     string
    ticketId:      string
    wasDeduped:    boolean
    notified:      boolean
    formattedReport: BugReport
  }
```

### Severity mapping — how it derives severity from classification

| Classification Category | Auto Severity | Reasoning                                         |
| ----------------------- | ------------- | ------------------------------------------------- |
| `api-contract-drift`    | S2 High       | Core API contract broken — business impact        |
| `api-server-error`      | S2 High       | Server returning 5xx — likely affects all users   |
| `api-client-error`      | S3 Medium     | 4xx — likely a bad request or validation issue    |
| `ui-contract-or-render` | S2 High       | Page rendering incorrectly — user-visible         |
| `ui-missing-locator`    | S3 Medium     | Selector stale — test infrastructure, not product |
| `ui-loading-or-network` | S2 High       | Data not loading — user-facing                    |
| `auth-or-session`       | S1 Critical   | Auth broken — blocks all users                    |
| `permissions-or-rbac`   | S2 High       | Access control failure                            |
| `api-timeout`           | S2 High       | Latency degradation                               |
| `unknown`               | S3 Medium     | Cannot classify — needs human review              |

### What it does NOT do

- It does not classify failures (that is `FailureClassifier`)
- It does not recover from failures (that is `RecoveryRouter`)
- It does not diagnose APIs (that is `ApiDiagnosisAgent`)
- It does not validate pages (that is `PageValidationAgent`)
- It does not run tests

It only takes finished agent output and routes it to the right reporting destination.

### Integration config (environment variables)

```
JIRA_BASE_URL          https://your-org.atlassian.net
JIRA_API_TOKEN         your-jira-token
JIRA_PROJECT_KEY       QA
JIRA_REPORTER_EMAIL    qa-bot@your-org.com

AZURE_ORG_URL          https://dev.azure.com/your-org
AZURE_PROJECT          YourProject
AZURE_PAT              your-azure-pat

SLACK_WEBHOOK_URL      https://hooks.slack.com/services/...
SLACK_CHANNEL          #qa-alerts

BUG_REPORT_TARGET      jira | azure | slack-only | none
```

Setting `BUG_REPORT_TARGET=none` runs the formatter and logs the report locally
without posting anywhere — useful for local development and debugging.

### Output — formatted bug report example

```
Title:
  [ui-missing-locator | S3] Hero CTA stale selector — ui-change-healing — Staging

Environment:  Staging | Branch: main | Build: #142 | Commit: abc123

Severity:     S3 Medium
Priority:     P2 High
Component:    Home Page
Labels:       automation, regression, ui-locator, agent-reported

Steps to Reproduce:
  1. Navigate to /
  2. Attempt to click button:has-text("Sign Up")
  3. Selector not found — ElementNotFoundError

Expected:
  Button found, page navigates to /dashboard

Actual:
  Stale selector failure. RecoveryRouter attempted locator-heal.
  GenericLocatorHealer recovered using intent tokens [join, dashboard, start].
  Selected candidate: data-testid="join-now" (score: 18.5)
  Final status: recovered

Root Cause:
  UI change renamed button text. Selector was not updated in page object.
  Classification: ui-missing-locator (confidence: 94%)

Suggested Fix:
  File: framework/pom/HomePage.ts
  Direction: Update joinNow primary locator to use data-testid="join-now"
  Auto-mitigatable: yes

Evidence:
  Screenshot:   .artifacts/scenarios/ui-change-healing/final.png
  Trace:        .artifacts/scenarios/ui-change-healing/trace.zip
  Full report:  .artifacts/scenarios/ui-change-healing/report.json
```

---

## 16. Dedicated Skill — bug-report

### What a skill is in this context

A skill is a reusable, named capability that Claude Code can invoke on demand.
It acts like a smart command — you call it with a scenario name or a report path
and it runs the full bug reporting flow end to end.

### Skill name

```
/bug-report
```

### Where it lives

```
.claude/commands/bug-report.md
```

### What it does when invoked

```
/bug-report
/bug-report ui-change-healing
/bug-report --all
/bug-report --failed-only
/bug-report --scenario api-error-diagnosis --target jira
/bug-report --dry-run
```

| Flag              | Behavior                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------- |
| (no args)         | Reads all scenario report.json files in .artifacts/scenarios/ and reports on all of them |
| `<scenario-name>` | Reports on a single named scenario                                                       |
| `--all`           | Reports on every scenario regardless of status                                           |
| `--failed-only`   | Reports only on scenarios where finalStatus is "failed"                                  |
| `--target jira`   | Force Jira as the destination regardless of env config                                   |
| `--target azure`  | Force Azure Boards as the destination                                                    |
| `--target slack`  | Post to Slack only, no ticket created                                                    |
| `--dry-run`       | Format and print the report without posting anywhere                                     |

### What the skill does step by step

```
1. Read the requested scenario report(s) from .artifacts/scenarios/
2. For each report:
   a. Check finalStatus — skip "recovered" unless --all is passed
   b. Load classification and patchProposal from evidence block
   c. Call BugReportingAgent.format() to produce the structured bug report
   d. Check for duplicate tickets
   e. Create ticket or add comment if duplicate
   f. Post Slack notification
   g. Print ticket URL and summary to console
3. Print a final summary table:
   Scenario | Status | Ticket | Duplicate?
```

### Dry run output example

```
$ /bug-report --dry-run --failed-only

Found 2 failed scenarios.

─────────────────────────────────────────────
Scenario: flaky-network-recovery
Status:   failed
Category: ui-loading-or-network (confidence: 89%)
Severity: S2 High

Title: [ui-loading-or-network | S2] Orders spinner timeout — flaky-network-recovery

Steps:
  1. Navigate to /dashboard?mode=flaky
  2. API returns 503 on first request
  3. extend-wait timeout (5000ms) exceeded — no rows visible

Suggested Fix:
  File: framework/agents/recovery/NetworkRecoveryAgent.ts
  Direction: Increase extend-wait timeout or add a second retry pass

[DRY RUN] Would create ticket in: Jira (QA project)
[DRY RUN] Would notify: #qa-alerts
─────────────────────────────────────────────

Scenario: api-error-diagnosis
Status:   failed
Category: api-contract-drift (confidence: 97%)
Severity: S2 High

Title: [api-contract-drift | S2] phone_number type mismatch — api-error-diagnosis

Steps:
  1. POST /api/create-user with phone_number as string "0541234567"
  2. Server returns 500
  3. Response: { problem: { field: "phone_number", expectedType: "integer" } }

Root Cause:
  Client sends string, server expects integer. Type contract not enforced on client.

Suggested Fix:
  File: server.js
  Direction: Add runtime type coercion or return 400 with clear validation message
  Auto-mitigatable: no — requires human review

[DRY RUN] Would create ticket in: Jira (QA project)
[DRY RUN] Would notify: #qa-alerts
─────────────────────────────────────────────

Summary:
  Scenarios processed: 2
  Tickets to create:   2
  Duplicates found:    0
  Slack notifications: 2
  (dry run — nothing was posted)
```

### How the skill connects to the agent

```
/bug-report (skill invocation)
    ↓
Reads .artifacts/scenarios/<name>/report.json
    ↓
Calls BugReportingAgent.run(input)
    ↓
BugReportingAgent.format()       → structured BugReport object
BugReportingAgent.deduplicate()  → check existing tickets
BugReportingAgent.createTicket() → Jira / Azure REST API
BugReportingAgent.notify()       → Slack webhook
BugReportingAgent.persist()      → write ticket URL back to report.json
    ↓
Returns result to skill
    ↓
Skill prints summary table
```

### Where the skill fits in the daily workflow

```
Daily QA workflow:

  1. Nightly Jenkins run completes
  2. Playwright suite writes report.json per scenario
  3. /bug-report --failed-only runs automatically as a post-step in Jenkinsfile
  4. BugReportingAgent creates Jira tickets for all new failures
  5. Slack #qa-alerts receives a message per failure with ticket link
  6. QA lead opens Jira in the morning — all failures already documented
  7. No manual ticket writing required
```

### How to add /bug-report as an automatic Jenkins post-step

```groovy
// In Jenkinsfile — after the Playwright stage:

post {
  always {
    archiveArtifacts artifacts: '.artifacts/**/*', allowEmptyArchive: true
  }
  failure {
    sh 'npx claude /bug-report --failed-only --target jira'
  }
}
```

This means every failed CI run automatically:

- Creates Jira tickets for all failed scenarios
- Notifies Slack
- Attaches evidence
- Without any human involvement

---

---

## 17. Obsidian Vault Memory Updates — Full Integration

### Why Obsidian is part of bug reporting

Jira and Slack handle the immediate alert and ticket.
Obsidian handles the **persistent project memory** — the record of what happened, what the agent decided, what was healed, and what still needs a permanent fix.

Without Obsidian writes, the project memory only lives in:

- Chat history (disappears after the session)
- `.artifacts/` files (not searchable, not linked, not structured for humans)
- Jira tickets (external, not version-controlled with the code)

With Obsidian writes, every failure, every recovery, and every daily run leaves a **versioned, linked, human-readable record inside the repo**.

---

### The Vault Structure Used for Bug Reporting

```
obsidian-vault/
  Reports/
    Daily/          ← one note per scheduled regression run
    Incidents/      ← one note per failure that reached "failed" final status
    Healing/        ← one note per successful agent recovery
  Tasks/            ← task notes updated with result after fix is verified
  Inbox/
    Agents/         ← raw agent output dropped here before being structured
  AGENT_MEMORY.md   ← cross-session persistent memory for agents
```

---

### What Gets Written and When

#### 1. After every scenario run — Incident or Healing note

**If `finalStatus === "failed"`** → write to `obsidian-vault/Reports/Incidents/`

```markdown
---
type: report
report_kind: incident
status: open
date: 2026-04-19
scenario: flaky-network-recovery
category: ui-loading-or-network
severity: S2
jira_ticket: QA-443
---

# Incident — flaky-network-recovery — 2026-04-19

## What Failed

Orders spinner still visible after 5000ms extend-wait timeout.
Dashboard did not recover. NetworkRecoveryAgent reported finalStatus: failed.

## Classification

- Category: ui-loading-or-network
- Confidence: 89%
- Signals: spinner visible, active requests > 0

## Agent Decision

RecoveryRouter tried extend-wait first (spinner visible).
Timeout exceeded. Fallback refresh-and-retry also failed.
No order rows appeared within recovery window.

## Suggested Fix

File: framework/agents/recovery/NetworkRecoveryAgent.ts
Direction: Increase extend-wait timeout from 5000ms to 8000ms.
Add a third fallback: hard page reload + full retry.
Auto-mitigatable: no — timeout values are config decisions, not code bugs.

## Evidence

- Screenshot: .artifacts/scenarios/flaky-network-recovery/final.png
- Trace: .artifacts/scenarios/flaky-network-recovery/trace.zip
- Report: .artifacts/scenarios/flaky-network-recovery/report.json
- Jira: QA-443

## Status

open — pending fix by @backend-team
```

---

**If `finalStatus === "recovered"`** → write to `obsidian-vault/Reports/Healing/`

```markdown
---
type: report
report_kind: healing
status: resolved
date: 2026-04-19
scenario: ui-change-healing
category: ui-missing-locator
---

# Healing Record — ui-change-healing — 2026-04-19

## What Was Healed

Stale selector button:has-text("Sign Up") replaced by GenericLocatorHealer.
Selected candidate: data-testid="join-now" (score: 18.5)
Action: click — succeeded. Page navigated to /dashboard.

## Recovery Strategy

locator-heal via RecoveryRouter → GenericLocatorHealer
Intent tokens used: ["join", "dashboard", "start"]
Top candidates scored: 3

## Permanent Fix Recommended

File: framework/pom/HomePage.ts
Direction: Update joinNow primary locator to use data-testid="join-now"
This healing will recur until the page object is updated.

## Evidence

- Screenshot: .artifacts/scenarios/ui-change-healing/final.png
- Trace: .artifacts/scenarios/ui-change-healing/trace.zip
- Report: .artifacts/scenarios/ui-change-healing/report.json
```

---

#### 2. After every scheduled run — Daily Regression note

Written to `obsidian-vault/Reports/Daily/YYYY-MM-DD.md`
using the existing `Templates/Daily Regression Report.md` template.

```markdown
---
type: report
report_kind: daily-regression
status: completed
date: 2026-04-19
time: 02:00
---

# Daily Regression Report — 2026-04-19

## Summary

- Overall status: PARTIAL FAILURE
- Total tests: 20
- Passed: 18
- Failed: 2

## Failed Tests

### flaky-network-recovery

- Category: ui-loading-or-network (89%)
- Final status: failed
- Incident note: [[Reports/Incidents/2026-04-19-flaky-network-recovery]]
- Jira ticket: QA-443

### api-error-diagnosis

- Category: api-contract-drift (97%)
- Final status: failed
- Incident note: [[Reports/Incidents/2026-04-19-api-error-diagnosis]]
- Jira ticket: QA-444

## Healed (recovered automatically)

- ui-change-healing → [[Reports/Healing/2026-04-19-ui-change-healing]]
- generic-self-healing → [[Reports/Healing/2026-04-19-generic-self-healing]]

## Artifacts

- HTML report: .artifacts/playwright-report/index.html
- Build: Jenkins #142

## Next Actions

- Review QA-443 and QA-444 before next release
- Update extend-wait timeout in NetworkRecoveryAgent
```

---

#### 3. After a fix is verified — Task note result update

When a fix lands and the relevant test passes again, the agent updates
the task note in `obsidian-vault/Tasks/` with the result.

```markdown
## Result

Fix verified on 2026-04-20.
Commit: def456 — "Increase extend-wait timeout to 8000ms"
Validation: npm run test:e2e — passed (20/20)
Jira QA-443 transitioned to Resolved.
Incident note updated: [[Reports/Incidents/2026-04-19-flaky-network-recovery]]
```

---

#### 4. Cross-session memory — AGENT_MEMORY.md

`obsidian-vault/AGENT_MEMORY.md` is the persistent cross-session memory file.
When significant events happen, the agent appends to this file so the next session
starts with context about recent failures, healed scenarios, and open issues.

```markdown
## Recent Incidents (last 7 days)

| Date       | Scenario               | Category              | Status | Ticket |
| ---------- | ---------------------- | --------------------- | ------ | ------ |
| 2026-04-19 | flaky-network-recovery | ui-loading-or-network | open   | QA-443 |
| 2026-04-19 | api-error-diagnosis    | api-contract-drift    | open   | QA-444 |
| 2026-04-18 | ui-change-healing      | ui-missing-locator    | healed | —      |

## Open Permanent Fix Items

- NetworkRecoveryAgent extend-wait timeout too short — QA-443
- phone_number type enforcement missing on client — QA-444

## Last Full Suite Result

Date: 2026-04-19 02:00
Passed: 18/20
Build: Jenkins #142
```

---

### How BugReportingAgent writes to the vault

The `BugReportingAgent` gets two extra methods for Obsidian:

```
BugReportingAgent.writeIncidentNote(report, classification, patchProposal)
  → writes obsidian-vault/Reports/Incidents/YYYY-MM-DD-<scenario>.md

BugReportingAgent.writeHealingNote(report, classification)
  → writes obsidian-vault/Reports/Healing/YYYY-MM-DD-<scenario>.md

BugReportingAgent.updateAgentMemory(incidents[], healings[])
  → appends to obsidian-vault/AGENT_MEMORY.md

BugReportingAgent.updateDailyReport(summary)
  → writes obsidian-vault/Reports/Daily/YYYY-MM-DD.md
```

All writes are **plain Markdown files** — no Obsidian plugin or API required.
Obsidian reads them automatically because they are in the vault folder.
Git versions them automatically because the vault is inside the repo.

---

### How the /bug-report skill triggers Obsidian writes

```
/bug-report --failed-only
    ↓
BugReportingAgent runs for each failed scenario
    ↓
For each failed scenario:
  → Create Jira ticket
  → Notify Slack
  → Write Incident note to Reports/Incidents/
  → Append to AGENT_MEMORY.md

For each recovered scenario:
  → Write Healing note to Reports/Healing/

After all scenarios processed:
  → Write daily summary to Reports/Daily/YYYY-MM-DD.md
```

---

### Obsidian as the single source of truth for QA history

| What happened                       | Where to find it                             |
| ----------------------------------- | -------------------------------------------- |
| What failed today                   | `Reports/Daily/YYYY-MM-DD.md`                |
| Full incident detail                | `Reports/Incidents/YYYY-MM-DD-<scenario>.md` |
| What the agent healed               | `Reports/Healing/YYYY-MM-DD-<scenario>.md`   |
| What still needs a permanent fix    | `AGENT_MEMORY.md` → Open Permanent Fix Items |
| What the last full suite result was | `AGENT_MEMORY.md` → Last Full Suite Result   |
| What tasks are in progress          | `Tasks/<task-file>.md`                       |
| What the overall project state is   | `01 Project Map.md`, `02 Test Map.md`        |

---

### The complete end-to-end flow — test to memory

```
Test runs
    ↓
Failure detected
    ↓
Agents classify → recover → diagnose → propose fix
    ↓
BugReportingAgent.format()
    ↓
┌─────────────────────────────────────────────────────────┐
│  Reporting Layer                                        │
│                                                         │
│  Jira / Azure   → ticket created with evidence         │
│  Slack          → team notified immediately             │
│  Obsidian       → incident note written to vault       │
│  AGENT_MEMORY   → cross-session memory updated         │
│  Daily Report   → scheduled run summary written        │
└─────────────────────────────────────────────────────────┘
    ↓
Fix lands → CI passes → task note updated → ticket closed
    ↓
Obsidian vault has the full history, versioned in Git
```

---

### Why this matters in a real company

Most QA teams lose history between sessions, sprints, and team members.
A new engineer joining the team has no idea what failed last week,
what was healed automatically, and what still needs a permanent fix.

With this model:

- Open Obsidian → see the full history of every failure and recovery
- Read `AGENT_MEMORY.md` → understand the current state in under 2 minutes
- Read `Reports/Incidents/` → see exactly what broke, why, and what the fix direction is
- Read `Reports/Healing/` → see what the agent recovered and whether it needs a permanent fix
- All of it versioned in Git → reviewable, auditable, handoff-ready

---

## Summary

A complete bug reporting system in a real company has five layers:

```
Layer 1 — Detection
  Automated tests, monitoring, alerts catch the failure

Layer 2 — Documentation
  Structured report: title, steps, evidence, classification, severity, fix direction

Layer 3 — Communication
  Right person gets notified through the right channel immediately

Layer 4 — Tracking
  Ticket in Jira / Azure Boards with full lifecycle from open to verified-closed

Layer 5 — Learning
  Regression reports, post-mortems, trend dashboards prevent the same bug recurring
```

This workspace already owns Layer 1 and most of Layer 2.
Layers 3, 4, and 5 are the next build phase.
