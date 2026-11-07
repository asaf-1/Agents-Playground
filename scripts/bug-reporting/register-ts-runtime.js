// Node's file reader and the TypeScript compiler.
const fs = require("fs");
const ts = require("typescript");

// Teach require() to load .ts files, unless something already does.
if (!require.extensions[".ts"]) {
  // Each .ts file is compiled to plain CommonJS JavaScript as it loads.
  require.extensions[".ts"] = function registerTsRuntime(module, filename) {
    // Read the file and compile it with the settings the repo's code expects.
    const source = fs.readFileSync(filename, "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: {
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.Node10,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: filename,
    });

    // Run the compiled code as that module.
    module._compile(output.outputText, filename);
  };
}
