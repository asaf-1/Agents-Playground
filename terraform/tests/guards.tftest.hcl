# Tests for the guards in main.tf, run by `terraform test` (and by
# npm run k8s:tf:check and the PR check).
#
# Why these exist: fmt, validate and TFLint read the code, and a plan on the
# real files proves the guards PASS today. Neither shows that a guard would
# still FAIL on a bad file - and a guard that has quietly stopped guarding looks
# exactly like a guard that is working.
#
# Nothing here builds anything. Both providers are mocked, so no cluster, no
# Docker, no registry and no network are involved, and every run is
# `command = plan`, which is where preconditions and variable validation are
# evaluated - and which also means the local-exec image load never executes.

mock_provider "kind" {}
mock_provider "kubectl" {}

# The real files, unchanged: the guards must stay quiet, and the values the rest
# of the repo depends on must come out as expected.
run "the_real_files_plan_cleanly" {
  command = plan

  variables {
    image_tag = "abc123def456"
  }

  assert {
    # 4273, not 4173. kind/kind-config.yaml explains at length why the cluster
    # must not take the port Playwright and npm run dev use; this pins it, so
    # an edit that moves the port has to come here and say so deliberately.
    condition     = output.url == "http://127.0.0.1:4273"
    error_message = "The cluster URL changed. Expected http://127.0.0.1:4273, got ${output.url}."
  }

  assert {
    condition     = output.image == "agents-playground:abc123def456"
    error_message = "The image output no longer carries the tag it was given: ${output.image}."
  }

  assert {
    condition     = output.kube_context == "kind-agents-playground"
    error_message = "The kubectl context changed: ${output.kube_context}."
  }
}

# The in-memory tag swap is the one edit Terraform makes to a manifest. If it
# ever stopped happening, the Deployment would ask the node for a tag that was
# never loaded onto it.
run "the_deployment_gets_the_tag_it_was_given" {
  command = plan

  variables {
    image_tag = "0123456789ab"
  }

  assert {
    condition     = strcontains(kubectl_manifest.app["20-deployment.yaml"].yaml_body, "image: agents-playground:0123456789ab")
    error_message = "The Deployment was not rewritten to the built image tag."
  }

  assert {
    condition     = !strcontains(kubectl_manifest.app["20-deployment.yaml"].yaml_body, "image: agents-playground:local")
    error_message = "The Deployment still carries the :local tag, which exists on no node."
  }
}

# image_tag reaches a shell: main.tf interpolates it into the `kind load`
# local-exec command. The validation is what keeps that from being an injection
# point, so it is worth a test of its own.
run "a_shell_unsafe_image_tag_is_refused" {
  command = plan

  variables {
    image_tag = "ok; rm -rf /"
  }

  expect_failures = [var.image_tag]
}

run "an_empty_image_tag_is_refused" {
  command = plan

  variables {
    image_tag = ""
  }

  expect_failures = [var.image_tag]
}

# The three guards in main.tf, each handed a file that breaks exactly one of
# them. The fixtures live in tests/fixtures/ and are described in their headers.
run "an_unmapped_top_level_field_is_refused" {
  command = plan

  variables {
    kind_config_path = "tests/fixtures/kind-unmapped-top-level.yaml"
  }

  expect_failures = [kind_cluster.this]
}

run "an_unmapped_node_field_is_refused" {
  command = plan

  variables {
    kind_config_path = "tests/fixtures/kind-unmapped-node-field.yaml"
  }

  expect_failures = [kind_cluster.this]
}

run "a_deployment_without_the_rewritten_line_is_refused" {
  command = plan

  variables {
    k8s_dir = "tests/fixtures/k8s-no-image-line"
  }

  expect_failures = [kubectl_manifest.app]
}

# The namespace is applied separately and before everything else, and every
# other manifest has to declare itself inside it. A manifest without the line
# would be created in `default`, where none of the scripts, none of the canary
# steps and none of the later network rules would look for it.
run "the_namespace_is_applied_first_and_everything_is_in_it" {
  command = plan

  assert {
    condition     = contains(keys(kubectl_manifest.first), "00-namespace.yaml")
    error_message = "k8s/00-namespace.yaml is not being applied."
  }

  assert {
    condition     = !contains(keys(kubectl_manifest.app), "00-namespace.yaml")
    error_message = "namespace.yaml must be applied on its own, before the rest, not alongside them."
  }

  assert {
    condition     = alltrue([for body in values(kubectl_manifest.app) : strcontains(body.yaml_body, "namespace: agents-playground")])
    error_message = "A manifest in k8s/ does not declare 'namespace: agents-playground', so it would be created in the default namespace."
  }
}

