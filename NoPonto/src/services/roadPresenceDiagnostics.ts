import type { VeiculoMapa } from '@/src/types/veiculoMapa';
import type { ItinerarioPadraoVersaoV2 } from '@/src/types/estruturaV2';
import { physicalAge, RETENTION_MS, type RoadPresenceDiagnostic } from './roadPresence';

// Opt-in, development only, runtime console only. Never persist GPS bodies.
const enabled = typeof __DEV__ !== 'undefined' && __DEV__
  && process.env.EXPO_PUBLIC_ROAD_PRESENCE_TRACE_ENABLED === 'true';
const selected = process.env.EXPO_PUBLIC_ROAD_PRESENCE_TRACE_ORDEM?.trim().toUpperCase() ?? '';
const line = '838';
const last = new Map<string, { signature: string; at: number }>();
let lastRecognizedStage: string | null = null;
let selectedLine = line;
let lastDiscovery = 0;

type Observation = Pick<VeiculoMapa, 'idVisual'> & Partial<VeiculoMapa>;
export function tracesRoadVehicle(v: Pick<VeiculoMapa, 'idVisual'>): boolean {
  return enabled && !!selected && v.idVisual?.trim().toUpperCase() === `ROAD:${selected}`;
}
export function traceRoadPresence(stage: string, reason: string, v: Observation,
  facts: RoadPresenceDiagnostic = {}) {
  if (!tracesRoadVehicle(v)) return;
  const event: RoadPresenceDiagnostic = { stage, reason, order:selected, line:v.codigoLinha ?? null, gpsAt:v.atualizadoEm ?? null,
    lineId:v.linhaId ?? null,directionId:v.sentidoId ?? null,versionId:v.padraoVersaoId ?? null,...facts };
  const { gpsAgeSeconds: _age, ...stable } = event;
  void _age;
  const key=`${stage}:${facts.consumerContext ?? ''}`;
  const signature = JSON.stringify(stable),now=Date.now(),previous=last.get(key);
  if (previous?.signature===signature && now-previous.at<30000) return;
  // One selected identity and a bounded set of stage names; no history of coordinates.
  if (last.size>=32&&!last.has(key)) return;
  last.set(key,{signature,at:now});
  console.debug('[RoadPresence]',{...event,observedAtUtc:new Date(now).toISOString(),lastRecognizedStage});
  if (facts.present===true) {
    lastRecognizedStage=stage;
    if(v.codigoLinha&&['shared_gps_guard','consumer_gps_guard','hook_received','hook_reconciliation'].includes(stage))
      selectedLine=v.codigoLinha.trim().toUpperCase();
  }
}
export function traceRoadBatch(stage: string, rows: readonly unknown[]) {
  if (!enabled||!selected) return;
  rows.forEach(row=>traceRoadRaw(stage,row));
  const records=rows.filter((row):row is Record<string,unknown>=>!!row&&typeof row==='object');
  if (!records.some(row=>typeof row.ordem==='string'&&row.ordem.trim().toUpperCase()===selected)
    &&records.some(row=>typeof row.codigoLinha==='string'&&row.codigoLinha.trim().toUpperCase()===selectedLine)) {
    traceRoadRequest(stage,selectedLine,'omitted_from_line_snapshot');
  }
}
export function traceRoadRequest(stage: string, code: string, reason: string) {
  if (!enabled||!selected||code.trim().toUpperCase()!==selectedLine) return;
  traceRoadPresence(stage,reason,{idVisual:`road:${selected}`,codigoLinha:code},{present:false});
}
export function traceRoadReconciliation(previous: readonly VeiculoMapa[], next: readonly VeiculoMapa[],
  observed: readonly VeiculoMapa[], consumerContext: string, clock=false) {
  if (!enabled||!selected) return;
  const before=previous.find(tracesRoadVehicle),after=next.find(tracesRoadVehicle),incoming=observed.find(tracesRoadVehicle);
  if (after) traceRoadPresence('hook_reconciliation',clock?'retained_by_gps_time':!incoming?'retained_after_feed_omission'
    :before?.atualizadoEm===after.atualizadoEm?'same_observation_retained':'physical_observation_replaced',after,
  {present:true,consumerContext,gpsAgeSeconds:Math.floor((Date.now()-Date.parse(after.atualizadoEm??''))/1000)});
  else if (before) traceRoadPresence('hook_reconciliation',clock?'gps_retention_expired'
    :incoming?'observed_identity_outside_consumer_lines':'observation_not_retained',before,{present:false,consumerContext});
}
export function traceRoadRaw(stage: string, raw: unknown, reason='physical_identity_received', present=true) {
  if (!enabled||!selected||!raw||typeof raw!=='object') return;
  const row=raw as Record<string,unknown>;
  if (typeof row.ordem!=='string'||row.ordem.trim().toUpperCase()!==selected) return;
  traceRoadPresence(stage,reason,{
    idVisual:`road:${row.ordem}`,codigoLinha:typeof row.codigoLinha==='string'?row.codigoLinha:null,
    atualizadoEm:typeof row.timestampGps==='string'?row.timestampGps:null,
    linhaId:typeof row.linhaId==='string'?row.linhaId:null,sentidoId:typeof row.sentidoId==='string'?row.sentidoId:null,
    padraoVersaoId:typeof row.padraoVersaoId==='string'?row.padraoVersaoId:null,
  },{present});
}
export function traceRoadLineEmpty(code: string) {
  if (!enabled||!selected) return;
  // Report all subscribed line-empty events; it is not evidence that another line's vehicle was removed.
  if (code.trim().toUpperCase()===selectedLine)
    traceRoadPresence('signalr_empty','explicit_line_empty',{idVisual:`road:${selected}`,codigoLinha:code}, {present:false});
}

