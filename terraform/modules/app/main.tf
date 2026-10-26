# The app: every manifest in k8s/, applied as written, the namespace and the
# ConfigMap first. The root reads the folder and rewrites the one Deployment
# (image tag, config checksum); this module applies what it is handed and
# guards the two rewrites.

terraform {
  required_providers {
    kubectl = {
      source  = "alekc/kubectl"
      version = "~> 2.4"
    }
  }
}

variable "first_manifests" {
  description = "name => body for the manifests applied before the rest: the namespace and the ConfigMap, when present."
  type        = map(string)
}

variable "manifests" {
  description = "name => body for every other manifest in k8s/, the Deployment already rewritten."
  type        = map(string)
}

variable "deployment_name" {
  description = "The one file whose body the root rewrites."
  type        = string
}

variable "deployment_source" {
  description = "The Deployment as it is on disk, before the rewrite, for the guards."
  type        = string
}

variable "source_image_line" {
  description = "The image line the root replaces; it must exist on disk."
  type        = string
}

variable "source_config_line" {
  description = "The config-checksum placeholder the root replaces; it must exist on disk when there is a ConfigMap."
  type        = string
}

variable "config_source" {
  description = "The ConfigMap as it is on disk, or empty when there is none."
  type        = string
}

# The namespace and the ConfigMap, applied before the rest. Only the ones that
# exist: the module still works with a folder that has neither.
resource "kubectl_manifest" "first" {
  for_each = var.first_manifests

  yaml_body = each.value
}

resource "kubectl_manifest" "app" {
  for_each = var.manifests

  yaml_body = each.value

  # wait_for_rollout defaults to true for a Deployment, so apply itself does
  # not finish until the readiness probe passes - the job
  # `kubectl rollout status --timeout=180s` does in the CLI path. For a kind
  # that does not roll out, such as a Service, it is a no-op.
  timeouts {
    create = "3m"
    update = "3m"
  }

  depends_on = [kubectl_manifest.first]

  lifecycle {
    # An unmatched replace() would quietly deploy the :local tag, which does not
    # exist on the node, and surface minutes later as a rollout timeout. Checked
    # only for the one file that is rewritten.
    precondition {
      condition     = each.key != var.deployment_name || strcontains(var.deployment_source, var.source_image_line)
      error_message = "k8s/${var.deployment_name} no longer contains the literal '${var.source_image_line}' that terraform/main.tf rewrites."
    }

    # Without this the annotation would keep its placeholder value, a settings
    # change would not roll the pods, and the only symptom would be a setting
    # that quietly did not take effect.
    precondition {
      condition     = each.key != var.deployment_name || var.config_source == "" || strcontains(var.deployment_source, var.source_config_line)
      error_message = "k8s/${var.deployment_name} no longer contains the config-checksum placeholder that terraform/main.tf rewrites, so a ConfigMap change would not restart the pods."
    }
  }
}

# What actually reached the cluster, name => body, for terraform/tests/. A
# test can only see the root module, so the resources are exported this way
# rather than reached into.
#
# Marked sensitive because the provider marks yaml_body sensitive - a manifest
# may carry a Secret - and the mark travels with the value. Nothing in k8s/ is
# secret, but an output has to say so explicitly or Terraform refuses it. The
# tests can still read the bodies; they only cannot print them.
output "applied_first" {
  value     = { for name, manifest in kubectl_manifest.first : name => manifest.yaml_body }
  sensitive = true
}

output "applied" {
  value     = { for name, manifest in kubectl_manifest.app : name => manifest.yaml_body }
  sensitive = true
}
