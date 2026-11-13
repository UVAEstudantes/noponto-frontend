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
function render(file, tutorial, props) {
  const react = {
    ...React,
    useEffect: () => {},
    useRef: (value) => ({ current: value }),
    useState: (value) => [value, () => {}],
  };
  const native = new Proxy(
    {
      StyleSheet: { create: (v) => v, absoluteFillObject: {} },
      useWindowDimensions: () => ({ height: 800, width: 400 }),
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
    "none",
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

test("target cleanup clears spotlight and ignores late native measurements", () => {
  const { observeTutorialTarget } = compile(
    path.join(__dirname, "tutorialMeasurement.ts"),
  );
  const frames = new Map();
  let next = 0,
    pending,
    current = null;
  const observation = observeTutorialTarget(
    (done) => (pending = done),
    (rect) => (current = rect),
    (fn) => {
      frames.set(++next, fn);
      return next;
    },
    (id) => frames.delete(id),
  );
  function tick() {
    const jobs = [...frames.values()];
    frames.clear();
    jobs.forEach((fn) => fn());
  }
  const rect = { x: 12, y: 36, width: 376, height: 44 };
  tick();
  pending(rect);
  tick();
  pending(rect);
  tick();
  pending(rect);
  assert.equal(current.width, 376);
  observation.refresh();
  tick();
  const late = pending;
  assert.equal(current, null);
  observation.stop();
  late(rect);
  assert.equal(current, null);
  assert.equal(frames.size, 0);
});

test("backdrop opacity is independent of step card animation", () => {
  for (const step of ["search", "route"]) {
    const tree = render(overlay, tutorial({ step }));
    const layer = nodes(tree).find(
      (n) => n.type === "AnimatedView" && n.props.pointerEvents === "none",
    );
    assert.equal(layer.props.style[1]?.opacity, undefined);
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

test("native line modal retains its original geometry during tutorial", () => {
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
  function geometry(active) {
    return vm.runInNewContext(
      "({style:" + modalStyle + ",height:" + maxHeight + "})",
      {
        tutorialEditing: active,
        corAberta: true,
        screenHeight: 800,
        insets: { top: 24 },
      },
    );
  }
  const normal = geometry(false),
    active = geometry(true);
  assert.equal(active.style.justifyContent, "center");
  assert.equal(active.style.paddingTop, normal.style.paddingTop);
  assert.equal(active.height, normal.height);
});
test("spotlight renders current measured rectangle without trailing interpolation", () => {
  const Spotlight = compile(path.join(__dirname, "TutorialSpotlight.tsx"), {
    react: React,
    "react-native-svg": {
      __esModule: true,
      default: "Svg",
      Defs: "Defs",
      Mask: "Mask",
      Rect: "Rect",
    },
  }).default;
  for (const x of [10, 180]) {
    const tree = Spotlight({
      rect: { x, y: 40, width: 120, height: 80 },
      owner: "popup",
      reducedMotion: false,
    });
    const outline = nodes(tree).find(
      (n) => n.type === "Rect" && n.props.stroke,
    );
    assert.equal(outline.props.x, x);
    assert.equal(outline.props.height, 80);
  }
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
  const handler = vm.runInNewContext(
    ts.transpileModule("(payload)=>{" + branch + "}", {}).outputText,
    {
      activeTutorialRequest: { current: { requestId: 8 } },
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
});


test("chapter five uses one overlay in the active native window and keeps controls interactive", () => {
  const state = tutorial({step: "voiceChoice", chapter: 5, radarHost: "radar"});
  assert.equal(render(overlay, state), null);
  const modal = render(overlay, state, {host: "radar"});
  assert.match(text(modal), /Escolha a voz do assistente/);
  assert.equal(nodes(modal).filter(n => n.props?.pointerEvents === "none").length, 1);
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
