output "repository_url" {
  description = "The repository on GitHub."
  value       = github_repository.this.html_url
}

output "ruleset_id" {
  description = "GitHub's ID for the Repo-Main ruleset, the one the import block names."
  value       = github_repository_ruleset.main.ruleset_id
}

output "labels" {
  description = "Every label this folder manages, sorted."
  value       = sort(keys(github_issue_label.this))
}
