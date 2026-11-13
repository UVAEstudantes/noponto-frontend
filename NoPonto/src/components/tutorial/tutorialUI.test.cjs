const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const React = require("react");
const stepsPath = path.join(__dirname, "tutorialSteps.ts");
function compile(filename, mocks = {}) {
  const m = new Module(filename, module);
  m.paths = module.paths;
  m.require = (name) => (name in mocks ? mocks[name] : require(name));
  m._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.React,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
  return m.exports;
}
const steps = compile(stepsPath);
function render(file, tutorial, props, {height = 800, width = 400, keyboardTop = null, state = []} = {}) {
  let stateIndex = 0;
  const react = {
    ...React,
    useEffect: () => {},
    useRef: (value) => ({ current: value }),
    useState: (value) => {
      const index = stateIndex++;
      return [index in state ? state[index] : value === null ? keyboardTop : value, () => {}];
    },
  };
  const native = new Proxy(
    {
      StyleSheet: { create: (v) => v, absoluteFillObject: {} },
      useWindowDimensions: () => ({ height, width }),
      Animated: { Value: class {}, View: "AnimatedView" },
    },
    { get: (o, k) => (k in o ? o[k] : String(k)) },
  );
  const colors = new Proxy({}, { get: () => "#222" });
  return compile(file, {
    react,
    "react-native": native,
    "react-native-svg": {
      __esModule: true,
      default: "Svg",
      Defs: "Defs",
      Mask: "Mask",
      Rect: "Rect",
    },
    "react-native-safe-area-context": {
      useSafeAreaInsets: () => ({ top: 24, bottom: 16 }),
      SafeAreaView: "SafeAreaView",
    },
    "lucide-react-native": new Proxy({}, { get: (o, k) => String(k) }),
    "@/src/hooks/useTema": {
      useTema: () => ({ cores: colors, temaAtual: "claro" }),
    },
    "./TutorialProvider": { useTutorial: () => tutorial },
    "@/src/components/tutorial/TutorialProvider": {
      useTutorial: () => tutorial,
    },
    "./tutorialSteps": steps,
    "./TutorialSpotlight": { __esModule: true, default: "TutorialSpotlight" },
    "@/src/constants/estilosMapa": { estilosMapaDisponiveis: [] },
    "@/src/components/indicadoresConfiguracao": {
      __esModule: true,
      default: "IndicadoresConfiguracao",
    },
  }).default(props);
}
function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)];
}
function text(tree) {
  return nodes(tree)
    .flatMap((n) =>
      React.Children.toArray(n.props?.children).filter(
        (c) => typeof c === "string",
      ),
    )
    .join(" ");
}
const overlay = path.join(__dirname, "TutorialOverlay.tsx");
function tutorial(overrides = {}) {
  return {
    ready: true,
    step: "search",
    chapter: 1,
    searching: false,
    routeAvailable: false,
    progress: { seen: true },
    setLineId() {},
    advance() {},
    end() {},
    complete() {},
    replay() {},
    start() {},
    ...overrides,
  };
}
test("search overlay passes touches through and collapses while editing", () => {
  const tree = render(overlay, tutorial({ searching: true }));
  assert.equal(tree.props.pointerEvents, "box-none");
  assert.equal(
    nodes(tree).find((n) => n.type === "AnimatedView").props.pointerEvents,
    "box-none",
  );
  assert.match(text(tree), /Escolha uma linha nos resultados/);
  assert.doesNotMatch(text(tree), /Pesquise uma linha que/);
  assert.equal(
    nodes(tree).some(
      (n) => n.type === "View" && n.props.style?.position === "absolute",
    ),
    false,
  );
  assert.equal(
    nodes(tree).find((n) => n.type === "ScrollView").props
      .keyboardShouldPersistTaps,
    "always",
  );
});
test("ending or unready tutorial removes all overlay nodes", () => {
  assert.equal(render(overlay, tutorial({ step: null })), null);
  assert.equal(render(overlay, tutorial({ ready: false })), null);
});
test("search offers example without offering a fake advance", () => {
  let accepted = 0;
  const tree = render(
    overlay,
    tutorial({ example: true, useExample: () => accepted++ }),
  );
  const offer = nodes(tree).find(
    (n) => n.type === "Pressable" && text(n).includes("Usar linha 838"),
  );
  offer.props.onPress();
  assert.equal(accepted, 1);
  assert.doesNotMatch(text(tree), /Continuar/);
});
test("route explanation never claims unavailable itinerary or live vehicles", () => {
  assert.match(steps.tutorialPresentation("route", false).title, /selecionada/);
  assert.match(
    steps.tutorialPresentation("route", true).description,
    /traçado/,
  );
  assert.doesNotMatch(
    steps.tutorialPresentation("route", true).description,
    /ônibus|ativo|minuto/,
  );
});
test("settings replays implemented tutorial and renders no notification test controls", () => {
  let replayed = 0;
  const tree = render(
    path.resolve(__dirname, "../../../app/configuracao.tsx"),
    tutorial({ replay: () => replayed++ }),
  );
  assert.match(text(tree), /Rever tutorial/);
  const replay = nodes(tree).find(
    (n) => n.type === "Pressable" && text(n).includes("Rever tutorial"),
  );
  replay.props.onPress();
  assert.equal(replayed, 1);
  assert.doesNotMatch(
    text(tree),
    /heads-up|Limpar testes|Sem previsões|Notificações nativas/,
  );
});

