const assert = require("node:assert/strict");
const test = require("node:test");
const { criarHarness, adiada } = require("./radarTestHarness.cjs");
const { chegadasDoRadar } = require("../services/apresentacaoRadar.ts");

const parada = (id = "A", versao = "v1") => ({
  parada: { paradaId: id, nome: `Parada ${id}`, latitude: 0, longitude: 0 }, distancia: 0,
  vinculos: [{ linhaId: "linha", sentidoId: "ida", padraoVersaoId: versao, destino: "Destino" }],
});
const evento = (stop = "A", id = "evento-A", segundos = 120) => ({
  eventId: id, paradaId: stop, linhaId: "linha", sentidoId: "ida", padraoVersaoId: "v1",
  codigoLinha: "084", modal: "onibus", tipoRota: "brt", eventType: "ARRIVAL",
  source: "RealtimeEstimated", quality: "OperationalEstimate", secondsUntilEvent: segundos,
  isEstimated: true, vehicleId: "V1",
});
function iniciar() {
  const h = criarHarness(), pedidos = [];
  const { useConsultaEventosParada } = h.carregar("useConsultaEventosParada.ts", {
    "../services/eventosParada": { buscarEventosParada: (id) => {
      const p = adiada(); pedidos.push({ id, ...p }); return p.promise;
    } },
  });
  let alvo = parada(), enabled = true, modal = "brt";
  const render = (executarEfeitos = true) => h.render(() => useConsultaEventosParada(alvo, modal, enabled), executarEfeitos);
  render();
  return { h, pedidos, render,
    escolher(value, effects = true) { alvo = value; return render(effects); },
    habilitar(value) { enabled = value; return render(); },
    modal(value) { modal = value; return render(); },
  };
}

test("A para B ignora sucesso tardio e protege eventos usados no foco", async () => {
  const { h, pedidos, escolher } = iniciar();
  escolher(parada("B"));
  pedidos[1].resolve([evento("B", "evento-B")]); await h.flush();
  assert.deepEqual([...h.output.eventosPorId.keys()], ["evento-B"]);
  const timestampB = h.output.atualizadoEm;
  await h.avancar(1000);
  pedidos[0].resolve([evento()]); await h.flush();
  assert.deepEqual(h.output.eventos.map((e) => e.paradaId), ["B"]);
  assert.deepEqual([...h.output.eventosPorId.keys()], ["evento-B"]);
  assert.equal(h.output.atualizadoEm, timestampB);
  assert.equal(h.output.statusConsulta, "sucesso");
  h.unmount();
});

test("erro e finalização tardios de A não encerram loading nem apagam B", async () => {
  const { h, pedidos, escolher } = iniciar();
  escolher(parada("B"));
  pedidos[0].reject(new Error("falha antiga")); await h.flush();
  assert.equal(h.output.carregando, true);
  assert.equal(h.output.erro, null);
  assert.equal(h.output.statusConsulta, "carregando");
  pedidos[1].resolve([evento("B", "evento-B")]); await h.flush();
  assert.equal(h.output.statusConsulta, "sucesso");
  assert.deepEqual([...h.output.eventosPorId.keys()], ["evento-B"]);
  h.unmount();
});

test("erro tardio de A não substitui sucesso já concluído de B", async () => {
  const { h, pedidos, escolher } = iniciar();
  escolher(parada("B"));
  pedidos[1].resolve([evento("B", "evento-B")]); await h.flush();
  pedidos[0].reject(new Error("erro antigo")); await h.flush();
  assert.equal(h.output.erro, null);
  assert.equal(h.output.carregando, false);
  assert.equal(h.output.statusConsulta, "sucesso");
  assert.deepEqual([...h.output.eventosPorId.keys()], ["evento-B"]);
  h.unmount();
});

test("fechar e reabrir a mesma parada invalida a geração anterior", async () => {
  const { h, pedidos, habilitar } = iniciar();
  habilitar(false);
  assert.equal(h.timerCount, 0);
  assert.equal(h.output.eventosPorId.size, 0);
  habilitar(true);
  pedidos[1].resolve([evento("A", "novo")]); await h.flush();
  pedidos[0].resolve([evento("A", "antigo")]); await h.flush();
  assert.deepEqual([...h.output.eventosPorId.keys()], ["novo"]);
  assert.equal(h.output.statusConsulta, "sucesso");
  h.unmount();
});

