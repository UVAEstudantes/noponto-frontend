/* global __dirname */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

test('normal navigation exports Home and map panels have no capture or input lab dependency', () => {
  const root = path.resolve(__dirname, '../..');
  const index = fs.readFileSync(path.join(root, 'app/index.tsx'), 'utf8');
  assert.match(index, /export default Home;/);
  for (const file of ['app/index.tsx', 'src/components/mapOSM/mapOSM.tsx',
    'src/components/mapOSM/webview/mapScript.ts', 'src/components/mapaComponents/buscaMapa.tsx',
    'src/components/mapaComponents/linhasContainer.tsx', 'src/components/mapaComponents/paradaSheet.tsx',
    'src/components/mapaComponents/radarParada.tsx']) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, file), 'utf8'),
      /r28Capture|R28InputLab|r28InteractionDiagnostics|R28_CAPTURE_ENABLED|EXPO_PUBLIC_R28_|services\/movementDiagnostics/, file);
  }
});
