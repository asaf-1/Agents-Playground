locals {
  # kind/kind-config.yaml stays the single source for the cluster shape.
  # The path is a variable only so terraform/tests/ can hand a deliberately
  # broken copy to the preconditions below; nothing else ever sets it.
  # npm run k8s:up reads it with the kind CLI, and this reads the same file, so
  # the two paths cannot drift apart.
  kind_config = yamldecode(file("${path.module}/${var.kind_config_path}"))

  image = "agents-playground:${var.image_tag}"

  # Every *.yaml in k8s/ is applied, rather than a list of filenames kept in
  # step with this file by hand. Drop a manifest in and the Terraform path, the
  # CLI path and the canary all pick it up; nothing here needs editing.
  manifest_dir   = "${path.module}/${var.k8s_dir}"
  manifest_names = fileset(local.manifest_dir, "*.yaml")

  # The one file whose content is not applied as written: its image tag is
  # swapped in memory below.
  deployment_name   = "20-deployment.yaml"
  deployment_source = file("${local.manifest_dir}/${local.deployment_name}")
  source_image_line = "image: agents-playground:local"

  # The manifest names agents-playground:local, as npm run k8s:deploy expects.
  # The tag is swapped in memory, exactly as k8s-canary.yml does with sed, so
  # the file on disk is applied unchanged apart from that one value.
  deployment_yaml = replace(
    replace(local.deployment_source, local.source_image_line, "image: ${local.image}"),
    local.source_config_line,
    "agents-playground/config-checksum: \"${local.config_checksum}\""
  )

  # Applied before everything else, because other manifests refer to them and
  # kubectl_manifest resources are otherwise applied in parallel. Without the
  # split a Deployment can reach the cluster before the namespace it names
  # exists, or before the ConfigMap it reads its settings from.
  # The numeric prefixes are the ordering for tools that just read the folder:
  # `kubectl apply -f k8s/` applies files in alphabetical order, so without
  # them the Deployment reaches the cluster before the namespace it declares.
  # Terraform does not rely on the names - it applies these two first and the
  # rest afterwards - but one order for every path is easier to trust.
  first_names = ["00-namespace.yaml", "10-configmap.yaml"]

  config_name   = "10-configmap.yaml"
  config_source = contains(local.manifest_names, local.config_name) ? file("${local.manifest_dir}/${local.config_name}") : ""

  # Kubernetes does not restart anything when a ConfigMap changes, so a
  # settings-only change would update the object and leave the running pods on
  # their old values. Putting a hash of the file in the pod template makes it a
  # real rollout. Any stable hash does; sha1 keeps the annotation short.
  source_config_line = "agents-playground/config-checksum: \"rewritten-by-terraform\""
  config_checksum    = sha1(local.config_source)

  # name => body, the deployment rewritten and everything else as written.
  manifests = {
    for name in local.manifest_names :
    name => name == local.deployment_name ? local.deployment_yaml : file("${local.manifest_dir}/${name}")
    if !contains(local.first_names, name)
  }

  first_manifests = {
    for name in local.manifest_names :
    name => file("${local.manifest_dir}/${name}")
    if contains(local.first_names, name)
  }

  # There is more than one mapping now - the app's NodePort and the ingress
  # controller's port 80 - so the app's is found by matching the nodePort the
  # Service actually publishes, rather than by position. The Service stays the
  # one place that number is written.
  service_name  = "30-service.yaml"
  app_node_port = yamldecode(file("${local.manifest_dir}/${local.service_name}")).spec.ports[0].nodePort
  port_mapping  = [for m in local.kind_config.nodes[0].extraPortMappings : m if m.containerPort == local.app_node_port][0]
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
      condition     = length(setsubtract(keys(local.kind_config), ["kind", "apiVersion", "name", "nodes"])) == 0
      error_message = "kind/kind-config.yaml has a top-level field terraform/main.tf does not map. Map it in kind_cluster.this, or the Terraform cluster will differ from npm run k8s:up."
    }

    precondition {
      condition     = alltrue([for n in local.kind_config.nodes : length(setsubtract(keys(n), ["role", "extraPortMappings", "labels"])) == 0])
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

# ingress-nginx: the front door. Upstream's own manifest for kind, vendored
# unchanged in ingress-nginx/ with its version and SHA256 recorded there. It is
# ~30 objects in one file, so it is split into documents and applied one by one.
#
# Not part of k8s/: that folder is this app's manifests, every one of which
# lives in the agents-playground namespace and is applied as a numbered unit.
# This is somebody else's software in a namespace of its own.
data "kubectl_file_documents" "ingress_nginx" {
  content = file("${path.module}/${var.ingress_nginx_path}")
}

resource "kubectl_manifest" "ingress_nginx" {
  for_each = data.kubectl_file_documents.ingress_nginx.manifests

  yaml_body = each.value

  # Its own CRDs and webhook configuration are in the same file, so give it
  # room: on a cold cluster the images are a 544 MB pull.
  timeouts {
    create = "5m"
    update = "5m"
  }

  depends_on = [kind_cluster.this]
}

# An Ingress is rejected by ingress-nginx's own admission webhook until the
# controller behind that webhook is serving. Terraform cannot see that - the
# objects above are "created" the moment the API accepts them - so the wait is
# explicit. Without it, applying the Ingress fails perhaps half the time with a
# webhook connection error that says nothing about timing.
resource "terraform_data" "ingress_nginx_ready" {
  triggers_replace = [kind_cluster.this.id, data.kubectl_file_documents.ingress_nginx.id]

  provisioner "local-exec" {
    environment = {
      KUBECONFIG = kind_cluster.this.kubeconfig_path
    }

    command = "kubectl wait --namespace ingress-nginx --for=condition=ready pod --selector=app.kubernetes.io/component=controller --timeout=300s"
  }

  depends_on = [kubectl_manifest.ingress_nginx]
}

# The namespace and the ConfigMap, applied before the rest. Only the ones that
# exist: the module still works with a folder that has neither.
resource "kubectl_manifest" "first" {
  for_each = local.first_manifests

  yaml_body = each.value

  depends_on = [terraform_data.image_load]
}

resource "kubectl_manifest" "app" {
  for_each = local.manifests

  yaml_body = each.value

  # wait_for_rollout defaults to true for a Deployment, so apply itself does
  # not finish until the readiness probe passes - the job
  # `kubectl rollout status --timeout=180s` does in the CLI path. For a kind
  # that does not roll out, such as a Service, it is a no-op.
  timeouts {
    create = "3m"
    update = "3m"
  }

  depends_on = [terraform_data.image_load, kubectl_manifest.first, terraform_data.ingress_nginx_ready]

  lifecycle {
    # An unmatched replace() would quietly deploy the :local tag, which does not
    # exist on the node, and surface minutes later as a rollout timeout. Checked
    # only for the one file that is rewritten.
    precondition {
      condition     = each.key != local.deployment_name || strcontains(local.deployment_source, local.source_image_line)
      error_message = "k8s/${local.deployment_name} no longer contains the literal '${local.source_image_line}' that terraform/main.tf rewrites."
    }

    # Without this the annotation would keep its placeholder value, a settings
    # change would not roll the pods, and the only symptom would be a setting
    # that quietly did not take effect.
    precondition {
      condition     = each.key != local.deployment_name || local.config_source == "" || strcontains(local.deployment_source, local.source_config_line)
      error_message = "k8s/${local.deployment_name} no longer contains the config-checksum placeholder that terraform/main.tf rewrites, so a ConfigMap change would not restart the pods."
    }
  }
}
