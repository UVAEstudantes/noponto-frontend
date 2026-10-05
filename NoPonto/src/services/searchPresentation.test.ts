import assert from "node:assert/strict";
import test from "node:test";
import { apresentarLinhaBusca, apresentarResultadosBackend, deveFecharBuscaAoOcultarTeclado, filtrarCatalogoBusca, filtrarLinhasPorCategoria, placeholderPodeAlternar } from "./searchPresentation";

const line = (nome: string, modal = "Trem") => ({ codigo: nome, nome,
  tipoRota: modal === "Trem" ? "train" : modal === "BRT" ? "brt" : "regular", modal });
const catalog = [line("TREM-SANTA-CRUZ"), line("TREM-SARACURUNA"), line("TREM-SÃO-GONÇALO")];
test("partial rail search is accent insensitive", () => {
  assert.deepEqual(filtrarCatalogoBusca(catalog, "sa", "trem").map(x => x.nome), ["TREM-SANTA-CRUZ", "TREM-SARACURUNA"]);
  assert.deepEqual(filtrarCatalogoBusca(catalog, "san", "trem").map(x => x.nome), ["TREM-SANTA-CRUZ"]);
  assert.equal(filtrarCatalogoBusca(catalog, "sao", "trem")[0].nome, "TREM-SÃO-GONÇALO");
});
test("results and suggestions stay inside active modal", () => {
  const mixed = [...catalog, line("BRT-TRANSCARIOCA", "BRT")];
  assert.deepEqual(filtrarLinhasPorCategoria(mixed, "trem").map(x => x.nome), catalog.map(x => x.nome));
  assert.deepEqual(filtrarLinhasPorCategoria(mixed, "brt").map(x => x.nome), ["BRT-TRANSCARIOCA"]);
});
test("keyboard dismiss closes search without racing result selection", () => {
  assert.equal(deveFecharBuscaAoOcultarTeclado(false), true);
  assert.equal(deveFecharBuscaAoOcultarTeclado(true), false);
});
test("presentation hides technical name without changing canonical data", () => {
  const source = line("TREM-SANTA-CRUZ");
  const view = apresentarLinhaBusca(source, "trem");
  assert.equal(view.displayName, "Santa Cruz");
  assert.equal(view.displaySubtitle, "Ramal Santa Cruz");
  assert.equal(source.nome, "TREM-SANTA-CRUZ");
});
test("valid backend response is presented without local-catalog elimination", () => {
  const remote = line("Deodoro");
  remote.codigo = "TREM-DEODORO";
  assert.equal(apresentarResultadosBackend([remote], "trem")[0].displayName, "Deodoro");
});
test("road presentation uses canonical code and name, never terminal summary", () => {
  const view = apresentarLinhaBusca({ codigo: "884", nome: "Sepetiba - Terminal Campo Grande",
    tipoRota: "regular", modal: "Ônibus", terminalA: "Sepetiba", terminalB: "Terminal Campo Grande" }, "onibus");
  assert.equal(view.displayName, "884");
  assert.equal(view.displaySubtitle, "Sepetiba - Terminal Campo Grande");
  assert.notEqual(view.displaySubtitle, "Ônibus");
});
test("road and BRT examples preserve exact canonical fields", () => {
  const examples = [
    ["SV866", "Terminal Campo Grande - Terminal Pingo d'Água", "onibus"],
    ["884", "Sepetiba - Terminal Campo Grande", "onibus"],
    ["SN884", "Sepetiba - Terminal Campo Grande", "onibus"],
    ["10", "Santa Cruz - Terminal Alvorada", "brt"],
  ] as const;
  examples.forEach(([codigo, nome, categoria]) => {
    const view = apresentarLinhaBusca({ codigo, nome, tipoRota: categoria === "brt" ? "brt" : "regular",
      modal: categoria === "brt" ? "BRT" : "Ônibus" }, categoria);
    assert.deepEqual([view.displayName, view.displaySubtitle], [codigo, nome]);
  });
});
test("rail keeps friendly Santa Cruz and Guapimirim labels", () => {
  assert.deepEqual(apresentarLinhaBusca(line("TREM-SANTA-CRUZ"), "trem"),
    { displayName: "Santa Cruz", displaySubtitle: "Ramal Santa Cruz" });
  assert.deepEqual(apresentarLinhaBusca(line("TREM-GUAPIMIRIM"), "trem"),
    { displayName: "Guapimirim", displaySubtitle: "Extensão Guapimirim" });
});
test("placeholder remains stable while typing", () => {
  assert.equal(placeholderPodeAlternar(""), true);
  assert.equal(placeholderPodeAlternar("sa"), false);
});
