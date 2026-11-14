import test from "node:test";
import assert from "node:assert/strict";
import { carregarPerfil, CHAVE_PERFIL, coresAvatar, iniciaisPerfil, perfilVazio, salvarPerfil } from "./perfilLocal";
test("iniciais: vazio, nome simples, composto, acentos e espaços", () => {
  for (const [nome,esperado] of [["","NP"],["  ","NP"],["João","J"],["Guilherme Sales","GS"],["Ana Clara","AC"],[" Ana  de Souza ","AS"],["!","NP"]]) assert.equal(iniciaisPerfil(nome),esperado);
});
test("perfil persiste somente nome e cor e retorna após nova leitura", async () => {
  const dados = new Map<string,string>();
  const storage = {getItem:async(k:string)=>dados.get(k)??null,setItem:async(k:string,v:string)=>{dados.set(k,v);}};
  assert.deepEqual(await carregarPerfil(storage),perfilVazio);
  const salvo = await salvarPerfil(storage,{nome:"  Ana   Clara ",cor:coresAvatar[2]});
  assert.deepEqual(await carregarPerfil(storage),{nome:"Ana Clara",cor:coresAvatar[2]});assert.deepEqual(Object.keys(salvo).sort(),["cor","nome"]);assert.equal(dados.size,1);assert.ok(dados.has(CHAVE_PERFIL));
  await salvarPerfil(storage,{nome:"",cor:coresAvatar[0]});assert.equal((await carregarPerfil(storage)).nome,"");
});
test("perfil corrompido ou falha não sobrescreve storage; valida paleta e limite",async()=>{
 let writes=0;const storage={getItem:async()=>'{broken',setItem:async()=>{writes++;}};
 await assert.rejects(carregarPerfil(storage));assert.equal(writes,0);
 await assert.rejects(salvarPerfil(storage,{nome:"A",cor:"#ffffff"}));await assert.rejects(salvarPerfil(storage,{nome:"a".repeat(61),cor:coresAvatar[0]}));assert.equal(writes,0);
 await assert.rejects(salvarPerfil({...storage,setItem:async()=>{throw Error('disco');}},{nome:"Ana",cor:coresAvatar[0]}),/disco/);
});
