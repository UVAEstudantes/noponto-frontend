import assert from "node:assert/strict";
import test from "node:test";
import { buildMapWebViewScript } from "./mapScript";

const script = buildMapWebViewScript({ latInicial: -22.9, lngInicial: -43.2,
  estilosJS: "", filtrosMapaJS: "", estiloMapaPadrao: "light" });

test("rail marker restores the original train marker structure and stable identity", () => {
  assert.match(script, /railMarkerElement/);
  assert.match(script, /busIcon\(visual\.color,0,'trem'\)/);
  assert.match(script, /\.train-marker > \.bus-inner > \.bus-blob/);
  assert.doesNotMatch(script, /className='rail-vehicle-marker/);
  assert.match(script, /run\.idVisual\|\|run\.railVehicleId\|\|run\.railRunId/);
});

test("all rail states retain click handling and open the existing popup", () => {
  assert.match(script, /rail-status-live/);
  assert.match(script, /rail-status-estimated/);
  assert.match(script, /rail-status-scheduled/);
  assert.match(script, /addEventListener\('click'/);
  assert.match(script, /openRailPopup\(current,c\)/);
  assert.match(script, /'circle-radius':16,'circle-opacity':0/);
});

test("rail heading follows the local route tangent without recreating the marker", () => {
  assert.match(script, /railHeadingAtDistance/);
  assert.match(script, /railCoordinateAtDistance\(g,Math\.max\(0,distance-delta\)\)/);
  assert.match(script, /railCoordinateAtDistance\(g,Math\.min\(g\.total,distance\+delta\)\)/);
  assert.match(script, /railHeadings\[key\]=heading/);
  assert.match(script, /else heading=railHeadings\[key\]/);
  assert.match(script, /marker\.setLngLat\(coord\)/);
  assert.doesNotMatch(script, /railMarkers\[key\]\.remove\(\).*applyRailHeading/);
});

test("rail popup has singleton lifecycle and same identity updates in place", () => {
  assert.match(script, /activeRailPopup=null,activeRailPopupIdentity=null/);
  assert.match(script, /activeRailPopup&&activeRailPopupIdentity===identity/);
  assert.match(script, /activeRailPopup\.setLngLat\(coord\)/);
  assert.match(script, /activeRailPopupSignature!==signature/);
  assert.match(script, /if\(activeRailPopup\)activeRailPopup\.remove\(\)/);
  assert.match(script, /popup\.on\('close'/);
  assert.match(script, /classList\.add\('rail-selected'\)/);
  assert.match(script, /classList\.remove\('rail-selected'\)/);
});

test("human presentation supports all statuses and never falls back to UUID destination", () => {
  assert.match(script, /Ao vivo/);
  assert.match(script, /Estimado/);
  assert.match(script, /Programado/);
  assert.match(script, /destinationName/);
  assert.match(script, /lineName/);
  assert.match(script, /platformLabel/);
  assert.match(script, /nextStationName/);
  assert.match(script, /popup-train-code/);
  assert.match(script, /Atualizado /);
  assert.doesNotMatch(script, /Última confirmação/);
  assert.match(script, /data-lucide="flag"/);
  assert.match(script, /\^\[0-9a-f\]/);
  assert.doesNotMatch(script, /Destino: '\+run\.destination/);
});

test("bus and BRT marker branches remain intact", () => {
  assert.match(script, /var isTrain=\(modal\|\|''\)\.toLowerCase\(\)==='trem'/);
  assert.match(script, /var isBrt=\(modal\|\|''\)\.toLowerCase\(\)==='brt'/);
  assert.match(script, /brt-mask/);
  assert.match(script, /bus-blob/);
  assert.match(script, /popup-vehicle" style="--c:/);
  assert.doesNotMatch(script, /popup-service/);
});

test("terminal consumes backend semantics and returns to next-station presentation", () => {
  assert.match(script, /run\.isAtOriginTerminal/);
  assert.match(script, /Saída em/);
  assert.match(script, /Saindo agora/);
  assert.match(script, /Próxima:/);
  assert.match(script, /data-rail-departure/);
});

test("last evidence is elapsed locally and absent evidence renders no false clock", () => {
  assert.match(script, /railElapsed/);
  assert.match(script, /data-rail-evidence/);
  assert.match(script, /run\.lastRealtimeEvidenceUtc\?/);
});
