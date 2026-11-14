const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function runtime() {
  const source = fs.readFileSync(__dirname + '/mapScript.ts', 'utf8');
  let position = {lat: 0, lng: 0}, frame=0, clock=0;
  const frames=new Map(), centers=[];
  const c = { userMarker: {getLngLat: () => position, setLngLat: ([lng,lat]) => {position={lat,lng};}},
    map: {easeTo() {}, jumpTo: x=>centers.push(x.center), getBearing: () => 0}, document: {querySelector: () => null},
    parseNum: v => typeof v === 'number' && Number.isFinite(v) ? v : null,
    distanceMeters: (a,b) => Math.hypot(a.lat-b.lat,a.lng-b.lng)*111320,
    window:{}, gestures:{}, Date, Math, Number, autoFollow:false, userAnimationFrame:null, performance:{now:()=>clock},
    requestAnimationFrame: fn=>{frames.set(++frame,fn);return frame;},cancelAnimationFrame:id=>frames.delete(id),runInternal:fn=>fn(),
    userLastUpdate:0, stopAnim(){},
    animateTo: (_key, marker, dest) => marker.setLngLat([dest.lng,dest.lat]) };
  const filterFile = __dirname + '/userLocation.ts';
  if (fs.existsSync(filterFile)) {
    const ts = require('typescript');
    const m = {exports:{}};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(filterFile,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, {exports:m.exports,Math,Number,Date});
    c.filterUserLocation=vm.runInNewContext(m.exports.USER_LOCATION_FILTER_JS, {Math, Number, Date});
  }
  c.map.on=(event,fn)=>{c.gestures[event]=fn;};c.map.flyTo=()=>{};
  vm.createContext(c);
  for(const event of ['dragstart','movestart','zoomstart']) {
    const line=source.split('\n').find(line=>line.includes("map.on('"+event+"'"));vm.runInContext(line,c);
  }
  const center=source.indexOf('window.centerOnUser=function()');
  vm.runInContext(source.slice(center,source.indexOf('window.fitToCoordinates',center)),c);
  vm.runInContext(source.slice(source.indexOf('function updateUser(data){'),source.indexOf('\nfunction focusOnVehicle',source.indexOf('function updateUser(data){'))),c);
  const now=Date.now();
  const tick=()=>{clock+=500;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(clock));};
  return {c, frames, centers, tick, position:()=>position, fix:(meters,time=0,accuracy=5,speed=null)=>c.updateUser({userLocation:[0,meters/111320],timestamp:now+time,accuracy,speed})};
}
test('old GPS fix cannot move user backwards', () => {
  const h=runtime(); h.fix(0,-4000);h.tick();h.fix(20,-2000);h.tick();const before=h.position().lng;h.fix(0,-3000);h.tick();
  assert.equal(h.position().lng,before);
});

test('stationary jitter and temporarily inaccurate GPS do not move the dot',()=>{
 const h=runtime();h.fix(0,-10000);h.tick();h.fix(1,-8000,10);h.tick();assert.equal(h.position().lng,0);
 h.fix(300,-6000,150);h.tick();assert.equal(h.position().lng,0);
 h.fix(10000,-4000,5);h.tick();assert.equal(h.position().lng,0);
 h.fix(12,-2000,5,1.5);h.tick();assert.ok(h.position().lng*111320>8);
});
test('walking and public transport advance with bounded lag',()=>{
 for(const speed of [1.5,25,80]){
 const h=runtime();h.fix(0,-10000);h.tick();let prior=0;
 for(let i=1;i<=5;i++){h.fix(speed*2*i,-10000+i*2000,5,speed);h.tick();const meters=h.position().lng*111320;assert.ok(meters>prior);assert.ok(speed*2*i-meters<speed*2);prior=meters;}
 }
});
test('resume accepts fresh movement but rejects cached and invalid fixes',()=>{
 const h=runtime();h.fix(0,-29000);h.tick();h.fix(600,0,8,20);h.tick();assert.ok(Math.abs(h.position().lng*111320-600)<0.01);
 const before=h.position().lng;h.fix(0,-50000);h.fix(NaN,1);h.fix(700,2,-1);h.tick();assert.equal(h.position().lng,before);
});
test('one animation owns dot and camera; manual pan disables follow until recentered',()=>{
 const h=runtime();h.c.autoFollow=true;h.fix(0,-6000);h.tick();h.fix(20,-4000);h.fix(30,-2000);assert.equal(h.frames.size,1);h.tick();
 assert.equal(h.centers.at(-1)[0],h.position().lng);
 h.c.gestures.dragstart();const calls=h.centers.length;h.fix(40,0);h.tick();assert.equal(h.centers.length,calls);assert.ok(h.position().lng*111320>30);
 h.c.window.centerOnUser();h.fix(50,1000);h.tick();assert.equal(h.centers.at(-1)[0],h.position().lng);
});
