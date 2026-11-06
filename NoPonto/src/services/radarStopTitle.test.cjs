/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// Render the actual TSX with host/hook substitutes: checks its layout contract,
// not native pixel measurements or ETA calculations.
function render(name, width, metadataName) {
  const noop = () => {};
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useEffect: noop, useReducer: (_, initial) => [initial, noop], useState: initial => [initial, noop] };
  const filename = path.join(__dirname, '../components/mapaComponents/radarParada.tsx');
  const m = new Module(filename, module);
  m.filename = filename; m.paths = Module._nodeModulePaths(path.dirname(filename));
  const colors = new Proxy({}, { get: () => '#112233' });
  const mocks = {
    react: { __esModule: true, default: React, ...React },
    'react-native': { Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View',
      Platform: { OS: 'android' }, StyleSheet: { absoluteFillObject: {} }, useWindowDimensions: () => ({ width, height: 640 }) },
    'lucide-react-native': { Check: 'Check', ChevronLeft: 'ChevronLeft', ChevronRight: 'ChevronRight', MapPin: 'MapPin', X: 'X' },
    'react-native-reanimated': { __esModule: true, default: { View: 'AnimatedView' }, useAnimatedStyle: () => ({}), useSharedValue: value => ({ value }), withTiming: value => value },
    'expo-blur': { BlurView: 'BlurView' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) },
    '@/src/utils/cores': { hexParaRgba: color => color },
    '@/src/hooks/useTema': { useTema: () => ({ cores: colors, temaAtual: 'claro' }) },
    '@/src/services/eventosParada': { rotuloQualidadeEvento: () => '' },
    '@/src/services/radarParada': { doisEventosRadar: () => [], instanteEventoRadar: () => null },
    '@/src/services/estadoPainelRadar': { estadoInicialPainelRadar: { modo: 'aberto' }, reduzirEstadoPainelRadar: noop },
    '@/src/constants/modaisMapa': { identidadeModalMapa: () => ({ Icon: 'ModalIcon', cor: '#112233' }) },
  };
  function compile(filename) {
    const nested = new Module(filename, module);
    nested.filename = filename; nested.paths = Module._nodeModulePaths(path.dirname(filename));
    nested.require = id => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.startsWith('@/') || id.startsWith('.')) {
        const resolved = Module._resolveFilename(id, nested);
        return compile(resolved);
      }
      assert.fail('Unexpected dependency: ' + id);
    };
    nested._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {fileName: filename,
      compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true}}).outputText, filename);
    return nested.exports;
  }
  m.require = id => Object.hasOwn(mocks, id) ? mocks[id] : compile(Module._resolveFilename(id, m));
  m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React,
  }, fileName: filename }).outputText, filename);
  return m.exports.default({ radar: { eventos: [], parada: { parada: { paradaId: 'fixture', nome: name }, vinculos: [] },
    metadados: metadataName ? { fixture: { nome: metadataName } } : {}, candidatos: [], manual: true },
    linhas: [], modal: 'brt', lateralidade: 'destro', visivel: true, viewportHeight: 640,
    onVerTodos: noop, onEvento: noop, localizavel: () => false, onControlsBottomChange: noop });
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
for (const width of [320, 480]) for (const name of ['FIXTURE ida parada 4', 'Terminal Integração São Cristóvão — Plataforma de embarque sentido centro']) {
  test(`full Radar stop title has no truncation at width ${width}: ${name}`, () => {
    const tree = render(name, width);
    const expected = (name.startsWith('Terminal') ? 'Chegando no ' : 'Chegando em ') + name;
    const title = nodes(tree).find(n => n.type === 'Text' && n.props.accessibilityLabel === expected);
    assert.ok(title); assert.deepEqual(title.props.children, [expected]);
    assert.equal(title.props.numberOfLines, undefined);
    assert.equal(title.props.ellipsizeMode, undefined);
    const column = nodes(tree).find(n => n.type === 'View' && n.props.children.includes(title));
    assert.equal(column.props.style.flex, 1); assert.equal(column.props.style.minWidth, 0);
    assert.ok(nodes(tree).some(n => n.type === 'ScrollView'), 'Long titles remain in the bounded scrollable panel');
  });
}
test('Radar displays full metadata stop name without changing the selected stop', () => {
  const name = 'Estação São Cristóvão — Plataforma 4';
  const title = nodes(render('Nome anterior', 320, name)).find(n => n.type === 'Text' && n.props.accessibilityLabel?.includes(name));
  assert.ok(title); assert.deepEqual(title.props.children, ['Chegando na ' + name]);
  assert.equal(title.props.numberOfLines, undefined);
});
