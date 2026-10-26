# Where each resource went when main.tf was split into modules (2026-10-26).
#
# Terraform tracks a resource by its address, and the address includes the
# module it lives in. Without these blocks a plan on a cluster built before the
# split would read the old addresses as "no longer in the code" and the new
# ones as "not yet created": 28 to destroy, 28 to add, and a rebuilt cluster
# for a change that touched nothing real. With them the plan shows each
# resource moving and nothing else, and the apply only rewrites the state.
#
# They are cheap to keep: on a machine with no state, or in the canary, which
# builds from nothing every run, they do nothing at all.

moved {
  from = kind_cluster.this
  to   = module.cluster.kind_cluster.this
}

moved {
  from = terraform_data.image_load
  to   = module.cluster.terraform_data.image_load
}

moved {
  from = kubectl_manifest.ingress_nginx_namespace
  to   = module.ingress.kubectl_manifest.ingress_nginx_namespace
}

moved {
  from = kubectl_manifest.ingress_nginx
  to   = module.ingress.kubectl_manifest.ingress_nginx
}

moved {
  from = terraform_data.ingress_nginx_ready
  to   = module.ingress.terraform_data.ingress_nginx_ready
}

moved {
  from = kubectl_manifest.first
  to   = module.app.kubectl_manifest.first
}

moved {
  from = kubectl_manifest.app
  to   = module.app.kubectl_manifest.app
}
