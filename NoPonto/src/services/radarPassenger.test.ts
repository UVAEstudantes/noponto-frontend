import assert from 'node:assert/strict';
import test from 'node:test';
import {passengerRadar,physicalPassengerLabel} from './radarPassenger';
import type {TerminalRadarVehicle} from './terminalTracking';
const now=1000000;
const bus=(key:string,extra:Partial<TerminalRadarVehicle>={}):TerminalRadarVehicle=>({key,order:key,lineId:'838',code:'838',physicalAt:now,validUntil:now+480000,terminalId:'origin',terminalName:'Terminal',state:'No terminal',knownPattern:'out',corridors:[],operationalConfirmed:false,...extra});
const keys=(r:ReturnType<typeof passengerRadar>)=>r.map(r=>r.kind==='physical'?r.vehicle.key:r.arrival.id);

test('chegada iminente precede previsao de 79 minutos mesmo com distancia maior',()=>{
 const events=[{id:'855-longe',linhaId:'855',etaSeg:4740,distanciaMetros:100},
  {id:'838-perto',linhaId:'838',etaSeg:60,distanciaMetros:800}];
 assert.deepEqual(keys(passengerRadar([],events,'stop',now,2)),['838-perto','855-longe']);
});
test('terminal prioritizes proven dwell then numeric line and stable individual identity without inventing arrival time',()=>{
 const a=bus('a',{dwellSince:now-300000}),b=bus('b',{dwellSince:now-60000}),c=bus('c',{code:'855',lineId:'855'}),d=bus('d');
 const arrivals=[{id:'approach',linhaId:'838',codigo:'838',distanciaMetros:10}];
 assert.deepEqual(keys(passengerRadar([c,b,d,a],arrivals,'origin',now)),['a','b','d','c','approach']);
 assert.equal(physicalPassengerLabel(a),'No terminal há 5 min');assert.equal(physicalPassengerLabel(d),'Em espera');
 assert.equal(physicalPassengerLabel(bus('provisional',{state:'Na região da origem'})),'Localização incerta');
});
test('downstream ranks progressing route distance in stable 100 metre bands before waiting alternatives',()=>{
 const a=bus('a',{state:'A caminho',distanceToStopMetres:310}),b=bus('b',{state:'Saindo do terminal',distanceToStopMetres:390}),waiting=bus('wait',{dwellSince:now-300000,originToStopMetres:652});
 const events=[{id:'op',linhaId:'855',codigo:'855',distanciaMetros:900},{id:'no-gps',linhaId:'855',codigo:'855'}];
 assert.deepEqual(keys(passengerRadar([waiting,b,a],events,'next',now)),['a','b','wait','op','no-gps']);
 assert.deepEqual(keys(passengerRadar([{...a,distanceToStopMetres:395},{...b,distanceToStopMetres:305},waiting],events,'next',now,2)),['a','b']);
 assert.equal(passengerRadar([bus('unknown',{state:'A caminho'})],events,'next',now)[0].kind,'arrival');
});
for(const seconds of [179,180,299,300,301])test('physical radar original GPS boundary '+seconds+' seconds while operational arrival survives',()=>{
 const v=bus('v',{physicalAt:now-seconds*1000});const result=passengerRadar([v],[{id:'op',linhaId:'855'}],'next',now);
 assert.equal(result.some(r=>r.kind==='physical'),seconds<=300);assert.ok(result.some(r=>r.kind==='arrival'));
 assert.equal(v.physicalAt,now-seconds*1000);
});
test('one vehicle is reconciled without erasing confirmed terminal priority or valid events without GPS',()=>{
 const v=bus('same'),a={id:'op',linhaId:'838',ordem:'SAME',etaSeg:120,distanciaMetros:100};
 assert.deepEqual(keys(passengerRadar([v],[a],'origin',now)),['same']);
 assert.deepEqual(keys(passengerRadar([{...v,state:'A caminho',distanceToStopMetres:100}],[a],'next',now)),['op']);
 assert.equal(passengerRadar([v,{...v}],[],'origin',now).length,1);
});

