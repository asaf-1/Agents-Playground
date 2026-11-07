// Strict mode for the whole file.
"use strict";

// Finding the Terraform binary, shared by scripts/k8s-tf.js (the kind cluster)
// and scripts/github-tf.js (the repository settings on GitHub).
//
// winget installs Terraform under %LOCALAPPDATA% and adds it to the user PATH,
// but only processes started afterwards see that PATH. A VS Code window that was
// already open keeps the old one, and every terminal it opens then fails with
// "'terraform' is not recognized". Falling back to the winget folder makes the
// scripts work without restarting the editor.

// Files and paths.
const fs = require("node:fs");
const path = require("node:path");

// Whether a program by this name is in one of the folders on PATH.
function onPath(name) {
  const file = process.platform === "win32" ? `${name}.exe` : name;

  // Look in each PATH folder for the file.
  return (process.env.PATH || "")
    .split(path.delimiter)
    .some((dir) => dir && fs.existsSync(path.join(dir, file)));
}

// The command to run Terraform with: from PATH, or from winget's folder.
function findTerraform() {
  // The file's name on this system.
  const name = process.platform === "win32" ? "terraform.exe" : "terraform";

  // On PATH: the plain name works.
  if (onPath("terraform")) {
    return "terraform";
  }

  // On Windows, look in the folder winget installs Terraform into.
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    // Find the Hashicorp.Terraform package folder and the exe inside it.
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

    // Found: quoted, because the path can have spaces in it.
    if (exe && fs.existsSync(exe)) {
      return `"${exe}"`;
    }
  }

  // Not found anywhere: say how to install it and stop.
  console.error(
    "\nTerraform was not found. Install it with:\n  winget install Hashicorp.Terraform\n",
  );
  process.exit(1);
}

// What k8s-tf.js and github-tf.js use.
module.exports = { findTerraform, onPath };
