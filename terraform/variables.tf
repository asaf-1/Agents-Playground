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

# The three files this module reads, as paths relative to terraform/.
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

variable "deployment_path" {
  description = "The Deployment manifest whose image tag is rewritten in memory. Tests override it with a fixture."
  type        = string
  default     = "../k8s/deployment.yaml"
}

variable "service_path" {
  description = "The Service manifest, applied as written. Tests override it with a fixture."
  type        = string
  default     = "../k8s/service.yaml"
}
