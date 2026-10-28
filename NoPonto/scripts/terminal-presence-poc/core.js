/* Pure offline module. Geometry rules originate in terminal-presence-preflight;
   no operational client, route matching, clock, storage or network is imported. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TerminalPresencePoC = api;
})(globalThis, function () {
  'use strict';
  const POLICY = Object.freeze({ nearMetres: 200, uncertainMetres: 1000, boundaryMetres: 20 });
  const freeze = value => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  function text(value, name, optional = false) {
    if (optional && (value == null || (typeof value === 'string' && !value.trim()))) return null;
    if (typeof value !== 'string' || !value.trim() || value.length > 128 || /[\u0000-\u001f\u007f]/.test(value))
      throw new Error('invalid_' + name);
    return value;
  }
  const canonical = value => value.trim().toUpperCase();
  function utc(value) {
    if (typeof value !== 'string') throw new Error('invalid_utc');
    const match = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,3}))?(?:Z|\+00:00)$/.exec(value);
    const ms = Date.parse(value);
    if (!match || !Number.isFinite(ms) || ms <= 0 ||
        new Date(ms).toISOString() !== match[1] + '.' + (match[2] || '').padEnd(3, '0') + 'Z')
      throw new Error('invalid_utc');
    return ms;
  }
  function validPoint(point) {
    return !!point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude) &&
      Math.abs(point.latitude) <= 85 && Math.abs(point.longitude) <= 180 &&
      !(point.latitude === 0 && point.longitude === 0);
  }
  function accuracy(value) {
    if (value == null) return null;
    if (!Number.isFinite(value) || value < 0 || value > 10000) throw new Error('invalid_accuracy');
    return value;
  }
  function normalize(raw, nowMs) {
    if (!Number.isFinite(nowMs) || raw?.version !== 1) throw new Error('invalid_contract_or_clock');
    const identity = {
      source: text(raw.identity?.source, 'source'), provider: text(raw.identity?.provider, 'provider'),
      vehicleId: text(raw.identity?.vehicleId, 'identity')
    };
    const physicalMs = utc(raw.physicalTimestamp);
    if (physicalMs > nowMs) throw new Error('future_physical_time');
    if (!validPoint(raw.point)) throw new Error('invalid_fix');
    const receivedTimestamp = raw.receivedTimestamp == null ? null : raw.receivedTimestamp;
    if (receivedTimestamp != null) utc(receivedTimestamp);
    let service = null, routeId = null, invalidLineMetadata = false;
    try { service = text(raw.reportedLine?.service, 'service', true); routeId = text(raw.reportedLine?.routeId, 'route', true); }
    catch { invalidLineMetadata = true; service = null; routeId = null; }
    return freeze({
      version: 1, identity,
      // Physical identity is source-scoped and byte-preserving. Canonicalizing IDs could merge distinct vehicles.
      key: JSON.stringify([identity.source, identity.provider, identity.vehicleId]),
      point: { latitude: raw.point.latitude, longitude: raw.point.longitude },
      physicalTimestamp: raw.physicalTimestamp, physicalMs, receivedTimestamp,
      reportedLine: {
        service, routeId, invalidLineMetadata
      },
      quality: {
        accuracyMetres: accuracy(raw.quality?.accuracyMetres),
        method: text(raw.quality?.method, 'method', true),
        sourceStatus: text(raw.quality?.sourceStatus, 'quality', true)
      }
    });
  }
  function lineEvidence(observation, catalog) {
    const reported = observation.reportedLine;
    if (reported.invalidLineMetadata) return freeze({ status: 'unknown', service: null, reason: 'invalid_line_metadata' });
    if (!reported.service) return freeze({ status: 'unknown', service: null, reason: 'service_missing' });
    const service = canonical(reported.service);
    const matches = catalog.filter(item => canonical(item.service) === service);
    if (matches.length !== 1) return freeze({ status: 'unknown', service: null,
      reason: matches.length ? 'service_ambiguous' : 'service_unresolved' });
    if (reported.routeId && reported.routeId !== matches[0].routeId)
      return freeze({ status: 'conflict', service: null, reason: 'route_service_conflict' });
    return freeze({ status: 'reported', service, reason: 'same_observation_only' });
  }
  function distance(a, b) {
    const r = Math.PI / 180;
    const h = Math.sin((b.latitude - a.latitude) * r / 2) ** 2 +
      Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin((b.longitude - a.longitude) * r / 2) ** 2;
    return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
  }
  function segmentDistance(p, a, b) {
    const c = Math.cos(p.latitude * Math.PI / 180);
    const ax = (a.longitude - p.longitude) * c, ay = a.latitude - p.latitude;
    const dx = (b.longitude - a.longitude) * c, dy = b.latitude - a.latitude;
    const norm = dx * dx + dy * dy;
    const t = norm === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / norm));
    return Math.hypot(ax + t * dx, ay + t * dy) * Math.PI / 180 * 6371000;
  }
  function within(point, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a.latitude > point.latitude) !== (b.latitude > point.latitude) &&
          point.longitude < (b.longitude - a.longitude) * (point.latitude - a.latitude) /
          (b.latitude - a.latitude) + a.longitude) inside = !inside;
    }
    return inside;
  }
  function crosses(a, b, c, d) {
    const turn = (x, y, z) => (y.longitude - x.longitude) * (z.latitude - x.latitude) -
      (y.latitude - x.latitude) * (z.longitude - x.longitude);
    const between = (x, y, z) => z >= Math.min(x, y) && z <= Math.max(x, y);
    const on = (x, y, z) => Math.abs(turn(x, y, z)) < 1e-12 &&
      between(x.latitude, y.latitude, z.latitude) && between(x.longitude, y.longitude, z.longitude);
    return (turn(a, b, c) * turn(a, b, d) < 0 && turn(c, d, a) * turn(c, d, b) < 0) ||
      on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b);
  }
  function validateFacility(facility) {
    text(facility?.id, 'facility');
    if (!Array.isArray(facility.anchors) || !facility.anchors.length || facility.anchors.length > 1000 ||
        !facility.anchors.every(validPoint) || !Array.isArray(facility.zones) || facility.zones.length > 100)
      throw new Error('invalid_facility');
    const ids = new Set();
    for (const zone of facility.zones) {
      text(zone.id, 'zone');
      if (ids.has(zone.id)) throw new Error('duplicate_zone');
      ids.add(zone.id);
      if (!['candidate', 'reviewed'].includes(zone.trust) || !['platform', 'yard'].includes(zone.role) ||
          zone.holes?.length || zone.geometryType !== 'Polygon') throw new Error('unsupported_geometry');
      if (zone.trust === 'reviewed') {
        text(zone.source, 'geometry_source'); text(zone.revision, 'geometry_revision'); utc(zone.reviewedAt);
      }
      const ring = zone.ring;
      if (!Array.isArray(ring) || ring.length < 4 || ring.length > 1000 || !ring.every(validPoint) ||
          ring[0].latitude !== ring.at(-1).latitude || ring[0].longitude !== ring.at(-1).longitude)
        throw new Error('invalid_ring');
      if (Math.max(...ring.map(p => p.longitude)) - Math.min(...ring.map(p => p.longitude)) > 0.1 ||
          Math.max(...ring.map(p => p.latitude)) - Math.min(...ring.map(p => p.latitude)) > 0.1)
        throw new Error('nonlocal_geometry');
      let area = 0;
      for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i], b = ring[i + 1];
        if (a.latitude === b.latitude && a.longitude === b.longitude) throw new Error('degenerate_ring');
        area += a.longitude * b.latitude - b.longitude * a.latitude;
        for (let j = i + 2; j < ring.length - 1; j++) {
          if (i === 0 && j === ring.length - 2) continue;
          if (crosses(a, b, ring[j], ring[j + 1])) throw new Error('self_intersecting_ring');
        }
      }
      if (Math.abs(area) < 1e-12) throw new Error('degenerate_ring');
    }
    return facility;
  }
  function classifySpatial(point, facility, accuracyMetres = null) {
    if (!validPoint(point)) throw new Error('invalid_fix');
    validateFacility(facility); accuracyMetres = accuracy(accuracyMetres);
    let uncertainBoundary = false;
    for (const zone of facility.zones.filter(z => z.trust === 'reviewed')) {
      const edge = Math.min(...zone.ring.slice(0, -1).map((p, i) => segmentDistance(point, p, zone.ring[i + 1])));
      const inside = within(point, zone.ring);
      const margin = Math.max(POLICY.boundaryMetres, accuracyMetres ?? 0);
      if (inside && edge > margin && accuracyMetres != null)
        return freeze({ classification: 'inside_trusted', reason: 'reviewed_geometry_and_reported_accuracy',
          geometryRevision: zone.revision, zoneId: zone.id, accuracyKnown: true });
      if (edge <= margin || (inside && accuracyMetres == null)) uncertainBoundary = true;
    }
    if (uncertainBoundary) return freeze({ classification: 'uncertain_location', reason: 'boundary_or_accuracy_unknown', accuracyKnown: accuracyMetres != null });
    const metres = Math.min(...facility.anchors.map(p => distance(point, p)));
    const spread = accuracyMetres ?? 0;
    return freeze({ classification: metres + spread <= POLICY.nearMetres ? 'near_terminal' :
      metres - spread <= POLICY.uncertainMetres ? 'uncertain_location' : 'outside',
      reason: accuracyMetres == null ? 'nominal_fix_accuracy_unknown' : 'anchor_distance_with_reported_accuracy',
      anchorDistanceMetres: metres, accuracyKnown: accuracyMetres != null });
  }
  function ageLabel(seconds) {
    if (seconds < 0) return 'Relógio incompatível com o GPS';
    return seconds < 60 ? `GPS há ${Math.floor(seconds)} s` :
      `GPS há ${Math.floor(seconds / 60)} min ${Math.floor(seconds % 60)} s`;
  }
  function presentation(entry, facility, nowMs, catalog) {
    if (!Number.isFinite(nowMs)) throw new Error('invalid_clock');
    const obs = entry.observation;
    const seconds = (nowMs - obs.physicalMs) / 1000;
    const spatial = classifySpatial(obs.point, facility, obs.quality.accuracyMetres);
    const uncertain = entry.conflict || seconds < 0;
    const line = entry.conflict ? { status: 'conflict', service: null, reason: 'identity_conflict' } : lineEvidence(obs, catalog);
    const locationLabel = { inside_trusted: 'Última posição no terminal', near_terminal: 'Última posição próxima ao terminal',
      uncertain_location: 'Localização incerta em relação ao terminal', outside: 'Última posição fora do recorte' }[spatial.classification];
    return freeze({ identity: obs.identity, physicalTimestamp: obs.physicalTimestamp,
      ageSeconds: seconds, ageLabel: ageLabel(seconds), ageStatus: seconds < 0 ? 'clock_uncertain' : seconds > 180 ? 'old' : 'last_observation',
      spatial: uncertain ? { classification: 'uncertain_location', reason: 'identity_or_clock_conflict' } : spatial,
      locationLabel: entry.conflict ? 'Identidade em conflito · posição não confirmada' :
        seconds < 0 ? 'Relógio incompatível · posição atual desconhecida' : locationLabel,
      marker: uncertain ? null : obs.point, line,
      serviceLabel: line.status === 'reported' ? 'Serviço informado ' + line.service :
        line.status === 'conflict' ? 'Serviço em conflito' : 'Serviço desconhecido',
      departureLabel: 'Saída não confirmada', tripStatus: 'unconfirmed', departureStatus: 'unconfirmed',
      quality: obs.quality, event: entry.event, identityConflict: entry.conflict });
  }
  class ObservationStore {
    #entries = new Map();
    #catalog;
    constructor(catalog) {
      if (!Array.isArray(catalog)) throw new Error('invalid_line_catalog');
      catalog.forEach(item => { text(item.service, 'catalog_service'); text(item.routeId, 'catalog_route'); });
      this.#catalog = freeze(structuredClone(catalog));
    }
    receive(raw, nowMs) {
      let obs;
      try { obs = normalize(raw, nowMs); } catch (error) { return { status: 'rejected', reason: error.message }; }
      const previous = this.#entries.get(obs.key);
      if (previous && obs.physicalMs < previous.observation.physicalMs) return { status: 'ignored_regression' };
      if (previous && obs.physicalMs === previous.observation.physicalMs) {
        const old = previous.observation;
        const same = old.point.latitude === obs.point.latitude && old.point.longitude === obs.point.longitude &&
          JSON.stringify(old.reportedLine) === JSON.stringify(obs.reportedLine);
        this.#entries.set(obs.key, { observation: old, conflict: previous.conflict || !same,
          event: same ? 'repeated_physical_gps' : 'equal_time_conflict' });
        return { status: same ? 'repeated_physical_gps' : 'equal_time_conflict' };
      }
      const changed = previous && JSON.stringify(previous.observation.reportedLine) !== JSON.stringify(obs.reportedLine);
      const event = changed ? 'service_changed' : 'accepted';
      this.#entries.set(obs.key, { observation: obs, conflict: previous?.conflict || false, event });
      return { status: event };
    }
    view(facility, nowMs) {
      return [...this.#entries.values()].map(entry => presentation(entry, facility, nowMs, this.#catalog));
    }
  }
  return Object.freeze({ POLICY, utc, normalize, lineEvidence, distance, validateFacility, classifySpatial, ObservationStore });
});
