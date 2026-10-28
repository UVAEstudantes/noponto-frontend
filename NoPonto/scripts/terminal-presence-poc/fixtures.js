(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TerminalPresenceFixtures = api;
})(globalThis, function () {
  'use strict';
  // These coordinates, identities, services and installation are wholly synthetic.
  // No Rio terminal footprint or observed vehicle is represented here.
  const catalog = [{ service: 'F1', routeId: 'fixture-route-1' }, { service: 'F2', routeId: 'fixture-route-2' }];
  const facility = { id: 'synthetic-alpha', name: 'Instalação fictícia Alfa',
    anchors: [{ latitude: 10, longitude: 20 }], zones: [] };
  // Test-only reviewed geometry. This is not a footprint of any real terminal.
  const facilityWithSyntheticZone = { ...facility, zones: [{ id: 'synthetic-platform',
    trust: 'reviewed', role: 'platform', geometryType: 'Polygon',
    source: 'synthetic-fixture', revision: 'fixture-v1', reviewedAt: '2026-01-01T00:00:00Z',
    ring: [
      { latitude: 9.9992, longitude: 19.9992 }, { latitude: 9.9992, longitude: 20.0008 },
      { latitude: 10.0008, longitude: 20.0008 }, { latitude: 10.0008, longitude: 19.9992 },
      { latitude: 9.9992, longitude: 19.9992 }
    ] } ] };
  function observation(nowMs, { id = 'SIM-A', age = 90, service = 'F1', routeId = 'fixture-route-1',
    point = { latitude: 10.0003, longitude: 20.0002 }, accuracyMetres = 8 } = {}) {
    return { version: 1, identity: { source: 'synthetic', provider: 'LAB', vehicleId: id },
      point: { ...point }, physicalTimestamp: new Date(nowMs - age * 1000).toISOString(),
      receivedTimestamp: new Date(nowMs).toISOString(), reportedLine: { service, routeId },
      quality: { accuracyMetres, method: 'synthetic-fixture', sourceStatus: 'simulated' } };
  }
  function initial(nowMs) {
    return [observation(nowMs),
      observation(nowMs, { id: 'SIM-B', age: 35, service: null, routeId: null,
        point: { latitude: 10.0006, longitude: 20.0001 }, accuracyMetres: null }),
      observation(nowMs, { id: 'SIM-C', age: 70, service: 'F2', routeId: 'fixture-route-1',
        point: { latitude: 10.004, longitude: 20.001 } }),
      observation(nowMs, { id: 'SIM-D', age: 700, point: { latitude: 10.012, longitude: 20.001 } })];
  }
  return { catalog, facility, facilityWithSyntheticZone, observation, initial };
});