# The settings live in k8s/10-configmap.yaml and reach the container through
# envFrom. Two things have to hold: the ConfigMap is created before the
# Deployment that reads it, and a change to it actually restarts the pods.
run "the_configmap_is_applied_first_and_a_change_restarts_the_pods" {
  command = plan

  assert {
    condition     = contains(keys(kubectl_manifest.first), "10-configmap.yaml")
    error_message = "k8s/10-configmap.yaml is not applied before the Deployment, so a pod can start before the settings it reads exist."
  }

  assert {
    condition     = !contains(keys(kubectl_manifest.app), "10-configmap.yaml")
    error_message = "configmap.yaml must be applied before the rest, not alongside them."
  }

  assert {
    condition     = strcontains(kubectl_manifest.app["20-deployment.yaml"].yaml_body, "configMapRef")
    error_message = "The Deployment no longer reads its settings from the ConfigMap."
  }

  # The placeholder must be gone and a real hash in its place, or a settings
  # change would leave the running pods on their old values with nothing to
  # show for it.
  assert {
    condition     = !strcontains(kubectl_manifest.app["20-deployment.yaml"].yaml_body, "rewritten-by-terraform")
    error_message = "The config-checksum placeholder was not replaced, so changing a setting would not restart the pods."
  }

  assert {
    condition     = strcontains(kubectl_manifest.app["20-deployment.yaml"].yaml_body, "agents-playground/config-checksum: \"${sha1(file("${path.module}/../k8s/10-configmap.yaml"))}\"")
    error_message = "The config-checksum annotation does not match the current k8s/10-configmap.yaml."
  }
}

# The two settings that make a break-in less useful: not root, and nothing
# writable. They are easy to drop by accident while editing a manifest, and
# nothing fails when they go - the app runs exactly the same, just less safely.
# Trivy reports them as HIGH, but Infra Scan is report-only, so this is what
# actually holds them in place.
run "the_container_is_not_root_and_cannot_write_to_itself" {
  command = plan

  assert {
    condition     = strcontains(kubectl_manifest.app["20-deployment.yaml"].yaml_body, "runAsNonRoot: true")
    error_message = "The container no longer declares runAsNonRoot, so it may run as administrator inside the pod."
  }

  assert {
    condition     = strcontains(kubectl_manifest.app["20-deployment.yaml"].yaml_body, "readOnlyRootFilesystem: true")
    error_message = "The container can write to its own filesystem again, which is the step an attacker needs after getting in."
  }

  assert {
    condition     = strcontains(kubectl_manifest.app["20-deployment.yaml"].yaml_body, "allowPrivilegeEscalation: false")
    error_message = "The container can escalate privileges again."
  }

  assert {
    condition     = strcontains(kubectl_manifest.app["20-deployment.yaml"].yaml_body, "type: RuntimeDefault")
    error_message = "The container no longer sets a seccomp profile, so it may ask the kernel for anything."
  }
}

# The traffic rules. Verified enforced on this cluster on 2026-10-17 - a
# deny-everything rule really did stop a second pod reaching the app - so these
# are not decoration. The half people forget is Egress: a policy that names
# only Ingress leaves outbound traffic wide open.
run "the_traffic_rules_cover_both_directions" {
  command = plan

  assert {
    condition     = contains(keys(kubectl_manifest.app), "40-networkpolicy.yaml")
    error_message = "The NetworkPolicy is not being applied."
  }

  assert {
    condition     = strcontains(kubectl_manifest.app["40-networkpolicy.yaml"].yaml_body, "- Ingress")
    error_message = "The NetworkPolicy does not restrict inbound traffic."
  }

  assert {
    condition     = strcontains(kubectl_manifest.app["40-networkpolicy.yaml"].yaml_body, "- Egress")
    error_message = "The NetworkPolicy names no Egress, so the app's outbound traffic is unrestricted - the half that is usually forgotten."
  }

  # The port the app serves has to stay open, or the pod never passes its
  # probes and the failure looks like a broken app rather than a rule.
  assert {
    condition     = strcontains(kubectl_manifest.app["40-networkpolicy.yaml"].yaml_body, "port: 4173")
    error_message = "The NetworkPolicy no longer allows traffic to port 4173, so the probes and the NodePort cannot reach the app."
  }
}

