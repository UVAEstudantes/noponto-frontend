import type {TerminalPresence} from './terminalTracking';
import type {LinhaParaMostrar} from '../components/mapOSM/types';
import type {ItinerarioLinha} from '../types/transporte';
import type {LinhaSelecionadaInfo} from '../hooks/useMobilidadeRio';
import type {ParadaRadar} from './radarParada';
import {lineTerminals} from './terminalTracking';

// Deliberately bounded pilot discovery: structure for two lines, GPS only for
// lines legitimately serving the currently monitored early stop.
export const TERMINAL_RADAR_CODES=['838','855'] as const;
export const MAX_TERMINAL_RADAR_LINES=2;
export interface TerminalRadarCatalog {lines:LinhaSelecionadaInfo[];itineraries:Record<string,ItinerarioLinha>;maps:LinhaParaMostrar[]}
export const EMPTY_TERMINAL_CATALOG:TerminalRadarCatalog={lines:[],itineraries:{},maps:[]};
export function terminalRadarScope(catalog:TerminalRadarCatalog,stop:ParadaRadar|null){
 if(!stop)return [];
 const seen=new Set<string>();
 return catalog.maps.filter(line=>{
  if(!TERMINAL_RADAR_CODES.some(code=>code===line.nome)||!line.linhaId||seen.has(line.nome))return false;
  const eligible=stop.vinculos.some(l=>l.linhaId===line.linhaId)&&lineTerminals(line).some(e=>e.corridors.some(c=>
   stop.vinculos.some(l=>l.linhaId===line.linhaId&&(!l.padraoVersaoId||l.padraoVersaoId===c.pattern))&&(c.originId===stop.parada.paradaId||c.stops.some(s=>s.id===stop.parada.paradaId&&s.rank<=(c.maxStops??3)&&s.metres>0&&s.metres<=(c.maxMetres??1500)))));
  if(eligible)seen.add(line.nome);return eligible;
 }).slice(0,MAX_TERMINAL_RADAR_LINES);
}
export function mergeTerminalRadarLines(selected:LinhaSelecionadaInfo[],catalog:TerminalRadarCatalog){
 // Radar may use all legitimate pilot patterns without modifying map filters.
 return [...selected.filter(l=>!catalog.lines.some(c=>c.linhaId===l.linhaId)),...catalog.lines.map(line=>{const configured=selected.find(s=>s.linhaId===line.linhaId);return configured&&configured.cor!==line.cor?{...line,cor:configured.cor}:line;})];
}

/** Same GPS may reach a new stop tracker after the map already validated history.
 * Prefer proven continuity only for an identical fix/line/terminal/route family.
 * Never renew GPS/validity or carry that proof over a newer observation/conflict. */
export function mergeTerminalEvidence(map:readonly TerminalPresence[],scoped:readonly TerminalPresence[]):TerminalPresence[]{
 const merged=new Map(map.map(v=>[v.key,v]));
 const dwell=(v:TerminalPresence)=>v.state==='No terminal'&&v.dwellSince!=null&&v.dwellSince<v.physicalAt;
 const moving=(v:TerminalPresence)=>(v.state==='A caminho'||v.state==='Saindo do terminal')&&v.contextAt===v.physicalAt&&v.progressMetres!=null&&Number.isFinite(v.progressMetres);
 for(const v of scoped){const old=merged.get(v.key);if(!old||v.physicalAt>old.physicalAt){merged.set(v.key,v);continue;}if(v.physicalAt<old.physicalAt)continue;
  const identical=old.lineId===v.lineId&&old.code===v.code&&old.terminalId===v.terminalId
   &&Number.isFinite(old.latitude)&&Number.isFinite(old.longitude)&&old.latitude===v.latitude&&old.longitude===v.longitude
   &&(!old.knownPattern||!v.knownPattern||old.knownPattern===v.knownPattern)
   &&old.corridors.length===v.corridors.length&&old.corridors.every(c=>v.corridors.some(n=>n.pattern===c.pattern&&n.originId===c.originId));
  const retain=identical&&(v.state==='Na região da origem'&&(dwell(old)||moving(old))
   ||dwell(old)&&dwell(v)&&old.dwellSince!<v.dwellSince!);
  if(retain){const validUntil=Math.min(old.validUntil,v.validUntil);merged.set(v.key,validUntil===old.validUntil?old:{...old,validUntil});}
  else merged.set(v.key,v);
 }
 return [...merged.values()];
}
