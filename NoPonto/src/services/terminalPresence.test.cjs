/* global __dirname */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const cache = new Map();
function load(file) {
  const filename = path.resolve(file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const m = new Module(filename, module); cache.set(filename, m); m.paths = module.paths;
  m.require = id => {
    if (id.startsWith('@/')) return load(path.join(__dirname, '../..', id.slice(2)) + '.ts');
    if (id.startsWith('.')) return load(path.resolve(path.dirname(filename), id) + '.ts');
    return require(id);
  };
  m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  }}).outputText, filename);
  return m.exports;
}
const maps = load(path.join(__dirname, 'veiculosMapa.ts'));
const now = Date.parse('2026-10-14T12:00:00Z');
const raw = () => ({ordem:'SYNTHETIC',codigoLinha:'006',linhaId:'line',sentidoId:null,
  padraoVersaoId:null,latitude:-22,longitude:-43,velocidade:0,
  timestampGps:new Date(now).toISOString(),timestampServidor:new Date(now).toISOString()});
const options = {enabled:true,now,lineCode:'006',lineId:'line'};
test('RED regression: real filter retains recent physical presence with missing matching only in selected line', () => {
  const vehicle = maps.adaptarPosicaoRodoviariaV2(raw());
  assert.equal(maps.filtrarVeiculosPorPadroesVisiveis([vehicle],new Set(['visible']),options).length,1);
});
const presence = load(path.join(__dirname,'roadPresence.ts'));
const vehicle = () => maps.adaptarPosicaoRodoviariaV2({...raw(),padraoVersaoId:'a',padraoOperacionalId:'pa',sentidoId:'A',posicaoNaRota:.99});
const structure = (direction='A') => ({linhaId:'line',padraoVersaoId:direction==='A'?'a':'b',
  padraoOperacionalId:direction==='A'?'pa':'pb',sentidoId:direction,topologia:'LINEAR',
  ocorrencias:[{ordem:1,posicaoLinha:0,latitude:-22,longitude:direction==='A'?-43.01:-43},
    {ordem:2,posicaoLinha:.5,latitude:-22,longitude:-43.005},
    {ordem:3,posicaoLinha:.999,latitude:-22,longitude:direction==='A'?-43:-43.01}]});
const project = (v,s,prior,t=now) => presence.projectRoadPresence(v,s,prior,t);

test('GPS delay preserves the last confirmed terminal observation',()=>{
  const v=vehicle(),s=structure();
  const first=project(v,s);
  const observed={...v,atualizadoEm:new Date(now+1000).toISOString()};
  const confirmed=project(observed,s,first.evidence,now+1000);
  const delayed=project(observed,s,confirmed.evidence,now+182000);
  assert.equal(delayed.presentation.presencaEstado,'fim_percurso');
  assert.equal(delayed.presentation.gpsAtrasado,true);
  assert.match(delayed.presentation.presencaRotulo,/Última observação/);
  assert.equal(observed.atualizadoEm,new Date(now+1000).toISOString());
});

for (const seconds of [60,120,179,180,181,299,300,301]) {
  test(`GPS policy at ${seconds}s separates warning from retention`,()=>{
    const v=vehicle(),s=structure();
    const initial=project({...v,atualizadoEm:new Date(now-1000).toISOString()},s,undefined,now-1000);
    const confirmed=project(v,s,initial.evidence);
    const snapshot=JSON.stringify(v);
    const quality=presence.gpsTemporalQuality(v,now+seconds*1000);
    assert.equal(quality.ageMs,seconds*1000);
    assert.equal(quality.delayed,seconds>=180);
    assert.equal(quality.retained,seconds<=300);
    const aged=project(v,s,confirmed.evidence,now+seconds*1000);
    if(seconds>300) assert.equal(aged,null);
    else {
      assert.equal(aged.presentation.presencaEstado,'fim_percurso');
      assert.equal(aged.presentation.presencaIdadeSegundos,seconds);
      assert.equal(aged.presentation.gpsAtrasado,seconds>=180);
      assert.equal(aged.evidence.count,2);
      if(seconds>=180) assert.match(aged.presentation.presencaRotulo,/Última observação: fim do percurso/);
    }
    assert.equal(JSON.stringify(v),snapshot);
  });
}

