import test from 'node:test';
import assert from 'node:assert/strict';
import {
  criarCabecalhosRadar,
  dominioNgrok,
  interpretarRespostaRadar,
  NGROK_SKIP_WARNING,
  opcoesRequisicaoRadar,
} from './radarRemotoHttp';

function resposta(
  status: number,
  contentType: string | null,
  body: string
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'content-type' ? contentType : null,
    },
    text: async () => body,
  } as unknown as Response;
}

test('detecta somente hosts ngrok reais e seus subdominios', () => {
  for (const host of [
    'duplicity-wisplike-friend.ngrok-free.dev',
    'foo.ngrok-free.app',
    'foo.ngrok.io',
    'foo.ngrok.app',
    'foo.ngrok.dev',
    'ngrok-free.dev',
  ]) {
    assert.equal(dominioNgrok(host), true, host);
  }

  for (const host of [
    'api.noponto.com.br',
    'ngrok-free.dev.evil.com',
    'meungrok-free.dev',
    'localhost',
    '127.0.0.1',
    '192.168.1.44',
    '',
  ]) {
    assert.equal(dominioNgrok(host), false, host);
  }
});

test('cabecalhos mantem Content-Type e Authorization e somam o header ngrok', () => {
  const headers = criarCabecalhosRadar(
    'owner.secret',
    'duplicity-wisplike-friend.ngrok-free.dev'
  );
  assert.deepEqual(headers, {
    'Content-Type': 'application/json',
    [NGROK_SKIP_WARNING]: '1',
    Authorization: 'Bearer owner.secret',
  });
});

test('cabecalhos fora do ngrok nao ganham o header e nao inventam Authorization', () => {
  assert.deepEqual(
    criarCabecalhosRadar(undefined, 'api.noponto.com.br'),
    { 'Content-Type': 'application/json' }
  );
  assert.deepEqual(
    criarCabecalhosRadar(undefined, 'localhost'),
    { 'Content-Type': 'application/json' }
  );
});

test('GET POST PUT DELETE usam o mesmo header ngrok e preservam o corpo', () => {
  for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
    const opcoes = opcoesRequisicaoRadar(
      method,
      'duplicity-wisplike-friend.ngrok-free.dev',
      'credential',
      method === 'GET' || method === 'DELETE' ? undefined : { paradaId: 'stop' }
    );
    assert.equal(opcoes.method, method);
    assert.equal(opcoes.headers[NGROK_SKIP_WARNING], '1');
    assert.equal(opcoes.headers.Authorization, 'Bearer credential');
    assert.equal(opcoes.headers['Content-Type'], 'application/json');
    assert.equal(
      opcoes.body,
      method === 'GET' || method === 'DELETE'
        ? undefined
        : '{"paradaId":"stop"}'
    );
  }
});

test('resposta JSON valida do backend e devolvida sem diagnostico', async () => {
  const resultado = await interpretarRespostaRadar<{ ok: boolean }>(
    resposta(200, 'application/json; charset=utf-8', '{"ok":true}')
  );
  assert.deepEqual(resultado, { ok: true, status: 200, dados: { ok: true } });
});

test('204 e corpo vazio de sucesso viram null', async () => {
  assert.deepEqual(
    await interpretarRespostaRadar(resposta(204, null, '')),
    { ok: true, status: 204, dados: null }
  );
  assert.deepEqual(
    await interpretarRespostaRadar(resposta(200, 'application/json', '')),
    { ok: true, status: 200, dados: null }
  );
});

test('problem+json preserva o code do backend', async () => {
  const resultado = await interpretarRespostaRadar(
    resposta(401, 'application/problem+json', '{"code":"credencial_revogada"}')
  );
  assert.equal(resultado.ok, false);
  if (resultado.ok) return;
  assert.equal(resultado.status, 401);
  assert.equal(resultado.codigo, 'credencial_revogada');
  assert.equal(resultado.diagnostico.categoria, 'problema');
});

test('pagina do ngrok e detectada antes do parse de JSON', async () => {
  const resultado = await interpretarRespostaRadar(
    resposta(
      200,
      'text/plain',
      'You are about to visit a site hosted by ngrok. secret-token-do-corpo'
    )
  );
  assert.equal(resultado.ok, false);
  if (resultado.ok) return;
  assert.equal(resultado.diagnostico.categoria, 'ngrok');
  assert.match(resultado.diagnostico.mensagem, /ngrok/i);
  assert.match(resultado.diagnostico.mensagem, /ngrok-skip-browser-warning/);
  assert.equal(resultado.diagnostico.mensagem.includes('secret-token-do-corpo'), false);
});

test('HTML inesperado nao e tratado como JSON', async () => {
  const resultado = await interpretarRespostaRadar(
    resposta(200, 'text/html', '<html><body>portal do proxy</body></html>')
  );
  assert.equal(resultado.ok, false);
  if (resultado.ok) return;
  assert.equal(resultado.diagnostico.categoria, 'html');
  assert.match(resultado.diagnostico.mensagem, /HTML inesperado/);
});

test('texto inesperado e JSON invalido recebem diagnosticos distintos', async () => {
  const texto = await interpretarRespostaRadar(
    resposta(200, 'text/plain', 'resposta qualquer')
  );
  assert.equal(texto.ok, false);
  if (!texto.ok) assert.equal(texto.diagnostico.categoria, 'texto');

  const invalido = await interpretarRespostaRadar(
    resposta(200, 'application/json', '{"ok":')
  );
  assert.equal(invalido.ok, false);
  if (!invalido.ok) {
    assert.equal(invalido.diagnostico.categoria, 'json_invalido');
    assert.match(invalido.diagnostico.mensagem, /JSON inválido/);
  }
});

test('JSON rotulado como text/plain ainda e lido quando o corpo tem formato JSON', async () => {
  const resultado = await interpretarRespostaRadar(
    resposta(200, 'text/plain', '{"credencialExpiraEm":"2027-05-01T00:00:00Z"}')
  );
  assert.deepEqual(resultado, {
    ok: true,
    status: 200,
    dados: { credencialExpiraEm: '2027-05-01T00:00:00Z' },
  });
});

test('erro HTTP sem corpo informa resposta vazia', async () => {
  const resultado = await interpretarRespostaRadar(resposta(502, null, ''));
  assert.equal(resultado.ok, false);
  if (resultado.ok) return;
  assert.equal(resultado.diagnostico.categoria, 'vazio');
  assert.match(resultado.diagnostico.mensagem, /HTTP 502/);
});
