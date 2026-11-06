const test = require('node:test');
const assert = require('node:assert/strict');
const { criarHarness } = require('../../hooks/radarTestHarness.cjs');
const { temas } = require('../../constants/tema.ts');
const { filtrarCandidatosNotificacao, produzirConteudoNotificacao } = require('../../services/notificacoesRadar.ts');

function nodes(value) {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object') return [];
  return [value, ...nodes(value.props?.children)];
}
function texto(value) {
  if (Array.isArray(value)) return value.map(texto).join(' ');
  if (value == null || typeof value === 'boolean') return '';
  return typeof value === 'object' ? texto(value.props?.children) : String(value);
}
const recebidoEm = Date.parse('2026-11-06T12:00:00Z');
const evento = (eventId, linhaId = 'A', secondsUntilEvent = 120) => ({
  eventId, linhaId, codigoLinha: linhaId === 'A' ? '838' : '855', vehicleId: `bus-${eventId}`,
  secondsUntilEvent, paradaId: 'stop', sentidoId: 'ida', padraoOperacionalId: 'p',
  padraoVersaoId: 'v', ocorrenciaParadaPadraoId: 'oc', modal: 'onibus', tipoRota: 'onibus',
  eventType: 'ARRIVAL', source: 'RealtimeEstimated', quality: 'OperationalEstimate', isEstimated: true,
});
function previa(eventos, alteracoes = {}, agora = recebidoEm) {
  const contexto = { paradaId: 'stop', vinculos: ['A', 'C'].map(linhaId => ({
    linhaId, sentidoId: 'ida', padraoVersaoId: 'v', padraoOperacionalId: 'p',
  })), linhasPrioritarias: ['C'], ...alteracoes };
  const candidatos = filtrarCandidatosNotificacao(eventos, contexto, recebidoEm, agora);
  return { contexto, candidatos, conteudo: produzirConteudoNotificacao(contexto, candidatos, recebidoEm, agora) };
}
function montar(inicial, dev = true) {
  const h = criarHarness();
  let atual = inicial, tema = 'claro';
  const Component = h.carregar('../components/mapaComponents/previaNotificacaoRadarSection.tsx', {
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable' },
    'lucide-react-native': { ChevronDown: 'ChevronDown', ChevronRight: 'ChevronRight' },
    '@/src/hooks/useTema': { useTema: () => ({ cores: temas[tema].cores, temaAtual: tema }) },
  }).default;
  const render = () => {
    const anterior = global.__DEV__;
    global.__DEV__ = dev;
    try { return h.render(() => Component({ previa: atual })); }
    finally { if (anterior === undefined) delete global.__DEV__; else global.__DEV__ = anterior; }
  };
  const botao = () => nodes(h.output).find(n => n.type === 'Pressable');
  render();
  return { h, render, botao,
    alternar() { botao().props.onPress(); return render(); },
    atualizar(valor) { atual = valor; return render(); },
    tema(valor) { tema = valor; return render(); },
  };
}

test('previa recolhida expande dois veiculos da mesma linha sem duplicar destaque', () => {
  const p = previa([evento('a2', 'A', 180), evento('c', 'C', 300), evento('a1', 'A', 60)]);
  const { h, botao, alternar } = montar(p);
  assert.equal(botao().props.accessibilityState.expanded, false);
  assert.match(texto(h.output), /3 candidatos elegíveis/);
  assert.doesNotMatch(texto(h.output), /Veículo bus-/);
  alternar();
  assert.equal(botao().props.accessibilityState.expanded, true);
  const cards = nodes(h.output).filter(n => n.type === 'View' && ['a1', 'a2', 'c'].includes(n.props.key));
  assert.deepEqual(cards.map(n => n.props.key), ['c', 'a1', 'a2']);
  assert.match(texto(cards[0]), /Linha 855.*Chegada prevista: 5 min.*Veículo bus-c/);
  assert.match(texto(cards[1]), /Linha 838.*1 min.*Veículo bus-a1/);
  assert.match(texto(cards[2]), /Linha 838.*3 min.*Veículo bus-a2/);
  assert.match(texto(h.output), /Destaque.*Alternativas/);
  assert.equal(h.timerCount, 0);
  alternar();
  assert.doesNotMatch(texto(h.output), /Veículo bus-/);
  h.unmount();
});

