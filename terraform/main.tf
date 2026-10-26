# The root: reads the repo's files and hands them to three modules.
#
#   modules/cluster  the kind cluster and the image load onto its node
#   modules/ingress  ingress-nginx, the front door, applied namespace-first
#   modules/app      every manifest in k8s/, namespace and ConfigMap first
#
# Everything that touches the filesystem stays here - yamldecode, fileset,
# file, the in-memory rewrite of the Deployment - so the modules take plain
# values and can be read, and tested, without knowing the repo layout. The
# modules keep every resource name the root used to hold; moved.tf tells
# Terraform where each one went, so a cluster built before the split is picked
# up as-is. On a managed cluster (EKS, GKE, AKS) only modules/cluster changes.

locals {
  # What the root reads, relative to terraform/. The guards that check these
  # files live in the modules, and terraform/tests/ hands the modules broken
  # copies directly, so nothing ever needs to point the root elsewhere.
  kind_config_path   = "../kind/kind-config.yaml"
  k8s_dir            = "../k8s"
  ingress_nginx_path = "../ingress-nginx/deploy.yaml" # see ingress-nginx/VERSION.md

  # kind/kind-config.yaml stays the single source for the cluster shape.
  # npm run k8s:up reads it with the kind CLI, and this reads the same file, so
  # the two paths cannot drift apart.
  kind_config = yamldecode(file("${path.module}/${local.kind_config_path}"))

  image = "agents-playground:${var.image_tag}"

  # Every *.yaml in k8s/ is applied, rather than a list of filenames kept in
  # step with this file by hand. Drop a manifest in and the Terraform path, the
  # CLI path and the canary all pick it up; nothing here needs editing.
  manifest_dir   = "${path.module}/${local.k8s_dir}"
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

module "cluster" {
  source = "./modules/cluster"

  kind_config = local.kind_config
  image       = local.image
}

provider "kubectl" {
  # Credentials come straight from the cluster module, not ~/.kube/config, so
  # the deploy talks to the cluster Terraform just made and nothing else. This
  # is also what orders every kubectl_manifest after the cluster: a provider
  # configured from a resource's outputs waits for that resource.
  host                   = module.cluster.endpoint
  client_certificate     = module.cluster.client_certificate
  client_key             = module.cluster.client_key
  cluster_ca_certificate = module.cluster.cluster_ca_certificate
  load_config_file       = false

  # On a first apply those four values are unknown until the cluster exists, and
  # without this the provider fails the plan with "no configuration has been
  # provided". It builds the client on first use instead.
  lazy_load = true
}

module "ingress" {
  source = "./modules/ingress"

  manifest        = file("${path.module}/${local.ingress_nginx_path}")
  source_name     = local.ingress_nginx_path
  cluster_id      = module.cluster.id
  kubeconfig_path = module.cluster.kubeconfig_path

  # No depends_on here: the module holds a data source, and a module-level
  # depends_on would defer it to apply time, leaving the for_each over its
  # documents unknown at plan. The provider block above already orders every
  # object in it after the cluster.
}

module "app" {
  source = "./modules/app"

  first_manifests    = local.first_manifests
  manifests          = local.manifests
  deployment_name    = local.deployment_name
  deployment_source  = local.deployment_source
  source_image_line  = local.source_image_line
  source_config_line = local.source_config_line
  config_source      = local.config_source

  # After the image is on the node (or the Deployment asks for a tag that is
  # not there), and after the ingress controller is serving (or its admission
  # webhook rejects the Ingress). This module has no data source, so a
  # module-level depends_on costs nothing at plan time.
  depends_on = [module.cluster, module.ingress]
}
