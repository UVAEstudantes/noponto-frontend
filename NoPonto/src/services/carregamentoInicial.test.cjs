const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function carregar(arquivo, dependencias = {}) {
  const filename = path.resolve(__dirname, arquivo);
  const modulo = new Module(filename, module);
  modulo.paths = module.paths;
  modulo.require = (id) => {
    if (Object.hasOwn(dependencias, id)) return dependencias[id];
    throw new Error(`Dependência inesperada: ${id}`);
  };
  modulo._compile("const __DEV__ = false;\n" + ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, filename);
  return modulo.exports;
}

test("cache deduplica pedidos simultâneos e remove null e rejeições", async () => {
  const { CacheEstruturalPorVersao } = carregar("estruturaV2.ts", { "@/src/services/api": { api: {} } });
  const cache = new CacheEstruturalPorVersao();
  let concluir;
  let chamadas = 0;
  const loader = () => { chamadas++; return new Promise((resolve) => { concluir = resolve; }); };
  const a = cache.get("versao", loader);
  assert.equal(cache.get("versao", loader), a);
  assert.equal(chamadas, 1);
  concluir(null);
  await a;
  await assert.rejects(cache.get("versao", async () => { throw new Error("offline"); }));
  const sucesso = { geometria: "real" };
  assert.equal(await cache.get("versao", async () => sucesso), sucesso);
  assert.equal(await cache.get("versao", async () => { throw new Error("não deve consultar"); }), sucesso);
});

test("sentidos/padrões distinguem resposta vazia legítima de erro HTTP/rede", async () => {
  let resposta = { ok: true, data: [] };
  const servico = carregar("estruturaV2.ts", { "@/src/services/api": { api: { get: async () => resposta } } });
  assert.deepEqual(await servico.listarSentidosV2("SV866"), []);
  assert.deepEqual(await servico.listarPadroesV2("sentido"), []);
  for (const status of [0, 500]) {
    resposta = { ok: false, status };
    await assert.rejects(servico.listarSentidosV2("SV866"));
    await assert.rejects(servico.listarPadroesV2("sentido"));
  }
});

const { estadoInicialPainelRadar: inicial, reduzirEstadoPainelRadar: reduzir } = carregar("estadoPainelRadar.ts");
const observar = (amostra, temEventos, concluida = true, contexto = "parada-A") =>
  ({ tipo: "observar", amostra: String(amostra), temEventos, concluida, contexto });

test("ETA vencido já é removido pelo filtro existente antes de observar o painel", () => {
  const { eventosValidosRadar } = carregar("radarParada.ts", {
    "../types/estruturaV2": { rotuloSentidoPublico: () => "não utilizado" },
  });
  const agora = Date.parse("2026-10-10T12:00:00Z");
  const parada = { parada: { paradaId: "parada" },
    vinculos: [{ linhaId: "linha", sentidoId: "sentido", padraoVersaoId: "versao" }] };
  const evento = { eventId: "evento", paradaId: "parada", linhaId: "linha",
    sentidoId: "sentido", padraoVersaoId: "versao", estimatedAt: "2026-10-10T11:59:00Z" };
  assert.deepEqual(eventosValidosRadar([evento], parada, agora, agora), []);
  assert.equal(eventosValidosRadar([{ ...evento, estimatedAt: "2026-10-10T12:01:00Z" }], parada, agora, agora).length, 1);
});

test("Radar só reage a amostras concluídas e exige estabilidade para fechar/abrir", () => {
  assert.equal(reduzir(inicial, observar(0, false, false)), inicial);
  let estado = reduzir(inicial, observar(1, false));
  assert.equal(estado.modo, "aberto");
  assert.equal(reduzir(estado, observar(1, false)), estado);
  estado = reduzir(estado, observar(2, false));
  assert.equal(estado.modo, "automatico");
  estado = reduzir(estado, observar(3, true));
  assert.equal(estado.modo, "automatico");
  estado = reduzir(estado, observar(4, true));
  assert.equal(estado.modo, "aberto");
  assert.equal(reduzir(estado, observar(5, false, false)), estado); // loading/erro não são zero
});

test("recolhimento manual prevalece e abertura manual mantém painel vazio utilizável", () => {
  let estado = reduzir(inicial, { tipo: "recolher" });
  for (let i = 0; i < 4; i++) estado = reduzir(estado, observar(i, true));
  assert.equal(estado.modo, "manual");
  estado = reduzir(estado, { tipo: "abrir" });
  for (let i = 4; i < 10; i++) estado = reduzir(estado, observar(i, false));
  assert.equal(estado.modo, "aberto");
  assert.equal(estado.abertoPeloUsuario, true);
});