test('stopped GPS cannot prove travel and resumption requires physical route progress',()=>{
  const s=structure(),v={...vehicle(),longitude:-43.006,posicaoNaRota:.4,velocidade:20};
  const a=project(v,s);
  const b=project({...v,atualizadoEm:new Date(now+1000).toISOString()},s,a.evidence,now+1000);
  assert.equal(b.presentation.presencaEstado,'indeterminado');
  const moving={...v,longitude:-43.005,posicaoNaRota:.5,atualizadoEm:new Date(now+2000).toISOString()};
  const c=project(moving,s,b.evidence,now+2000);
  assert.equal(c.presentation.presencaEstado,'em_viagem');
  const delayed=project(moving,s,c.evidence,now+182000);
  assert.equal(delayed.presentation.presencaEstado,'em_viagem');
  assert.equal(delayed.presentation.gpsAtrasado,true);
  const resumed=project({...moving,longitude:-43.004,posicaoNaRota:.6,atualizadoEm:new Date(now+183000).toISOString()},s,delayed.evidence,now+183000);
  // The visual retention extension does not extend operational evidence memory.
  assert.equal(resumed.presentation.presencaEstado,'indeterminado');
  assert.equal(resumed.presentation.gpsAtrasado,false);
  const next=project({...moving,longitude:-43.003,posicaoNaRota:.7,atualizadoEm:new Date(now+184000).toISOString()},s,resumed.evidence,now+184000);
  assert.equal(next.presentation.presencaEstado,'em_viagem');
});

test('regressive timestamps and same-time direction changes cannot replace evidence',()=>{
  const v=vehicle(),s=structure(),a=project(v,s);
  assert.equal(project({...v,atualizadoEm:new Date(now-1000).toISOString()},s,a.evidence),null);
  assert.equal(project({...v,sentidoId:'B'},structure('B'),a.evidence),null);
  for(let i=1;i<=5;i++) {
    const repeated=project(v,s,a.evidence,now+i*1000);
    assert.equal(repeated.evidence.count,1);
    assert.equal(repeated.presentation.presencaEstado,'indeterminado');
  }
});

test('departure cannot inherit arrival from a distant terminal or mismatched topology',()=>{
  const v=vehicle(),s=structure();
  const a=project({...v,atualizadoEm:new Date(now-1000).toISOString()},s,undefined,now-1000);
  const arrived=project(v,s,a.evidence);
  const far={...v,longitude:-44,sentidoId:'B',padraoVersaoId:'b',padraoOperacionalId:'pb',posicaoNaRota:0};
  const farStructure=structure('B'); farStructure.ocorrencias[0].longitude=-44;
  let e=arrived.evidence;
  for (let i=1;i<=2;i++) {
    const p=project({...far,atualizadoEm:new Date(now+i*1000).toISOString()},farStructure,e,now+i*1000);
    assert.equal(p.presentation.presencaEstado,'indeterminado'); e=p.evidence;
  }
  for(const invalid of [{...s,topologia:'CIRCULAR'},{...s,linhaId:'other'},{...s,padraoVersaoId:'other'}]) {
    let p=project(v,invalid);
    p=project({...v,atualizadoEm:new Date(now+1000).toISOString()},invalid,p.evidence,now+1000);
    assert.equal(p.presentation.presencaEstado,'indeterminado');
  }
});

