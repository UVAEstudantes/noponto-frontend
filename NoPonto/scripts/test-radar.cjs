/* global __dirname */
// node:test com o TypeScript já instalado; sem carregar o runtime nativo.
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const resolve = Module._resolveFilename;
Module._resolveFilename = function (id, parent, ...rest) {
  return resolve.call(this, id.startsWith("@/") ? path.join(root, id.slice(2)) : id, parent, ...rest);
};
for (const ext of [".ts", ".tsx"]) {
  require.extensions[ext] = (mod, filename) => mod._compile(ts.transpileModule(
    fs.readFileSync(filename, "utf8"), {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.React, esModuleInterop: true },
    },
  ).outputText, filename);
}
for (const file of process.argv.slice(2).length ? process.argv.slice(2) : [
  "src/services/radarParada.test.ts", "src/services/radarRequests.test.ts",
  "src/services/apresentacaoRadar.test.ts", "src/services/eventosParada.test.ts",
  "src/services/confiancaApresentacao.test.ts", "src/hooks/useConsultaEventosParada.test.cjs",
  "src/components/mapaComponents/radarConfiabilidade.test.cjs",
]) require(path.resolve(root, file));
