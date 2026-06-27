const fs = require("fs");
const ts = require("typescript");

if (!require.extensions[".ts"]) {
  require.extensions[".ts"] = function registerTsRuntime(module, filename) {
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

    module._compile(output.outputText, filename);
  };
}
