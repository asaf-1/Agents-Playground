output "url" {
  description = "Where the app answers on the host, via the kind port mapping and the NodePort Service."
  value       = "http://${lookup(local.port_mapping, "listenAddress", "127.0.0.1")}:${local.port_mapping.hostPort}"
}

output "image" {
  description = "The image the Deployment runs."
  value       = local.image
}

output "kube_context" {
  description = "The kubectl context for this cluster."
  value       = "kind-${kind_cluster.this.name}"
}
