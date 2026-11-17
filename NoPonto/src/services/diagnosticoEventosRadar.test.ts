import test from 'node:test';
import assert from 'node:assert/strict';
import { criarDiagnosticoEventosRadar } from './diagnosticoEventosRadar';
import type { EventoParadaDto } from './eventosParada';

const event = (id: string, eta: number | null): EventoParadaDto => ({ eventId: id, vehicleId: id,
  linhaId: '838', codigoLinha: '838', paradaId: 'stop', sentidoId: 'ida', padraoVersaoId: 'v1',
  padraoOperacionalId: 'p1', ocorrenciaParadaPadraoId: 'occ', modal: 'onibus', tipoRota: 'onibus',
  eventType: 'ARRIVAL', source: 'PhysicalCausal', quality: 'estimativa_fisica', isEstimated: true,
  secondsUntilEvent: eta, lastRealtimeEvidenceUtc: '2026-11-16T12:00:00Z',
  predictionValidUntilUtc: '2026-11-16T12:01:30Z' });

test('Radar trace preserves the full 4 to 14 to 4 sequence and resets on stop switch', () => {
  const trace = criarDiagnosticoEventosRadar(); trace.select('context', 'stop');
  const ticket = trace.ticket('stop');
  for (const [i, ids] of [['near','far'],['far'],['near','far']].entries()) {
    const events = ids.map(id => event(id, id === 'near' ? 240-i*30 : 840-i*30));
    trace.response('stop', ticket, i*30000, i*30000+1, 200, true, events);
    trace.selection('context', events, { at: i*30000+2, displayed: [ids[0]], physical: [],
      events: events.map(e => ({ id: e.eventId, eta: e.secondsUntilEvent!, reason: null })) });
  }
  const data = JSON.parse(trace.json());
  assert.deepEqual(data.samples.map((s: any) => s.selections[0].displayed), [['near'],['far'],['near']]);
  assert.deepEqual(data.samples[1].absent, ['near']);
  assert.deepEqual(data.samples[0].events.map((e: any) => e.secondsUntilEvent), [240,840]);
  assert.equal(data.samples[2].events[0].secondsUntilEvent,180);
  trace.select('context-with-updated-metadata','stop');
  assert.equal(JSON.parse(trace.json()).samples.length,3);
  for (let i=0;i<20;i++) trace.response('stop',ticket,i,i,200,true,[event('near',100)]);
  assert.equal(JSON.parse(trace.json()).samples.length,15);
  trace.select('other-context','other-stop');
  trace.response('stop',ticket,0,0,200,true,[event('near',240)]);
  assert.deepEqual(JSON.parse(trace.json()).samples,[]);
});

test('Radar trace distinguishes omission, no ETA and frontend filtering without sensitive payloads', () => {
  const trace=criarDiagnosticoEventosRadar(); trace.select('context','stop'); const ticket=trace.ticket('stop');
  trace.response('stop',ticket,0,1,200,true,[event('omitted',240)]);
  const events=[event('no-eta',null),event('filtered',240),event('shown',840)];
  Object.assign(events[0],{latitude:123,longitude:456,token:'secret',headers:{Authorization:'secret'}});
  trace.response('stop',ticket,30,31,200,true,events);
  trace.selection('context',events,{at:32,displayed:['shown'],physical:['physical-key'],events:[
    {id:'no-eta',eta:null,reason:'eta_indisponivel_ou_passado'},
    {id:'filtered',eta:240,reason:'vinculo_operacional_incompativel'},
    {id:'shown',eta:840,reason:null}]});
  trace.selection('context',events,{at:33,displayed:['shown'],physical:['physical-key'],events:[
    {id:'no-eta',eta:null,reason:'eta_indisponivel_ou_passado'},
    {id:'filtered',eta:239,reason:'vinculo_operacional_incompativel'},
    {id:'shown',eta:839,reason:null}]});
  const json=trace.json(), sample=JSON.parse(json).samples[1];
  assert.deepEqual(sample.absent,['omitted']);
  assert.deepEqual(sample.selections[0].outcomes.map((e: any)=>[e.id,e.state]),
    [['no-eta','sem_eta'],['filtered','filtrado_frontend'],['shown','exibido']]);
  assert.equal(sample.selections.length,1); assert.equal(sample.selections[0].at,33);
  assert.ok(!/latitude|longitude|token|Authorization|secret/.test(json));
  trace.response('stop',ticket,40,41,503,false,[]);
  trace.selection('context',events,{at:42,displayed:['shown'],physical:[],events:[]});
  const failed=JSON.parse(trace.json()).samples.at(-1);
  assert.equal(failed.status,503); assert.deepEqual(failed.absent,[]);
  assert.deepEqual(failed.selections[0].displayed,['shown']);
});
