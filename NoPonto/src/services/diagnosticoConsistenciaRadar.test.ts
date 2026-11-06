import test from 'node:test';
import assert from 'node:assert/strict';
import { compararSnapshotsRadar, type SnapshotDiagnosticoRadar } from './diagnosticoConsistenciaRadar';
import { eventosValidosRadar } from './radarParada';
import { chegadasDoRadar } from './apresentacaoRadar';
import { passengerRadar } from './radarPassenger';
import type { TerminalPresence } from './terminalTracking';
import type { EventoParadaDto } from './eventosParada';

const agora=Date.parse('2026-11-06T12:00:00Z');
const e:EventoParadaDto={eventId:'838a',vehicleId:'bus-a',expectedRunId:'viagem-a',linhaId:'838',codigoLinha:'838',
  paradaId:'bom-repouso',sentidoId:'ida',padraoVersaoId:'v',padraoOperacionalId:'op',ocorrenciaParadaPadraoId:'oc',
  eventType:'ARRIVAL',modal:'onibus',tipoRota:'onibus',secondsUntilEvent:120,source:'RealtimeEstimated',quality:'OperationalEstimate',isEstimated:true};
function snapshot(eventos=[e]):SnapshotDiagnosticoRadar{
  return {parada:{parada:{paradaId:'bom-repouso',nome:'Bom Repouso',latitude:0,longitude:0,ordem:1,posicaoLinha:0},
    distancia:0,vinculos:[{linhaId:'838',sentidoId:'ida',padraoVersaoId:'v',padraoOperacionalId:'op',destino:'Terminal'}]},
    contextoConsulta:'bom-repouso:ida:v:op',statusConsulta:'sucesso',eventos,eventosRecebidos:eventos,recebidoEm:agora,agora};
}
const espera={paradaId:'outra-parada',estado:'pausado',previa:null};

test('mesmo evento nos dois paineis usa instante recebido e ETA identicos',()=>{
  const s=snapshot();s.agora+=30000;
  const r=compararSnapshotsRadar(s,s,espera);
  assert.equal(r.compacto!.eventos[0].etaApresentado,90);assert.equal(r.completo.eventos[0].etaApresentado,90);
  assert.equal(r.diferencas[0].motivo,'mesma_previsao');assert.equal(r.completo.eventos[0].previstoEm,agora+120000);
  assert.equal(r.completo.eventos[0].viagemId,'viagem-a');assert.equal(r.completo.eventos[0].ocorrenciaId,'oc');
  assert.equal(r.espera.paradaId,'outra-parada');assert.equal(r.espera.candidatos.length,0);
});

test('dois veiculos da mesma linha permanecem distintos e compacto resume prefixo completo',()=>{
  const s=snapshot([e,{...e,eventId:'838b',vehicleId:'bus-b',expectedRunId:'viagem-b',secondsUntilEvent:180}]);
  const chegadas=chegadasDoRadar(s.eventos,s.parada,[],s.recebidoEm,s.agora,[],[]);
  assert.deepEqual(chegadas.map(c=>[c.id,c.vehicleId,c.etaSeg]),[['838a','bus-a',120],['838b','bus-b',180]]);
  assert.deepEqual(passengerRadar([],chegadas,'bom-repouso',s.agora,2),passengerRadar([],chegadas,'bom-repouso',s.agora).slice(0,2));
});

test('diagnostico distingue relogio resposta contexto e exclusao por frescor',()=>{
  const original=snapshot(),maisTarde={...original,agora:agora+30000};
  const relogio=compararSnapshotsRadar(original,maisTarde,espera);
  assert.equal(relogio.diferencas[0].motivo,'instantes_ou_elegibilidade_distintos');
  assert.equal(relogio.compacto!.eventos[0].etaNaReferenciaComum,relogio.completo.eventos[0].etaNaReferenciaComum);
  assert.equal(compararSnapshotsRadar(original,{...maisTarde,recebidoEm:agora+30000},espera).diferencas[0].motivo,'previsao_alterada_entre_snapshots');
  assert.equal(compararSnapshotsRadar(original,{...maisTarde,contextoConsulta:'outra'},espera).diferencas[0].motivo,'contextos_distintos');
  assert.equal(compararSnapshotsRadar(original,snapshot([{...e,expectedRunId:'outra-viagem'}]),espera).diferencas[0].motivo,'identidade_contexto_ou_tipo_alterados');
  const antigo={...original,agora:agora+300001,eventos:[]};
  assert.equal(compararSnapshotsRadar(original,antigo,espera).completo.eventos[0].motivo,'consulta_vencida_ou_invalida');
});

test('diagnostico limita comparacao a doze eventos e duas vagas compactas',()=>{
  const s=snapshot(Array.from({length:50},(_,i)=>({...e,eventId:String(i),vehicleId:String(i)})));
  const r=compararSnapshotsRadar(s,s,espera);
  assert.equal(r.completo.totalRecebidos,50);assert.equal(r.completo.eventos.length,12);assert.equal(r.compacto!.exibidos.length,2);
  assert.equal(r.completo.exibidos.length,12);assert.equal(r.endpoint,'/paradas/bom-repouso/eventos');
});

test('diagnostico separa presenca fisica de ETA operacional',()=>{
  const s=snapshot();
  const v:TerminalPresence={key:'fisico',lineId:'838',order:'bus-a',code:'838',physicalAt:agora,validUntil:agora+60000,
    terminalId:'bom-repouso',terminalName:'Terminal',state:'No terminal',knownPattern:'v',operationalConfirmed:true,
    corridors:[{pattern:'v',originId:'bom-repouso',originName:'Terminal',stops:[],coords:[]}]};
  const r=compararSnapshotsRadar(s,s,espera,[v]);
  assert.equal(r.completo.exibidos.length,1);assert.equal(r.completo.exibidos[0].tipo,'presenca_fisica');
  assert.equal('etaSeg' in r.completo.exibidos[0],false);
  assert.equal(r.completo.eventos[0].motivo,'fora_do_resumo_ou_reconciliado_com_presenca');
});

test('operacao sentido e versao incompatíveis invalidam eventos sem confundir viagem',()=>{
  const s=snapshot();
  for(const mudanca of [{sentidoId:'volta'},{padraoVersaoId:'v2'},{padraoOperacionalId:'op2'},{paradaId:'outra'}])
    assert.deepEqual(eventosValidosRadar([{...e,...mudanca}],s.parada,s.recebidoEm,s.agora),[]);
  const outraViagem={...e,eventId:'mesmo-onibus-outra-viagem',expectedRunId:'viagem-b'};
  assert.deepEqual(eventosValidosRadar([e,outraViagem],s.parada,s.recebidoEm,s.agora).map(e=>e.eventId),['mesmo-onibus-outra-viagem','838a'].sort((a,b)=>a.localeCompare(b)));
});
