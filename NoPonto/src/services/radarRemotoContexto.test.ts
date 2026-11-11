import test from 'node:test';
import assert from 'node:assert/strict';
import { configurarRadarRemoto } from './radarRemotoContexto';

function input(count = 2): any {
  const stop = { paradaId: 'stop', nome: 'Parada', ordem: 1, posicaoLinha: 0, latitude: 0, longitude: 0 };
  const lines = Array.from({ length: count }, (_, i) => ({ linhaId: `line-${i}`, ativa: true, modoSentido: 'ambos', modal: 'onibus' }));
  return { parada: { parada: stop, distancia: 0, vinculos: lines.map(l => ({ linhaId: l.linhaId, sentidoId: 'ida', padraoVersaoId: 'v' })) },
    linhas: lines, modal: 'onibus', realtime: {}, itinerarios: Object.fromEntries(lines.map(l => [l.linhaId, {
      linha: l.linhaId, modal: 'onibus', segmentos: [], padroesV2: [{ linhaId: l.linhaId, sentidoId: 'ida', padraoVersaoId: 'v',
        padraoOperacionalId: 'op', ehVersaoAtual: true, paradas: [stop] }],
    }])) };
}

test('contexto remoto cruza linhas sentidos e versoes da selecao e mantem prioridades contidas', () => {
  const f = input();
  const c = configurarRadarRemoto(f, ['line-0'], ['line-0', 'line-1'], 10)!;
  assert.deepEqual(c.contextos, [{ linhaId: 'line-0', sentidoId: 'ida', padraoVersaoId: 'v', padraoOperacionalId: 'op' }]);
  assert.deepEqual(c.linhasSelecionadas, ['line-0']); assert.deepEqual(c.linhasPrioritarias, ['line-0']);
  assert.equal(c.paradaId, 'stop');
});

test('contexto ferroviário envia apenas sentidos escolhidos e não oferece o terminal como saída', () => {
  const f = input(1);
  f.modal = 'trem'; f.linhas[0].modal = 'trem';
  f.itinerarios['line-0'].padroesV2 = [
    { sentidoId: 'central', sentidoNome: 'Central', padraoOperacionalId: 'op-c', padraoVersaoId: 'v-c', paradas: [
      { ...f.parada.parada, ordem: 1 }, { ...f.parada.parada, paradaId: 'central', ordem: 2 },
    ] },
    { sentidoId: 'santa-cruz', sentidoNome: 'Santa Cruz', padraoOperacionalId: 'op-s', padraoVersaoId: 'v-s', paradas: [
      { ...f.parada.parada, ordem: 1 }, { ...f.parada.parada, paradaId: 'santa-cruz', ordem: 2 },
    ] },
    { sentidoId: 'terminal', sentidoNome: 'Terminal', padraoOperacionalId: 'op-t', padraoVersaoId: 'v-t', paradas: [
      { ...f.parada.parada, paradaId: 'before', ordem: 1 }, { ...f.parada.parada, ordem: 2 },
    ] },
  ];
  f.parada.vinculos = f.itinerarios['line-0'].padroesV2.map((route: any) => ({
    linhaId: 'line-0', sentidoId: route.sentidoId, padraoVersaoId: route.padraoVersaoId, destino: route.sentidoNome,
  }));
  const { direcoesDisponiveisRadar } = require('./radarRemotoContexto');
  const options = direcoesDisponiveisRadar(f, ['line-0']);
  assert.deepEqual(options.map((option: any) => option.nome), ['Central', 'Santa Cruz']);
  const configuration = configurarRadarRemoto(f, ['line-0'], [], 10, [options[0].chave]);
  assert.deepEqual(configuration?.contextos.map((context: any) => context.sentidoId), ['central']);
});

test('contexto remoto rejeita falta de padrao versao antiga sentido errado ou parada diferente', () => {
  for (const mutation of ['pattern', 'old', 'direction', 'stop', 'line']) {
    const f = input(1); const route = f.itinerarios['line-0'].padroesV2[0];
    if (mutation === 'pattern') route.padraoOperacionalId = null;
    if (mutation === 'old') route.ehVersaoAtual = false;
    if (mutation === 'direction') route.sentidoId = 'other';
    if (mutation === 'stop') route.paradas = [];
    if (mutation === 'line') route.linhaId = 'other';
    assert.equal(configurarRadarRemoto(f, ['line-0'], [], 10), null, mutation);
  }
});

test('contexto remoto limita linhas e janela sem truncar configuracao nem aceitar duplicatas', () => {
  for (const window of [1, 16, 2.5, NaN]) assert.equal(configurarRadarRemoto(input(), ['line-0'], [], window), null);
  for (const window of [2, 15]) assert.equal(configurarRadarRemoto(input(), ['line-0'], [], window)?.antecedenciaMinutos, window);
  assert.equal(configurarRadarRemoto(input(), ['line-0', 'line-0'], [], 10), null);
  assert.equal(configurarRadarRemoto(input(), [], [], 10), null);
  for (const count of [20, 21]) {
    const f = input(count), ids = f.linhas.map((l: any) => l.linhaId);
    assert.equal(configurarRadarRemoto(f, ids, [], 10)?.linhasSelecionadas.length ?? null, count === 20 ? 20 : null);
  }
});

test('contexto remoto deduplica vinculos e recusa mais de quarenta contextos completos', () => {
  const duplicate = input(1); duplicate.parada.vinculos.push({ ...duplicate.parada.vinculos[0] });
  assert.equal(configurarRadarRemoto(duplicate, ['line-0'], [], 10)?.contextos.length, 1);
  for (const count of [40, 41]) {
    const f = input(1), original = f.itinerarios['line-0'].padroesV2[0];
    f.itinerarios['line-0'].padroesV2 = Array.from({ length: count }, (_, n) => ({ ...original, padraoVersaoId: `v-${n}` }));
    f.parada.vinculos = f.itinerarios['line-0'].padroesV2.map((p: any) => ({ linhaId: 'line-0', sentidoId: 'ida', padraoVersaoId: p.padraoVersaoId }));
    assert.equal(configurarRadarRemoto(f, ['line-0'], [], 10)?.contextos.length ?? null, count === 40 ? 40 : null);
  }
});
