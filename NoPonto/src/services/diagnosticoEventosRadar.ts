import type { EventoParadaDto } from './eventosParada';

type Selection = { at: number; displayed: string[]; physical: string[];
  presences?: { id: string; vehicle: string; line: string; state: string; physicalAt: number; validUntil: number; pattern: string | null; confirmed: boolean }[];
  events: { id: string; eta: number | null; reason: string | null }[] };
const fields = ['eventId','eventType','vehicleId','codigoVeiculo','railVehicleId','expectedRunId',
  'linhaId','codigoLinha','modal','tipoRota','sentidoId','padraoOperacionalId','padraoVersaoId',
  'paradaId','ocorrenciaParadaPadraoId','estimatedAt','scheduledAt','secondsUntilEvent',
  'source','quality','predictionValidUntilUtc','lastRealtimeEvidenceUtc','operationalStatus',
  'isEstimated','stationRole','nextVehiclesMode','distanciaRestanteMetros'] as const;
type Sample = { context: string; at: number; started: number; status: number; ok: boolean;
  events: Partial<EventoParadaDto>[]; selections: Selection[] };

/** Temporary, bounded in-memory evidence; never stores arbitrary payloads or error messages. */
export function criarDiagnosticoEventosRadar() {
  let stop = '', context = '', generation = 0;
  let samples: Sample[] = [];
  let responses = new WeakMap<object, Sample>();
  return {
    select(nextContext: string, nextStop: string) {
      if (stop !== nextStop) {
        stop = nextStop; generation++;
        samples = []; responses = new WeakMap();
      }
      context = nextContext;
    },
    ticket(id: string) { return id === stop ? generation : -1; },
    response(id: string, ticket: number, started: number, at: number, status: number,
      ok: boolean, events: EventoParadaDto[]) {
      if (!stop || id !== stop || ticket !== generation) return;
      const sample: Sample = { context, started, at, status, ok, events: ok ? events.map(e =>
        Object.fromEntries(fields.filter(k => e[k] !== undefined).map(k => [k, e[k]]))) : [], selections: [] };
      samples.push(sample); samples = samples.slice(-15);
      if (ok) responses.set(events, sample);
    },
    selection(key: string, events: readonly EventoParadaDto[], selection: Selection) {
      if (key !== context) return;
      const latest = samples.at(-1);
      const sample = latest && !latest.ok ? latest : responses.get(events);
      if (!sample || !samples.includes(sample)) return;
      const previous = sample.selections.at(-1);
      // Keep transitions, not one copy for every countdown second; latest time/ETA still advances.
      const signature = (s: Selection) => JSON.stringify([s.displayed,s.physical,s.events.map(e => [e.id,e.eta == null,e.reason])]);
      if (previous && signature(previous) === signature(selection)) sample.selections[sample.selections.length-1] = selection;
      else sample.selections = [...sample.selections, selection].slice(-8);
    },
    json() {
      const known = new Set<string>();
      return JSON.stringify({ version: 1, surface: 'radar_compacto', stop, context, samples: samples.map(s => {
        const ids = new Set(s.events.map(e => e.eventId!));
        const absent = s.ok ? [...known].filter(id => !ids.has(id)) : [];
        s.events.forEach(e => known.add(e.eventId!));
        return { ...s, absent, selections: s.selections.map(selection => ({ ...selection,
          outcomes: s.events.map(e => {
            const selected = selection.events.find(x => x.id === e.eventId);
            return { id: e.eventId, state: selection.displayed.includes(e.eventId!) ? 'exibido'
              : selected?.eta == null ? 'sem_eta' : 'filtrado_frontend',
              reason: selected?.reason ?? null };
          }) })) };
      }) });
    },
  };
}
export const diagnosticoEventosRadar = criarDiagnosticoEventosRadar();
