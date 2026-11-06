import {useEffect,useMemo,useRef,useState} from 'react';
import {listarLinhasV2,listarSentidosV2,listarPadroesV2,obterItinerarioPadraoVersaoV2} from '../services/estruturaV2';
import {rotuloSentidoPublico} from '../types/estruturaV2';
import {geometryForMap,stopsForMap} from '../services/hybridGps';
import {createHybridComposer} from '../services/hybridContext';
import {useUnifiedLocation} from '../services/unifiedLocation';
import {EMPTY_TERMINAL_CATALOG,TERMINAL_RADAR_CODES,terminalRadarScope,type TerminalRadarCatalog} from '../services/terminalRadarContext';
import type {ParadaRadar} from '../services/radarParada';
import type {RadarArrival} from '../services/terminalTracking';

let pending:Promise<TerminalRadarCatalog>|undefined;
function loadCatalog(){
 if(pending)return pending;
 pending=(async()=>{
  const catalog:TerminalRadarCatalog={lines:[],itineraries:{},maps:[]};
  for(const code of TERMINAL_RADAR_CODES){
   const line=(await listarLinhasV2(code,1,50)).find(l=>l.codigo===code&&l.modal==='Ônibus');
   if(!line)throw new Error('Terminal line metadata unavailable');
   const senses=await listarSentidosV2(code);
   const patterns=(await Promise.all(senses.filter(s=>s.linhaId===line.linhaId).map(s=>listarPadroesV2(s.id)))).flat();
   const routes=await Promise.all(patterns.filter(p=>p.versaoAtualId).map(p=>obterItinerarioPadraoVersaoV2(p.versaoAtualId!)));
   if(!routes.length||routes.some(r=>!r||r.linhaId!==line.linhaId||r.codigoLinha!==code))throw new Error('Terminal route metadata unavailable');
   const valid=routes.filter(r=>r!=null);
   const segments=valid.map(r=>geometryForMap(r.geometria.coordenadas));
   const padroes=valid.map((r,i)=>({sentidoId:r.sentidoId,sentidoNome:rotuloSentidoPublico(r),padraoOperacionalId:r.padraoOperacionalId,padraoVersaoId:r.padraoVersaoId,rotulo:r.chavePadrao,segmentoIndice:i,paradas:stopsForMap(r.ocorrencias)}));
   const stops=Object.fromEntries(padroes.map(p=>[p.padraoVersaoId,p.paradas]));
   const names=Object.fromEntries(padroes.map(p=>[p.padraoVersaoId,p.sentidoNome]));
   const official=[line.terminalA,line.terminalB].filter((n):n is string=>!!n);
   catalog.lines.push({linhaId:line.linhaId,linhaCodigo:code,nomeExibicao:code,modal:'onibus',cor:'#2979ff',ativa:true,modoSentido:'ambos',mostrarParadas:false});
   catalog.itineraries[line.linhaId]={linha:code,modal:'onibus',segmentos:segments,paradas:padroes.flatMap(p=>p.paradas),paradasPorItinerario:stops,itinerarioSentidoMap:names,terminaisOficiais:official,incluiParadas:true,padroesV2:padroes};
   catalog.maps.push({nome:code,linhaId:line.linhaId,modal:'onibus',modoSentido:'ambos',segmentos:segments,paradasPorPadrao:stops,itinerarioSentidoMap:names,terminaisOficiais:official,itinerarioSegmentoMap:Object.fromEntries(padroes.map((p,i)=>[p.padraoVersaoId,i]))});
  }
  return catalog;
 })().catch(error=>{pending=undefined;throw error;});
 return pending;
}
export function useTerminalRadarCatalog(enabled:boolean){
 const [catalog,setCatalog]=useState(EMPTY_TERMINAL_CATALOG);
 useEffect(()=>{
  if(!enabled)return;
  let active=true,timer:ReturnType<typeof setTimeout>|undefined;
  const load=()=>{void loadCatalog().then(c=>{
   if(active){setCatalog(c);if(__DEV__)delete (globalThis as typeof globalThis&{__nopontoTerminalCatalogError?:string}).__nopontoTerminalCatalogError;}
  }).catch(()=>{
   if(active){
    if(__DEV__){const target=globalThis as typeof globalThis&{__nopontoTerminalCatalogError?:string};target.__nopontoTerminalCatalogError='official_terminal_or_route_metadata_unavailable';}
    timer=setTimeout(load,30000);
   }
  });};
  load();return()=>{active=false;if(timer)clearTimeout(timer);};
 },[enabled]);
 return catalog;
}
const EMPTY_ARRIVALS:readonly RadarArrival[]=[];
export function useTerminalRadarPresence(catalog:TerminalRadarCatalog,stop:ParadaRadar|null,enabled:boolean,arrivals:readonly RadarArrival[]=EMPTY_ARRIVALS){
 const scope=useMemo(()=>enabled?terminalRadarScope(catalog,stop):[],[catalog,stop,enabled]);
 const unified=useUnifiedLocation(scope.map(l=>l.nome));
 const composer=useRef(createHybridComposer());
 const result=useMemo(()=>composer.current(scope,unified.snapshots,unified.now),[scope,unified.snapshots,unified.now]);
 return useMemo(()=>result.flatMap(l=>(l.posicoes??[]).flatMap(p=>p.terminalPresence?[p.terminalPresence]:[])),[result]);
}