test('operational arrivals without physical distance retain valid forecast order before unknown times',()=>{
 const events=[{id:'late',linhaId:'855',etaSeg:600},{id:'unknown',linhaId:'838'},{id:'early',linhaId:'838',estimatedAt:new Date(now+120000).toISOString()}];
 assert.deepEqual(keys(passengerRadar([],events,'next',now,2)),['early','late']);assert.deepEqual(keys(passengerRadar([],events,'next',now)),['early','late','unknown']);
});

test('Itapecuru A: confirmed 838 at origin 652m precedes valid distant 884 arrivals of 100 and 154 minutes',()=>{
 const parked=bus('D86169',{originToStopMetres:652,dwellSince:now-180000});
 const events=[{id:'884a',linhaId:'884',codigo:'884',etaSeg:6000,distanciaMetros:10000},{id:'884b',linhaId:'884',codigo:'884',etaSeg:9240,distanciaMetros:14000}];
 assert.deepEqual(keys(passengerRadar([parked],events,'next',now,2)),['D86169','884a']);assert.deepEqual(keys(passengerRadar([parked],events,'next',now)),['D86169','884a','884b']);
});
test('downstream B G: observed departure keeps identity and beats waiting only after a meaningful route advance',()=>{
 const parked=bus('waiting',{originToStopMetres:652,dwellSince:now-480000});let moving=bus('departing',{originToStopMetres:652,dwellSince:now-180000});
 assert.deepEqual(keys(passengerRadar([moving,parked],[],'next',now)),['waiting','departing']);
 moving={...moving,state:'Saindo do terminal',dwellSince:undefined,distanceToStopMetres:630};assert.deepEqual(keys(passengerRadar([moving,parked],[],'next',now)),['waiting','departing']);
 moving={...moving,state:'A caminho',distanceToStopMetres:200};assert.deepEqual(keys(passengerRadar([moving,parked],[],'next',now)),['departing','waiting']);
 moving={...moving,distanceToStopMetres:220};assert.deepEqual(keys(passengerRadar([parked,moving],[],'next',now)),['departing','waiting']);assert.equal(moving.order,'departing');
});
test('terminal C D E: eight observed minutes precedes three then numeric line and stable identity before provisional presence',()=>{
 const vehicles=[bus('z',{code:'855',lineId:'855',dwellSince:now-180000}),bus('b',{dwellSince:now-180000}),bus('a',{dwellSince:now-180000}),bus('long',{dwellSince:now-480000}),bus('provisional',{state:'Na região da origem'})];
 assert.deepEqual(keys(passengerRadar(vehicles,[],'origin',now)),['long','a','b','z','provisional']);
});
test('downstream F I: a valid forecast cannot erase a still valid confirmed dwell and expiry cannot be hidden',()=>{
 const v=bus('D86169',{originToStopMetres:652});const a={id:'same',linhaId:'838',ordem:'D86169',etaSeg:6000,distanciaMetros:10000};
 const result=passengerRadar([v],[a,{id:'unknown',linhaId:'884',etaSeg:100}], 'next',now);assert.deepEqual(keys(result),['D86169','unknown']);assert.equal(result[0].kind,'physical');if(result[0].kind==='physical')assert.equal(result[0].arrival,a);
 assert.deepEqual(keys(passengerRadar([{...v,physicalAt:now-301000}],[a],'next',now)),['same']);
});
test('unknown or incompatible route distances never promote a remote arrival over confirmed waiting',()=>{
 const v=bus('waiting');const events=[{id:'wrong-stop',linhaId:'884',paradaId:'other',etaSeg:60,distanciaMetros:1},{id:'unknown',linhaId:'855',etaSeg:30}];
 assert.deepEqual(keys(passengerRadar([v],events,'next',now)),['waiting','unknown','wrong-stop']);
});

test('distinct operational passages remain in full radar even when they share a vehicle identity',()=>{const a={id:'first-service',linhaId:'884',ordem:'same-bus',etaSeg:6000,distanciaMetros:10000},b={...a,id:'later-service',etaSeg:9240,distanciaMetros:14000};assert.deepEqual(keys(passengerRadar([],[b,a,a],'next',now)),['first-service','later-service']);});
