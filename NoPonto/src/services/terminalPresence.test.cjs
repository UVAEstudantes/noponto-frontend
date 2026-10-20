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

test('OFF retains legacy filtering; scope never reintroduces another line or explicit opposite version',()=>{
  const v=maps.adaptarPosicaoRodoviariaV2(raw());
  assert.equal(maps.filtrarVeiculosPorPadroesVisiveis([v],new Set(['a'])).length,0);
  assert.equal(maps.filtrarVeiculosPorPadroesVisiveis([v],new Set(['a']),{...options,lineId:'other'}).length,0);
  assert.equal(maps.filtrarVeiculosPorPadroesVisiveis([{...v,codigoLinha:'999'}],new Set(['a']),options).length,0);
  assert.equal(maps.filtrarVeiculosPorPadroesVisiveis([{...v,padraoVersaoId:'opposite'}],new Set(['a']),options).length,0);
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
  const stale=project(v,structure(),undefined,now+61000);
  assert.equal(stale.presentation.presencaEstado,'gps_desatualizado');
  assert.equal(stale.presentation.presencaIdadeSegundos,61);
  assert.equal(project(v,structure(),stale.evidence,now+180001),null);
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
  assert.equal(maps.reconciliarSnapshotsRodoviarios([v],[other],{enabled:true,now:now+180001}).length,0);
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
  assert.equal(maps.reconciliarSnapshotsRodoviarios([old],[],{enabled:true,now:now+180001}).length,0);
});
