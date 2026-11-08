import test from 'node:test';
import assert from 'node:assert/strict';
import { criarRadarRemoto, ErroRadarRemoto, type ConfiguracaoRemota, type PortaRadarRemoto, type SessaoRemota } from './radarRemotoCore';

const config: ConfiguracaoRemota = { paradaId: 'stop', contextos: [{ linhaId: '884', sentidoId: 'ida', padraoOperacionalId: 'op', padraoVersaoId: 'v' }],
  linhasSelecionadas: ['884'], linhasPrioritarias: [], antecedenciaMinutos: 10 };
function fixture() {
  const secure = new Map<string, string>();
  const calls: { method: string; route: string; body?: any }[] = [];
  let now = Date.parse('2026-11-06T12:00:00Z'), current: SessaoRemota | null = null, confirmed = false;
  let error: number | null = null, token = 'ExpoPushToken[synthetic]', removed = 0, registrations = 0, serial = 0;
  let conflictOnActivate = false;
  const port: PortaRadarRemoto = {
    projectId: 'project', id: () => `enrollment-${++serial}`, now: () => now,
    read: async k => secure.get(k) ?? null, write: async (k, v) => { secure.set(k, v); }, remove: async k => { secure.delete(k); },
    token: async () => token, clearNotifications: async () => { removed++; },
    async request<T>(method: string, route: string, credential?: string, body?: unknown): Promise<T> {
      calls.push({ method, route, body });
      if (method === 'POST' && route === '/radar/instalacoes') {
        registrations++;
        return { credencial: 'owner.secret', instalacaoId: 'owner', credencialExpiraEm: new Date(now + 180 * 86400000).toISOString() } as T;
      }
      assert.equal(credential, 'owner.secret');
      assert.equal(secure.has('radar.installation.v1'), true);
      if (error) throw new ErroRadarRemoto(error);
      if (route === '/radar/instalacao') return { credencialExpiraEm: new Date(now + 180 * 86400000).toISOString() } as T;
      if (route === '/radar/instalacao/push') return { registered: confirmed, possessionConfirmed: confirmed } as T;
      if (route.endsWith('/confirmar')) { confirmed = true; return {} as T; }
      if (route.endsWith('/confirmacoes')) { assert.ok(secure.has('radar.enrollment.v1')); return {} as T; }
      if (route === '/radar/sessao' && method === 'GET') return current as T;
      if (route === '/radar/sessao') {
        const data = body as any;
        if (method === 'POST' && conflictOnActivate) {
          conflictOnActivate = false;
          current = { ...data, sessaoId: 'raced-session', instalacaoId: 'owner', revisao: 4,
            estado: 'ativa', expiraEm: new Date(now + 3600000).toISOString() };
          throw new ErroRadarRemoto(409, 'sessao_ja_ativa');
        }
        if (method === 'PUT') assert.equal(data.revisaoEsperada, current?.revisao);
        current = { ...data, sessaoId: current?.estado === 'ativa' ? current.sessaoId : `session-${serial}`,
          instalacaoId: 'owner', revisao: method === 'PUT' ? (current?.revisao ?? 0) + 1 : 1,
          estado: 'ativa', expiraEm: method === 'PUT' ? current!.expiraEm : new Date(now + 3600000).toISOString() };
        return current as T;
      }
      if (method === 'DELETE') { current = null; return null as T; }
      throw new Error('Unexpected route');
    },
  };
  const client = criarRadarRemoto(port);
  const proof = () => ({ mode: 'radar-enrollment', projectId: 'project',
    enrollmentId: JSON.parse(secure.get('radar.enrollment.v1')!).enrollmentId, proof: 'A'.repeat(64) });
  return { port, client, secure, calls, proof, get current() { return current; }, get registrations() { return registrations; },
    get removed() { return removed; }, set error(v: number | null) { error = v; }, set token(v: string) { token = v; },
    set conflictOnActivate(v: boolean) { conflictOnActivate = v; },
    advance(ms: number) { now += ms; }, restarted: () => criarRadarRemoto(port),
  };
}

test('remoto persiste credencial e enrollment antes de enviar e so ativa apos prova do proprio dispositivo', async () => {
  const f = fixture(); await f.client.ativar(config);
  assert.equal(f.client.estado.modo, 'pendente'); assert.equal(f.current, null);
  const p = f.proof();
  await f.client.confirmar({ ...p, enrollmentId: 'unsolicited' });
  await f.client.confirmar({ ...p, projectId: 'other' });
  assert.equal(f.calls.filter(c => c.route.endsWith('/confirmar')).length, 0);
  await f.client.confirmar(p);
  const activated = f.client.estado.sessao;
  assert.ok(activated);
  assert.equal(f.client.estado.modo, 'ativo'); assert.equal(activated.revisao, 1);
  assert.equal(activated.antecedenciaMinutos, 10); assert.ok(f.removed > 0);
  await f.client.confirmar(p);
  assert.equal(f.calls.filter(c => c.route.endsWith('/confirmar')).length, 1);
});

