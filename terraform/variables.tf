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
