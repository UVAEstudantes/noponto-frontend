const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const vm = require("node:vm");
function code(file, predicate) {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(__dirname, "../mapaComponents", file), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  function visit(n) { if (predicate(n, source)) found = n; ts.forEachChild(n, visit); }
  visit(source); assert.ok(found, file);
  return found.getText(source);
}
function run(text, context) { return vm.runInNewContext("(" + ts.transpileModule(text, {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText.trim().replace(/;$/, "") + ")", context); }
function effect(file, needle, context) {
  const expression = code(file, (n, s) => ts.isArrowFunction(n) && ts.isCallExpression(n.parent) && n.parent.expression.getText(s) === "useEffect" && n.getText(s).includes(needle));
  return run(expression, context);
}
function handler(file, name, context) {
  const expression = code(file, n => ts.isArrowFunction(n) && ts.isVariableDeclaration(n.parent) && n.parent.name.getText() === name);
  return run(expression, context);
}

test("Radar tutorial opens only visual presentation and preserves an existing panel", () => {
  const actions = [];
  const c = {tutorialRadar: true, recolhido: true, configAberta: false, tutorialOwned: {current: false}, enviarAcaoPainel: a => actions.push(a.tipo), setSeletor() {}};
  const apply = effect("radarParada.tsx", "tutorialOwned.current", c);
  apply(); assert.deepEqual(actions, ["abrir"]);
  c.tutorialRadar = false; c.configAberta = true; apply();
  assert.deepEqual(actions, ["abrir"], "dirty modal is still mounted");
  c.configAberta = false; apply(); assert.deepEqual(actions, ["abrir", "recolher"]);
  actions.length = 0; c.tutorialRadar = true; c.recolhido = false; apply();
  c.tutorialRadar = false; apply(); assert.deepEqual(actions, [], "previously open panel remains open");
});

test("Radar tutorial configuration opens a draft without activating, requesting permission or sending notifications", () => {
  const state = {}, forbidden = () => { throw Error("unexpected real operation"); };
  const context = {
    c: {selecionadas: ["line"], preferencias: {prioritarias: [], janelaMinutos: 5}, chaveConfiguracao: "stop", ativar: forbidden, encerrar: forbidden},
    sentidosAtuais: [], setSelecionadas: v => state.lines = v, setPrioritarias() {}, setSentidos() {}, setJanela: v => state.window = v, setContexto() {}, setAberta: v => state.open = v,
    tutorialRadar: true, tutorial: {step: "radarLines", setRadarHost() {}}, aberta: false, owned: {current: false}, wasTutorial: {current: false}, rascunhoAlterado: false,
    requestPermissions: forbidden, sendNotification: forbidden,
  };
  context.abrir = handler("radarEsperaSection.tsx", "abrir", context);
  const apply = effect("radarEsperaSection.tsx", "owned.current", context);
  apply(); assert.equal(state.open, true); assert.deepEqual(Array.from(state.lines), ["line"]); assert.equal(state.window, 5);
  context.aberta = true; context.tutorialRadar = false; context.rascunhoAlterado = true; apply();
  assert.equal(state.open, true, "ending must not discard manual edits");
  context.owned.current = true; context.rascunhoAlterado = false; apply(); assert.equal(state.open, false);
});

test("voice preview speaks only after manual handler invocation and obeys headphone availability", async () => {
  let spoken = 0, stopped = 0, error;
  const context = {
    preferencias: {headphonesOnly: true, announcementStyle: "brief", voiceId: "device"},
    consultarRotaSaidaVozRadar: async () => null, precisaConfirmarBluetoothRadar: () => false,
    falaAtual: {current: 0}, previewOwned: {current: false}, resolucao: {},
    setErro: v => error = v, setFalando() {}, setRotaSaidaVoz() {},
    fraseExemplo: () => "Exemplo", formatarCodigoLinhaParaFala: v => v,
    Speech: {stop: async () => stopped++, speak: () => spoken++},
  };
  const preview = handler("radarAvisosPorVoz.tsx", "ouvir", context);
  assert.equal(spoken, 0); assert.equal(stopped, 0);
  await preview(); assert.equal(spoken, 0); assert.equal(stopped, 0); assert.match(error, /fones/);
  context.consultarRotaSaidaVozRadar = async () => ({automaticHeadphone: true});
  await preview(); assert.equal(spoken, 1); assert.equal(stopped, 1); assert.equal(context.previewOwned.current, true);
  const cleanupContext = {tutorialVoice: true, setExpandida() {}, tutorialWasActive: {current: true}, tutorial: {step: "voicePreview"}, ...context};
  const cleanup = effect("radarAvisosPorVoz.tsx", "tutorialWasActive.current", cleanupContext);
  cleanup(); assert.equal(stopped, 1);
  cleanupContext.tutorial.step = null; cleanup(); assert.equal(stopped, 2);
  cleanup(); assert.equal(stopped, 2, "cleanup stops only an owned preview");
});

test("voice tutorial hydrates preferences without automatically saving or playing", async () => {
  let saved = 0, spoken = 0, removed = 0;
  const c = {
    montado: {current: false}, consultarVozSilenciadaRadar: async () => false, setVozSilenciada() {},
    carregarPreferenciasVozRadar: async () => ({enabled: false}), normalizarPreferenciasVozRadar: v => v,
    setPreferencias() {}, setPreferenciasCarregadas() {}, tutorial: {chapter: 5}, filaSalvamento: {current: Promise.resolve()},
    salvarPreferenciasVozRadar: () => saved++, setEstadoSalvamento() {}, PREFERENCIAS_VOZ_RADAR_PADRAO: {},
    Speech: {getAvailableVoicesAsync: async () => [], speak: () => spoken++, stop: () => { throw Error("unowned audio stop"); }},
    setVozes() {}, setErro() {}, setVozesCarregadas() {}, AppState: {addEventListener: () => ({remove: () => removed++})},
    falaAtual: {current: 0}, previewOwned: {current: false},
  };
  const cleanup = effect("radarAvisosPorVoz.tsx", "montado.current = true", c)();
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.equal(saved, 0); assert.equal(spoken, 0);
  cleanup(); assert.equal(removed, 1); assert.equal(c.montado.current, false);
});


test("ending tutorial invalidates a pending headphone read before it can play audio", async () => {
  let resolveRoute, spoken = 0;
  const context = {
    preferencias: {headphonesOnly: true}, consultarRotaSaidaVozRadar: () => new Promise(resolve => resolveRoute = resolve),
    precisaConfirmarBluetoothRadar: () => false, falaAtual: {current: 0}, previewOwned: {current: false},
    setErro() {}, setFalando() {}, setRotaSaidaVoz() {}, setExpandida() {}, tutorialVoice: true,
    tutorialWasActive: {current: true}, tutorial: {step: null},
    Speech: {speak: () => spoken++, stop: () => { throw Error("unowned audio stop"); }},
  };
  const pending = handler("radarAvisosPorVoz.tsx", "ouvir", context)();
  effect("radarAvisosPorVoz.tsx", "tutorialWasActive.current", context)();
  resolveRoute({automaticHeadphone: true}); await pending;
  assert.equal(spoken, 0);
  assert.equal(context.previewOwned.current, false);
});
