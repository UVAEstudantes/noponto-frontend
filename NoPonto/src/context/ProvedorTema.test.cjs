const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');

function provider(saved, system) {
  const states = [], effects = [], writes = [];
  let cursor = 0, first = true;
  const react = {...React,
    useState: initial => {
      const i = cursor++;
      if (first) states[i] = initial;
      return [states[i], value => {states[i] = typeof value === 'function' ? value(states[i]) : value;}];
    },
    useEffect: fn => {if (first) effects.push(fn);},
    useMemo: fn => fn(), useCallback: fn => fn,
  };
  const mocks = {
    react,
    'react-native': {useColorScheme: () => system},
    '@/src/components/startup/startupDiagnostics': {startupLog() {}},
    '@/src/constants/tema': {temas: {}},
    '@/src/constants/estilosMapa': {ESTILO_MAPA_PADRAO: 'normal', validarEstiloMapa: value => value},
    '@/src/services/storage': {
      carregarPreferenciaTema: async () => saved,
      carregarEstiloMapa: async () => 'normal', carregarPreferenciaLateralidade: async () => 'destro',
      carregarAnimacaoAbertura: async () => true,
      salvarPreferenciaTema: async value => writes.push(value),
    },
  };
  const filename = path.join(__dirname, 'ProvedorTema.tsx'), m = new Module(filename, module);
  m.paths = module.paths;
  m.require = name => {assert.ok(name in mocks, name); return mocks[name];};
  m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true}}).outputText, filename);
  const render = () => {cursor = 0; const value = m.exports.ProvedorTema({}).props.value; first = false; return value;};
  const initial = render(), cleanups = effects.map(fn => fn());
  return {initial, render, writes, cleanup: () => cleanups.forEach(fn => fn?.())};
}

test('theme defaults to light and preserves explicit preferences without automatic writes', async () => {
  for (const system of ['light', 'dark']) {
    for (const saved of [null, 'claro', 'escuro', 'sistema']) {
      const h = provider(saved, system);
      try {
        assert.equal(h.initial.preferenciaTema, 'claro');
        assert.equal(h.initial.carregandoTema, true, 'content stays behind startup gate during hydration');
        for (let i = 0; i < 6; i++) await Promise.resolve();
        const value = h.render();
        assert.equal(value.carregandoTema, false);
        assert.equal(value.preferenciaTema, saved ?? 'claro');
        assert.equal(value.temaAtual, saved === 'sistema' ? (system === 'dark' ? 'escuro' : 'claro') : saved ?? 'claro');
        assert.deepEqual(h.writes, []);
        await value.definirPreferenciaTema('escuro');
        assert.equal(h.render().temaAtual, 'escuro');
        await h.render().definirPreferenciaTema('sistema');
        assert.equal(h.render().temaAtual, system === 'dark' ? 'escuro' : 'claro');
        assert.deepEqual(h.writes, ['escuro', 'sistema']);
      } finally {h.cleanup();}
    }
  }
});
