# The cluster: a kind cluster built from the decoded kind/kind-config.yaml the
# root hands in, plus the load of the app image onto its node. Everything the
# kubectl provider at the root needs comes back out as outputs.
#
# A module is a folder of Terraform with inputs and outputs, like a function.
# Splitting the root into cluster, ingress and app made each part readable on
# its own and let the root read as a table of contents. The resources kept
# their names; `moved` blocks in the root's main.tf told Terraform where each
# one went, so the split destroyed and recreated nothing.

# Only a lower bound: the exact version is pinned once, in terraform/versions.tf
# and the lock file. A second pin here is what broke Dependabot's PR #82, which
# bumped the root and left this copy behind.
terraform {
  required_providers {
    kind = {
      source  = "tehcyx/kind"
      version = ">= 0.13.0"
    }
  }
}

variable "kind_config" {
  description = "kind/kind-config.yaml, decoded by the root with yamldecode, so the YAML stays the only copy."
  type        = any
}

variable "image" {
  description = "The app image to load onto the node, name:tag, already built in the local Docker engine."
  type        = string
}

resource "kind_cluster" "this" {
  name = var.kind_config.name

  # No node_image on purpose: kind then uses the default image of the kind
  # library inside the provider, which kind pins by digest in its own source.
  # tehcyx/kind 0.13.0 embeds kind v0.33.0, so the node is
  # kindest/node:v1.37.0@sha256:a1ed56cf..., the same image the CLI path
  # (npm run k8s:up, kind v0.33.0) runs. The lock file pins the provider, so the
  # image cannot change by itself, and a provider bump brings the image that
  # matches it: an image newer than the provider's kind fails in kubeadm init,
  # which is why a hand-pinned one had to be bumped in step with the provider.
  wait_for_ready = true

  kind_config {
    kind        = var.kind_config.kind
    api_version = var.kind_config.apiVersion

    dynamic "node" {
      for_each = var.kind_config.nodes

      content {
        role = node.value.role

        # ingress-nginx schedules its controller only onto a node carrying
        # ingress-ready=true (kind/kind-config.yaml says why).
        labels = lookup(node.value, "labels", null)

        dynamic "extra_port_mappings" {
          for_each = lookup(node.value, "extraPortMappings", [])

          content {
            container_port = extra_port_mappings.value.containerPort
            host_port      = extra_port_mappings.value.hostPort
            listen_address = lookup(extra_port_mappings.value, "listenAddress", null)
            protocol       = lookup(extra_port_mappings.value, "protocol", null)
          }
        }
      }
    }
  }

  # Only the fields above are translated. A field added to kind-config.yaml
  # later would otherwise be dropped without a word, and the Terraform cluster
  # would quietly differ from the CLI one.
  lifecycle {
    precondition {
      condition     = length(setsubtract(keys(var.kind_config), ["kind", "apiVersion", "name", "nodes"])) == 0
      error_message = "kind/kind-config.yaml has a top-level field terraform/modules/cluster/main.tf does not map. Map it in kind_cluster.this, or the Terraform cluster will differ from npm run k8s:up."
    }

    precondition {
      condition     = alltrue([for n in var.kind_config.nodes : length(setsubtract(keys(n), ["role", "extraPortMappings", "labels"])) == 0])
      error_message = "kind/kind-config.yaml has a node field terraform/modules/cluster/main.tf does not map. Map it in kind_cluster.this, or the Terraform cluster will differ from npm run k8s:up."
    }
  }
}

# The image never goes to a registry: kind copies it from the local Docker
# engine onto the node, which is why the Deployment says imagePullPolicy: Never.
#
# SEAM (paid-tier graduation): on a managed cluster this becomes a docker push
# to a registry, and nothing below it changes.
resource "terraform_data" "image_load" {
  # Re-run on a new image tag, or when the cluster itself is replaced, since a
  # new cluster starts with no images on its node.
  triggers_replace = [kind_cluster.this.id, var.image]

  provisioner "local-exec" {
    command = "kind load docker-image ${var.image} --name ${kind_cluster.this.name}"
  }
}

output "id" {
  value = kind_cluster.this.id
}

output "name" {
  value = kind_cluster.this.name
}

output "endpoint" {
  value = kind_cluster.this.endpoint
}

# The admin credentials, for the kubectl provider at the root. Marked
# sensitive here, so a plan or an output listing never prints them; the
# provider itself does not mark them (see npm run k8s:tf:down).
output "client_certificate" {
  value     = kind_cluster.this.client_certificate
  sensitive = true
}

output "client_key" {
  value     = kind_cluster.this.client_key
  sensitive = true
}

output "cluster_ca_certificate" {
  value     = kind_cluster.this.cluster_ca_certificate
  sensitive = true
}

output "kubeconfig_path" {
  value = kind_cluster.this.kubeconfig_path
}
