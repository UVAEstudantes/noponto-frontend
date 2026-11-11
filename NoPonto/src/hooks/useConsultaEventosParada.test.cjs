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

test('consulta vencida e GPS vencido nao permanecem nos consumidores', async()=>{
 const {h,pedidos}=iniciar();
 pedidos[0].resolve([{...evento('A','gps-antigo',4740),lastRealtimeEvidenceUtc:new Date(h.now-300001).toISOString()},evento('A','cache',4740)]);await h.flush();
 assert.deepEqual([...h.output.eventosPorId.keys()],['cache']);
 await h.avancar(300001);
 assert.equal(h.output.eventos.length,0);h.unmount();
});

test('relogio sozinho nao comprova passagem e previsao vencida fica indisponivel',async()=>{
 const {h,pedidos}=iniciar();pedidos[0].resolve([evento('A','a',1)]);await h.flush();
 await h.avancar(2000);assert.equal(h.output.eventos.length,1);
 const [c]=chegadasDoRadar(h.output.eventos,parada(),[],h.output.recebidoEm,h.output.agora,[],[]);
 assert.equal(c.etaSeg,null);h.unmount();
});

test('resposta autoritativa apos passagem remove evento sem mistura com viagem nova',async()=>{
 const {h,pedidos}=iniciar();pedidos[0].resolve([{...evento(),expectedRunId:'viagem-antiga'}]);await h.flush();
 h.output.atualizar();pedidos[1].resolve([]);await h.flush();
 assert.equal(h.output.eventos.length,0);assert.equal(h.output.eventosPorId.has('evento-A'),false);
 h.output.atualizar();pedidos[2].resolve([{...evento('A','novo'),expectedRunId:'viagem-nova'}]);await h.flush();
 assert.deepEqual(h.output.eventos.map(e=>[e.eventId,e.expectedRunId]),[['novo','viagem-nova']]);h.unmount();
});

test('falha preserva snapshot fresco mas nao renova validade do GPS ou consulta',async()=>{
 const {h,pedidos}=iniciar();const recebido=h.now;
 pedidos[0].resolve([{...evento('A','a',4740),lastRealtimeEvidenceUtc:new Date(h.now).toISOString()}]);await h.flush();
 await h.avancar(30000);pedidos[1].reject(Error('offline'));await h.flush();
 assert.equal(h.output.eventos.length,1);assert.equal(h.output.recebidoEm,recebido);
 await h.avancar(270001);assert.equal(h.output.eventos.length,0);assert.equal(h.output.recebidoEm,recebido);h.unmount();
});

test('ver todos na mesma parada conserva consulta timestamp e ciclo de polling',async()=>{
 const h=criarHarness(),pedidos=[];
 const hook=h.carregar('useConsultaEventosParada.ts',{'../services/eventosParada':{buscarEventosParada(id){const p=adiada();pedidos.push({id,...p});return p.promise;}}}).useConsultaEventosParada;
 const useRadar=h.carregar('useRadarParada.ts',{'./useConsultaEventosParada':{useConsultaEventosParada:hook},
  '../services/radarParadaMetadata':{metadataParadaRadar:async()=>null}}).useRadarParada;
 const stop={paradaId:'A',nome:'Bom Repouso',latitude:0,longitude:0,ordem:1,posicaoLinha:0};
 const props={linhas:[{linhaId:'linha',ativa:true,modal:'brt',modoSentido:'ambos'}],modal:'brt',
  itinerarios:{linha:{padroesV2:[{sentidoId:'ida',padraoVersaoId:'v1',sentidoNome:'Destino',paradas:[stop]}]}},
  realtime:{},local:{latitude:0,longitude:0},enabled:true,paradaVisualizada:null};
 const render=()=>h.render(()=>useRadar(props));render();pedidos[0].resolve([evento()]);await h.flush();
 const recebido=h.output.recebidoEm,chave=h.output.contextoConsulta;
 await h.avancar(1000);props.paradaVisualizada=stop;render();await h.flush();
 assert.equal(pedidos.length,1);assert.equal(h.output.recebidoEm,recebido);assert.equal(h.output.contextoConsulta,chave);
 assert.equal(chegadasDoRadar(h.output.eventos,h.output.parada,[],h.output.recebidoEm,h.output.agora,[],[])[0].etaSeg,119);
 props.paradaVisualizada=null;render();await h.flush();assert.equal(pedidos.length,1);
 await h.avancar(29000);assert.equal(pedidos.length,2);h.unmount();
});

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

