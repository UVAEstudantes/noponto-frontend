import test from "node:test";
import assert from "node:assert/strict";
import { criarCatalogoCompartilhado } from "./catalogoCompartilhado";
test("Home e busca compartilham leitura simultânea e catálogo válido", async () => {
  let chamadas = 0;
  const carregar = criarCatalogoCompartilhado(async () => { chamadas++; return ["onibus"]; });
  assert.deepEqual(await Promise.all([carregar(), carregar()]), [["onibus"], ["onibus"]]);
  await carregar();
  assert.equal(chamadas, 1);
});
test("catálogo recupera rejeição, vazio e expiração", async () => {
  let chamadas = 0;
  const carregar = criarCatalogoCompartilhado(async () => {
    chamadas++;
    if (chamadas === 1) throw Error("offline");
    return chamadas === 2 ? [] : [chamadas];
  }, 0);
  await assert.rejects(carregar());
  assert.deepEqual(await carregar(), []);
  assert.deepEqual(await carregar(), [3]);
  assert.deepEqual(await carregar(), [4]);
});
