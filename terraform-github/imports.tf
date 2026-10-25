# Adoption, not creation. Everything in main.tf already existed on GitHub
# before this folder did, so the first apply must take ownership of what is
# there rather than make a second copy or, worse, fail on "already exists" and
# tempt someone to delete the original. An import block does that: the first
# plan reads "N to import" and the resource enters the state with no change to
# GitHub.
#
# Once a resource is in the state its import block does nothing, so these can
# stay as the record of where each thing came from. If the state were ever
# lost, a plan with these blocks adopts everything again instead of trying to
# recreate the ruleset that protects main.
#
# The IDs are the provider's import formats: the repository by name, the
# ruleset as repository:ruleset-id (21743894 is Repo-Main, created
# 2026-08-28), and each label as repository:name.

import {
  to = github_repository.this
  id = var.repository
}

import {
  to = github_repository_ruleset.main
  id = "${var.repository}:21743894"
}

import {
  for_each = local.labels

  to = github_issue_label.this[each.key]
  id = "${var.repository}:${each.key}"
}
