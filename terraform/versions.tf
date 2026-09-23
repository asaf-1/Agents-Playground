terraform {
  required_version = "~> 1.16"

  # No backend block, so state is local: terraform/terraform.tfstate on the
  # machine that ran apply, gitignored. The cluster is disposable and lives on
  # that same machine, so shared remote state would buy nothing here.
  required_providers {
    # Creates the kind cluster. Swapping this one resource for a managed cluster
    # (EKS, GKE, AKS) is the whole move to a paid tier - see main.tf.
    kind = {
      source  = "tehcyx/kind"
      version = "~> 0.11.0"
    }

    # Applies k8s/*.yaml as written. Chosen over hashicorp/kubernetes because
    # that provider needs the cluster to exist at plan time, or the manifests
    # rewritten in HCL, and k8s/ must stay the only copy of them.
    kubectl = {
      source  = "alekc/kubectl"
      version = "~> 2.4"
    }
  }
}
