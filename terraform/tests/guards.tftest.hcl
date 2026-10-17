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
    condition     = strcontains(kubectl_manifest.deployment.yaml_body, "image: agents-playground:0123456789ab")
    error_message = "The Deployment was not rewritten to the built image tag."
  }

  assert {
    condition     = !strcontains(kubectl_manifest.deployment.yaml_body, "image: agents-playground:local")
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
    deployment_path = "tests/fixtures/deployment-without-image-line.yaml"
  }

  expect_failures = [kubectl_manifest.deployment]
}
