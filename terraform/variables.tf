variable "image_tag" {
  description = "Tag of the agents-playground image to deploy. The image must already exist in the local Docker engine: npm run k8s:tf:up builds it and passes a tag derived from its content."
  type        = string
  default     = "local"

  # The tag is interpolated into a local-exec command in main.tf, so anything
  # beyond Docker's own tag grammar is refused rather than run by a shell.
  validation {
    condition     = can(regex("^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$", var.image_tag))
    error_message = "image_tag must be a valid Docker tag: letters, digits, '_', '.' and '-', at most 128 characters, not starting with '.' or '-'."
  }
}

# What this module reads, as paths relative to terraform/.
#
# They are variables for one reason: terraform/tests/ needs to hand the
# preconditions in main.tf a deliberately broken copy and watch them refuse it.
# A guard nothing ever trips is a guard nobody knows still works. Outside the
# tests these are never set, and the defaults are the real files.
variable "kind_config_path" {
  description = "The kind cluster definition read by yamldecode. Tests override it with a fixture."
  type        = string
  default     = "../kind/kind-config.yaml"
}

variable "k8s_dir" {
  description = "The folder of manifests to apply. Every *.yaml in it is applied, so a new file needs no change here. Tests override it with a folder of fixtures."
  type        = string
  default     = "../k8s"
}
