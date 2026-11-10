import assert from "node:assert/strict";
import test from "node:test";
import {
  formatarCodigoLinhaParaFala,
  normalizarPreferenciasVozRadar,
  PREFERENCIAS_VOZ_RADAR_PADRAO,
  precisaConfirmarBluetoothRadar,
} from "./radarVozPreferencias";

test("pronuncia códigos longos algarismo por algarismo sem alterar minutos", () => {
  assert.equal(formatarCodigoLinhaParaFala("Linha 838 em 3 minutos; linha 11 em 2 minutos."),
    "Linha oito três oito em 3 minutos; linha 11 em 2 minutos.");
});

test("preferências novas usam janela de 7 minutos e frequência equilibrada", () => {
  assert.equal(PREFERENCIAS_VOZ_RADAR_PADRAO.advanceMinutes, 7);
  assert.equal(PREFERENCIAS_VOZ_RADAR_PADRAO.announceArriving, true);
  assert.equal(PREFERENCIAS_VOZ_RADAR_PADRAO.vehicleSelection, "allRelevant");
  assert.equal(PREFERENCIAS_VOZ_RADAR_PADRAO.announcementFrequency, "balanced");
  assert.equal(PREFERENCIAS_VOZ_RADAR_PADRAO.soundBeforeSpeech, false);
});

test("som antes da fala é desligado por padrão e migra apenas quando explicitamente ativado", () => {
  assert.equal(normalizarPreferenciasVozRadar({}).soundBeforeSpeech, false);
  assert.equal(normalizarPreferenciasVozRadar({ soundBeforeSpeech: true }).soundBeforeSpeech, true);
});

test("normalização limita a janela e preserva os três modos novos", () => {
  const value = normalizarPreferenciasVozRadar({
    advanceMinutes: 31,
    announceArriving: false,
    vehicleSelection: "nextAndFavorites",
    announcementFrequency: "eachUpdate",
  });

  assert.equal(value.advanceMinutes, 15);
  assert.equal(value.announceArriving, false);
  assert.equal(value.vehicleSelection, "nextAndFavorites");
  assert.equal(value.announcementFrequency, "eachUpdate");
});

test("migração limita antecedências antigas acima de 15 minutos", () => {
  assert.equal(normalizarPreferenciasVozRadar({ alertAtMinutes: [30, 20, 0] }).advanceMinutes, 15);
  assert.equal(normalizarPreferenciasVozRadar({ advanceMinutes: 20 }).advanceMinutes, 15);
});

test("migra limites antigos para a maior antecedência e mapeia opções antigas", () => {
  const value = normalizarPreferenciasVozRadar({
    alertAtMinutes: [8, 5, 2, 0], vehicleSelection: "preferPriority", repeatIntervalMinutes: 5,
  });

  assert.equal(value.advanceMinutes, 8);
  assert.equal(value.announceArriving, true);
  assert.equal(value.vehicleSelection, "nextAndFavorites");
  assert.equal(value.announcementFrequency, "balanced");
});

test("migração preserva configurações antigas sem limite 'Chegando'", () => {
  const value = normalizarPreferenciasVozRadar({ alertAtMinutes: [8, 5, 2], repeatIntervalMinutes: 0 });

  assert.equal(value.advanceMinutes, 8);
  assert.equal(value.announceArriving, false);
  assert.equal(value.announcementFrequency, "essential");
});

test("migração sem repeatIntervalMinutes usa Equilibrado como o armazenamento nativo", () => {
  const value = normalizarPreferenciasVozRadar({ alertAtMinutes: [5, 2] });

  assert.equal(value.announcementFrequency, "balanced");
});

test("confirmação é solicitada somente para A2DP que não foi reconhecido nem autorizado", () => {
  assert.equal(precisaConfirmarBluetoothRadar({
    routeType: "bluetooth_a2dp", automaticHeadphone: false, authorized: false, requiresConfirmation: true,
  }), true);
  assert.equal(precisaConfirmarBluetoothRadar({
    routeType: "bluetooth_a2dp", automaticHeadphone: true, authorized: false, requiresConfirmation: false,
  }), false);
  assert.equal(precisaConfirmarBluetoothRadar({
    routeType: "bluetooth_a2dp", automaticHeadphone: false, authorized: true, requiresConfirmation: false,
  }), false);
  assert.equal(precisaConfirmarBluetoothRadar({
    routeType: "usb_device", automaticHeadphone: false, authorized: false, requiresConfirmation: false,
  }), false);
});
