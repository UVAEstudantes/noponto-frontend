const test = require('node:test');
const assert = require('node:assert/strict');
const { pedidoProgramacao, mensagemProgramacao } = require('./radarProgramacoes.ts');
const p = { nome: '', fuso: 'America/Fortaleza', horaLocal: '08:30', dataLocal: '2026-12-20', dias: [1,2], estado: 'ativa', revisao: 3,
 configuracao: { paradaId: 'outra-parada', contextos: [{ linhaId: 'linha', sentidoId: 'ida', padraoOperacionalId: 'op', padraoVersaoId: 'v' }], linhasSelecionadas: ['linha'], linhasPrioritarias: ['linha'], antecedenciaMinutos: 2 } };
test('serializa execucao unica com TimeOnly, DateOnly, revisao e configuracao independente', () => {
 const before = JSON.stringify(p); const r = pedidoProgramacao(p);
 assert.deepEqual(r, { nome: 'Radar 08:30', fuso: 'America/Fortaleza', horaLocal: '08:30:00', dataLocal: '2026-12-20', dias: [], ativa: true, revisaoEsperada: 3, configuracao: { ...p.configuracao, revisaoEsperada: 0, sessaoId: null } });
 assert.equal(JSON.stringify(p), before);
});
test('semanal preserva DayOfWeek e pausa usa ativa false', () => {
 const r = pedidoProgramacao({ ...p, dataLocal: null, dias: [0,6], estado: 'pausada' });
 assert.deepEqual(r.dias, [0,6]); assert.equal(r.dataLocal, null); assert.equal(r.ativa, false);
});
test('conflito e revisao exibem recuperacao clara', () => {
 assert.match(mensagemProgramacao({code:'horarios_sobrepostos'}), /adjacentes/);
 assert.match(mensagemProgramacao({code:'revisao_desatualizada'}), /confira/);
 assert.match(mensagemProgramacao({code:'permissao_negada'}), /notificações/);
});
const { conflitoVisual } = require('./radarProgramacoes.ts');
test('conflito visual permite adjacentes e encontra sobreposicao na virada semanal', () => {
 const a = {...p, id:'a', dataLocal:null, dias:[6], horaLocal:'23:30', estado:'ativa'};
 assert.equal(conflitoVisual(a,{...a,id:'b',dias:[0],horaLocal:'00:30'}),false);
 assert.equal(conflitoVisual(a,{...a,id:'b',dias:[0],horaLocal:'00:15'}),true);
 assert.equal(conflitoVisual(a,{...a,id:'b',estado:'pausada'}),false);
 assert.equal(conflitoVisual(a,a),false);
});
