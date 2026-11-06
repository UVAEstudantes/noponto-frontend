import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptUnified, composeUnifiedLines, composeUnifiedSnapshots, type UnifiedSnapshot } from './unifiedLocationContract';

const now = Date.parse('2026-10-29T12:00:00Z');
const snapshot = (): UnifiedSnapshot => ({ schemaVersion: 1, enabled: true, lineCode: '838', revision: 2, composedAt: new Date(now).toISOString(), vehicles: [{
  key: 'onibus:SPPO:A12345', order: 'A12345', line: { lineId: 'line', serviceCode: '838', state: 1 },
  location: { latitude: .002, longitude: .003, physicalAt: new Date(now - 48000).toISOString(), validUntil: new Date(now + 552000).toISOString(), source: 'ITS_CURRENT', provider: 'ZIRIX', uncertain: false, reason: 'newest_validated' },
  operational: { timestampGps: new Date(now - 155000).toISOString() }, spatial: { facilityStopId: null, state: 'Outside' }, motionEligible: false }] });
test('unified contract rejects stale revisions malformed coordinates and duplicate identities', () => {
  const current = snapshot(); assert.ok(acceptUnified(current, null));
  assert.equal(acceptUnified({ ...current, revision: 1 }, current), false);
  assert.ok(acceptUnified({ ...current, revision: 0, enabled: false, vehicles: [] }, current));
  assert.equal(acceptUnified({ ...current, composedAt: new Date(now - 1).toISOString() }, current), false);
  assert.equal(acceptUnified({ ...current, vehicles: [...current.vehicles, ...current.vehicles] }, null), false);
  current.vehicles[0].location.latitude = NaN; assert.equal(acceptUnified(current, null), false);
});
test('838 composition replaces source arbitration preserves other lines and never projects ITS', () => {
  const lines = [{ nome: '838', modal: 'onibus', linhaId: 'line', cor: '#abcd00', segmentos: [[[0, 0], [0, .01]]] as [number, number][][],
    posicoes: [{ id: 'A12345', latitude: 0, longitude: 0, velocidade: 40, posicaoNaRota: .3, padraoVersaoId: 'old' }] },
  { nome: '898', modal: 'onibus', posicoes: [] }];
  const result = composeUnifiedLines(lines, snapshot(), now); const p = result[0].posicoes![0];
  assert.equal(p.longitude, .003); assert.equal(p.latitude, .002); assert.equal(p.velocidade, undefined); assert.equal(p.posicaoNaRota, null);
  assert.equal(p.backendUnified, true); assert.equal(result[0].cor, '#abcd00'); assert.equal(result[0].segmentos, lines[0].segmentos);
  assert.equal(result[1], lines[1]); assert.equal(composeUnifiedLines(lines, null, now), lines);
  assert.equal(composeUnifiedLines(lines, snapshot(), now + 600000)[0].posicoes!.length, 0);
});
test('GTFS motion uses its own confirmed projection instead of an older native snapshot', () => {
  const s = snapshot(); const v = s.vehicles[0]; v.location.source = 'GTFSRT_BUS'; v.motionEligible = true;
  v.operational = { timestampGps: v.location.physicalAt, velocidade: 18, velocidadeMedia: 20, posicaoNaRota: .4, padraoVersaoId: 'confirmed' };
  const result = composeUnifiedLines([{ nome: '838', modal: 'onibus', linhaId: 'line', posicoes: [{id:'A12345',posicaoNaRota:.1,velocidade:40}] }],s,now);
  assert.equal(result[0].posicoes![0].posicaoNaRota,.4); assert.equal(result[0].posicoes![0].velocidade,18);
  assert.equal(result[0].posicoes![0].padraoVersaoId,'confirmed'); assert.equal(result[0].posicoes![0].backendMotionEligible,true);
});


test('843 ITS-only projection keeps shape and strips unconfirmed operational metadata', () => {
  const s = snapshot(); s.lineCode = '843'; s.vehicles[0].line.serviceCode = '843'; s.vehicles[0].operational = null;
  const lines = [{nome:'843',modal:'onibus',linhaId:'line',cor:'#123456',segmentos:[] as [number,number][][],
    posicoes:[{id:'A12345',sentidoNome:'stale direction',sentidoId:'stale',padraoOperacionalId:'stale',proximaParadaNome:'stale stop',velocidade:20}]}];
  const result = composeUnifiedSnapshots(lines,[s],now); const p = result[0].posicoes![0];
  assert.equal(p.latitude,.002); assert.equal(p.unifiedSource,'ITS_CURRENT'); assert.equal(p.velocidade,undefined);
  assert.equal(p.sentidoNome,undefined); assert.equal(p.sentidoId,null); assert.equal(p.padraoOperacionalId,null); assert.equal(p.proximaParadaNome,null);
  assert.equal(p.presencaRotulo,'GPS disponível'); assert.equal(p.physicalOnly,true);
  assert.equal(result[0].cor,lines[0].cor); assert.equal(result[0].segmentos,lines[0].segmentos);
});

test('cohort revisions never compare across lines and delayed transfer has only one identity', () => {
  const a = snapshot(); const b = snapshot(); b.lineCode='843'; b.revision=1; b.vehicles[0].line.serviceCode='843'; b.vehicles[0].line.lineId='other';
  b.vehicles[0].location.physicalAt=new Date(now-10000).toISOString();
  assert.ok(acceptUnified(b,null)); assert.equal(acceptUnified(b,a),false);
  const lines=[{nome:'838',modal:'onibus',linhaId:'line'}, {nome:'843',modal:'onibus',linhaId:'other'}];
  for (const sequence of [[a,b],[b,a]]) {
    const r=composeUnifiedSnapshots(lines,sequence,now); assert.equal(r[0].posicoes!.length,0); assert.equal(r[1].posicoes!.length,1);
  }
  b.vehicles[0].location.physicalAt=a.vehicles[0].location.physicalAt;
  assert.equal(composeUnifiedSnapshots(lines,[a,b],now).flatMap(l=>l.posicoes??[]).length,0);
});

test('843 line expiry conflict and GPS expiry remove marker without restoring stale operations', () => {
  const s=snapshot(); s.lineCode='843'; s.vehicles[0].line.serviceCode='843';
  const lines=[{nome:'843',modal:'onibus',linhaId:'line',posicoes:[{id:'A12345',latitude:0,longitude:0}]}];
  s.vehicles[0].line.validatedAt=new Date(now-600000).toISOString();
  assert.equal(composeUnifiedLines(lines,s,now)[0].posicoes!.length,0);
  delete s.vehicles[0].line.validatedAt; s.vehicles[0].line.state=4;
  assert.equal(composeUnifiedLines(lines,s,now)[0].posicoes!.length,0);
  s.vehicles[0].line.state=1; assert.equal(composeUnifiedLines(lines,s,now+610000)[0].posicoes!.length,0);
});
