const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Module=require('node:module');
const ts=require('typescript');
function harness(permission=true){
 let listener;const pending=[],received=[];
 const app={currentState:'active',addEventListener:(_,fn)=>{listener=fn;return {remove(){listener=null;}};}};
 const location={Accuracy:{Highest:6},getForegroundPermissionsAsync:async()=>({granted:permission}),
 watchPositionAsync:(_options,callback)=>new Promise(resolve=>pending.push({callback,resolve}))};
 const m=new Module(__filename,module);m.require=id=>id==='react'?{}:id==='react-native'?{AppState:app}:location;
 m._compile(ts.transpileModule(fs.readFileSync(__dirname+'/useUserLocationWatch.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,__filename);
 const cleanup=m.exports.watchUserLocation(x=>received.push(x));
 const flush=async()=>{await Promise.resolve();await Promise.resolve();};
 return {pending,received,cleanup,flush,change:state=>listener(state),deny:()=>{permission=false;},hasListener:()=>Boolean(listener)};
}
test('late watcher is removed and callbacks ignored after screen exit',async()=>{
 const h=harness();await h.flush();assert.equal(h.pending.length,1);h.cleanup();let removed=0;
 h.pending[0].resolve({remove:()=>removed++});h.pending[0].callback('late');await h.flush();
 assert.equal(removed,1);assert.deepEqual(h.received,[]);assert.equal(h.hasListener(),false);
});
test('background and foreground replace watcher without simultaneous subscriptions',async()=>{
 const h=harness();await h.flush();let active=0;const settle=async i=>{active++;h.pending[i].resolve({remove:()=>active--});await h.flush();};
 await settle(0);assert.equal(active,1);h.change('background');assert.equal(active,0);h.pending[0].callback('stale');
 h.change('active');await h.flush();await settle(1);h.pending[1].callback('fresh');assert.equal(active,1);assert.deepEqual(h.received,['fresh']);
 h.change('active');await h.flush();assert.equal(active,0);h.cleanup();await settle(2);assert.equal(active,0);
});
test('permission denial creates no GPS subscription',async()=>{
 const h=harness(false);await h.flush();assert.equal(h.pending.length,0);h.cleanup();
});
