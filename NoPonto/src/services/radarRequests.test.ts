import assert from "node:assert/strict";
import test from "node:test";
import { api } from "./api";
import { buscarEventosParada } from "./eventosParada";
import { metadataParadaRadar } from "./radarParadaMetadata";

test("consultas concorrentes para a mesma parada compartilham a requisição e falhas permitem retry", async () => {
  const original = api.get;
  let chamadas = 0;
  let liberar = () => {};
  api.get = async <T>() => {
    chamadas++;
    await new Promise<void>((resolve) => { liberar = resolve; });
    return { ok: true, status: 200, data: [] as T };
  };
  try {
    const primeira = buscarEventosParada("plataforma-teste");
    const segunda = buscarEventosParada("plataforma-teste");
    assert.equal(primeira, segunda);
    assert.equal(chamadas, 1);
    liberar();
    await Promise.all([primeira, segunda]);
    api.get = async () => ({ ok: false, status: 503, error: "offline" });
    await assert.rejects(buscarEventosParada("plataforma-teste"), /offline/);
    api.get = async <T>() => ({ ok: true, status: 200, data: [] as T });
    assert.deepEqual(await buscarEventosParada("plataforma-teste"), []);
  } finally { api.get = original; }
});

test("metadata usa endpoint existente, cache por plataforma e recuperação de falhas", async () => {
  const original = api.get;
  let chamadas = 0;
  let falhar = true;
  api.get = async <T>(endpoint: string) => {
    chamadas++;
    assert.equal(endpoint, "/paradas/metadata-teste");
    if (falhar) return { ok: false, status: 503 };
    return { ok: true, status: 200, data: { id: "metadata-teste", codigo: "P-2",
      nome: "Estação", latitude: 0, longitude: 0, plataforma: "2",
      paradaPaiId: "estacao-pai", tipoLocal: "Platform" } as T };
  };
  try {
    assert.equal(await metadataParadaRadar("metadata-teste"), null);
    falhar = false;
    const dados = await metadataParadaRadar("metadata-teste");
    assert.equal(dados?.plataforma, "2");
    assert.equal(dados?.paradaPaiId, "estacao-pai");
    assert.equal(await metadataParadaRadar("metadata-teste"), dados);
    assert.equal(chamadas, 2);
  } finally { api.get = original; }
});
