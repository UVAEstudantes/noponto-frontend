(function () {
  'use strict';
  const core = globalThis.TerminalPresencePoC, fixtures = globalThis.TerminalPresenceFixtures;
  const byId = id => document.getElementById(id);
  const svgNS = 'http://www.w3.org/2000/svg';
  let nowMs, store, currentA, paused = false, syntheticGeometry = false, previousWall = Date.now();
  const messages = { accepted: 'Novo GPS físico recebido.', service_changed: 'Nova observação: serviço informado substituído.',
    repeated_physical_gps: 'Mesmo GPS físico: a idade continua crescendo.', ignored_regression: 'GPS regressivo ignorado; o último fix foi preservado.',
    equal_time_conflict: 'Identidade em conflito: marcador suspenso.', rejected: 'Fixture rejeitada.' };
  function add(parent, tag, value, className) {
    const element = document.createElement(tag); element.textContent = value;
    if (className) element.className = className;
    parent.append(element); return element;
  }
  function render() {
    byId('clock').textContent = new Date(nowMs).toLocaleTimeString('pt-BR', { timeZone: 'UTC' }) + ' UTC · simulação';
    byId('pause').textContent = paused ? 'Retomar relógio' : 'Pausar relógio';
    byId('cards').replaceChildren(); byId('markers').replaceChildren();
    byId('synthetic-zone').hidden = !syntheticGeometry;
    byId('geometry').textContent = syntheticGeometry ? 'Ocultar perímetro sintético' : 'Exibir perímetro sintético revisado';
    byId('geometry-legend').textContent = syntheticGeometry ? 'Polígono fictício revisado para demonstrar inside_trusted' : 'Sem área “dentro do terminal”';
    const facility = syntheticGeometry ? fixtures.facilityWithSyntheticZone : fixtures.facility;
    for (const view of store.view(facility, nowMs)) {
      const card = add(byId('cards'), 'article', '', 'card');
      add(card, 'span', view.identity.vehicleId + (view.ageStatus === 'old' ? ' · antiga' : ' · última observação'),
        'badge' + (view.ageStatus === 'old' ? ' old' : ''));
      add(card, 'h3', view.locationLabel); add(card, 'p', view.ageLabel, 'age');
      add(card, 'p', view.serviceLabel); add(card, 'p', view.departureLabel, 'departure');
      add(card, 'p', view.quality.accuracyMetres == null ? 'Precisão GPS não informada' :
        'Precisão informada: ±' + view.quality.accuracyMetres + ' m', 'muted');
      add(card, 'p', 'Origem: fixture sintética / ' + view.identity.provider, 'muted');
      add(card, 'p', view.physicalTimestamp, 'muted');
      if (view.ageStatus === 'old') add(card, 'p', 'Observação antiga; a posição atual é desconhecida.', 'departure');
      if (view.marker) {
        const point = view.marker, anchor = fixtures.facility.anchors[0];
        const east = (point.longitude - anchor.longitude) * Math.cos(anchor.latitude * Math.PI / 180) * Math.PI / 180 * 6371000;
        const north = (point.latitude - anchor.latitude) * Math.PI / 180 * 6371000;
        const group = document.createElementNS(svgNS, 'g');
        group.setAttribute('transform', `translate(${450 + east * .16},${220 - north * .16})`);
        const dot = document.createElementNS(svgNS, 'circle');
        dot.setAttribute('r', '6'); dot.setAttribute('class', 'marker-dot' + (view.ageStatus === 'old' ? ' marker-old' : ''));
        const label = document.createElementNS(svgNS, 'text');
        label.setAttribute('x', '10'); label.setAttribute('y', '4'); label.setAttribute('class', 'marker-label');
        label.textContent = view.identity.vehicleId;
        group.append(dot, label); byId('markers').append(group);
      }
    }
  }
  function reset() {
    nowMs = Date.now(); previousWall = Date.now(); syntheticGeometry = false;
    store = new core.ObservationStore(fixtures.catalog);
    const rows = fixtures.initial(nowMs); currentA = structuredClone(rows[0]);
    rows.forEach(row => store.receive(row, nowMs));
    byId('event').textContent = 'Fixtures sintéticas iniciais carregadas. Nenhuma fonte externa.';
    render();
  }
  byId('pause').addEventListener('click', () => { paused = !paused; previousWall = Date.now(); render(); });
  byId('advance').addEventListener('click', () => { nowMs += 30000; render(); });
  byId('reset').addEventListener('click', reset);
  byId('geometry').addEventListener('click', () => { syntheticGeometry = !syntheticGeometry; render(); });
  document.querySelectorAll('[data-scenario]').forEach(button => button.addEventListener('click', () => {
    const next = structuredClone(currentA), action = button.dataset.scenario;
    next.receivedTimestamp = new Date(nowMs).toISOString();
    if (action === 'regression') next.physicalTimestamp = new Date(Date.parse(currentA.physicalTimestamp) - 1000).toISOString();
    if (action === 'service' || action === 'unknown') {
      nowMs = Math.max(nowMs, Date.parse(currentA.physicalTimestamp) + 1000);
      next.physicalTimestamp = new Date(nowMs).toISOString();
      next.reportedLine = action === 'service' ? { service: 'F2', routeId: 'fixture-route-2' } : { service: null, routeId: null };
      next.receivedTimestamp = next.physicalTimestamp;
    }
    if (action === 'conflict') next.point.longitude += .001;
    const result = store.receive(next, nowMs);
    if (result.status === 'accepted' || result.status === 'service_changed') currentA = structuredClone(next);
    byId('event').textContent = messages[result.status] || result.status;
    render();
  }));
  reset();
  // This timer updates only the display clock. Observations arrive only via fixture buttons.
  setInterval(() => {
    const wall = Date.now();
    if (!paused) nowMs += Math.max(0, wall - previousWall);
    previousWall = wall; render();
  }, 1000);
})();
