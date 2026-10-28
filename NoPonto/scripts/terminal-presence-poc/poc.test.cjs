'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('./core.js');
const fixtures = require('./fixtures.js');
const { assessTemporalAbsence } = require('./temporal-study.cjs');
const T = Date.parse('2026-10-28T12:00:00.000Z');
const row = options => fixtures.observation(T, options);
const store = () => new core.ObservationStore(fixtures.catalog);
const view = (s, now = T, facility = fixtures.facility) => s.view(facility, now)[0];
const frame = overrides => ({ identitySeen: false, identityAmbiguous: false, itsComplete: true,
  providerKnown: true, nowMs: T + 2000, physicalMs: T - 30000, minuteMs: T, serverMs: T + 1000,
  before: { complete: true, identityCoverage: true, generatedMs: T - 20000 },
  after: { complete: true, identityCoverage: true, generatedMs: T + 1000 }, ...overrides });

test('normalization preserves original identity, coordinates, physical timestamp and provenance', () => {
  const raw = row({ id: ' SIM-A ', point: { latitude: 10.0003, longitude: 20.0002 } });
  raw.identity.provider = 'LAB-2';
  const normalized = core.normalize(raw, T);
  assert.equal(normalized.identity.vehicleId, ' SIM-A ');
  assert.deepEqual(normalized.point, raw.point);
  assert.equal(normalized.physicalTimestamp, raw.physicalTimestamp);
  assert.equal(normalized.receivedTimestamp, raw.receivedTimestamp);
  assert.equal(normalized.identity.provider, 'LAB-2');
  raw.point.latitude = 12;
  assert.equal(normalized.point.latitude, 10.0003);
  assert.ok(Object.isFrozen(normalized.point));
});

test('normalization rejects malformed, future and nonphysical fixes', () => {
  const badTime = row(); badTime.physicalTimestamp = '2026-02-30T00:00:00Z';
  assert.throws(() => core.normalize(badTime, T), /invalid_utc/);
  const future = row({ age: -1 });
  assert.throws(() => core.normalize(future, T), /future_physical_time/);
  const zero = row({ point: { latitude: 0, longitude: 0 } });
  assert.throws(() => core.normalize(zero, T), /invalid_fix/);
  const badAccuracy = row(); badAccuracy.quality.accuracyMetres = -2;
  assert.throws(() => core.normalize(badAccuracy, T), /invalid_accuracy/);
});

test('missing or invalid line data retains physical fix without assigning a service', () => {
  const s = store();
  assert.equal(s.receive(row({ service: null, routeId: null }), T).status, 'accepted');
  assert.equal(view(s).line.status, 'unknown');
  const invalid = row({ id: 'SIM-X' }); invalid.reportedLine.service = 42;
  assert.equal(s.receive(invalid, T).status, 'accepted');
  assert.equal(s.view(fixtures.facility, T)[1].line.reason, 'invalid_line_metadata');
  assert.equal(s.view(fixtures.facility, T)[1].marker.latitude, invalid.point.latitude);
});

test('reported service needs unique catalog match and consistent route', () => {
  const known = core.normalize(row(), T);
  assert.equal(core.lineEvidence(known, fixtures.catalog).status, 'reported');
  const conflicting = core.normalize(row({ service: 'F2', routeId: 'fixture-route-1' }), T);
  assert.equal(core.lineEvidence(conflicting, fixtures.catalog).status, 'conflict');
  assert.equal(core.lineEvidence(known, [...fixtures.catalog, fixtures.catalog[0]]).reason, 'service_ambiguous');
  assert.equal(core.lineEvidence(core.normalize(row({ service: 'UNLISTED' }), T), fixtures.catalog).status, 'unknown');
});

test('physical identities stay separate across provider and source namespaces', () => {
  const s = store(); const a = row(); const b = row(); const c = row(); const d = row({ id: 'sim-a' });
  b.identity.provider = 'OTHER'; c.identity.source = 'other-source';
  for (const observation of [a, b, c, d]) assert.equal(s.receive(observation, T).status, 'accepted');
  assert.equal(s.view(fixtures.facility, T).length, 4);
});