for(const screen of ['index','linhas']) {
  test(`screen ${screen} passes GPS quality and original timestamp to the WebView`,()=>{
    const filename=path.resolve(__dirname,`../../app/${screen}.tsx`);
    const source=ts.createSourceFile(filename,fs.readFileSync(filename,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    let mapper;
    function visit(node) {
      if(ts.isPropertyAssignment(node) && node.name.getText(source)==='posicoes'
        && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(source)==='veiculos.map')
        mapper=node.initializer.arguments[0].getText(source);
      ts.forEachChild(node,visit);
    }
    visit(source);assert.equal(typeof mapper,'string');
    const callback=new Function('l','itinerarioSentidoMap','padraoSelecionado','modalAtual',`return (${mapper});`)(
      {modal:'onibus'},{},null,'onibus');
    const v={...vehicle(),gpsAtrasado:true,presencaEstado:'fim_percurso',
      presencaRotulo:'Última observação: fim do percurso no terminal • GPS atrasado',presencaIdadeSegundos:120};
    const output=callback(v);
    assert.equal(output.gpsAtrasado,true);
    assert.equal(output.presencaEstado,'fim_percurso');
    assert.equal(output.presencaRotulo,v.presencaRotulo);
    assert.equal(output.presencaIdadeSegundos,120);
    assert.equal(output.timestamp,now);
    assert.equal(output.atualizadoEm,new Date(now).toISOString());
    assert.equal(output.latitude,-22);assert.equal(output.longitude,-43);
  });
}

test('OFF retains legacy filtering; scope never reintroduces another line or explicit opposite version',()=>{
  const v=maps.adaptarPosicaoRodoviariaV2(raw());
  assert.equal(maps.filtrarVeiculosPorPadroesVisiveis([v],new Set(['a'])).length,0);
  assert.equal(maps.filtrarVeiculosPorPadroesVisiveis([v],new Set(['a']),{...options,lineId:'other'}).length,0);
  assert.equal(maps.filtrarVeiculosPorPadroesVisiveis([{...v,codigoLinha:'999'}],new Set(['a']),options).length,0);
  assert.equal(maps.filtrarVeiculosPorPadroesVisiveis([{...v,padraoVersaoId:'opposite',sentidoId:'opposite-direction'}],new Set(['a']),options).length,0);
  assert.equal(maps.filtrarVeiculosPorPadroesVisiveis([{...v,linhaId:null}],new Set(['a']),options).length,1);
});
test('arrival and stopped arrival require two distinct GPS samples, repeated renders do not confirm',()=>{
  const v=vehicle(),s=structure();
  const first=project({...v,velocidade:10},s);
  assert.equal(first.presentation.presencaEstado,'indeterminado');
  const repeated=project(v,s,first.evidence);
  assert.equal(repeated.presentation.presencaEstado,'indeterminado');
  const second=project({...v,atualizadoEm:new Date(now+1000).toISOString()},s,first.evidence,now+1000);
  assert.equal(second.presentation.presencaEstado,'fim_percurso');
});
test('new departure direction requires prior confirmed arrival plus two consistent observations',()=>{
  let v=vehicle(),s=structure();
  let e=project(v,s).evidence;
  e=project({...v,atualizadoEm:new Date(now+1000).toISOString()},s,e,now+1000).evidence;
  v={...v,padraoVersaoId:'b',padraoOperacionalId:'pb',sentidoId:'B',posicaoNaRota:0,
    atualizadoEm:new Date(now+2000).toISOString()};
  const isolated=project(v,structure('B'),e,now+2000);
  assert.equal(isolated.presentation.presencaEstado,'indeterminado');
  const confirmed=project({...v,atualizadoEm:new Date(now+3000).toISOString()},structure('B'),isolated.evidence,now+3000);
  assert.equal(confirmed.presentation.presencaEstado,'aguardando_saida');
  const leaving=project({...v,velocidade:20,posicaoNaRota:.1,longitude:-43.002,atualizadoEm:new Date(now+4000).toISOString()},structure('B'),confirmed.evidence,now+4000);
  assert.equal(leaving.presentation.presencaEstado,'em_viagem');
});
test('zero speed outside terminal, missing geometry and isolated direction never fabricate departure or identity',()=>{
  const v={...vehicle(),longitude:-43.005,posicaoNaRota:.5};
  assert.equal(project(v,structure()).presentation.presencaEstado,'indeterminado');
  assert.equal(project({...v,padraoVersaoId:null},undefined).presentation.presencaEstado,'indeterminado');
  const origin={...v,longitude:-43,posicaoNaRota:0,sentidoId:'B',padraoVersaoId:'b',padraoOperacionalId:'pb'};
  const first=project(origin,structure('B'));
  assert.equal(project({...origin,atualizadoEm:new Date(now+1000).toISOString()},structure('B'),first.evidence,now+1000).presentation.presencaEstado,'indeterminado');
});
test('finite stale retention uses GPS time, never refreshes it with UI ticks',()=>{
  const v=vehicle();
  const stale=project(v,structure(),undefined,now+181000);
  assert.equal(stale.presentation.presencaEstado,'indeterminado');
  assert.equal(stale.presentation.gpsAtrasado,true);
  assert.equal(stale.presentation.presencaIdadeSegundos,181);
  assert.equal(project(v,structure(),stale.evidence,now+300001),null);
  assert.equal(project({...v,atualizadoEm:new Date(now+1).toISOString()},structure()),null);
});
test('arrival hysteresis uses physical GPS, no flicker at the 50m entrance boundary',()=>{
  const v=vehicle(),s=structure();let e=project(v,s).evidence;
  e=project({...v,atualizadoEm:new Date(now+1000).toISOString()},s,e,now+1000).evidence;
  const jitter=project({...v,longitude:-43.0007,atualizadoEm:new Date(now+2000).toISOString()},s,e,now+2000);
  assert.equal(jitter.presentation.presencaEstado,'fim_percurso');
  const stale=project({...v,atualizadoEm:new Date(now+1000).toISOString()},s,e,now+62000);
  const fresh=project({...v,longitude:-43.0007,atualizadoEm:new Date(now+63000).toISOString()},s,stale.evidence,now+63000);
  assert.equal(fresh.presentation.presencaEstado,'fim_percurso');
  assert.notEqual(project({...v,longitude:-43.002,atualizadoEm:new Date(now+3000).toISOString()},s,jitter.evidence,now+3000).presentation.presencaEstado,'fim_percurso');
});
test('temporary snapshot omission retains presence finitely without creating ETA or overwriting structure',()=>{
  const v=vehicle(),other={...v,idVisual:'road:other',id:'other'};
  const merged=maps.reconciliarSnapshotsRodoviarios([v],[other],{enabled:true,now});
  assert.equal(merged.length,2);
  assert.equal(merged.find(x=>x.idVisual===v.idVisual),v);
  assert.equal(maps.reconciliarSnapshotsRodoviarios([v],[other],{enabled:true,now:now+300001}).length,0);
  assert.equal(v.presencaEstado,undefined);
});
test('real WebView builder still produces valid JavaScript (TypeScript cannot check template contents)',()=>{
  const web=load(path.join(__dirname,'../components/mapOSM/webview/mapScript.ts'));
  const script=web.buildMapWebViewScript({latInicial:-22,lngInicial:-43,estilosJS:'',filtrosMapaJS:'',estiloMapaPadrao:'fixture'});
  assert.doesNotThrow(()=>new (require('node:vm').Script)(script));
});
test('expired arrival evidence, corrupt geometry and another line never confirm a departure',()=>{
  const v=vehicle(),s=structure();let e=project(v,s).evidence;
  e=project({...v,atualizadoEm:new Date(now+1000).toISOString()},s,e,now+1000).evidence;
  const later=now+181001;
  const other={...v,padraoVersaoId:'b',padraoOperacionalId:'pb',sentidoId:'B',posicaoNaRota:0,atualizadoEm:new Date(later).toISOString()};
  assert.equal(project(other,structure('B'),e,later).presentation.presencaEstado,'indeterminado');
  assert.equal(project(v,{...s,ocorrencias:[...s.ocorrencias].reverse().map((x,i)=>({...x,ordem:i+1}))}).presentation.presencaEstado,'indeterminado');
  assert.equal(project({...v,linhaId:null},s).presentation.presencaEstado,'indeterminado');
  assert.equal(presence.physicalAge({...v,latitude:NaN},now),null);
});
test('pending structural download retains raw presence but a loaded incompatible version stays filtered',()=>{
  const v=vehicle();
  assert.equal(maps.filtrarVeiculosPorPadroesVisiveis([v],new Set(['visible']),{...options,knownVersions:new Set()}).length,1);
  assert.equal(project(v,undefined).presentation.presencaEstado,'indeterminado');
  assert.equal(maps.filtrarVeiculosPorPadroesVisiveis([v],new Set(['visible']),{...options,knownVersions:new Set(['a'])}).length,0);
  assert.equal(maps.filtrarVeiculosPorPadroesVisiveis([v],new Set(['visible']),{
    ...options,knownVersions:new Set(),visibleDirections:new Set(['B'])}).length,0);
});
test('presence retention does not duplicate one physical vehicle when its observed line changes',()=>{
  const old=vehicle(),newer={...old,linha:'999',codigoLinha:'999',linhaId:'other-line'};
  const result=maps.reconciliarSnapshotsRodoviarios([old],[newer],{enabled:true,now});
  assert.deepEqual(result,[newer]);
  assert.equal(maps.reconciliarSnapshotsRodoviarios([old],[],{enabled:true,now:now+300001}).length,0);
});

test('partial terminal matching keeps same-line physical observation despite a known old version',()=>{
  const v=maps.adaptarPosicaoRodoviariaV2({...raw(),padraoVersaoId:'old-known',sentidoId:null});
  const scoped={...options,knownVersions:new Set(['old-known']),visibleDirections:new Set(['outbound'])};
  assert.equal(maps.filtrarVeiculosPorPadroesVisiveis([v],new Set(['outbound-version']),scoped).length,1);
  assert.equal(maps.filtrarVeiculosPorPadroesVisiveis([v],new Set(['outbound-version'])).length,0);
  assert.equal(maps.filtrarVeiculosPorPadroesVisiveis([{...v,codigoLinha:'999'}],new Set(['outbound-version']),scoped).length,0);
});

test('terminal cycle preserves arrival across feed omission and missing line UUID before next direction',()=>{
  const a=vehicle(),s=structure();
  const first=project(a,s);
  const arrived={...a,atualizadoEm:new Date(now+10000).toISOString()};
  const arrival=project(arrived,s,first.evidence,now+10000);
  assert.equal(arrival.presentation.presencaEstado,'fim_percurso');
  const retained=maps.reconciliarSnapshotsRodoviarios([arrived],[],{enabled:true,now:now+40000});
  assert.equal(retained[0].atualizadoEm,arrived.atualizadoEm);
  assert.equal(project(arrived,s,arrival.evidence,now+40000).presentation.presencaEstado,'fim_percurso');
  const incomplete={...arrived,linhaId:null,sentidoId:null,padraoOperacionalId:null,padraoVersaoId:null,posicaoNaRota:null,
    atualizadoEm:new Date(now+60000).toISOString()};
  const unknown=project(incomplete,undefined,arrival.evidence,now+60000);
  assert.equal(unknown.presentation.presencaEstado,'indeterminado');
  const outbound={...a,sentidoId:'B',padraoOperacionalId:'pb',padraoVersaoId:'b',posicaoNaRota:0,
    atualizadoEm:new Date(now+90000).toISOString()};
  const waitingFirst=project(outbound,structure('B'),unknown.evidence,now+90000);
  const waiting=project({...outbound,atualizadoEm:new Date(now+120000).toISOString()},structure('B'),waitingFirst.evidence,now+120000);
  assert.equal(waiting.presentation.presencaEstado,'aguardando_saida');
  const departing={...outbound,longitude:-43.001,posicaoNaRota:.2,velocidade:18,atualizadoEm:new Date(now+150000).toISOString()};
  assert.equal(project(departing,structure('B'),waiting.evidence,now+150000).presentation.presencaEstado,'em_viagem');
  const stale=project(departing,structure('B'),undefined,now+330000);
  assert.equal(stale.presentation.gpsAtrasado,true);
  assert.equal(project(departing,structure('B'),stale.evidence,now+450001),null);
});

test('classifier diagnostics expose missing context radii and distinct GPS without changing results',()=>{
  const v=vehicle(),s=structure();let facts;
  const inspect=(value,context,previous,t=now)=>presence.projectRoadPresence(value,context,previous,t,report=>{facts=report;});
  const first=inspect(v,s);
  assert.equal(facts.reason,'needs_second_distinct_gps');assert.equal(facts.lastRadiusMetres,50);
  assert.equal(facts.distanceLastMetres,0);assert.equal(facts.distinctSamples,1);
  assert.deepEqual(first,project(v,s));
  inspect(v,s,first.evidence,now+10000);assert.equal(facts.distinctSamples,1);assert.equal(facts.sameGps,true);
  const confirmed=inspect({...v,atualizadoEm:new Date(now+1000).toISOString()},s,first.evidence,now+1000);
  assert.equal(facts.state,'fim_percurso');assert.equal(facts.distinctSamples,2);
  inspect({...v,longitude:-43.0007,atualizadoEm:new Date(now+2000).toISOString()},s,confirmed.evidence,now+2000);
  assert.equal(facts.lastRadiusMetres,100);assert.ok(facts.distanceLastMetres>50&&facts.distanceLastMetres<100);
  inspect({...v,longitude:-43.0007},s,undefined);assert.equal(facts.state,'indeterminado');assert.equal(facts.lastRadiusMetres,50);
  inspect(v,{...s,topologia:'CIRCULAR'},undefined);assert.ok(facts.failures.includes('topology_not_linear'));
  inspect({...v,padraoOperacionalId:null},s,undefined);assert.ok(facts.failures.includes('matching_incomplete'));
  inspect(v,undefined,undefined);assert.ok(facts.failures.includes('structure_not_loaded'));
  inspect(v,s,undefined,now+300001);assert.equal(facts.reason,'gps_retention_expired');assert.equal(facts.present,false);
  assert.equal(JSON.stringify(facts).includes('latitude'),false);assert.equal(JSON.stringify(facts).includes('longitude'),false);
});

test('missing UUID cannot transfer arrival history to another line code or extend its evidence window',()=>{
  const v=vehicle(),s=structure();const first=project(v,s);
  const arrived=project({...v,atualizadoEm:new Date(now+1000).toISOString()},s,first.evidence,now+1000);
  for(const code of ['999','']){
    const unknown=project({...v,codigoLinha:code,linhaId:null,padraoVersaoId:null,atualizadoEm:new Date(now+2000).toISOString()},undefined,arrived.evidence,now+2000);
    assert.equal(unknown.evidence.arrivalDirection,undefined);
  }
  const later=now+182000;
  const expired=project({...v,linhaId:null,padraoVersaoId:null,atualizadoEm:new Date(later).toISOString()},undefined,arrived.evidence,later);
  assert.equal(expired.evidence.arrivalDirection,undefined);
  assert.equal(expired.presentation.presencaEstado,'indeterminado');
});
