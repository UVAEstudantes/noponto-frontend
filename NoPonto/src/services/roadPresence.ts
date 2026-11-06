import type { ItinerarioPadraoVersaoV2 } from '../types/estruturaV2';
import type { VeiculoMapa } from '../types/veiculoMapa';

export const ROAD_PRESENCE_ENABLED = process.env.EXPO_PUBLIC_ROAD_PRESENCE_ENABLED === 'true';
// Independent presentation policies. Neither renews GPS time nor backend TTLs.
export const FRESH_MS = 180_000;
export const RETENTION_MS = 300_000;
export const DEAD_RECKONING_MS = 60_000;
// Independent movement cutoff; repeated presentation updates never renew it.
export const ROAD_PROJECTION_HORIZON_MS = 180_000;
export const LEGACY_RETENTION_MS = 180_000;
// Visual retention must not extend the window for operational terminal evidence.
export const EVIDENCE_WINDOW_MS = 180_000;
export interface PresenceScope { enabled: boolean; now: number; lineCode: string; lineId: string;
  knownVersions?: ReadonlySet<string>; visibleDirections?: ReadonlySet<string> }
export type RoadPresenceState = 'em_viagem' | 'fim_percurso' | 'aguardando_saida' | 'indeterminado';
export interface RoadEvidence {
  lineCode?: string;
  identity: string; timestamp: number; candidate: string; count: number;
  arrivalDirection?: string; arrivalAt?: number; arrivalLine?: string; state: RoadPresenceState;
  latitude: number; longitude: number; routePosition: number | null;
  arrivalLatitude?: number; arrivalLongitude?: number;
}
export type RoadPresenceDiagnostic = Record<string, string | number | boolean | null | readonly string[]>;
// Warning and visual retention are independent presentation policies, based only on GPS time.
export function gpsTemporalQuality(v: VeiculoMapa, now: number) {
  const age = physicalAge(v, now);
  return age === null ? null : {
    ageMs: age, delayed: age >= FRESH_MS, retained: age <= RETENTION_MS,
  };
}
export function physicalAge(v: VeiculoMapa, now: number): number | null {
  const t = Date.parse(v.atualizadoEm ?? '');
  const lat = v.latitude, lon = v.longitude;
  if (v.runtime !== 'rodoviario' || !Number.isFinite(now) || !Number.isFinite(t) || t > now
    || lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)
    || Math.abs(lat)>90 || Math.abs(lon)>180 || (lat===0 && lon===0)) return null;
  return now-t;
}
export function inPresenceScope(v: VeiculoMapa, scope: PresenceScope): boolean {
  const age = physicalAge(v,scope.now);
  return age !== null && age <= RETENTION_MS && !!scope.lineCode && !!scope.lineId
    && v.codigoLinha?.trim().toUpperCase() === scope.lineCode.trim().toUpperCase()
    && (!v.linhaId || v.linhaId === scope.lineId)
    && (!scope.visibleDirections?.size || !v.padraoVersaoId || !v.sentidoId || scope.visibleDirections.has(v.sentidoId));
}
function metres(a: number, b: number, c: number, d: number) {
  const rad = Math.PI/180;
  const h = Math.sin((c-a)*rad/2)**2 + Math.cos(a*rad)*Math.cos(c*rad)*Math.sin((d-b)*rad/2)**2;
  return 6371000*2*Math.asin(Math.sqrt(Math.min(1,h)));
}
export function projectRoadPresence(v: VeiculoMapa & {velocidade?: number},
  structure: ItinerarioPadraoVersaoV2 | undefined, previous: RoadEvidence | undefined, now: number,
  diagnose?: (facts: RoadPresenceDiagnostic) => void) {
  const temporal = gpsTemporalQuality(v,now);
  if (!temporal?.retained) {
    diagnose?.({reason:temporal ? 'gps_retention_expired' : 'invalid_physical_observation',present:false});
    return null;
  }
  const age = temporal.ageMs;
  const timestamp = Date.parse(v.atualizadoEm!);
  if (previous && timestamp < previous.timestamp) {
    diagnose?.({reason:'gps_older_than_evidence',present:false});return null;
  }
  const prior = previous && timestamp-previous.timestamp <= EVIDENCE_WINDOW_MS ? previous : undefined;
  const identity = [v.linhaId,v.sentidoId,v.padraoOperacionalId,v.padraoVersaoId].join('|');
  if (prior && timestamp===prior.timestamp && (identity!==prior.identity
    || v.latitude!==prior.latitude || v.longitude!==prior.longitude || (v.posicaoNaRota ?? null)!==prior.routePosition)) {
    diagnose?.({reason:'conflicting_equal_gps',present:false});return null;
  }
  // A missing UUID is not proof that this physical vehicle left the observed line.
  // Preserve history only for the same nonempty public line code, within the existing window.
  const sameArrivalLine = v.linhaId ? prior?.arrivalLine===v.linhaId
    : !!v.codigoLinha?.trim() && prior?.lineCode===v.codigoLinha.trim().toUpperCase();
  const arrival = prior && sameArrivalLine
    && timestamp-(prior.arrivalAt ?? 0)<=EVIDENCE_WINDOW_MS ? prior.arrivalDirection : undefined;
  let candidate: RoadPresenceState = 'indeterminado';
  const stops = [...(structure?.ocorrencias ?? [])].sort((a,b)=>a.ordem-b.ordem);
  const first=stops[0],last=stops.at(-1),second=stops[1],penultimate=stops.at(-2);
  const validStops=stops.every((s,i)=>s.ordem>0 && Number.isFinite(s.posicaoLinha)
    && s.posicaoLinha>=0 && s.posicaoLinha<=1 && Number.isFinite(s.latitude) && Number.isFinite(s.longitude)
    && Math.abs(s.latitude)<=90 && Math.abs(s.longitude)<=180
    && (!i || (s.ordem>stops[i-1].ordem && s.posicaoLinha>=stops[i-1].posicaoLinha)));
  if (validStops && v.linhaId && v.sentidoId && v.padraoOperacionalId && v.padraoVersaoId
    && structure && structure.topologia==='LINEAR' && structure.padraoVersaoId===v.padraoVersaoId
    && structure.sentidoId===v.sentidoId && structure.linhaId===v.linhaId
    && structure.padraoOperacionalId===v.padraoOperacionalId
    && first && last && second && penultimate && first.ordem<last.ordem
    && typeof v.posicaoNaRota==='number' && Number.isFinite(v.posicaoNaRota) && v.posicaoNaRota>=0 && v.posicaoNaRota<=1
    && Number.isFinite(v.velocidade) && v.velocidade!>=0) {
    // 50m entry radius, plus the existing 50m GPS projection tolerance on exit.
    const same=prior?.identity===identity;
    const nearLast=metres(v.latitude!,v.longitude!,last.latitude,last.longitude)
      <= (same && prior?.candidate==='fim_percurso' && prior.count>=2 ? 100 : 50);
    const nearFirst=metres(v.latitude!,v.longitude!,first.latitude,first.longitude)
      <= (same && prior?.candidate==='aguardando_saida' && prior.count>=2 ? 100 : 50);
    if (nearLast && v.posicaoNaRota>=penultimate.posicaoLinha) candidate='fim_percurso';
    else if (nearFirst && v.posicaoNaRota<=second.posicaoLinha && v.velocidade===0
      && arrival && arrival!==v.sentidoId && prior?.arrivalLatitude!=null && prior.arrivalLongitude!=null
      && metres(first.latitude,first.longitude,prior.arrivalLatitude,prior.arrivalLongitude)<=100) candidate='aguardando_saida';
    else if (v.velocidade!>=3 && same && timestamp>prior.timestamp
      && prior.routePosition!=null && v.posicaoNaRota>prior.routePosition
      && (v.latitude!==prior.latitude || v.longitude!==prior.longitude)) candidate='em_viagem';
  }
  const same=prior?.identity===identity && prior.candidate===candidate;
  const count=same ? prior.count+(timestamp>prior.timestamp ? 1 : 0) : 1;
  let state: RoadPresenceState=candidate==='em_viagem' || count>=2 ? candidate : 'indeterminado';
  // Renders and repeated snapshots cannot create evidence or erase a confirmed observation.
  if (prior?.identity===identity && timestamp===prior.timestamp) state=prior.state;
  const evidence: RoadEvidence={lineCode:v.codigoLinha?.trim().toUpperCase(),identity,timestamp,candidate,count:Math.min(count,2),state,
    latitude:v.latitude!,longitude:v.longitude!,routePosition:v.posicaoNaRota ?? null,
    arrivalLatitude:state==='fim_percurso' ? v.latitude! : prior?.arrivalLatitude,
    arrivalLongitude:state==='fim_percurso' ? v.longitude! : prior?.arrivalLongitude,
    arrivalDirection: state==='fim_percurso' ? v.sentidoId ?? undefined : arrival,
    arrivalAt:state==='fim_percurso' ? timestamp : prior?.arrivalAt,
    arrivalLine:state==='fim_percurso' ? v.linhaId ?? undefined : prior?.arrivalLine};
  const labels: Record<RoadPresenceState,string>={em_viagem:'Em viagem',fim_percurso:'No terminal — fim do percurso',
    aguardando_saida:'No terminal — aguardando saída',indeterminado:'Estado indeterminado'};
  const delayed = temporal.delayed;
  if (diagnose) {
    const failures: string[]=[];
    if (!v.linhaId||!v.sentidoId||!v.padraoOperacionalId||!v.padraoVersaoId) failures.push('matching_incomplete');
    if (!structure) failures.push('structure_not_loaded');
    if (structure && structure.topologia!=='LINEAR') failures.push('topology_not_linear');
    if (structure && (structure.linhaId!==v.linhaId||structure.sentidoId!==v.sentidoId
      ||structure.padraoOperacionalId!==v.padraoOperacionalId||structure.padraoVersaoId!==v.padraoVersaoId)) failures.push('structure_identity_mismatch');
    if (!validStops||!first||!last||!second||!penultimate||first.ordem>=last.ordem) failures.push('invalid_or_insufficient_occurrences');
    if (typeof v.posicaoNaRota!=='number'||!Number.isFinite(v.posicaoNaRota)||v.posicaoNaRota<0||v.posicaoNaRota>1) failures.push('invalid_route_progress');
    if (!Number.isFinite(v.velocidade)||v.velocidade!<0) failures.push('invalid_speed');
    const distance=(stop: typeof first | undefined) => {
      const d=stop ? metres(v.latitude!,v.longitude!,stop.latitude,stop.longitude) : NaN;
      return Number.isFinite(d) ? Math.round(d) : null;
    };
    const arrivalDistance=first&&prior?.arrivalLatitude!=null&&prior.arrivalLongitude!=null
      ? metres(first.latitude,first.longitude,prior.arrivalLatitude,prior.arrivalLongitude) : NaN;
    diagnose({reason:failures.length ? 'classification_context_incomplete'
      : candidate!=='indeterminado'&&count<2&&candidate!=='em_viagem' ? 'needs_second_distinct_gps'
      : state==='indeterminado' ? 'terminal_or_movement_evidence_insufficient'
      : delayed ? 'last_confirmed_observation_retained' : 'physical_state_confirmed',
      present:true,failures,state,candidate,distinctSamples:Math.min(count,2),gpsAgeSeconds:Math.floor(age/1000),
      sameGps:timestamp===prior?.timestamp,delayed,topology:structure?.topologia ?? null,
      distanceFirstMetres:distance(first),distanceLastMetres:distance(last),
      firstRadiusMetres:prior?.identity===identity&&prior.candidate==='aguardando_saida'&&prior.count>=2?100:50,
      lastRadiusMetres:prior?.identity===identity&&prior.candidate==='fim_percurso'&&prior.count>=2?100:50,
      routeProgress:v.posicaoNaRota ?? null,penultimateProgress:penultimate?.posicaoLinha ?? null,secondProgress:second?.posicaoLinha ?? null,
      speedKmh:v.velocidade ?? null,arrivalHistoryValid:!!arrival,
      arrivalDirectionChanged:!!arrival&&arrival!==v.sentidoId,
      arrivalTerminalDistanceMetres:Number.isFinite(arrivalDistance)?Math.round(arrivalDistance):null,
      arrivalAgeSeconds:prior?.arrivalAt!=null?Math.floor((timestamp-prior.arrivalAt)/1000):null,
      forwardPhysicalProgress:prior?.identity===identity&&timestamp>prior.timestamp&&prior.routePosition!=null
        &&v.posicaoNaRota!=null&&v.posicaoNaRota>prior.routePosition&&(v.latitude!==prior.latitude||v.longitude!==prior.longitude)});
  }
  const historic: Record<RoadPresenceState,string>={em_viagem:'em viagem',fim_percurso:'fim do percurso no terminal',
    aguardando_saida:'aguardando saída no terminal',indeterminado:'estado indeterminado'};
  return {evidence,presentation:{presencaEstado:state,
    presencaRotulo:delayed ? `Última observação: ${historic[state]} • GPS atrasado` : labels[state],
    gpsAtrasado:delayed,presencaIdadeSegundos:Math.floor(age/1000)}};
}
