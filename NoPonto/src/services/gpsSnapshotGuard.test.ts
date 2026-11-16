import assert from 'node:assert/strict';
import test from 'node:test';
import { GpsSnapshotGuard } from './gpsSnapshotGuard';
import { adaptarPosicaoRodoviariaV2 as adapt } from './veiculosMapa';
const at=Date.now()-1000;
const raw={ordem:'A2-001',codigoLinha:'898',tipoRota:'onibus' as const,linhaId:'line',sentidoId:'out',latitude:-22.9,longitude:-43.5,velocidade:12,timestampGps:new Date(at).toISOString(),timestampServidor:new Date(at).toISOString(),status:0};
test('equal GPS accepts signal loss once without physical mutation or active replay',()=>{
 const g=new GpsSnapshotGuard(),active=adapt(raw);g.filtrarSnapshot([active],at);
 const lost=g.filtrarSnapshot([adapt({...raw,status:1,velocidade:0})],at+30000)[0];
 assert.equal(lost.status,1);assert.equal((lost.raw as typeof raw)?.status,1);assert.equal(lost.atualizadoEm,active.atualizadoEm);assert.equal(lost.velocidade,12);assert.equal(lost.latitude,active.latitude);
 assert.equal(g.filtrarSnapshot([active],at+31000)[0].status,1);
 assert.equal(g.filtrarSnapshot([adapt({...raw,timestampGps:new Date(at+32000).toISOString()})],at+32000)[0].status,0);
});
test('metadata cannot bypass coordinate identity line and removal fences',()=>{
 for(const patch of [{longitude:1},{linhaId:'other'},{sentidoId:'back'},{tipoRota:'brt' as const},{codigoLinha:'838'}]){
 const g=new GpsSnapshotGuard(),active=adapt(raw);g.filtrarSnapshot([active],at);
 const result=g.filtrarSnapshot([adapt({...raw,...patch,status:1})],at+1000);assert.ok(result.length===0||result[0]===active);
 }
 const g=new GpsSnapshotGuard();g.filtrarSnapshot([adapt(raw)],at);g.registrarVazio('898');assert.deepEqual(g.filtrarSnapshot([adapt({...raw,status:1})],at+1000),[]);
});
test('regressive GPS cannot downgrade or revive newer evidence',()=>{
 const g=new GpsSnapshotGuard();g.filtrarSnapshot([adapt(raw)],at);
 assert.deepEqual(g.filtrarSnapshot([adapt({...raw,status:1,timestampGps:new Date(at-1000).toISOString()})],at),[]);
 assert.equal(g.filtrarSnapshot([adapt(raw)],at)[0].status,0);
});

test('same batch status ordering is deterministic without renewing GPS',()=>{
 for(const reversed of [false,true]){
  const g=new GpsSnapshotGuard(),a=adapt(raw),b=adapt({...raw,status:1});
  const result=g.filtrarSnapshot(reversed?[b,a]:[a,b],at);
  assert.equal(result.length,1);assert.equal(result[0].status,1);assert.equal(result[0].atualizadoEm,raw.timestampGps);
 }
});