test('repeated GPS and newer receipt never renew physical age or move marker', () => {
  const s = store(); const original = row(); s.receive(original, T);
  const repeated = structuredClone(original); repeated.receivedTimestamp = new Date(T + 30000).toISOString();
  assert.equal(s.receive(repeated, T + 30000).status, 'repeated_physical_gps');
  assert.equal(view(s, T + 30000).ageSeconds, 120);
  assert.deepEqual(view(s, T + 30000).marker, original.point);
  assert.equal(view(s, T + 30000).physicalTimestamp, original.physicalTimestamp);
});

test('regressive GPS cannot replace last point and old GPS remains explicitly old', () => {
  const s = store(); const original = row(); s.receive(original, T);
  const regressive = row({ age: 91, point: { latitude: 10.005, longitude: 20.005 } });
  assert.equal(s.receive(regressive, T).status, 'ignored_regression');
  assert.deepEqual(view(s).marker, original.point);
  assert.equal(view(s, T + 91000).ageStatus, 'old');
  assert.equal(view(s, T + 91000).ageSeconds, 181);
  assert.equal(view(s, T + 91000).departureStatus, 'unconfirmed');
});

test('new physical GPS can change service or clear it without confirming departure', () => {
  const s = store(); s.receive(row(), T);
  assert.equal(s.receive(row({ age: 20, service: 'F2', routeId: 'fixture-route-2' }), T).status, 'service_changed');
  assert.equal(view(s).serviceLabel, 'Serviço informado F2');
  assert.equal(s.receive(row({ age: 10, service: null, routeId: null }), T).status, 'service_changed');
  assert.equal(view(s).serviceLabel, 'Serviço desconhecido');
  assert.equal(view(s).tripStatus, 'unconfirmed');
  assert.equal(view(s).departureLabel, 'Saída não confirmada');
});

test('same identity and timestamp with conflicting point suspends marker even after newer GPS', () => {
  const s = store(); s.receive(row(), T);
  assert.equal(s.receive(row({ point: { latitude: 10.001, longitude: 20.001 } }), T).status, 'equal_time_conflict');
  assert.equal(view(s).marker, null);
  assert.equal(view(s).spatial.classification, 'uncertain_location');
  s.receive(row({ age: 10 }), T);
  assert.equal(view(s).marker, null);
  assert.equal(view(s).identityConflict, true);
});

test('same timestamp with changed service is an identity conflict, not a fresh trip', () => {
  const s = store(); s.receive(row(), T);
  assert.equal(s.receive(row({ service: 'F2', routeId: 'fixture-route-2' }), T).status, 'equal_time_conflict');
  assert.equal(view(s).line.status, 'conflict');
  assert.equal(view(s).tripStatus, 'unconfirmed');
});

test('clock before physical fix hides marker rather than fabricating present position', () => {
  const s = store(); s.receive(row(), T);
  assert.equal(view(s, T - 91000).ageStatus, 'clock_uncertain');
  assert.equal(view(s, T - 91000).marker, null);
});

test('anchor proximity has fixed 200 m and 1000 m boundaries with accuracy uncertainty', () => {
  const anchor = fixtures.facility.anchors[0];
  const offset = metres => ({ latitude: anchor.latitude + metres / 111195, longitude: anchor.longitude });
  assert.equal(core.classifySpatial(offset(199), fixtures.facility, 0).classification, 'near_terminal');
  assert.equal(core.classifySpatial(offset(201), fixtures.facility, 0).classification, 'uncertain_location');
  assert.equal(core.classifySpatial(offset(999), fixtures.facility, 0).classification, 'uncertain_location');
  assert.equal(core.classifySpatial(offset(1001), fixtures.facility, 0).classification, 'outside');
  assert.equal(core.classifySpatial(offset(199), fixtures.facility, 5).classification, 'uncertain_location');
});

test('only reviewed synthetic polygon with accuracy supports inside_trusted', () => {
  const p = fixtures.initial(T)[0].point;
  const reviewed = core.classifySpatial(p, fixtures.facilityWithSyntheticZone, 8);
  assert.equal(reviewed.classification, 'inside_trusted');
  assert.equal(reviewed.geometryRevision, 'fixture-v1');
  assert.equal(core.classifySpatial(p, fixtures.facilityWithSyntheticZone, null).classification, 'uncertain_location');
  assert.equal(core.classifySpatial(p, fixtures.facility, 8).classification, 'near_terminal');
  const candidate = structuredClone(fixtures.facilityWithSyntheticZone); candidate.zones[0].trust = 'candidate';
  assert.equal(core.classifySpatial(p, candidate, 8).classification, 'near_terminal');
  assert.equal(core.classifySpatial({ latitude: 10.00079, longitude: 20 }, fixtures.facilityWithSyntheticZone, 8).classification, 'uncertain_location');
});

