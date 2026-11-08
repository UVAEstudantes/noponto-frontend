import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnosticarRadar, etapaRadar } from './radarRemotoDiagnostico';

test('diagnostico preserva resultado e excecao sem emitir dados sensiveis', async () => {
  const runtime = globalThis as typeof globalThis & { __DEV__?: boolean };
  const anterior = runtime.__DEV__, info = console.info;
  const logs: unknown[][] = [];
  runtime.__DEV__ = true;
  console.info = (...args: unknown[]) => { logs.push(args); };
  try {
    assert.equal(await etapaRadar('secure-store.leitura', async () => 'synthetic-private-value'), 'synthetic-private-value');
    const erro = new Error('Default FirebaseApp is not initialized synthetic-private-value');
    await assert.rejects(etapaRadar('push.fcm-token', async () => { throw erro; }), e => e === erro);
    assert.deepEqual(logs.map(l => l.slice(1)), [
      ['secure-store.leitura', 'inicio', ''], ['secure-store.leitura', 'ok', ''],
      ['push.fcm-token', 'inicio', ''], ['push.fcm-token', 'falha', 'firebase_nativo'],
    ]);
    assert.equal(JSON.stringify(logs).includes('synthetic-private-value'), false);
    runtime.__DEV__ = false;
    diagnosticarRadar('push.fcm-token', 'falha', erro);
    assert.equal(logs.length, 4);
  } finally {
    console.info = info;
    if (anterior === undefined) delete runtime.__DEV__; else runtime.__DEV__ = anterior;
  }
});