test("troca de contexto oculta dados já no render antes do cleanup", async () => {
  const { h, pedidos, escolher, render } = iniciar();
  pedidos[0].resolve([evento()]); await h.flush();
  const transicao = escolher(parada("B"), false);
  assert.equal(transicao.eventos.length, 0);
  assert.equal(transicao.eventosPorId.size, 0);
  assert.equal(transicao.statusConsulta, "carregando");
  render(); h.unmount();
});

test("primeira carga erro retry e sucesso vazio têm estados distintos", async () => {
  const { h, pedidos } = iniciar();
  assert.equal(h.output.statusConsulta, "carregando");
  assert.equal(h.output.temResposta, false);
  pedidos[0].reject(new Error("offline")); await h.flush();
  assert.equal(h.output.statusConsulta, "erro");
  assert.equal(h.output.consultaConcluida, false);
  assert.equal(h.output.atualizadoEm, null);
  h.output.atualizar(); h.render();
  assert.equal(h.output.statusConsulta, "carregando");
  h.output.atualizar();
  assert.equal(pedidos.length, 2);
  pedidos[1].resolve([]); await h.flush();
  assert.equal(h.output.statusConsulta, "sucesso");
  assert.equal(h.output.consultaConcluida, true);
  assert.equal(h.output.temResposta, true);
  assert.equal(h.output.eventos.length, 0);
  h.unmount();
});

test("atualização preserva dados e erro não renova o horário da consulta", async () => {
  const { h, pedidos } = iniciar();
  pedidos[0].resolve([evento()]); await h.flush();
  const ultimaConsulta = h.output.atualizadoEm;
  await h.avancar(1000);
  h.output.atualizar(); h.render();
  assert.equal(h.output.statusConsulta, "atualizando");
  assert.deepEqual([...h.output.eventosPorId.keys()], ["evento-A"]);
  pedidos[1].reject(new Error("offline")); await h.flush();
  assert.equal(h.output.statusConsulta, "erro");
  assert.equal(h.output.atualizadoEm, ultimaConsulta);
  assert.deepEqual([...h.output.eventosPorId.keys()], ["evento-A"]);
  assert.equal(h.output.consultaConcluida, false);
  h.unmount();
});

test("relógio compartilhado reduz ETA absoluto e relativo e expira após o instante", async () => {
  const { h, pedidos } = iniciar();
  pedidos[0].resolve([evento("A", "relativo", 3), { ...evento("A", "absoluto", 999),
    estimatedAt: new Date(h.now + 5000).toISOString() }]); await h.flush();
  const apresentacao = () => chegadasDoRadar(h.output.eventos, parada(), [], h.output.recebidoEm, h.output.agora, [], []);
  assert.deepEqual(apresentacao().map((e) => e.etaSeg), [3, 5]);
  await h.avancar(2000);
  assert.deepEqual(apresentacao().map((e) => e.etaSeg), [1, 3]);
  await h.avancar(1000);
  assert.deepEqual(apresentacao().map((e) => e.etaSeg), [0, 2]);
  await h.avancar(1000);
  assert.deepEqual([...h.output.eventosPorId.keys()], ["absoluto"]);
  await h.avancar(2000);
  assert.equal(h.output.eventosPorId.size, 0);
  assert.equal(pedidos.length, 1); // relógio não consulta a rede
  h.unmount();
});

test("foreground revalida imediatamente e background pausa timers e invalida pedidos", async () => {
  const { h, pedidos } = iniciar();
  pedidos[0].resolve([evento("A", "antigo", 2)]); await h.flush();
  h.output.atualizar();
  h.estado("background");
  assert.equal(h.timerCount, 0);
  pedidos[1].resolve([evento("A", "resposta-background")]); await h.flush();
  await h.avancar(60000);
  assert.equal(pedidos.length, 2);
  h.estado("active");
  assert.equal(pedidos.length, 3);
  assert.equal(h.output.eventosPorId.size, 0);
  assert.equal(h.output.statusConsulta, "atualizando");
  pedidos[2].resolve([evento("A", "atual")]); await h.flush();
  assert.deepEqual([...h.output.eventosPorId.keys()], ["atual"]);
  h.unmount();
});

