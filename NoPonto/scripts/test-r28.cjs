// Complete local R28 regression suite; reuses the existing TypeScript/node:test runner.
const files=[
 'src/services/hybridContinuity.test.ts','src/services/originDeparture.test.ts',
 'src/services/terminalEarlyTracking.test.ts','src/hooks/useTerminalRadar.test.cjs',
 'src/services/gpsTerminals.test.ts','src/services/hybridContext.test.ts',
 'src/services/hybridGps.test.ts','src/services/unifiedLocationContract.test.ts',
 'src/services/unifiedNetwork.test.ts','src/services/hybridPerformance.test.ts',
 'src/services/physicalPresenceContract.test.ts','src/services/physicalPresenceHub.test.cjs',
 'src/services/physicalPresenceMap.test.cjs','src/components/mapOSM/webview/railPresentation.test.ts',
 'src/components/mapaComponents/radarConfiabilidade.test.cjs','src/services/gpsRemovals.test.cjs',
 'src/services/radarParada.test.ts','src/services/radarRequests.test.ts',
 'src/services/apresentacaoRadar.test.ts','src/services/eventosParada.test.ts',
 'src/services/confiancaApresentacao.test.ts','src/hooks/useConsultaEventosParada.test.cjs',
 'src/services/radarPassenger.test.ts',
];
process.argv.splice(2,process.argv.length-2,...files);
require('./test-radar.cjs');