test('invalid polygon and missing reviewed provenance cannot assert interior', () => {
  const unclosed = structuredClone(fixtures.facilityWithSyntheticZone); unclosed.zones[0].ring.pop();
  assert.throws(() => core.validateFacility(unclosed), /invalid_ring/);
  const missing = structuredClone(fixtures.facilityWithSyntheticZone); delete missing.zones[0].revision;
  assert.throws(() => core.validateFacility(missing), /invalid_geometry_revision/);
  const crossed = structuredClone(fixtures.facilityWithSyntheticZone);
  crossed.zones[0].ring = [
    { latitude: 10, longitude: 20 }, { latitude: 10.001, longitude: 20.001 },
    { latitude: 10, longitude: 20.001 }, { latitude: 10.001, longitude: 20 },
    { latitude: 10, longitude: 20 } ];
  assert.throws(() => core.validateFacility(crossed), /self_intersecting_ring|degenerate_ring/);
});

test('temporal absence requires fresh physical GPS and aligned complete GTFS generations', () => {
  assert.equal(assessTemporalAbsence(frame()).absenceComparable, true);
  assert.equal(assessTemporalAbsence(frame({ physicalMs: T - 60001 })).reasons.includes('physical_age_outside_0_to_60s'), true);
  assert.equal(assessTemporalAbsence(frame({ before: { complete: true, identityCoverage: true, generatedMs: T - 91000 } })).absenceComparable, false);
  assert.equal(assessTemporalAbsence(frame({ after: { complete: false, identityCoverage: false, generatedMs: T + 1000 } })).absenceComparable, false);
});

test('repeated GTFS generation and provider ambiguity make missing identity inconclusive', () => {
  const repeated = frame({ before: { complete: true, identityCoverage: true, generatedMs: T - 20000 },
    after: { complete: true, identityCoverage: true, generatedMs: T - 20000 } });
  assert.ok(assessTemporalAbsence(repeated).reasons.includes('gtfs_generation_not_advanced'));
  const ambiguous = assessTemporalAbsence(frame({ identityAmbiguous: true, providerKnown: false }));
  assert.ok(ambiguous.reasons.includes('identity_ambiguous'));
  assert.ok(ambiguous.reasons.includes('provider_unverified'));
  assert.equal(assessTemporalAbsence(frame({ identitySeen: true })).result, 'identity_seen_in_snapshot');
});

test('different feed cadences cannot turn last position into contemporary absence', () => {
  const oldPhysical = frame({ physicalMs: T - 90000,
    before: { complete: true, identityCoverage: true, generatedMs: T - 45000 },
    after: { complete: true, identityCoverage: true, generatedMs: T - 31000 } });
  const result = assessTemporalAbsence(oldPhysical);
  assert.equal(result.absenceComparable, false);
  assert.ok(result.reasons.includes('physical_age_outside_0_to_60s'));
  assert.equal(result.result, 'inconclusive_absence');
  assert.equal(assessTemporalAbsence(frame({ physicalMs: T - 58000 })).reasons.includes('physical_age_outside_0_to_60s'), false);
});

test('generation-to-physical gap over 60 seconds is independent of physical age and server minute', () => {
  const evidence = frame({ physicalMs: T - 10000,
    before: { complete: true, identityCoverage: true, generatedMs: T - 75000 } });
  const result = assessTemporalAbsence(evidence);
  assert.ok(result.reasons.includes('gtfs_before_physical_gap_over_60s'));
  assert.ok(!result.reasons.includes('physical_age_outside_0_to_60s'));
  assert.equal(assessTemporalAbsence(frame({ serverMs: T - 1000 })).reasons.includes('server_time_outside_requested_minute'), true);
});