# The front door. Three things are easy to get wrong here and all three are
# silent: an Ingress with no class is accepted and then ignored by every
# controller; a backend naming a port number drifts from the Service; and
# removing the NodePort would break every test in the repo, which reaches the
# app at 127.0.0.1:4273 rather than through the Ingress.
run "the_front_door_is_wired_to_a_controller_and_the_old_way_still_works" {
  command = plan

  assert {
    condition     = contains(keys(kubectl_manifest.app), "50-ingress.yaml")
    error_message = "The Ingress is not being applied."
  }

  assert {
    condition     = strcontains(kubectl_manifest.app["50-ingress.yaml"].yaml_body, "ingressClassName: nginx")
    error_message = "The Ingress names no class, so every controller ignores it and the rule looks broken rather than unassigned."
  }

  assert {
    condition     = strcontains(kubectl_manifest.app["50-ingress.yaml"].yaml_body, "name: http")
    error_message = "The Ingress backend should name the Service port (http), not a number, so the two cannot drift."
  }

  # The Service must stay a NodePort: it is what 127.0.0.1:4273 and every test
  # depends on. The Ingress is an addition, not a replacement.
  assert {
    condition     = strcontains(kubectl_manifest.app["30-service.yaml"].yaml_body, "type: NodePort")
    error_message = "The Service is no longer a NodePort, so the direct route at 127.0.0.1:4273 that every test uses is gone."
  }

  # The host port the controller is published on has to exist in the kind
  # config, or the front door is unreachable from the machine.
  assert {
    condition     = length([for m in local.kind_config.nodes[0].extraPortMappings : m if m.containerPort == 80]) == 1
    error_message = "kind/kind-config.yaml publishes no host port for the ingress controller port 80, so nothing can reach the front door."
  }

  # And the app's own mapping has to still be there, found by the Service's
  # nodePort rather than by position.
  assert {
    condition     = local.port_mapping.hostPort == 4273
    error_message = "The app NodePort mapping is no longer published on host port 4273."
  }
}

# The vendored ingress-nginx file holds ~30 objects and 29 of them live in a
# namespace the same file creates. Two different things apply it and both can
# get the order wrong:
#
#   - Terraform applies documents in PARALLEL. Handled by splitting the
#     namespace into its own resource that the rest depend on - which was NOT
#     done at first, and the canary failed on 2026-10-17 with
#     `namespaces "ingress-nginx" not found` on five objects while others in
#     the same apply succeeded.
#   - The canary's kind path runs `kubectl apply -f` on the file, which
#     applies documents in FILE ORDER. That works only while the Namespace is
#     the first document in it.
#
# This checks the second, because it depends on upstream's file rather than on
# our code, and a re-vendor could silently reorder it. The Terraform side is
# held by a precondition on kubectl_manifest.ingress_nginx_namespace, which
# cannot be asserted here: the document list comes from a provider data source,
# and the providers are mocked in these tests.
run "the_vendored_ingress_file_creates_its_namespace_first" {
  command = plan

  assert {
    condition     = strcontains(substr(file("${path.module}/${var.ingress_nginx_path}"), 0, 400), "kind: Namespace")
    error_message = "The first document in ${var.ingress_nginx_path} is no longer the Namespace. `kubectl apply -f` on that file applies documents in order, so everything after it would be created before the namespace it declares."
  }
}

# Terraform applies the namespace and the ConfigMap first because it is told
# to. Everything else that reads the folder - `kubectl apply -f k8s/` in
# npm run k8s:deploy, and the canary's kind path - just applies the files in
# alphabetical order. The numeric prefixes are what make that order correct,
# and nothing but this test notices if a new file breaks it.
run "alphabetical_order_is_also_a_safe_order" {
  command = plan

  assert {
    # Sorted by name, the files that must be applied first have to BE the
    # first ones. That is the whole point of the numeric prefixes.
    condition     = slice(sort(tolist(local.manifest_names)), 0, length(local.first_names)) == sort(local.first_names)
    error_message = "Sorted by name, k8s/ does not begin with ${join(" then ", sort(local.first_names))}. A plain 'kubectl apply -f k8s/' would then apply something before the namespace or the ConfigMap it needs. Give the new file a higher numeric prefix."
  }

  assert {
    condition     = alltrue([for name in local.manifest_names : can(regex("^[0-9]{2}-", name))])
    error_message = "Every manifest in k8s/ needs a two-digit prefix, or its place in the apply order is accidental."
  }
}

# Every *.yaml in the folder is applied, so adding a manifest needs no change to
# main.tf, to npm run k8s:deploy or to the canary. This is the test that would
# fail if someone went back to naming files one by one.
run "every_manifest_in_the_folder_is_applied" {
  command = plan

  assert {
    # The namespace is applied by its own resource, so both are counted.
    condition     = length(kubectl_manifest.app) + length(kubectl_manifest.first) == length(fileset("${path.module}/../k8s", "*.yaml"))
    error_message = "Not every manifest in k8s/ was applied: ${length(kubectl_manifest.app) + length(kubectl_manifest.first)} of ${length(fileset("${path.module}/../k8s", "*.yaml"))}."
  }

  assert {
    condition     = contains(keys(kubectl_manifest.app), "20-deployment.yaml") && contains(keys(kubectl_manifest.app), "30-service.yaml")
    error_message = "The Deployment and the Service are not both applied: ${join(", ", keys(kubectl_manifest.app))}."
  }
}
