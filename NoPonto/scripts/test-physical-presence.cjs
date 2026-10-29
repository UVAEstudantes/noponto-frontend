// Self-contained test entry point; uses the installed TypeScript package, no native runtime.
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(ts.transpileModule(
  fs.readFileSync(filename, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText, filename);
require("../src/services/physicalPresenceContract.test.ts");
require("../src/services/physicalPresenceHub.test.cjs");
require("../src/services/physicalPresenceMap.test.cjs");
