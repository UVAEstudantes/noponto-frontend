/* global __dirname */
// Runner TS sem dependencias adicionais, inclusive em Node 20.
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
for (const extensao of [".ts", ".tsx"]) {
  require.extensions[extensao] = (mod, filename) => {
    mod._compile(
      ts.transpileModule(fs.readFileSync(filename, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.React,
          esModuleInterop: true,
        },
      }).outputText,
      filename,
    );
  };
}
for (const arquivo of [
  "../src/services/apresentacaoIndicadores.test.cjs",
  "../src/components/mapOSM/webview/railPresentation.test.ts",
  "../src/utils/railGeometry.test.ts",
])
  require(path.resolve(__dirname, arquivo));
