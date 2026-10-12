const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

// Transpila apenas os módulos sob teste, sem Expo, rede ou novas dependências.
function carregar(arquivo, api) {
  const filename = path.resolve(__dirname, arquivo);
  const modulo = new Module(filename, module);
  modulo.paths = module.paths;
  modulo.require = (id) => {
    if (id === "./api") return { api };
    throw new Error(`Dependência inesperada: ${id}`);
  };
  modulo._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return modulo.exports;
}

const { apresentarPagamento, contrastePagamento, ICONES_PAGAMENTO } = carregar("../utils/apresentacaoPagamento.ts");

test("campos opcionais, ícone desconhecido e cores inválidas usam identidade neutra", () => {
  for (const [escuro, superficie] of [[false, "#FFFFFF"], [true, "#1E1E1E"]]) {
    const neutro = apresentarPagamento({}, superficie, escuro);
    assert.equal(neutro.icone, "wallet");
    for (const cor of [null, "", "laranja", "#FFF", "#12345678", "#GGGGGG"]) {
      assert.deepEqual(apresentarPagamento({ cor, icone: "desconhecido" }, superficie, escuro), neutro);
    }
  }
});

test("somente ícones do registro são aceitos", () => {
  for (const icone of ICONES_PAGAMENTO) {
    assert.equal(apresentarPagamento({ icone }, "#FFFFFF", false).icone, icone);
  }
});

test("cores claras, escuras e saturadas mantêm contraste nos dois temas", () => {
  for (const cor of ["#EA790F", "#FFFFFF", "#000000", "#FFFF00", "#000080", "#00FF00", "#777777"]) {
    const claro = apresentarPagamento({ cor }, "#FFFFFF", false);
    const escuro = apresentarPagamento({ cor }, "#1E1E1E", true);
    assert.notEqual(claro.fundo, escuro.fundo);
    for (const visual of [claro, escuro]) {
      assert.match(visual.fundo, /^#[0-9a-f]{6}$/i);
      assert.ok(contrastePagamento(visual.cor, visual.fundo) >= 4.5);
    }
  }
});

test("uma consulta fornece tarifa e apenas os métodos recebidos, sem alterar o contrato", async () => {
  for (const valor of [0, 5, 7.6, null]) {
    for (const formasPagamento of [[], [{ id: "pagamento", nome: "Método da API" }],
      [{ id: "novo", nome: "Novo", icone: "qr-code", cor: "#EA790F" }]]) {
      const dados = { tarifa: { valor }, formasPagamento };
      const chamadas = [];
      const { resolverTarifa } = carregar("tarifas.ts", { get: async (...args) => {
        chamadas.push(args);
        return { ok: true, data: dados };
      } });
      const signal = new AbortController().signal;
      assert.equal(await resolverTarifa("uuid-linha", signal), dados);
      assert.deepEqual(chamadas, [["/tarifas/resolver", { params: { linhaId: "uuid-linha" }, signal }]]);
    }
  }
});

test("erro HTTP/rede e contrato inválido não viram tarifa nula nem lista vazia", async () => {
  for (const response of [{ ok: false, status: 0 }, { ok: false, status: 500 },
    { ok: true, data: { tarifa: { valor: NaN }, formasPagamento: [] } },
    { ok: true, data: { tarifa: { valor: null } } }]) {
    const { resolverTarifa } = carregar("tarifas.ts", { get: async () => response });
    await assert.rejects(resolverTarifa("uuid-linha", new AbortController().signal));
  }
});