test("versão modal e contexto indisponível não reutilizam eventos anteriores", async () => {
  const { h, pedidos, escolher, modal } = iniciar();
  pedidos[0].resolve([evento()]); await h.flush();
  escolher(parada("A", "v2"));
  assert.equal(h.output.eventos.length, 0);
  pedidos[1].resolve([evento(), { ...evento("A", "v2"), padraoVersaoId: "v2" }]); await h.flush();
  assert.deepEqual([...h.output.eventosPorId.keys()], ["v2"]);
  modal("todos");
  assert.equal(h.output.eventosPorId.size, 0);
  escolher(null);
  pedidos[2].reject(new Error("contexto anterior")); await h.flush();
  assert.equal(h.output.statusConsulta, "indisponivel");
  assert.equal(h.output.erro, null);
  assert.equal(h.output.eventosPorId.size, 0);
  h.unmount();
});

test("polling aguarda a conclusão e desmontagem elimina timers e resultados", async () => {
  const { h, pedidos } = iniciar();
  await h.avancar(40000);
  assert.equal(pedidos.length, 1);
  pedidos[0].resolve([evento()]); await h.flush();
  await h.avancar(29999);
  assert.equal(pedidos.length, 1);
  await h.avancar(1);
  assert.equal(pedidos.length, 2);
  h.unmount();
  assert.equal(h.timerCount, 0);
  pedidos[1].resolve([]);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(h.timerCount, 0);
});

test("consumidores compartilham HTTP sem a limpeza de um invalidar o outro", async () => {
  const { api } = require("../services/api.ts");
  const original = api.get;
  const resposta = adiada();
  const h1 = criarHarness(), h2 = criarHarness();
  let chamadas = 0;
  api.get = async () => { chamadas++; return resposta.promise; };
  try {
    const hook1 = h1.carregar("useConsultaEventosParada.ts").useConsultaEventosParada;
    const hook2 = h2.carregar("useConsultaEventosParada.ts").useConsultaEventosParada;
    const alvo = parada("deduplicada");
    h1.render(() => hook1(alvo, "brt", true));
    h2.render(() => hook2(alvo, "brt", true));
    assert.equal(chamadas, 1);
    h1.unmount();
    resposta.resolve({ ok: true, status: 200, data: [evento("deduplicada", "compartilhado")] });
    await h2.flush();
    assert.deepEqual([...h2.output.eventosPorId.keys()], ["compartilhado"]);
    assert.equal(h2.output.statusConsulta, "sucesso");
  } finally { h1.unmount(); h2.unmount(); api.get = original; }
});

test("Radar mantém seleção manual e recebe os estados do mesmo hook de consulta", () => {
  const h = criarHarness(), selecoes = [];
  const consulta = { foreground: true, eventos: [], statusConsulta: "carregando", contextoConsulta: "A",
    atualizadoEm: null, erro: null, consultaConcluida: false };
  const { useRadarParada } = h.carregar("useRadarParada.ts", {
    "./useConsultaEventosParada": { useConsultaEventosParada: (alvo, modal, enabled) => {
      selecoes.push([alvo?.parada.paradaId, modal, enabled]); return consulta;
    } },
    "../services/radarParadaMetadata": { metadataParadaRadar: async () => null },
  });
  const stop = (id, latitude) => ({ paradaId: id, nome: id, latitude, longitude: 0 });
  const props = { linhas: [{ linhaId: "linha", ativa: true, modal: "brt", modoSentido: "ambos" }],
    modal: "brt", itinerarios: { linha: { padroesV2: [{ sentidoId: "ida", padraoVersaoId: "v1", sentidoNome: "Destino",
      paradas: [stop("A", 0), stop("B", 0.001)] }] } }, realtime: {}, local: { latitude: 0, longitude: 0 }, enabled: true };
  const render = () => h.render(() => useRadarParada(props));
  render(); assert.deepEqual(selecoes.at(-1), ["A", "brt", true]);
  assert.equal(h.output.estado, "Buscando próximos eventos…");
  h.output.selecionar(h.output.candidatos[1]); render();
  assert.equal(h.output.parada.parada.paradaId, "B");
  Object.assign(consulta, { statusConsulta: "erro", erro: "Falha ao atualizar" });
  render(); assert.equal(h.output.estado, "Falha ao atualizar");
  props.local = { latitude: 1, longitude: 1 }; render();
  assert.equal(h.output.parada.parada.paradaId, "B");
  assert.equal(h.output.foraContexto, true);
  assert.equal(selecoes.at(-1)[0], undefined);
  h.output.selecaoAutomatica(); props.local = { latitude: 0, longitude: 0 }; render();
  assert.equal(h.output.parada.parada.paradaId, "A");
  assert.equal(h.output.manual, false);
  h.unmount();
});