test('remoto recupera sessao no reinicio sem nova ativacao nem polling de eventos', async () => {
  const f = fixture(); await f.client.ativar(config); await f.client.confirmar(f.proof());
  const before = f.calls.filter(c => c.method === 'POST' && c.route === '/radar/sessao').length;
  const recovered = f.restarted(); await recovered.reconciliar();
  assert.equal(recovered.estado.modo, 'ativo'); assert.equal(recovered.estado.sessao?.sessaoId, f.current?.sessaoId);
  assert.equal(f.registrations, 1);
  assert.equal(f.calls.filter(c => c.method === 'POST' && c.route === '/radar/sessao').length, before);
  assert.equal(f.calls.some(c => c.route.includes('eventos')), false);
});

test('remoto reconfigura parada linhas e prioridades com revisao preservando expiracao', async () => {
  const f = fixture(); await f.client.ativar(config); await f.client.confirmar(f.proof());
  const expires = f.current!.expiraEm, id = f.current!.sessaoId;
  await f.client.atualizar({ ...config, paradaId: 'new-stop', linhasSelecionadas: ['838', '855', '884'], linhasPrioritarias: ['838', '855'] });
  assert.equal(f.current!.sessaoId, id); assert.equal(f.current!.revisao, 2); assert.equal(f.current!.expiraEm, expires);
  assert.equal(f.current!.paradaId, 'new-stop'); assert.deepEqual(f.current!.linhasPrioritarias, ['838', '855']);
});

test('remoto expira em uma hora e exige ativacao intencional para renovar', async () => {
  const f = fixture(); await f.client.ativar(config); await f.client.confirmar(f.proof());
  f.advance(3600000); f.client.expirar(); assert.equal(f.client.estado.modo, 'expirado');
  const count = f.calls.length; await f.client.atualizar({ ...config, antecedenciaMinutos: 15 });
  assert.equal(f.calls.length, count);
  await f.client.reconciliar(); assert.equal(f.client.estado.modo, 'expirado');
  assert.equal(f.calls.filter(c => c.method === 'POST' && c.route === '/radar/sessao').length, 1);
  await f.client.ativar(config);
  assert.equal(f.calls.filter(c => c.method === 'POST' && c.route === '/radar/sessao').length, 2);
});

test('remoto token alterado exige nova confirmacao e nao confunde token com posse', async () => {
  const f = fixture(); await f.client.ativar(config); await f.client.confirmar(f.proof());
  f.token = 'ExpoPushToken[replacement]'; await f.client.reconciliar();
  assert.equal(f.client.estado.modo, 'pendente');
  assert.equal(f.calls.filter(c => c.route.endsWith('/confirmar')).length, 1);
  await f.client.confirmar(f.proof()); assert.equal(f.client.estado.modo, 'ativo');
  assert.equal(f.calls.filter(c => c.route.endsWith('/confirmar')).length, 2);
});

test('remoto credencial revogada limpa armazenamento e nao registra novamente em recuperacao', async () => {
  const f = fixture(); await f.client.ativar(config); await f.client.confirmar(f.proof()); f.error = 401;
  await f.client.reconciliar(); assert.equal(f.client.estado.modo, 'indisponivel');
  assert.equal(f.secure.has('radar.installation.v1'), false); assert.equal(f.secure.has('radar.token.v1'), false);
  assert.equal(f.client.estado.sessao, null); assert.match(f.client.estado.mensagem!, /revogada/);
  f.error = null; await f.client.reconciliar(); assert.equal(f.registrations, 1);
});

test('remoto conexao perdida preserva sessao ativa e recupera sem reativar nem duplicar local', async () => {
  const f = fixture(); await f.client.ativar(config); await f.client.confirmar(f.proof()); f.error = 503;
  await f.client.reconciliar();
  assert.equal(f.client.estado.modo, 'ativo'); assert.ok(f.client.estado.sessao);
  assert.equal(f.client.estado.solicitando, false); assert.equal(f.client.estado.operacao, null);
  assert.equal(f.secure.has('radar.installation.v1'), true); assert.match(f.client.estado.mensagem!, /local permanece suspenso/);
  f.error = null; await f.client.reconciliar(); assert.equal(f.client.estado.modo, 'ativo');
  assert.equal(f.client.estado.mensagem, null); assert.equal(f.registrations, 1);
});

