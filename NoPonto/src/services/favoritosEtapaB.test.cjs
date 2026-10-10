// Preparado para execução manual. Não executado durante a implementação.
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
function carregar(arquivo, mocks = {}, cache = new Map()) {
  const filename = path.resolve(__dirname, arquivo);
  if (cache.has(filename)) return cache.get(filename).exports;
  const modulo = new Module(filename, module);
  cache.set(filename, modulo);
  modulo.paths = module.paths;
  modulo.require = (id) => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (id.startsWith("@/")) return carregar(path.resolve(__dirname, "../..", id.slice(2)) + ".ts", mocks, cache);
    if (id.startsWith(".")) return carregar(path.resolve(path.dirname(filename), id) + ".ts", mocks, cache);
    throw new Error(`Dependência inesperada: ${id}`);
  };
  modulo._compile("const __DEV__ = false;\n" + ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, filename);
  return modulo.exports;
}
const { configurarFavoritas, configuracaoFavorita, favoritasVisiveis, linhasEfetivas, ehFerroviaria } = carregar("linhasEfetivas.ts");
const favorita = (id, modal = "onibus") => ({ linhaId: String(id), codigo: String(id), nome: `Linha ${id}`, modal,
  adicionadaEm: "2026-10-10T12:00:00Z" });
const mistas = [favorita(1), favorita(2, "brt"), favorita(3, "trem"), favorita(4, "metro")];

