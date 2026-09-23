locals {
  # kind/kind-config.yaml stays the single source for the cluster shape.
  # npm run k8s:up reads it with the kind CLI, and this reads the same file, so
  # the two paths cannot drift apart.
  kind_config = yamldecode(file("${path.module}/../kind/kind-config.yaml"))

  image = "agents-playground:${var.image_tag}"

  deployment_source = file("${path.module}/../k8s/deployment.yaml")
  source_image_line = "image: agents-playground:local"

  # The manifest names agents-playground:local, as npm run k8s:deploy expects.
  # The tag is swapped in memory, exactly as k8s-canary.yml does with sed, so
  # the file on disk is applied unchanged apart from that one value.
  deployment_yaml = replace(local.deployment_source, local.source_image_line, "image: ${local.image}")

  port_mapping = local.kind_config.nodes[0].extraPortMappings[0]
}

resource "kind_cluster" "this" {
  name = local.kind_config.name

  # Pinned by digest to the node image of the kind library this provider is
  # built on: tehcyx/kind 0.11.0 embeds kind v0.31.0, whose image is Kubernetes
  # v1.35.0. A newer image does not boot on it - v1.37.0, the kind v0.33.0 CLI
  # default, fails in kubeadm init - so bump this only together with the
  # provider. The CLI path (npm run k8s:up) runs v1.37.0; the manifests use only
  # long-stable APIs (apps/v1 Deployment, v1 Service), so both behave the same.
  node_image     = "kindest/node:v1.35.0@sha256:452d707d4862f52530247495d180205e029056831160e22870e37e3f6c1ac31f"
  wait_for_ready = true

  kind_config {
    kind        = local.kind_config.kind
    api_version = local.kind_config.apiVersion

    dynamic "node" {
      for_each = local.kind_config.nodes

      content {
        role = node.value.role

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
      condition     = length(setsubtract(keys(local.kind_config), ["kind", "apiVersion", "name", "nodes"])) == 0
      error_message = "kind/kind-config.yaml has a top-level field terraform/main.tf does not map. Map it in kind_cluster.this, or the Terraform cluster will differ from npm run k8s:up."
    }

    precondition {
      condition     = alltrue([for n in local.kind_config.nodes : length(setsubtract(keys(n), ["role", "extraPortMappings"])) == 0])
      error_message = "kind/kind-config.yaml has a node field terraform/main.tf does not map. Map it in kind_cluster.this, or the Terraform cluster will differ from npm run k8s:up."
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
  triggers_replace = [kind_cluster.this.id, local.image]

  provisioner "local-exec" {
    command = "kind load docker-image ${local.image} --name ${kind_cluster.this.name}"
  }
}

provider "kubectl" {
  # Credentials come straight from the cluster resource, not ~/.kube/config, so
  # the deploy talks to the cluster Terraform just made and nothing else.
  host                   = kind_cluster.this.endpoint
  client_certificate     = kind_cluster.this.client_certificate
  client_key             = kind_cluster.this.client_key
  cluster_ca_certificate = kind_cluster.this.cluster_ca_certificate
  load_config_file       = false

  # On a first apply those four values are unknown until the cluster exists, and
  # without this the provider fails the plan with "no configuration has been
  # provided". It builds the client on first use instead.
  lazy_load = true
}

resource "kubectl_manifest" "deployment" {
  yaml_body = local.deployment_yaml

  # wait_for_rollout defaults to true for a Deployment, so apply itself does
  # not finish until the readiness probe passes - the job
  # `kubectl rollout status --timeout=180s` does in the CLI path.
  timeouts {
    create = "3m"
    update = "3m"
  }

  depends_on = [terraform_data.image_load]

  lifecycle {
    # An unmatched replace() would quietly deploy the :local tag, which does not
    # exist on the node, and surface minutes later as a rollout timeout.
    precondition {
      condition     = strcontains(local.deployment_source, local.source_image_line)
      error_message = "k8s/deployment.yaml no longer contains the literal '${local.source_image_line}' that terraform/main.tf rewrites."
    }
  }
}

resource "kubectl_manifest" "service" {
  yaml_body = file("${path.module}/../k8s/service.yaml")
}
