import type { LinhaParaMostrar } from '../components/mapOSM/types';
import type { Parada } from '../types/transporte';
import { projectPhysical } from './hybridGps';
import {originPath,originDestination,type OriginPath} from './originDeparture';
import { GPS_POLICY, gpsPresentation,TERMINAL_CORRIDOR_OVERRIDES, type GpsPresentationPolicy } from './gpsPresentationPolicy';

type Point={latitude:number;longitude:number};
const metres=(a:Point,b:Point)=>Math.hypot(a.latitude-b.latitude,(a.longitude-b.longitude)*Math.cos(a.latitude*Math.PI/180))*111195;
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
export interface TerminalCorridor {
  pattern:string; originId:string; originName:string;
  destinationId?:string;destinationName?:string;
  stops:{id:string;rank:number;metres:number}[];
  coords:[number,number][];
  maxStops?:number;maxMetres?:number;
}
export interface TerminalPresence {
  key:string; order:string; lineId:string; code:string; physicalAt:number;
  terminalId:string; terminalName:string; state:'Na região da origem'|'No terminal'|'Saindo do terminal'|'A caminho';
  knownPattern:string|null; corridors:TerminalCorridor[]; operationalConfirmed:boolean;
  validUntil:number;
  /** First stationary fix in the current confirmed run; observed duration, not arrival time. */
  dwellSince?:number;
  contextAt?:number; progressMetres?:number;
  speedKmh?:number; speedAt?:number;
  historySpeedKmh?:number;
  latitude?:number;longitude?:number;directionName?:string;originPath?:OriginPath;
}
interface Endpoint {stop:Parada;corridors:TerminalCorridor[];regionPoints:Point[]}
const prepared=new WeakMap<Parada[],{coords:[number,number][];official:string;endpoints:Endpoint[]}>();
/** Only official line terminals AND actual pattern endpoints are eligible. */
export function lineTerminals(line:LinhaParaMostrar,policy:Readonly<GpsPresentationPolicy>=GPS_POLICY):Endpoint[]{
  const official=(line.terminaisOficiais??[]).map(normalize).sort();if(!official.length)return [];
  const endpoints:Endpoint[]=[];
  for(const [pattern,stops] of Object.entries(line.paradasPorPadrao??{})){
    const index=line.itinerarioSegmentoMap?.[pattern],coords=index==null?undefined:line.segmentos?.[index];
    if(!coords||stops.length<2)continue;
    const origin=stops.reduce((first,s)=>s.ordem<first.ordem?s:first,stops[0]);
    const limits={...policy,...TERMINAL_CORRIDOR_OVERRIDES[line.nome]?.[origin.codigo??origin.paradaId],...line.terminalPolicy,...line.terminalPatternPolicy?.[pattern]};
    const signature=official.join('|')+'|'+pattern+'|'+limits.initialStops+'|'+limits.initialMetres;
    const cached=prepared.get(stops);
    if(cached?.coords===coords&&cached.official===signature){endpoints.push(...cached.endpoints);continue;}
    const ordered=[...stops].sort((a,b)=>a.ordem-b.ordem);
    const first=ordered[0],last=ordered.at(-1)!;const result:Endpoint[]=[];
    // Missing/repeated order or loops cannot define an unambiguous origin corridor.
    const sequenceValid=ordered.every((s,i)=>i===0||s.ordem>ordered[i-1].ordem)&&first.paradaId!==last.paradaId;
    for(const stop of [first,last]){
      if(!official.includes(normalize(stop.nome)))continue;
      const point=projectPhysical(coords,stop.latitude,stop.longitude);
      const vertex=stop===first?coords[0]:coords.at(-1)!;
      const anchored=metres(stop,{latitude:vertex[0],longitude:vertex[1]})<=40;
      if(!point||point.gap>40||point.ambiguous&&!anchored)continue;
      const corridors:TerminalCorridor[]=[];
      if(stop===first&&sequenceValid&&(anchored||point.progress<=.03)){
        const distances=ordered.slice(1,1+limits.initialStops).map((s,i)=>{
          const p=projectPhysical(coords,s.latitude,s.longitude);
          const supplied=s.distanciaMetros;
          const routeDistance=supplied!=null&&Number.isFinite(supplied)&&supplied>=0&&supplied<=point.totalMetres*1.05?supplied:null;
          return p&&p.gap<=60&&(routeDistance!=null||!p.ambiguous)?{id:s.paradaId,rank:i+1,metres:routeDistance!=null?routeDistance-(first.distanciaMetros??0):p.metres-(anchored?0:point.metres)}:null;
        });
        // Route ordering must agree with geometric progress; do not sort a broken sequence into validity.
        const valid=distances.every((s,i)=>!!s&&s.metres>=0&&(i===0||s.metres>=distances[i-1]!.metres));
        if(valid)corridors.push({pattern,originId:stop.paradaId,originName:stop.nome,destinationId:official.includes(normalize(last.nome))?last.paradaId:undefined,destinationName:official.includes(normalize(last.nome))?last.nome:undefined,stops:distances.filter((s):s is NonNullable<typeof s>=>!!s),coords,maxStops:limits.initialStops,maxMetres:limits.initialMetres});
      }
      // Verified route vertices connected to this origin, capped at 80 m from
      // the official platform. Do not grow a region from parked vehicle GPS.
      const connected:Point[]=[stop];
      const vertices=stop===first?coords:[...coords].reverse();
      for(const v of vertices){const vertex={latitude:v[0],longitude:v[1]};if(metres(vertex,stop)>80)break;connected.push(vertex);}
      result.push({stop,corridors,regionPoints:connected});
    }
    prepared.set(stops,{coords,official:signature,endpoints:result});endpoints.push(...result);
  }
  const merged=new Map<string,Endpoint>();
  for(const endpoint of endpoints){const existing=merged.get(endpoint.stop.paradaId);if(existing){existing.corridors.push(...endpoint.corridors);existing.regionPoints.push(...endpoint.regionPoints);}else merged.set(endpoint.stop.paradaId,{stop:endpoint.stop,corridors:[...endpoint.corridors],regionPoints:[...endpoint.regionPoints]});}
  return [...merged.values()];
}
type Observation=Point&{at:number};
type Track={line:string;at:number;latitude:number;longitude:number;terminal:string;stop:Parada;distance:number;dwellStart:number;stationary:number;moving:number;state:TerminalPresence['state']|null;samples:Observation[];pattern?:string;contextAt?:number;progress?:number;historySpeed?:number;path?:OriginPath;family?:string;directionName?:string};
// These are bounded candidate regions around verified official line endpoints,
// not surveyed terminal polygons. A lone fix only says 'Na região da origem'.
export const ORIGIN_REGION=Object.freeze({radiusMetres:100,stationaryMetres:80,exitMetres:130,maxGapMs:480000});
export type TerminalRegionPolicy={radiusMetres:number;stationaryMetres:number;exitMetres:number;maxGapMs:number};
function regionPolicy(line:LinhaParaMostrar,endpoint:Endpoint):TerminalRegionPolicy{
 const p={...ORIGIN_REGION,...line.terminalRegionPolicy?.[endpoint.stop.codigo??endpoint.stop.paradaId]};
 return Object.values(p).every(Number.isFinite)&&p.stationaryMetres>=35&&p.stationaryMetres<=p.radiusMetres&&p.radiusMetres<=120&&p.exitMetres>p.radiusMetres&&p.exitMetres<=180&&p.maxGapMs>=120000&&p.maxGapMs<=480000?p:ORIGIN_REGION;
}
const withinOrigin=(endpoint:Endpoint,location:Point,distance:number,region:TerminalRegionPolicy)=>distance<=region.radiusMetres
 &&endpoint.regionPoints.some(point=>metres(location,point)<=60);