test("favoritas não selecionadas viram configurações temporárias multimodais sem IDs estruturais inventados", () => {
  const selecionadas = []; const temporarias = {};
  const configs = configurarFavoritas(mistas, selecionadas, temporarias);
  assert.deepEqual(configs.map((linha) => linha.modal), ["onibus", "brt", "trem", "metro"]);
  assert.ok(configs.every((linha) => linha.ativa && linha.mostrarParadas && linha.modoSentido === "ambos"));
  assert.ok(configs.every((linha) => !("sentidoId" in linha) && !("padraoVersaoId" in linha)));
  assert.deepEqual(selecionadas, []); assert.deepEqual(temporarias, {});
  assert.equal(configuracaoFavorita({ ...favorita(9, "trem"), nome: "Santa Cruz" }).cor, "#64a70b");
});
test("configuração salva prevalece e favorita inativa não é ativada", () => {
  const salva = { ...configuracaoFavorita(mistas[0]), ativa: false, modoSentido: "volta", mostrarParadas: false, cor: "#123456" };
  const configs = configurarFavoritas(mistas, [salva], { "1": { ...salva, ativa: true } });
  assert.equal(configs[0], salva);
  assert.deepEqual(favoritasVisiveis(configs, null).map((linha) => linha.linhaId), ["2", "3", "4"]);
});
test("edições transitórias são reutilizadas sem alterar favoritas ou linhas normais", () => {
  const temporaria = { ...configuracaoFavorita(mistas[1]), cor: "#987654", modoSentido: "ida" };
  assert.equal(configurarFavoritas(mistas, [], { "2": temporaria })[1], temporaria);
  assert.equal(mistas[1].cor, undefined);
});
test("até dez elegíveis aparecem; acima do limite nenhuma é escolhida silenciosamente", () => {
  const configs = Array.from({ length: 13 }, (_, id) => configuracaoFavorita(favorita(id)));
  assert.equal(favoritasVisiveis(configs.slice(0, 10), null).length, 10);
  assert.equal(favoritasVisiveis(configs, null).length, 0);
  assert.deepEqual(favoritasVisiveis(configs, ["12", "5"]).map((linha) => linha.linhaId), ["5", "12"]);
  assert.equal(favoritasVisiveis(configs, configs.map((linha) => linha.linhaId)).length, 0);
  assert.equal(configs.length, 13);
});
test("escolha explícita ignora IDs removidos e linhas inativas", () => {
  const configs = mistas.map(configuracaoFavorita); configs[0].ativa = false;
  assert.deepEqual(favoritasVisiveis(configs, ["1", "2", "removida"]).map((linha) => linha.linhaId), ["2"]);
});
test("modo normal filtra o último modal; Favoritos reúne todos e preserva a coleção normal", () => {
  const configs = mistas.map(configuracaoFavorita);
  assert.deepEqual(linhasEfetivas("normal", "brt", configs, configs, null).map((linha) => linha.linhaId), ["2"]);
  assert.equal(linhasEfetivas("favoritos", "brt", configs, configs, null).length, 4);
  assert.deepEqual(linhasEfetivas("normal", "brt", configs, configs, null).map((linha) => linha.linhaId), ["2"]);
  assert.deepEqual(configs.map(ehFerroviaria), [false, false, true, true]);
});
test("Radar multimodal respeita plataformas distintas, sentido e favoritas inativas", () => {
  const { paradasElegiveisRadar } = carregar("radarParada.ts");
  const configs = mistas.map(configuracaoFavorita); configs[0].ativa = false; configs[1].modoSentido = "volta";
  const local = { latitude: -22.9, longitude: -43.2 };
  const padrao = (id, sentido) => ({ sentidoId: sentido, sentidoNome: sentido, padraoVersaoId: `${id}-${sentido}`,
    paradas: [{ paradaId: `${id}-${sentido}`, nome: "Plataforma", ...local }] });
  const itinerarios = Object.fromEntries(configs.map((linha) => [linha.linhaId,
    { padroesV2: [padrao(linha.linhaId, "ida"), padrao(linha.linhaId, "volta")] }]));
  const paradas = paradasElegiveisRadar(configs, "todos", itinerarios, local);
  assert.equal(paradas.length, 5);
  assert.ok(paradas.every((parada) => parada.vinculos.every((vinculo) => vinculo.linhaId !== "1")));
  assert.equal(paradas.find((p) => p.parada.paradaId === "2-volta").vinculos[0].padraoVersaoId, "2-volta");
  assert.ok(!paradas.some((p) => p.parada.paradaId === "2-ida"));
  assert.equal(paradasElegiveisRadar(configs, "brt", itinerarios, local).length, 1);
});
test("Todos utiliza contrato sem filtros, preserva página/signal e identidades reais; BRT permanece isolado", async () => {
  const chamadas = [];
  const linhas = [
    { linhaId: "1", codigo: "838", nome: "Campo Grande", modalId: "id-onibus", modal: "Ônibus", tipoRota: "regular" },
    { linhaId: "2", codigo: "10", nome: "Alvorada", modalId: "id-brt", modal: "BRT", tipoRota: "regular" },
    { linhaId: "3", codigo: "Santa Cruz", nome: "Santa Cruz", modalId: "id-trem", modal: "Trem", tipoRota: "train" },
  ];
  const api = { get: async (url, options) => {
    chamadas.push({ url, options });
    if (url === "/modais") return { ok: true, data: [
      { id: "id-onibus", nome: "Ônibus" }, { id: "id-brt", nome: "BRT" }, { id: "id-trem", nome: "Trem" }] };
    return { ok: true, data: { itens: linhas } };
  } };
  const servico = carregar("mobilidadeRio.ts", { "./api": { api }, "@/src/services/api": { api }, "./veiculosMapa": {} });
  const signal = new AbortController().signal;
  const resultados = await servico.buscarOpcoesPorNome("Central", 2, 20, "todos", signal);
  assert.deepEqual(chamadas[0], { url: "/linhas", options: { params: { nome: "Central", page: 2, pageSize: 20 }, signal } });
  assert.deepEqual(resultados.map((item) => item.linha.modal), ["Ônibus", "BRT", "Trem"]);
  assert.deepEqual((await servico.buscarOpcoesPorNome("10", 1, 20, "brt")).map((item) => item.linha.id), ["2"]);
  const ultima = chamadas.at(-1).options.params;
  assert.equal(ultima.modalId, "id-brt");
  assert.ok(!("tipoRota" in ultima) && !("excluirTipoRota" in ultima));
});
test("um hub e inscrições compartilhadas: retirar uma tela não cancela uma linha usada pela outra; reconexão restaura", async () => {
  const invokes = []; const callbacks = {}; let builds = 0;
  const hub = { state: "Disconnected", start: async () => { hub.state = "Connected"; },
    invoke: async (...args) => { invokes.push(args); }, on: () => {},
    onreconnecting: () => {}, onreconnected: (fn) => { callbacks.reconectar = fn; }, onclose: () => {} };
  class HubConnectionBuilder { withUrl() { return this; } withAutomaticReconnect() { return this; }
    build() { builds++; return hub; } }
  const service = carregar("gpsHub.ts", { "@/src/config/env": { config: { GPS_HUB_URL: "mock" } },
    "@microsoft/signalr": { HubConnectionBuilder, HubConnectionState: { Connected: "Connected", Connecting: "Connecting" } },
    "./veiculosMapa": {} });
  const a = Symbol(); const b = Symbol(); const listenerA = () => {}; const listenerB = () => {};
  service.iniciarGpsHub(listenerA); service.iniciarGpsHub(listenerB);
  await service.atualizarInscricoesGps(a, ["838", "10"]);
  await service.atualizarInscricoesGps(b, ["838"]);
  assert.equal(builds, 1);
  assert.equal(invokes.filter(([method]) => method === "InscreverseLinha").length, 2);
  await service.atualizarInscricoesGps(a, []);
  assert.deepEqual(invokes.at(-1), ["CancelarLinha", "10"]);
  assert.ok(!invokes.some(([method, code]) => method === "CancelarLinha" && code === "838"));
  callbacks.reconectar(); await service.reconciliarInscricoesGps();
  assert.deepEqual(invokes.at(-1), ["InscreverseLinha", "838"]);
  await service.atualizarInscricoesGps(b, []);
  service.removerGpsHubListener(listenerA); service.removerGpsHubListener(listenerB);
  assert.deepEqual(invokes.at(-1), ["CancelarLinha", "838"]);
  assert.equal(service.obterDiagnosticoGpsHub().subscribers, 0);
});

