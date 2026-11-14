import test from "node:test";
import assert from "node:assert/strict";
import { formatarHoraRotina, etapasRotina, salvarRotinaLocal, validarRotina, exemplosRotinas } from "./rotinasDemo";
test("horário aceita limites válidos e rejeita horas/minutos impossíveis", () => {
 assert.equal(formatarHoraRotina(0,0),"00:00"); assert.equal(formatarHoraRotina(23,59),"23:59");
 for (const [h,m] of [[29,90],[-1,0],[24,0],[0,60],[1.5,0]]) assert.throws(()=>formatarHoraRotina(h,m));
});
test("etapas preservam origem e destino sem inventar uma rota real",()=>{
 const r={id:1,nome:"Estudo",origem:"Origem",destino:"Destino",hora:"07:00",dias:[0],voz:true,ativa:false};
 const a=etapasRotina(r),b=etapasRotina(r,true);assert.equal(a.length,5);assert.equal(a[0].de,r.origem);assert.equal(a[4].ate,r.destino);assert.notEqual(a[1].tipo,b[1].tipo);assert.match(a[1].instrucao,/futuro motor/);
});


test("salvar valida dias e horário sem alterar a lista original",()=>{
 const r={...exemplosRotinas[0],dias:[0,0,1],nome:" Estudo "};const lista=salvarRotinaLocal(exemplosRotinas,r);
 assert.equal(lista[0].nome,"Estudo");assert.deepEqual(lista[0].dias,[0,1]);assert.equal(exemplosRotinas[0].nome,"Faculdade");assert.equal(lista[1],exemplosRotinas[1]);
 assert.match(validarRotina({...r,dias:[]}),/dia/);assert.match(validarRotina({...r,dias:[7]}),/dia/);assert.match(validarRotina({...r,hora:"29:90"}),/horário/);assert.throws(()=>salvarRotinaLocal(exemplosRotinas,{...r,origem:" "}));
});
