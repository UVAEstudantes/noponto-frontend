import assert from "node:assert/strict";
import test from "node:test";
import { atualizarHistorico, filtrarHistoricoBusca, historicoPorCategoria,
  normalizarHistoricoPersistido, removerResultadosJaRecentes, SEARCH_HISTORY_LIMIT } from "./searchHistory";
const line = { id: "884", codigo: "884", nome: "Sepetiba - Terminal Campo Grande", modalId: "bus", tipoRota: "regular", modal: "Ônibus" };
test("selection deduplicates and updates frequency/timestamp", () => {
  const once = atualizarHistorico([], line, "onibus", 10);
  const twice = atualizarHistorico(once, line, "onibus", 20);
  assert.equal(twice.length, 1); assert.equal(twice[0].selectionCount, 2); assert.equal(twice[0].lastSelectedAt, 20);
});
test("history is isolated by product and bounded", () => {
  let items: ReturnType<typeof atualizarHistorico> = [];
  for (let i = 0; i < SEARCH_HISTORY_LIMIT + 5; i++) items = atualizarHistorico(items,
    { ...line, id: String(i), codigo: String(i) }, i % 2 ? "brt" : "onibus", i);
  assert.equal(items.length, SEARCH_HISTORY_LIMIT);
  assert.ok(historicoPorCategoria(items, "onibus").every(x => x.categoria === "onibus"));
  assert.ok(historicoPorCategoria(items, "onibus").every(x => x.categoria !== "brt"));
});
test("invalid persisted entries are ignored without breaking valid history", () => {
  const valid = atualizarHistorico([], line, "onibus", 10)[0];
  assert.deepEqual(normalizarHistoricoPersistido([null, {}, { linhaId: "broken" }, valid]), [valid]);
  assert.deepEqual(normalizarHistoricoPersistido("invalid"), []);
});
test("empty history produces no recent rows", () => {
  assert.deepEqual(historicoPorCategoria([], "onibus"), []);
});
test("recent search filters code and canonical name and deduplicates remote results", () => {
  const items = ["838", "884", "866", "SN884"].map((codigo, index) =>
    atualizarHistorico([], { ...line, id: codigo, codigo,
      nome: codigo === "838" ? "Campo Grande - Bananal" : line.nome }, "onibus", index)[0]);
  assert.deepEqual(filtrarHistoricoBusca(items, "onibus", "88").map((x) => x.codigo), ["884", "SN884"]);
  assert.deepEqual(filtrarHistoricoBusca(items, "onibus", "bananal").map((x) => x.codigo), ["838"]);
  assert.equal(filtrarHistoricoBusca(items, "onibus", "", 3).length, 3);
  assert.ok(filtrarHistoricoBusca(items, "onibus", "88", 3).length <= 3);
  const recent = filtrarHistoricoBusca(items, "onibus", "884");
  const remote = recent.map((x) => ({ linha: { id: x.linhaId } })).concat([{ linha: { id: "885" } }]);
  assert.deepEqual(removerResultadosJaRecentes(remote, recent).map((x) => x.linha.id), ["885"]);
});
