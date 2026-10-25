# The token is the only secret this folder touches, and it never reaches a
# file. It is read from the TF_VAR_github_token environment variable, which
# Terraform maps onto this variable by name. `sensitive` keeps it out of the
# terminal; `ephemeral` keeps it out of the plan file and the state as well, so
# the state in HCP Terraform and any saved plan can be read without exposing it.
variable "github_token" {
  description = "Fine-grained personal access token for this one repository: Administration read/write (the ruleset, settings and topics) and Issues read/write (labels). Set TF_VAR_github_token. Never write it in a file, and do not use the GITHUB_TOKEN name, which the gh CLI would pick up too."
  type        = string
  sensitive   = true
  ephemeral   = true

  # Only a fine-grained token is accepted. A classic token (ghp_) cannot be
  # limited to one repository, so it would carry power over the whole account;
  # refusing the prefix refuses the whole class.
  validation {
    condition     = startswith(var.github_token, "github_pat_")
    error_message = "github_token must be a fine-grained token, which starts with github_pat_. A classic token is refused because it cannot be limited to this one repository."
  }
}

variable "owner" {
  description = "The GitHub account that owns the repository."
  type        = string
  default     = "asaf-1"
}

variable "repository" {
  description = "The repository whose settings this folder manages. It already exists and is imported on the first apply, never created here."
  type        = string
  default     = "Agents-Playground"
}