export type TerminalDiagnostic={key:string;code:string;stage:string;reason:string;physicalAt:number;distanceMetres?:number;state?:string};
export type TerminalDiagnostics=(event:TerminalDiagnostic)=>void;
export function createTerminalTracker(policy:Readonly<GpsPresentationPolicy>=GPS_POLICY,diagnostic?:TerminalDiagnostics){
 const tracks=new Map<string,Track>();
 const blocked=new Map<string,{identity:string;at:number}>();
 return (lines:LinhaParaMostrar[],now:number)=>{
  const seen=new Set<string>();
  for(const line of lines){
   const localPolicy={...policy,...line.terminalPolicy};
   if(line.modal!=='onibus'||!line.linhaId)continue;
   const endpoints=lineTerminals(line,policy);
   for(const p of line.posicoes??[]){
    p.terminalPresence=undefined;p.vehicleState=undefined;
    if(!p.backendUnified)continue;
    const key=p.idVisual??`road:${p.ordem||p.id}`;seen.add(key);
    const at=Number(p.timestamp),identity=`${line.linhaId}|${line.nome}`,location={latitude:Number(p.latitude),longitude:Number(p.longitude)};
    const age=now-at;let track=tracks.get(key);
    let rejectedReason:string|undefined;
    const barrier=blocked.get(key);
    if(barrier?.identity===identity&&at<=barrier.at){diagnostic?.({key,code:line.nome,stage:'terminal',reason:'waiting_for_new_gps_after_conflict',physicalAt:at});continue;}
    if(barrier)blocked.delete(key);
    if(track?.line!==identity){tracks.delete(key);track=undefined;}
    if(track){
      const equivalent=endpoints.find(e=>e.stop.paradaId===track!.stop.paradaId&&e.stop.latitude===track!.stop.latitude&&e.stop.longitude===track!.stop.longitude&&e.stop.nome===track!.stop.nome);
      if(equivalent)track.stop=equivalent.stop;
    }
    const unchanged=track&&at===track.at&&location.latitude===track.latitude&&location.longitude===track.longitude?endpoints.find(e=>e.stop===track!.stop):undefined;
    const nearest=unchanged?{endpoint:unchanged,distance:track!.distance}:endpoints.map(e=>({endpoint:e,distance:metres(location,e.stop)})).sort((a,b)=>a.distance-b.distance)[0];
    // Once an origin is established, do not switch to another nearby endpoint.
    const prior=nearest&&track?.state&&(track.distance<=regionPolicy(line,nearest.endpoint).exitMetres||track.pattern||track.path)?endpoints.find(e=>e.stop.paradaId===track!.terminal):undefined;
    const near=prior?{endpoint:prior,distance:unchanged?track!.distance:metres(location,prior.stop)}:nearest;
    const speed=p.speedObservedAt===at?p.lastObservedSpeedKmh:undefined;
    const realDisplacement=track&&at>track.at?metres(location,track):0;
    const derivedSpeed=track&&at-track.at>=5000&&at-track.at<=120000&&realDisplacement>=10?realDisplacement*3600/(at-track.at):undefined;
    const movementSpeed=speed===0&&derivedSpeed!=null&&derivedSpeed<=120?derivedSpeed:speed;
    const region=near?regionPolicy(line,near.endpoint):ORIGIN_REGION;
    const report=(reason:string)=>diagnostic?.({key,code:line.nome,stage:'terminal',reason,physicalAt:at,distanceMetres:near?.distance,state:track?.state??undefined});
    if(!gpsPresentation(at,now,policy).visible||p.locationUncertain||!near){tracks.delete(key);report(!near?'official_terminal_or_geometry_missing':p.locationUncertain?'uncertain_location':'gps_expired');continue;}
    if(track&&(at<track.at||at===track.at&&metres(location,track)>1||at>track.at&&metres(location,track)>Math.max(35,(at-track.at)/1000*33))){
      blocked.set(key,{identity,at:Math.max(at,track.at)});tracks.delete(key);report('regressive_or_incompatible_displacement');continue;
    }
    if(!track||at>track.at||track.stop!==near.endpoint.stop){
     if(!track||track.stop!==near.endpoint.stop||at-track.at>region.maxGapMs){
      track={line:identity,at:0,...location,terminal:near.endpoint.stop.paradaId,stop:near.endpoint.stop,distance:near.distance,dwellStart:at,stationary:0,moving:0,state:withinOrigin(near.endpoint,location,near.distance,region)?'Na região da origem':null,samples:[]};
     }
     const newEvidence=at>track.at;
     if(newEvidence){
      // A public radar expiry breaks stationary proof, even if map retention is longer.
      if(track.state==='No terminal'&&track.at>0&&at-track.at>300000){track.stationary=0;track.dwellStart=at;track.state='Na região da origem';}
      track.historySpeed=undefined;
      const moved=track.at?metres(location,track):0;
      const interval=at-track.at;
      if(track.path){
       const q=projectPhysical(track.path.coords,location.latitude,location.longitude);
       if(!q||q.ambiguous||q.gap>40||track.progress!=null&&q.metres<track.progress-15){
        const pastPrefix=!!q&&!q.ambiguous&&q.metres>=track.path.metres-15;
        track.path=undefined;
        if(!pastPrefix){track.directionName=undefined;track.pattern=undefined;track.contextAt=undefined;track.moving=0;track.family=undefined;track.state=withinOrigin(near.endpoint,location,near.distance,region)?'Na região da origem':null;}
       }
      }
      const stationary= speed!=null?speed<=2&&(moved<=12||near.distance<track.distance-10):track.at>0&&interval>=localPolicy.dwellMs&&moved<=12;
      if(age<policy.delayedMs&&near.distance<=region.stationaryMetres&&withinOrigin(near.endpoint,location,near.distance,region)&&stationary){
       if(!track.stationary){track.dwellStart=at;
        if(speed==null&&track.at>0&&moved<=12&&interval>=localPolicy.dwellMs&&track.distance<=region.stationaryMetres){track.dwellStart=track.at;track.stationary=1;}
       }
       track.stationary++;track.moving=0;
       if(track.stationary>=2&&at-track.dwellStart>=localPolicy.dwellMs){track.state='No terminal';track.pattern=undefined;track.path=undefined;track.progress=undefined;track.contextAt=undefined;track.samples=[];}
      }else{
       track.stationary=0;
       if(track.state&&age<policy.delayedMs&&moved>=10&&interval>0&&interval<=180000){
        const bearing=(Math.atan2((location.longitude-track.longitude)*Math.cos(location.latitude*Math.PI/180),location.latitude-track.latitude)*180/Math.PI+360)%360;
        const candidates=near.endpoint.corridors.flatMap(c=>{
         const before=projectPhysical(c.coords,track!.latitude,track!.longitude),current=projectPhysical(c.coords,location.latitude,location.longitude);
         if(!before||!current||current.ambiguous||before.ambiguous||current.gap>40||before.gap>60)return [];
         const advance=current.metres-before.metres,angle=Math.abs((bearing-current.heading+540)%360-180);
         return advance>=10&&advance<=moved*1.8&&angle<=60&&current.metres<=(c.maxMetres??localPolicy.initialMetres)?[{c,current,advance}]:[];
        });
        if(candidates.length>0&&(movementSpeed==null||movementSpeed>=4)){
         const candidate=candidates[0],family=candidates.map(c=>c.c),signature=family.map(c=>c.pattern).sort().join('|');
         if(track.family!==signature)track.pattern=undefined;
         track.moving=track.family===signature?track.moving+1:1;track.family=signature;
         if(movementSpeed!=null&&movementSpeed>=4&&candidate.advance>=20)track.state='Saindo do terminal';
         track.directionName=originDestination(family);
         track.contextAt=at;track.progress=candidate.current.metres;
         const path=originPath(family);
         if(path&&candidates.every(c=>c.current.metres<=path.metres)){
          track.path=path;track.contextAt=at;track.progress=candidate.current.metres;
          if(track.moving>=2)track.historySpeed=candidate.advance*3600/interval;
         }else track.path=undefined;
         // Two distinct progressive intervals, from a physically observed origin.
         if(track.moving>=2){track.pattern=candidates.length===1?candidate.c.pattern:undefined;track.state=near.distance>=region.exitMetres?'A caminho':'Saindo do terminal';}
        }else{track.moving=0;track.pattern=undefined;track.path=undefined;track.contextAt=undefined;track.progress=undefined;track.historySpeed=undefined;
         if(near.distance>region.exitMetres)track.state=null;
        }
       }
       if(near.distance>region.exitMetres&&!track.pattern&&!track.moving)track.state=null;
      }
      if(track.pattern){
       const c=near.endpoint.corridors.find(c=>c.pattern===track!.pattern),q=c&&projectPhysical(c.coords,location.latitude,location.longitude);
       if(!q||q.ambiguous||q.gap>60||q.metres>(c!.maxMetres??localPolicy.initialMetres)||track.progress!=null&&q.metres<track.progress-30){track.state=withinOrigin(near.endpoint,location,near.distance,region)?'Na região da origem':null;track.pattern=undefined;track.path=undefined;track.contextAt=undefined;track.historySpeed=undefined;track.progress=undefined;track.moving=0;}
       else track.progress=q.metres;
      }
      if(track.pattern&&p.operationConfirmed&&p.padraoVersaoId&&p.padraoVersaoId!==track.pattern){
       track.state=withinOrigin(near.endpoint,location,near.distance,region)?'Na região da origem':null;
       track.pattern=undefined;track.path=undefined;track.contextAt=undefined;track.progress=undefined;track.historySpeed=undefined;track.moving=0;
       rejectedReason='operational_pattern_conflict';
      }
      track.at=at;track.latitude=location.latitude;track.longitude=location.longitude;track.distance=near.distance;
      track.samples=[...track.samples,{...location,at}].slice(-6);
     }
     tracks.set(key,track);
    }
    const endpoint=endpoints.find(e=>e.stop.paradaId===track?.terminal);
    if(track?.contextAt!=null&&now-track.contextAt>=policy.contextMs){track.pattern=undefined;track.path=undefined;track.contextAt=undefined;track.progress=undefined;track.historySpeed=undefined;if(track.distance>region.exitMetres)track.state=null;}
    if(!endpoint||!track?.state){report(rejectedReason??(near.distance>region.radiusMetres?'outside_origin_without_departure_history':'dwell_insufficient'));continue;}
    p.vehicleState=track.state;
    if(!p.operationConfirmed&&p.contextConfidence!=='confirmed')p.presencaRotulo=track.state;
    if(track.state==='No terminal')p.backendMotionEligible=false;
    // An incoming itinerary ending here does not identify the next outgoing run.
    const outgoingKnown=endpoint.corridors.some(c=>c.pattern===p.padraoVersaoId)?p.padraoVersaoId??null:track.pattern??null;
    p.terminalPresence={key,order:p.ordem||p.id||'',lineId:line.linhaId,code:line.nome,physicalAt:at,terminalId:endpoint.stop.paradaId,terminalName:endpoint.stop.nome,state:track.state,knownPattern:outgoingKnown,corridors:endpoint.corridors,operationalConfirmed:p.operationConfirmed===true||p.contextConfidence==='confirmed',validUntil:Math.min(p.backendValidUntil??Infinity,at+policy.publicMs),dwellSince:track.state==='No terminal'&&track.stationary>=2?track.dwellStart:undefined,contextAt:track.contextAt,progressMetres:track.progress,speedKmh:speed,speedAt:speed!=null?at:undefined,historySpeedKmh:track.historySpeed};
    Object.assign(p.terminalPresence,{latitude:location.latitude,longitude:location.longitude,directionName:track.contextAt!=null?track.directionName??track.path?.destinationName:undefined,originPath:track.path});
    report(track.state==='Na região da origem'?'provisional_origin':'eligible');
   }
  }
  for(const key of tracks.keys())if(!seen.has(key))tracks.delete(key);
  for(const key of blocked.keys())if(!seen.has(key))blocked.delete(key);
 };
}
/** Intersection of sequence and route distance, never geographic stop proximity. */
type RadarLink={linhaId:string;padraoVersaoId?:string};
export type RadarArrival={ordem?:string|null;vehicleId?:string|null;codigoVeiculo?:string|null;linhaId?:string;
 referenciaDisponivel?:boolean;etaSeg?:number|null;secondsUntilEvent?:number|null;estimatedAt?:string|null;scheduledAt?:string|null;padraoVersaoId?:string;paradaId?:string};