class Element {
  constructor() { this.children = []; this.listeners = {}; this.attributes = {}; this.textContent = ''; this.dataset = {}; this.hidden = false; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = [...items]; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  click() { this.listeners.click(); }
}
function browser() {
  const folder = __dirname;
  const ids = Object.fromEntries(['clock', 'pause', 'advance', 'reset', 'geometry', 'geometry-legend',
    'synthetic-zone', 'cards', 'markers', 'event'].map(id => [id, new Element()]));
  const buttons = ['repeat', 'regression', 'service', 'unknown', 'conflict'].map(name => {
    const element = new Element(); element.dataset.scenario = name; return element;
  });
  let wall = T, tick;
  class Clock extends Date { static now() { return wall; } }
  const context = vm.createContext({ Date: Clock, structuredClone, console,
    document: { getElementById: id => ids[id], querySelectorAll: () => buttons,
      createElement: () => new Element(), createElementNS: () => new Element() },
    setInterval: callback => { tick = callback; },
    fetch: () => { throw new Error('network forbidden'); },
    WebSocket: () => { throw new Error('network forbidden'); },
    XMLHttpRequest: () => { throw new Error('network forbidden'); } });
  for (const file of ['core.js', 'fixtures.js', 'app.js'])
    vm.runInContext(fs.readFileSync(path.join(folder, file), 'utf8'), context, { filename: file });
  return { ids, buttons: Object.fromEntries(buttons.map(button => [button.dataset.scenario, button])),
    advanceWall: ms => { wall += ms; tick(); } };
}
const cardText = card => [card.textContent, ...card.children.flatMap(child => [child.textContent, ...child.children.map(x => x.textContent)])].join(' ');

test('browser presentation ages physical GPS while schematic marker stays fixed', () => {
  const ui = browser();
  assert.equal(ui.ids.cards.children.length, 4);
  assert.equal(ui.ids.markers.children.length, 4);
  const before = ui.ids.markers.children.map(x => x.attributes.transform);
  ui.advanceWall(30000);
  assert.deepEqual(ui.ids.markers.children.map(x => x.attributes.transform), before);
  assert.match(cardText(ui.ids.cards.children[0]), /GPS há 2 min 0 s/);
  assert.match(cardText(ui.ids.cards.children[3]), /Observação antiga; a posição atual é desconhecida/);
  assert.doesNotMatch(cardText(ui.ids.cards.children[0]), /ETA|Em viagem/);
});

test('browser buttons show proximity, synthetic trusted interior, service changes and conflict', () => {
  const ui = browser();
  assert.match(cardText(ui.ids.cards.children[0]), /próxima ao terminal/);
  ui.ids.geometry.click();
  assert.equal(ui.ids['synthetic-zone'].hidden, false);
  assert.match(cardText(ui.ids.cards.children[0]), /Última posição no terminal/);
  ui.buttons.service.click();
  assert.match(cardText(ui.ids.cards.children[0]), /Serviço informado F2/);
  ui.buttons.unknown.click();
  assert.match(cardText(ui.ids.cards.children[0]), /Serviço desconhecido/);
  ui.buttons.conflict.click();
  assert.equal(ui.ids.markers.children.length, 3);
  assert.match(cardText(ui.ids.cards.children[0]), /posição não confirmada/);
  ui.ids.reset.click();
  assert.equal(ui.ids.markers.children.length, 4);
  assert.equal(ui.ids['synthetic-zone'].hidden, true);
});

test('browser repeat, regression and expiry do not fabricate a fresh location', () => {
  const ui = browser(); const before = ui.ids.markers.children[0].attributes.transform;
  ui.buttons.repeat.click();
  assert.match(ui.ids.event.textContent, /Mesmo GPS físico/);
  ui.buttons.regression.click();
  assert.match(ui.ids.event.textContent, /regressivo ignorado/);
  ui.ids.advance.click(); ui.ids.advance.click(); ui.ids.advance.click(); ui.ids.advance.click();
  assert.match(cardText(ui.ids.cards.children[0]), /Observação antiga/);
  assert.equal(ui.ids.markers.children[0].attributes.transform, before);
});

test('static HTML only loads local assets and never requests an operational source', () => {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.match(html, /connect-src 'none'/);
  for (const file of ['core.js', 'fixtures.js', 'app.js', 'style.css']) assert.ok(html.includes('"' + file + '"'));
  for (const id of ['clock', 'cards', 'markers', 'geometry', 'synthetic-zone']) assert.ok(html.includes('id="' + id + '"'));
  assert.equal(fixtures.facility.zones.length, 0);
  assert.equal(fixtures.facilityWithSyntheticZone.zones[0].source, 'synthetic-fixture');
});
