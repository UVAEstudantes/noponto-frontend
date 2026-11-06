import { isUnifiedCode } from './unifiedNetwork';
import { projectPhysical,routeStopProjections } from './hybridGps';
import { GPS_POLICY,gpsPresentation,type GpsPresentationPolicy } from './gpsPresentationPolicy';
import type { LinhaParaMostrar } from '../components/mapOSM/types';
import type { PosicaoRodoviariaV2Dto } from './veiculosMapa';

export interface UnifiedVehicle {
  key: string; order: string;
  line: { lineId: string | null; serviceCode: string | null; state: number | string; validatedAt?: string | null };
  location: { latitude: number; longitude: number; physicalAt: string; validUntil: string;
    source: string; provider: string; speedKmh?: number | null; uncertain: boolean; reason: string; freshness?: 'Recent' | 'Delayed' | 'Uncertain' | null };
  operational: ({ timestampGps: string } & Partial<PosicaoRodoviariaV2Dto>) | null;
  spatial: { facilityStopId: string | null; state: string };
  motionEligible: boolean;
}
export interface UnifiedSnapshot {
  schemaVersion: number; enabled: boolean; lineCode: string; revision: number;
  composedAt: string; vehicles: UnifiedVehicle[];
}
export function acceptUnified(next: unknown, previous: UnifiedSnapshot | null): next is UnifiedSnapshot {
  if (!next || typeof next !== 'object') return false;
  const s = next as UnifiedSnapshot;
  return s.schemaVersion === 1 && isUnifiedCode(s.lineCode) && typeof s.enabled === 'boolean'
    && Number.isSafeInteger(s.revision) && s.revision >= 0 && Number.isFinite(Date.parse(s.composedAt))
    && Array.isArray(s.vehicles) && s.vehicles.every(v => v && typeof v.order === 'string' && typeof v.key === 'string'
      && v.line && v.location && v.spatial && ['ITS_CURRENT', 'GTFSRT_BUS'].includes(v.location.source)
      && Number.isFinite(v.location.latitude) && Math.abs(v.location.latitude) <= 90
      && Number.isFinite(v.location.longitude) && Math.abs(v.location.longitude) <= 180
      && Number.isFinite(Date.parse(v.location.physicalAt)) && Number.isFinite(Date.parse(v.location.validUntil)))
    && new Set(s.vehicles.map(v => v.key)).size === s.vehicles.length
    && (!previous || s.lineCode === previous.lineCode)
    && (!previous || !s.enabled && Date.parse(s.composedAt) >= Date.parse(previous.composedAt)
      || s.revision > previous.revision || s.revision === previous.revision && Date.parse(s.composedAt) >= Date.parse(previous.composedAt));
}
export function composeUnifiedLines(lines: LinhaParaMostrar[], snapshot: UnifiedSnapshot | null, now: number, basic=false,policy:Readonly<GpsPresentationPolicy>=GPS_POLICY): LinhaParaMostrar[] {
  if (!snapshot?.enabled) return lines;
  return lines.map(line => {
    if (line.nome !== snapshot.lineCode || line.modal !== 'onibus') return line;
    const positions = snapshot.vehicles.filter(v => v.line.lineId === line.linhaId && v.line.serviceCode === snapshot.lineCode
      && [1, 2, 'Informed', 'Inherited'].includes(v.line.state)
      && (!v.line.validatedAt || Date.parse(v.line.validatedAt) <= now && now - Date.parse(v.line.validatedAt) < 600_000)
      && gpsPresentation(Date.parse(v.location.physicalAt),now,policy).visible && Date.parse(v.location.validUntil) > now);
    const previousById = new Map((line.posicoes ?? []).map(p => [p.ordem || p.id, p]));
    return { ...line, posicoes: positions.map(v => {
      const previous = previousById.get(v.order);
      const age = now - Date.parse(v.location.physicalAt);
      const nativeMotion = v.motionEligible && v.location.source === 'GTFSRT_BUS' && !v.location.uncertain
        && age < policy.baseProjectionMs && v.operational?.timestampGps === v.location.physicalAt;
      const op = v.operational;
      const opAge = op ? now - Date.parse(op.timestampGps) : Infinity;
      const index = op?.padraoVersaoId ? line.itinerarioSegmentoMap?.[op.padraoVersaoId] : undefined;
      const coords = !basic && index != null ? line.segmentos?.[index] : undefined;
      const projection = coords ? projectPhysical(coords, v.location.latitude, v.location.longitude) : null;
      const reference = coords && op?.latitude != null && op.longitude != null ? projectPhysical(coords,op.latitude,op.longitude) : null;
      const elapsed = op ? (Date.parse(v.location.physicalAt)-Date.parse(op.timestampGps))/1000 : -1;
      const compatible = !!op && op.status === 0 && opAge >= 0 && opAge < policy.contextMs
        && op.linhaId === v.line.lineId && op.codigoLinha === snapshot.lineCode
        && !v.location.uncertain && !!projection && projection.gap <= 60 && !!reference && reference.gap <= 60
        && elapsed >= 0 && projection.metres-reference.metres >= -30
        && projection.metres-reference.metres <= Math.max(30,elapsed*33);
      const context = nativeMotion || compatible;
      const motion = context && age < policy.baseProjectionMs;
      const physicalSpeed = !v.location.uncertain && v.location.speedKmh != null
        && Number.isFinite(v.location.speedKmh) && v.location.speedKmh >= 0 && v.location.speedKmh <= 120 ? v.location.speedKmh : undefined;
      const candidate = physicalSpeed ?? (!v.location.uncertain&&v.location.source==='GTFSRT_BUS'&&op?.timestampGps===v.location.physicalAt ? op.velocidade : undefined);
      const observed=candidate!=null&&Number.isFinite(candidate)&&candidate>=0&&candidate<=120?candidate:undefined;
      const speed = age<policy.currentSpeedMs?observed:undefined;
      const stops=line.paradasPorPadrao?.[op?.padraoVersaoId??''];
      const next = compatible && coords && projection && stops ? routeStopProjections(coords,stops)
        .find(item => item.point && item.point.gap <= 60 && item.point.metres > projection.metres + 10) : undefined;
      const operationalFresh = v.operational && v.operational.status === 0 && opAge >= 0 && opAge <= 60_000;
      const presentation=gpsPresentation(Date.parse(v.location.physicalAt),now,policy);
      const label = v.location.uncertain ? 'Localização incerta'
        : presentation.warning??
        (operationalFresh && context ? 'Em viagem' : speed != null ? speed > 2 ? 'Em movimento' : 'Parado' : 'GPS disponível');
      return { ...previous, ...(motion ? op : {}), id: v.order, ordem: v.order, latitude: v.location.latitude, longitude: v.location.longitude,
        timestamp: Date.parse(v.location.physicalAt), atualizadoEm: v.location.physicalAt,
        backendUnified: true, backendRevision: snapshot.revision, backendMotionEligible: motion&&observed!=null&&observed>0,
        unifiedSource: v.location.source,
        backendValidUntil: Math.min(Date.parse(v.location.validUntil),Date.parse(v.location.physicalAt)+policy.publicMs+1), physicalOnly: !context,
        physicalLocation: `${label} · Fonte GPS: ${v.location.source}`,
        lineOrigin: v.line.state === 2 || v.line.state === 'Inherited' ? 'Vínculo de linha herdado' : 'Serviço informado', presencaRotulo: label, gpsAtrasado: presentation.delayed,
        gpsWarning:presentation.warning,gpsOpacity:presentation.opacity,locationUncertain:v.location.uncertain,
        operationConfirmed:!!(operationalFresh&&op?.linhaId===v.line.lineId&&op.codigoLinha===snapshot.lineCode&&op.padraoVersaoId&&op.sentidoId),
        lastObservedSpeedKmh:observed,speedObservedAt:Date.parse(v.location.physicalAt),
        presencaEstado: 'unificada',
        velocidade: speed,
        velocidadeMedia: nativeMotion ? op?.velocidadeMedia : null,
        posicaoNaRota: nativeMotion ? op?.posicaoNaRota : compatible ? projection!.progress : null,
        padraoVersaoId: context ? op?.padraoVersaoId : null,
        linhaId: v.line.lineId, idVisual: `road:${v.order}`,
        sentidoNome: context ? line.itinerarioSentidoMap?.[op!.padraoVersaoId!] : undefined,
        sentidoId: context ? op?.sentidoId : null,
        padraoOperacionalId: context ? op?.padraoOperacionalId : null,
        proximaParadaNome: nativeMotion ? op?.proximaParadaNome : next?.stop.nome ?? null,
        distanciaProximaParadaMetros: nativeMotion ? op?.distanciaProximaParadaMetros : next ? next.point!.metres-projection!.metres : null,
        proximaOcorrenciaParadaPadraoId: nativeMotion ? op?.proximaOcorrenciaParadaPadraoId : null,
        direcao: nativeMotion ? op?.bearing : null };
    }) };
  });
}

