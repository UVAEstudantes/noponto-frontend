import test from "node:test";
import assert from "node:assert/strict";
import { itinerarioPersistido } from "./itinerarioPersistido";
test("persiste por versão, recupera corrupção e limita versões", async () => {
  const map = new Map<string,string>();
  const storage = { getItem: async (k:string) => map.get(k) ?? null, setItem: async (k:string,v:string) => { map.set(k,v); }, removeItem: async(k:string) => { map.delete(k); }, getAllKeys: async() => [...map.keys()] };
  const valid = (v:unknown):v is { id:string } => !!v && typeof v === "object" && "id" in v;
  let calls=0;
  const load=async()=>{calls++;return {id:"v1"};};
  await itinerarioPersistido(storage,"v1",load,valid);
  await itinerarioPersistido(storage,"v1",load,valid);
  assert.equal(calls,1);
  map.set("@itinerario-versao:v1:v1","corrupto");
  assert.deepEqual(await itinerarioPersistido(storage,"v1",load,valid),{id:"v1"});
  assert.equal(calls,2);
  for(let i=0;i<20;i++) await itinerarioPersistido(storage,String(i),load,valid);
  assert.equal(map.size,12);
});
