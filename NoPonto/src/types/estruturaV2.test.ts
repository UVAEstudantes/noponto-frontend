import assert from "node:assert/strict";
import test from "node:test";
import { rotuloSentidoPublico } from "./estruturaV2";

const occurrence = (ordem: number, nome: string) => ({
  ocorrenciaId: String(ordem), ordem, paradaId: String(ordem), codigoParada: String(ordem),
  nome, latitude: -22, longitude: -43, posicaoLinha: ordem / 10,
});

test("public direction label comes from the operational destination", () => {
  assert.equal(rotuloSentidoPublico({ nomeSentido: "FORWARD",
    ocorrencias: [occurrence(1, "Santa Cruz"), occurrence(2, "Central do Brasil")] }),
  "Central do Brasil");
});

test("FORWARD and REVERSE never leak when structure has no terminal", () => {
  assert.equal(rotuloSentidoPublico({ nomeSentido: "REVERSE", ocorrencias: [] }, "Sentido 2"),
    "Sentido 2");
});