test("real selection handler rejects invalid/full selections and advances before slow itinerary", async () => {
  const vm = require("node:vm");
  const filename = path.resolve(__dirname, "../../../app/index.tsx");
  const source = ts.createSourceFile(
    filename,
    fs.readFileSync(filename, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let initializer;
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(source) === "selecionarOpcao"
    )
      initializer = node.initializer.getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  let selected = 0,
    alerts = 0,
    resolveItinerary,
    added = [];
  const context = {
    useCallback: (fn) => fn,
    linhasSelecionadas: [],
    MAX_LINHAS: 10,
    selecionandoBuscaRef: { current: true },
    Alert: { alert: () => alerts++ },
    categoriaLinhaV2: () => "trem",
    setViewMode() {},
    setNormalModal() {},
    registrarSelecaoBusca: async () => [],
    setHistoricoBusca() {},
    setLinhasSelecionadas: (fn) => {
      added = fn(context.linhasSelecionadas);
    },
    corRamalTrem: () => "#123",
    gerarCorAleatoria: () => "#123",
    fecharBusca() {},
    tutorial: {
      step: "search",
      setLineId() {},
      setRouteAvailable() {},
      advance: (event) => {
        assert.equal(event, "selected");
        selected++;
      },
    },
    garantirItinerario: () =>
      new Promise((resolve) => {
        resolveItinerary = resolve;
      }),
    mapRef: { current: {} },
    console,
    setTimeout,
  };
  const js = ts.transpileModule(
    "const handler = " + initializer + "; handler;",
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const handler = vm.runInNewContext(js, context);
  await handler({ linha: {} });
  assert.equal(selected, 0);
  const option = {
    linha: { id: "real-line", codigo: "838" },
    nomeExibicao: "Linha real",
  };
  context.linhasSelecionadas = Array.from({ length: 10 }, (_, i) => ({
    linhaId: String(i),
  }));
  await handler(option);
  assert.equal(alerts, 1);
  assert.equal(selected, 0);
  context.linhasSelecionadas = [];
  const pending = handler(option);
  assert.equal(added[0].linhaId, "real-line");
  assert.equal(added[0].modal, "trem");
  assert.equal(
    selected,
    1,
    "confirmed selection must not wait for itinerary network response",
  );
  resolveItinerary(null);
  await pending;
  assert.equal(selected, 1);
});

test("migrated search and route omit external backdrop", () => {
  for (const step of ["search", "route"]) {
    const tree = render(overlay, tutorial({ step }));
    const layer = nodes(tree).find(
      (n) => n.type === "AnimatedView" && n.props.pointerEvents === "none",
    );
    assert.equal(layer, undefined);
  }
});

test("real stop_click handler opens existing panel and confirms only current itinerary stop", () => {
  const vm = require("node:vm");
  const filename = path.resolve(__dirname, "../../../app/index.tsx");
  const source = ts.createSourceFile(
    filename,
    fs.readFileSync(filename, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let handlerSource;
  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.getText(source) === "onStopPress")
      handlerSource = node.initializer.expression.getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  let selected = null,
    expanded = true,
    advances = 0;
  const handler = vm.runInNewContext(
    ts.transpileModule("(" + handlerSource + ")", {}).outputText,
    {
      setParadaSelecionada: (p) => (selected = p),
      setParadaExpandida: (v) => (expanded = v),
      tutorialLine: { paradas: [{ paradaId: "real" }] },
      tutorial: { stopSelected: () => advances++ },
    },
  );
  const stop = { paradaId: "real", nome: "Parada real" };
  handler(stop);
  assert.equal(selected, stop);
  assert.equal(expanded, false);
  assert.equal(advances, 1);
  handler({ paradaId: "other" });
  assert.equal(advances, 1);
});
test("settings replays chapter three and chapter four conclusion continues to Radar", () => {
  const called = [];
  const tree = render(
    path.resolve(__dirname, "../../../app/configuracao.tsx"),
    tutorial({ replay: (id) => called.push(id) }),
  );
  const button = nodes(tree).find(
    (n) =>
      n.type === "Pressable" &&
      text(n).includes("Paradas, estações e terminais"),
  );
  button.props.onPress();
  assert.deepEqual(called, [3]);
  let closed = 0;
  const done = render(
    overlay,
    tutorial({ step: "linesDone", chapter: 4, advance: (event) => { assert.equal(event, "next"); closed++; } }),
  );
  const finish = nodes(done).find(
    (n) => n.type === "Pressable" && text(n).includes("Continuar para o Radar"),
  );
  finish.props.onPress();
  assert.equal(closed, 1);
  assert.match(text(done), /Continuar para o Radar/);
});

test("settings replays chapter four without mutating preferences", () => {
  const called = [];
  const tree = render(
    path.resolve(__dirname, "../../../app/configuracao.tsx"),
    tutorial({
      replay: (id) => called.push(id),
      progress: { chapters: [1, 2, 3, 4] },
    }),
  );
  const button = nodes(tree).find(
    (n) =>
      n.type === "Pressable" && text(n).includes("Suas linhas, do seu jeito"),
  );
  assert.match(text(button), /Concluído/);
  button.props.onPress();
  assert.deepEqual(called, [4]);
});
test("chapter four opens and closes visual controls without invoking data handlers", () => {
  const vm = require("node:vm");
  function effect(file, needle, context) {
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    let arrow;
    function visit(node) {
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(source).endsWith("useEffect") &&
        node.arguments[0]?.getText(source).includes(needle)
      )
        arrow = node.arguments[0].getText(source);
      ts.forEachChild(node, visit);
    }
    visit(source);
    assert.ok(arrow, needle);
    return vm.runInNewContext(
      "(" +
        ts.transpileModule(arrow, {}).outputText.trim().replace(/;$/, "") +
        ")",
      context,
    );
  }
  let open = false,
    config = null,
    colorOpen = true;
  const panelContext = {
    tutorial: { step: "lineControls", lineContext: { lineId: "line" } },
    tutorialPanelWasOpen: { current: false },
    linePanelStep: steps.linePanelStep,
    setContainerAberto: (v) => (open = v),
    setParadaSelecionada() {},
    fecharBusca() {},
  };
  const panel = effect(
    path.resolve(__dirname, "../../../app/index.tsx"),
    "tutorialPanelWasOpen",
    panelContext,
  );
  panel();
  assert.equal(open, true);
  panelContext.tutorial.step = null;
  panel();
  assert.equal(open, false);
  const modalContext = {
    tutorial: { lineId: "line", chapter: 4, setLineModalOpen() {} },
    tutorialEditing: true,
    aberto: true,
    tutorialOwned: { current: false },
    setLinhaConfigId: (v) => (config = v),
    setCorAberta: (v) => (colorOpen = v),
  };
  const modal = effect(
    path.resolve(__dirname, "../mapaComponents/linhasContainer.tsx"),
    "tutorialOwned",
    modalContext,
  );
  modal();
  assert.equal(config, "line");
  assert.equal(colorOpen, true);
  modalContext.tutorialEditing = false;
  modalContext.tutorial.chapter = 1;
  modal();
  assert.equal(config, null);
  assert.equal(colorOpen, false);
});

test("line modal reserves fixed guidance space and restores normal sizing", () => {
  const filename = path.resolve(
    __dirname,
    "../mapaComponents/linhasContainer.tsx",
  );
  const source = ts.createSourceFile(
    filename,
    fs.readFileSync(filename, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const vm = require("node:vm");
  let modalStyle, maxHeight;
  function visit(node) {
    if (ts.isObjectLiteralExpression(node)) {
      if (
        node.getText(source).includes('backgroundColor: "rgba(0,0,0,0.4)"') &&
        node.getText(source).includes("padding: 20")
      )
        modalStyle = node.getText(source);
      for (const property of node.properties)
        if (
          ts.isPropertyAssignment(property) &&
          property.name.getText(source) === "maxHeight" &&
          property.initializer.getText(source).includes("corAberta")
        )
          maxHeight = property.initializer.getText(source);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  function geometry(active, alturaModalTutorial = null) {
    return vm.runInNewContext(
      "({style:" + modalStyle + ",height:" + maxHeight + "})",
      {
        tutorialEditing: active,
        alturaModalTutorial,
        corAberta: true,
        screenHeight: 800,
        insets: { top: 24 },
      },
    );
  }
  const normal = geometry(false),
    active = geometry(true);
  assert.equal(active.style.justifyContent, "flex-start");
  assert.equal(normal.style.justifyContent, "center");
  assert.equal(active.style.paddingTop, normal.style.paddingTop);
  assert.equal(active.height, undefined);
  assert.equal(normal.height, "90%");
  assert.equal(geometry(false, 420).height, normal.height, 'normal modal sizing is unchanged');
});
test("native map bridge discards older window measurement after a newer message arrives", () => {
  const vm = require("node:vm");
  const filename = path.resolve(__dirname, "../mapOSM/mapOSM.tsx");
  const source = ts.createSourceFile(
    filename,
    fs.readFileSync(filename, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let branch;
  function visit(node) {
    if (
      ts.isIfStatement(node) &&
      node.expression.getText(source).includes("tutorial_vehicle") &&
      node.expression.getText(source).includes("activeTutorialRequest")
    )
      branch = node.getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(branch);
  const pending = [],
    sent = [];
  const activeTutorialRequest = { current: { requestId: 8 } };
  const handler = vm.runInNewContext(
    ts.transpileModule("(payload)=>{" + branch + "}", {}).outputText,
    {
      activeTutorialRequest,
      latestTutorialMeasurement: { current: null },
      nativeFrameRef: {
        current: { measureInWindow: (callback) => pending.push(callback) },
      },
      mapTutorialRect: compile(path.join(__dirname, "tutorialMapContract.ts"))
        .mapTutorialRect,
      onTutorialEvent: (event) => sent.push(event),
    },
  );
  const event = {
    type: "tutorial_vehicle",
    requestId: 8,
    status: "target",
    viewport: { width: 400, height: 800 },
    rect: { x: 10, y: 30, width: 80, height: 100 },
  };
  handler({ ...event, sequence: 1 });
  handler({ ...event, sequence: 2, rect: { ...event.rect, x: 90 } });
  pending[0](0, 0, 400, 800);
  assert.equal(sent.length, 0);
  pending[1](0, 0, 400, 800);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].sequence, 2);
  assert.equal(sent[0].rect.x, 90);
  activeTutorialRequest.current.nativeHighlight = true;
  handler({ ...event, sequence: 3 });
  assert.equal(pending.length, 2, "native highlight skips measureInWindow");
  assert.equal(sent.length, 2);
  assert.equal(sent[1].rect, undefined);
});


test("chapter five uses one overlay in the active native window and keeps controls interactive", () => {
  const state = tutorial({step: "voiceChoice", chapter: 5, radarHost: "radar"});
  assert.equal(render(overlay, state), null);
  const modal = render(overlay, state, {host: "radar"});
  assert.match(text(modal), /Escolha a voz do assistente/);
  assert.equal(nodes(modal).filter(n => n.props?.pointerEvents === "none").length, 0);
  assert.equal(modal.props.pointerEvents, "box-none");
  assert.equal(render(overlay, {...state, radarHost: "confirmation"}, {host: "radar"}), null);
});

test("chapter five notification preview is local and settings replay each implemented section", () => {
  const preview = render(overlay, tutorial({step: "notificationPreview", chapter: 5}));
  assert.match(text(preview), /Demonstração · sem dados ao vivo/);
  assert.match(text(preview), /Exemplo de aviso/);
  const calls = [];
  const settings = render(path.resolve(__dirname, "../../../app/configuracao.tsx"), tutorial({replay: (...args) => calls.push(args)}));
  for (const label of ["Radar de Espera, notificações e voz", "Notificações", "Voz"]) {
    nodes(settings).find(n => n.type === "Pressable" && (label === "Radar de Espera, notificações e voz" ? text(n).includes(label) : text(n).trim() === label)).props.onPress();
  }
  assert.deepEqual(calls, [[5], [5, "5B"], [5, "5C"]]);
});


test("chapter six real filter handler changes only user selected transport and leaves real selections intact", () => {
  const vm = require("node:vm");
  function expression(filename, predicate) {
    const source = ts.createSourceFile(filename, fs.readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let result;
    function visit(n) { if (predicate(n, source)) result = n.getText(source); ts.forEachChild(n, visit); }
    visit(source); assert.ok(result); return result;
  }
  const file = path.resolve(__dirname, "../../../app/index.tsx");
  const handler = expression(file, n => ts.isArrowFunction(n) && ts.isCallExpression(n.parent) && ts.isVariableDeclaration(n.parent.parent) && n.parent.parent.name.getText() === "selecionarCategoriaBusca");
  const selections = [{linhaId: "existing", cor: "#123456"}];
  let category = "onibus", mapModal = "onibus", menu = true;
  const selected = [], c = {
    categoriaAlteradaPeloUsuario: {current: false}, modalAlteradoPeloUsuario: {current: false},
    setSearchCategory: v => category = v, setNormalModal: v => mapModal = v, viewMode: "normal",
    tutorial: {filterSelected: id => selected.push(id)}, linhasSelecionadas: selections,
    setLinhasSelecionadas: () => {throw Error("must preserve selected lines");},
  };
  const select = vm.runInNewContext("(" + ts.transpileModule(handler, {}).outputText.trim().replace(/;$/, "") + ")", c);
  const press = expression(path.resolve(__dirname, "../mapaComponents/buscaMapa.tsx"), n => ts.isArrowFunction(n) && n.getText().includes("onSelecionarModal(modal.id)"));
  for (const id of ["onibus", "brt", "trem"]) {
    const click = vm.runInNewContext("(" + ts.transpileModule(press, {}).outputText.trim().replace(/;$/, "") + ")", {onSelecionarModal: select, modal: {id}, setMenuAberto: v => menu = v});
    click(); assert.equal(category, id); assert.equal(mapModal, id); assert.equal(menu, false);
  }
  assert.deepEqual(selected, ["onibus", "brt", "trem"]);
  assert.deepEqual(selections, [{linhaId: "existing", cor: "#123456"}]);
  select("invalid"); assert.equal(category, "trem");
  c.viewMode = "favoritos"; select("brt"); assert.equal(category, "brt"); assert.equal(mapModal, "trem");
});

test("chapter six remains optional without results and explains actual rail quality labels", () => {
  const actual = compile(path.resolve(__dirname, "../../services/confiancaApresentacao.ts"));
  assert.deepEqual(steps.RAIL_STATUS_GUIDE.map(x => x.label), [actual.rotuloConfianca(null, null, "Scheduled"), actual.rotuloConfianca(null, null, "Estimated"), actual.rotuloConfianca(null, null, "Live")]);
  for (const step of ["transportBrt", "transportRail"]) {
    const calls = [];
    const tree = render(overlay, tutorial({step, chapter: 6, searching: true, advance: event => calls.push(event)}));
    const next = nodes(tree).find(n => n.type === "Pressable" && text(n).includes("Continuar"));
    next.props.onPress(); assert.deepEqual(calls, ["next"]);
  }
  const guide = render(overlay, tutorial({step: "railStatus", chapter: 6}));
  assert.match(text(guide), /sem horários ou dados ao vivo/);
  assert.match(text(guide), /grade/); assert.match(text(guide), /evidências recentes/);
});

test("chapter six and final summary replay and help actions retain progress", () => {
  const calls = [];
  const settings = render(path.resolve(__dirname, "../../../app/configuracao.tsx"), tutorial({replay: id => calls.push(id)}));
  nodes(settings).find(n => n.type === "Pressable" && text(n).includes("Conhecendo outros transportes")).props.onPress();
  assert.deepEqual(calls, [6]);
  let finished = 0, help = 0;
  const final = render(overlay, tutorial({step: "journeyDone", chapter: 6, complete: () => finished++, openTutorials: () => help++}));
  nodes(final).find(n => n.type === "Pressable" && text(n).includes("Explorar o NoPonto")).props.onPress();
  nodes(final).find(n => n.type === "Pressable" && text(n).includes("Rever tutoriais")).props.onPress();
  assert.equal(finished, 1); assert.equal(help, 1);
});

test("initial location resolves permission states silently and records only the automatic attempt", async () => {
  const { resolveInitialLocation } = compile(path.join(__dirname, "initialLocation.ts"));
  for (const state of ["granted", "denied", "undetermined", "blocked", "unavailable", "timeout"]) {
    let stored = null, requests = 0, positions = 0;
    const point = { coords: { latitude: -22, longitude: -43 } };
    const permission = { granted: state === "granted", status: state === "blocked" ? "undetermined" : state, canAskAgain: state !== "blocked" };
    const storage = { getItem: async () => stored, setItem: async (_, value) => { stored = value; } };
    const location = {
      getForegroundPermissionsAsync: async () => {
        if (state === "unavailable") throw Error("unavailable");
        return state === "timeout" ? { granted: true } : permission;
      },
      requestForegroundPermissionsAsync: async () => { requests++; assert.equal(stored, "1"); return { granted: true }; },
      getCurrentPositionAsync: async () => { positions++; return state === "timeout" ? new Promise(() => {}) : point; },
    };
    const result = await resolveInitialLocation(storage, location, 5);
    assert.equal(result, ["granted", "undetermined"].includes(state) ? point : null, state);
    assert.equal(requests, state === "undetermined" ? 1 : 0, state);
    assert.equal(positions, ["granted", "undetermined", "timeout"].includes(state) ? 1 : 0, state);
    if (state === "undetermined") {
      assert.equal(await resolveInitialLocation(storage, location, 5), null);
      assert.equal(requests, 1, "reopening must not prompt again");
    }
  }
});

test("fixed root cards ignore moving spotlight geometry and content measurements", () => {
  for (const step of ["welcome", "search", "vehicle", "stop"]) {
    const cards = [40, 500].map(y => {
      const tree = render(overlay, tutorial({step, spotlight: {x: 10, y, width: 50, height: 50}}));
      return nodes(tree).find(n => n.type === "AnimatedView" && n.props.style?.position === "absolute");
    });
    assert.equal(cards[0].props.style.top, undefined);
    assert.equal(cards[0].props.style.bottom, cards[1].props.style.bottom);
    const scroll = nodes(cards[0]).find(n => n.type === "ScrollView");
    assert.equal(typeof scroll.props.onContentSizeChange, "function");
    assert.ok(cards[0].props.style.maxHeight > 0 && cards[0].props.style.maxHeight <= 340);
  }
});

test("automatic permission denial and GPS failures allow continuation without another prompt", async () => {
  const { resolveInitialLocation } = compile(path.join(__dirname, "initialLocation.ts"));
  for (const outcome of ["denied", "request-error", "gps-error"]) {
    let stored = null, requests = 0;
    const storage = {getItem: async () => stored, setItem: async (_, v) => {stored = v;}};
    const location = {
      getForegroundPermissionsAsync: async () => ({granted: false, status: "undetermined", canAskAgain: true}),
      requestForegroundPermissionsAsync: async () => {
        requests++;
        if (outcome === "request-error") throw Error("permission unavailable");
        return {granted: outcome === "gps-error"};
      },
      getCurrentPositionAsync: async () => {throw Error("GPS unavailable");},
    };
    assert.equal(await resolveInitialLocation(storage, location), null);
    assert.equal(await resolveInitialLocation(storage, location), null);
    assert.equal(requests, 1, outcome);
  }
});

test("fixed search region respects keyboard bounds and resized screens", () => {
  for (const height of [480, 800]) {
    for (const keyboardTop of [null, height - 220]) {
      const tree = render(overlay, tutorial({step: "search", searching: true}), undefined, {height, keyboardTop});
      const card = nodes(tree).find(n => n.type === "AnimatedView" && n.props.style?.position === "absolute");
      const scroll = nodes(card).find(n => n.type === "ScrollView");
      assert.equal(card.props.style.bottom, keyboardTop === null ? 98 : 228);
      assert.ok(card.props.style.maxHeight > 0);
      assert.ok(height - card.props.style.bottom - card.props.style.maxHeight >= 32);
      assert.equal(card.props.style.top, undefined);
    }
  }
});

test('native vehicle focus keeps fixed card without React Native spotlight or dimming', () => {
  for (const step of ['vehicle', 'vehicleDetails']) {
    const tree = render(overlay, tutorial({step, chapter: 2, mapRequest: {nativeHighlight: true}}));
    assert.equal(nodes(tree).some(n => n.type === 'TutorialSpotlight'), false);
    assert.equal(nodes(tree).some(n => n.props?.pointerEvents === 'none'), false);
    const card = nodes(tree).find(n => n.type === 'AnimatedView' && n.props.style?.position === 'absolute');
    assert.equal(card.props.style.bottom, 98);
  }
  const old = render(overlay, tutorial({step: 'voiceChoice', chapter: 5}));
  assert.equal(nodes(old).some(n => n.type === 'TutorialSpotlight'), false);
});

test('map request updates preserve dim until actual unmount', () => {
  const vm = require('node:vm');
  const filename = path.resolve(__dirname, '../mapOSM/mapOSM.tsx');
  const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const effects = [];
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect' && node.arguments[0]?.getText(source).includes('window.setTutorialVehicle')) effects.push(node.arguments[0].getText(source));
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(effects.length, 2);
  const sent = [], scope = {mapReady: true, tutorialRequest: {requestId: 1, nativeHighlight: true}, webViewRef: {}, injectWebViewCommand: (_, command) => sent.push(command)};
  const [update, mount] = effects.map(effect => vm.runInNewContext('(' + ts.transpileModule(effect, {}).outputText.trim().replace(/;$/, '') + ')', scope));
  const unmount = mount();
  assert.equal(update(), undefined, 'request update must not register a clearing cleanup');
  scope.tutorialRequest = {requestId: 2, mode: 'details', nativeHighlight: true};
  assert.equal(update(), undefined);
  assert.equal(sent.length, 2);
  assert.ok(sent.every(command => !command.includes('setTutorialVehicle(null)')));
  unmount();
  assert.match(sent[2], /setTutorialVehicle\(null\)/);
});

test('direct native targets keep layout and touches without starting geometry observation', () => {
  let observed = 0;
  for (const [step, kind, enabled, expected] of [
    ['search', 'input', true, true], ['search', 'results', true, true], ['stopDetails', 'stopPanel', true, true], ['welcome', 'input', true, false], ['search', 'results', false, false],
    ...['lineControls', 'lineDirection', 'lineColor', 'lineFavorite', 'lineVisibility', 'lineRemove', 'lineTab'].map(step => [step, 'line', true, true]),
    ...['transportFilters', 'transportBrt', 'transportRail'].flatMap(step => ['input', 'filter', 'results'].map(kind => [step, kind, true, true])),
    ['transportMap', 'input', true, true], ['lineColor', 'line', false, false],
    ...steps.RADAR_STEPS.map(step => [step, 'radar', true, true]),
  ]) {
    const effects = [], style = {height: 44, borderWidth: 1};
    const Target = compile(path.join(__dirname, 'TutorialTarget.tsx'), {
      react: {...React, useRef: v => ({current: v}), useEffect: fn => effects.push(fn)},
      'react-native': {View: 'View', useWindowDimensions: () => ({width: 400, height: 800})},
      '@react-navigation/native': {useIsFocused: () => true},
      './tutorialSteps': steps,
      './tutorialMeasurement': {observeTutorialTarget: () => {observed++; throw Error('unexpected observation');}},
      './TutorialProvider': {useTutorial: () => ({step, chapter: steps.chapterOf(step)})},
    }).default;
    let pressed = 0;
    const tree = Target({kind, enabled, style, pointerEvents: 'auto', onPress: () => pressed++});
    effects.forEach(fn => fn());
    assert.equal(tree.props.style[0], style);
    assert.equal(Boolean(tree.props.style[1]), expected);
    if (expected) {
      assert.equal(tree.props.style[1].outlineColor, '#FFC107');
      assert.equal(tree.props.style[1].borderWidth, undefined);
    }
    tree.props.onPress(); assert.equal(pressed, 1);
    assert.equal(tree.props.pointerEvents, 'auto');
  }
  assert.equal(observed, 0);
});

test('chapters one to three omit external focus and stop card reserves expanded panel', () => {
  for (const [step, chapter] of [['welcome', 1], ['search', 1], ['route', 1], ['vehicle', 2], ['vehicleDetails', 2], ['stop', 3], ['stopDetails', 3], ['stations', 3]]) {
    const tree = render(overlay, tutorial({step, chapter}));
    assert.equal(nodes(tree).some(n => n.type === 'TutorialSpotlight'), false, step);
    tree.props.onLayout({nativeEvent: {layout: {width: 400, height: 800}}});
    if (step === 'stopDetails') {
      const card = nodes(tree).find(n => n.type === 'AnimatedView');
      const scroll = nodes(card).find(n => n.type === 'ScrollView');
      assert.equal(card.props.style.top, 32);
      assert.ok(card.props.style.top + card.props.style.maxHeight < 800 * 0.26);
    }
  }
});

test('search entry opens existing input once and does not refocus on unrelated renders', () => {
  const vm = require('node:vm');
  function effect(file, needle) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let result;
    function visit(node) {
      if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect' && node.arguments[0]?.getText(source).includes(needle)) result = node.getText(source);
      ts.forEachChild(node, visit);
    }
    visit(source); assert.ok(result); return ts.transpileModule(result, {}).outputText;
  }
  const enter = effect(path.resolve(__dirname, '../../../app/index.tsx'), 'setPedidoFocoBusca');
  const focus = effect(path.resolve(__dirname, '../mapaComponents/buscaMapa.tsx'), 'inputRef.current?.focus');
  let active = false, request = 0, focused = 0, deps;
  const scope = {
    tutorial: {step: 'welcome'}, telaAtiva: true, transportSearchStep: steps.transportSearchStep,
    setBuscaAberta: value => {active = value;}, setPedidoFocoBusca: fn => {request = fn(request);},
    useEffect: (fn, next) => {if (!deps || next.some((x, i) => x !== deps[i])) {deps = next; fn();}},
  };
  vm.runInNewContext(enter, scope);
  scope.tutorial.step = 'search'; vm.runInNewContext(enter, scope);
  vm.runInNewContext(enter, scope);
  assert.equal(active, true); assert.equal(request, 1);
  const input = {...scope, active, focusRequest: request, inputRef: {current: {focus: () => focused++, blur() {}}}, setMenuAberto() {}};
  deps = undefined; vm.runInNewContext(focus, input); vm.runInNewContext(focus, input);
  assert.equal(focused, 1, 'existing TextInput focus runs once');
  scope.tutorial.step = 'route'; vm.runInNewContext(enter, scope);
  scope.tutorial.step = 'search'; vm.runInNewContext(enter, scope);
  assert.equal(request, 2, 'returning to search gets a new focus request');
  for (const step of ['transportFilters', 'transportBrt', 'transportRail']) {
    const before = request;
    scope.tutorial.step = step; vm.runInNewContext(enter, scope); vm.runInNewContext(enter, scope);
    assert.equal(request, before + 1, step);
    input.focusRequest = request;
    vm.runInNewContext(focus, input); vm.runInNewContext(focus, input);
  }
  assert.equal(focused, 4);
  scope.tutorial.step = 'transportMap'; vm.runInNewContext(enter, scope);
  assert.equal(request, 5, 'map explanation must not reopen keyboard');
});

test('chapters four and six keep cards stable and external masks disabled', () => {
  for (const step of ['lineControls', 'lineFavorite', 'lineTab', 'linesDone', 'transportIntro', 'transportFilters', 'transportBrt', 'transportRail', 'railStatus', 'transportMap', 'journeyDone']) {
    const tree = render(overlay, tutorial({step, chapter: steps.chapterOf(step)}));
    assert.equal(nodes(tree).some(n => n.type === 'TutorialSpotlight'), false, step);
    const card = nodes(tree).find(n => n.type === 'AnimatedView');
    assert.equal(card.props.style.position, 'absolute');
    if (step === 'lineControls' || step === 'lineFavorite') {
      const scroll = nodes(card).find(n => n.type === 'ScrollView');
      assert.ok(card.props.style.top + card.props.style.maxHeight < 800 * 0.48);
    } else assert.equal(card.props.style.bottom, 98);
  }
});

test('fixed line guidance stays outside control scrolling and reuses all tutorial actions', () => {
  for (const step of ['lineDirection', 'lineColor', 'lineVisibility', 'lineRemove']) {
    const calls = [];
    const state = tutorial({step, chapter: 4, lineModalOpen: true, advance: event => calls.push(event), end: () => calls.push('end')});
    assert.equal(render(overlay, state), null);
    const tree = render(overlay, state, {inLineModal: true, docked: true});
    assert.equal(nodes(tree).some(n => n.props?.style?.position === 'absolute'), false);
    const scroll = nodes(tree).find(n => n.type === 'ScrollView');
    assert.equal(nodes(tree).find(n => n.type === 'AnimatedView').props.style.maxHeight, 331.2);
    assert.equal(scroll.props.scrollEnabled, true);
    for (const label of ['Voltar', 'Pular', 'Encerrar tutorial']) nodes(tree).find(n => n.type === 'Pressable' && n.props.accessibilityLabel === label).props.onPress();
    nodes(tree).find(n => n.type === 'Pressable' && text(n).trim() === 'Continuar').props.onPress();
    assert.deepEqual(calls, ['back', 'skip', 'end', 'next']);
  }
});

test('line modal has one fixed guide outside its real control ScrollView', () => {
  const filename = path.resolve(__dirname, '../mapaComponents/linhasContainer.tsx');
  const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let count = 0;
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'TutorialOverlay') {
      count++;
      assert.ok(node.attributes.properties.some(p => p.name?.getText(source) === 'docked'));
      for (let parent = node.parent; parent; parent = parent.parent) if (ts.isJsxElement(parent)) assert.notEqual(parent.openingElement.tagName.getText(source), 'ScrollView');
    }
    ts.forEachChild(node, visit);
  }
  visit(source); assert.equal(count, 1);
});

test('local highlight overrides dimming and restores peer appearance without intercepting touches', () => {
  let state = {step: 'voiceChoice', chapter: 5, radarHost: 'radar'};
  const Target = compile(path.join(__dirname, 'TutorialTarget.tsx'), {
    react: {...React, useRef: v => ({current: v}), useEffect() {}}, 'react-native': {View: 'View'},
    '@react-navigation/native': {useIsFocused: () => true}, './tutorialSteps': steps,
    './TutorialProvider': {useTutorial: () => state},
  }).default;
  const original = {height: 48, opacity: 1};
  const active = Target({kind: 'radar', enabled: true, dimmed: true, style: original, pointerEvents: 'auto'});
  assert.equal(active.props.style[1].outlineColor, '#FFC107');
  assert.equal(active.props.style[2], false, 'active child must retain normal opacity');
  const peer = Target({kind: 'radar', enabled: false, dimmed: true, style: original, pointerEvents: 'auto'});
  assert.equal(peer.props.style[2].opacity, 0.72);
  assert.equal(peer.props.pointerEvents, 'auto');
  state = {step: null, chapter: 1};
  const normal = Target({kind: 'radar', enabled: false, style: original});
  assert.equal(normal.props.style[0], original);
  assert.equal(normal.props.style[1], false); assert.equal(normal.props.style[2], false);
});

test('direct reveal scrolls once and ignores callbacks after step cleanup', () => {
  const effects = [], scrolled = [], inner = {measureLayout() {}}; let measured;
  const clipRef = {current: {getInnerViewNode: () => {throw Error("numeric handle forbidden");}, getInnerViewRef: () => inner, scrollTo: value => scrolled.push(value)}};
  const Target = compile(path.join(__dirname, 'TutorialTarget.tsx'), {
    react: {...React, useRef: v => ({current: v}), useEffect: fn => effects.push(fn)}, 'react-native': {View: 'View'},
    '@react-navigation/native': {useIsFocused: () => true}, './tutorialSteps': steps,
    './TutorialProvider': {useTutorial: () => ({step: 'voiceOptions', chapter: 5, radarHost: 'radar'})},
  }).default;
  const tree = Target({kind: 'radar', reveal: true, clipRef});
  tree.props.ref.current = {measureLayout: (node, done) => {assert.equal(node, inner); measured = done;}, measureInWindow: () => {throw Error('external measurement forbidden');}};
  const cleanup = effects[0](); measured(0, 240);
  assert.deepEqual(scrolled, [{y: 232, animated: false}]);
  cleanup(); measured(0, 500); assert.equal(scrolled.length, 1);
});

test('all Radar hosts have local focus and fixed guidance without external mask', () => {
  for (const host of ['root', 'radar', 'stopPicker', 'confirmation']) {
    const tree = render(overlay, tutorial({step: host === 'stopPicker' ? 'radarStop' : 'voiceChoice', chapter: 5, radarHost: host}), {host, docked: host !== 'root'});
    assert.equal(nodes(tree).some(n => n.props?.pointerEvents === 'none'), false);
    const guide = nodes(tree).find(n => n.type === 'AnimatedView');
    assert.equal(guide.props.style.maxHeight, host === 'root' ? 256 : 331.2);
    if (host !== 'root') assert.equal(nodes(tree).some(n => n.props?.style?.position === 'absolute'), false);
  }
});

test('Radar configuration and native selectors keep guidance outside control scrolling', () => {
  for (const file of ['radarEsperaSection.tsx', 'radarParada.tsx', 'radarAvisosPorVoz.tsx']) {
    const filename = path.resolve(__dirname, '../mapaComponents', file);
    const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let found = 0;
    function visit(node) {
      if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'TutorialOverlay') {
        found++; assert.ok(node.attributes.properties.some(p => p.name?.getText(source) === 'docked'));
        for (let parent = node.parent; parent; parent = parent.parent) {
          if (ts.isJsxElement(parent) && parent.openingElement.tagName.getText(source) === 'ScrollView') {
            const modalAncestor = (() => {for(let p=node.parent;p && p!==parent;p=p.parent) if(ts.isJsxElement(p) && p.openingElement.tagName.getText(source)==='Modal') return true; return false;})();
            assert.equal(modalAncestor, true, 'a guide can cross an outer scroll only through its own native Modal');
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source); assert.equal(found, 1, file);
  }
});

test('root Radar reserves space below fixed guidance and restores normal panel limit', () => {
  const vm = require('node:vm');
  const filename = path.resolve(__dirname, '../mapaComponents/radarParada.tsx');
  const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'alturaDisponivel') expression = node.initializer.getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source); assert.ok(expression);
  const base = {viewportHeight: 800, height: 800, insets: {top: 24}, bottom: 88};
  const active = vm.runInNewContext(expression, {...base, tutorialRadar: true});
  const normal = vm.runInNewContext(expression, {...base, tutorialRadar: false});
  assert.equal(normal, 496);
  assert.equal(active, 408);
  const guide = render(overlay, tutorial({step: 'radarStop', chapter: 5, radarHost: 'root'}));
  const card = nodes(guide).find(n => n.type === 'AnimatedView');
  const scroll = nodes(card).find(n => n.type === 'ScrollView');
  assert.ok(card.props.style.top + card.props.style.maxHeight < 800 - base.bottom - active);
});

test('line modal keeps one real close button fixed during tutorial and closes only on explicit press', () => {
  const vm = require('node:vm');
  const file = path.resolve(__dirname, '../mapaComponents/linhasContainer.tsx');
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let button; const branches = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'botaoFecharConfig') button = node.initializer.getText(source);
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && ['tutorialEditing', '!tutorialEditing'].includes(node.left.getText(source)) && node.getText(source).includes('botaoFecharConfig')) branches.push(node.getText(source));
    ts.forEachChild(node, visit);
  }
  visit(source); assert.ok(button); assert.equal(branches.length, 2);
  const actions = [], context = {React, Pressable: 'Pressable', X: 'X', View: 'View', cores: {}, setLinhaConfigId: value => actions.push(value), tutorial: {setLineModalOpen: value => actions.push(value)}};
  function evaluate(code) {return vm.runInNewContext(ts.transpileModule(code, {compilerOptions: {jsx: ts.JsxEmit.React}}).outputText, context);}
  context.botaoFecharConfig = evaluate(button);
  assert.deepEqual(actions, []);
  for (const active of [false, true]) {
    context.tutorialEditing = active;
    const shown = branches.map(evaluate).filter(Boolean);
    assert.equal(shown.length, 1);
    assert.equal(nodes(shown[0]).filter(n => n.props?.accessibilityLabel === 'Fechar personalização da linha').length, 1);
  }
  context.botaoFecharConfig.props.onPress(); assert.deepEqual(actions, [null, false]);
});

test('native reveal rejects missing or numeric refs and ignores detached targets', () => {
  for (const inner of [null, 42, {measureLayout() {}}]) {
    const effects = [], scrolled = []; let callback;
    const scroll = {getInnerViewRef: () => inner, scrollTo: value => scrolled.push(value)};
    const Target = compile(path.join(__dirname, 'TutorialTarget.tsx'), {
      react: {...React, useRef: v => ({current: v}), useEffect: fn => effects.push(fn)},
      'react-native': {View: 'View'}, '@react-navigation/native': {useIsFocused: () => true},
      './tutorialSteps': steps, './TutorialProvider': {useTutorial: () => ({step: 'voiceOptions', chapter: 5})},
    }).default;
    const tree = Target({kind: 'radar', reveal: true, clipRef: {current: scroll}});
    tree.props.ref.current = {measureLayout: (node, done) => {assert.equal(node, inner); callback = done;}};
    effects[0]();
    if (inner && typeof inner === 'object') {
      assert.equal(typeof callback, 'function'); tree.props.ref.current = null; callback(0, 200);
    } else assert.equal(callback, undefined);
    assert.equal(scrolled.length, 0);
    tree.props.ref.current = null; effects[0](); assert.equal(scrolled.length, 0);
  }
});

test('Radar navigation stays outside scrolling content in every host without requiring real data', () => {
  for (const height of [480, 800]) for (const host of ['root', 'radar', 'stopPicker', 'confirmation']) {
    for (const step of steps.RADAR_STEPS) {
      const calls = [];
      const tree = render(overlay, tutorial({step, chapter: 5, radarHost: host, radarDraftPending: true,
        lineId: null, advance: event => calls.push(event), end: () => calls.push('end')}), {host, docked: host !== 'root'}, {height});
      const body = nodes(tree).find(n => n.type === 'ScrollView');
      assert.ok(body.props.style.flexShrink === 1);
      for (const label of ['Voltar', 'Pular', 'Encerrar tutorial']) {
        const button = nodes(tree).find(n => n.type === 'Pressable' && n.props.accessibilityLabel === label);
        assert.ok(button, `${step}/${host}/${label}`);
        assert.equal(nodes(body).includes(button), false, 'navigation must not scroll with explanation');
      }
      const next = nodes(tree).find(n => n.type === 'Pressable' && /^(Continuar|Conhecer)/.test(text(n).trim()));
      assert.ok(next, `${step}/${host} needs an explicit advance without activating services`);
      assert.equal(nodes(body).includes(next), false);
      next.props.onPress(); assert.deepEqual(calls, ['next']);
      nodes(tree).find(n => n.type === 'Pressable' && n.props.accessibilityLabel === 'Pular').props.onPress();
      assert.deepEqual(calls, ['next', 'skip']);
      if (step === 'radarChapterDone') assert.match(text(next), /Conhecer outros transportes/);
      if (['voiceEnable', 'voiceSave', 'radarStart'].includes(step)) assert.match(text(next), /Continuar sem ativar/);
      assert.equal(nodes(body).some(n => n.props?.accessibilityRole === 'header'), false, 'title remains fixed');
    }
  }
});


test('overflow indicator exposes long explanations while title and navigation stay fixed', () => {
  const tree = render(overlay, tutorial({step: 'voiceOptions', chapter: 5, radarHost: 'radar'}),
    {host: 'radar', docked: true}, {height: 480, state: [600, 30]});
  assert.match(text(tree), /Role a explicação para ler mais/);
  const body = nodes(tree).find(n => n.type === 'ScrollView');
  assert.equal(body.props.scrollEnabled, true);
  assert.doesNotMatch(text(body), /Role a explicação/);
  const title = nodes(tree).find(n => n.props?.accessibilityRole === 'header');
  const next = nodes(tree).find(n => n.type === 'Pressable' && text(n).trim() === 'Continuar');
  assert.ok(title); assert.ok(next);
  assert.equal(nodes(body).includes(title), false); assert.equal(nodes(body).includes(next), false);
});