test("seleção da ficha mantém estação ferroviária distante e contextos reais após fechar a ficha", () => {
  const { configurarRadarRemoto } = require("../services/radarRemotoContexto.ts");
  const { chaveContextoRadar } = require("../services/radarParada.ts");
  for (const modal of ["trem", "brt", "onibus"]) {
    const h = criarHarness();
    const consulta = (parada, atual) => ({ foreground: true, contextoConsulta: chaveContextoRadar(parada, atual),
      statusConsulta: parada ? "sucesso" : "indisponivel", eventos: [], eventosRecebidos: [], eventosPorId: new Map(),
      recebidoEm: h.now, agora: h.now, carregando: false, erro: null, temResposta: Boolean(parada),
      atualizadoEm: h.now, consultaConcluida: Boolean(parada), atualizar() {} });
    const useRadar = h.carregar("useRadarParada.ts", {
      "./useConsultaEventosParada": { useConsultaEventosParada: consulta },
      "../services/radarParadaMetadata": { metadataParadaRadar: async () => null },
    }).useRadarParada;
    const station = { paradaId: `station-${modal}`, nome: "Estação Central", latitude: -22.9,
      longitude: -43.6, ordem: 4, posicaoLinha: 0.4 };
    const lines = ["a", "b"].map((id) => ({ linhaId: `${modal}-${id}`, linhaCodigo: id,
      ativa: true, modal, modoSentido: "ambos" }));
    const itinerarios = Object.fromEntries(lines.map((line) => [line.linhaId, { linha: line.linhaCodigo,
      modal, segmentos: [], padroesV2: [{ linhaId: line.linhaId, sentidoId: "sentido-real",
        sentidoNome: "Destino real", padraoVersaoId: `versao-${line.linhaId}`,
        padraoOperacionalId: `operacao-${line.linhaId}`, paradas: [station] }] }]));
    const props = { linhas: lines, modal, itinerarios, realtime: {}, local: { latitude: -22.8, longitude: -43.4 },
      enabled: true, paradaVisualizada: station };
    const render = () => h.render(() => useRadar(props));
    render();

    assert.equal(h.output.candidatos.length, 0, `${modal}: estação está fora do raio de descoberta`);
    assert.equal(h.output.parada.parada.paradaId, station.paradaId);
    h.output.selecionar(h.output.parada);
    props.paradaVisualizada = null;
    props.local = null;
    render();

    assert.equal(h.output.foraContexto, false, `${modal}: seleção manual não depende de GPS`);
    assert.equal(h.output.parada.parada.paradaId, station.paradaId);
    assert.equal(JSON.parse(h.output.contextoConsulta)[0], modal);
    const config = configurarRadarRemoto({ parada: h.output.parada, linhas: lines, modal, itinerarios, realtime: {} },
      lines.map((line) => line.linhaId), [], 10);
    assert.equal(config.paradaId, station.paradaId);
    assert.deepEqual(config.linhasSelecionadas, lines.map((line) => line.linhaId));
    assert.deepEqual(config.contextos.map((context) => [context.linhaId, context.sentidoId,
      context.padraoVersaoId, context.padraoOperacionalId]), lines.map((line) => [line.linhaId,
      "sentido-real", `versao-${line.linhaId}`, `operacao-${line.linhaId}`]));
    assert.equal(h.output.estado, "Sem próximos eventos previstos.", `${modal}: localização não bloqueia estação manual`);
    h.unmount();
  }
});