test("snapshot ferroviário agregado filtra linhas antes de hidratar, deduplica e desliga sem favoritas ferroviárias", async () => {
  const effects = []; const updates = []; const consultas = []; const geometrias = [];
  const vehicle = (linhaId, railVehicleId) => ({ linhaId, railVehicleId, railRunId: railVehicleId,
    padraoVersaoId: `versao-${linhaId}` });
  const react = { useRef: (value) => ({ current: value }), useState: () => [[], (value) => updates.push(value)],
    useEffect: (fn) => effects.push(fn) };
  const hook = carregar("../hooks/useRailRealtime.ts", { react, "react-native": { AppState: { currentState: "active" } },
    "@/src/config/env": { config: { RAIL_DEMO: true, RAIL_POLL_INTERVAL_MS: 60000 } },
    "@/src/services/railRealtime": {
      fetchRailSnapshot: async (filters) => { consultas.push(filters); return { vehicles: [
        vehicle("3", "A"), vehicle("3", "A"), vehicle("4", "B"), vehicle("fora", "C")] }; },
      getRailGeometry: async (id) => { geometrias.push(id); return { totalLengthMetres: 100 }; },
    } });
  hook.useRailRealtime({ enabled: true, linhaIds: ["3", "4"], permitirDemo: false });
  const cleanup = effects.pop()();
  try {
    await new Promise(setImmediate);
    assert.deepEqual(consultas, [{ linhaId: undefined, sentidoId: undefined }]);
    assert.deepEqual(geometrias.sort(), ["versao-3", "versao-4"]);
    assert.deepEqual(updates.at(-1).map((item) => item.railVehicleId), ["A", "B"]);
  } finally { cleanup(); }
  hook.useRailRealtime({ enabled: false, linhaIds: [] }); effects.pop()();
  assert.deepEqual(updates.at(-1), []);
  assert.equal(consultas.length, 1);
});
test("estrela da busca é irmã da área de seleção; consumidor sem favoritos continua sem ação", () => {
  const react = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }) };
  const animacao = { duration: () => ({}) };
  const { default: SearchSections } = carregar("../components/searchSections.tsx", {
    react, "react-native": { Pressable: "Pressable", ScrollView: "ScrollView", Text: "Text", View: "View" },
    "lucide-react-native": { ChevronRight: "ChevronRight", Clock3: "Clock3", CornerUpLeft: "CornerUpLeft", Search: "Search" },
    "react-native-reanimated": { __esModule: true, default: { View: "AnimatedView" },
      FadeIn: animacao, FadeOut: animacao, LinearTransition: animacao },
    "@/src/hooks/useTema": { useTema: () => ({ temaAtual: "claro", cores: {} }) },
    "@/src/constants/modaisMapa": { identidadeModalMapa: () => ({ Icon: "Icon", cor: "#123456", texto: "#123456" }) },
    "@/src/components/botaoFavorito": { __esModule: true, default: "BotaoFavorito" },
  });
  const item = { linha: { id: "linha", nome: "Linha", modal: "BRT", tipoRota: "regular" }, displayName: "10" };
  let selecionadas = 0; let favoritas = 0;
  const props = { recentes: [], resultados: [item], onSelect: () => selecionadas++, favoritos: {
    ids: new Set(), disabled: false, onToggle: (opcao) => { assert.equal(opcao, item); favoritas++; } } };
  function localizar(node, type) {
    if (!node) return null;
    if (Array.isArray(node)) return node.map((child) => localizar(child, type)).find(Boolean);
    return node.type === type ? node : localizar(node.children, type);
  }
  const tree = SearchSections(props);
  localizar(tree, "BotaoFavorito").props.onPress();
  assert.equal(favoritas, 1); assert.equal(selecionadas, 0);
  localizar(tree, "Pressable").props.onPress();
  assert.equal(selecionadas, 1);
  assert.ok(!localizar(SearchSections({ ...props, favoritos: undefined }), "BotaoFavorito"));
});

test("histórico Todos inclui identidades reais e BRT continua filtrando apenas sua categoria", () => {
  const { filtrarHistoricoBusca } = carregar("searchHistory.ts", {
    "@react-native-async-storage/async-storage": { getItem: async () => null, setItem: async () => {} },
  });
  const items = mistas.map((item) => ({ ...item, categoria: item.modal }));
  assert.equal(filtrarHistoricoBusca(items, "todos", "Linha", 6).length, 4);
  assert.deepEqual(filtrarHistoricoBusca(items, "brt", "Linha", 6).map((item) => item.linhaId), ["2"]);
});
