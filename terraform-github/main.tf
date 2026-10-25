# The repository's settings on GitHub, as code.
#
# Until 2026-10-25 every one of these was made by clicking in GitHub's settings
# pages. Now this file is the record and Terraform makes GitHub match it, so a
# change to a rule on main goes through a pull request, like a change to code.
#
# Nothing here is created on the first apply. Everything already exists and is
# adopted through the import blocks in imports.tf, so the first plan reads
# "to import" and "0 to add, 0 to change, 0 to destroy". A plan that wants to
# create or destroy any of this is wrong and must not be applied.
#
# Two things to fear in this folder. Terraform removes what the file does not
# mention: a ruleset left out is a ruleset deleted, and with it the requirement
# that Pre-Merge Gate passes before a merge. And `destroy` would delete the
# repository itself. prevent_destroy on both resources turns either into an
# error instead of an action.

provider "github" {
  owner = var.owner
  token = var.github_token
}

locals {
  # Every label, exactly as GitHub holds it. Removing one here deletes it on
  # GitHub, which is the point of managing them - but ai-reviewed is
  # load-bearing: .github/workflows/ai-review-gate.yml attaches it when a
  # review is attested and clears it on a new commit, so the precondition on
  # the resource below refuses a plan that drops it.
  labels = {
    "bug"              = { color = "d73a4a", description = "Something isn't working" }
    "documentation"    = { color = "0075ca", description = "Improvements or additions to documentation" }
    "duplicate"        = { color = "cfd3d7", description = "This issue or pull request already exists" }
    "enhancement"      = { color = "a2eeef", description = "New feature or request" }
    "good first issue" = { color = "7057ff", description = "Good for newcomers" }
    "help wanted"      = { color = "008672", description = "Extra attention is needed" }
    "invalid"          = { color = "e4e669", description = "This doesn't seem right" }
    "question"         = { color = "d876e3", description = "Further information is requested" }
    "wontfix"          = { color = "ffffff", description = "This will not be worked on" }
    "ai-reviewed"      = { color = "0E8A16", description = "Current PR head has Codex or Claude review evidence" }
  }

  # The one check a pull request must pass before it can merge, and the app it
  # must come from. 15368 is GitHub Actions: pinning the app means a status
  # called "Pre-Merge Gate" posted by anything else - a script with a token,
  # say - does not count.
  required_check     = "Pre-Merge Gate"
  github_actions_app = 15368
}

# The repository: description and topics, which merge buttons exist, and the
# housekeeping switches the push skill relies on (auto-merge, delete the branch
# on merge). Imported, never created here.
resource "github_repository" "this" {
  name        = var.repository
  description = "AI-powered self-healing Playwright testing playground."
  visibility  = "public"

  # Topics are the repository's tags on GitHub. Empty today; adding one here
  # is the smallest visible change this folder can make, and the proof that
  # the file now drives GitHub rather than the other way round.
  topics = []

  has_issues      = true
  has_projects    = true
  has_wiki        = false
  has_discussions = false
  is_template     = false

  # All three merge buttons stay. The push skill arms auto-merge with squash,
  # and GitHub deletes the branch afterwards, which is why 40 merged branches
  # could pile up locally but never on GitHub.
  allow_merge_commit     = true
  allow_squash_merge     = true
  allow_rebase_merge     = true
  allow_auto_merge       = true
  allow_update_branch    = false
  delete_branch_on_merge = true

  squash_merge_commit_title   = "COMMIT_OR_PR_TITLE"
  squash_merge_commit_message = "COMMIT_MESSAGES"
  merge_commit_title          = "MERGE_MESSAGE"
  merge_commit_message        = "PR_TITLE"

  web_commit_signoff_required = false

  # Belt and braces. prevent_destroy makes any plan that would destroy this
  # resource an error. If that line is ever removed, archive_on_destroy means a
  # destroy archives the repository instead of deleting it.
  archive_on_destroy = true

  lifecycle {
    prevent_destroy = true
  }
}

# The ruleset on main, named Repo-Main on GitHub since 2026-08-28. It requires
# a pull request, requires the Pre-Merge Gate check from GitHub Actions, and
# blocks deleting or force-pushing the branch. No bypass actors: not even the
# owner skips it.
resource "github_repository_ruleset" "main" {
  name        = "Repo-Main"
  repository  = github_repository.this.name
  target      = "branch"
  enforcement = "active"

  conditions {
    ref_name {
      include = ["~DEFAULT_BRANCH"]
      exclude = []
    }
  }

  rules {
    deletion         = true
    non_fast_forward = true

    # Zero required approvals: one person works here, and the gate is the
    # test run, not a review. AI review is advisory and never a required
    # check; that rule is in CLAUDE.md.
    pull_request {
      required_approving_review_count   = 0
      dismiss_stale_reviews_on_push     = false
      require_code_owner_review         = false
      require_last_push_approval        = false
      required_review_thread_resolution = false
      allowed_merge_methods             = ["merge", "squash", "rebase"]
    }

    required_status_checks {
      # Not strict: a PR need not be rebased onto the newest main before it
      # merges. Strict would make every merge invalidate every other open PR.
      strict_required_status_checks_policy = false
      do_not_enforce_on_create             = false

      required_check {
        context        = local.required_check
        integration_id = local.github_actions_app
      }
    }
  }

  # GitHub also holds a setting on this ruleset that the provider does not
  # know: "require extra approval for unattributed changes", switched on. The
  # provider cannot read or write it, so it is invisible to plan. After any
  # apply that changes the ruleset, check it is still on:
  #   gh api repos/asaf-1/Agents-Playground/rulesets/21743894 --jq '.rules[] | select(.type=="pull_request") | .parameters.require_extra_approval_for_unattributed_changes'
  lifecycle {
    prevent_destroy = true
  }
}

resource "github_issue_label" "this" {
  for_each = local.labels

  repository  = github_repository.this.name
  name        = each.key
  color       = each.value.color
  description = each.value.description

  lifecycle {
    precondition {
      condition     = contains(keys(local.labels), "ai-reviewed")
      error_message = "The ai-reviewed label must stay in local.labels: .github/workflows/ai-review-gate.yml attaches it to a reviewed PR head and the gate reads it. Deleting it would break the AI Review Gate."
    }
  }
}
