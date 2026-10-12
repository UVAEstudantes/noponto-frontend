/* global __dirname */
// Empacota os SVGs locais como texto, sem fetch ou dependencias nativas.
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const raiz = path.resolve(__dirname, "..");
const pasta = path.join(raiz, "assets/indicadores");
const fontes = {};
for (const familia of fs.readdirSync(pasta).sort()) {
  for (const arquivo of fs.readdirSync(path.join(pasta, familia)).sort()) {
    if (!arquivo.endsWith(".svg")) continue;
    fontes[`${familia}/${arquivo}`] = fs
      .readFileSync(path.join(pasta, familia, arquivo), "utf8")
      .replace(/\r\n/g, "\n");
  }
}
const fonteRenderizador = fs.readFileSync(
  path.join(raiz, "src/services/apresentacaoIndicadores.ts"),
  "utf8",
);
const funcao = fonteRenderizador
  .slice(
    fonteRenderizador.indexOf("export function criarRenderizadorIndicadores"),
    fonteRenderizador.indexOf("export const renderizarIndicador"),
  )
  .replace("export function", "function");
const runtime = ts.transpileModule(funcao, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
// Fonte compilada no desenvolvimento, nunca Function.toString() no Hermes.
const texto =
  "// Gerado por node scripts/gerar-indicadores.cjs. Edite os SVGs e o renderizador originais.\n" +
  "export const fontesIndicadores: Record<string, string> = " +
  JSON.stringify(fontes, null, 2) +
  ";\n" +
  "export const codigoRenderizadorIndicadores = " +
  JSON.stringify(runtime) +
  ";\n";
const destino = path.join(raiz, "src/constants/indicadoresSvg.generated.ts");
if (process.argv.includes("--check")) {
  if (fs.readFileSync(destino, "utf8").replace(/\r\n/g, "\n") !== texto)
    throw new Error(
      "SVGs alterados: execute node scripts/gerar-indicadores.cjs",
    );
} else fs.writeFileSync(destino, texto);
