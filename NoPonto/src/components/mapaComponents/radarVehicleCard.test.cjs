const test = require('node:test');
const assert = require('node:assert/strict');
const { criarHarness } = require('../../hooks/radarTestHarness.cjs');

const h = criarHarness();
const { textoSobreCor, fundoIdentificador } = h.carregar('../components/mapaComponents/radarVehicleCard.ts', {
  '@/src/utils/cores': { hexParaRgba: () => '' },
});

test('texto do identificador contrasta com a cor da linha', () => {
  assert.equal(textoSobreCor('#FFC107'), '#1E1E1E');
  assert.equal(textoSobreCor('#0055CC'), '#FFFFFF');
  assert.equal(textoSobreCor('#FFF'), '#1E1E1E');
  assert.equal(textoSobreCor('inválida'), '#FFFFFF');
});

test('fundo do identificador só escurece quando necessário para texto branco', () => {
  assert.equal(fundoIdentificador('#FFC107'), '#FFC107');
  assert.equal(fundoIdentificador('#111111'), '#111111');
  assert.notEqual(fundoIdentificador('#F4511E'), '#F4511E');
  assert.equal(textoSobreCor('#F4511E'), '#FFFFFF');
});