test('eventos sem ETA elegivel mostram contexto valido vazio', () => {
  const { h, alternar } = montar(previa([evento('sem-eta', 'A', null)]));
  alternar();
  assert.match(texto(h.output), /0 candidatos elegíveis/);
  assert.match(texto(h.output), /Nenhuma previsão elegível neste contexto/);
  assert.doesNotMatch(texto(h.output), /Contexto indisponível|Linha 838|Chegada prevista/);
  h.unmount();
});

test('contexto indisponivel ou pausado difere de previsao vazia', () => {
  const { h, alternar } = montar(null);
  alternar();
  assert.match(texto(h.output), /Contexto indisponível ou consulta pausada/);
  assert.doesNotMatch(texto(h.output), /0 candidatos|Nenhuma previsão elegível/);
  h.unmount();
});

test('troca de parada e sentido remove candidatos antigos da previa aberta', () => {
  const m = montar(previa([evento('antigo')]));
  m.alternar();
  assert.match(texto(m.h.output), /bus-antigo/);
  for (const [paradaId, sentidoId, id] of [['outra', 'ida', 'novo-stop'], ['outra', 'volta', 'novo-sentido']]) {
    const contexto = { paradaId, vinculos: [{ linhaId: 'A', sentidoId,
      padraoVersaoId: 'v', padraoOperacionalId: 'p' }] };
    const p = previa([{ ...evento(id, 'A', 240), paradaId, sentidoId }], contexto);
    m.atualizar(p);
    assert.match(texto(m.h.output), new RegExp(`bus-${id}`));
    assert.match(texto(m.h.output), /1 candidato elegível/);
    assert.doesNotMatch(texto(m.h.output), /bus-antigo/);
    if (id === 'novo-sentido') assert.doesNotMatch(texto(m.h.output), /bus-novo-stop/);
  }
  m.atualizar(null);
  assert.doesNotMatch(texto(m.h.output), /bus-novo-sentido/);
  assert.match(texto(m.h.output), /Contexto indisponível/);
  assert.equal(m.h.timerCount, 0);
  m.h.unmount();
});

test('ETA acompanha snapshots recebidos sem timer e preserva saida prevista', () => {
  const e = { ...evento('saida', 'A', 150), eventType: 'DEPARTURE', vehicleId: null };
  const m = montar(previa([e]));
  m.alternar();
  assert.match(texto(m.h.output), /Saída prevista: 3 min/);
  assert.match(texto(m.h.output), /Evento saida/);
  m.atualizar(previa([e], {}, recebidoEm + 60000));
  assert.match(texto(m.h.output), /Saída prevista: 2 min/);
  assert.doesNotMatch(texto(m.h.output), /Chegada prevista|Saída prevista: 3 min/);
  m.atualizar(previa([e], {}, recebidoEm + 140000));
  assert.match(texto(m.h.output), /menos de 1 min/);
  assert.equal(m.h.timerCount, 0);
  m.h.unmount();
});

test('outras prioritarias seguem N1 sem repetir candidato em alternativas', () => {
  const p = previa([evento('a', 'A', 60), evento('c', 'C', 300)], { linhasPrioritarias: ['A', 'C'] });
  const m = montar(p);
  m.alternar();
  const cards = nodes(m.h.output).filter(n => n.type === 'View' && ['a', 'c'].includes(n.props.key));
  assert.deepEqual(cards.map(n => n.props.key), ['a', 'c']);
  assert.match(texto(m.h.output), /Destaque.*Outras prioritárias/);
  assert.doesNotMatch(texto(m.h.output), /Alternativas/);
  m.h.unmount();
});

test('previa reutiliza cores do tema claro e escuro', () => {
  const m = montar(previa([evento('a')]));
  m.alternar();
  for (const tema of ['claro', 'escuro']) {
    m.tema(tema);
    const titulo = nodes(m.h.output).find(n => n.type === 'Text' && texto(n).includes('Prévia de notificação'));
    const card = nodes(m.h.output).find(n => n.type === 'View' && n.props.key === 'a');
    assert.equal(titulo.props.style.color, temas[tema].cores.textoSecundario);
    assert.equal(card.props.style.backgroundColor, temas[tema].cores.fundoSecundario);
    assert.equal(nodes(card).find(n => n.type === 'Text').props.style.color, temas[tema].cores.textoPrimario);
  }
  m.h.unmount();
});

test('componente de previa nao renderiza em producao', () => {
  const m = montar(previa([evento('a')]), false);
  assert.equal(m.h.output, null);
  assert.equal(m.h.timerCount, 0);
  m.h.unmount();
});
