import type {LinhaParaMostrar} from '../components/mapOSM/types';
import type {UnifiedSnapshot} from './unifiedLocationContract';
import {gpsPresentation} from './gpsPresentationPolicy';
import {terminalRadarReason,type TerminalDiagnostic,type TerminalPresence,type RadarArrival} from './terminalTracking';

/** Development/read-only probe. No extra GPS request or geometry per clock tick. */
export function diagnoseTerminalInputs(lines:LinhaParaMostrar[],snapshots:UnifiedSnapshot[],now:number):TerminalDiagnostic[]{
 return snapshots.flatMap(s=>s.vehicles.map(v=>{
  const line=lines.find(l=>l.nome===s.lineCode),at=Date.parse(v.location.physicalAt);
  const reason=!line?'line_not_loaded_or_subscribed':!v.order||v.line.lineId!==line.linhaId||v.line.serviceCode!==s.lineCode?'invalid_line_or_identity'
   :![1,2,'Informed','Inherited'].includes(v.line.state)?'line_association_invalid'
   :v.line.validatedAt&&now-Date.parse(v.line.validatedAt)>=600000?'line_association_expired'
   :!gpsPresentation(at,now).visible||now>=Date.parse(v.location.validUntil)?'gps_expired'
   :v.location.uncertain?'uncertain_location':!line.terminaisOficiais?.length?'official_terminal_metadata_missing':'canonical_accepted';
  return {key:`road:${v.order}`,code:s.lineCode,stage:'canonical',reason,physicalAt:at};
 }));
}
export function diagnoseTerminalStop(vehicles:readonly TerminalPresence[],stopId:string|undefined,links:readonly {linhaId:string;padraoVersaoId?:string}[],now:number,arrivals:readonly RadarArrival[]=[]){
 return vehicles.map(v=>({key:v.key,code:v.code,stage:'radar',reason:terminalRadarReason(v,stopId,links,arrivals,now),physicalAt:v.physicalAt,state:v.state}));
}
