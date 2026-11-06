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
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView' },
    'lucide-react-native': { ChevronDown: 'ChevronDown', ChevronRight: 'ChevronRight' },
    '@/src/hooks/useTema': { useTema: () => ({ cores: temas[tema].cores }) },
  }).default;
  const render = () => h.render(() => Component({ controle: c }));
  const botao = label => nodes(h.output).find(n => n.props?.accessibilityLabel === label);
  render(); assert.equal(botao('Radar de Espera').props.accessibilityState.expanded, false);
  assert.ok(botao('Ativar acompanhamento')); assert.equal(botao('Acompanhar linha 838'), undefined);
  botao('Radar de Espera').props.onPress(); render();
  assert.match(texto(h.output), /somente com o aplicativo aberto/);
  assert.equal(botao('Acompanhar linha 838').props.accessibilityState.checked, true);
  assert.equal(botao('Priorizar linha 855').props.disabled, true);
  botao('Acompanhar linha 855').props.onPress(); botao('Priorizar linha 838').props.onPress();
  botao('Aumentar antecedência').props.onPress(); botao('Ativar acompanhamento').props.onPress();
  c.estado='ativo';render();assert.equal(botao('Ativar acompanhamento'),undefined);botao('Encerrar').props.onPress();
  assert.deepEqual(chamadas, [['linha', 'C'], ['prioridade', 'A'], ['janela', 11], ['ativar'], ['encerrar']]);
  for (const minutos of [2, 15]) {
    c.preferencias.janelaMinutos = minutos; render();
    assert.equal(botao('Diminuir antecedência').props.disabled, minutos === 2);
    assert.equal(botao('Aumentar antecedência').props.disabled, minutos === 15);
  }
  c.estado = 'pausado'; c.podeAtivar = false; render(); assert.equal(botao('Retomar').props.disabled, true);
  for (const t of ['claro', 'escuro']) {
    tema = t; render();
    assert.equal(nodes(botao('Radar de Espera')).find(n => n.type === 'Text' && texto(n).includes('Radar de Espera')).props.style.color, temas[t].cores.textoPrimario);
  }
  const scroll=nodes(h.output).find(n=>n.type==='ScrollView'&&n.props.horizontal);
  assert.equal(scroll.props.style.maxHeight,56);
  assert.equal(botao('Priorizar linha 838').props.style.minWidth,44);
  assert.equal(botao('Acompanhar linha 838').props.style.minHeight,44);
  const devAnterior=global.__DEV__;
  try {
    c.diagnosticos=[{eventoId:'a',linhaId:'838',veiculoId:'bus-a',motivo:'eta_indisponivel'}];
    c.previa={conteudo:{terminal:[{id:'fisico',codigo:'838',desde:Date.parse('2026-11-06T12:00:00Z')}]}};
    global.__DEV__=false;render();assert.doesNotMatch(texto(h.output),/eta_indisponivel|Diagnóstico de seleção/);
    assert.match(texto(h.output),/aguardando\s+no terminal/);assert.match(texto(h.output),/espera observada desde/);
    global.__DEV__=true;render();assert.match(texto(h.output),/bus-a\s+·\s+eta_indisponivel/);
  } finally {global.__DEV__=devAnterior;}
  assert.equal(h.timerCount, 0); h.unmount();
});
