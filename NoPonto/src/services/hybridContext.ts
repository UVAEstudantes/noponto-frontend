import type { LinhaParaMostrar } from '../components/mapOSM/types';
import { projectPhysical,routeStopProjections,type Projection } from './hybridGps';
import { composeUnifiedSnapshots, type UnifiedSnapshot } from './unifiedLocationContract';
import { GPS_POLICY,type GpsPresentationPolicy } from './gpsPresentationPolicy';
import { createTerminalTracker,lineTerminals,type TerminalDiagnostics } from './terminalTracking';

type Sample = { lat:number; lon:number; at:number };
type Context = { pattern:string; direction:string|null; validatedAt:number; kind:'retained'|'inferred' };
type Track = { line:string; samples:Sample[]; context?:Context; operationAt:number; blockedAt:number;lastSpeed?:number;speedAt?:number;stationary?:number;stationaryAt?:number;lastProjection?:{pattern:string;at:number;point:Projection} };
const distance=(a:Sample,b:Sample)=>Math.hypot(a.lat-b.lat,(a.lon-b.lon)*Math.cos(a.lat*Math.PI/180))*111195;

/** Mount-scoped physical evidence. No persistence, operational writes, or ITS renewal. */
function createHybridProcessor(metrics:HybridMetrics|undefined,policy:Readonly<GpsPresentationPolicy>,diagnostic?:TerminalDiagnostics) {
  const CONTEXT_MS=policy.contextMs;
  const tracks=new Map<string,Track>();
  const terminalTrack=createTerminalTracker(policy,diagnostic);
  return (lines:LinhaParaMostrar[], snapshots:UnifiedSnapshot[], now:number):LinhaParaMostrar[] => {
    const result=composeUnifiedSnapshots(lines,snapshots,now,false,policy);
    terminalTrack(result,now);
    const vehicles=new Map(snapshots.filter(s=>s.enabled).flatMap(s=>s.vehicles.map(v=>[`${s.lineCode}|${v.order}`,v] as const)));
    const seen=new Set<string>();
    for(const line of result) for(const p of line.posicoes??[]) {
      if(!p.backendUnified)continue;
      p.directionConfidence=undefined;p.routeConfidence=undefined;p.physicalRoutePattern=undefined;
      const id=p.ordem!; seen.add(id);
      const vehicle=vehicles.get(`${line.nome}|${id}`);
      if(!vehicle)continue;
      let sample={lat:Number(p.latitude),lon:Number(p.longitude),at:Number(p.timestamp)};
      const identity=`${line.linhaId}|${line.nome}`;
      let track=tracks.get(id);
      if(!track||track.line!==identity) {
        track={line:identity,samples:[],operationAt:0,blockedAt:0};tracks.set(id,track);
      }
      if(p.lastObservedSpeedKmh!=null&&sample.at>=(track.speedAt??-Infinity)){
        track.lastSpeed=p.lastObservedSpeedKmh;track.speedAt=sample.at;
      }
      if(track.speedAt!=null&&now-track.speedAt>policy.publicMs){track.lastSpeed=undefined;track.speedAt=undefined;}
      p.lastObservedSpeedKmh=track.lastSpeed;p.speedObservedAt=track.speedAt;
      const last=track.samples.at(-1);
      if(last&&sample.at<last.at) {
        sample=last;p.latitude=last.lat;p.longitude=last.lon;p.timestamp=last.at;
        p.atualizadoEm=new Date(last.at).toISOString();p.velocidade=undefined;
      }
      const dt=last?(sample.at-last.at)/1000:0;
      const moved=last?distance(last,sample):0;
      const derived=dt>=5&&dt<=120&&moved>=10&&moved/dt<=33?moved*3.6/dt:undefined;
      p.projectionSpeedKind='observed';
      // A current displacement may contradict a zero provider speed. This is
      // an estimate from two real fixes, never a renewed old speed reading.
      const effectiveSpeed=p.speedObservedAt===sample.at?p.lastObservedSpeedKmh:undefined;
      let motionSpeed=effectiveSpeed===0&&derived!=null?derived:effectiveSpeed;
      const stationaryContradiction=dt>=5&&moved<=3&&effectiveSpeed!=null&&effectiveSpeed>2;
      if(stationaryContradiction)motionSpeed=undefined;
      if(effectiveSpeed===0&&derived!=null)p.projectionSpeedKind='displacement';
      if(dt>0){
        if(dt>=5&&moved<=12&&(effectiveSpeed==null||effectiveSpeed<=2||moved<=3)){if(!track.stationary)track.stationaryAt=last!.at;track.stationary=(track.stationary??0)+1;}else{track.stationary=0;track.stationaryAt=undefined;}
      }
      p.physicalMotionState=(track.stationary??0)>=2&&sample.at-(track.stationaryAt??sample.at)>=15000&&(effectiveSpeed==null||effectiveSpeed<=2)?'stopped':(track.stationary??0)>0?'pause_pending':'moving';
      const invalid=vehicle.location.uncertain||now-sample.at>policy.publicMs||
        !!last&&(dt>120||dt===0&&distance(last,sample)>1||dt>0&&distance(last,sample)>Math.max(35,dt*33));
      let restriction=invalid?(vehicle.location.uncertain?'physical_uncertain':now-sample.at>policy.publicMs?'gps_expired':'gap_or_displacement_invalid'):undefined;
      p.estimatedSpeedKmh=!invalid&&effectiveSpeed===0?derived:undefined;
      if(!invalid&&last&&dt>0&&distance(last,sample)>=10){
        p.direcao=(Math.atan2((sample.lon-last.lon)*Math.cos(sample.lat*Math.PI/180),sample.lat-last.lat)*180/Math.PI+360)%360;
      }
      if(invalid) {track.context=undefined;track.samples=[];track.lastProjection=undefined;track.blockedAt=Math.max(track.blockedAt,sample.at);}
      if(!invalid&&(!last||sample.at>last.at))track.samples=[...track.samples,sample].slice(-6);
      const op=vehicle.operational, opAt=op?Date.parse(op.timestampGps):0;
      if(op&&(op.status!==0||track.context&&op.padraoVersaoId!==track.context.pattern&&opAt>=track.operationAt)) {
        restriction='operational_conflict';
        track.context=undefined;track.samples=[sample];
        if(op.status!==0)track.blockedAt=Math.max(track.blockedAt,sample.at);
      }
      if(op&&(opAt>track.operationAt||!track.context&&opAt===track.operationAt)) {
        track.operationAt=opAt;
        // An unusable same-trip update does not revoke prior validated evidence.
        // Its original validation time is never renewed by this fallback.
        if(op.status!==0||op.linhaId!==line.linhaId||op.codigoLinha!==line.nome||op.padraoVersaoId!==track.context?.pattern)track.context=undefined;
        if(!invalid&&opAt>track.blockedAt&&opAt<=now&&now-opAt<CONTEXT_MS&&op.status===0
          &&op.linhaId===line.linhaId&&op.codigoLinha===line.nome&&op.padraoVersaoId&&op.sentidoId) {
          const index=line.itinerarioSegmentoMap?.[op.padraoVersaoId];
          const coords=index==null?undefined:line.segmentos?.[index];
          const origin=coords&&op.latitude!=null&&op.longitude!=null?projectPhysical(coords,op.latitude,op.longitude):null;
          const current=coords?projectPhysical(coords,sample.lat,sample.lon):null;
          const elapsed=(sample.at-opAt)/1000;
          const previousOnNew=coords&&last?projectPhysical(coords,last.lat,last.lon):null;
          const changingPattern=track.lastProjection&&track.lastProjection.pattern!==op.padraoVersaoId;
          const aligned=!changingPattern||!current||!previousOnNew||current.metres>=previousOnNew.metres-30
            ||current.metres<=100&&lineTerminals(line,policy).some(e=>e.corridors.some(c=>c.pattern===op.padraoVersaoId));
          if(origin&&current&&!origin.ambiguous&&!current.ambiguous&&origin.gap<=60&&current.gap<=60
            &&aligned&&elapsed>=0&&current.metres-origin.metres>=-30&&current.metres-origin.metres<=Math.max(35,elapsed*33))
            track.context={pattern:op.padraoVersaoId,direction:op.sentidoId,validatedAt:opAt,kind:'retained'};
        }
      }
      const shape=(pattern:string)=>{const index=line.itinerarioSegmentoMap?.[pattern];return index==null?undefined:line.segmentos?.[index];};
      const projectContext=(pattern:string)=>{
        const coords=shape(pattern),prior=track.lastProjection;
        if(prior?.pattern===pattern&&sample.at===prior.at)return prior.point;
        const elapsed=prior?(sample.at-prior.at)/1000:0;
        return coords?projectPhysical(coords,sample.lat,sample.lon,prior?.pattern===pattern&&elapsed>=0&&elapsed<=120?{min:Math.max(0,prior.point.metres-30),max:prior.point.metres+Math.max(35,elapsed*33)}:undefined):null;
      };
      const departure=p.terminalPresence;
      const context=track.context;
      if(context) {
        const coords=shape(context.pattern);
        const projected=projectContext(context.pattern);
        const prior=track.lastProjection?.pattern===context.pattern?track.lastProjection.point:!track.lastProjection&&coords&&last?projectPhysical(coords,last.lat,last.lon):null;
        const expired=now-context.validatedAt>=CONTEXT_MS;
        const incompatible=!projected||projected.gap>60||projected.ambiguous
          ||context.kind==='inferred'&&departure?.originPath&&!departure.originPath.patterns.includes(context.pattern)
          ||!!prior&&(projected!.metres<prior.metres-30||projected!.metres-prior.metres>Math.max(35,dt*33));
        if(expired&&!incompatible&&!invalid&&dt>0&&track.samples.length>=3&&track.lastProjection?.pattern===context.pattern&&departure?.state!=='No terminal'&&(!op||now-opAt>=CONTEXT_MS)){
          track.context={pattern:context.pattern,direction:null,validatedAt:sample.at,kind:'inferred'};
        }else if(expired||incompatible) {
          restriction=expired?'context_expired':!projected?'geometry_missing':projected.ambiguous?'route_ambiguous':projected.gap>60?'off_route':'route_reverse_or_jump';
          track.context=undefined;
          if(incompatible){track.samples=[sample];track.blockedAt=Math.max(track.blockedAt,sample.at);}
        }else if(context.kind==='inferred'&&dt>0&&!invalid){
          context.validatedAt=sample.at;
        }
      }
      const operationalConflict=!!op&&now-opAt<CONTEXT_MS&&(op.status!==0||!!op.padraoVersaoId&&op.padraoVersaoId!==departure?.knownPattern);
      if(!invalid&&!operationalConflict&&!track.context&&departure?.knownPattern&&departure.contextAt!=null&&now-departure.contextAt<CONTEXT_MS
        &&(departure.state==='Saindo do terminal'||departure.state==='A caminho')){
        track.context={pattern:departure.knownPattern,direction:null,validatedAt:departure.contextAt,kind:'inferred'};
      }
      // Four real samples, at least 45 seconds and 70 metres of coherent progress.
      // Every plausible pattern competes; shared geometry remains unknown.
      if(!invalid&&dt>0&&!track.context&&track.samples.length>=4
        &&(!line.modoSentido||line.modoSentido==='ambos')&&Object.keys(line.itinerarioSegmentoMap??{}).length>=2
        &&Object.keys(line.itinerarioSegmentoMap??{}).every(pattern=>!!shape(pattern)?.length)) {
        const inferenceStart=performance.now();
        const candidates=Object.keys(line.itinerarioSegmentoMap??{}).filter(pattern=>{
          const coords=shape(pattern);if(!coords)return false;
          const points=track!.samples.map(s=>projectPhysical(coords,s.lat,s.lon));
          if(points.some(q=>!q||q.gap>40||q.ambiguous))return false;
          return track!.samples.at(-1)!.at-track!.samples[0].at>=45000
            &&points.at(-1)!.metres-points[0]!.metres>=70
            &&points.every((q,i)=>{
              if(i===0)return true;
              const a=track!.samples[i-1],b=track!.samples[i];
              const bearing=(Math.atan2((b.lon-a.lon)*Math.cos(b.lat*Math.PI/180),b.lat-a.lat)*180/Math.PI+360)%360;
              const angle=Math.abs((bearing-q!.heading+540)%360-180);
              const advance=q!.metres-points[i-1]!.metres;
              return distance(a,b)<=12&&Math.abs(advance)<=15||advance>=10&&advance<=distance(a,b)*1.8&&angle<=70;
            });
        });
        if(candidates.length===1)track.context={pattern:candidates[0],direction:null,validatedAt:sample.at,kind:'inferred'};
        if(metrics)metrics.inferenceMs=(metrics.inferenceMs??0)+performance.now()-inferenceStart;
      }
      const selected=track.context;
      if(!selected) {
        p.contextConfidence=undefined;p.contextValidatedAt=undefined;
        p.padraoVersaoId=null;p.sentidoId=null;p.sentidoNome=undefined;p.posicaoNaRota=null;
        p.padraoOperacionalId=null;p.proximaOcorrenciaParadaPadraoId=null;
        p.proximaParadaNome=null;p.distanciaProximaParadaMetros=null;p.backendMotionEligible=false;p.physicalOnly=true;
        p.motionReason=restriction??'no_reliable_route';p.nextStopReason=p.motionReason;
        const path=departure?.originPath;
        if(!invalid&&!operationalConflict&&departure?.directionName&&departure.contextAt!=null&&now-departure.contextAt<CONTEXT_MS
          &&(departure.state==='Saindo do terminal'||departure.state==='A caminho')){
          p.sentidoNome=departure.directionName;p.directionConfidence='origin';
        }
        if(!invalid&&!operationalConflict&&path&&departure.contextAt!=null&&now-departure.contextAt<CONTEXT_MS
          &&(departure.state==='Saindo do terminal'||departure.state==='A caminho')){
          p.sentidoNome=path.destinationName;p.directionConfidence=path.destinationName?'origin':undefined;
          const q=projectPhysical(path.coords,sample.lat,sample.lon);
          const reference=shape(path.patterns[0]),full=reference?projectPhysical(reference,sample.lat,sample.lon):null;
          if(q&&!q.ambiguous&&q.gap<=40&&full&&!full.ambiguous&&Math.abs(full.metres-q.metres)<10&&departure.progressMetres!=null&&departure.progressMetres<=path.metres){
            p.contextConfidence='inferred';p.contextValidatedAt=departure.contextAt;p.physicalOnly=false;
            p.routeConfidence=path.patterns.length>1?'shared':'origin';p.physicalRoutePattern=path.patterns[0];
            p.comprimentoRotaMetros=full.totalMetres;p.posicaoNaRota=full.progress;
            p.projectionUntil=Math.min(sample.at+policy.baseProjectionMs,departure.contextAt+CONTEXT_MS,p.backendValidUntil??Infinity);
            p.projectionSpeedKmh=motionSpeed;
            p.projectionMaxMetres=Math.min(policy.maxProjectionMetres,Math.max(0,path.metres-q.metres-10));
            p.motionRemainingMetres=path.metres-q.metres;
            p.backendMotionEligible=p.projectionSpeedKmh!=null&&p.projectionSpeedKmh>2&&now<p.projectionUntil&&p.projectionMaxMetres>5;
            const next=path.stops.find(s=>s.metres>q.metres+10);
            p.proximaParadaNome=next?(line.paradasPorPadrao?.[path.patterns[0]]??[]).find(s=>s.paradaId===next.id)?.nome??null:null;
            p.distanciaProximaParadaMetros=next?next.metres-q.metres:null;
          }
        }
        if(p.presencaRotulo==='Em viagem')p.presencaRotulo=Number(p.velocidade)>2?'Em movimento':p.velocidade===0?'Parado':'GPS disponível';
        if(motionSpeed!=null&&motionSpeed>2&&p.presencaRotulo==='Parado')p.presencaRotulo='Em movimento';
        if(p.physicalMotionState==='pause_pending'&&p.presencaRotulo==='Parado')p.presencaRotulo='GPS disponível';
        p.motionReason=p.backendMotionEligible?'projection_eligible':p.physicalRoutePattern?(p.projectionMaxMetres!<=5?'shared_prefix_end':stationaryContradiction?'speed_without_displacement':p.projectionSpeedKmh===0?'observed_stop':p.projectionSpeedKmh==null?'no_current_speed':'projection_horizon'):p.motionReason;
        p.nextStopReason=p.proximaParadaNome?'available':p.physicalRoutePattern?'no_common_stop_before_branch':p.nextStopReason;
        continue;
      }
      const coords=shape(selected.pattern);const point=projectContext(selected.pattern);
      if(!point||point.gap>60||point.ambiguous)continue;
      if(track.lastProjection&&track.lastProjection.pattern!==selected.pattern&&p.projectionSpeedKind==='displacement'){
        motionSpeed=effectiveSpeed;p.estimatedSpeedKmh=undefined;p.projectionSpeedKind='observed';
      }
      track.lastProjection={pattern:selected.pattern,at:sample.at,point};
      const active=!!op&&op.status===0&&op.padraoVersaoId===selected.pattern&&selected.validatedAt===opAt&&opAt<=sample.at&&opAt<=now&&now-opAt<60000;
      p.contextConfidence=active?'confirmed':selected.kind;
      if(active)p.presencaRotulo='Em viagem';
      p.contextValidatedAt=selected.validatedAt;
      p.padraoVersaoId=selected.pattern;p.sentidoId=selected.direction;
      if(!active){p.padraoOperacionalId=null;p.proximaOcorrenciaParadaPadraoId=null;}
      p.sentidoNome=(!active&&selected.kind==='inferred'?departure?.directionName:undefined)??line.itinerarioSentidoMap?.[selected.pattern];
      if(!active&&selected.kind==='inferred'&&departure?.directionName)p.directionConfidence='origin';
      p.comprimentoRotaMetros=point.totalMetres;
      p.posicaoNaRota=point.progress;p.physicalOnly=false;
      const observed=motionSpeed;
      const history=track.samples.slice(-3);
      const coherent=history.length===3&&observed!=null&&observed>2&&history.every((s,i)=>{
        if(!i)return true;
        const before=history[i-1],seconds=(s.at-before.at)/1000;
        const a=projectPhysical(coords!,before.lat,before.lon),b=projectPhysical(coords!,s.lat,s.lon);
        const measured=seconds>0&&a&&b?(b.metres-a.metres)*3.6/seconds:0;
        return !!a&&!!b&&!a.ambiguous&&!b.ambiguous&&a.gap<=40&&b.gap<=40
          &&seconds>=10&&seconds<=60&&measured>2&&Math.abs(measured-observed)<=Math.max(5,observed*.5);
      });
      const horizon=coherent?policy.coherentProjectionMs:policy.baseProjectionMs;
      p.projectionUntil=Math.min(sample.at+horizon,selected.validatedAt+CONTEXT_MS,p.backendValidUntil??Infinity);
      p.projectionSpeedKmh=observed;
      p.projectionMaxMetres=policy.maxProjectionMetres;
      p.motionRemainingMetres=point.totalMetres-point.metres;
      p.backendMotionEligible=!invalid&&observed!=null&&observed>0&&now<p.projectionUntil;
      if(p.physicalMotionState==='pause_pending'&&!active&&p.presencaRotulo==='Parado')p.presencaRotulo='GPS disponível';
      if(!active&&p.physicalMotionState==='stopped'&&departure?.state!=='No terminal'&&now-sample.at<policy.delayedMs)p.presencaRotulo='Parado';
      if(!active&&stationaryContradiction&&departure?.state!=='No terminal')p.presencaRotulo='GPS disponível';
      if(!active&&p.presencaRotulo==='Em viagem')p.presencaRotulo=Number(p.velocidade)>2?'Em movimento':p.velocidade===0?'Parado':'GPS disponível';
      const stops=line.paradasPorPadrao?.[selected.pattern];
      const next=stops?routeStopProjections(coords!,stops,true)
        .find(q=>q.point&&!q.point.ambiguous&&q.point.gap<=60&&q.point.metres>point.metres+10):undefined;
      if(next||!active||vehicle.location.physicalAt!==op?.timestampGps) {
        p.proximaParadaNome=next?.stop.nome??null;
        p.distanciaProximaParadaMetros=next?next.point!.metres-point.metres:null;
      }
      // A restart can recover initial-corridor presence through the same
      // validated GTFS / multi-observation physical context, never proximity.
      if(!p.terminalPresence&&point.metres>10){
        const endpoint=lineTerminals(line,policy).find(e=>e.corridors.some(c=>c.pattern===selected.pattern&&point.metres<=(c.maxMetres??policy.initialMetres)));
        if(endpoint)p.terminalPresence={key:p.idVisual!,order:id,lineId:line.linhaId!,code:line.nome,physicalAt:sample.at,terminalId:endpoint.stop.paradaId,terminalName:endpoint.stop.nome,state:'A caminho',knownPattern:selected.pattern,corridors:endpoint.corridors,operationalConfirmed:p.operationConfirmed===true,validUntil:p.backendValidUntil??sample.at+policy.publicMs,contextAt:selected.validatedAt,progressMetres:point.metres,speedKmh:observed,speedAt:observed!=null?sample.at:undefined,historySpeedKmh:coherent?observed:undefined};
      }
      p.motionReason=p.backendMotionEligible?'projection_eligible':stationaryContradiction?'speed_without_displacement':observed===0?'observed_stop':observed==null?'no_current_speed':'projection_horizon';
      p.nextStopReason=p.proximaParadaNome?'available':'route_end_or_no_stop_ahead';
    }
    // Missing identities and deselected lines cannot resurrect context after restart/return.
    for(const id of tracks.keys())if(!seen.has(id))tracks.delete(id);
    return result;
  };
}

