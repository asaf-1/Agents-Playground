# TFLint for terraform-github/, run by terraform-validate.yml.
#
# The same setup as terraform/.tflint.hcl: only the Terraform language rules
# that ship inside TFLint itself, so CI never runs `tflint --init` or downloads
# a plugin. No cloud ruleset applies: the one provider here is GitHub's.
plugin "terraform" {
  enabled = true
  preset  = "recommended"
}
