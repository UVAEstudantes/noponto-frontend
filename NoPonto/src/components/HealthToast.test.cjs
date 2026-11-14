const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');

function harness(dark = false, reduced = false) {
  let cursor = 0, dirty = false, tree, animation;
  const slots = [], effects = [], timers = new Map(), timings = [], dismissed = [];
  let timerId = 0;
  const clock = { setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id) };
  const equal = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = { ...React,
    useState(initial) { const i = cursor++; slots[i] ??= { value: initial }; return [slots[i].value, v => { slots[i].value = typeof v === 'function' ? v(slots[i].value) : v; dirty = true; }]; },
    useRef(initial) { const i = cursor++; slots[i] ??= { current: initial }; return slots[i]; },
    useEffect(fn, deps) { const i = cursor++; if (!equal(slots[i]?.deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
  };
  class Value {
    interpolate(value) { return value; }
    stopAnimation() { const old = animation; animation = null; old?.callback({ finished: false }); }
  }
  const palette = { fundoCard: dark ? '#1E1E1E' : '#FFFFFF', bordaSuave: '#ddd', textoPrimario: '#123', textoSecundario: '#789', fundoSecundario: '#ccc' };
  const mocks = {
    react,
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', StyleSheet: { create: x => x, absoluteFill: { position: 'absolute' } },
      Easing: { out: x => x, cubic: 'cubic' },
      AccessibilityInfo: { isReduceMotionEnabled: async () => reduced, addEventListener: () => ({ remove() {} }) },
      Animated: { Value, View: 'AnimatedView', timing: (_value, config) => ({ start(callback) { timings.push(config); animation = { callback, config }; } }) } },
    '@expo/vector-icons': { Feather: 'Feather', MaterialCommunityIcons: 'Icon' },
    'react-native-paper': { Portal: 'Portal' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 32, left: 0, right: 0 }) },
    '../hooks/useTema': { useTema: () => ({ cores: palette, temaAtual: dark ? 'escuro' : 'claro' }) },
    clock,
  };
  const filename = path.join(__dirname, 'HealthToast.tsx'), m = new Module(filename, module);
  m.require = id => { assert.ok(id in mocks, id); return mocks[id]; };
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
  m._compile('const {setTimeout, clearTimeout} = require("clock");\n' + output, filename);
  let props = { notice: null, visible: true, onDismiss: n => { dismissed.push(n); props = { ...props, notice: null }; render(); } };
  function render(next = {}) {
    props = { ...props, ...next };
    do { dirty = false; cursor = 0; tree = m.exports.HealthToast(props); while (effects.length) effects.shift()(); } while (dirty);
    return tree;
  }
  const finish = () => { const old = animation; animation = null; assert.ok(old, 'animation pending'); old.callback({ finished: true }); render(); };
  const nodes = (type, node = tree) => !node || typeof node !== 'object' ? [] : [ ...(node.type === type ? [node] : []), ...React.Children.toArray(node.props?.children).flatMap(child => nodes(type, child)) ];
  return { render, finish, nodes, timings, timers, dismissed, exports: m.exports,
    flush: () => render(), timeout: () => { assert.equal(timers.size, 1); const [id, timer] = [...timers][0]; timers.delete(id); timer.fn(); },
    cleanup: () => slots.forEach(slot => slot?.cleanup?.()) };
}
const notice = key => ({ key, message: key });

test('all health variants render semantic icons, copy, safe area and both themes', () => {
  for (const dark of [false, true]) for (const [key, icon] of [['offline', 'wifi-off'], ['unavailable', 'server-network-off'], ['dependencies', 'server-network-off'], ['sppo', 'bus'], ['brt', 'bus-articulated-front'], ['reserve', 'shield-check-outline']]) {
    const h = harness(dark); h.render({ notice: notice(key) });
    assert.equal(h.nodes('Icon')[0].props.name, icon);
    const style = h.nodes('AnimatedView')[0].props.style[1];
    assert.equal(style.top, 44); assert.equal(style.backgroundColor, dark ? '#1E1E1E' : '#FFFFFF');
    assert.equal(h.nodes('View')[0].props.pointerEvents, 'box-none');
    assert.ok(h.nodes('Text').every(n => typeof n.props.children === 'string' && n.props.children.length > 0));
    assert.equal(h.nodes('Pressable')[0].props.accessibilityLabel, 'Fechar aviso'); h.cleanup();
  }
});
test('entry, eight-second timeout and exit own one timer and remove the card', () => {
  const h = harness(); h.render({ notice: notice('sppo') });
  assert.equal(h.timings[0].duration, 300); assert.equal(h.timings[0].toValue, 1); assert.equal(h.timings[0].useNativeDriver, true);
  h.finish(); assert.equal([...h.timers.values()][0].delay, 8000); h.timeout();
  assert.equal(h.dismissed[0].key, 'sppo'); assert.equal(h.timings.at(-1).duration, 240); assert.equal(h.timings.at(-1).toValue, 0);
  h.finish(); assert.equal(h.nodes('AnimatedView').length, 0); assert.equal(h.timers.size, 0); h.cleanup();
});
test('close really dismisses and cancels timeout', () => {
  const h = harness(); h.render({ notice: notice('brt') }); h.finish();
  h.nodes('Pressable')[0].props.onPress(); assert.equal(h.dismissed[0].key, 'brt'); assert.equal(h.timers.size, 0);
  h.finish(); assert.equal(h.nodes('AnimatedView').length, 0); h.cleanup();
});
test('interrupted replacement keeps latest priority notice and cancels obsolete callbacks', () => {
  const h = harness(); h.render({ notice: notice('reserve') }); h.finish();
  h.render({ notice: notice('sppo') }); assert.equal(h.timers.size, 0);
  h.render({ notice: notice('offline') }); h.finish();
  assert.equal(h.nodes('Icon')[0].props.name, 'wifi-off'); h.finish();
  assert.equal(h.timers.size, 1); h.timeout(); assert.deepEqual(h.dismissed.map(n => n.key), ['offline']); h.cleanup();
});
test('foreground visibility pauses timeout and reduced motion uses zero-duration transitions', async () => {
  const h = harness(false, true); const n = notice('offline'); h.render({ notice: n }); await Promise.resolve(); h.flush();
  assert.equal(h.timings.at(-1).duration, 0); h.finish(); h.finish();
  h.render({ visible: false }); assert.equal(h.timers.size, 0); h.finish();
  assert.equal(h.nodes('AnimatedView').length, 0); assert.equal(h.dismissed.length, 0);
  h.render({ visible: true }); h.finish(); assert.equal(h.timers.size, 1); h.cleanup(); assert.equal(h.timers.size, 0);
});
test('priority queue preempts lower notices and retains queued distinct notices', () => {
  const h = harness(), enqueue = h.exports.enqueueHealthNotice;
  const a = notice('reserve'), b = notice('brt'), c = notice('offline');
  let queue = enqueue([], b); queue = enqueue(queue, a); assert.deepEqual(queue, [b, a]);
  assert.equal(enqueue(queue, b), queue); queue = enqueue(queue, c); assert.deepEqual(queue, [c, a]);
  queue = enqueue(queue, b); assert.deepEqual(queue, [c, b, a]);
});