export type HybridMetrics={calls:number; processing:number; cached:number; lastMs:number; maxMs:number;inferenceMs?:number};
/** Clock-only renders reuse the exact result until an actual validity boundary. */
export function createHybridComposer(options:{enabled?:boolean;metrics?:HybridMetrics;policy?:Readonly<GpsPresentationPolicy>;diagnostic?:TerminalDiagnostics}={}) {
  const policy=options.policy??GPS_POLICY;
  const process=createHybridProcessor(options.metrics,policy,options.diagnostic);
  let priorLines:LinhaParaMostrar[]|undefined,priorSnapshots:UnifiedSnapshot[]=[];
  let versions='';
  let result:LinhaParaMostrar[]=[];let deadline=-Infinity,lastNow=-Infinity;
  return (lines:LinhaParaMostrar[],snapshots:UnifiedSnapshot[],now:number)=>{
    const metrics=options.metrics;if(metrics)metrics.calls++;
    const nextVersions=snapshots.map(s=>`${s.lineCode}:${s.revision}:${s.composedAt}:${s.enabled}`).join('|');
    const sameLines=priorLines&&lines.length===priorLines.length&&lines.every((line,i)=>{
      const old=priorLines![i];return line===old||Object.keys(line).length===Object.keys(old).length&&Object.entries(line).every(([key,value])=>old[key as keyof LinhaParaMostrar]===value);
    });
    if(sameLines&&versions===nextVersions&&snapshots.length===priorSnapshots.length&&snapshots.every((s,i)=>s===priorSnapshots[i])&&now>=lastNow&&now<deadline){
      if(metrics)metrics.cached++;return result;
    }
    const start=performance.now();
    result=options.enabled===false?composeUnifiedSnapshots(lines,snapshots,now,true,policy):process(lines,snapshots,now);
    priorLines=lines;priorSnapshots=snapshots.slice();versions=nextVersions;lastNow=now;deadline=Infinity;
    const boundary=(at:number)=>{if(at>now)deadline=Math.min(deadline,at);};
    for(const s of snapshots)for(const v of s.vehicles){
      for(const limit of [policy.currentSpeedMs,policy.baseProjectionMs,policy.coherentProjectionMs,policy.delayedMs,policy.attenuatedMs,policy.publicMs+1])boundary(Date.parse(v.location.physicalAt)+limit);
      boundary(Date.parse(v.location.validUntil));
      if(v.operational){boundary(Date.parse(v.operational.timestampGps)+policy.currentSpeedMs);boundary(Date.parse(v.operational.timestampGps)+policy.contextMs);}
      if(v.line.validatedAt)boundary(Date.parse(v.line.validatedAt)+600000);
    }
    for(const line of result)for(const p of line.posicoes??[]){
      if(p.contextValidatedAt)boundary(p.contextValidatedAt+policy.contextMs);
      if(p.speedObservedAt)boundary(p.speedObservedAt+policy.publicMs+1);
    }
    if(metrics){metrics.processing++;metrics.lastMs=performance.now()-start;metrics.maxMs=Math.max(metrics.maxMs,metrics.lastMs);}
    return result;
  };
}
