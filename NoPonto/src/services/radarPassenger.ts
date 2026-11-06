import type {TerminalRadarVehicle} from './terminalTracking';
export const RADAR_PHYSICAL_MAX_MS=300000;
export type PassengerArrival={id?:string;eventId?:string;linhaId?:string;codigo?:string;codigoLinha?:string;paradaId?:string;
 ordem?:string|null;codigoVeiculo?:string|null;vehicleId?:string|null;etaSeg?:number|null;secondsUntilEvent?:number|null;estimatedAt?:string|null;scheduledAt?:string|null;distanciaMetros?:number|null;distanciaRestanteMetros?:number|null};
export type PassengerRow<T>={kind:'physical';vehicle:TerminalRadarVehicle;arrival?:T;relatedArrivals?:T[]}|{kind:'arrival';arrival:T};
const identity=(line:string|undefined,order:string)=>line+':'+order.trim().toUpperCase();
const distance=(d:number|null|undefined)=>d!=null&&Number.isFinite(d)&&d>=0?d:undefined;
const band=(d:number|undefined)=>d==null?Infinity:Math.floor(d/100);
const forecastSeconds=(a:PassengerArrival,now:number)=>{const dated=a.estimatedAt??a.scheduledAt;return dated?(Date.parse(dated)-now)/1000:a.etaSeg??a.secondsUntilEvent??Infinity;};
/** Passenger priority only. No geometry, invented distance or departure ETA. */
export function passengerRadar<T extends PassengerArrival>(physical:readonly TerminalRadarVehicle[],arrivals:readonly T[],stopId:string|undefined,now:number,limit=Infinity):PassengerRow<T>[]{
 const live=new Map<string,Extract<PassengerRow<T>,{kind:'physical'}>>();
 for(const v of physical)if(now>=v.physicalAt&&now-v.physicalAt<=RADAR_PHYSICAL_MAX_MS&&now<=v.validUntil)live.set(identity(v.lineId,v.order),{kind:'physical',vehicle:v});
 const operational:PassengerRow<T>[]=[],eventIds=new Set<string>();
 for(const [index,a] of arrivals.entries()){
  const eventId=a.eventId??a.id??'unidentified:'+index;if(eventIds.has(eventId))continue;eventIds.add(eventId);
  const order=a.ordem??a.codigoVeiculo??a.vehicleId,key=order?identity(a.linhaId,order):undefined,prior=key?live.get(key):undefined;
  if(prior){const seconds=forecastSeconds(a,now),valid=Number.isFinite(seconds)&&seconds>=0;
   if(prior.vehicle.state==='No terminal'||!valid){if(valid){prior.arrival??=a;prior.relatedArrivals=[...prior.relatedArrivals??[],a];}continue;}
   live.delete(key!);
  }
  operational.push({kind:'arrival',arrival:a});
 }
 const rows:PassengerRow<T>[]=[...live.values(),...operational];
 const waiting=rows.flatMap(r=>r.kind==='physical'&&r.vehicle.state==='No terminal'?[r.vehicle]:[]);
 const references=waiting.flatMap(v=>{const d=v.terminalId===stopId?0:distance(v.originToStopMetres);return d==null?[]:[d];});
 const reference=references.length?Math.min(...references):undefined;
 const movingRank=(d:number|undefined)=>d==null?3:!waiting.length?0:reference!=null&&band(d)<band(reference)?0:2;
 const score=(r:PassengerRow<T>):[number,number,number,string,string]=>{
  if(r.kind==='arrival'){const a=r.arrival,d=a.paradaId&&a.paradaId!==stopId?undefined:distance(a.distanciaRestanteMetros??a.distanciaMetros),seconds=forecastSeconds(a,now);
   return [movingRank(d),band(d),d==null&&Number.isFinite(seconds)&&seconds>=0?Math.ceil(seconds/60):Infinity,a.codigoLinha??a.codigo??'',a.eventId??a.id??''];}
  const v=r.vehicle,stationary=v.state==='No terminal',d=distance(v.distanceToStopMetres),progressing=v.state==='A caminho'||v.state==='Saindo do terminal';
  const dwell=v.dwellSince!=null&&v.dwellSince<=v.physicalAt?-(v.physicalAt-v.dwellSince):0;
  return [stationary?(v.terminalId===stopId?-1:1):progressing?movingRank(d):4,stationary?Infinity:band(d),stationary?dwell:Infinity,v.code,v.key];
 };
 return rows.map(row=>({row,score:score(row)})).sort((a,b)=>{const x=a.score,y=b.score;return x[0]-y[0]||(x[1]===y[1]?0:x[1]-y[1])||(x[2]===y[2]?0:x[2]-y[2])||x[3].localeCompare(y[3],undefined,{numeric:true})||x[4].localeCompare(y[4]);}).slice(0,limit).map(r=>r.row);
}
export function physicalPassengerLabel(v:TerminalRadarVehicle){
 if(v.state==='No terminal'){const minutes=v.dwellSince!=null?Math.floor((v.physicalAt-v.dwellSince)/60000):0;return minutes>=1?'No terminal há '+minutes+' min':'Em espera';}
 return v.state==='Saindo do terminal'?'Saindo do terminal':v.state==='A caminho'?'A caminho':'Localização incerta';
}