export function traceRoadFilter(v: VeiculoMapa, scope: {lineCode:string;lineId:string;now:number},
  visible: ReadonlySet<string> | null | undefined, known: ReadonlySet<string>, directions: ReadonlySet<string>, accepted: boolean) {
  if (!tracesRoadVehicle(v)) return;
  const age=physicalAge(v,scope.now);
  const reason=accepted?'physical_observation_visible':age===null?'invalid_physical_observation':age>RETENTION_MS?'retention_expired'
    :v.codigoLinha?.trim().toUpperCase()!==scope.lineCode?'different_line_code'
    :v.linhaId&&v.linhaId!==scope.lineId?'different_line_uuid'
    :v.padraoVersaoId&&v.sentidoId&&directions.size&&!directions.has(v.sentidoId)?'direction_filtered'
    :visible&&v.padraoVersaoId&&v.sentidoId&&!visible.has(v.padraoVersaoId)&&known.has(v.padraoVersaoId)?'known_version_filtered':'filtered';
  traceRoadPresence('frontend_filter',reason,v,{present:accepted,gpsAgeSeconds:age===null?null:Math.floor(age/1000)});
}

// Discovery is separate from classification: a 1 km search finds candidates, never confirms a terminal.
export function discoverRoadTerminal(vehicles: readonly VeiculoMapa[], structures: Record<string,ItinerarioPadraoVersaoV2>, now: number) {
  if (!enabled||selected||now-lastDiscovery<30000) return;
  lastDiscovery=now;
  const endpoints=Object.values(structures).flatMap(s=>{
    const sorted=[...s.ocorrencias].sort((a,b)=>a.ordem-b.ordem);
    return [sorted[0],sorted.at(-1)].filter(p=>p&&/magarca/i.test((p.nome??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')));
  });
  const candidates=vehicles.filter(v=>v.codigoLinha?.trim().toUpperCase()===line).flatMap(v=>{
    if (physicalAge(v,now)===null) return [];
    const distances=endpoints.map(p=>{
      const r=Math.PI/180,lat=v.latitude!,lon=v.longitude!;
      const h=Math.sin((p!.latitude-lat)*r/2)**2+Math.cos(lat*r)*Math.cos(p!.latitude*r)*Math.sin((p!.longitude-lon)*r/2)**2;
      return 6371000*2*Math.asin(Math.sqrt(Math.min(1,h)));
    }).filter(Number.isFinite);
    const distance=Math.min(...distances);
    return distance<=1000?[{order:v.codigoVeiculoOuTrem ?? v.idVisual,distanceMetres:Math.round(distance),gpsAgeSeconds:Math.floor((now-Date.parse(v.atualizadoEm!))/1000)}]:[];
  });
  console.debug('[RoadPresence]',{stage:'terminal_discovery',line,terminal:'Magarça',
    reason:!endpoints.length?'published_magarca_endpoint_not_loaded':!candidates.length?'no_observed_vehicle_within_discovery_radius':'select_physical_order',
    discoveryRadiusMetres:1000,terminalConfirmation:false,candidates:candidates.slice(0,5)});
}

export function traceRoadNativePayload(lines: readonly {posicoes?:readonly {id?:string;idVisual?:string;ordem?:string;atualizadoEm?:string|null}[]}[], ready: boolean) {
  if (!enabled||!selected) return;
  const row=lines.flatMap(l=>l.posicoes??[]).find(p=>
    (p.idVisual??`road:${p.ordem??p.id??''}`).trim().toUpperCase()===`ROAD:${selected}`);
  traceRoadPresence('native_payload',!ready?'waiting_map_ready':row?'selected_identity_in_payload':'selected_identity_absent',
    {idVisual:`road:${selected}`,atualizadoEm:row?.atualizadoEm},{present:ready&&!!row});
}

// Read-only WebView probe; does not touch the movement engine, popup or coordinates.
export function roadPresenceWebViewProbe(): string | null {
  if (!enabled||!selected) return null;
  return `(function(){var order=${JSON.stringify(selected)};
    var index=typeof vehicleIndexByOrder==='object'?vehicleIndexByOrder:{};
    var found=Object.keys(index).find(function(id){return id.trim().toUpperCase()===order});
    var present=Boolean(found&&typeof vehicleMarkers==='object'&&vehicleMarkers[index[found]]);
    var gps=present&&typeof drState==='object'&&drState[index[found]]?drState[index[found]].gpsTimestamp:null;
    if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({type:'road_presence_trace_map',order:order,present:present,
      gpsAt:typeof gps==='number'&&isFinite(gps)?new Date(gps).toISOString():null}));
  })();`;
}
export function traceRoadWebViewResult(payload: {order?:unknown;present?:unknown;gpsAt?:unknown}) {
  if (typeof payload.order!=='string'||payload.order!==selected||typeof payload.present!=='boolean') return;
  traceRoadPresence('webview',payload.present?'marker_present':'marker_absent',
    {idVisual:`road:${payload.order}`,atualizadoEm:typeof payload.gpsAt==='string'?payload.gpsAt:null},{present:payload.present});
}
