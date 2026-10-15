import type { ItinerarioPadraoVersaoV2 } from '../types/estruturaV2';
import type { VeiculoMapa } from '../types/veiculoMapa';

export const ROAD_PRESENCE_ENABLED = process.env.EXPO_PUBLIC_ROAD_PRESENCE_ENABLED === 'true';
// Presentation only: accommodates the observed ~58s BRT cadence. Never renews Redis TTL.
export const FRESH_MS = 60_000;
export const RETENTION_MS = 180_000;
export interface PresenceScope { enabled: boolean; now: number; lineCode: string; lineId: string;
  knownVersions?: ReadonlySet<string>; visibleDirections?: ReadonlySet<string> }
export type RoadPresenceState = 'em_viagem' | 'fim_percurso' | 'aguardando_saida' | 'indeterminado' | 'gps_desatualizado';
export interface RoadEvidence {
  identity: string; timestamp: number; candidate: string; count: number;
  arrivalDirection?: string; arrivalAt?: number; arrivalLine?: string; state: RoadPresenceState;
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
    && (!scope.visibleDirections?.size || !v.sentidoId || scope.visibleDirections.has(v.sentidoId));
}
function metres(a: number, b: number, c: number, d: number) {
  const rad = Math.PI/180;
  const h = Math.sin((c-a)*rad/2)**2 + Math.cos(a*rad)*Math.cos(c*rad)*Math.sin((d-b)*rad/2)**2;
  return 6371000*2*Math.asin(Math.sqrt(Math.min(1,h)));
}
export function projectRoadPresence(v: VeiculoMapa & {velocidade?: number},
  structure: ItinerarioPadraoVersaoV2 | undefined, previous: RoadEvidence | undefined, now: number) {
  const age = physicalAge(v,now);
  if (age === null || age > RETENTION_MS) return null;
  const timestamp = Date.parse(v.atualizadoEm!);
  const prior = previous && timestamp >= previous.timestamp && timestamp-previous.timestamp <= RETENTION_MS ? previous : undefined;
  const identity = [v.linhaId,v.sentidoId,v.padraoOperacionalId,v.padraoVersaoId].join('|');
  const arrival = prior && v.linhaId && prior.arrivalLine===v.linhaId
    && now-(prior.arrivalAt ?? 0)<=RETENTION_MS ? prior.arrivalDirection : undefined;
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
      && arrival && arrival!==v.sentidoId) candidate='aguardando_saida';
    else if (v.velocidade!>=3) candidate='em_viagem';
  }
  const same=prior?.identity===identity && prior.candidate===candidate;
  const count=same ? prior.count+(timestamp>prior.timestamp ? 1 : 0) : 1;
  let state: RoadPresenceState=candidate==='em_viagem' || count>=2 ? candidate : 'indeterminado';
  if (age>FRESH_MS) state='gps_desatualizado';
  const evidence: RoadEvidence={identity,timestamp,candidate,count:Math.min(count,2),state,
    arrivalDirection: state==='fim_percurso' ? v.sentidoId ?? undefined : arrival,
    arrivalAt:state==='fim_percurso' ? timestamp : prior?.arrivalAt,
    arrivalLine:state==='fim_percurso' ? v.linhaId ?? undefined : prior?.arrivalLine};
  const labels: Record<RoadPresenceState,string>={em_viagem:'Em viagem',fim_percurso:'No terminal — fim do percurso',
    aguardando_saida:'No terminal — aguardando saída',indeterminado:'Estado indeterminado',gps_desatualizado:'GPS desatualizado'};
  return {evidence,presentation:{presencaEstado:state,presencaRotulo:labels[state],presencaIdadeSegundos:Math.floor(age/1000)}};
}
