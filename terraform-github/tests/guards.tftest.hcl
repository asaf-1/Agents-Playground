# Tests for terraform-github/, run by `terraform test` (and by
# npm run github:tf:check and the PR check).
#
# Why these exist: this folder's whole job is to keep a handful of settings
# exactly so, and a plan on the real GitHub needs a token and the HCP login,
# which CI does not have. These pin the settings that other parts of the repo
# depend on, so an edit that loosens one has to come here and say so.
#
# Nothing here talks to GitHub. The provider is mocked, every run is
# `command = plan`, and the token is a made-up value with the right prefix.

mock_provider "github" {}

# imports.tf adopts every resource from GitHub, and a mocked provider cannot
# import ("Cannot import resources from mock providers"). An override tells the
# test to treat each resource as already present with made-up computed values,
# while every argument written in main.tf keeps its real value, which is all
# the assertions below read.
override_resource {
  target = github_repository.this
}

override_resource {
  target = github_repository_ruleset.main
}

override_resource {
  target = github_issue_label.this
}

variables {
  github_token = "github_pat_made_up_for_tests_only"
}

# The rule that protects main. Everything below is what the push skill and the
# pre-merge process assume: the ruleset is live, it watches the default branch,
# nobody can delete or force-push it, and the one required check is Pre-Merge
# Gate as reported by GitHub Actions.
run "main_stays_protected" {
  command = plan

  assert {
    condition     = github_repository_ruleset.main.enforcement == "active"
    error_message = "The Repo-Main ruleset is no longer active. Set enforcement back to \"active\"; \"evaluate\" and \"disabled\" protect nothing."
  }

  assert {
    condition     = github_repository_ruleset.main.conditions[0].ref_name[0].include == tolist(["~DEFAULT_BRANCH"])
    error_message = "The ruleset no longer targets the default branch."
  }

  assert {
    condition     = github_repository_ruleset.main.rules[0].deletion == true && github_repository_ruleset.main.rules[0].non_fast_forward == true
    error_message = "The ruleset must keep blocking deletion and force-pushes on main."
  }

  assert {
    condition     = length(github_repository_ruleset.main.rules[0].pull_request) == 1
    error_message = "The ruleset must keep requiring a pull request to change main."
  }

  assert {
    condition     = contains([for c in github_repository_ruleset.main.rules[0].required_status_checks[0].required_check : c.context], "Pre-Merge Gate")
    error_message = "Pre-Merge Gate is no longer a required check. It is the only check that gates a merge; see CLAUDE.md."
  }

  assert {
    condition     = alltrue([for c in github_repository_ruleset.main.rules[0].required_status_checks[0].required_check : c.integration_id == 15368])
    error_message = "A required check lost its GitHub Actions app ID (15368). Without it, any status named Pre-Merge Gate would satisfy the rule."
  }

  assert {
    condition     = length(github_repository_ruleset.main.bypass_actors) == 0
    error_message = "The ruleset gained a bypass actor. Nobody skips the gate here, not even the owner."
  }
}

# The repository switches the push skill leans on. It arms auto-merge with a
# squash and expects GitHub to delete the branch afterwards.
run "the_push_skill_settings_stay" {
  command = plan

  assert {
    condition     = github_repository.this.allow_auto_merge == true
    error_message = "allow_auto_merge is off. The push skill arms auto-merge on every PR."
  }

  assert {
    condition     = github_repository.this.allow_squash_merge == true
    error_message = "Squash merges are disabled, but every PR here is squash-merged."
  }

  assert {
    condition     = github_repository.this.delete_branch_on_merge == true
    error_message = "delete_branch_on_merge is off. Merged branches would pile up on GitHub."
  }

  assert {
    condition     = github_repository.this.visibility == "public"
    error_message = "The repository is no longer public. Rulesets on a private repository need a paid plan, and this is a public demo."
  }
}

# The label the AI Review Gate reads. The precondition on the resource refuses
# the plan when it is missing; this proves the label is still there today.
run "the_ai_reviewed_label_stays" {
  command = plan

  assert {
    condition     = contains(keys(github_issue_label.this), "ai-reviewed")
    error_message = "The ai-reviewed label is gone from local.labels."
  }

  assert {
    condition     = contains(output.labels, "ai-reviewed")
    error_message = "The labels output no longer lists ai-reviewed."
  }
}

# A classic token must be refused before anything is planned. It cannot be
# scoped to one repository, so the whole account would be exposed to a mistake
# in this folder.
run "a_classic_token_is_refused" {
  command = plan

  variables {
    github_token = "ghp_classic_token_made_up_for_tests"
  }

  expect_failures = [
    var.github_token,
  ]
}
