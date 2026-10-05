# TFLint for terraform/, run by terraform-validate.yml.
#
# Only the Terraform language rules that ship inside TFLint itself, so CI never
# runs `tflint --init` or downloads a plugin. No cloud ruleset (aws, azurerm,
# google) applies: the providers here are kind and kubectl.
plugin "terraform" {
  enabled = true
  preset  = "recommended"
}
