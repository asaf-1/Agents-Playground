# ingress-nginx: the front door. Upstream's own manifest for kind, vendored
# unchanged in ingress-nginx/ with its version and SHA256 recorded there. It is
# ~30 objects in one file, so it is split into documents and applied one by
# one, the namespace first.
#
# Not part of k8s/: that folder is this app's manifests, every one of which
# lives in the agents-playground namespace and is applied as a numbered unit.
# This is somebody else's software in a namespace of its own.

terraform {
  required_providers {
    kubectl = {
      source  = "alekc/kubectl"
      version = "~> 2.4"
    }
  }
}

variable "manifest" {
  description = "The vendored ingress-nginx manifest, as text (the root reads the file)."
  type        = string
}

variable "source_name" {
  description = "Where the manifest came from, for error messages."
  type        = string
}

variable "cluster_id" {
  description = "The cluster's id, so the readiness wait re-runs on a new cluster."
  type        = string
}

variable "kubeconfig_path" {
  description = "The admin kubeconfig the readiness wait uses with kubectl."
  type        = string
}

data "kubectl_file_documents" "ingress_nginx" {
  content = var.manifest
}

locals {
  # The vendored file's own namespace, which 29 of its 30 objects live inside.
  # kubectl_manifest resources are applied in PARALLEL, so without splitting
  # this out they race the namespace they declare and lose: the canary failed
  # on 2026-10-17 with `namespaces "ingress-nginx" not found` on five objects,
  # while others in the same apply succeeded. It passed locally only because
  # the namespace happened to land first. The same split is why the app's own
  # manifests in k8s/ have never had this problem.
  ingress_namespace_key = "/api/v1/namespaces/ingress-nginx"

  ingress_namespace = {
    for path, body in data.kubectl_file_documents.ingress_nginx.manifests :
    path => body if path == local.ingress_namespace_key
  }

  ingress_rest = {
    for path, body in data.kubectl_file_documents.ingress_nginx.manifests :
    path => body if path != local.ingress_namespace_key
  }
}

resource "kubectl_manifest" "ingress_nginx_namespace" {
  for_each = local.ingress_namespace

  yaml_body = each.value

  lifecycle {
    # If upstream ever renames or removes the namespace document, this map is
    # empty, every object below races again, and the failure reads as a broken
    # cluster rather than a changed file.
    precondition {
      condition     = length(local.ingress_namespace) == 1
      error_message = "${var.source_name} no longer contains exactly one document at ${local.ingress_namespace_key}. Everything else in that file lives in that namespace and must be applied after it."
    }
  }
}

resource "kubectl_manifest" "ingress_nginx" {
  for_each = local.ingress_rest

  yaml_body = each.value

  # Its own CRDs and webhook configuration are in the same file, so give it
  # room: on a cold cluster the images are a 544 MB pull.
  timeouts {
    create = "5m"
    update = "5m"
  }

  depends_on = [kubectl_manifest.ingress_nginx_namespace]
}

# An Ingress is rejected by ingress-nginx's own admission webhook until the
# controller behind that webhook is serving. Terraform cannot see that - the
# objects above are "created" the moment the API accepts them - so the wait is
# explicit. Without it, applying the Ingress fails perhaps half the time with a
# webhook connection error that says nothing about timing.
resource "terraform_data" "ingress_nginx_ready" {
  triggers_replace = [var.cluster_id, data.kubectl_file_documents.ingress_nginx.id]

  provisioner "local-exec" {
    environment = {
      KUBECONFIG = var.kubeconfig_path
    }

    command = "kubectl wait --namespace ingress-nginx --for=condition=ready pod --selector=app.kubernetes.io/component=controller --timeout=300s"
  }

  depends_on = [kubectl_manifest.ingress_nginx]
}
