// Existing GPS/Radar regressions plus approved startup, navigation and popup contracts.
require('./test-r28.cjs');
for (const file of [
  'startup', 'terminalPresence', 'favoritos', 'carregamentoInicial',
  'popupDetails', 'radarStopTitle', 'apresentacaoIndicadores', 'normalAppBoundary',
]) require(`../src/services/${file}.test.cjs`);
