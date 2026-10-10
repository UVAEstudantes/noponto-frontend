import assert from "node:assert/strict";
import test from "node:test";
import { api } from "./api";
import { buscarOpcoesPorNome, buscarSugestoesBusca } from "./mobilidadeRio";
import { categoriaLinhaV2 } from "../types/estruturaV2";

test("busca e sugestões usam o catálogo real e isolam cada modal", async (t) => {
  const originalGet = api.get;
  const modais = [
    { id: "id-onibus", nome: "Ônibus" },
    { id: "id-brt", nome: "BRT" },
    { id: "id-trem", nome: "Trem" },
  ];
  const linhas = modais.map((modal, index) => ({ linhaId: `linha-${index}`,
    codigo: `${index + 10}`, nome: `${modal.nome} exemplo`, tipoRota: "regular",
    modalId: modal.id, modal: modal.nome }));
  const consultas: { endpoint: string; params?: Record<string, string | number | boolean> }[] = [];
  let catalogos = 0;
  let misturarResposta = false;
  api.get = async <T>(endpoint: string, options?: Parameters<typeof api.get>[1]) => {
    consultas.push({ endpoint, params: options?.params });
    if (endpoint === "/modais") {
      if (++catalogos === 1) return { ok: false, status: 503 };
      return { ok: true, status: 200, data: modais as T };
    }
    assert.equal(endpoint, "/linhas");
    assert.ok(options?.params?.modalId);
    assert.equal(options?.params?.tipoRota, undefined);
    assert.equal(options?.params?.excluirTipoRota, undefined);
    const itens = misturarResposta ? linhas : linhas.filter((linha) => linha.modalId === options?.params?.modalId);
    return { ok: true, status: 200, data: { itens } as T };
  };
  try {
    await t.test("falha de /modais bloqueia /linhas e a próxima busca recupera", async () => {
      await assert.rejects(buscarOpcoesPorNome("10", 1, 20, "brt"));
      assert.equal(consultas.filter((item) => item.endpoint === "/linhas").length, 0);
      const resultados = await buscarOpcoesPorNome("10", 1, 20, "brt");
      assert.equal(catalogos, 2);
      assert.equal(resultados[0].linha.modalId, "id-brt");
      assert.equal(categoriaLinhaV2({ modal: resultados[0].linha.modal ?? "", tipoRota: "regular" }), "brt");
    });
    for (const categoria of ["onibus", "brt", "trem"] as const) {
      await t.test(`${categoria}: resultados e sugestões permanecem no modal`, async () => {
        const resultados = await buscarOpcoesPorNome("exemplo", 1, 20, categoria);
        assert.equal(resultados.length, 1);
        assert.equal(resultados[0].linha.modalId, `id-${categoria}`);
        const sugestoes = await buscarSugestoesBusca(categoria);
        assert.deepEqual(sugestoes, [resultados[0].displayName]);
        assert.equal(consultas.at(-1)?.params?.modalId, `id-${categoria}`);
      });
    }
    await t.test("resposta misturada não vaza outros IDs persistidos", async () => {
      misturarResposta = true;
      const resultados = await buscarOpcoesPorNome("exemplo", 1, 20, "brt");
      assert.deepEqual(resultados.map((item) => item.linha.modalId), ["id-brt"]);
      assert.deepEqual(await buscarSugestoesBusca("brt"), [resultados[0].displayName]);
    });
    await t.test("Metrô ausente não envia consulta sem modalId", async () => {
      const anteriores = consultas.filter((item) => item.endpoint === "/linhas").length;
      await assert.rejects(buscarOpcoesPorNome("exemplo", 1, 20, "metro"), /indisponível/);
      assert.equal(consultas.filter((item) => item.endpoint === "/linhas").length, anteriores);
    });
  } finally {
    api.get = originalGet;
  }
});