test('remoto reconfiguracao ativa nao oscila para pendente e informa a operacao', async () => {
  const f = fixture(); await f.client.ativar(config); await f.client.confirmar(f.proof());
  const vistos: { modo: string; solicitando: boolean; operacao: string | null }[] = [];
  f.client.assinar(s => vistos.push({ modo: s.modo, solicitando: s.solicitando, operacao: s.operacao }));
  await f.client.atualizar({ ...config, antecedenciaMinutos: 15 });
  assert.equal(vistos.some(v => v.modo === 'pendente'), false);
  assert.ok(vistos.some(v => v.solicitando && v.operacao === 'atualizar'));
  assert.deepEqual(vistos.at(-1), { modo: 'ativo', solicitando: false, operacao: null });
  assert.equal(f.current!.antecedenciaMinutos, 15);
});

test('remoto falha ao salvar preserva sessao ativa e permite tentar novamente', async () => {
  const f = fixture(); await f.client.ativar(config); await f.client.confirmar(f.proof());
  const sessao = f.current!.sessaoId, revisao = f.current!.revisao;
  f.error = 503; await f.client.atualizar({ ...config, antecedenciaMinutos: 15 });
  assert.equal(f.client.estado.modo, 'ativo'); assert.equal(f.client.estado.sessao?.sessaoId, sessao);
  assert.equal(f.client.estado.sessao?.revisao, revisao); assert.match(f.client.estado.mensagem!, /local permanece suspenso/);
  assert.equal(f.client.estado.solicitando, false); assert.equal(f.client.estado.operacao, null);
  f.error = null; await f.client.atualizar({ ...config, antecedenciaMinutos: 15 });
  assert.equal(f.client.estado.modo, 'ativo'); assert.equal(f.client.estado.mensagem, null);
  assert.equal(f.current!.antecedenciaMinutos, 15); assert.equal(f.current!.revisao, revisao + 1);
});

test('remoto falha ao reativar mantem expiracao visivel e a tentativa seguinte renova', async () => {
  const f = fixture(); await f.client.ativar(config); await f.client.confirmar(f.proof());
  f.advance(3600000); f.client.expirar();
  f.error = 503; await f.client.ativar(config);
  assert.equal(f.client.estado.modo, 'expirado'); assert.ok(f.client.estado.sessao);
  assert.match(f.client.estado.mensagem!, /local permanece suspenso/);
  assert.equal(f.client.estado.solicitando, false); assert.equal(f.client.estado.operacao, null);
  f.error = null; await f.client.ativar(config);
  assert.equal(f.client.estado.modo, 'ativo');
  assert.equal(f.calls.filter(c => c.method === 'POST' && c.route === '/radar/sessao').length, 2);
});

test('remoto ativacao concorrente aplica configuracao na sessao que ficou ativa', async () => {
  const f = fixture(); await f.client.ativar(config); await f.client.confirmar(f.proof());
  f.advance(3600000); f.client.expirar(); f.conflictOnActivate = true;
  await f.client.ativar({ ...config, paradaId: 'raced-stop', antecedenciaMinutos: 15 });
  assert.equal(f.client.estado.modo, 'ativo'); assert.equal(f.client.estado.mensagem, null);
  assert.equal(f.client.estado.sessao?.sessaoId, 'raced-session');
  assert.equal(f.current!.paradaId, 'raced-stop'); assert.equal(f.current!.antecedenciaMinutos, 15);
  assert.equal(f.calls.filter(c => c.method === 'PUT' && c.route === '/radar/sessao').length, 1);
});

test('remoto encerramento impede prova tardia e filtra notificacoes vencidas ou de outra revisao', async () => {
  const f = fixture(); await f.client.ativar(config); const pending = f.proof(); await f.client.encerrar();
  await f.client.confirmar(pending); assert.equal(f.current, null); assert.equal(f.client.estado.modo, 'inativo');
  await f.client.ativar(config); await f.client.confirmar(f.proof());
  const data = { mode: 'remote-radar', sessionId: f.current!.sessaoId, revision: 1, validUntil: '2026-11-06T12:00:30Z' };
  assert.equal(f.client.permite(data), true); assert.equal(f.client.permite({ ...data, revision: 2 }), false);
  assert.equal(f.client.permite({ ...data, sessionId: 'other' }), false);
  f.advance(30000); assert.equal(f.client.permite(data), false);
  await f.client.encerrar(); assert.equal(f.client.permite(data), false);
});

test('remoto nao confirma challenge vencido ou malformado e informa allowlist', async () => {
  const f = fixture(); await f.client.ativar(config); const proof = f.proof();
  await f.client.confirmar({ ...proof, proof: 'short' }); assert.equal(f.current, null);
  f.advance(120000); await f.client.confirmar(proof); assert.equal(f.current, null);
  assert.equal(f.calls.filter(c => c.route.endsWith('/confirmar')).length, 0);
  f.error = 403; await f.client.ativar(config); assert.match(f.client.estado.mensagem!, /owner/);
});