export interface TerminalRadarVehicle extends TerminalPresence {originToStopMetres?:number;distanceToStopMetres?:number;estimatedMinutes?:[number,number]}
export function terminalVehicleFocus(v:TerminalPresence,now:number){
 if(!v.order||!v.lineId||!Number.isFinite(v.latitude)||!Number.isFinite(v.longitude)||Math.abs(v.latitude!)>90||Math.abs(v.longitude!)>180||!gpsPresentation(v.physicalAt,now).visible||now>v.validUntil)return null;
 return {ordem:v.order,idVisual:v.key,latitude:v.latitude!,longitude:v.longitude!,zoom:17};
}
export function reconcileTerminalPlaceholders<T extends RadarArrival>(arrivals:readonly T[],vehicles:readonly TerminalPresence[]):T[]{
 return arrivals.filter(a=>!vehicles.some(v=>(a.ordem??a.codigoVeiculo??a.vehicleId)?.trim().toUpperCase()===v.order.trim().toUpperCase()&&(!a.linhaId||a.linhaId===v.lineId)));
}
export function terminalRadarReason(v:TerminalPresence,stopId:string|undefined,links:readonly RadarLink[],arrivals:readonly RadarArrival[],now:number,policy:Readonly<GpsPresentationPolicy>=GPS_POLICY){
 if(!stopId)return 'stop_missing';
 if(now>v.validUntil||now-v.physicalAt>300000||!gpsPresentation(v.physicalAt,now,policy).visible)return 'gps_expired';
 if(!links.some(l=>l.linhaId===v.lineId))return 'stop_line_incompatible';
 // A GTFS operation without an actual arrival must not erase physical tracking.
 const hasArrival=arrivals.some(a=>{
  const time=a.etaSeg??a.secondsUntilEvent;
  const dated=a.estimatedAt??a.scheduledAt;
  const datedAt=dated?Date.parse(dated):NaN;
  const valid=Number.isFinite(datedAt)?datedAt>=now:time!=null&&Number.isFinite(time)&&time>=0;
  return valid&&(a.ordem??a.codigoVeiculo??a.vehicleId)?.trim().toUpperCase()===v.order.trim().toUpperCase()
   &&a.linhaId===v.lineId&&(!a.paradaId||a.paradaId===stopId)
   &&(!a.padraoVersaoId||v.corridors.some(c=>c.pattern===a.padraoVersaoId&&(!v.knownPattern||c.pattern===v.knownPattern)
    &&links.some(l=>l.linhaId===v.lineId&&(!l.padraoVersaoId||l.padraoVersaoId===c.pattern))&&(c.originId===stopId||c.stops.some(s=>s.id===stopId))));
 });
 if(hasArrival&&v.state!=='No terminal')return 'reconciled_with_valid_arrival';
 const patterns=v.corridors.filter(c=>(!v.knownPattern||c.pattern===v.knownPattern)&&links.some(l=>l.linhaId===v.lineId&&(!l.padraoVersaoId||l.padraoVersaoId===c.pattern)));
 if(!patterns.length)return 'pattern_or_origin_incompatible';
 if(v.terminalId===stopId&&(v.state==='No terminal'||v.state==='Na região da origem')&&patterns.some(c=>c.originId===stopId))return 'eligible';
 const stops=patterns.flatMap(c=>c.stops.filter(s=>s.id===stopId).map(s=>({s,c})));
 if(!stops.length)return 'stop_not_in_initial_sequence';
 if(!stops.some(({s,c})=>s.rank<=(c.maxStops??policy.initialStops)&&s.metres>0&&s.metres<=(c.maxMetres??policy.initialMetres)))return 'stop_outside_corridor_limit';
 if(v.progressMetres!=null&&stops.every(({s})=>s.metres<=v.progressMetres!+10))return 'stop_already_passed';
 return 'eligible';
}
/** No geometric work on the radar clock: estimates use the last real progress. */
export function terminalRadarVehicles(vehicles:readonly TerminalPresence[],stopId:string|undefined,
 links:readonly RadarLink[],arrivals:readonly RadarArrival[],now:number,policy:Readonly<GpsPresentationPolicy>=GPS_POLICY):TerminalRadarVehicle[]{
 return vehicles.filter(v=>terminalRadarReason(v,stopId,links,arrivals,now,policy)==='eligible').map(v=>{
  const patterns=v.corridors.filter(c=>(!v.knownPattern||c.pattern===v.knownPattern)&&links.some(l=>l.linhaId===v.lineId&&(!l.padraoVersaoId||l.padraoVersaoId===c.pattern)));
  const references=patterns.map(c=>c.originId===stopId?0:c.stops.find(s=>s.id===stopId&&s.rank<=(c.maxStops??policy.initialStops)&&s.metres>0&&s.metres<=(c.maxMetres??policy.initialMetres))?.metres);
  // A shared origin is useful without guessing a route variant. Disagreeing variants stay unknown.
  const originToStopMetres=references.length&&references.every((d):d is number=>d!=null&&Number.isFinite(d)&&d>=0)&&Math.max(...references as number[])-Math.min(...references as number[])<=1?Math.max(...references as number[]):undefined;
  const stop=(v.knownPattern?v.corridors.find(c=>c.pattern===v.knownPattern)?.stops:v.originPath?.stops)?.find(s=>s.id===stopId);
  const remaining=stop&&v.progressMetres!=null?stop.metres-v.progressMetres:undefined;
  const recent=v.speedAt===v.physicalAt&&now-v.physicalAt<policy.currentSpeedMs;
  const speed=v.speedKmh,history=v.historySpeedKmh;
  const coherent=recent&&speed!=null&&speed>=5&&speed<=70&&history!=null&&history>=5&&Math.abs(speed-history)<=Math.max(5,speed*.5);
  const seconds=coherent&&remaining!=null&&remaining>10?remaining/(Math.min(speed!,history!)/3.6):undefined;
  // Wide interval includes stop/traffic uncertainty. Never a departure estimate.
  const estimatedMinutes: [number,number]|undefined=seconds!=null?[Math.max(1,Math.floor(seconds/60)),Math.max(2,Math.ceil(seconds/60*1.6+1))]:undefined;
  return {...v,originToStopMetres,distanceToStopMetres:remaining,estimatedMinutes};
 });
}
