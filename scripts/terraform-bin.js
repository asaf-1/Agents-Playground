"use strict";

// Finding the Terraform binary, shared by scripts/k8s-tf.js (the kind cluster)
// and scripts/github-tf.js (the repository settings on GitHub).
//
// winget installs Terraform under %LOCALAPPDATA% and adds it to the user PATH,
// but only processes started afterwards see that PATH. A VS Code window that was
// already open keeps the old one, and every terminal it opens then fails with
// "'terraform' is not recognized". Falling back to the winget folder makes the
// scripts work without restarting the editor.

const fs = require("node:fs");
const path = require("node:path");

function onPath(name) {
  const file = process.platform === "win32" ? `${name}.exe` : name;

  return (process.env.PATH || "")
    .split(path.delimiter)
    .some((dir) => dir && fs.existsSync(path.join(dir, file)));
}

function findTerraform() {
  const name = process.platform === "win32" ? "terraform.exe" : "terraform";

  if (onPath("terraform")) {
    return "terraform";
  }

  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    const packages = path.join(
      process.env.LOCALAPPDATA,
      "Microsoft",
      "WinGet",
      "Packages",
    );
    const folder =
      fs.existsSync(packages) &&
      fs
        .readdirSync(packages)
        .find((d) => d.startsWith("Hashicorp.Terraform_"));
    const exe = folder && path.join(packages, folder, name);

    if (exe && fs.existsSync(exe)) {
      return `"${exe}"`;
    }
  }

  console.error(
    "\nTerraform was not found. Install it with:\n  winget install Hashicorp.Terraform\n",
  );
  process.exit(1);
}

module.exports = { findTerraform, onPath };
