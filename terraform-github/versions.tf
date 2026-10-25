terraform {
  required_version = "~> 1.16"

  # State lives in HCP Terraform, unlike terraform/, whose state is a local
  # file. The cluster that folder builds is disposable and exists only on the
  # machine that built it, so a local file is right there. The settings this
  # folder manages exist once and protect main, so the record of what Terraform
  # owns has to outlive any one laptop: HCP keeps it with a version history and
  # a lock.
  #
  # The workspace is in local execution mode: Terraform runs here, with the
  # GitHub token from this machine, and only the state file is stored remotely.
  # Nothing in that state is secret. The token is provider configuration and an
  # ephemeral variable, so it is never written to state or to a plan file.
  cloud {
    organization = "Asaf-Platform"

    workspaces {
      name = "agents-playground-github"
    }
  }

  required_providers {
    # Manages the repository's settings, its ruleset and its labels. The exact
    # build is pinned in .terraform.lock.hcl for both platforms this runs on.
    github = {
      source  = "integrations/github"
      version = "~> 6.13"
    }
  }
}