test("entrada normal do Radar continua usando descoberta próxima sem seleção manual", () => {
  const h = criarHarness();
  const useRadar = h.carregar("useRadarParada.ts", {
    "./useConsultaEventosParada": { useConsultaEventosParada: (parada) => ({ foreground: true,
      contextoConsulta: parada?.parada.paradaId ?? "", statusConsulta: "sucesso", eventos: [], eventosRecebidos: [],
      eventosPorId: new Map(), recebidoEm: h.now, agora: h.now, carregando: false, erro: null,
      temResposta: Boolean(parada), atualizadoEm: h.now, consultaConcluida: Boolean(parada), atualizar() {} }) },
    "../services/radarParadaMetadata": { metadataParadaRadar: async () => null },
  }).useRadarParada;
  const stop = { paradaId: "near", nome: "Próxima", latitude: 0, longitude: 0,
    ordem: 1, posicaoLinha: 0 };
  const props = { linhas: [{ linhaId: "bus", ativa: true, modal: "onibus", modoSentido: "ambos" }],
    modal: "onibus", itinerarios: { bus: { segmentos: [], padroesV2: [{ sentidoId: "ida",
      sentidoNome: "Destino", padraoVersaoId: "v1", padraoOperacionalId: "op1", paradas: [stop] }] } },
    realtime: {}, local: { latitude: 0, longitude: 0 }, enabled: true, paradaVisualizada: null };
  h.render(() => useRadar(props));
  assert.equal(h.output.manual, false);
  assert.equal(h.output.parada.parada.paradaId, "near");
  assert.equal(h.output.candidatos[0].parada.paradaId, "near");
  h.unmount();
});

test("alternar entre duas estações manuais distantes atualiza parada e contexto sem GPS", () => {
  const h = criarHarness();
  const { chaveContextoRadar, paradaDetalhadaRadar } = require('../services/radarParada.ts');
  const { useConsultaEventosParada } = h.carregar('useConsultaEventosParada.ts', {
    '../services/eventosParada': { buscarEventosParada: async () => [] },
  });
  const useRadar = h.carregar('useRadarParada.ts', {
    './useConsultaEventosParada': { useConsultaEventosParada },
    '../services/radarParadaMetadata': { metadataParadaRadar: async () => null },
  }).useRadarParada;
  const stationA = { paradaId: 'station-a', nome: 'Estação A', latitude: -22.9, longitude: -43.6,
    ordem: 1, posicaoLinha: 0 };
  const stationB = { ...stationA, paradaId: 'station-b', nome: 'Estação B', ordem: 2, posicaoLinha: 1 };
  const lines = [{ linhaId: 'rail-line', linhaCodigo: 'Ramal longo', ativa: true, modal: 'trem', modoSentido: 'ambos' }];
  const itinerarios = { 'rail-line': { modal: 'trem', padroesV2: [{ sentidoId: 'direction',
    padraoVersaoId: 'version', padraoOperacionalId: 'operation', paradas: [stationA, stationB] }] } };
  const props = { linhas: lines, modal: 'trem', itinerarios, realtime: {},
    local: { latitude: -23.1, longitude: -43.9 }, enabled: true, paradaVisualizada: stationA };
  const render = () => h.render(() => useRadar(props));

  render();
  h.output.selecionar(h.output.parada);
  props.paradaVisualizada = null;
  render();
  assert.equal(h.output.parada.parada.paradaId, 'station-a');
  const escolhaB = paradaDetalhadaRadar(stationB, lines, 'trem', itinerarios, {});
  assert.ok(escolhaB);
  h.output.selecionar(escolhaB);
  render();
  assert.equal(h.output.parada.parada.paradaId, 'station-b');
  assert.equal(h.output.contextoConsulta, chaveContextoRadar(escolhaB, 'trem'));
  assert.equal(h.output.foraContexto, false);
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

test("relogio compartilhado reduz ETA e torna previsao vencida indisponivel sem inferir passagem", async () => {
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
  assert.deepEqual(apresentacao().map(e=>e.etaSeg), [null,1]);
  await h.avancar(2000);
  assert.deepEqual(apresentacao().map(e=>e.etaSeg), [null,null]);
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
  assert.equal(h.output.statusConsulta, "carregando");
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
  assert.equal(h.output.foraContexto, false);
  assert.equal(selecoes.at(-1)[0], "B");
  h.output.selecaoAutomatica(); props.local = { latitude: 0, longitude: 0 }; render();
  assert.equal(h.output.parada.parada.paradaId, "A");
  assert.equal(h.output.manual, false);
  h.unmount();
});