test("respostas oscilantes e troca de parada não acumulam zeros de contextos distintos", () => {
  let estado = inicial;
  for (let i = 0; i < 12; i++) estado = reduzir(estado, observar(i, i % 2 === 0));
  assert.equal(estado.modo, "aberto");
  estado = reduzir(inicial, observar(1, false));
  estado = reduzir(estado, observar(2, false, true, "parada-B"));
  assert.equal(estado.modo, "aberto");
});

// Harness de efeitos: simula dependências React e o protocolo WebView, sem runtime nativo.
function harnessReact() {
  const slots = [];
  let indice = 0, pendentes = [], dirty = false;
  const igual = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    forwardRef: (fn) => fn,
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useRef: (valor) => { const i = indice++; return slots[i] ??= { current: valor }; },
    useState: (valor) => {
      const i = indice++;
      slots[i] ??= { value: valor };
      return [slots[i].value, (novo) => {
        const value = typeof novo === "function" ? novo(slots[i].value) : novo;
        if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; }
      }];
    },
    useMemo: (fn, deps) => {
      const i = indice++;
      if (!slots[i] || !igual(slots[i].deps, deps)) slots[i] = { deps, value: fn() };
      return slots[i].value;
    },
    useEffect: (fn, deps) => {
      const i = indice++;
      if (!slots[i] || !igual(slots[i].deps, deps)) {
        const cleanup = slots[i]?.cleanup;
        slots[i] = { deps };
        pendentes.push(() => { cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
    useImperativeHandle: () => {},
  };
  return { react, render(fn) {
    let output, ciclos = 0;
    do {
      indice = 0; dirty = false; output = fn();
      const effects = pendentes; pendentes = []; effects.forEach((effect) => effect());
      if (++ciclos > 15) throw new Error("Render sem estabilidade");
    } while (dirty);
    return output;
  } };
}

for (const estruturasAntes of [true, false]) {
  test(`WebView reenvia estruturas em cada ready; estruturas antes=${estruturasAntes}, GPS tardio`, () => {
    const harness = harnessReact();
    const Mapa = carregar("../components/mapOSM/mapOSM.tsx", {
      react: harness.react,
      "react-native-webview": { WebView: "WebView" },
      "@/src/constants/estilosMapa": { ESTILO_MAPA_PADRAO: "normal", estilosMapaDisponiveis: [] },
      "./webview/mapHtml": { buildMapHtml: (args) => JSON.stringify(args) },
      "@/src/services/veiculosMapa": { adaptarRailParaMapa: (item) => item },
    }).default;
    const linha = { structureKey: "linha:versao", nome: "SV866", segmentos: [[[1, 2], [3, 4]]], posicoes: [] };
    let props = { location: null, linhasParaMostrar: estruturasAntes ? [linha] : [] };
    let view;
    const render = () => { view = harness.render(() => Mapa(props, null)); };
    render();
    const source = view.props.source;
    const scripts = [];
    view.props.ref.current = { injectJavaScript: (script) => scripts.push(script) };
    view.props.onMessage({ nativeEvent: { data: "map_ready" } }); render();
    if (!estruturasAntes) { props = { ...props, linhasParaMostrar: [linha] }; render(); }
    assert.ok(scripts.some((script) => script.startsWith("window.updateMap(") && script.includes("linha:versao")));
    props = { ...props, location: { coords: { latitude: -22, longitude: -43 } } }; render();
    assert.equal(view.props.source, source); // GPS não recarrega o documento
    scripts.length = 0;
    view.props.onLoadStart(); render();
    assert.equal(scripts.length, 0);
    view.props.onMessage({ nativeEvent: { data: "map_ready" } }); render();
    assert.ok(scripts.some((script) => script.startsWith("window.updateMap(") && script.includes("linha:versao")));
    assert.ok(scripts.some((script) => script.includes("window.updateUser")));
    assert.ok(scripts.some((script) => script.includes("window.updateRealtime")));
    scripts.length = 0;
    // Ready repetido também deve reenviar, mesmo sem transição false/true.
    view.props.onMessage({ nativeEvent: { data: "map_ready" } }); render();
    assert.ok(scripts.some((script) => script.startsWith("window.updateMap(")));
  });
}
