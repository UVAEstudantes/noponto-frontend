import fs from 'node:fs';
import path from 'node:path';
import routes from './terminalRoutes.json';
import { lineTerminals } from '../terminalTracking';
import type { LinhaParaMostrar } from '../../components/mapOSM/types';
import type { UnifiedSnapshot } from '../unifiedLocationContract';

// Public catalog plus generated observations, never a recorded GPS snapshot.
const at = Date.parse('2026-01-01T12:00:00Z');
export const terminalFixture = {
  lines: routes.maps.map(map => {
    const line = map as unknown as LinhaParaMostrar;
    const endpoint = lineTerminals(line).find(e => e.stop.codigo === (line.nome === '838' ? '5144O00486P9' : '5151O00177C0'))!;
    const snapshot: UnifiedSnapshot = {
      schemaVersion: 1, enabled: true, lineCode: line.nome, revision: 1,
      composedAt: new Date(at).toISOString(),
      vehicles: [{
        key: `TEST-MAGARCA-${line.nome}`, order: `TEST-MAGARCA-${line.nome}`,
        line: {lineId: line.linhaId!, serviceCode: line.nome, state: 1, validatedAt: new Date(at).toISOString()},
        location: {latitude: endpoint.stop.latitude, longitude: endpoint.stop.longitude,
          physicalAt: new Date(at).toISOString(), validUntil: new Date(at + 600000).toISOString(),
          source: 'ITS_CURRENT', provider: 'SYNTHETIC', speedKmh: 0, uncertain: false, reason: 'fixture'},
        operational: null, spatial: {facilityStopId: null, state: 'Outside'}, motionEligible: false,
      }],
    };
    if (line.nome === '838') snapshot.vehicles.push({
      ...snapshot.vehicles[0], key: 'TEST-DISTANT-PARKED', order: 'TEST-DISTANT-PARKED',
      location: {...snapshot.vehicles[0].location, latitude: 0, longitude: 0},
    });
    return {map, snapshot};
  }),
};

// Optional historical replays stay outside the repository and retain their assertions.
export function privateReplay(name: string): unknown | undefined {
  const directory = process.env.NOPONTO_PRIVATE_REPLAY_DIR;
  if (!directory) return undefined;
  const file = path.join(directory, name);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
}