// Stream revisions belong to each cohort, never compared across lines. During
// a transfer, snapshots can arrive in either order: keep a single canonical ID
// with the newest confirmed GPS, and hide equal-time line disagreement.
export function composeUnifiedSnapshots(lines: LinhaParaMostrar[], snapshots: UnifiedSnapshot[], now: number, basic=false,policy:Readonly<GpsPresentationPolicy>=GPS_POLICY): LinhaParaMostrar[] {
  const active = snapshots.filter(s => s.enabled);
  if (!active.length) return lines;
  const byCode = new Map(active.map(s => [s.lineCode, s]));
  const composed = lines.map(line => {
    const snapshot = byCode.get(line.nome);
    return snapshot && line.modal === 'onibus' ? composeUnifiedLines([line], snapshot, now,basic,policy)[0] : line;
  });
  const byIdentity = new Map<string, { line: string; at: number; conflict: boolean }>();
  for (const line of composed.filter(l => byCode.has(l.nome) && l.modal === 'onibus')) {
    for (const p of line.posicoes ?? []) {
      const id = p.ordem || p.id; if (!id) continue;
      const at = Number(p.timestamp); const prior = byIdentity.get(id);
      if (!prior || at > prior.at) byIdentity.set(id, { line: line.nome, at, conflict: false });
      else if (at === prior.at && prior.line !== line.nome) prior.conflict = true;
    }
  }
  return composed.map(line => {
    if (line.modal !== 'onibus') return line;
    const positions = line.posicoes?.filter(p => {
      const winner = byIdentity.get(p.ordem || p.id || '');
      return !winner || !winner.conflict && winner.line === line.nome;
    });
    return positions?.length === line.posicoes?.length ? line : { ...line, posicoes: positions };
  });
}
