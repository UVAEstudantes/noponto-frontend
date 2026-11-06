const test = require('node:test');
const assert = require('node:assert/strict');
const { criarHarness } = require('../../hooks/radarTestHarness.cjs');
const { temas } = require('../../constants/tema.ts');
function nodes(v) { return Array.isArray(v) ? v.flatMap(nodes) : v && typeof v === 'object' ? [v, ...nodes(v.props?.children)] : []; }
function texto(v) { return Array.isArray(v) ? v.map(texto).join(' ') : v && typeof v === 'object' ? texto(v.props?.children) : v == null || typeof v === 'boolean' ? '' : String(v); }
test('controles de espera expandem selecionam priorizam configuram e encerram', () => {
  const h = criarHarness(), chamadas = [];
  const c = { estado: 'encerrado', mensagem: null, solicitando: false, erroPreferencias: null,
    carregado: true, podeAtivar: true, selecionadas: ['A'], preferencias: { prioritarias: [], janelaMinutos: 10 },
    disponiveis: [{ linhaId: 'A', linhaCodigo: '838' }, { linhaId: 'C', linhaCodigo: '855' }],
    selecionarLinha: id => chamadas.push(['linha', id]), priorizarLinha: id => chamadas.push(['prioridade', id]),
    definirJanela: n => chamadas.push(['janela', n]), ativar: () => chamadas.push(['ativar']), encerrar: () => chamadas.push(['encerrar']) };
  let tema = 'claro';
  const Component = h.carregar('../components/mapaComponents/radarEsperaSection.tsx', {
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable' },
    'lucide-react-native': { ChevronDown: 'ChevronDown', ChevronRight: 'ChevronRight' },
    '@/src/hooks/useTema': { useTema: () => ({ cores: temas[tema].cores }) },
  }).default;
  const render = () => h.render(() => Component({ controle: c }));
  const botao = label => nodes(h.output).find(n => n.props?.accessibilityLabel === label);
  render(); assert.equal(botao('Radar de Espera').props.accessibilityState.expanded, false);
  assert.equal(botao('Ativar acompanhamento'), undefined);
  botao('Radar de Espera').props.onPress(); render();
  assert.match(texto(h.output), /somente com o aplicativo aberto/);
  assert.equal(botao('Acompanhar linha 838').props.accessibilityState.checked, true);
  assert.equal(botao('Priorizar linha 855').props.disabled, true);
  botao('Acompanhar linha 855').props.onPress(); botao('Priorizar linha 838').props.onPress();
  botao('Aumentar antecedência').props.onPress(); botao('Ativar acompanhamento').props.onPress(); botao('Encerrar').props.onPress();
  assert.deepEqual(chamadas, [['linha', 'C'], ['prioridade', 'A'], ['janela', 11], ['ativar'], ['encerrar']]);
  for (const minutos of [2, 15]) {
    c.preferencias.janelaMinutos = minutos; render();
    assert.equal(botao('Diminuir antecedência').props.disabled, minutos === 2);
    assert.equal(botao('Aumentar antecedência').props.disabled, minutos === 15);
  }
  c.estado = 'pausado'; c.podeAtivar = false; render(); assert.equal(botao('Retomar').props.disabled, true);
  for (const t of ['claro', 'escuro']) {
    tema = t; render();
    assert.equal(nodes(botao('Radar de Espera')).find(n => n.type === 'Text').props.style.color, temas[t].cores.textoPrimario);
  }
  assert.equal(h.timerCount, 0); h.unmount();
});
