import assert from "node:assert/strict";
import test from "node:test";
import { criarFiltroModalBusca } from "./searchModalFilter";
import { categoriaLinhaV2 } from "../types/estruturaV2";

const modais = [
  { id: "id-onibus", nome: "Ônibus" },
  { id: "id-brt", nome: "BRT" },
  { id: "id-trem", nome: "Trem" },
];

test("resolve os IDs persistidos sem combinar modal Ônibus e tipo BRT", async () => {
  const resolver = criarFiltroModalBusca(async () => modais);
  for (const categoria of ["onibus", "brt", "trem"] as const) {
    assert.deepEqual(await resolver(categoria), { modalId: `id-${categoria}` });
  }
});

test("catálogo vazio e falha de rede podem ser recuperados", async () => {
  for (const falha of ["vazio", "rede"]) {
    let chamadas = 0;
    const resolver = criarFiltroModalBusca(async () => {
      chamadas++;
      if (chamadas === 1) {
        if (falha === "rede") throw new Error("offline");
        return [];
      }
      return modais;
    });
    await assert.rejects(resolver("brt"));
    assert.deepEqual(await resolver("brt"), { modalId: "id-brt" });
    assert.equal(chamadas, 2);
  }
});

test("modal ausente não libera filtro de todos e permite recarregar catálogo", async () => {
  let chamadas = 0;
  const resolver = criarFiltroModalBusca(async () => ++chamadas === 1 ? modais.slice(0, 1) : modais);
  await assert.rejects(resolver("brt"), /indisponível/);
  assert.deepEqual(await resolver("brt"), { modalId: "id-brt" });
  await assert.rejects(resolver("metro"), /indisponível/);
});

test("identidade persistida prevalece sobre tipo de serviço", () => {
  assert.equal(categoriaLinhaV2({ modal: "BRT", tipoRota: "regular" }), "brt");
  assert.equal(categoriaLinhaV2({ modal: "Trem", tipoRota: "brt" }), "trem");
  for (const tipoRota of ["regular", "variante", "noturno", "rapido", "parcial", "brt"]) {
    assert.equal(categoriaLinhaV2({ modal: "Ônibus", tipoRota }), "onibus");
  }
  assert.equal(categoriaLinhaV2({ modal: "Metrô", tipoRota: "regular" }), "metro");
});
